"""高德逆地理编码封装 —— 坐标转地址名称。"""
from __future__ import annotations

import logging
import math

import aiohttp

_LOGGER = logging.getLogger(__name__)

AMAP_URL = "https://restapi.amap.com/v3/geocode/regeo"

AMAP_HEADERS = {
    "User-Agent":   "Mozilla/5.0",
    "Content-Type": "application/x-www-form-urlencoded",
}


# ============================================================
# WGS-84 → GCJ-02
# ============================================================
def _out_of_china(lng: float, lat: float) -> bool:
    return (lng < 72.004 or lng > 137.8347) or (lat < 0.8293 or lat > 55.8271)


def _transform_lat(x: float, y: float) -> float:
    ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y
    ret += 0.2 * math.sqrt(abs(x))
    ret += (20.0 * math.sin(6.0 * x * math.pi) + 20.0 * math.sin(2.0 * x * math.pi)) * 2.0 / 3.0
    ret += (20.0 * math.sin(y * math.pi) + 40.0 * math.sin(y / 3.0 * math.pi)) * 2.0 / 3.0
    ret += (160.0 * math.sin(y / 12.0 * math.pi) + 320 * math.sin(y * math.pi / 30.0)) * 2.0 / 3.0
    return ret


def _transform_lng(x: float, y: float) -> float:
    ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y
    ret += 0.1 * math.sqrt(abs(x))
    ret += (20.0 * math.sin(6.0 * x * math.pi) + 20.0 * math.sin(2.0 * x * math.pi)) * 2.0 / 3.0
    ret += (20.0 * math.sin(x * math.pi) + 40.0 * math.sin(x / 3.0 * math.pi)) * 2.0 / 3.0
    ret += (150.0 * math.sin(x / 12.0 * math.pi) + 300.0 * math.sin(x / 30.0 * math.pi)) * 2.0 / 3.0
    return ret


def wgs84_to_gcj02(lng: float, lat: float):
    if _out_of_china(lng, lat):
        return lng, lat

    a = 6378245.0
    ee = 0.00669342162296594323

    d_lat = _transform_lat(lng - 105.0, lat - 35.0)
    d_lng = _transform_lng(lng - 105.0, lat - 35.0)

    rad_lat = lat / 180.0 * math.pi
    magic = math.sin(rad_lat)
    magic = 1 - ee * magic * magic
    sqrt_magic = math.sqrt(magic)

    d_lat = (d_lat * 180.0) / ((a * (1 - ee)) / (magic * sqrt_magic) * math.pi)
    d_lng = (d_lng * 180.0) / (a / sqrt_magic * math.cos(rad_lat) * math.pi)

    return lng + d_lng, lat + d_lat


# ============================================================
# 逆地理主函数
# ============================================================
async def async_reverse_geocode(lng: float, lat: float,
                                amap_key: str = "") -> str | None:
    """
    调用高德逆地理接口，返回可读地址名。
    输入 WGS-84，内部转 GCJ-02。
    amap_key 为空则直接返回 None。
    """
    if lng is None or lat is None:
        return None

    if not amap_key:
        return None

    try:
        gcj_lng, gcj_lat = wgs84_to_gcj02(float(lng), float(lat))
    except Exception as err:
        _LOGGER.warning("坐标转换失败: %s", err)
        return None

    location = f"{gcj_lng:.6f},{gcj_lat:.6f}"

    params = {
        "key":        amap_key,
        "location":   location,
        "extensions": "base",
        "radius":     "20",
        "coordsys":   "autonavi",
        "output":     "json",
    }

    timeout = aiohttp.ClientTimeout(total=10)
    try:
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(
                AMAP_URL, params=params, headers=AMAP_HEADERS
            ) as resp:
                result = await resp.json(content_type=None)
    except Exception as err:
        _LOGGER.warning("高德逆地理请求失败: %s", err)
        return None

    if str(result.get("status")) != "1":
        _LOGGER.warning("高德接口返回: %s", result)
        return None

    regeocode = result.get("regeocode") or {}
    formatted = regeocode.get("formatted_address")
    return formatted or None