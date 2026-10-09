# TAILG 车辆集成 for Home Assistant

![HACS Custom](https://img.shields.io/badge/HACS-Custom-orange.svg)
![HA Version](https://img.shields.io/badge/Home%20Assistant-2022.8%2B-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

> 台铃电动车的 Home Assistant 集成 —— 轨迹回放、实时定位、远程控制、车辆状态一网打尽。

---

## ✨ 功能特性

### 📍 车辆定位
- **实时位置**：读取 `carStatus` 接口获取车辆当前经纬度
- **HA 地图集成**：作为 `device_tracker` 出现在标准地图卡片上
- **自动纠偏**：WGS-84 → GCJ-02，与高德底图精准对齐

### 🗺️ 轨迹回放
- **按月浏览**：一次加载整月行程，日期列表折叠/展开
- **多段合并**：同一天多段行程用不同颜色区分
- **速度着色**：按速度区间用绿/蓝/橙/红四色绘制轨迹
- **点击查询**：点击轨迹线/起点/终点查看时间、速度、方向
- **底图切换**：标准 / 卫星 / 卫星+路网
- **响应式**：手机端地图在上、列表在下；大屏左右分栏

### 🔌 远程控制
- **电源开关**：远程开电 / 关电（`start` / `stop`）
- **防盗开关**：远程设防 / 撤防（`lock` / `unlock`）
- **寻车按钮**：一键鸣笛 / 闪灯（`search`）

### 📊 状态监测

| 传感器 | 数据源 | 更新频率 |
|--------|--------|----------|
| 电量 | HTTP 轮询 | 180 秒 |
| 电压 | HTTP 轮询 | 180 秒 |
| 续航 | HTTP 轮询 | 180 秒 |
| 定位时间 | HTTP 轮询 | 180 秒 |
| 在线状态 | HTTP 轮询 | 180 秒 |
| 静音状态 | MQTT 推送 | 实时 |
| 车辆状态 | MQTT 推送 | 实时 |

### 🎨 自定义卡片
- **车辆信息卡片**：电量、续航、电压、控制按钮一屏展示
- **地图卡片**：显示车辆最新位置，点击打开历史轨迹
- **主题自适应**：自动跟随 HA 明亮/暗黑主题

---

## 📦 安装

### 前置要求

- Home Assistant **2022.8.0** 或更高版本
- Python 3.9+
- 已开通 **台铃智能** 账号并绑定车辆

### 方式一：HACS（推荐）

1. 打开 HACS → **集成**
2. 右上角 ⋮ → **自定义存储库**
3. 添加 URL：

       https://github.com/wongz/tailg

4. 类别选 **Integration** → 添加
5. 搜索 **TAILG** → 安装
6. **重启 Home Assistant**

### 方式二：手动安装

1. 下载最新 [Release](https://github.com/wongz/tailg/releases)
2. 解压到 `custom_components/tailg/`
3. 确认目录结构：

       config/
       └── custom_components/
           └── tailg/
               ├── __init__.py
               ├── amap.py
               ├── api.py
               ├── button.py
               ├── config_flow.py
               ├── const.py
               ├── coordinator.py
               ├── device_tracker.py
               ├── http_api.py
               ├── manifest.json
               ├── sensor.py
               ├── switch.py
               └── www/
                   ├── tailg-card.js
                   └── tailg-map-card.js

4. **重启 Home Assistant**

---

## 🚀 配置

### 1. 获取授权信息

使用抓包工具（如 **Fiddler**、**Reqable**、**mitmproxy**）捕获 台铃智能 APP 的网络请求，找到 `carStatus` 接口，提取以下字段：

| 字段 | 说明 | 示例 |
|------|------|------|
| `token` | 请求头 `authorization` 的完整值 | `c3fwod5K...` |

### 2. 添加集成

1. 打开 **设置 → 设备与服务 → 添加集成**
2. 搜索 **TAILG**
3. 填入上一步提取的字段
4. 提交

### 3. 部署卡片

插件会自动部署卡片 JS 到 `/config/www/`及添加对应资源，你可以检查资源是否添加成功：

1. 打开 **设置 → 仪表盘 → 右上角 ⋮ → 资源**
2. 两条记录：

   | URL | 类型 |
   |-----|------|
   | `/local/tailg-card.js` | JavaScript 模块 |
   | `/local/tailg-map-card.js` | JavaScript 模块 |

注意 **强制刷新浏览器**（`Ctrl + Shift + R`）

---

## 🎴 卡片使用

### 车辆信息卡片

    type: custom:tailg-card
    name: 台铃
    entities:
      online:   sensor.tailg_9179_online
      battery:  sensor.tailg_9179_battery
      voltage:  sensor.tailg_9179_voltage
      range:    sensor.tailg_9179_range
      gps_time: sensor.tailg_9179_gps_time
      acc:      switch.tailg_9179_power
      defence:  switch.tailg_9179_defence
      search:   button.tailg_9179_search
      charging:   button.tailg_9179_charging

实体 ID 说明：`tailg_XXXX` 里的 `XXXX` 是车架号后 4 位，例如 `346022600559179` → `9179`。

### 地图卡片

    type: custom:tailg-map-card
    entity: device_tracker.tailg_9179_location

- **默认视图**：地图显示车辆最新位置
- **点击地图**：打开历史轨迹全屏对话框
- **历史轨迹**：按月浏览、按日查看、点击轨迹点查详情

---

## 🎯 实体列表

安装后，HA 会为每辆车生成以下实体：

| 平台 | Entity ID | 名称 | 说明 |
|------|-----------|------|------|
| device_tracker | device_tracker.tailg_9179_location | 位置 | 车辆当前位置 |
| sensor | sensor.tailg_9179_battery | 电量 | 电池百分比 |
| sensor | sensor.tailg_9179_voltage | 电压 | 电池电压（V） |
| sensor | sensor.tailg_9179_range | 续航 | 剩余里程（km） |
| sensor | sensor.tailg_9179_gps_time | 定位时间 | 最后定位时间 |
| sensor | sensor.tailg_9179_online | 在线 | 在线/离线 |
| sensor | sensor.tailg_9179_status | 车辆状态 | 未知|
| switch | sensor.tailg_9179_mute | 防盗静音 | 正常/已静音 |
| switch | switch.tailg_9179_power | 电源 | 开电/关电 |
| switch | switch.tailg_9179_defence | 防盗 | 设防/撤防 |
| button | button.tailg_9179_search | 寻车 | 一键鸣笛 |

---

## ⚙️ 自动化示例

### 1. 车辆离开家时提醒

    automation:
      - alias: "车辆离开家"
        trigger:
          - platform: zone
            entity_id: device_tracker.tailg_9179_location
            zone: zone.home
            event: leave
        action:
          - service: notify.mobile_app_your_phone
            data:
              title: "🚴 车辆离开"
              message: "车辆已离开家"

### 2. 电量低于 20% 提醒

    automation:
      - alias: "车辆电量低"
        trigger:
          - platform: numeric_state
            entity_id: sensor.tailg_9179_battery
            below: 20
        action:
          - service: persistent_notification.create
            data:
              title: "🔋 车辆电量低"
              message: "当前电量 {{ states('sensor.tailg_9179_battery') }}%"

### 3. 未设防提醒

    automation:
      - alias: "车辆未设防提醒"
        trigger:
          - platform: state
            entity_id: sensor.tailg_9179_status
            to: "静止"
            for: "00:10:00"
        condition:
          - condition: state
            entity_id: switch.tailg_9179_defence
            state: "off"
        action:
          - service: notify.mobile_app_your_phone
            data:
              message: "车辆已停止 10 分钟，尚未设防，请确认"

---

## 🔧 故障排查

### 集成加载失败

**症状**：集成列表里找不到 TAILG。

**排查**：
1. 检查目录结构是否正确（`manifest.json` 和 `__init__.py` 必须在 `custom_components/tailg/` 下）
2. 检查日志：设置 → 系统 → 日志，搜索 `tailg`
3. 确认已 **重启 Home Assistant**（不是 reload）

### 传感器显示"未知"

**症状**：所有实体都是 `unknown`。

**原因**：token 过期 / 车辆离线 / MQTT 连接失败。

**排查**：
1. 打开官方 APP，确认车辆是否显示"在线"
2. 检查日志里是否有 `carStatus 接口返回失败`
3. 重新抓包更新 token（token 有时效）

### 地图错位 / 瓦片马赛克

**原因**：Leaflet 在 HA 的 Shadow DOM 中拿不到正确尺寸。

**排查**：
1. **强刷浏览器**（`Ctrl + Shift + R`）
2. 检查 Console 是否有 `Leaflet 加载失败`
3. 若 `unpkg.com` 被墙，把 `tailg-map-card.js` 里 `LEAFLET_CSS` 和 `LEAFLET_JS` 换成国内 CDN

### 控制按钮无反应

**症状**：点击开电/关电/寻车，车辆不动。

**排查**：
1. 看日志里是否有 `指令已发布: APP_S/CMD/...`
2. 打开官方 APP，确认 **没有被同时登录**（HA 和 APP 会互踢）
3. 确认车辆 **ACC 状态**（有些指令需要在特定状态下才能执行）

### 历史轨迹打不开

**症状**：点击地图卡片，无反应。

**排查**：
1. **强刷浏览器**
2. 检查 HA 是否允许 `history.pushState`（某些反向代理会拦截）
3. 查看 Console 是否有 `[tailg-map] 打开历史轨迹失败`

---

## 📡 接口说明

集成使用以下官方接口：

| 接口 | 路径 | 用途 |
|------|------|------|
| 车辆状态 | /v1/api/app/centralControl/carStatus | 获取位置、电量、MQTT 凭据 |
| 行程列表 | /v1/api/app/centralControl/deviceTravel | 按月拉取行程摘要 |
| 行程详情 | /v1/api/app/centralControl/deviceTravelDetail | 拉取单段行程轨迹点 |

MQTT 通信：
- 服务器：`excluster4.tailgdd.com:6668`（TLS）
- 订阅：`S_APP/STATUS/{imei}`（车辆状态推送）
- 发布：`APP_S/CMD/{imei}`（控制指令）

---

## 🚨 注意事项

1. **仅限个人使用**：本项目仅用于学习交流，请勿用于商业用途
2. **Token 时效**：TAILG 的 `authorization` 有时效，过期后需重新抓包更新
3. **车辆离线**：若车辆长时间离线（如电池耗尽、地库无信号），所有控制指令均无效
4. **坐标系**：tailg 使用 GCJ-02（高德体系），集成内部自动转换
5. **APP 互踢**：HA 与官方 APP 同时在线时，MQTT 连接会互踢。建议不同时登录

---

## 📁 项目结构

    custom_components/tailg/
    ├── __init__.py          # 集成入口
    ├── manifest.json        # 元数据
    ├── const.py             # 常量定义
    ├── config_flow.py       # 配置流程
    ├── amap.py               # 高德逆地理
    ├── api.py               # carStatus 接口封装
    ├── coordinator.py       # HTTP 轮询协调器
    ├── http_api.py          # 供前端卡片调用的代理 API
    ├── sensor.py            # 传感器实体
    ├── button.py            # 按钮实体
    ├── switch.py            # 开关实体
    ├── device_tracker.py    # 位置追踪器
    └── www/
        ├── tailg-card.js      # 车辆信息卡片
        └── tailg-map-card.js  # 地图 + 历史轨迹卡片

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request。

### 开发环境

    git clone https://github.com/wongz/tailg.git
    cd tailg
    # 把 custom_components/tailg/ 软链到 HA 的 config 目录
    ln -s $(pwd)/custom_components/tailg ~/.homeassistant/custom_components/tailg

### 代码风格

- Python：遵循 PEP 8
- JavaScript：ES2017 兼容（不使用 optional chaining、nullish coalescing）
- 兼容 HA **2022.8+**

---

## 📜 许可证

[MIT License](LICENSE)

---

## ⚠️ 免责声明

本项目为个人学习项目，与 **台铃** 官方无关。使用本项目所产生的一切后果由使用者自行承担，包括但不限于：

- 账号被封禁
- 车辆被误操作
- 数据泄露风险

请谨慎使用，风险自负。

---

## 🙏 致谢

- [Home Assistant](https://www.home-assistant.io/)
- [Leaflet](https://leafletjs.com/)
- 所有贡献者和使用者

---

⭐ 如果这个项目对你有帮助，请给个 Star！
