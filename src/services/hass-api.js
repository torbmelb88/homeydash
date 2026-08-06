/**
 * Lightweight Home Assistant WebSocket Client
 * Handles connection, authentication, and state synchronization.
 */
class HassAPI {
    constructor() {
        this.ws = null;
        this.idCounter = 1;
        this.promises = new Map();
        this.subscriptions = new Map(); // id -> callback for streaming subscriptions (intercom audio, custom events)
        this.onStateChanged = null;
        this.onReady = null;
        this.isConnected = false;
        this.isConnecting = false;
        this.isAuthenticated = false; // true only after auth_ok, before this no commands may be sent
        this.connectionPromise = null;
        this.entities = {};
        this.httpBase = null; // effective HA base for WS+REST (same-origin /ha proxy when page is https)
        this.entityToArea = {};
        this.entityToDevice = {};
        this.initialDataLoaded = false;
        this.token = null;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.manuallyDisconnected = false;
    }

    async connect(url, token) {
        if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) return true;
        if (this.isConnecting) return this.connectionPromise;

        this.url = url;
        this.token = token;
        // When the dashboard is served over HTTPS, browsers block insecure
        // ws:// and http:// requests to HA (mixed content). Route everything
        // through the same-origin reverse proxy (/ha → HA) instead. Over plain
        // HTTP we talk to HA directly as before.
        this.httpBase = (typeof window !== 'undefined' && window.location.protocol === 'https:')
            ? `${window.location.origin}/ha`
            : (url || '').replace(/\/$/, '');
        this.manuallyDisconnected = false;
        this.entities = {}; // Clear previous data
        this.isConnecting = true;
        this.isAuthenticated = false;
        this.connectionPromise = new Promise((resolve, reject) => {
            // Clean up old connection safely
            if (this.ws) {
                this.ws.onclose = null;
                this.ws.onerror = null;
                this.ws.close();
            }

            let wsUrl;
            if (!url) {
                return reject(new Error('Ingen Home Assistant URL konfigurert'));
            }

            // Derive the WS URL from httpBase: ws://…:8123 over HTTP, or
            // wss://<origin>/ha over HTTPS (via the same-origin proxy).
            wsUrl = this.httpBase.replace('http', 'ws') + '/api/websocket';

            // Connection timeout
            const timeout = setTimeout(() => {
                if (!this.isConnected) {
                    if (this.ws) this.ws.close();
                    reject(new Error('Tilkobling til Home Assistant tidsavbrutt (10s). Sjekk IP-adresse og at HA er oppe.'));
                }
            }, 10000);

            try {
                this.ws = new WebSocket(wsUrl);
            } catch (e) {
                clearTimeout(timeout);
                return reject(new Error(`Kunne ikke opprette WebSocket: ${e.message}`));
            }

            this.ws.onmessage = (event) => {
                let message;
                try {
                    message = JSON.parse(event.data);
                } catch (e) {
                    return;
                }
                
                if (message.type === 'auth_required') {
                    this.ws.send(JSON.stringify({
                        type: 'auth',
                        access_token: token
                    }));
                } else if (message.type === 'auth_ok') {
                    this.isAuthenticated = true; // Must be set BEFORE setupSubscriptions sends commands
                    this.haVersion = message.ha_version;
                    this.setupSubscriptions().then(() => {
                        this.isConnected = true;
                        this.isConnecting = false;
                        this.initialDataLoaded = true;
                        this.reconnectAttempts = 0;
                        clearTimeout(timeout);
                        console.log(`🏁 HA: Full state loaded (${Object.keys(this.entities).length} entities).`);
                        if (this.onReady) this.onReady(this.entities);
                        resolve(true);
                    }).catch(err => {
                        // Reset ALL state flags — a partial auth success followed by setup failure
                        // must not leave isAuthenticated=true with no live connection.
                        this.isConnected = false;
                        this.isConnecting = false;
                        this.isAuthenticated = false;
                        this.connectionPromise = null;
                        clearTimeout(timeout);
                        reject(err);
                    });
                } else if (message.type === 'auth_invalid') {
                    this.isConnecting = false;
                    clearTimeout(timeout);
                    reject(new Error(`Autentisering feilet: ${message.message}`));
                } else {
                    this.handleMessage(message);
                }
            };

            this.ws.onclose = (event) => {
                this.isConnected = false;
                this.isConnecting = false;
                this.isAuthenticated = false;
                this.connectionPromise = null;
                console.log('❌ HA Connection closed', {
                    code: event.code,
                    reason: event.reason,
                    wasClean: event.wasClean
                });
                clearTimeout(timeout);
                if (!this.manuallyDisconnected && this.url && this.token) {
                    this.scheduleReconnect();
                }
            };

            this.ws.onerror = (err) => {
                this.isConnected = false;
                this.isConnecting = false;
                console.error('⚠️ HA Socket error context:', err);
                clearTimeout(timeout);
                
                let errorMsg = 'WebSocket-feil. ';
                if (window.location.hostname === 'localhost') {
                    errorMsg += 'Dette kan skyldes at proxy-serveren ikke får kontakt med HA, eller at HA blokkerer Origin-headeren.';
                } else {
                    errorMsg += 'Sjekk IP-adresse og at du bruker http/https riktig.';
                }
                
                reject(new Error(errorMsg));
            };
        });
    }

    handleMessage(message) {
        switch (message.type) {
            case 'result':
                const promise = this.promises.get(message.id);
                if (promise) {
                    if (message.success) promise.resolve(message.result);
                    else promise.reject(message.error);
                    this.promises.delete(message.id);
                }
                break;
            case 'event':
                // Streaming subscriptions (intercom audio, custom event types) are keyed by id.
                if (this.subscriptions.has(message.id)) {
                    try {
                        this.subscriptions.get(message.id)(message.event);
                    } catch (e) {
                        console.error('HA subscription handler error', e);
                    }
                    break;
                }
                if (message.event?.event_type === 'state_changed') {
                    const newState = message.event.data.new_state;
                    if (newState) {
                        this.entities[newState.entity_id] = newState;
                        if (this.onStateChanged) this.onStateChanged(newState);
                    }
                }
                break;
        }
    }

    async setupSubscriptions() {
        // Get initial states
        try {
            const states = await this.sendCommand({ type: 'get_states' });
            console.log(`📊 HA: Received ${states.length} states from get_states`);
            states.forEach(state => {
                this.entities[state.entity_id] = state;
            });
        } catch (err) {
            console.error('❌ HA: Failed to fetch states:', err);
            throw err;
        }

        // Fetch registries to get area information
        try {
            console.log('🔍 HA: Fetching registries...');
            const [areas, devices, registryEntities] = await Promise.all([
                this.sendCommand({ type: 'config/area_registry/list' }),
                this.sendCommand({ type: 'config/device_registry/list' }),
                this.sendCommand({ type: 'config/entity_registry/list' })
            ]);

            console.log(`📝 HA: Registry counts - Areas: ${areas.length}, Devices: ${devices.length}, Entities: ${registryEntities.length}`);

            this.areaRegistry = areas;
            this.deviceRegistry = devices;
            this.entityRegistry = registryEntities;

            // Build entity_id -> area_name and entity_id -> device_id mapping (Optimized)
            this.entityToArea = {};
            this.entityToDevice = {};
            const areaMap = new Map(areas.map(a => [a.area_id, a.name]));
            const deviceMap = new Map(devices.map(d => [d.id, d]));

            registryEntities.forEach(e => {
                let areaId = e.area_id;
                if (!areaId && e.device_id) {
                    const dev = deviceMap.get(e.device_id);
                    areaId = dev?.area_id;
                    this.entityToDevice[e.entity_id] = e.device_id;
                }
                
                if (areaId && areaMap.has(areaId)) {
                    this.entityToArea[e.entity_id] = areaMap.get(areaId);
                }
                
                // Also store device ID if not already set via the block above
                if (e.device_id && !this.entityToDevice[e.entity_id]) {
                    this.entityToDevice[e.entity_id] = e.device_id;
                }
            });
            
            console.log(`✅ HA: Registry processing complete. ${Object.keys(this.entityToArea).length} entities matched to areas.`);
        } catch (err) {
            console.warn('⚠️ HA: Could not fetch registries (area/device info may be missing):', err);
        }

        // Subscribe to state changes with an ID
        this.sendCommand({ type: 'subscribe_events', event_type: 'state_changed' });
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    sendCommand(data) {
        return new Promise((resolve, reject) => {
            if (!this.isAuthenticated) {
                reject(new Error('Ikke autentisert – kommando avvist'));
                return;
            }
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                reject(new Error('WebSocket ikke åpen'));
                return;
            }
            const id = this.idCounter++;
            this.promises.set(id, { resolve, reject });
            this.send({ ...data, id });
        });
    }

    /**
     * Fire-and-forget message with an auto-assigned id (no result awaited).
     * Used for high-frequency streams such as intercom audio frames.
     */
    sendMessage(data) {
        if (!this.isAuthenticated || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        const id = this.idCounter++;
        this.send({ ...data, id });
    }

    /**
     * Subscribe to a streaming WS command (e.g. intercom_native/subscribe_audio)
     * or an event type. The callback receives each streamed event payload
     * (message.event). Returns an async-resolved unsubscribe function.
     */
    async subscribeMessage(callback, payload) {
        if (!this.isAuthenticated || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket ikke klar – kan ikke abonnere');
        }
        const id = this.idCounter++;
        this.subscriptions.set(id, callback);
        try {
            await new Promise((resolve, reject) => {
                this.promises.set(id, { resolve, reject });
                this.send({ ...payload, id });
            });
        } catch (err) {
            this.subscriptions.delete(id);
            throw err;
        }
        return () => {
            this.subscriptions.delete(id);
            this.sendCommand({ type: 'unsubscribe_events', subscription: id }).catch(() => {});
        };
    }

    /**
     * Subscribe to a Home Assistant event type. The callback receives the HA
     * event object ({ event_type, data, ... }). Returns an unsubscribe function.
     */
    async subscribeEvents(callback, eventType) {
        return this.subscribeMessage(callback, { type: 'subscribe_events', event_type: eventType });
    }

    /**
     * Call an HA service
     * @param {string} domain - e.g., 'light'
     * @param {string} service - e.g., 'turn_on'
     * @param {string} entityId - Target entity
     * @param {object} serviceData - Action parameters
     */
    async callService(domain, service, entityId, serviceData = {}) {
        return this.sendCommand({
            type: 'call_service',
            domain,
            service,
            target: { entity_id: entityId },
            service_data: serviceData
        });
    }

    async callServiceWithResponse(domain, service, entityId, serviceData = {}) {
        const cmd = {
            type: 'call_service',
            domain,
            service,
            service_data: serviceData,
            return_response: true,
        };
        if (entityId) cmd.target = { entity_id: entityId };
        const result = await this.sendCommand(cmd);
        return result?.response ?? result;
    }

    async getConfigEntries() {
        return this.sendCommand({ type: 'config/config_entries/list' });
    }

    async getHistory(entityId, startTime, endTime = new Date()) {
        const startISO = startTime instanceof Date ? startTime.toISOString() : startTime;
        const endISO = endTime instanceof Date ? endTime.toISOString() : endTime;

        return this.sendCommand({
            type: 'history/history_during_period',
            start_time: startISO,
            end_time: endISO,
            entity_ids: [entityId],
            no_attributes: true
        });
    }

    scheduleReconnect() {
        if (this.reconnectTimer) return;
        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
        this.reconnectAttempts++;
        console.log(`🔄 HA: Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = null;
            if (this.manuallyDisconnected) return;
            try {
                await this.connect(this.url, this.token);
            } catch (err) {
                console.warn('HA reconnect failed:', err.message);
                if (!this.manuallyDisconnected) this.scheduleReconnect();
            }
        }, delay);
    }

    disconnect() {
        this.manuallyDisconnected = true;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) this.ws.close();
    }
}

export const hassAPI = new HassAPI();
