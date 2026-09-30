"""台铃车辆集成入口 —— 自建 MQTT 客户端连接车厂 broker。"""
from __future__ import annotations

import asyncio
import json
import logging
import shutil
import ssl
from pathlib import Path

import paho.mqtt.client as mqtt
from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
import json
# Lovelace 相关导入做容错，兼容不同 HA 版本
try:
    from homeassistant.components.lovelace import DOMAIN as LOVELACE_DOMAIN
except ImportError:
    LOVELACE_DOMAIN = "lovelace"

try:
    from homeassistant.components.lovelace.resources import ResourceStorageCollection
except ImportError:
    ResourceStorageCollection = None

from .api import async_fetch_car_status
from .const import (
    DOMAIN, CONF_TOKEN, CONF_AMAP_KEY,
    TOPIC_STATUS_TPL, TOPIC_CMD_TPL, CLIENT_ID_TPL, DEFAULT_SCAN_INTERVAL,
    device_suffix,
)

_LOGGER = logging.getLogger(__name__)

PLATFORMS = [
    Platform.SENSOR,
    Platform.BUTTON,
    Platform.SWITCH,
    Platform.DEVICE_TRACKER,
]

def _cfg(entry: ConfigEntry, key: str, default=""):
    """优先从 options 读，回退到 data（HA 标准做法）。"""
    if key in entry.options:
        return entry.options[key]
    return entry.data.get(key, default)

async def _async_update_listener(hass: HomeAssistant, entry: ConfigEntry):
    """选项变更时重新加载集成。"""
    await hass.config_entries.async_reload(entry.entry_id)

async def async_setup(hass: HomeAssistant, config) -> bool:
    """初始化：部署卡片 JS + 注册 Lovelace 资源 + 注册 HTTP API。"""
    try:
        # ---------- 1. 复制卡片 JS ----------
        src_dir = Path(__file__).parent / "www"
        dst_dir = Path(hass.config.path("www"))
        dst_dir.mkdir(parents=True, exist_ok=True)

        card_files = [
            "tailg-card.js",
            "tailg-map-card.js",
        ]

        for fname in card_files:
            src = src_dir / fname
            dst = dst_dir / fname
            if src.exists():
                shutil.copy2(src, dst)
                _LOGGER.info("台铃卡片已部署: %s", dst)
            else:
                _LOGGER.warning("未找到卡片 JS: %s", src)

        # ---------- 2. 注册 Lovelace 资源（延迟执行，等 Lovelace 初始化） ----------
        async def _delayed_register():
            await asyncio.sleep(5)
            for fname in card_files:
                await _register_lovelace_resource(
                    hass, f"/local/{fname}"
                )

        hass.async_create_task(_delayed_register())

        # ---------- 3. 注册 HTTP API ----------
        from .http_api import async_register_views
        await async_register_views(hass)

    except Exception as err:
        _LOGGER.warning("初始化失败: %s", err)

    return True


async def _register_lovelace_resource(hass: HomeAssistant, url: str) -> None:
    """把卡片 JS 注册到 Lovelace 资源列表（幂等，兼容 HA 2022.x）。"""
    try:
        lovelace = hass.data.get("lovelace")
        if not lovelace:
            _LOGGER.warning(
                "无法注册 Lovelace 资源（YAML 模式或未初始化）。"
                "请手动添加：%s", url
            )
            return

        resources = lovelace.get("resources") if isinstance(lovelace, dict) else None
        if not resources:
            _LOGGER.warning("未找到 Lovelace 资源集合，请手动添加：%s", url)
            return

        # 确保已加载
        if hasattr(resources, "async_load") and not getattr(resources, "loaded", True):
            try:
                await resources.async_load()
            except Exception:
                pass

        # 幂等检查
        try:
            items = resources.async_items()
        except Exception:
            items = []

        for item in items:
            if isinstance(item, dict) and item.get("url") == url:
                _LOGGER.debug("Lovelace 资源已存在: %s", url)
                return

        # 创建
        if hasattr(resources, "async_create_item"):
            try:
                await resources.async_create_item({
                    "res_type": "module",
                    "url": url,
                })
                _LOGGER.info("Lovelace 资源已注册: %s", url)
            except Exception as err:
                _LOGGER.warning("注册资源失败 %s: %s", url, err)
        else:
            _LOGGER.warning("Lovelace 资源不支持自动注册，请手动添加：%s", url)

    except Exception as err:
        _LOGGER.warning("注册 Lovelace 资源失败: %s", err)


class TailgMqttClient:
    """独立 MQTT 客户端，直连车厂 broker。"""

    def __init__(self, hass: HomeAssistant, info: dict):
        self.hass = hass
        self.info = info
        self.imei = info["imei"]
        self.status_topic = TOPIC_STATUS_TPL.format(imei=self.imei)
        self.cmd_topic = TOPIC_CMD_TPL.format(imei=self.imei)

        self.last_status: dict | None = None
        self._listeners: list = []
        self._connected = False

        client_id = CLIENT_ID_TPL.format(
            imei=self.imei,
            user_id=info.get("user_id", "0"),
        )

        try:
            self.client = mqtt.Client(client_id=client_id, clean_session=True)
        except TypeError:
            self.client = mqtt.Client(
                mqtt.CallbackAPIVersion.VERSION1,
                client_id=client_id,
                clean_session=True,
            )

        self.client.username_pw_set(info["mq_username"], info["mq_password"])

        ssl_ctx = ssl.create_default_context()
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_NONE
        self.client.tls_set_context(ssl_ctx)

        self.client.on_connect    = self._on_connect
        self.client.on_message    = self._on_message
        self.client.on_disconnect = self._on_disconnect

        self._host = info["mq_host"]
        self._port = info["mq_port"]

    async def async_connect(self):
        await self.hass.async_add_executor_job(self._connect_blocking)

    def _connect_blocking(self):
        try:
            self.client.connect(self._host, self._port, keepalive=60)
            self.client.loop_start()
            _LOGGER.info("MQTT 连接启动: %s:%s", self._host, self._port)
        except Exception as err:
            _LOGGER.error("MQTT 连接失败: %s", err)

    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            self._connected = True
            _LOGGER.info("MQTT 已连接，订阅 %s", self.status_topic)
            client.subscribe(self.status_topic, qos=0)

            # 仅在连接后请求一次当前状态
            probe = json.dumps(
                {"command": "searchDeviceInfo", "imei": self.imei},
                ensure_ascii=False,
            )
            client.publish(self.cmd_topic, probe, qos=0)
            _LOGGER.info("已发送 searchDeviceInfo")

            self.hass.loop.call_soon_threadsafe(
                self.hass.async_create_task,
                self._async_fire_listeners({"type": "connect"})
            )
        else:
            _LOGGER.error("MQTT 连接被拒，rc=%s", rc)

    def _on_disconnect(self, client, userdata, rc):
        self._connected = False
        _LOGGER.warning("MQTT 断开，rc=%s", rc)

    def _on_message(self, client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
        except Exception:
            return
        self.last_status = payload
        _LOGGER.debug("MQTT 收到状态: %s", payload)
        self.hass.loop.call_soon_threadsafe(
            self.hass.async_create_task,
            self._async_fire_listeners({"type": "status", "data": payload})
        )

    def add_listener(self, cb):
        self._listeners.append(cb)

    def remove_listener(self, cb):
        if cb in self._listeners:
            self._listeners.remove(cb)

    async def _async_fire_listeners(self, event):
        for cb in list(self._listeners):
            try:
                cb(event)
            except Exception as err:
                _LOGGER.exception("监听器异常: %s", err)

    async def async_send_command(self, command: str):
        payload = json.dumps(
            {"command": command, "imei": self.imei},
            ensure_ascii=False,
        )
        await self.hass.async_add_executor_job(
            self.client.publish, self.cmd_topic, payload, 1
        )
        _LOGGER.debug("指令已发布: %s -> %s", self.cmd_topic, payload)

    def disconnect(self):
        try:
            self.client.loop_stop()
            self.client.disconnect()
        except Exception:
            pass


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """设置TAILG集成。"""
    token    = _cfg(entry, CONF_TOKEN, "")
    #cookie   = _cfg(entry, CONF_COOKIE, "")
    amap_key = _cfg(entry, CONF_AMAP_KEY, "")

    if not token:
        _LOGGER.error("缺少 authorization token")
        return False

    # ---------- 1. 获取 MQTT 凭证 + 车辆名称 ----------
    car_info = await async_fetch_car_status(token)
    if not car_info:
        _LOGGER.error("carStatus 接口返回失败")
        return False

    imei    = car_info.get("imei")
    mq_host = car_info.get("mqHost")
    mq_port = car_info.get("mqPort")
    mq_user = car_info.get("mqUsername")
    mq_pass = car_info.get("mqPassword")

    if not all([imei, mq_host, mq_port, mq_user, mq_pass]):
        _LOGGER.error("MQTT 信息不完整: imei=%s host=%s port=%s",
                      imei, mq_host, mq_port)
        return False

    car_name = (
        car_info.get("carNickName")
        or car_info.get("carName")
        or f"台铃 {device_suffix(frame)}"
    )
    
    frame = car_info.get("frame")
    uid = str(car_info.get("userId", "0"))
    
    info = {
        "imei":                imei,
        "mq_host":          mq_host,
        "mq_port":          int(mq_port),
        "mq_username": mq_user,
        "mq_password":  mq_pass,
        "user_id":         uid,
        "frame":           frame,
        "suffix":            device_suffix(frame),
        "car_id":           car_info.get("carId"),
        "car_name":     car_name,
        "car_type":       car_info.get("carType"),
        "coding":          car_info.get("coding"),
    }
    creds = {
        "token":    token,
       # "cookie":   cookie,
        "uid":      uid,
        "frame":    frame,
        "amap_key": amap_key,
    }

    _LOGGER.info("车辆信息: imei=%s name=%s", imei, car_name)

    # ---------- 2. 建 MQTT 客户端 ----------
    client = TailgMqttClient(hass, info)
    await client.async_connect()

    # 等待首条状态（最多 8 秒）
    for _ in range(80):
        if client.last_status is not None:
            break
        await asyncio.sleep(0.1)

    if client.last_status is None:
        _LOGGER.warning("8 秒内未收到 MQTT 状态回传（车辆可能离线）")

    # ---------- 3. 先建 hass.data ----------
    hass.data.setdefault(DOMAIN, {})
    hass.data[DOMAIN][entry.entry_id] = {
        "client":      client,
        "info":        info,
        "coordinator": None,
        "creds":       creds,
    }

    # ---------- 4. HTTP 协调器 ----------
    from .coordinator import TailgHttpCoordinator
    coordinator = TailgHttpCoordinator(hass, entry, interval=DEFAULT_SCAN_INTERVAL, creds=creds)
    await coordinator.async_config_entry_first_refresh()

    hass.data[DOMAIN][entry.entry_id]["coordinator"] = coordinator

    _LOGGER.info("TAILG 集成已启动: imei=%s", imei)

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    # ★ 监听 options 变更，自动重载集成
    entry.async_on_unload(entry.add_update_listener(_async_update_listener))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        data = hass.data[DOMAIN].pop(entry.entry_id, None)
        if data and data.get("client"):
            data["client"].disconnect()
    return unload_ok
