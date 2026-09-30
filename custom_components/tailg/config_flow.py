"""TAILG 配置流程。"""
from __future__ import annotations

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback

from .const import (
    DOMAIN,
    CONF_TOKEN, CONF_AMAP_KEY,
)


class TailgConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """处理 UI 中配置 TAILG 集成。"""

    async def async_step_user(self, user_input=None):
        errors = {}

        if user_input is not None:
            if not user_input.get(CONF_TOKEN):
                errors["base"] = "token_required"
            else:
                #await self.async_set_unique_id(user_input.get(CONF_FRAME, "tailg"))
                #self._abort_if_unique_id_configured()
                return self.async_create_entry(
                    title="TAILG",
                    data=user_input,
                )

        schema = vol.Schema({
            vol.Required(CONF_TOKEN):  str,
            #vol.Optional(CONF_COOKIE,   default=""): str,
            vol.Optional(CONF_AMAP_KEY, default=""): str,
        })

        return self.async_show_form(
            step_id="user",
            data_schema=schema,
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return TailgOptionsFlowHandler(config_entry)


class TailgOptionsFlowHandler(config_entries.OptionsFlow):
    """选项流程（更新 token / 高德 Key 用）。"""

    def __init__(self, config_entry):
        self.config_entry = config_entry

    async def async_step_init(self, user_input=None):
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        # 优先从 options 取，回退到 data
        entry = self.config_entry

        def current(key, default=""):
            if key in entry.options:
                return entry.options[key]
            return entry.data.get(key, default)

        schema = vol.Schema({
            vol.Required(CONF_TOKEN,        default=current(CONF_TOKEN)):        str,
            #vol.Optional(CONF_COOKIE,       default=current(CONF_COOKIE)):       str,
            vol.Optional(CONF_AMAP_KEY,     default=current(CONF_AMAP_KEY)):     str,
        })

        return self.async_show_form(step_id="init", data_schema=schema)
