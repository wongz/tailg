"""车辆位置追踪器 —— 从 carStatus 接口获取经纬度。"""
from __future__ import annotations

import logging

from homeassistant.components.device_tracker.config_entry import TrackerEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import (
    DOMAIN,
    TRACKER_ENTITY_ID_TPL,
    build_device_info,
)

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry,
                            async_add_entities):
    data = hass.data[DOMAIN][entry.entry_id]
    coordinator = data["coordinator"]
    info = data["info"]

    async_add_entities([VehicleTracker(coordinator, info)])


class VehicleTracker(CoordinatorEntity, TrackerEntity):
    """车辆位置追踪器。"""

    _attr_should_poll = False

    def __init__(self, coordinator, info: dict):
        super().__init__(coordinator)
        suffix = info.get("suffix", "0000")

        # 固定 entity_id
        self.entity_id = TRACKER_ENTITY_ID_TPL.format(suffix=suffix)

        self._attr_name = "位置"
        self._attr_unique_id = f"tailgdd_{suffix}_tracker"
        self._attr_device_info = build_device_info(info)
        self._attr_icon = "mdi:map-marker"

    # ---------- TrackerEntity 需要的方法 ----------
    @property
    def latitude(self):
        data = self.coordinator.data or {}
        v = data.get("latitude")
        try:
            return float(v) if v is not None else None
        except (TypeError, ValueError):
            return None

    @property
    def longitude(self):
        data = self.coordinator.data or {}
        v = data.get("longitude")
        try:
            return float(v) if v is not None else None
        except (TypeError, ValueError):
            return None

    @property
    def source_type(self) -> str:
        return "gps"

    @property
    def available(self) -> bool:
        return (
            self.coordinator.last_update_success
            and self.latitude is not None
            and self.longitude is not None
        )

    @property
    def extra_state_attributes(self):
        data = self.coordinator.data or {}
        attrs = {}

        # 逆地理地址（如果 coordinator 里有）
        if data.get("regeo"):
            attrs["address"] = data["regeo"]

        # 定位时间
        if data.get("gpsReportTime"):
            attrs["gps_report_time"] = str(data["gpsReportTime"])[:19].replace("T", " ")

        # 在线状态
        if "online" in data:
            attrs["online"] = bool(data["online"])

        # 电量、续航（顺手带上）
        for k_src, k_dst in [
            ("electricQuantity", "battery"),
            ("mileage",          "range"),
            ("voltage",          "voltage"),
        ]:
            if k_src in data and data[k_src] is not None:
                attrs[k_dst] = data[k_src]

        return attrs
