"""定时轮询 carStatus 接口的协调器。"""
from __future__ import annotations

import logging
from datetime import timedelta

from homeassistant.core import HomeAssistant
from homeassistant.config_entries import ConfigEntry
from homeassistant.helpers.update_coordinator import (
    DataUpdateCoordinator,
    UpdateFailed,
)

from .api import async_fetch_car_status
from .amap import async_reverse_geocode
from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


class TailgHttpCoordinator(DataUpdateCoordinator):
    """HTTP 轮询协调器。"""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry,
                 interval: int, creds: dict):
        super().__init__(
            hass,
            _LOGGER,
            name=f"{DOMAIN}_http",
            update_interval=timedelta(seconds=interval),
        )
        self.entry = entry
        self._creds = creds
        # 缓存上次坐标与地址，避免重复逆地理
        self._last_lng = None
        self._last_lat = None
        self._last_regeo = None

    async def _async_update_data(self):
        data = await async_fetch_car_status(
            token=self._creds["token"],
        )
        if data is None:
            raise UpdateFailed("carStatus 接口返回失败")

        # ★ 尝试逆地理（坐标移动超过 ~50 米才重新查询）
        lng = data.get("longitude")
        lat = data.get("latitude")
        if lng is not None and lat is not None:
            try:
                lng_f = float(lng)
                lat_f = float(lat)

                moved = True
                if self._last_lng is not None:
                    d = abs(self._last_lng - lng_f) + abs(self._last_lat - lat_f)
                    moved = d > 0.0005

                if moved or self._last_regeo is None:
                    regeo = await async_reverse_geocode(
                        lng_f, lat_f,
                        self._creds.get("amap_key", ""),
                    )
                    if regeo:
                        self._last_lng = lng_f
                        self._last_lat = lat_f
                        self._last_regeo = regeo
                        data["regeo"] = self._last_regeo
                    else:
                        self._last_regeo = None
                if not moved and self._last_regeo is not None:
                    data["regeo"] = self._last_regeo
            except (TypeError, ValueError) as err:
                _LOGGER.warning("逆地理失败: %s", err)
                self._last_regeo = None

        return data
