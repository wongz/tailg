"""高德逆地理编码封装 —— 坐标转地址名称。"""
from __future__ import annotations

import logging

import aiohttp

_LOGGER = logging.getLogger(__name__)

AMAP_URL = "https://dualstack-arestapi.amap.com/v3/geocode/regeo"

AMAP_HEADERS = {
    "User-Agent":      "AMAP SDK Android Search 9.7.0",
    "Connection":      "close",
    "Accept-Encoding": "gzip",
    "Content-Type":    "application/x-www-form-urlencoded",
    "logversion":      "2.1",
    "platinfo":        "platform=Android&sdkversion=9.7.0&product=sea",
    "X-INFO":          "hQZief6WnqCG1LcD1WBVinm2f5IFaU7uwpLhXa4wA01yWqdKZ5XB2z+qAMoxVKirIku2dMJhc0VKk4kdpMkthSHoqNgPoOn48BB3zHr9o0A/hSLYdokBwQZy9HKLtfwiJ/Ge5+T87MRxK4ImmJkOkTtgff7VMYFf9Uzh+rnK+KL3n/VmT/KMi6mUbB+hgGMhBUxwAovPt5fxcfP99DHePk8B2L+jm8ZfGde5UC2XtjSJUklVVwVQlSPAGblSD2F3SVIqm2YkS4QqxWFloyOvh1UfItVWIyiVp0OkVuepwIGiaTTtzpJ5gRkHjvAX2wJg9Tj95wAAAA==",
    "csid":            "2fc7cb4524814b4792aad89df574f38f",
}

AMAP_KEY  = "07d66ceb1e1c9efae58e02a9d4ab319d"
AMAP_SCODE = "1de841d97bfc33bbe9caa09dcc3b45d9"


async def async_reverse_geocode(lng: float, lat: float) -> str | None:
    """
    调用高德逆地理接口，返回可读地址名。
    失败返回 None。
    """
    if lng is None or lat is None:
        return None

    location = f"{lng:.6f},{lat:.6f}"
    payload = {
        "output":     "json",
        "location":   location,
        "mode":       "distance",
        "extensions": "base",
        "radius":     "20",
        "coordsys":   "autonavi",
        "key":        AMAP_KEY,
        "language":   "zh-CN",
        "ts":         str(int(__import__("time").time() * 1000)),
        "scode":      AMAP_SCODE,
    }

    timeout = aiohttp.ClientTimeout(total=10)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.post(
                AMAP_URL, data=payload, headers=AMAP_HEADERS
            ) as resp:
                result = await resp.json(content_type=None)
    except Exception as err:
        _LOGGER.warning("高德逆地理请求失败: %s", err)
        return None

    if str(result.get("status")) != "1":
        _LOGGER.debug("高德接口返回: %s", result.get("info"))
        return None

    regeocode = result.get("regeocode") or {}
    formatted = regeocode.get("formatted_address")
    return formatted or None
