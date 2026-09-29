/**
 * Tailgdd 车辆信息卡片
 */

const LitElement = Object.getPrototypeOf(
    customElements.get("ha-panel-lovelace")
);
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

class TailgddCard extends LitElement {
    static get properties() {
        return {
            hass:   { type: Object },
            config: { type: Object },
        };
    }

    static get styles() {
        return css`
            :host { display: block; }
            ha-card {
                padding: 16px;
                background: var(--ha-card-background, var(--card-background-color, #fff));
                color: var(--primary-text-color);
                border-radius: var(--ha-card-border-radius, 12px);
            }

            /* ---------- 头部 ---------- */
            .header {
                display: flex;
                align-items: center;
                gap: 12px;
                padding-bottom: 12px;
                margin-bottom: 12px;
                border-bottom: 1px solid var(--divider-color);
            }
            .header-icon {
                width: 40px; height: 40px;
                display: flex; align-items: center; justify-content: center;
                background: linear-gradient(135deg, #3b82f6, #2563eb);
                color: #fff;
                border-radius: 50%;
                flex: 0 0 auto;
                box-shadow: 0 2px 8px rgba(37, 99, 235, .35);
            }
            .header-icon ha-icon { --mdc-icon-size: 22px; }
            .header-title { flex: 1; min-width: 0; }
            .header-name {
                font-size: 16px;
                font-weight: 600;
                color: var(--primary-text-color);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .header-sub {
                font-size: 12px;
                color: var(--secondary-text-color);
                margin-top: 3px;
                display: flex;
                align-items: center;
                gap: 4px;
            }
            .status-dot {
                width: 8px; height: 8px;
                border-radius: 50%;
                background: var(--disabled-text-color, #9ca3af);
                display: inline-block;
                flex: 0 0 auto;
            }
            .status-dot.online {
                background: #22c55e;
                box-shadow: 0 0 0 3px rgba(34, 197, 94, .2);
            }

            /* ---------- 电量徽章（右上角） ---------- */
            .battery-badge {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 2px;
                flex: 0 0 auto;
                min-width: 44px;
                //color: #22c55e;
            }
            .battery-badge ha-icon {
                --mdc-icon-size: 22px;
                color: inherit;
            }
            .battery-badge .pct {
                font-size: 13px;
                font-weight: 700;
                color: inherit;
                font-variant-numeric: tabular-nums;
                line-height: 1;
            }
            .battery-badge.low      { color: #f59e0b; }
            .battery-badge.critical { color: #ef4444; }
            .battery-badge.empty    { color: var(--secondary-text-color); }
            .battery-badge.empty .pct { font-weight: 400; }

            /* ---------- 指标网格（2 格） ---------- */
            .metrics {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 14px 16px;
                margin-bottom: 14px;
            }
            .metric { display: flex; flex-direction: column; gap: 4px; }
            .metric-label {
                font-size: 11px;
                color: var(--secondary-text-color);
                letter-spacing: .5px;
                text-transform: uppercase;
            }
            .metric-value {
                font-size: 20px;
                font-weight: 600;
                color: var(--primary-text-color);
                font-variant-numeric: tabular-nums;
                line-height: 1.1;
            }
            .metric-value small {
                font-size: 12px;
                font-weight: 400;
                color: var(--secondary-text-color);
                margin-left: 2px;
            }

            /* ---------- 操作按钮 ---------- */
            .actions {
                display: flex;
                gap: 8px;
                padding-top: 12px;
                border-top: 1px solid var(--divider-color);
            }
            .action-btn {
                flex: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 4px;
                padding: 10px 4px;
                border-radius: 10px;
                background: var(--secondary-background-color, rgba(127,127,127,.08));
                color: var(--primary-text-color);
                cursor: pointer;
                border: 1px solid var(--divider-color);
                transition: background .15s, border-color .15s, transform .1s;
                user-select: none;
                font-size: 11px;
                font-weight: 600;
                -webkit-tap-highlight-color: transparent;
            }
            .action-btn:hover:not(.disabled) {
                background: var(--divider-color);
            }
            .action-btn:active:not(.disabled) {
                transform: scale(.97);
            }
            .action-btn.disabled {
                opacity: .45;
                cursor: not-allowed;
            }
            .action-btn ha-icon { --mdc-icon-size: 18px; }
            .action-btn.on {
                background: rgba(34, 197, 94, .15);
                border-color: #22c55e;
                color: #16a34a;
            }
        `;
    }

    setConfig(config) {
        if (!config || !config.entities) {
            throw new Error("请在配置中提供 entities");
        }
        this.config = config;
    }

    getCardSize() { return 3; }

    static getStubConfig(hass) {
        let s = "";
        if (hass) {
            const m = Object.keys(hass.states)
                .map(id => id.match(/^sensor\.tailg_([a-z0-9]{4})_battery$/))
                .find(x => x);
            if (m) s = m[1];
        }
        const e = (domain, key) => s ? `${domain}.tailg_${s}_${key}` : "";

        return {
            type: "custom:tailgdd-card",
            entities: {
                online:   e("sensor", "online"),
                battery:  e("sensor", "battery"),
                voltage:  e("sensor", "voltage"),
                range:    e("sensor", "range"),
                gps_time: e("sensor", "gps_time"),
                acc:      e("switch", "power"),
                defence:  e("switch", "defence"),
                search:   e("button", "search"),
            },
        };
    }

    // ==================== 工具 ====================
    _s(entityId) {
        if (!entityId) return null;
        const st = this.hass.states[entityId];
        return st ? st.state : null;
    }
    _num(entityId) {
        const v = parseFloat(this._s(entityId));
        return isNaN(v) ? null : v;
    }
    _isOn(entityId) {
        return this._s(entityId) === "on";
    }
    _isOnline(entityId) {
        const s = this._s(entityId);
        if (s === null) return false;
        if (s === "on" || s === "在线" || s === "true" || s === "True" || s === "1") return true;
        return false;
    }
    _exists(entityId) {
        return !!(entityId && this.hass.states[entityId]);
    }

    _call(domain, service, data) {
        this.hass.callService(domain, service, data);
    }
    _toggle(entityId) {
        if (!entityId) return;
        const domain = entityId.split(".")[0];
        const cur = this._s(entityId);
        const action = cur === "on" ? "turn_off" : "turn_on";
        this._call(domain, action, { entity_id: entityId });
    }
    _press(entityId) {
        if (!entityId) return;
        this._call("button", "press", { entity_id: entityId });
    }

    // 电池图标（分档）
    _batteryIcon(pct) {
        if (pct == null) return "mdi:battery-unknown";
        if (pct >= 95) return "mdi:battery";
        if (pct >= 85) return "mdi:battery-90";
        if (pct >= 75) return "mdi:battery-80";
        if (pct >= 65) return "mdi:battery-70";
        if (pct >= 55) return "mdi:battery-60";
        if (pct >= 45) return "mdi:battery-50";
        if (pct >= 35) return "mdi:battery-40";
        if (pct >= 25) return "mdi:battery-30";
        if (pct >= 15) return "mdi:battery-20";
        if (pct >= 5)  return "mdi:battery-10";
        return "mdi:battery-alert-variant-outline";
    }

    _batteryClass(pct) {
        if (pct == null) return "empty";
        if (pct < 20) return "critical";
        if (pct < 50) return "low";
        return "";
    }

    // ==================== 渲染 ====================
    render() {
        if (!this.hass) return html``;

        const e = this.config.entities || {};
        const name    = this.config.name
                        || this._s(e.name)
                        || "车辆";
        const online  = this._isOnline(e.online);
        const battery = this._num(e.battery);
        const voltage = this._num(e.voltage);
        const range   = this._num(e.range);
        const gpsTime = this._formatTime(this._s(e.gps_time));

        const accOn     = this._isOn(e.acc);
        const defenceOn = this._isOn(e.defence);

        const batteryClass = this._batteryClass(battery);
        const batteryIcon  = this._batteryIcon(battery);

        return html`
            <ha-card>
                <div class="header">
                    <div class="header-icon">
                        <ha-icon icon="mdi:motorbike-electric"></ha-icon>
                    </div>
                    <div class="header-title">
                        <div class="header-name">${name}</div>
                        <div class="header-sub">
                            <span class="status-dot ${online ? 'online' : ''}"></span>
                            ${online ? "在线" : "离线"}${gpsTime ? ` · ${gpsTime}` : ""}
                        </div>
                    </div>

                    <div class="battery-badge ${batteryClass}">
                        <ha-icon icon="${batteryIcon}"></ha-icon>
                        <span class="pct">${battery != null ? battery + "%" : "--"}</span>
                    </div>
                </div>

                <div class="metrics">
                    <div class="metric">
                        <div class="metric-label">续航</div>
                        <div class="metric-value">
                            ${range != null ? range : "--"}<small>km</small>
                        </div>
                    </div>

                    <div class="metric">
                        <div class="metric-label">电压</div>
                        <div class="metric-value">
                            ${voltage != null ? voltage.toFixed(1) : "--"}<small>V</small>
                        </div>
                    </div>
                </div>

                <div class="actions">
                    <div class="action-btn ${accOn ? 'on' : ''} ${this._exists(e.acc) ? '' : 'disabled'}"
                         @click=${() => this._exists(e.acc) && this._toggle(e.acc)}>
                        <ha-icon icon="mdi:power"></ha-icon>
                        <span>${accOn ? "关电" : "开电"}</span>
                    </div>

                    <div class="action-btn ${defenceOn ? 'on' : ''} ${this._exists(e.defence) ? '' : 'disabled'}"
                         @click=${() => this._exists(e.defence) && this._toggle(e.defence)}>
                        <ha-icon icon="mdi:shield-car"></ha-icon>
                        <span>${defenceOn ? "撤防" : "设防"}</span>
                    </div>

                    <div class="action-btn ${this._exists(e.search) ? '' : 'disabled'}"
                         @click=${() => this._exists(e.search) && this._press(e.search)}>
                        <ha-icon icon="mdi:bullhorn"></ha-icon>
                        <span>寻车</span>
                    </div>
                </div>
            </ha-card>
        `;
    }

    _formatTime(s) {
        if (!s || s === "unknown" || s === "unavailable") return "";
        const m = String(s).match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
        return m ? `${m[1].slice(5)} ${m[2]}` : s;
    }
}

customElements.define("tailgdd-card", TailgddCard);

window.customCards = window.customCards || [];
window.customCards.push({
    type:        "tailgdd-card",
    name:        "台铃卡片",
    description: "显示电量、续航、电压，并提供电源/防盗/寻车控制",
    preview:     false,
    documentationURL: "https://github.com/wongz/tailgdd",
});