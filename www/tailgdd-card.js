/**
 * Tailgdd 车辆信息卡片
 * 用法：resources 加载 /local/tailgdd-card.js，然后在 Lovelace 里添加自定义卡片
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
            _status: { type: Object },
        };
    }

    static get styles() {
        return css`
            :host {
                display: block;
            }
            ha-card {
                padding: 16px;
                background: var(--ha-card-background, var(--card-background-color, #fff));
                color: var(--primary-text-color);
            }
            .header {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-bottom: 12px;
                padding-bottom: 12px;
                border-bottom: 1px solid var(--divider-color);
            }
            .header-icon {
                width: 36px;
                height: 36px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: var(--primary-color);
                color: #fff;
                border-radius: 50%;
                flex: 0 0 auto;
            }
            .header-title {
                flex: 1;
                min-width: 0;
            }
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
                margin-top: 2px;
            }
            .status-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: var(--disabled-text-color);
                margin-right: 4px;
                display: inline-block;
                vertical-align: middle;
            }
            .status-dot.online {
                background: var(--success-color, #22c55e);
                box-shadow: 0 0 0 3px rgba(34, 197, 94, .2);
            }

            .metrics {
                display: grid;
                grid-template-columns: repeat(2, 1fr);
                gap: 12px;
                margin-bottom: 14px;
            }
            .metric {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .metric-label {
                font-size: 11px;
                color: var(--secondary-text-color);
                text-transform: uppercase;
                letter-spacing: .5px;
            }
            .metric-value {
                font-size: 18px;
                font-weight: 600;
                color: var(--primary-text-color);
                font-variant-numeric: tabular-nums;
            }
            .metric-value small {
                font-size: 12px;
                font-weight: 400;
                color: var(--secondary-text-color);
                margin-left: 2px;
            }

            .battery-bar {
                height: 6px;
                background: var(--divider-color);
                border-radius: 3px;
                overflow: hidden;
                margin-top: 4px;
            }
            .battery-fill {
                height: 100%;
                background: #22c55e;
                transition: width .3s ease;
            }
            .battery-fill.low { background: #f59e0b; }
            .battery-fill.critical { background: #ef4444; }

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
                border-radius: 8px;
                background: var(--secondary-background-color, #f5f5f5);
                color: var(--primary-text-color);
                cursor: pointer;
                border: 1px solid var(--divider-color);
                transition: background .15s;
                user-select: none;
                font-size: 11px;
                font-weight: 600;
            }
            .action-btn:hover {
                background: var(--divider-color);
            }
            .action-btn:active {
                transform: scale(.97);
            }
            .action-btn.on {
                background: rgba(34, 197, 94, .15);
                border-color: #22c55e;
                color: #16a34a;
            }
            .action-btn.warn {
                background: rgba(239, 68, 68, .12);
                border-color: #ef4444;
                color: #dc2626;
            }
            .action-btn ha-icon {
                --mdc-icon-size: 18px;
            }

            .loading {
                text-align: center;
                padding: 20px;
                color: var(--secondary-text-color);
                font-size: 13px;
            }
        `;
    }

    setConfig(config) {
        if (!config.entities) {
            throw new Error("请在配置中指定 entities");
        }
        this.config = config;
    }

    getCardSize() {
        return 5;
    }

    // ---------- 渲染 ----------
    render() {
        if (!this.hass) return html``;

        const e = this.config.entities;
        const name = this._getState(e.name) || "车辆";
        const online = this._isOn(e.online);
        const battery = this._getNumber(e.battery);
        const voltage = this._getNumber(e.voltage);
        const range = this._getNumber(e.range);
        const gpsTime = this._getState(e.gps_time) || "--";
        const acc = this._isOn(e.acc);
        const defence = this._isOn(e.defence);

        const batteryClass =
            battery == null ? "" :
            battery < 20 ? "critical" :
            battery < 50 ? "low" : "";

        return html`
            <ha-card>
                <div class="header">
                    <div class="header-icon">
                        <ha-icon icon="mdi:motorbike-electric"></ha-icon>
                    </div>
                    <div class="header-title">
                        <div class="header-name">${name}</div>
                        <div class="header-sub">
                            <span class="status-dot ${online ? "online" : ""}"></span>
                            ${online ? "在线" : "离线"} · ${gpsTime}
                        </div>
                    </div>
                </div>

                <div class="metrics">
                    <div class="metric">
                        <div class="metric-label">电量</div>
                        <div class="metric-value">
                            ${battery != null ? battery : "--"}<small>%</small>
                        </div>
                        <div class="battery-bar">
                            <div class="battery-fill ${batteryClass}"
                                 style="width:${battery != null ? battery : 0}%"></div>
                        </div>
                    </div>
                    <div class="metric">
                        <div class="metric-label">续航</div>
                        <div class="metric-value">
                            ${range != null ? range : "--"}<small>km</small>
                        </div>
                    </div>
                    <div class="metric">
                        <div class="metric-label">电压</div>
                        <div class="metric-value">
                            ${voltage != null ? voltage : "--"}<small>V</small>
                        </div>
                    </div>
                    <div class="metric">
                        <div class="metric-label">状态</div>
                        <div class="metric-value" style="font-size:14px">
                            ${acc ? "已通电" : "已关电"} · ${defence ? "已设防" : "已撤防"}
                        </div>
                    </div>
                </div>

                <div class="actions">
                    <div class="action-btn ${acc ? "on" : ""}"
                         @click=${() => this._toggle(e.acc, acc ? "turn_off" : "turn_on")}>
                        <ha-icon icon="mdi:power"></ha-icon>
                        <span>${acc ? "关电" : "开电"}</span>
                    </div>
                    <div class="action-btn ${defence ? "on" : ""}"
                         @click=${() => this._toggle(e.defence, defence ? "turn_off" : "turn_on")}>
                        <ha-icon icon="mdi:shield-car"></ha-icon>
                        <span>${defence ? "撤防" : "设防"}</span>
                    </div>
                    <div class="action-btn"
                         @click=${() => this._press(e.search)}>
                        <ha-icon icon="mdi:bullhorn"></ha-icon>
                        <span>寻车</span>
                    </div>
                </div>
            </ha-card>
        `;
    }

    // ---------- 辅助 ----------
    _getState(entityId) {
        if (!entityId) return null;
        const s = this.hass.states[entityId];
        return s ? s.state : null;
    }

    _getNumber(entityId) {
        if (!entityId) return null;
        const s = this.hass.states[entityId];
        if (!s) return null;
        const v = parseFloat(s.state);
        return isNaN(v) ? null : v;
    }

    _isOn(entityId) {
        if (!entityId) return false;
        const s = this.hass.states[entityId];
        if (!s) return false;
        return s.state === "on";
    }

    _toggle(entityId, action) {
        if (!entityId) return;
        const domain = entityId.split(".")[0];
        this.hass.callService(domain, action, { entity_id: entityId });
    }

    _press(entityId) {
        if (!entityId) return;
        this.hass.callService("button", "press", { entity_id: entityId });
    }
}

customElements.define("tailgdd-card", TailgddCard);

// 让 HA 认识这张卡
window.customCards = window.customCards || [];
window.customCards.push({
    type: "tailgdd-card",
    name: "Tailgdd 车辆信息卡片",
    description: "显示电量、续航、电压、状态，并提供电源/防盗/寻车控制",
    preview: false,
});
