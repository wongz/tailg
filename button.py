"""车辆控制按钮。"""
from __future__ import annotations

import logging

from homeassistant.components.button import ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import (
    DOMAIN, BUTTON_TYPES,
    ENTITY_ID_TPL, build_device_info,
)

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry,
                            async_add_entities):
    data = hass.data[DOMAIN][entry.entry_id]
    client = data["client"]
    info = data["info"]

    entities = [VehicleButton(client, cfg, info) for cfg in BUTTON_TYPES]
    async_add_entities(entities)


class VehicleButton(ButtonEntity):
    _attr_should_poll = False

    def __init__(self, client, cfg: dict, info: dict):
        self._client = client
        self._command = cfg["command"]
        suffix = info.get("suffix", "0000")
        ekey = cfg.get("entity_key", cfg["key"])

        self.entity_id = ENTITY_ID_TPL.format(domain="button", suffix=suffix, key=ekey)

        self._attr_name = cfg["name"]
        self._attr_icon = cfg.get("icon")
        self._attr_unique_id = f"tailgdd_{suffix}_btn_{cfg['key']}"
        self._attr_device_info = build_device_info(info)

    async def async_press(self):
        try:
            await self._client.async_send_command(self._command)
        except Exception as err:
            _LOGGER.error("发送指令失败: %s", err)