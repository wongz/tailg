"""Tailgdd HTTP API —— 供前端卡片调用，代理车厂接口。"""
from __future__ import annotations

import logging

import aiohttp
from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant

from .const import (
    DOMAIN,
    API_HEADERS,
    API_PAYLOAD,
)

_LOGGER = logging.getLogger(__name__)

BASE_URL = "https://www.tailgdd.com"


async def _post(hass: HomeAssistant, token: str, cookie: str,
                uid: str, frame: str, path: str,
                extra: dict | None = None) -> dict | None:
    """通用 POST 请求。"""
    headers = dict(API_HEADERS)
    headers["authorization"] = token
    if cookie:
        headers["Cookie"] = cookie

    payload = dict(API_PAYLOAD)
    if uid:   payload["uid"] = uid
    if frame: payload["frame"] = frame
    if extra: payload.update(extra)

    timeout = aiohttp.ClientTimeout(total=30)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                BASE_URL + path, json=payload, headers=headers
            ) as resp:
                text = await resp.text()
                try:
                    result = await resp.json(content_type=None)
                except Exception:
                    _LOGGER.error("接口返回非 JSON: %s", text[:200])
                    return None
    except Exception as err:
        _LOGGER.warning("请求 %s 失败: %s", path, err)
        return None

    if result.get("code") != 0:
        _LOGGER.warning("接口 %s 错误: %s", path, result.get("msg"))
        return None

    return result.get("data")


def _get_creds(hass: HomeAssistant) -> dict | None:
    """从 hass.data 里取第一辆车的凭据。"""
    store = hass.data.get(DOMAIN, {})
    for entry_data in store.values():
        if isinstance(entry_data, dict) and entry_data.get("creds"):
            return entry_data["creds"]
    return None


class TailgddMonthView(HomeAssistantView):
    """返回某月所有日期的行程摘要。"""
    url = "/api/tailgdd/month"
    name = "api:tailgdd:month"
    requires_auth = True

    async def get(self, request):
        month = request.query.get("month", "")
        if not month:
            return self.json_message("missing month", status_code=400)

        creds = _get_creds(request.app["hass"])
        if not creds:
            return self.json_message("no credentials", status_code=401)

        data = await _post(
            request.app["hass"],
            creds["token"], creds["cookie"], creds["uid"], creds["frame"],
            "/v1/api/app/centralControl/deviceTravel",
            {"queryMonth": month},
        )
        if data is None:
            return self.json_message("fetch failed", status_code=502)

        return self.json({"code": 0, "data": data})


class TailgddDayView(HomeAssistantView):
    """返回某天所有行程的轨迹点。"""
    url = "/api/tailgdd/day"
    name = "api:tailgdd:day"
    requires_auth = True

    async def get(self, request):
        travel_id = request.query.get("id", "")
        if not travel_id:
            return self.json_message("missing id", status_code=400)

        creds = _get_creds(request.app["hass"])
        if not creds:
            return self.json_message("no credentials", status_code=401)

        data = await _post(
            request.app["hass"],
            creds["token"], creds["cookie"], creds["uid"], creds["frame"],
            "/v1/api/app/centralControl/deviceTravelDetail",
            {"deviceTravelId": travel_id},
        )
        if data is None:
            return self.json_message("fetch failed", status_code=502)

        return self.json({"code": 0, "data": data})


class TailgddCarStatusView(HomeAssistantView):
    """返回车辆当前状态（含经纬度）。"""
    url = "/api/tailgdd/carstatus"
    name = "api:tailgdd:carstatus"
    requires_auth = True

    async def get(self, request):
        creds = _get_creds(request.app["hass"])
        if not creds:
            return self.json_message("no credentials", status_code=401)

        data = await _post(
            request.app["hass"],
            creds["token"], creds["cookie"], creds["uid"], creds["frame"],
            "/v1/api/app/centralControl/carStatus",
        )
        if data is None:
            return self.json_message("fetch failed", status_code=502)

        # ★ 不再做逆地理，直接返回原数据
        return self.json({"code": 0, "data": data})


async def async_register_views(hass: HomeAssistant) -> None:
    """注册 HTTP 视图。"""
    hass.http.register_view(TailgddMonthView)
    hass.http.register_view(TailgddDayView)
    #hass.http.register_view(TailgddCarStatusView)
    _LOGGER.info("Tailgdd HTTP API 已注册")