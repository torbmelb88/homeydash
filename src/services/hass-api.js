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
        this.heartbeatTimer = null;
        this.wakeHandlersBound = false;
        this.hiddenSince = null;       // når siden sist ble skjult (visibilitychange)
        this.connectStartedAt = 0;     // når pågående connect-forsøk startet
        this.resyncing = false;
        this.onConnectionChange = null; // (connected: boolean) => void
        this.lastNotifiedConnected = null;
        this.onStatusChange = null;     // (status) => void – fase for banner/innstillinger
        this.status = { phase: 'connecting', attempt: 0, since: Date.now() };
        this.events = this.loadEvents(); // tilkoblingslogg (ringbuffer, speiles til localStorage)
        this.openedAt = 0;
        this.lastWakeAt = 0;           // siste vekking – de første sekundene etterpå brukes korte frister
        this.lastOpenMs = 0;           // sist målte tid fra new WebSocket til onopen (styrer vekkingsfristen)
    }

    // --- Tilkoblingslogg ---------------------------------------------------
    // Konsollen er utilgjengelig på mobilen, så de viktige hendelsene i
    // tilkoblingsløpet logges her og vises i Innstillinger → Hub.
    static EVENT_LIMIT = 80;
    static EVENT_STORE_KEY = 'haConnLog';

    loadEvents() {
        try {
            const raw = typeof localStorage !== 'undefined' && localStorage.getItem(HassAPI.EVENT_STORE_KEY);
            const list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list : [];
        } catch {
            return [];
        }
    }

    logEvent(text, level = 'log') {
        const entry = { t: Date.now(), text };
        this.events.push(entry);
        if (this.events.length > HassAPI.EVENT_LIMIT) this.events.splice(0, this.events.length - HassAPI.EVENT_LIMIT);
        try {
            if (typeof localStorage !== 'undefined') localStorage.setItem(HassAPI.EVENT_STORE_KEY, JSON.stringify(this.events));
        } catch { /* full/privat modus – uviktig */ }
        (level === 'warn' ? console.warn : console.log)(`HA: ${text}`);
    }

    getEvents() {
        return this.events.slice();
    }

    clearEvents() {
        this.events = [];
        try { localStorage.removeItem(HassAPI.EVENT_STORE_KEY); } catch { /* ignore */ }
    }

    /** Fase i tilkoblingsløpet: connected | checking | connecting | loading | waiting */
    setStatus(phase, extra = {}) {
        this.status = { phase, attempt: this.reconnectAttempts, since: Date.now(), ...extra };
        try {
            if (this.onStatusChange) this.onStatusChange(this.status);
        } catch (e) {
            console.error('HA onStatusChange handler error', e);
        }
    }

    // --- Liveness ---------------------------------------------------------
    // Chrome on Android freezes background tabs and drops the radio when the
    // screen locks. The WebSocket then often ends up half-open: readyState is
    // still OPEN but nothing gets through and onclose never fires. We detect
    // that with (a) a ping when the page becomes visible again and (b) a
    // periodic heartbeat while visible, and reconnect immediately on failure.
    //
    // Wake-up rules (onWake):
    //  - a pending backoff timer is skipped – the user is looking now
    //  - a connect attempt that started before the sleep is abandoned
    //  - after a long sleep the full state is pulled again even when the
    //    socket answers the ping, so events dropped meanwhile are recovered

    static HEARTBEAT_MS = 30000;
    static PING_TIMEOUT_MS = 3000;
    static COMMAND_TIMEOUT_MS = 20000;
    static OPEN_TIMEOUT_MS = 4000;         // socket must reach onopen (TCP/TLS) within this – a SYN
                                           // that hangs while wifi comes up is retried instead of waited on
    static OPEN_TIMEOUT_WAKE_MIN_MS = 1500; // same, right after a wake: 2 × sist målte oppkoblingstid,
                                            // minst 1,5 s. Android slipper nettet gjennom noen sekunder
                                            // etter at appen er tilbake; hvert forsøk sender SYN straks
                                            // (+ retransmit etter 1 s), så korte, tette forsøk gir
                                            // kontakt < 1 s etter at nettet er tilbake (brukerlogg 15/10)
    static FRESH_WAKE_MS = 15000;          // how long after a wake the short limits apply
    static HANDSHAKE_TIMEOUT_MS = 8000;    // TCP + auth only; data load has per-command timeouts
    static RESYNC_AFTER_HIDDEN_MS = 20000; // hidden longer than this → get_states on wake
    static RECONNECT_AFTER_HIDDEN_MS = 120000; // hidden longer than this → skip the ping, reconnect at once
    static STALE_CONNECT_MS = 3000;        // a connect attempt older than this is restarted on wake
    static VISIBLE_BACKOFF_MAX_MS = 5000;
    static HIDDEN_BACKOFF_MAX_MS = 30000;

    bindWakeHandlers() {
        if (this.wakeHandlersBound || typeof window === 'undefined') return;
        this.wakeHandlersBound = true;
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') this.onWake('visible');
            else {
                this.hiddenSince = Date.now();
                this.logEvent('Siden ble skjult');
            }
        });
        window.addEventListener('pageshow', () => this.onWake('pageshow'));
        window.addEventListener('online', () => this.onWake('online'));
        window.addEventListener('focus', () => this.onWake('focus'));
    }

    isVisible() {
        return typeof document === 'undefined' || document.visibilityState === 'visible';
    }

    /** True in the first seconds after a wake, when the user is waiting and the radio may be late. */
    isFreshWake() {
        return Date.now() - this.lastWakeAt < HassAPI.FRESH_WAKE_MS;
    }

    /** Kontaktfrist for et forsøk: kort og adaptiv rett etter vekking, ellers 4 s. */
    openTimeoutMs() {
        if (!this.isFreshWake()) return HassAPI.OPEN_TIMEOUT_MS;
        return Math.min(HassAPI.OPEN_TIMEOUT_MS, Math.max(HassAPI.OPEN_TIMEOUT_WAKE_MIN_MS, 2 * this.lastOpenMs));
    }

    notifyConnection(connected) {
        if (this.lastNotifiedConnected === connected) return;
        this.lastNotifiedConnected = connected;
        try {
            if (this.onConnectionChange) this.onConnectionChange(connected);
        } catch (e) {
            console.error('HA onConnectionChange handler error', e);
        }
    }

    /** The page came back (visible/pageshow/online/focus): make sure we are live. */
    onWake(reason) {
        if (this.manuallyDisconnected || !this.url || !this.token) return;
        const hiddenFor = this.hiddenSince ? Date.now() - this.hiddenSince : 0;
        if (reason === 'visible') this.hiddenSince = null;
        if (reason === 'visible' || hiddenFor > 0) {
            this.logEvent(`Vekket (${reason})${hiddenFor ? ` etter ${Math.round(hiddenFor / 1000)} s skjult` : ''}`);
        }
        this.lastWakeAt = Date.now();

        // Backoff was tuned for a hidden page – start over now that someone is looking.
        this.reconnectAttempts = 0;
        if (this.reconnectTimer) {
            this.logEvent('Ventende nytt forsøk hoppes over – kobler til nå');
            this.forceReconnect();
            return;
        }
        if (this.isConnecting) {
            if (this.ws?.readyState === WebSocket.CONNECTING) {
                // Fikk ikke kontakt ennå (typisk: startet i bakgrunnen eller i
                // samme sekund som opplåsingen, før wifi var oppe). Et nytt
                // forsøk nå får den korte vekkingsfristen; dette ville hengt
                // hele den lange (sett i loggen 15/10: 4 s tapt).
                this.logEvent('Forsøk uten kontakt ennå – starter på nytt med kort frist');
                this.forceReconnect();
            } else if (Date.now() - this.connectStartedAt > HassAPI.STALE_CONNECT_MS) {
                this.logEvent('Hengende tilkoblingsforsøk fra før søvnen – starter på nytt');
                this.forceReconnect();
            }
            return;
        }
        if (hiddenFor > HassAPI.RECONNECT_AFTER_HIDDEN_MS) {
            // Etter så lang tid er socketen på Android så godt som alltid død –
            // 3 s ping-timeout er bortkastet ventetid. Kobler rett til på nytt.
            this.logEvent('Lenge skjult – kobler til på nytt uten å pinge først');
            this.forceReconnect();
            return;
        }
        this.checkConnection(reason, { resync: hiddenFor > HassAPI.RESYNC_AFTER_HIDDEN_MS });
    }

    /**
     * Verify that the connection is alive and usable; reconnect right away if
     * not. Safe to call often – it is a no-op while a connect is in progress.
     * With { resync: true } a healthy socket is followed by a full get_states.
     */
    async checkConnection(reason = '', { resync = false } = {}) {
        if (this.manuallyDisconnected || !this.url || !this.token) return;
        if (this.isConnecting) return;
        if (!this.isAuthenticated || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.logEvent(`Socket ikke åpen (${reason}) – kobler til på nytt`);
            this.forceReconnect();
            return;
        }
        const ws = this.ws;
        const t0 = Date.now();
        if (reason !== 'heartbeat') this.setStatus('checking');
        try {
            await this.sendCommand({ type: 'ping' }, HassAPI.PING_TIMEOUT_MS);
        } catch (err) {
            // Another check may already have replaced the socket meanwhile.
            if (this.ws !== ws || this.isConnecting) return;
            this.logEvent(`Ping uten svar (${reason}, ${Date.now() - t0} ms, ${err.message}) – kobler til på nytt`, 'warn');
            this.forceReconnect();
            return;
        }
        if (reason !== 'heartbeat') {
            this.logEvent(`Ping OK (${reason}, ${Date.now() - t0} ms)`);
            if (this.status.phase !== 'connected') this.setStatus('connected');
        }
        if (resync && this.ws === ws) await this.resyncStates(reason);
    }

    /**
     * Pull every state once more over the live socket and replay the ones
     * that changed while we were not listening. The socket may well have
     * survived a long sleep, but the browser is free to have dropped events
     * meanwhile – this makes the dashboard correct either way, without
     * tearing the connection down.
     */
    async resyncStates(reason = '') {
        if (this.resyncing) return;
        this.resyncing = true;
        try {
            const states = await this.sendCommand({ type: 'get_states' });
            let changed = 0;
            for (const state of states) {
                const prev = this.entities[state.entity_id];
                if (prev && prev.last_updated === state.last_updated && prev.state === state.state) continue;
                this.entities[state.entity_id] = state;
                changed++;
                if (this.onStateChanged) this.onStateChanged(state);
            }
            this.logEvent(`Resync (${reason}): ${changed} av ${states.length} enheter var endret`);
        } catch (err) {
            this.logEvent(`Resync (${reason}) feilet: ${err.message}`, 'warn');
        } finally {
            this.resyncing = false;
        }
    }

    /** Drop the current socket (dead or not) and reconnect without backoff. */
    forceReconnect() {
        if (this.manuallyDisconnected || !this.url || !this.token) return;
        this.stopHeartbeat();
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.reconnectAttempts = 0;
        this.isConnected = false;
        this.isConnecting = false;
        this.isAuthenticated = false;
        this.connectionPromise = null;
        this.rejectPending(new Error('Tilkoblingen til Home Assistant ble startet på nytt'));
        this.notifyConnection(false);
        // connect() closes the old socket with its handlers detached.
        this.connect(this.url, this.token).catch(err => {
            console.warn('HA forced reconnect failed:', err.message);
            if (!this.manuallyDisconnected) this.scheduleReconnect();
        });
    }

    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatTimer = setInterval(() => {
            if (!this.isVisible()) return;
            this.checkConnection('heartbeat');
        }, HassAPI.HEARTBEAT_MS);
    }

    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    /** Fail every command still waiting for a result (the socket is gone). */
    rejectPending(error) {
        for (const [id, p] of this.promises) {
            clearTimeout(p.timer);
            p.reject(error);
            this.promises.delete(id);
        }
    }

    async connect(url, token) {
        if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) return true;
        if (this.isConnecting) return this.connectionPromise;

        this.url = url;
        this.token = token;
        this.bindWakeHandlers();
        // When the dashboard is served over HTTPS, browsers block insecure
        // ws:// and http:// requests to HA (mixed content). Route everything
        // through the same-origin reverse proxy (/ha → HA) instead. Over plain
        // HTTP we talk to HA directly as before.
        this.httpBase = (typeof window !== 'undefined' && window.location.protocol === 'https:')
            ? `${window.location.origin}/ha`
            : (url || '').replace(/\/$/, '');
        this.manuallyDisconnected = false;
        // NB: this.entities is kept until the new get_states arrives, so widgets
        // that read hassAPI.entities directly keep their last known values
        // while we reconnect (they showed «–» for a second or two before).
        this.isConnecting = true;
        this.isAuthenticated = false;
        this.connectStartedAt = Date.now();
        this.openedAt = 0;
        this.setStatus('connecting');
        this.logEvent(`Kobler til (forsøk ${this.reconnectAttempts + 1})`);
        this.connectionPromise = new Promise((resolve, reject) => {
            // Clean up old connection safely
            if (this.ws) {
                this.ws.onclose = null;
                this.ws.onerror = null;
                this.ws.close();
            }

            let wsUrl;
            if (!url) {
                this.isConnecting = false;
                return reject(new Error('Ingen Home Assistant URL konfigurert'));
            }

            // Derive the WS URL from httpBase: ws://…:8123 over HTTP, or
            // wss://<origin>/ha over HTTPS (via the same-origin proxy).
            wsUrl = this.httpBase.replace('http', 'ws') + '/api/websocket';

            // Handshake timeout: covers TCP + auth only. Loading 2000+ states
            // and the registries afterwards has its own per-command timeout –
            // with the old all-in-one 10 s limit a slow link could never get
            // through the load and looped on reconnect forever.
            let ws = null;
            const timeout = setTimeout(() => {
                // Only act on the socket this attempt created – a forced
                // reconnect may already have replaced it.
                if (!this.isAuthenticated && this.ws === ws) {
                    this.logEvent('Handshake tidsavbrutt – lukker socketen', 'warn');
                    if (ws) ws.close(); // onclose schedules the retry
                    reject(new Error('Tilkobling til Home Assistant tidsavbrutt. Sjekk IP-adresse og at HA er oppe.'));
                }
            }, HassAPI.HANDSHAKE_TIMEOUT_MS);
            // Separate, shorter limit for the TCP/TLS part: a SYN that is
            // silently dropped (wifi still coming up after unlock) would
            // otherwise cost the full handshake timeout before we retry.
            const openMs = this.openTimeoutMs();
            const openTimeout = setTimeout(() => {
                if (ws && ws.readyState === WebSocket.CONNECTING && this.ws === ws) {
                    this.logEvent(`Ingen kontakt på ${(openMs / 1000).toFixed(1).replace('.', ',')} s – prøver igjen`, 'warn');
                    ws.close(); // onclose schedules the retry
                }
            }, openMs);

            try {
                ws = new WebSocket(wsUrl);
                this.ws = ws;
            } catch (e) {
                clearTimeout(timeout);
                clearTimeout(openTimeout);
                this.isConnecting = false;
                return reject(new Error(`Kunne ikke opprette WebSocket: ${e.message}`));
            }

            this.ws.onopen = () => {
                clearTimeout(openTimeout);
                this.openedAt = Date.now();
                this.lastOpenMs = this.openedAt - this.connectStartedAt;
                this.logEvent(`Socket åpen etter ${this.lastOpenMs} ms`);
            };

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
                    clearTimeout(timeout);
                    this.isAuthenticated = true; // Must be set BEFORE setupSubscriptions sends commands
                    this.haVersion = message.ha_version;
                    this.setStatus('loading');
                    const tLoad = Date.now();
                    this.setupSubscriptions().then(() => {
                        if (this.ws !== ws) return; // replaced by a forced reconnect meanwhile
                        this.isConnected = true;
                        this.isConnecting = false;
                        this.initialDataLoaded = true;
                        this.reconnectAttempts = 0;
                        this.startHeartbeat();
                        this.logEvent(`Tilkoblet: ${Object.keys(this.entities).length} enheter lastet på ${Date.now() - tLoad} ms (totalt ${Date.now() - this.connectStartedAt} ms)`);
                        this.setStatus('connected');
                        this.notifyConnection(true);
                        if (this.onReady) this.onReady(this.entities);
                        resolve(true);
                    }).catch(err => {
                        this.logEvent(`Lasting etter innlogging feilet: ${err?.message || err}`, 'warn');
                        if (this.ws === ws) {
                            // Drop the socket – onclose resets the flags and schedules
                            // a retry. (Before, this path left a dead client that only
                            // the next wake event could revive.)
                            this.isAuthenticated = false;
                            this.isConnected = false;
                            ws.close();
                        }
                        reject(err);
                    });
                } else if (message.type === 'auth_invalid') {
                    this.isConnecting = false;
                    clearTimeout(timeout);
                    this.logEvent(`Innlogging avvist: ${message.message}`, 'warn');
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
                this.stopHeartbeat();
                this.rejectPending(new Error('Tilkoblingen til Home Assistant ble brutt'));
                this.logEvent(`Tilkoblingen lukket (kode ${event.code}${event.reason ? `, ${event.reason}` : ''})`, 'warn');
                clearTimeout(timeout);
                clearTimeout(openTimeout);
                this.notifyConnection(false);
                if (!this.manuallyDisconnected && this.url && this.token) {
                    this.scheduleReconnect();
                }
            };

            this.ws.onerror = (err) => {
                this.isConnected = false;
                this.isConnecting = false;
                console.error('⚠️ HA Socket error context:', err);
                clearTimeout(timeout);
                clearTimeout(openTimeout);

                let errorMsg = 'WebSocket-feil. ';
                if (window.location.hostname === 'localhost') {
                    errorMsg += 'Dette kan skyldes at proxy-serveren ikke får kontakt med HA, eller at HA blokkerer Origin-headeren.';
                } else {
                    errorMsg += 'Sjekk IP-adresse og at du bruker http/https riktig.';
                }

                reject(new Error(errorMsg));
            };
        });
        // connect() selv returnerer ikke løftet (HomeyContext stoler på onReady),
        // så uten dette blir en feilet tilkobling en «Uncaught (in promise)» i
        // konsollen. Den som faktisk venter på connectionPromise ser fortsatt feilen.
        this.connectionPromise.catch(() => {});
    }

    handleMessage(message) {
        switch (message.type) {
            case 'result': {
                const promise = this.promises.get(message.id);
                if (promise) {
                    clearTimeout(promise.timer);
                    if (message.success) promise.resolve(message.result);
                    else promise.reject(message.error);
                    this.promises.delete(message.id);
                }
                break;
            }
            case 'pong': {
                const promise = this.promises.get(message.id);
                if (promise) {
                    clearTimeout(promise.timer);
                    promise.resolve(true);
                    this.promises.delete(message.id);
                }
                break;
            }
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
        // Subscribe BEFORE get_states: HA answers commands in order, so the
        // snapshot already includes anything that changed while we subscribed,
        // and nothing can slip through between the two (it could before).
        this.sendCommand({ type: 'subscribe_events', event_type: 'state_changed' }).catch(() => {});

        // Get initial states
        try {
            const states = await this.sendCommand({ type: 'get_states' });
            console.log(`📊 HA: Received ${states.length} states from get_states`);
            const fresh = {};
            states.forEach(state => {
                fresh[state.entity_id] = state;
            });
            this.entities = fresh;
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
    }

    send(data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    /**
     * Send a command and await its result. A command that gets no answer
     * within timeoutMs rejects instead of hanging forever (half-open socket),
     * and triggers a liveness check so the socket is replaced if it is dead.
     */
    sendCommand(data, timeoutMs = HassAPI.COMMAND_TIMEOUT_MS) {
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
            const timer = setTimeout(() => {
                if (!this.promises.has(id)) return;
                this.promises.delete(id);
                reject(new Error('Home Assistant svarte ikke i tide'));
                if (data.type !== 'ping') this.checkConnection('command-timeout');
            }, timeoutMs);
            this.promises.set(id, { resolve, reject, timer });
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
    // timeoutMs: HA svarer først når tjenesten er ferdig. Bilkommandoer (kia_uvo) venter på at
    // bilen kvitterer via skyen – det kan ta over et minutt, så de sender inn lengre frist.
    async callService(domain, service, entityId, serviceData = {}, timeoutMs = undefined) {
        return this.sendCommand({
            type: 'call_service',
            domain,
            service,
            target: { entity_id: entityId },
            service_data: serviceData
        }, timeoutMs);
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
        // Visible page: retry every few seconds at most – a 30 s wait feels
        // like «it does not work». Hidden page: back off up to 30 s.
        const cap = this.isVisible() ? HassAPI.VISIBLE_BACKOFF_MAX_MS : HassAPI.HIDDEN_BACKOFF_MAX_MS;
        const base = this.isFreshWake() ? 300 : 1000; // rett etter vekking: 0,3 · 0,6 · 1,2 · 2,4 · 4,8 s
        const delay = Math.min(base * Math.pow(2, this.reconnectAttempts), cap);
        this.reconnectAttempts++;
        this.logEvent(`Nytt forsøk om ${(delay / 1000).toFixed(1).replace('.', ',')} s`);
        this.setStatus('waiting', { until: Date.now() + delay });
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
        this.stopHeartbeat();
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.ws) this.ws.close();
    }
}

export const hassAPI = new HassAPI();
// Tilgjengelig i konsollen (og for røyktester) som window.__hassAPI – nyttig ved feilsøking via remote devtools.
if (typeof window !== 'undefined') window.__hassAPI = hassAPI;

