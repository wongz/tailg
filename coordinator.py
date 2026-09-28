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
from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)


class TailgddHttpCoordinator(DataUpdateCoordinator):
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
        self._creds = creds          # ← 自己持有凭据

    async def _async_update_data(self):
        data = await async_fetch_car_status(
            token=self._creds["token"],
            cookie=self._creds["cookie"],
            uid=self._creds["uid"],
            frame=self._creds["frame"],
        )
        if data is None:
            raise UpdateFailed("carStatus 接口返回失败")
        return data