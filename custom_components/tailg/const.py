"""台铃集成常量定义"""

# ==================== 集成标识 ====================
DOMAIN  = "tailg"
NAME    = "TAILG"

# ==================== 接口配置 ====================
API_URL = "https://www.tailgdd.com/v1/api/app/centralControl/carStatus"

API_HEADERS = {
    "User-Agent":      "okhttp/4.2.2",
    "Accept-Encoding": "gzip",
    "language":        "zh_CN",
    "content-type":    "application/json; charset=UTF-8",
}

API_PAYLOAD = {
    "phoneMode": "M2012K11AC",
}

# ==================== 配置项 ====================
CONF_TOKEN  = "token"
CONF_COOKIE = "cookie"
CONF_AMAP_KEY = "amap_key"

DEFAULT_SCAN_INTERVAL = 180

# ==================== MQTT 主题模板 ====================
TOPIC_STATUS_TPL = "S_APP/STATUS/{imei}"
TOPIC_OTA_TPL    = "S_APP/OTA/{imei}"
TOPIC_CMD_TPL    = "APP_S/CMD/{imei}"
CLIENT_ID_TPL    = "app_{imei}_{user_id}_android_733"

# ==================== 控制指令映射 ====================
CMD_MAP = {
    "unlock": "unlock",
    "lock":   "lock",
    "search": "search",
    "probe":  "searchDeviceInfo",
    "start":  "start",
    "stop":   "stop",
    "mute": "mute",
    "unmute": "unmute",
}

# ==================== 数据源 ====================
SOURCE_MQTT = "mqtt"
SOURCE_HTTP = "http"

# ==================== 传感器（仅保留慢变化项，电源/防盗在 switch 里） ====================
SENSOR_TYPES = [
    {
        "key":        "batteryChargeStatus",
        "name":       "充电状态",
        "entity_key": "charging",
        "unit":       None,
        "icon":       "mdi:battery-charging",
        "value_map":  {0: "未充电", 4: "充电中"},
        "source":     SOURCE_HTTP,
    },
    {
        "key":          "electricQuantity",
        "name":         "电量",
        "entity_key":   "battery",
        "unit":         "%",
        "icon":         "mdi:battery",
        "source":       SOURCE_HTTP,
    },
    {
        "key":          "voltage",
        "name":         "电压",
        "entity_key":   "voltage",
        "unit":         "V",
        "device_class": "voltage",
        "icon":         "mdi:flash",
        "source":       SOURCE_HTTP,
    },
    {
        "key":          "mileage",
        "name":         "续航",
        "entity_key":   "range",
        "unit":         "km",
        "device_class": "distance",
        "icon":         "mdi:map-marker-distance",
        "source":       SOURCE_HTTP,
    },
    {
        "key":        "gpsReportTime",
        "name":       "定位时间",
        "entity_key": "gps_time",
        "unit":       None,
        "icon":       "mdi:clock-outline",
        "source":     SOURCE_HTTP,
    },
    {
        "key":        "online",
        "name":       "在线",
        "entity_key": "online",
        "unit":       None,
        "icon":       "mdi:access-point",
        "value_map":  {True: "在线", False: "离线"},
        "source":     SOURCE_HTTP,
    },
    {
        "key":        "carStatus",
        "name":       "车辆状态",
        "entity_key": "status",
        "unit":       None,
        "icon":       "mdi:car",
        "value_map":  {
            0: "0",
            1: "脚撑收起",
            2: "更新状态",
            3: "3",
            4: "通电",
            5: "断电",
            6: "手动设防",
            7: "手动撤防",
            8: "防盗静音",
            9: "防盗声音",
            32: "32",
            33: "33",
            255: "255"
        },
        "source":     SOURCE_MQTT,
    },
    {
        "key":        "regeo",
        "name":       "位置",
        "entity_key": "location",
        "unit":       None,
        "icon":       "mdi:map-marker",
        "source":     SOURCE_HTTP,
    },
    {
        "key":        "longitude",
        "name":       "经度",
        "entity_key": "longitude",
        "unit":       "°",
        "icon":       "mdi:longitude",
        "source":     SOURCE_HTTP,
    },
    {
        "key":        "latitude",
        "name":       "纬度",
        "entity_key": "latitude",
        "unit":       "°",
        "icon":       "mdi:latitude",
        "source":     SOURCE_HTTP,
    },
]

# ==================== 按钮 ====================
BUTTON_TYPES = [
    {
        "key": "search",
        "name": "寻车",
        "entity_key": "search",
        "icon": "mdi:bullhorn",
        "command": "search"
    },
]

# ==================== 开关（电源、防盗、防盗报警音） ====================
SWITCH_TYPES = [
    {
        "key":        "ACC",
        "name":       "电源",
        "entity_key": "power",
        "icon_on":    "mdi:power-plug",
        "icon_off":   "mdi:power-plug-off",
        "cmd_on":     "start",
        "cmd_off":    "stop",
    },
    {
        "key":        "defenceStatus",
        "name":       "防盗",
        "entity_key": "defence",
        "icon_on":    "mdi:shield-lock",
        "icon_off":   "mdi:shield-off",
        "cmd_on":     "lock",
        "cmd_off":    "unlock",
    },
    {
        "key":        "muteStatus",
        "name":       "防盗声",
        "entity_key": "alarm",
        "icon_on":    "mdi:volume-high",
        "icon_off":   "mdi:volume-off",
        "cmd_on":     "unmute",
        "cmd_off":    "mute",
    },
]

# ==================== 命名模板 ====================
def device_suffix(frame: str) -> str:
    """提取车架号后 4 位，小写。"""
    if not frame:
        return "0000"
    s = str(frame).strip()
    return s[-4:].lower() if len(s) >= 4 else s.zfill(4).lower()

# 带 domain 的完整 entity_id 模板
ENTITY_ID_TPL = "{domain}.tailg_{suffix}_{key}"

# ==================== 设备追踪器（经纬度） ====================
# device_tracker 的 entity_id: tailg_{suffix}_location
TRACKER_ENTITY_ID_TPL = "device_tracker.tailg_{suffix}_location"

# ==================== 设备信息构造 ====================
def build_device_info(info: dict):
    """根据 info 字典构造 HA 的 DeviceInfo。"""
    from homeassistant.helpers.entity import DeviceInfo

    suffix = info.get("suffix", "0000")
    name = info.get("car_name") or f"台铃{suffix}"

    return DeviceInfo(
        identifiers={(DOMAIN, f"tailg_{suffix}")},
        name=name,
        manufacturer="TAILG",
        model=info.get("car_type") or "电动车",
        #sw_version=info.get("coding"),
    )
