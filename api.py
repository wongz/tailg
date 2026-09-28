"""carStatus 接口封装。"""
from __future__ import annotations

import logging

import aiohttp

from .const import API_URL, API_HEADERS, API_PAYLOAD

_LOGGER = logging.getLogger(__name__)


async def async_fetch_car_status(
    token: str,
    cookie: str = "",
    uid: str = "",
    frame: str = "",
) -> dict | None:
    """
    调用 carStatus 接口，返回 data 字段（dict）。
    失败返回 None。
    """
    headers = dict(API_HEADERS)
    headers["authorization"] = token
    if cookie:
        headers["Cookie"] = cookie

    payload = dict(API_PAYLOAD)
    if uid:
        payload["uid"] = uid
    if frame:
        payload["frame"] = frame

    timeout = aiohttp.ClientTimeout(total=15)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(API_URL, json=payload, headers=headers) as resp:
                text = await resp.text()
                try:
                    result = await resp.json(content_type=None)
                except Exception:
                    _LOGGER.error("carStatus 返回非 JSON: %s", text[:200])
                    return None
    except Exception as err:
        _LOGGER.warning("请求 carStatus 失败: %s", err)
        return None

    if result.get("code") != 0:
        _LOGGER.warning("carStatus 返回错误: code=%s msg=%s",
                        result.get("code"), result.get("msg"))
        return None

    data = result.get("data")
    return data if isinstance(data, dict) else None