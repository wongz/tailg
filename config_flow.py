"""Tailgdd 配置流程。"""
from __future__ import annotations

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.core import callback

from .const import (
    DOMAIN, CONF_FRAME, CONF_UID, CONF_TOKEN, CONF_COOKIE,
)


class TailgddConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """处理 UI 中配置 Tailgdd 集成。"""

    VERSION = 1

    async def async_step_user(self, user_input=None):
        errors = {}

        if user_input is not None:
            # 简单校验
            if not user_input.get(CONF_TOKEN):
                errors["base"] = "token_required"
            else:
                await self.async_set_unique_id(user_input.get(CONF_FRAME, "tailgdd"))
                self._abort_if_unique_id_configured()
                return self.async_create_entry(
                    title="Tailgdd Vehicle",
                    data=user_input,
                )

        schema = vol.Schema({
            vol.Required(CONF_FRAME):  str,
            vol.Required(CONF_UID):    str,
            vol.Required(CONF_TOKEN):  str,
            vol.Optional(CONF_COOKIE, default=""): str,
        })

        return self.async_show_form(
            step_id="user",
            data_schema=schema,
            errors=errors,
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return TailgddOptionsFlowHandler(config_entry)


class TailgddOptionsFlowHandler(config_entries.OptionsFlow):
    """选项流程（更新 token 用）。"""

    def __init__(self, config_entry):
        self.config_entry = config_entry

    async def async_step_init(self, user_input=None):
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        data = self.config_entry.data
        schema = vol.Schema({
            vol.Required(CONF_FRAME, default=data.get(CONF_FRAME, "")):  str,
            vol.Required(CONF_UID,   default=data.get(CONF_UID, "")):    str,
            vol.Required(CONF_TOKEN, default=data.get(CONF_TOKEN, "")):  str,
            vol.Optional(CONF_COOKIE, default=data.get(CONF_COOKIE, "")): str,
        })

        return self.async_show_form(step_id="init", data_schema=schema)