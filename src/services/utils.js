/**
 * Canonical device type detection — single source of truth.
 * Priority order matches Tile.jsx runtime detection.
 */
export function getDeviceType(device) {
    if (!device) return 'unknown';
    const caps = device.capabilities || Object.keys(device.capabilitiesObj || {});

    if (caps.includes('homey_vacuum') || device.settings?.compositeType === 'vacuum') return 'vacuum';
    if (caps.includes('homey_lawn_mower') || device.settings?.compositeType === 'lawn_mower') return 'lawn-mower';
    if (device.settings?.compositeType === 'waste_collection' || caps.some(c => c.startsWith('waste_'))) return 'trash';
    if (caps.includes('posten_sensor')) return 'postal';
    if (caps.includes('windowcoverings_set')) return 'sunshade';
    if (caps.includes('homey_water_heater') || device.settings?.compositeType === 'water_heater') return 'water-heater';
    if (
        caps.includes('homey_ev_charger') ||
        device.settings?.compositeType === 'ev_charger' ||
        caps.includes('charging_button') ||
        device.virtualClass === 'evcharger' ||
        device.class === 'evcharger'
    ) return 'ev-charger';
    if (caps.includes('smart_plug_appliance') || device.settings?.compositeType === 'appliance') return 'appliance';
    if (caps.includes('person_presence') || device.class === 'presence') return 'presence';
    if (caps.includes('laundry') || device.settings?.compositeType === 'washer') return 'cleaning';
    if (device.class === 'speaker' || device.class === 'tv' || caps.includes('speaker_playing')) return 'media';
    if (caps.includes('sensor_flagg')) return 'flagday';
    if (caps.includes('fan_speed')) return 'fan';
    if (device.class === 'thermostat' || caps.includes('target_temperature')) return 'thermostat';
    if (device.class === 'light' || device.virtualClass === 'light' || caps.includes('dim')) return 'light';
    if (device.class === 'socket' || device.class === 'switch' || caps.includes('onoff')) return 'switch';
    if (device.class === 'sensor' || caps.some(c => c.startsWith('measure_'))) return 'sensor';
    return 'unknown';
}

/**
 * Finn en flis sin enhet med selvhelbreding: composite-ID-er (`composite:<haDeviceId>`)
 * blir ugyldige når HA re-registrerer enheten (ny device registry-UUID, sett ved
 * ESPHome-omregistrering aug 2026). Faller da tilbake til en lagret entity-ID
 * (stabil på tvers av re-registrering) og finner composite-enheten som eier den nå.
 */
export function resolveTileDevice(devices, deviceId, fallbackEntityId = null) {
    if (!deviceId) return undefined;
    const direct = devices.find(d => d.id === deviceId);
    if (direct) return direct;
    if (!fallbackEntityId) return undefined;
    return devices.find(d => d.entityIds?.includes(fallbackEntityId))
        || devices.find(d => d.id === fallbackEntityId);
}

// Local http services that nginx reverse-proxies under /svc/<port>/ so the
// HTTPS dashboard can reach them same-origin (avoids mixed-content blocking).
// Keep in sync with the /svc/<port>/ locations in config/nginx/dashboard.conf.
const PROXIED_SERVICE_PORTS = new Set(['8989', '7878', '8093', '8085', '5000', '1984']);

/**
 * Rewrites a configured local service URL (Sonarr/Radarr/qBittorrent/Frigate)
 * to its same-origin reverse-proxy path when the dashboard is served over
 * HTTPS. Over HTTP, or for any URL whose port isn't proxied, returns it
 * unchanged so external streams keep working.
 */
export function proxiedServiceUrl(url) {
    if (!url || typeof window === 'undefined' || window.location.protocol !== 'https:') return url;
    try {
        const u = new URL(url);
        if (u.protocol === 'http:' && PROXIED_SERVICE_PORTS.has(u.port)) {
            const tail = (u.pathname + u.search).replace(/\/$/, '');
            return `${window.location.origin}/svc/${u.port}${tail}`;
        }
    } catch (_) { /* not an absolute URL — leave as-is */ }
    return url;
}

// Utility functions
export const utils = {
    // Debounce function
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // Throttle function
    throttle(func, limit) {
        let inThrottle;
        return function (...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    },

    // Create SVG element
    createSVG(pathData, size = 24) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', pathData);
        svg.appendChild(path);

        return svg;
    },

    // Format temperature
    formatTemperature(value, unit = '°C') {
        return `${Math.round(value * 10) / 10}${unit}`;
    },

    // Format percentage
    formatPercentage(value) {
        return `${Math.round(value * 100)}%`;
    },

    // Format power
    formatPower(value) {
        if (value >= 1000) {
            return `${(value / 1000).toFixed(1)} kW`;
        }
        return `${Math.round(value)} W`;
    },

    // Get battery level class
    getBatteryClass(level) {
        if (level >= 60) return 'high';
        if (level >= 30) return 'medium';
        return 'low';
    },

    // Show toast notification
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--color-bg-elevated);
            color: var(--color-text-primary);
            padding: 12px 24px;
            border-radius: var(--radius-md);
            box-shadow: var(--shadow-xl);
            z-index: 10000;
            animation: slideUp 0.3s ease;
            border: 1px solid rgba(255, 255, 255, 0.1);
        `;

        if (type === 'success') {
            toast.style.borderColor = 'var(--color-success)';
        } else if (type === 'error') {
            toast.style.borderColor = 'var(--color-error)';
        }

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideDown 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    // Download JSON file
    downloadJSON(data, filename) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    },

    // Read JSON file
    async readJSONFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    resolve(data);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    },

    // Confirm dialog
    async confirm(message) {
        return new Promise((resolve) => {
            const result = window.confirm(message);
            resolve(result);
        });
    }
};

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideUp {
        from {
            opacity: 0;
            transform: translateX(-50%) translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
    }
    
    @keyframes slideDown {
        from {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
        }
        to {
            opacity: 0;
            transform: translateX(-50%) translateY(20px);
        }
    }
`;
document.head.appendChild(style);
