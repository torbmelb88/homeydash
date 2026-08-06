// Music Assistant direct WebSocket API client
// ws://HOST:PORT/ws?token=TOKEN  →  send auth message  →  receive events + respond to commands

import { storage } from './storage';

// Config is persisted in Firestore (via storage.js) so it survives origin
// changes (http→https) and "clear web storage" — same as the rest of the app.
// The legacy localStorage keys are still read once for migration.
const MA_STORE          = 'maConfig';
const STORAGE_KEY_HOST  = 'ma_host';
const STORAGE_KEY_PORT  = 'ma_port';
const STORAGE_KEY_TOKEN = 'ma_token';

const DEFAULT_HOST  = '';
const DEFAULT_PORT  = 8095;
const DEFAULT_TOKEN = '';

const CMD_TIMEOUT_MS   = 10_000;
const RECONNECT_DELAY  = 5_000;

class MusicAssistantAPI {
  constructor() {
    this._ws             = null;
    this._msgId          = 0;
    this._pending        = new Map();   // message_id → {resolve, reject, timer}
    this._listeners      = new Map();   // event_type → Set<handler>
    this._connectListeners = new Set(); // handlers notified on connect/disconnect
    this._reconnectTimer = null;
    this._manualClose    = false;
    this._connecting     = null;       // in-flight connect Promise

    this.connected      = false;
    this.authenticated  = false;

    // Synchronous best-effort defaults (legacy localStorage cache); loadConfig()
    // below is the authoritative async source from Firestore.
    this.host  = localStorage.getItem(STORAGE_KEY_HOST)  || DEFAULT_HOST;
    this.port  = parseInt(localStorage.getItem(STORAGE_KEY_PORT)  || String(DEFAULT_PORT), 10);
    this.token = localStorage.getItem(STORAGE_KEY_TOKEN) || DEFAULT_TOKEN;
    this._configLoaded = false;
    this._configLoading = null;
  }

  // Load host/port/token from Firestore (via storage.js). Migrates any legacy
  // localStorage config into Firestore on first run. Idempotent.
  async loadConfig() {
    if (this._configLoaded) return;
    if (this._configLoading) return this._configLoading;
    this._configLoading = (async () => {
      try {
        const cfg = await storage.get(MA_STORE, 'config');
        if (cfg && (cfg.token || cfg.host)) {
          if (cfg.host)  this.host  = cfg.host;
          if (cfg.port)  this.port  = parseInt(cfg.port, 10) || this.port;
          if (cfg.token) this.token = cfg.token;
        } else if (this.token || this.host !== DEFAULT_HOST) {
          // One-time migration: persist legacy localStorage config to Firestore.
          await storage.set(MA_STORE, { host: this.host, port: this.port, token: this.token }, 'config');
        }
      } catch (_) { /* fall back to whatever defaults we have */ }
      this._configLoaded = true;
    })();
    return this._configLoading;
  }

  get wsUrl() {
    // Over HTTPS the dashboard can't open an insecure ws://; route through the
    // same-origin nginx proxy (/svc/<port>/ → MA) instead. See utils.js.
    if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
      return `wss://${window.location.host}/svc/${this.port}/ws`;
    }
    return `ws://${this.host}:${this.port}/ws`;
  }

  // ── Connection ──────────────────────────────────────────────────

  connect() {
    if (this.connected) return Promise.resolve();
    if (this._connecting) return this._connecting;

    this._manualClose = false;
    this._connecting = this.loadConfig().then(() => new Promise((resolve, reject) => {
      try {
        this._ws = new WebSocket(`${this.wsUrl}?token=${encodeURIComponent(this.token)}`);
      } catch (e) {
        this._connecting = null;
        return reject(e);
      }

      const onOpen = async () => {
        try {
          // Send auth message; server replies with message_id:"auth"
          await this._rawSend({
            message_id: 'auth',
            command: 'auth',
            args: { token: this.token },
          });
          this.connected     = true;
          this.authenticated = true;
          this._connecting   = null;
          this._notifyConnect(true);
          resolve();
        } catch (e) {
          this._connecting = null;
          reject(e);
          this._ws?.close();
        }
      };

      const onMessage = (evt) => {
        try { this._handleMessage(JSON.parse(evt.data)); } catch {}
      };

      const onError = () => {
        if (this._connecting) {
          this._connecting = null;
          reject(new Error('WebSocket error'));
        }
      };

      const onClose = () => {
        this.connected     = false;
        this.authenticated = false;
        this._connecting   = null;
        // Reject all in-flight commands
        for (const [, { reject: rej, timer }] of this._pending) {
          clearTimeout(timer);
          rej(new Error('WebSocket closed'));
        }
        this._pending.clear();
        this._notifyConnect(false);
        if (!this._manualClose) {
          this._reconnectTimer = setTimeout(() => this.connect().catch(() => {}), RECONNECT_DELAY);
        }
      };

      this._ws.addEventListener('open',    onOpen);
      this._ws.addEventListener('message', onMessage);
      this._ws.addEventListener('error',   onError);
      this._ws.addEventListener('close',   onClose);
    }));

    return this._connecting;
  }

  disconnect() {
    this._manualClose = true;
    clearTimeout(this._reconnectTimer);
    this._ws?.close();
  }

  // ── Event subscription ──────────────────────────────────────────

  /** Subscribe to a MA event type. Returns unsubscribe function. */
  on(eventType, handler) {
    if (!this._listeners.has(eventType)) this._listeners.set(eventType, new Set());
    this._listeners.get(eventType).add(handler);
    return () => this._listeners.get(eventType)?.delete(handler);
  }

  off(eventType, handler) {
    this._listeners.get(eventType)?.delete(handler);
  }

  /** handler(connected: bool) called on connect/disconnect */
  onConnectionChange(handler) {
    this._connectListeners.add(handler);
    return () => this._connectListeners.delete(handler);
  }

  // ── Commands ────────────────────────────────────────────────────

  async command(cmd, args = {}) {
    if (!this.connected) {
      await this.connect();
    }
    const id = String(++this._msgId);
    return this._rawSend({ message_id: id, command: cmd, args });
  }

  // ── High-level API ──────────────────────────────────────────────

  getPlayers()                      { return this.command('players/all'); }
  getQueues()                       { return this.command('player_queues/all'); }
  getQueue(queueId)                 { return this.command('player_queues/get', { queue_id: queueId }); }
  getQueueItems(queueId, limit = 200, offset = 0) {
    return this.command('player_queues/items', { queue_id: queueId, limit, offset });
  }

  playPause(queueId)                { return this.command('player_queues/play_pause', { queue_id: queueId }); }
  next(queueId)                     { return this.command('player_queues/next',       { queue_id: queueId }); }
  previous(queueId)                 { return this.command('player_queues/previous',   { queue_id: queueId }); }
  seek(queueId, position)           { return this.command('player_queues/seek',   { queue_id: queueId, position }); }
  setShuffle(queueId, enabled)      { return this.command('player_queues/shuffle', { queue_id: queueId, shuffle_enabled: enabled }); }
  setRepeat(queueId, mode)          { return this.command('player_queues/repeat',  { queue_id: queueId, repeat_mode: mode }); }
  setVolume(playerId, volume)       { return this.command('players/cmd_volume_set', { player_id: playerId, volume }); }

  /**
   * Play media on a queue.
   * @param {string} queueId
   * @param {string} mediaUri  – spotify://track/ID or any MA URI
   * @param {'replace'|'next'|'add'} option
   */
  playMedia(queueId, mediaUri, option = 'replace') {
    return this.command('player_queues/play_media', {
      queue_id: queueId,
      media: mediaUri,
      option,
    });
  }

  playQueueItem(queueId, queueItemId) {
    return this.command('player_queues/play_index', {
      queue_id: queueId,
      queue_item_id: queueItemId,
    });
  }

  /**
   * Search MA library.
   * Returns { artists, albums, tracks, playlists }
   */
  search(query, mediaTypes = ['track', 'album', 'artist', 'playlist'], limit = 20) {
    return this.command('music/search', {
      search_query: query,
      media_types: mediaTypes,
      limit,
    });
  }

  // ── Internal ────────────────────────────────────────────────────

  _rawSend(msg) {
    return new Promise((resolve, reject) => {
      const id    = msg.message_id;
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`MA timeout: ${msg.command}`));
      }, CMD_TIMEOUT_MS);
      this._pending.set(id, { resolve, reject, timer });
      try {
        this._ws.send(JSON.stringify(msg));
      } catch (e) {
        this._pending.delete(id);
        clearTimeout(timer);
        reject(e);
      }
    });
  }

  _handleMessage(msg) {
    // Response to a pending command
    if (msg.message_id != null && this._pending.has(String(msg.message_id))) {
      const { resolve, reject, timer } = this._pending.get(String(msg.message_id));
      this._pending.delete(String(msg.message_id));
      clearTimeout(timer);
      if (msg.error_code) {
        reject(new Error(msg.details || String(msg.error_code)));
      } else {
        resolve(msg.result ?? msg.data ?? null);
      }
      return;
    }

    // Unsolicited event
    const eventType = msg.event || msg.event_type;
    if (eventType) {
      const data = msg.data ?? msg;
      const handlers = this._listeners.get(eventType);
      if (handlers) handlers.forEach(h => h(data));
    }
  }

  _notifyConnect(isConnected) {
    this._connectListeners.forEach(h => h(isConnected));
  }

  // ── Config helpers ──────────────────────────────────────────────

  async configure({ host, port, token } = {}) {
    if (host  !== undefined) this.host  = host;
    if (port  !== undefined) this.port  = port;
    if (token !== undefined) this.token = token;
    this._configLoaded = true; // values are now authoritative in memory
    // Persist to Firestore (survives origin change + clear web storage).
    try {
      await storage.set(MA_STORE, { host: this.host, port: this.port, token: this.token }, 'config');
    } catch (_) { /* non-fatal */ }
    // Reconnect if already connected
    if (this.connected) { this.disconnect(); setTimeout(() => this.connect().catch(() => {}), 100); }
  }
}

export const maAPI = new MusicAssistantAPI();
