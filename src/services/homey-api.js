import { getDeviceType } from './utils.js';
import { MAX_RECONNECT_DELAY_MS } from '../constants.js';

// Homey API Client
class HomeyAPI {
    constructor() {
        this.baseUrl = null;
        this.token = null;
        this.devices = new Map();
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.pollingInterval = null;
        this.iconCache = new Map();
        this.fetchingIcons = new Set();
    }

    // Start polling for device updates (fallback for WebSocket)
    startPolling(interval = 5000) {
        this.stopPolling();
        console.log(`Starting polling every ${interval}ms`);

        this.pollingInterval = setInterval(async () => {
            try {
                await this.getDevices();
                // Dispatch event to notify UI to re-render
                window.dispatchEvent(new CustomEvent('homey:devices:refreshed'));
            } catch (error) {
                console.warn('Polling failed:', error);
            }
        }, interval);
    }

    // Stop polling
    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }
    }

    // Configure connection
    configure(ip, token) {
        // If running on localhost, use relative path to allow Vite proxy to handle CORS
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            this.baseUrl = '/homey-api';
            console.log('Using proxy for API requests (localhost detected)');
        } else {
            this.baseUrl = `http://${ip}`;
        }
        this.token = token;
    }

    // Test connection
    async testConnection() {
        try {
            const response = await this.request('/api/manager/system');
            return { success: true, data: response };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    // Get all devices
    async getDevices() {
        try {
            const devices = await this.request('/api/manager/devices/device');

            // Store devices in map
            this.devices.clear();
            Object.entries(devices).forEach(([id, device]) => {
                this.devices.set(id, device);
            });

            return Array.from(this.devices.values());
        } catch (error) {
            console.error('Failed to fetch devices:', error);
            throw error;
        }
    }

    // Get single device
    async getDevice(deviceId) {
        try {
            const device = await this.request(`/api/manager/devices/device/${deviceId}`);
            this.devices.set(deviceId, device);
            return device;
        } catch (error) {
            console.error(`Failed to fetch device ${deviceId}:`, error);
            throw error;
        }
    }

    // Set device capability
    async setCapability(deviceId, capability, value) {
        try {
            await this.request(
                `/api/manager/devices/device/${deviceId}/capability/${capability}`,
                'PUT',
                { value }
            );

            // Update local cache
            const device = this.devices.get(deviceId);
            if (device && device.capabilitiesObj) {
                device.capabilitiesObj[capability].value = value;
            }

            return true;
        } catch (error) {
            console.error(`Failed to set capability ${capability} for device ${deviceId}:`, error);
            throw error;
        }
    }

    // Toggle device (on/off)
    async toggleDevice(deviceId) {
        const device = this.devices.get(deviceId);
        if (!device) {
            throw new Error('Device not found');
        }

        const onoffCapability = device.capabilitiesObj?.onoff;
        if (!onoffCapability) {
            throw new Error('Device does not have onoff capability');
        }

        const newValue = !onoffCapability.value;
        await this.setCapability(deviceId, 'onoff', newValue);
        return newValue;
    }

    // Set dim level (0-1)
    async setDim(deviceId, value) {
        await this.setCapability(deviceId, 'dim', Math.max(0, Math.min(1, value)));
    }

    // Set target temperature
    async setTargetTemperature(deviceId, value) {
        await this.setCapability(deviceId, 'target_temperature', value);
    }

    // Connect WebSocket for real-time updates
    connectWebSocket() {
        if (!this.baseUrl || !this.token) {
            console.warn('Cannot connect WebSocket: missing configuration');
            return;
        }

        let wsUrl;
        if (this.baseUrl === '/homey-api') {
            // Use current host for proxy
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            wsUrl = `${protocol}//${window.location.host}/homey-api/api/manager/devices/device`;
        } else {
            wsUrl = this.baseUrl.replace('http://', 'ws://').replace('https://', 'wss://') + '/api/manager/devices/device';
        }

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('✅ WebSocket connected');
                this.reconnectAttempts = 0;

                // Authenticate
                this.ws.send(JSON.stringify({
                    type: 'authenticate',
                    token: this.token
                }));
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    this.handleWebSocketMessage(data);
                } catch (error) {
                    console.error('WebSocket message parse error:', error);
                }
            };

            this.ws.onerror = (error) => {
                console.warn('WebSocket connection error (expected if Homey API proxy requires different WS setup):', error);
            };

            this.ws.onclose = () => {
                console.log('WebSocket closed');
                this.attemptReconnect();
            };
        } catch (error) {
            console.error('Failed to create WebSocket:', error);
        }
    }

    // Handle WebSocket messages
    handleWebSocketMessage(data) {
        if (data.type === 'device.update') {
            const { id, capability, value } = data;
            const device = this.devices.get(id);

            if (device && device.capabilitiesObj && device.capabilitiesObj[capability]) {
                device.capabilitiesObj[capability].value = value;

                // Dispatch custom event for UI updates
                window.dispatchEvent(new CustomEvent('homey:device:update', {
                    detail: { deviceId: id, capability, value }
                }));
            }
        }
    }

    // Attempt to reconnect WebSocket
    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), MAX_RECONNECT_DELAY_MS);

            console.log(`Reconnecting WebSocket in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

            setTimeout(() => {
                this.connectWebSocket();
            }, delay);
        } else {
            console.error('Max reconnection attempts reached');
        }
    }

    // Disconnect WebSocket
    disconnectWebSocket() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    // Make HTTP request to Homey API
    async request(endpoint, method = 'GET', body = null) {
        if (this.baseUrl === null || !this.token) {
            throw new Error('Homey API not configured');
        }

        const options = {
            method,
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json'
            }
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(`${this.baseUrl}${endpoint}`, options);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText} (${endpoint})`);
        }

        return await response.json();
    }

    // Delegates to the shared utility — single source of truth in utils.js
    getDeviceType(device) {
        return getDeviceType(device);
    }

    getIconUrl(device) {
        if (!device.iconObj) return null;

        // If it's a full URL, return it
        if (device.iconObj.url && device.iconObj.url.startsWith('http')) {
            return device.iconObj.url;
        }

        const iconId = device.iconObj.id;

        // Return cached URL if available
        if (this.iconCache.has(iconId)) {
            return this.iconCache.get(iconId);
        }

        // Construct URL
        // If we have a base URL (remote connection), use it.
        // Otherwise (local proxy), use relative path.
        let url;
        if (device.iconObj.url) {
            url = device.iconObj.url;
        } else {
            url = `/api/manager/images/img/${iconId}`;
        }

        // Ensure it starts with / if it's relative
        if (!url.startsWith('http') && !url.startsWith('/')) {
            url = '/' + url;
        }

        // If we are using a proxy (baseUrl is empty), just return the relative path
        // The browser will handle the request to the proxy
        if (this.baseUrl === '') {
            return url;
        }

        // If we have a token, we might need to fetch it with auth headers and blob it
        // because standard <img> tags won't send the Bearer token.
        if (!this.fetchingIcons.has(iconId)) {
            this.fetchIcon(iconId, url);
        }

        return null; // Will trigger re-render when fetched
    }

    async fetchIcon(iconId, relativeUrl) {
        this.fetchingIcons.add(iconId);
        try {
            // Ensure relativeUrl starts with /
            const path = relativeUrl.startsWith('/') ? relativeUrl : `/${relativeUrl}`;
            const fullUrl = `${this.baseUrl}${path}`;

            const response = await fetch(fullUrl, {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                this.iconCache.set(iconId, url);
                window.dispatchEvent(new CustomEvent('homey:icon:loaded', { detail: { iconId } }));
            } else {
                console.warn(`Failed to fetch icon ${iconId} (${fullUrl}): ${response.status}`);
            }
        } catch (err) {
            console.warn('Failed to fetch icon', iconId, err);
        } finally {
            this.fetchingIcons.delete(iconId);
        }
    }

    // Get device icon based on type
    getDeviceIcon(device) {
        const type = this.getDeviceType(device);

        const icons = {
            light: '<path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41M12 7a5 5 0 100 10 5 5 0 000-10z"/>',
            switch: '<path d="M17 8l4 4m0 0l-4 4m4-4H3"/>',
            thermostat: '<path d="M14 14.76V3.5a2.5 2.5 0 00-5 0v11.26a4.5 4.5 0 105 0z"/>',
            sensor: '<path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M4.93 19.07L19.07 4.93"/>',
            unknown: '<path d="M12 2a10 10 0 100 20 10 10 0 000-20z"/>'
        };

        return icons[type] || icons.unknown;
    }
    // Get all images
    async getImages() {
        return await this.request('/api/manager/images/image');
    }

    // Get device image URL (authenticated)
    async getDeviceImageUrl(deviceId, imageId) {
        // Try to find the image in the global image list first to get the correct URL
        try {
            const images = await this.getImages();
            const image = Object.values(images).find(img => img.id === imageId);

            if (image && image.url) {
                // If we have a URL, use it. It might be relative.
                const relativeUrl = image.url;
                const path = relativeUrl.startsWith('/') ? relativeUrl : `/${relativeUrl}`;
                const fullUrl = this.baseUrl ? `${this.baseUrl}${path}` : path;

                // Fetch with auth to get blob
                const headers = {};
                if (this.token) {
                    headers['Authorization'] = `Bearer ${this.token}`;
                }

                const response = await fetch(fullUrl, { headers });
                if (!response.ok) throw new Error(`Failed to fetch image from URL ${fullUrl}: ${response.status}`);

                const blob = await response.blob();
                return URL.createObjectURL(blob);
            }
        } catch (e) {
            console.warn('Failed to resolve image via getImages, falling back to direct construction', e);
        }

        // Fallback to direct construction if getImages fails or image not found
        const relativeUrl = `/api/manager/images/img/${imageId}`;
        const path = relativeUrl.startsWith('/') ? relativeUrl : `/${relativeUrl}`;
        const fullUrl = this.baseUrl ? `${this.baseUrl}${path}` : path;

        try {
            const headers = {};
            if (this.token) {
                headers['Authorization'] = `Bearer ${this.token}`;
            }

            const response = await fetch(fullUrl, { headers });
            if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);

            const blob = await response.blob();
            return URL.createObjectURL(blob);
        } catch (error) {
            console.error('Error fetching device image:', error);
            return null;
        }
    }





    // Export singleton instance

    // --- Flow Support ---

    // Get all flows
    // Get all flows (Standard + Advanced)
    async getFlows() {
        try {
            const [standardFlows, advancedFlows] = await Promise.all([
                this.request('/api/manager/flow/flow').catch(e => {
                    console.warn('Failed to fetch standard flows', e);
                    return {};
                }),
                this.request('/api/manager/flow/advancedflow').catch(e => {
                    console.warn('Failed to fetch advanced flows', e);
                    return {};
                })
            ]);

            const standardList = Object.values(standardFlows || {}).map(f => ({ ...f, type: 'standard' }));
            const advancedList = Object.values(advancedFlows || {}).map(f => ({ ...f, type: 'advanced' }));

            return [...standardList, ...advancedList].sort((a, b) => a.name.localeCompare(b.name));
        } catch (error) {
            console.error('Failed to fetch flows:', error);
            return [];
        }
    }

    // Trigger a flow
    async triggerFlow(flowId) {
        // Try triggering as standard flow first
        try {
            return await this.request(`/api/manager/flow/flow/${flowId}/trigger`, 'POST');
        } catch (error) {
            // If that fails (e.g. 404), try as advanced flow
            try {
                return await this.request(`/api/manager/flow/advancedflow/${flowId}/trigger`, 'POST');
            } catch (advError) {
                console.error(`Failed to trigger flow ${flowId}:`, advError);
                throw advError;
            }
        }
    }

    // --- Insights Support ---

    // Get all insight logs
    // Usually /api/manager/insights/log
    async getInsightLogs() {
        try {
            const logs = await this.request('/api/manager/insights/log');
            return Array.isArray(logs) ? logs : Object.values(logs);
        } catch (error) {
            console.error('Failed to fetch insight logs:', error);
            throw error;
        }
    }

    // Get entries for a specific log
    // usually /api/manager/insights/log/:uri/:id/entry?start=...&end=...&resolution=...
    async getInsightLogEntries(uri, id, start, end, resolution = 'last24Hours') {
        try {
            // Check if start/end are valid dates
            if (!(start instanceof Date) || isNaN(start)) {
                console.error("Invalid start date passed to API:", start);
                throw new Error("Invalid start date");
            }
            if (!(end instanceof Date) || isNaN(end)) {
                console.error("Invalid end date passed to API:", end);
                throw new Error("Invalid end date");
            }

            const params = new URLSearchParams({
                start: start.toISOString(),
                end: end.toISOString(),
                resolution
            });

            // The Homey API expects the URI and ID as separate path parameters, URL encoded.
            const encodedUri = encodeURIComponent(uri);
            const encodedId = encodeURIComponent(id);

            // Endpoint: /api/manager/insights/log/:uri/:id/entry
            const url = `/api/manager/insights/log/${encodedUri}/${encodedId}/entry?${params.toString()}`;

            const entries = await this.request(url);
            return entries;
        } catch (error) {
            console.error(`Failed to fetch insight entries for ${uri}/${id}:`, error);
            throw error;
        }
    }

    // Helper to format insight logs into human-readable labels
    formatLogLabel(log, customDevicesArray = null) {
        if (!log) return '';

        // Use passed devices array (like from context) or fallback to internal cache
        const sourceDevices = customDevicesArray || Array.from(this.devices.values());

        // Helper to format capability
        const formatCap = (cap) => {
            if (!cap) return '';
            const map = {
                'measure_temperature': 'Temperatur',
                'measure_humidity': 'Luftfuktighet',
                'measure_power': 'Strøm (W)',
                'meter_power': 'Strømforbruk (kWh)',
                'measure_pressure': 'Trykk',
                'measure_co2': 'CO2',
                'measure_voc': 'Luftkvalitet (VOC)',
                'measure_pm25': 'PM2.5',
                'measure_noise': 'Støy',
                'measure_battery': 'Batteri',
                'dim': 'Dimmernivå',
                'meter_gas': 'Gass',
                'meter_water': 'Vann',
                'alarm_battery': 'Batteri Alarm'
            };
            if (map[cap]) return map[cap];
            return cap.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        };

        if (log.id && log.id.startsWith('homey:device:')) {
            const parts = log.id.split(':');
            if (parts.length >= 4) {
                const deviceId = parts[2];
                const capability = parts[3];
                const device = sourceDevices.find(d => d.id === deviceId);
                const capLabel = formatCap(capability);

                if (device) {
                    const capObj = device.capabilitiesObj?.[capability];
                    const officialTitle = capObj?.title || capLabel;
                    return `${device.name} - ${officialTitle}`;
                }

                // Fallback if device not found (try shorter ID)
                return `Enhet (${deviceId.substring(0, 5)}...) - ${capLabel}`;
            }
        }

        if (log.id && log.id.startsWith('homey:app:')) {
            const parts = log.id.split(':');
            if (parts.length >= 4) {
                const appName = parts[2].split('.').pop();
                const metric = parts[3].replace(/_/g, ' ');
                return `${appName.charAt(0).toUpperCase() + appName.slice(1)} - ${metric}`;
            }
        }

        if (log.label) return log.label;
        if (log.title) return log.title;
        return log.name || log.id;
    }
}

// Export singleton instance
export const homeyAPI = new HomeyAPI();
