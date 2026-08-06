import { hassAPI } from './hass-api';

/**
 * Singleton samtale-motor for intercom_native (portert ut av IntercomTile).
 *
 * All samtale- og lydlogikk (mic/høyttaler, WS-audio, call-events) ligger her
 * på modulnivå slik at:
 *  - den globale anrops-popupen (IncomingCallOverlay i App.jsx) kan varsle om
 *    innkommende anrop uansett hvilken side som er aktiv, og
 *  - en pågående samtale overlever sidebytte (flisen kan unmountes fritt).
 *
 * IntercomTile og IncomingCallOverlay er begge «views» over samme tilstand
 * via subscribe()/getSnapshot() (brukes av useIntercomCall-hooken).
 */

export const HA_SOFTPHONE_DEVICE_ID = '__intercom_native_ha_softphone__';
const PROCESSOR_URL = '/intercom-processor.js';

// getUserMedia krever secure context (HTTPS eller localhost).
export const micAvailable = () =>
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

const b64FromInt16 = (int16) => {
    const bytes = new Uint8Array(int16.buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + 0x8000, bytes.length)));
    }
    return btoa(binary);
};

const int16FromB64 = (b64) => {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Int16Array(bytes.buffer);
};

class IntercomCallService {
    constructor() {
        // Offentlig tilstand (immutable snapshot deles ut ved endring)
        this._snapshot = {
            callState: 'idle',   // idle | outgoing | incoming | in_call
            peerName: '',
            busy: false,
            devices: [],
        };
        this._listeners = new Set();
        this._inited = false;
        this._retryTimer = null;
        this._unsubEvents = null;

        // Sesjonsnøkkelen på HA-siden. VIKTIG: ved INNKOMMENDE anrop er
        // sesjonen keyet på ESP-ens device_id (event-feltet session_device_id),
        // ikke på HA-softphone-id-en — answer/decline/stop/subscribe_audio må
        // bruke denne, ellers svarer HA «No session or bridge». (Samme mønster
        // som integrasjonens eget intercom-card.js.)
        this._sessionDeviceId = null;

        // Audio-plumbing (aldri en del av snapshot)
        this._audioCtx = null;
        this._mediaStream = null;
        this._worklet = null;
        this._source = null;
        this._playbackCtx = null;
        this._gain = null;
        this._nextPlay = 0;
        this._unsubAudio = null;
        this._activeDevice = null;
        this._streaming = false;
    }

    // ── Pub/sub ─────────────────────────────────────────────────────────
    getSnapshot() { return this._snapshot; }

    subscribe(fn) {
        this._listeners.add(fn);
        return () => this._listeners.delete(fn);
    }

    _set(patch) {
        this._snapshot = { ...this._snapshot, ...patch };
        this._listeners.forEach(fn => { try { fn(this._snapshot); } catch (_) { /* ignore */ } });
    }

    // ── Init: abonner på call-events (kalles fra App-nivå) ──────────────
    init() {
        if (this._inited) return;
        this._inited = true;

        const trySubscribe = async () => {
            if (!hassAPI.isAuthenticated) {
                this._retryTimer = setTimeout(trySubscribe, 2000);
                return;
            }
            try {
                this._unsubEvents = await hassAPI.subscribeEvents(
                    (e) => this._onCallEvent(e),
                    'intercom_native.call_event'
                );
                this.loadDevices();
                // Seed nåværende tilstand — fanger anrop som ringer allerede
                // idet dashbordet lastes (før første event ankommer).
                try {
                    const st = await hassAPI.sendCommand({ type: 'intercom_native/ha_softphone_state' });
                    if (st?.state && st.state !== 'idle') {
                        this._onCallEvent({ data: { ...st, scope: 'session', device_id: HA_SOFTPHONE_DEVICE_ID } });
                    }
                } catch (_) { /* eldre integrasjonsversjon uten state-kommando */ }
            } catch (_) {
                this._retryTimer = setTimeout(trySubscribe, 2000);
            }
        };
        trySubscribe();
    }

    async loadDevices() {
        try {
            const result = await hassAPI.sendCommand({ type: 'intercom_native/list_devices' });
            const list = (result?.devices || []).filter(d => d.device_id !== HA_SOFTPHONE_DEVICE_ID);
            this._set({ devices: list });
        } catch (err) {
            // intercom_native kan fortsatt holde på å laste rett etter HA-start
            console.warn('intercom: list_devices failed', err?.message || err);
        }
    }

    _onCallEvent(event) {
        const data = event?.data;
        if (!data) return;
        const scope = (data.scope || '').toLowerCase();
        if (scope !== 'session' && scope !== 'bridge') return;
        const concernsHa =
            data.device_id === HA_SOFTPHONE_DEVICE_ID ||
            data.session_device_id === HA_SOFTPHONE_DEVICE_ID;
        if (!concernsHa) return;

        const st = (data.state || '').toLowerCase();
        const cur = this._snapshot.callState;
        if (data.session_device_id) this._sessionDeviceId = data.session_device_id;
        if (st === 'ringing') {
            if (data.caller) {
                if (cur !== 'in_call') this._set({ callState: 'incoming', peerName: data.caller });
                else this._set({ peerName: data.caller });
            } else {
                this._set({ callState: 'outgoing' });
            }
        } else if (st === 'streaming' || st === 'connected') {
            this._set({
                callState: 'in_call',
                ...(data.peer_name || data.caller ? { peerName: data.peer_name || data.caller } : {}),
            });
        } else if (st === 'idle' || st === 'disconnected' || st === 'declined' || st === 'error') {
            this._sessionDeviceId = null;
            this._teardownAudio();
            this._set({ callState: 'idle', peerName: '' });
        }
    }

    // ── Audio ───────────────────────────────────────────────────────────
    _playScheduled(float32) {
        const ctx = this._playbackCtx;
        if (!ctx) return;
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        try {
            const buffer = ctx.createBuffer(1, float32.length, 16000);
            buffer.getChannelData(0).set(float32);
            const now = ctx.currentTime;
            if (this._nextPlay < now) this._nextPlay = now + 0.01;
            if (this._nextPlay - now > 0.2) { this._nextPlay = now + 0.02; return; }
            const src = ctx.createBufferSource();
            src.buffer = buffer;
            src.connect(this._gain);
            src.start(this._nextPlay);
            this._nextPlay += buffer.duration;
        } catch (_) { /* drop frame on error */ }
    }

    _handleAudioFrame(msg) {
        if (!msg || !this._streaming) return;
        if (msg.device_id && msg.device_id !== this._activeDevice) return;
        try {
            const int16 = int16FromB64(msg.audio);
            const float32 = new Float32Array(int16.length);
            for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768.0;
            this._playScheduled(float32);
        } catch (_) { /* ignore malformed frame */ }
    }

    _sendAudio(int16) {
        if (!this._streaming || !this._activeDevice) return;
        hassAPI.sendMessage({
            type: 'intercom_native/audio',
            device_id: this._activeDevice,
            audio: b64FromInt16(int16),
        });
    }

    async _setupMicAndSpeaker() {
        // Mic (uplink)
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        });
        this._mediaStream = stream;
        const track = stream.getAudioTracks()[0];
        const trackRate = track?.getSettings?.().sampleRate;
        const ctx = new (window.AudioContext || window.webkitAudioContext)(
            trackRate ? { sampleRate: trackRate } : undefined
        );
        this._audioCtx = ctx;
        if (ctx.state === 'suspended') await ctx.resume();
        this._source = ctx.createMediaStreamSource(stream);
        await ctx.audioWorklet.addModule(PROCESSOR_URL);
        const node = new AudioWorkletNode(ctx, 'intercom-processor');
        node.port.onmessage = (e) => {
            if (e.data?.type === 'audio') this._sendAudio(new Int16Array(e.data.buffer));
        };
        this._worklet = node;
        this._source.connect(node);

        // Høyttaler (downlink). NB: konteksten opprettes etter await-kjeder
        // (getUserMedia, worklet-lasting) — utenfor klikk-gesten kan nettleseren
        // starte den 'suspended' (autoplay-policy) → helt stum nedlink.
        const pctx = new (window.AudioContext || window.webkitAudioContext)();
        this._playbackCtx = pctx;
        if (pctx.state === 'suspended') await pctx.resume().catch(() => {});
        this._nextPlay = 0;
        const gain = pctx.createGain();
        gain.gain.value = 1.0;
        gain.connect(pctx.destination);
        this._gain = gain;
    }

    async _teardownAudio() {
        this._streaming = false;
        this._activeDevice = null;
        if (this._unsubAudio) { try { this._unsubAudio(); } catch (_) {} this._unsubAudio = null; }
        if (this._mediaStream) { this._mediaStream.getTracks().forEach(t => t.stop()); this._mediaStream = null; }
        if (this._worklet) { try { this._worklet.disconnect(); } catch (_) {} this._worklet = null; }
        if (this._source) { try { this._source.disconnect(); } catch (_) {} this._source = null; }
        if (this._audioCtx) { await this._audioCtx.close().catch(() => {}); this._audioCtx = null; }
        if (this._playbackCtx) { await this._playbackCtx.close().catch(() => {}); this._playbackCtx = null; }
        this._gain = null;
    }

    async _subscribeAudio(deviceId) {
        this._activeDevice = deviceId;
        this._streaming = true;
        this._unsubAudio = await hassAPI.subscribeMessage(
            (msg) => this._handleAudioFrame(msg),
            { type: 'intercom_native/subscribe_audio', device_id: deviceId }
        );
    }

    // ── Samtale-kontroll ────────────────────────────────────────────────
    async startCall(targetDeviceId) {
        const target = targetDeviceId || this._snapshot.devices[0]?.device_id;
        if (!target) throw new Error('Ingen intercom-enhet å ringe');
        if (!micAvailable()) throw new Error('Mikrofon krever HTTPS – se innstillinger');
        this._set({ busy: true });
        try {
            await this._setupMicAndSpeaker();
            const res = await hassAPI.sendCommand({
                type: 'intercom_native/ha_softphone_start',
                target_device_id: target,
            });
            if (!res?.success) throw new Error('Kunne ikke starte anrop');
            const dev = this._snapshot.devices.find(d => d.device_id === target);
            // Utgående anrop: sesjonen er keyet på HA-softphone-id-en
            this._sessionDeviceId = HA_SOFTPHONE_DEVICE_ID;
            this._set({ callState: 'outgoing', peerName: dev?.name || 'Intercom' });
            await this._subscribeAudio(HA_SOFTPHONE_DEVICE_ID);
        } catch (err) {
            await this._teardownAudio();
            this._set({ callState: 'idle' });
            throw err;
        } finally {
            this._set({ busy: false });
        }
    }

    async answer() {
        if (!micAvailable()) throw new Error('Mikrofon krever HTTPS – se innstillinger');
        // Innkommende sesjoner er keyet på ESP-ens device_id (session_device_id
        // fra ring-eventet) — IKKE HA-softphone-id-en.
        const sid = this._sessionDeviceId || HA_SOFTPHONE_DEVICE_ID;
        this._set({ busy: true });
        try {
            await this._setupMicAndSpeaker();
            const res = await hassAPI.sendCommand({
                type: 'intercom_native/answer',
                device_id: sid,
            });
            if (!res?.success) throw new Error('Kunne ikke svare');
            await this._subscribeAudio(sid);
            this._set({ callState: 'in_call' });
        } catch (err) {
            await this._teardownAudio();
            this._set({ callState: 'idle' });
            throw err;
        } finally {
            this._set({ busy: false });
        }
    }

    async decline() {
        const sid = this._sessionDeviceId || HA_SOFTPHONE_DEVICE_ID;
        this._set({ busy: true });
        try {
            await hassAPI.sendCommand({ type: 'intercom_native/decline', device_id: sid });
        } catch (_) { /* ignore */ }
        this._sessionDeviceId = null;
        await this._teardownAudio();
        this._set({ callState: 'idle', busy: false });
    }

    async hangup() {
        this._set({ busy: true });
        try {
            await hassAPI.sendCommand({
                type: 'intercom_native/stop',
                device_id: this._activeDevice || this._sessionDeviceId || HA_SOFTPHONE_DEVICE_ID,
            });
        } catch (_) { /* ignore */ }
        this._sessionDeviceId = null;
        await this._teardownAudio();
        this._set({ callState: 'idle', busy: false });
    }
}

export const intercomCall = new IntercomCallService();
