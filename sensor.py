"""车辆状态传感器 —— 支持 MQTT 实时 + HTTP 轮询双通道。"""
from __future__ import annotations

import logging

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import (
    DOMAIN, SENSOR_TYPES, SOURCE_MQTT, SOURCE_HTTP,
    ENTITY_ID_TPL, build_device_info,
)

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry,
                            async_add_entities):
    data = hass.data[DOMAIN][entry.entry_id]
    client = data["client"]
    coordinator = data["coordinator"]
    info = data["info"]

    entities = []
    for cfg in SENSOR_TYPES:
        if cfg.get("source") == SOURCE_HTTP:
            entities.append(HttpSensor(coordinator, client, cfg, info))
        else:
            entities.append(MqttSensor(client, cfg, info))

    async_add_entities(entities)


# ============ MQTT 实时传感器 ============
class MqttSensor(SensorEntity):
    _attr_should_poll = False

    def __init__(self, client, cfg: dict, info: dict):
        self._client = client
        self._key = cfg["key"]
        self._value_map = cfg.get("value_map") or {}
        suffix = info.get("suffix", "0000")
        ekey = cfg.get("entity_key", self._key.lower())

        self.entity_id = ENTITY_ID_TPL.format(domain="sensor", suffix=suffix, key=ekey)

        self._attr_name = cfg["name"]
        self._attr_native_unit_of_measurement = cfg.get("unit")
        self._attr_icon = cfg.get("icon")
        self._attr_device_class = cfg.get("device_class")
        self._attr_unique_id = f"tailgdd_{suffix}_mqtt_{self._key}"
        self._attr_device_info = build_device_info(info)

    async def async_added_to_hass(self):
        self._on_event = self._handle_event
        self._client.add_listener(self._on_event)
        if self._client.last_status:
            self._update_value(self._client.last_status)

    async def async_will_remove_from_hass(self):
        self._client.remove_listener(self._on_event)

    @callback
    def _handle_event(self, event: dict):
        if event.get("type") != "status":
            return
        self._update_value(event["data"])

    def _update_value(self, payload: dict):
        raw = payload.get(self._key)
        if raw is None:
            return
        self._attr_native_value = self._value_map.get(raw, raw)
        self.async_write_ha_state()


# ============ HTTP 轮询传感器 ============
class HttpSensor(CoordinatorEntity, SensorEntity):
    _attr_should_poll = False

    def __init__(self, coordinator, client, cfg: dict, info: dict):
        super().__init__(coordinator)
        self._key = cfg["key"]
        self._value_map = cfg.get("value_map") or {}
        suffix = info.get("suffix", "0000")
        ekey = cfg.get("entity_key", self._key.lower())

        self.entity_id = ENTITY_ID_TPL.format(domain="sensor", suffix=suffix, key=ekey)

        self._attr_name = cfg["name"]
        self._attr_native_unit_of_measurement = cfg.get("unit")
        self._attr_icon = cfg.get("icon")
        self._attr_device_class = cfg.get("device_class")
        self._attr_unique_id = f"tailgdd_{suffix}_http_{self._key}"
        self._attr_device_info = build_device_info(info)

    @property
    def native_value(self):
        data = self.coordinator.data or {}
        raw = data.get(self._key)
        if raw is None:
            return None
        if self._key == "gpsReportTime":
            return str(raw)[:19].replace("T", " ")
        if self._key == "online":
            return "在线" if raw else "离线"
        return self._value_map.get(raw, raw)

    @property
    def available(self) -> bool:
        return self.coordinator.last_update_success