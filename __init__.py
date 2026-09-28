"""Tailgdd 车辆集成入口 —— 自建 MQTT 客户端连接车厂 broker。"""
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

from .api import async_fetch_car_status
from .const import (
    DOMAIN, CONF_FRAME, CONF_UID, CONF_TOKEN, CONF_COOKIE,
    TOPIC_STATUS_TPL, TOPIC_CMD_TPL, CLIENT_ID_TPL,
    device_suffix,
)

_LOGGER = logging.getLogger(__name__)

PLATFORMS = [Platform.SENSOR, Platform.BUTTON, Platform.SWITCH]


async def async_setup(hass: HomeAssistant, config) -> bool:
    """初始化时把卡片 JS 复制到 /config/www 供前端加载。"""
    try:
        src = Path(__file__).parent / "www" / "tailgdd-card.js"
        dst_dir = Path(hass.config.path("www"))
        dst_dir.mkdir(parents=True, exist_ok=True)
        dst = dst_dir / "tailgdd-card.js"

        if src.exists():
            shutil.copy2(src, dst)
            _LOGGER.info("Tailgdd 卡片已部署: %s", dst)
        else:
            _LOGGER.warning("未找到卡片 JS: %s", src)
    except Exception as err:
        _LOGGER.warning("复制卡片 JS 失败: %s", err)
    return True


class TailgddMqttClient:
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
            _LOGGER.info("已发送 searchDeviceInfo（仅一次）")

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
        _LOGGER.info("指令已发布: %s -> %s", self.cmd_topic, payload)

    def disconnect(self):
        try:
            self.client.loop_stop()
            self.client.disconnect()
        except Exception:
            pass


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """设置 Tailgdd 集成。"""
    frame  = entry.data.get(CONF_FRAME, "")
    uid    = entry.data.get(CONF_UID, "")
    token  = entry.data.get(CONF_TOKEN, "")
    cookie = entry.data.get(CONF_COOKIE, "")

    if not token:
        _LOGGER.error("缺少 authorization token")
        return False

    # ---------- 1. 获取 MQTT 凭证 + 车辆名称 ----------
    car_info = await async_fetch_car_status(token, cookie, uid, frame)
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

    # ★ 从接口取车名（优先 carNickName，其次 carName）
    car_name = (
        car_info.get("carNickName")
        or car_info.get("carName")
        or f"Tailgdd 车辆 {device_suffix(frame)}"
    )

    info = {
        "imei":        imei,
        "mq_host":     mq_host,
        "mq_port":     int(mq_port),
        "mq_username": mq_user,
        "mq_password": mq_pass,
        "user_id":     str(car_info.get("userId", "0")),
        "frame":       frame,
        "suffix":      device_suffix(frame),
        "car_name":    car_name,                      # ★ HA 设备名
        "model":       car_info.get("carType") or "",  # 车型号（选填）
    }
    creds = {
        "token":  token,
        "cookie": cookie,
        "uid":    uid,
        "frame":  frame,
    }

    _LOGGER.info("车辆信息: imei=%s name=%s", imei, car_name)

    # ---------- 2. 建 MQTT 客户端 ----------
    client = TailgddMqttClient(hass, info)
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
    from .coordinator import TailgddHttpCoordinator
    coordinator = TailgddHttpCoordinator(hass, entry, interval=60, creds=creds)
    await coordinator.async_config_entry_first_refresh()

    hass.data[DOMAIN][entry.entry_id]["coordinator"] = coordinator

    _LOGGER.info("Tailgdd 集成已启动: imei=%s", imei)

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        data = hass.data[DOMAIN].pop(entry.entry_id, None)
        if data and data.get("client"):
            data["client"].disconnect()
    return unload_ok