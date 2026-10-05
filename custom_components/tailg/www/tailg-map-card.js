/**
 * TAILG 地图卡片 —— iframe 隔离方案
 */

/* ============================================================
 * 工具函数
 * ============================================================ */
const PALETTE = [
    '#3b82f6','#ef4444','#22c55e','#f59e0b','#a855f7','#06b6d4',
    '#ec4899','#84cc16','#f97316','#14b8a6','#8b5cf6','#0ea5e9'
];
const WEEKDAYS = ['周日','周一','周二','周三','周四','周五','周六'];

const getRecentMonths = (n = 10) => {
    const out = [], now = new Date();
    let y = now.getFullYear(), m = now.getMonth();
    for (let i = 0; i < n; i++) {
        out.push(`${y}-${String(m + 1).padStart(2, '0')}`);
        if (--m < 0) { m = 11; y--; }
    }
    return out;
};

const fmtKm = m => (Number(m) / 1000).toFixed(2) + ' km';

const fmtDur = sec => {
    sec = Number(sec) || 0;
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (h > 0) return h + '小时' + (m ? m + '分' : '');
    if (m > 0) return m + '分' + (s ? s + '秒' : '');
    return s + '秒';
};

const hhmm = dt => String(dt).slice(11, 16);
const colorOf = i => PALETTE[i % PALETTE.length];

const parseDateParts = dateStr => {
    const d = new Date(dateStr + 'T00:00:00');
    if (isNaN(d.getTime())) return { mmdd: dateStr, week: '' };
    return { mmdd: dateStr.slice(5), week: WEEKDAYS[d.getDay()] };
};

/* ============================================================
 * WGS-84 → GCJ-02
 * ============================================================ */
const outOfChina = (lng, lat) =>
    (lng < 72.004 || lng > 137.8347) || (lat < 0.8293 || lat > 55.8271);

function transformLat(x, y) {
    let ret = -100 + 2*x + 3*y + 0.2*y*y + 0.1*x*y + 0.2*Math.sqrt(Math.abs(x));
    ret += (20*Math.sin(6*x*Math.PI) + 20*Math.sin(2*x*Math.PI)) * 2/3;
    ret += (20*Math.sin(y*Math.PI) + 40*Math.sin(y/3*Math.PI)) * 2/3;
    ret += (160*Math.sin(y/12*Math.PI) + 320*Math.sin(y*Math.PI/30)) * 2/3;
    return ret;
}
function transformLng(x, y) {
    let ret = 300 + x + 2*y + 0.1*x*x + 0.1*x*y + 0.1*Math.sqrt(Math.abs(x));
    ret += (20*Math.sin(6*x*Math.PI) + 20*Math.sin(2*x*Math.PI)) * 2/3;
    ret += (20*Math.sin(x*Math.PI) + 40*Math.sin(x/3*Math.PI)) * 2/3;
    ret += (150*Math.sin(x/12*Math.PI) + 300*Math.sin(x/30*Math.PI)) * 2/3;
    return ret;
}
function wgs84ToGcj02(lng, lat) {
    if (outOfChina(lng, lat)) return [lng, lat];
    const a = 6378245.0, ee = 0.00669342162296594323;
    let dLat = transformLat(lng - 105, lat - 35);
    let dLng = transformLng(lng - 105, lat - 35);
    const radLat = lat / 180 * Math.PI;
    let magic = Math.sin(radLat);
    magic = 1 - ee * magic * magic;
    const sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI);
    dLng = (dLng * 180) / (a / sqrtMagic * Math.cos(radLat) * Math.PI);
    return [lng + dLng, lat + dLat];
}

/* ============================================================
 * Leaflet + 高德瓦片配置
 * ============================================================ */
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_JS  = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

const AMAP = {
    street:      'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
    satellite:   'https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}',
    hybridLabel: 'https://webst0{s}.is.autonavi.com/appmaptile?style=8&x={x}&y={y}&z={z}'
};
const AMAP_SUBS = ['1','2','3','4'];

/* 车辆图标 SVG（默认卡片与历史轨迹共用） */
const CAR_SVG =
    '<svg viewBox="0 0 64 64" width="16" height="16" fill="none" ' +
      'stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="32" cy="24" r="6" />' +
      '<path d="M14 24 L27 24" /><path d="M37 24 L50 24" />' +
      '<path d="M22 36 Q22 30 28 30 H36 Q42 30 42 36 V50 Q42 56 36 56 H28 Q22 56 22 50 Z" />' +
      '<rect x="26" y="50" width="12" height="14" rx="6" />' +
    '</svg>';

/* ============================================================
 * iframe 内部 HTML 生成
 * ============================================================ */
function buildIframeHtml(mode, lng, lat) {
    const gcj = (lng && lat) ? wgs84ToGcj02(lng, lat) : [118.78, 32.0];
    const cLat = gcj[1], cLng = gcj[0];
    const show = !!(lng && lat);

    const markerJs = show ? `
      var icon = L.divIcon({
        className: '',
        html: '<div class="car-marker"><div class="car-marker-pulse"></div>' +
              '<div class="car-marker-dot">' + CAR_SVG + '</div></div>',
        iconSize: [40, 40], iconAnchor: [20, 20]
      });
      L.marker([${cLat}, ${cLng}], { icon: icon, zIndexOffset: 3000 }).addTo(map);` : '';

    return iframeShell(`
      #map { width:100%; height:100%; }
      html, body { margin:0; padding:0; height:100%; overflow:hidden; background:#e5e7eb; cursor:pointer; }
      .car-marker { position:relative; width:40px; height:40px; }
      .car-marker-pulse {
        position:absolute; inset:0; border-radius:50%;
        background:#3b82f6; opacity:.5;
        animation:carPulse 2s ease-out infinite;
      }
      .car-marker-dot {
        position:absolute; top:50%; left:50%;
        transform:translate(-50%,-50%);
        width:28px; height:28px;
        background:#2563eb; border:3px solid #fff; border-radius:50%;
        display:flex; align-items:center; justify-content:center;
        color:#fff; box-shadow:0 2px 10px rgba(0,0,0,.5);
      }
      @keyframes carPulse {
        0%   { transform:scale(.55); opacity:.75; }
        100% { transform:scale(1.7); opacity:0; }
      }
    `, `
      var CAR_SVG = ${JSON.stringify(CAR_SVG)};
      var map = L.map('map', {
        zoomControl: false, attributionControl: false, preferCanvas: true
      }).setView([${cLat}, ${cLng}], ${show ? 16 : 11});
      ${tileLayerCode(mode)}
      ${markerJs}
      setTimeout(function() { map.invalidateSize(); }, 50);
      setTimeout(function() { map.invalidateSize(); }, 200);
    `);
}

function buildHistoryIframeHtml(mode, tracks, currentPos) {
    const tracksJson = tracks.map(t => ({
        color: t.color,
        index: t.index,
        points: t.points.map(p => {
            const c = wgs84ToGcj02(Number(p.lng), Number(p.lat));
            return {
                latlng: [c[1], c[0]],
                time: p.report_time || p.reportTime || '',
                speed: Number(p.speed || 0),
                heading: Number(p.heading || 0),
            };
        })
    }));

    let curJson = null;
    if (currentPos && currentPos.lng && currentPos.lat) {
        const c = wgs84ToGcj02(Number(currentPos.lng), Number(currentPos.lat));
        curJson = { lat: c[1], lng: c[0] };
    }

    return iframeShell(`
      #map { width:100%; height:100%; }
      html, body { margin:0; padding:0; height:100%; overflow:hidden; background:#e5e7eb; }

      .basemap-switch {
        position:absolute; top:12px; right:12px; z-index:1000;
        display:flex; background:rgba(15,23,42,.9);
        border-radius:10px; overflow:hidden;
        box-shadow:0 4px 12px rgba(0,0,0,.3);
        backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px);
      }
      .basemap-switch button {
        appearance:none; border:none; background:transparent;
        color:#cbd5e1; font-size:12px; padding:7px 11px; cursor:pointer;
        font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;
        transition:background .15s, color .15s;
        white-space:nowrap; -webkit-tap-highlight-color:transparent;
      }
      .basemap-switch button:hover { background:rgba(51,65,85,.9); color:#fff; }
      .basemap-switch button.active { background:#2563eb; color:#fff; font-weight:600; }

      .cur-marker { position:relative; width:40px; height:40px; }
      .cur-marker-pulse {
        position:absolute; inset:0; border-radius:50%;
        background:#3b82f6; opacity:.5;
        animation:curPulse 2s ease-out infinite;
      }
      .cur-marker-dot {
        position:absolute; top:50%; left:50%;
        transform:translate(-50%,-50%);
        width:28px; height:28px;
        background:#2563eb; border:3px solid #fff; border-radius:50%;
        display:flex; align-items:center; justify-content:center;
        color:#fff; box-shadow:0 2px 10px rgba(0,0,0,.5);
      }
      @keyframes curPulse {
        0%   { transform:scale(.55); opacity:.75; }
        100% { transform:scale(1.7); opacity:0; }
      }

      .dark-popup .leaflet-popup-content-wrapper {
        background:rgba(15,23,42,.97); color:#e2e8f0;
        border-radius:10px; box-shadow:0 6px 24px rgba(0,0,0,.55);
        border:1px solid #1e293b;
        backdrop-filter:blur(12px); -webkit-backdrop-filter:blur(12px);
      }
      .dark-popup .leaflet-popup-tip { background:rgba(15,23,42,.97); border:1px solid #1e293b; }
      .dark-popup .leaflet-popup-content {
        margin:10px 12px; font-size:12px; line-height:1.5;
        font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;
        min-width:170px;
      }
      .dark-popup .leaflet-popup-close-button { color:#64748b; font-size:18px; padding:6px 8px 0 0; }
      .dark-popup .leaflet-popup-close-button:hover { color:#f1f5f9; }

      .pp-head { display:flex; align-items:center; gap:6px; margin-bottom:6px; }
      .pp-badge {
        display:inline-block; width:16px; height:16px;
        border-radius:50%; color:#fff; font-size:10px; font-weight:700;
        text-align:center; line-height:14px;
        border:1.5px solid rgba(255,255,255,.35); flex:0 0 auto;
      }
      .pp-trip { font-size:10px; color:#64748b; letter-spacing:.5px; }
      .pp-time { font-size:13px; font-weight:600; color:#f8fafc; margin-bottom:6px; font-variant-numeric:tabular-nums; }
      .pp-row { display:flex; justify-content:space-between; gap:14px; line-height:1.7; }
      .pp-row span { color:#94a3b8; font-size:11px; flex:0 0 auto; }
      .pp-row b { color:#f1f5f9; font-weight:600; font-size:12px; font-variant-numeric:tabular-nums; text-align:right; }
      .pp-row b.sp-0  { color:#64748b; }
      .pp-row b.sp-lo { color:#22c55e; }
      .pp-row b.sp-md { color:#3b82f6; }
      .pp-row b.sp-hi { color:#f59e0b; }
      .pp-row b.sp-mx { color:#ef4444; }
    `, `
      var tracks = ${JSON.stringify(tracksJson)};
      var curPos = ${curJson ? JSON.stringify(curJson) : 'null'};
      var SUBS = ${JSON.stringify(AMAP_SUBS)};
      var CAR_SVG = ${JSON.stringify(CAR_SVG)};

      var map, baseLayer, labelLayer, globalActiveDot = null, trackLayers = [];

      function setBasemap(mode) {
        if (baseLayer)  { map.removeLayer(baseLayer);  baseLayer = null; }
        if (labelLayer) { map.removeLayer(labelLayer); labelLayer = null; }
        var opts = { subdomains: SUBS, maxZoom: 19, minZoom: 3 };
        if (mode === 'satellite') {
          baseLayer = L.tileLayer('${AMAP.satellite}', opts);
        } else if (mode === 'hybrid') {
          baseLayer  = L.tileLayer('${AMAP.satellite}',   opts);
          labelLayer = L.tileLayer('${AMAP.hybridLabel}', opts);
        } else {
          baseLayer = L.tileLayer('${AMAP.street}', opts);
        }
        baseLayer.addTo(map);
        if (labelLayer) labelLayer.addTo(map);
        document.querySelectorAll('.basemap-switch button').forEach(function(b) {
          b.classList.toggle('active', b.dataset.mode === mode);
        });
        try { parent.postMessage({ type: 'tailg-basemap', mode: mode }, '*'); } catch (e) {}
        setTimeout(function() { map.invalidateSize(); }, 50);
      }

      function speedClass(s) {
        s = Number(s) || 0;
        if (s === 0) return 'sp-0';
        if (s < 10)  return 'sp-lo';
        if (s < 25)  return 'sp-md';
        if (s < 40)  return 'sp-hi';
        return 'sp-mx';
      }
      function esc(s) {
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
      }
      function findClosestIndex(points, target) {
        var minDist = Infinity, minIdx = 0;
        for (var i = 0; i < points.length; i++) {
          var dLat = points[i].latlng[0] - target.lat;
          var dLng = points[i].latlng[1] - target.lng;
          var d = dLat * dLat + dLng * dLng;
          if (d < minDist) { minDist = d; minIdx = i; }
        }
        return minIdx;
      }
      function showPointInfo(t, pts, pointIdx) {
        var p = pts[pointIdx];
        if (!p) return;
        if (globalActiveDot) map.removeLayer(globalActiveDot);
        globalActiveDot = L.circleMarker(p.latlng, {
          radius: 8, color: '#fff', weight: 3,
          fillColor: t.color, fillOpacity: 1, zIndexOffset: 2000
        }).addTo(map);
        var timeStr = p.time ? String(p.time).slice(11, 19) : '--';
        var html = '<div class="pp-head">' +
            '<span class="pp-badge" style="background:' + t.color + '">' + (t.index + 1) + '</span>' +
            '<span class="pp-trip">第 ' + (t.index + 1) + ' 段 · ' + (pointIdx + 1) + '/' + pts.length + '</span>' +
          '</div>' +
          '<div class="pp-time">' + esc(timeStr) + '</div>' +
          '<div class="pp-row"><span>速度</span>' +
            '<b class="' + speedClass(p.speed) + '">' + Number(p.speed).toFixed(0) + ' km/h</b></div>' +
          '<div class="pp-row"><span>方向</span>' +
            '<b>' + Number(p.heading).toFixed(0) + '°</b></div>';
        L.popup({
          className: 'dark-popup', closeButton: true, autoPan: true,
          offset: [0, -6], maxWidth: 260
        }).setLatLng(p.latlng).setContent(html).openOn(map);
      }
      function highlightTrack(index) {
        trackLayers.forEach(function(o, i) {
          if (!o.line) return;
          if (index < 0) {
            o.line.setStyle({ weight: 5, opacity: 0.85 });
            if (o.startMarker) o.startMarker.setOpacity(1);
            if (o.endMarker) o.endMarker.setStyle({ opacity: 1, fillOpacity: 1 });
          } else if (i === index) {
            o.line.setStyle({ weight: 8, opacity: 1 });
            if (o.line.bringToFront) o.line.bringToFront();
            if (o.startMarker) o.startMarker.setOpacity(1);
            if (o.endMarker) o.endMarker.setStyle({ opacity: 1, fillOpacity: 1 });
          } else {
            o.line.setStyle({ weight: 4, opacity: 0.12 });
            if (o.startMarker) o.startMarker.setOpacity(0.25);
            if (o.endMarker) o.endMarker.setStyle({ opacity: 0.25, fillOpacity: 0.25 });
          }
        });
      }
      window.addEventListener('message', function(e) {
        if (!e.data || e.data.type !== 'tailg-highlight') return;
        var idx = Number(e.data.index);
        if (!isNaN(idx)) highlightTrack(idx);
      });

      function init() {
        map = L.map('map', {
          zoomControl: true, attributionControl: false, preferCanvas: true
        }).setView([32.0, 118.78], 11);
        setBasemap('${mode}');
        var allBounds = [];

        tracks.forEach(function(t) {
          var pts = t.points;
          if (pts.length === 0) return;
          var latlngs = pts.map(function(p) { return p.latlng; });
          allBounds = allBounds.concat(latlngs);

          var polyline = L.polyline(latlngs, {
            color: t.color, weight: 5, opacity: 0.85,
            lineJoin: 'round', lineCap: 'round'
          }).addTo(map);

          var startMarker = L.marker(latlngs[0], {
            icon: L.divIcon({
              className: '',
              html: '<div style="background:' + t.color + ';color:#fff;border:2px solid #fff;' +
                    'width:22px;height:22px;line-height:18px;text-align:center;' +
                    'border-radius:50%;font-size:11px;font-weight:700;' +
                    'box-shadow:0 1px 4px rgba(0,0,0,.45)">' + (t.index + 1) + '</div>',
              iconSize: [22, 22], iconAnchor: [11, 11]
            })
          }).addTo(map);

          var endMarker = L.circleMarker(latlngs[latlngs.length - 1], {
            radius: 6, color: '#fff', weight: 2,
            fillColor: t.color, fillOpacity: 1
          }).addTo(map);

          startMarker.on('click', function(e) {
            L.DomEvent.stopPropagation(e);
            showPointInfo(t, pts, 0);
          });
          endMarker.on('click', function(e) {
            L.DomEvent.stopPropagation(e);
            showPointInfo(t, pts, pts.length - 1);
          });
          polyline.on('click', function(e) {
            L.DomEvent.stopPropagation(e);
            showPointInfo(t, pts, findClosestIndex(pts, e.latlng));
          });

          trackLayers.push({
            index: t.index, line: polyline,
            startMarker: startMarker, endMarker: endMarker
          });
        });
        trackLayers.sort(function(a, b) { return a.index - b.index; });

        if (curPos) {
          var curIcon = L.divIcon({
            className: '',
            html: '<div class="cur-marker"><div class="cur-marker-pulse"></div>' +
                  '<div class="cur-marker-dot">' + CAR_SVG + '</div></div>',
            iconSize: [40, 40], iconAnchor: [20, 20]
          });
          L.marker([curPos.lat, curPos.lng], { icon: curIcon, zIndexOffset: 3000 })
            .addTo(map)
            .bindTooltip('当前位置', { direction: 'top', offset: [0, -20] });
          allBounds.push([curPos.lat, curPos.lng]);
        }

        if (allBounds.length > 0) {
          map.fitBounds(L.latLngBounds(allBounds), { padding: [40, 40], maxZoom: 16 });
        } else if (curPos) {
          map.setView([curPos.lat, curPos.lng], 16);
        }

        document.querySelectorAll('.basemap-switch button').forEach(function(btn) {
          btn.addEventListener('click', function() { setBasemap(btn.dataset.mode); });
        });
        setTimeout(function() { map.invalidateSize(); }, 50);
        setTimeout(function() { map.invalidateSize(); }, 200);
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
      } else {
        init();
      }
    `, mode);
}

/* ============================================================
 * iframe 通用外壳
 * ============================================================ */
function iframeShell(css, js, mode) {
    const switchHtml = mode !== undefined ? `
      <div class="basemap-switch">
        <button data-mode="street"    class="${mode === 'street' ? 'active' : ''}">标准</button>
        <button data-mode="satellite" class="${mode === 'satellite' ? 'active' : ''}">卫星</button>
        <button data-mode="hybrid"    class="${mode === 'hybrid' ? 'active' : ''}">卫星+路网</button>
      </div>` : '';

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="${LEAFLET_CSS}">
<style>${css}</style>
</head>
<body>
<div id="map"></div>
${switchHtml}
<script src="${LEAFLET_JS}"><\/script>
<script>(function(){${js}})();<\/script>
</body>
</html>`;
}

function tileLayerCode(mode) {
    const opts = `{subdomains:${JSON.stringify(AMAP_SUBS)}, maxZoom:19, minZoom:3}`;
    if (mode === 'satellite') return `L.tileLayer('${AMAP.satellite}', ${opts}).addTo(map);`;
    if (mode === 'hybrid') {
        return `L.tileLayer('${AMAP.satellite}', ${opts}).addTo(map);
                L.tileLayer('${AMAP.hybridLabel}', ${opts}).addTo(map);`;
    }
    return `L.tileLayer('${AMAP.street}', ${opts}).addTo(map);`;
}

/* ============================================================
 * 默认地图卡片
 * ============================================================ */
const LitElement = Object.getPrototypeOf(customElements.get("ha-panel-lovelace"));
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

const TRACKER_RE = /^device_tracker\.tailg_([a-z0-9]{4})_location$/;

class TailgMapCard extends LitElement {
    static get properties() {
        return {
            hass:   { type: Object },
            config: { type: Object },
            _iframeSrcdoc: { type: String },
        };
    }

    static get styles() {
        return css`
            :host { display: block; }
            ha-card {
                padding: 0; overflow: hidden;
                background: var(--ha-card-background, var(--card-background-color, #fff));
                border-radius: var(--ha-card-border-radius, 12px);
                position: relative;
            }
            .map-wrap {
                width: 100%; height: 260px;
                position: relative; overflow: hidden;
                background: #e5e7eb;
            }
            iframe { width: 100%; height: 100%; border: none; display: block; pointer-events: none; }

            .overlay {
                position: absolute; inset: 0; z-index: 10;
                display: flex; flex-direction: column;
                justify-content: space-between;
                pointer-events: auto; cursor: pointer;
                padding: 10px;
                background: linear-gradient(rgba(0,0,0,.55), transparent 40%, transparent 60%, rgba(0,0,0,.55));
            }
            .top-row {
                display: flex; align-items: flex-start;
                justify-content: space-between; gap: 8px;
                min-width: 0;
            }
            .top-bar {
                display: flex; flex-direction: column; gap: 4px;
                align-items: flex-start;
                min-width: 0; flex: 1 1 auto;
            }
            .row1 {
                display: flex; align-items: center; gap: 6px;
                color: #fff; font-size: 13px; font-weight: 600;
                text-shadow: 0 1px 3px rgba(0,0,0,.6);
            }
            .row2 {
                color: #e2e8f0; font-size: 11px;
                text-shadow: 0 1px 2px rgba(0,0,0,.6);
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                max-width: 100%;
            }
            .dot {
                width: 8px; height: 8px; border-radius: 50%;
                background: #94a3b8; flex: 0 0 auto;
                box-shadow: 0 0 0 3px rgba(255,255,255,.25);
            }
            .dot.online { background: #22c55e; }

            .hint {
                display: inline-block; flex: 0 0 auto;
                background: rgba(15,23,42,.75); color: #e2e8f0;
                padding: 4px 8px; border-radius: 6px;
                font-size: 10px; backdrop-filter: blur(6px);
                pointer-events: none; white-space: nowrap;
            }
            .bottom-bar {
                display: flex; align-items: center; gap: 6px;
                color: #fff; font-size: 12px;
                text-shadow: 0 1px 3px rgba(0,0,0,.6);
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
                max-width: 100%;
            }
            .bottom-bar ha-icon { --mdc-icon-size: 14px; flex: 0 0 auto; opacity: .9; }
            .bottom-bar span {
                overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
            }
            .error-box {
                display: flex; align-items: center; justify-content: center;
                height: 260px; color: #ef4444; font-size: 13px;
            }
        `;
    }

    setConfig(config) { this.config = config || {}; }

    static getStubConfig(hass) {
        const tracker = hass
            ? (Object.keys(hass.states).find(id => TRACKER_RE.test(id)) || "")
            : "";
        return { type: "custom:tailg-map-card", entity: tracker };
    }

    getCardSize() { return 5; }

    constructor() {
        super();
        this._iframeSrcdoc = "";
        this._lastLat = null;
        this._lastLng = null;
        this._error = "";
        this._opening = false;
    }

    updated(changedProps) {
        if (changedProps.has("hass") && this.hass) this._renderIframe();
    }

    _getTrackerEntityId() {
        if (this.config.entity) return this.config.entity;
        return Object.keys(this.hass.states).find(id => TRACKER_RE.test(id)) || "";
    }

    _renderIframe() {
        const eid = this._getTrackerEntityId();
        if (!eid) { this._error = "未找到 device_tracker 实体"; return; }
        const st = this.hass.states[eid];
        if (!st) { this._error = "实体不存在: " + eid; return; }
        const lat = Number(st.attributes.latitude);
        const lng = Number(st.attributes.longitude);
        if (isNaN(lat) || isNaN(lng)) { this._error = "实体缺少经纬度"; return; }

        if (this._error) this._error = "";

        if (!this._iframeSrcdoc || this._lastLat === null ||
            Math.abs(this._lastLat - lat) > 0.0001 ||
            Math.abs(this._lastLng - lng) > 0.0001) {
            this._lastLat = lat;
            this._lastLng = lng;
            this._iframeSrcdoc = buildIframeHtml("street", lng, lat);
        }
    }

    _openHistory() {
        if (this._opening) return;
        const existing = document.querySelector('tailg-history-dialog');
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        this._opening = true;
        try {
            const dialog = document.createElement("tailg-history-dialog");
            dialog.hass = this.hass;
            dialog.addEventListener("dialog-closed", () => {
                if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
                this._opening = false;
            });
            document.body.appendChild(dialog);
        } catch (err) {
            console.error("[tailg-map] 打开历史轨迹失败", err);
            this._opening = false;
        }
    }

    render() {
        if (this._error) return html`<ha-card><div class="error-box">${this._error}</div></ha-card>`;
        const eid = this._getTrackerEntityId();
        const st = eid ? this.hass.states[eid] : null;
        const attrs = st ? st.attributes : {};
        const online = !!attrs.online;
        const battery = attrs.battery != null ? attrs.battery + "%" : "--";
        const voltage = attrs.voltage != null ? attrs.voltage + " V" : "--";
        const address = attrs.address || attrs.location || attrs.address_name || "";

        return html`
            <ha-card>
                <div class="map-wrap">
                    ${this._iframeSrcdoc
                        ? html`<iframe .srcdoc=${this._iframeSrcdoc} scrolling="no"></iframe>`
                        : html`<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8">加载中…</div>`}
                    <div class="overlay" @click=${this._openHistory}>
                        <div class="top-row">
                            <div class="top-bar">
                                <div class="row1">
                                    <span class="dot ${online ? 'online' : ''}"></span>
                                    ${online ? "在线" : "离线"} · ${battery} · ${voltage}
                                </div>
                                <div class="row2">${attrs.gps_report_time || ""}</div>
                            </div>
                            <div class="hint">点击查看历史轨迹</div>
                        </div>
                        ${address ? html`
                            <div class="bottom-bar">
                                <ha-icon icon="mdi:map-marker"></ha-icon>
                                <span>${address}</span>
                            </div>` : ''}
                    </div>
                </div>
            </ha-card>
        `;
    }
}

customElements.define("tailg-map-card", TailgMapCard);

/* ============================================================
 * 历史轨迹对话框
 * ============================================================ */
class TailgHistoryDialog extends LitElement {
    static get properties() {
        return {
            hass: { type: Object },
            _month:    { type: String },
            _months:   { type: Array },
            _days:     { type: Array },
            _activeTrip: { type: Number },
            _loading:  { type: Boolean },
            _baseMode: { type: String },
            _iframeSrcdoc: { type: String },
            _trackLoading: { type: Boolean },
            _trackLoaded:  { type: Number },
            _trackTotal:   { type: Number },
        };
    }

    static get styles() {
        return css`
            :host { display: block; }
            .dialog {
                position: fixed; top: 0; left: 0;
                width: 100vw; height: 100vh; z-index: 9999;
                display: flex; flex-direction: column;
                background: var(--primary-background-color, #0f172a);
                color: var(--primary-text-color);
                overflow: hidden; box-sizing: border-box;
            }
            .head {
                display: flex; align-items: center; gap: 8px;
                padding: 8px 12px;
                border-bottom: 1px solid var(--divider-color);
                flex: 0 0 48px; height: 48px; box-sizing: border-box;
                background: var(--primary-background-color, #0f172a);
            }
            .head h2 {
                margin: 0; font-size: 14px; font-weight: 600;
                flex: 1; min-width: 0;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            }
            .head .close {
                appearance: none; border: none; background: transparent;
                color: inherit; cursor: pointer;
                width: 32px; height: 32px;
                display: flex; align-items: center; justify-content: center;
                border-radius: 8px; flex: 0 0 auto;
            }
            .head .close:hover { background: var(--divider-color); }
            .head .close ha-icon { --mdc-icon-size: 18px; }

            .map-wrap {
                position: relative; flex: 0 0 auto;
                width: 100%; height: 45vh;
                overflow: hidden; background: #e5e7eb;
            }
            .map-wrap iframe { width: 100%; height: 100%; border: none; display: block; }

            .track-loading {
                position: absolute; inset: 0;
                z-index: 500;
                display: flex; flex-direction: column;
                align-items: center; justify-content: center;
                gap: 10px;
                background: rgba(15,23,42,.55);
                backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px);
                color: #f1f5f9;
                pointer-events: none;
            }
            .track-loading .spinner {
                width: 32px; height: 32px;
                border: 3px solid rgba(255,255,255,.25);
                border-top-color: #3b82f6;
                border-radius: 50%;
                animation: tlSpin .8s linear infinite;
            }
            .track-loading .label {
                font-size: 13px; font-weight: 600;
                font-variant-numeric: tabular-nums;
                text-shadow: 0 1px 3px rgba(0,0,0,.6);
            }
            .track-loading .bar {
                width: 160px; height: 4px;
                background: rgba(255,255,255,.2);
                border-radius: 2px; overflow: hidden;
            }
            .track-loading .bar > i {
                display: block; height: 100%;
                background: #3b82f6;
                border-radius: 2px;
                transition: width .2s;
            }
            @keyframes tlSpin { to { transform: rotate(360deg); } }

            .list-wrap {
                flex: 1 1 auto; min-height: 0;
                display: flex; flex-direction: column;
                background: var(--secondary-background-color, rgba(0,0,0,.04));
                overflow: hidden;
                border-top: 1px solid var(--divider-color);
            }
            .side-head {
                padding: 8px 12px;
                border-bottom: 1px solid var(--divider-color);
                display: flex; gap: 10px;
                flex: 0 0 auto; align-items: center;
            }
            .month-select {
                flex: 0 0 auto;
                padding: 6px 10px; border-radius: 8px;
                border: 1px solid var(--divider-color);
                background: var(--card-background-color);
                color: var(--primary-text-color);
                font-size: 13px; font-family: inherit;
                min-width: 110px;
            }
            .row-stats {
                display: flex; align-items: baseline; gap: 0;
                font-variant-numeric: tabular-nums;
                font-feature-settings: "tnum";
                white-space: nowrap;
            }
            .row-stats > span { text-align: right; flex: 0 0 auto; }
            .row-stats > .col-trips { width: 50px; }
            .row-stats > .col-km    { width: 66px; }
            .row-stats > .col-dur   { width: 77px; }
            .month-stats {
                margin-left: auto;
                font-size: 12px;
                color: var(--secondary-text-color);
                font-weight: 600;
            }
            .day-list {
                flex: 1 1 auto; overflow-y: auto;
                padding: 6px 0 20px; min-height: 0;
            }
            .day-group {
                margin: 4px 8px; border-radius: 10px;
                background: var(--card-background-color);
                border: 1px solid transparent; overflow: hidden;
            }
            .day-group.selected { border-color: var(--primary-color); }
            .day-head {
                display: flex; align-items: center; justify-content: space-between;
                padding: 10px 12px; cursor: pointer;
                user-select: none; font-size: 13px; gap: 8px;
            }
            .day-head:hover { background: var(--divider-color); }
            .day-group.selected .day-head {
                background: var(--primary-color);
                color: var(--text-primary-color, #fff);
            }
            .day-head-left {
                display: flex; align-items: baseline; gap: 6px;
                flex: 0 0 auto; white-space: nowrap;
            }
            .day-date {
                font-weight: 600;
                font-variant-numeric: tabular-nums;
                font-feature-settings: "tnum";
                white-space: nowrap;
            }
            .day-week { font-size: 11px; opacity: .7; white-space: nowrap; }
            .day-head-right {
                display: flex; align-items: baseline; gap: 0;
                flex: 0 0 auto; margin-left: auto;
                font-variant-numeric: tabular-nums;
                font-feature-settings: "tnum";
                white-space: nowrap;
            }
            .day-head-right > span {
                font-size: 11px; opacity: .85;
                text-align: right; white-space: nowrap; flex: 0 0 auto;
            }
            .day-trips { display: none; padding: 4px 0; }
            .day-group.expanded .day-trips { display: block; }
            .trip {
                display: flex; gap: 8px; align-items: center;
                padding: 7px 12px; cursor: pointer; font-size: 12px;
                transition: background .15s;
                border-left: 3px solid transparent;
            }
            .trip:hover { background: var(--divider-color); }
            .trip.active {
                background: var(--divider-color);
                border-left-color: var(--primary-color);
            }
            .trip-dot {
                flex: 0 0 18px; width: 18px; height: 18px;
                border-radius: 50%; color: #fff;
                font-size: 10px; font-weight: 700;
                text-align: center; line-height: 18px;
            }
            .trip-body { flex: 1; min-width: 0; }
            .trip-line1 { display: flex; justify-content: space-between; font-weight: 600; }
            .trip-line2 {
                display: flex; justify-content: space-between;
                font-size: 10px; opacity: .7; margin-top: 2px;
            }

            @media (min-width: 821px) {
                .dialog { flex-direction: row; }
                .map-wrap { order: 2; flex: 1 1 auto; height: 100%; width: auto; }
                .list-wrap {
                    order: 1; width: 420px; flex: 0 0 420px; height: 100%;
                    border-top: none;
                    border-right: 1px solid var(--divider-color);
                }
                .head {
                    position: absolute; top: 0; left: 0; right: 0;
                    z-index: 100;
                    height: 54px; flex: 0 0 54px;
                    padding: 10px 16px;
                }
                .head h2 { font-size: 16px; }
                .head .close { width: 36px; height: 36px; }
                .map-wrap, .list-wrap { padding-top: 54px; box-sizing: border-box; }
                .side-head { padding: 10px 14px; gap: 12px; }
                .month-stats { font-size: 13px; }
                .row-stats > .col-trips { width: 52px; }
                .row-stats > .col-km    { width: 76px; }
                .row-stats > .col-dur   { width: 88px; }
                .day-head { font-size: 13px; padding: 12px 14px; gap: 10px; }
            }
            @media (max-width: 380px) {
                .head h2 { font-size: 13px; }
                .side-head { padding: 6px 10px; gap: 8px; }
                .month-select { font-size: 12px; padding: 5px 8px; min-width: 96px; }
                .month-stats { font-size: 11px; }
                .row-stats > .col-trips { width: 38px; }
                .row-stats > .col-km    { width: 56px; }
                .row-stats > .col-dur   { width: 66px; }
                .day-head { padding: 9px 10px; font-size: 12px; gap: 6px; }
                .day-week { display: none; }
                .day-head-right > span { font-size: 10px; }
            }
        `;
    }

    set hass(hass) { this._hass = hass; }
    get hass() { return this._hass; }

    constructor() {
        super();
        this._month = ""; this._months = []; this._days = [];
        this._activeTrip = -1; this._loading = false;
        this._baseMode = "street";
        this._iframeSrcdoc = "";
        this._currentTracks = [];
        this._historyPushed = false;
        this._onPopState = null;
        this._onBasemapMsg = null;
        this._trackLoading = false;
        this._trackLoaded = 0;
        this._trackTotal = 0;
    }

    connectedCallback() {
        super.connectedCallback();
        try {
            history.pushState({ tailgDialog: true }, '');
            this._historyPushed = true;
        } catch (e) { console.warn('[tailg-history] pushState 失败', e); }

        this._onPopState = () => {
            if (this._historyPushed) {
                this._historyPushed = false;
                this._closeInternal();
            }
        };
        window.addEventListener('popstate', this._onPopState);

        // 同步 iframe 内的底图模式切换
        this._onBasemapMsg = (e) => {
            if (e.data && e.data.type === 'tailg-basemap' && e.data.mode) {
                this._baseMode = e.data.mode;
            }
        };
        window.addEventListener('message', this._onBasemapMsg);
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        if (this._onPopState) {
            window.removeEventListener('popstate', this._onPopState);
            this._onPopState = null;
        }
        if (this._onBasemapMsg) {
            window.removeEventListener('message', this._onBasemapMsg);
            this._onBasemapMsg = null;
        }
    }

    _closeInternal() {
        this.dispatchEvent(new CustomEvent("dialog-closed", { bubbles: true }));
    }

    async firstUpdated() {
        this._months = getRecentMonths(10);
        this._month = this._months[0];
        this._focusCurrent();            // ① 先展示当前车辆位置
        await this._loadMonth(this._month); // ② 加载月份（自动选中最近一天 / 无行程清空）
    }

    /** 只展示当前车辆位置（无轨迹） */
    _focusCurrent() {
        this._currentTracks = [];
        this._iframeSrcdoc = buildHistoryIframeHtml(this._baseMode, [], this._getCurrentPosition());
    }

    async _loadMonth(month) {
        this._loading = true;
        try {
            const resp = await this.hass.callApi("GET", `tailg/month?month=${encodeURIComponent(month)}`);
            this._days = this._groupDays(resp.data || []);
            this._activeTrip = -1;
            this.requestUpdate();
            await this.updateComplete;

            if (this._days.length > 0) {
                await this._selectDay(this._days[0].date);
            } else {
                this._focusCurrent();
                this.requestUpdate();
            }
        } catch (err) {
            console.error("[tailg-history] 加载月份失败", err);
        } finally { this._loading = false; }
    }

    _groupDays(data) {
        const out = [];
        data.forEach(d => {
            const trips = d.deviceTravelDtoList || [];
            if (!trips.length) return;
            let mileage = 0, duration = 0;
            trips.forEach(t => {
                mileage += Number(t.mileage || 0);
                duration += this._duration(t);
            });
            out.push({
                date: d.travelDate, totalMileage: mileage, totalDuration: duration,
                trips: trips.map(t => ({
                    id: t.deviceTravelId,
                    start_time: t.startTime, end_time: t.endTime,
                    mileage: Number(t.mileage || 0),
                    duration_sec: this._duration(t),
                    average_speed: Number(t.averageSpeed || 0),
                    max_speed: Number(t.maxSpeed || 0),
                })),
            });
        });
        return out;
    }

    _duration(t) {
        return (Number(t.days) || 0) * 86400
             + (Number(t.hours) || 0) * 3600
             + (Number(t.min) || 0) * 60
             + (Number(t.sec) || 0);
    }

    _monthSummary() {
        if (!this._days?.length) return { days: 0, trips: 0, km: '0 km', dur: '0秒' };
        let mileage = 0, dur = 0, trips = 0;
        this._days.forEach(d => {
            mileage += d.totalMileage;
            dur += d.totalDuration;
            trips += d.trips.length;
        });
        return { days: this._days.length, trips, km: fmtKm(mileage), dur: fmtDur(dur) };
    }

    async _selectDay(date) {
        const day = this._days.find(d => d.date === date);
        if (!day) {
            this._activeTrip = -1;
            this._focusCurrent();
            return;
        }
        this._activeTrip = -1;
        this.shadowRoot.querySelectorAll(".day-group").forEach(g => {
            g.classList.toggle("selected", g.dataset.date === date);
            g.classList.toggle("expanded", g.dataset.date === date);
        });
        await this._loadDayTracks(day);
    }

    _getTrackerEntityId() {
        return Object.keys(this.hass.states).find(id => TRACKER_RE.test(id)) || "";
    }

    _getCurrentPosition() {
        const eid = this._getTrackerEntityId();
        if (!eid) return null;
        const st = this.hass.states[eid];
        if (!st) return null;
        const lat = Number(st.attributes.latitude);
        const lng = Number(st.attributes.longitude);
        if (isNaN(lat) || isNaN(lng)) return null;
        return { lat, lng };
    }

    async _loadDayTracks(day) {
        const tripsReversed = day.trips.slice().reverse();
        const total = tripsReversed.length;
    
        // 开始加载：先重置为「仅当前位置」+ 显示进度浮层
        this._trackLoading = true;
        this._trackLoaded = 0;
        this._trackTotal = total;
        this._activeTrip = -1;
    
        this._currentTracks = [];
        this._iframeSrcdoc = buildHistoryIframeHtml(this._baseMode, [], this._getCurrentPosition());
        this.requestUpdate();
        await this.updateComplete;
    
        // 并发拉取所有轨迹段
        const results = await Promise.all(tripsReversed.map(async (t, i) => {
            let points = [];
            try {
                const resp = await this.hass.callApi("GET", `tailg/day?id=${encodeURIComponent(t.id)}`);
                points = resp.data || [];
            } catch (err) {
                console.warn("[tailg-history] 拉取轨迹失败", t.id, err);
            }
            this._trackLoaded++;
            this.requestUpdate();
            return points.length ? { color: colorOf(i), index: i, points } : null;
        }));
    
        const allTracks = results.filter(Boolean);
    
        this._currentTracks = allTracks;
        this._iframeSrcdoc = buildHistoryIframeHtml(this._baseMode, allTracks, this._getCurrentPosition());
        this._trackLoading = false;
        this.requestUpdate();
    }

    _onTripClick(newIndex, e) {
        e.stopPropagation();
        const next = this._activeTrip === newIndex ? -1 : newIndex;
        this._activeTrip = next;
        const iframe = this.shadowRoot.querySelector(".map-wrap iframe");
        if (iframe?.contentWindow) {
            iframe.contentWindow.postMessage({ type: 'tailg-highlight', index: next }, '*');
        }
    }

    _close() {
        if (this._historyPushed) {
            this._historyPushed = false;
            try { history.back(); } catch (e) {}
            setTimeout(() => {
                if (this.parentNode) this.dispatchEvent(new CustomEvent("dialog-closed", { bubbles: true }));
            }, 100);
            return;
        }
        this.dispatchEvent(new CustomEvent("dialog-closed", { bubbles: true }));
    }

    render() {
        const m = this._monthSummary();
        const pct = this._trackTotal > 0
            ? Math.round(this._trackLoaded / this._trackTotal * 100)
            : 0;

        return html`
            <div class="dialog">
                <div class="head">
                    <h2>历史轨迹</h2>
                    <button class="close" @click=${this._close}>
                        <ha-icon icon="mdi:close"></ha-icon>
                    </button>
                </div>

                <div class="map-wrap">
                    ${this._iframeSrcdoc
                        ? html`<iframe .srcdoc=${this._iframeSrcdoc} scrolling="no"></iframe>`
                        : html`<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8">加载中…</div>`}
                    ${this._trackLoading ? html`
                        <div class="track-loading">
                            <div class="spinner"></div>
                            <div class="label">
                                ${this._trackTotal > 0
                                    ? `加载轨迹 ${this._trackLoaded}/${this._trackTotal}`
                                    : '加载轨迹…'}
                            </div>
                            ${this._trackTotal > 0 ? html`
                                <div class="bar"><i style="width:${pct}%"></i></div>` : ''}
                        </div>` : ''}
                </div>

                <div class="list-wrap">
                    <div class="side-head">
                        <select class="month-select" .value=${this._month}
                                @change=${e => { this._month = e.target.value; this._loadMonth(this._month); }}>
                            ${this._months.map(mo => html`
                                <option value=${mo} ?selected=${mo === this._month}>${mo}</option>
                            `)}
                        </select>
                        ${this._days?.length ? html`
                            <div class="month-stats row-stats">
                                <span>${m.days} 天</span>
                                <span class="col-trips">${m.trips} 段</span>
                                <span class="col-km">${m.km}</span>
                                <span class="col-dur">${m.dur}</span>
                            </div>` : ''}
                    </div>

                    <div class="day-list">
                        ${this._days.length === 0
                            ? html`<div style="padding:20px;text-align:center;opacity:.5;font-size:12px">
                                     ${this._loading ? "加载中…" : "该月无行程"}
                                   </div>`
                            : this._days.map(d => this._renderDayGroup(d))}
                    </div>
                </div>
            </div>
        `;
    }

    _renderDayGroup(d) {
        const p = parseDateParts(d.date);
        const tripsReversed = d.trips.slice().reverse();

        return html`
            <div class="day-group" data-date=${d.date}>
                <div class="day-head" @click=${() => this._selectDay(d.date)}>
                    <div class="day-head-left">
                        <span class="day-date">${p.mmdd}</span>
                        <span class="day-week">${p.week}</span>
                    </div>
                    <div class="day-head-right row-stats">
                        <span class="col-trips">${d.trips.length} 段</span>
                        <span class="col-km">${fmtKm(d.totalMileage)}</span>
                        <span class="col-dur">${fmtDur(d.totalDuration)}</span>
                    </div>
                </div>
                <div class="day-trips">
                    ${tripsReversed.map((t, newIndex) => html`
                        <div class="trip ${this._activeTrip === newIndex ? 'active' : ''}"
                             @click=${e => this._onTripClick(newIndex, e)}>
                            <div class="trip-dot" style="background:${colorOf(newIndex)}">${newIndex + 1}</div>
                            <div class="trip-body">
                                <div class="trip-line1">
                                    <span>${hhmm(t.start_time)} - ${hhmm(t.end_time)}</span>
                                    <span>${fmtKm(t.mileage)}</span>
                                </div>
                                <div class="trip-line2">
                                    <span>${fmtDur(t.duration_sec)}</span>
                                    <span>极速 ${t.max_speed} / 均速 ${t.average_speed.toFixed(1)} km/h</span>
                                </div>
                            </div>
                        </div>
                    `)}
                </div>
            </div>
        `;
    }
}

customElements.define("tailg-history-dialog", TailgHistoryDialog);

window.customCards = window.customCards || [];
window.customCards.push({
    type: "tailg-map-card",
    name: "台铃地图卡片",
    description: "显示车辆最新位置，点击打开历史轨迹",
    preview: false,
});