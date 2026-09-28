"""车辆状态开关 —— 电源、防盗。"""
from __future__ import annotations

import logging

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback

from .const import (
    DOMAIN, SWITCH_TYPES,
    ENTITY_ID_TPL, build_device_info,
)

_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry,
                            async_add_entities):
    data = hass.data[DOMAIN][entry.entry_id]
    client = data["client"]
    info = data["info"]

    entities = [VehicleSwitch(client, cfg, info) for cfg in SWITCH_TYPES]
    async_add_entities(entities)


class VehicleSwitch(SwitchEntity):
    _attr_should_poll = False

    def __init__(self, client, cfg: dict, info: dict):
        self._client = client
        self._key = cfg["key"]
        self._cmd_on = cfg["cmd_on"]
        self._cmd_off = cfg["cmd_off"]
        self._icon_on = cfg.get("icon_on") or "mdi:toggle-switch"
        self._icon_off = cfg.get("icon_off") or "mdi:toggle-switch-off"

        suffix = info.get("suffix", "0000")
        ekey = cfg.get("entity_key", self._key.lower())

        self.entity_id = ENTITY_ID_TPL.format(domain="switch", suffix=suffix, key=ekey)

        self._attr_name = cfg["name"]
        self._attr_unique_id = f"tailgdd_{suffix}_sw_{self._key}"
        self._attr_device_info = build_device_info(info)

        self._is_on = False
        self._available = False

    async def async_added_to_hass(self):
        self._on_event = self._handle_event
        self._client.add_listener(self._on_event)
        if self._client.last_status:
            self._update_state(self._client.last_status)

    async def async_will_remove_from_hass(self):
        self._client.remove_listener(self._on_event)

    @callback
    def _handle_event(self, event: dict):
        if event.get("type") == "connect":
            self._available = True
            self.async_write_ha_state()
            return
        if event.get("type") != "status":
            return
        self._update_state(event["data"])

    def _update_state(self, payload: dict):
        raw = payload.get(self._key)
        if raw is None:
            return
        self._is_on = (raw == 1)
        self._available = True
        self.async_write_ha_state()

    @property
    def is_on(self) -> bool:
        return self._is_on

    @property
    def icon(self) -> str:
        return self._icon_on if self._is_on else self._icon_off

    @property
    def available(self) -> bool:
        return self._available

    async def async_turn_on(self, **kwargs):
        await self._client.async_send_command(self._cmd_on)

    async def async_turn_off(self, **kwargs):
        await self._client.async_send_command(self._cmd_off)