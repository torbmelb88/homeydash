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
const SLOW_TIMEOUT_MS  = 60_000; // søk/artist-/spillelistespor mot Spotify o.l.
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

  /** timeoutMs: bibliotekoppslag mot strømmetjenester (artist-spor, store spillelister) kan ta lang tid første gang. */
  async command(cmd, args = {}, timeoutMs = CMD_TIMEOUT_MS) {
    if (!this.connected) {
      await this.connect();
    }
    const id = String(++this._msgId);
    return this._rawSend({ message_id: id, command: cmd, args }, timeoutMs);
  }

  // ── High-level API ──────────────────────────────────────────────
  // MA-kommandoer verifisert mot server 2.10.2 (schema 65). Spiller-kommandoer
  // heter `players/cmd/<x>`, kø-kommandoer `player_queues/<x>`.

  // HTTP-base for MA (bilde-proxy m.m.). Over https går trafikken via /svc/<port>/.
  get httpBase() {
    if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
      return `${window.location.origin}/svc/${this.port}`;
    }
    return `http://${this.host}:${this.port}`;
  }

  // Spillere
  getPlayers()                      { return this.command('players/all'); }
  getPlayer(playerId)               { return this.command('players/get', { player_id: playerId }); }
  /** volume 0–100 */
  setVolume(playerId, volume)       { return this.command('players/cmd/volume_set', { player_id: playerId, volume_level: Math.round(volume) }); }
  /** Dynamisk gruppering: legg til / fjern spillere i gruppa som ledes av targetPlayer. */
  setMembers(targetPlayer, add = [], remove = []) {
    return this.command('players/cmd/set_members', {
      target_player: targetPlayer,
      player_ids_to_add: add.length ? add : null,
      player_ids_to_remove: remove.length ? remove : null,
    });
  }

  // Køer
  getQueues()                       { return this.command('player_queues/all'); }
  getQueue(queueId)                 { return this.command('player_queues/get', { queue_id: queueId }); }
  getQueueItems(queueId, limit = 500, offset = 0) {
    return this.command('player_queues/items', { queue_id: queueId, limit, offset });
  }
  playPause(queueId)                { return this.command('player_queues/play_pause', { queue_id: queueId }); }
  next(queueId)                     { return this.command('player_queues/next',       { queue_id: queueId }); }
  previous(queueId)                 { return this.command('player_queues/previous',   { queue_id: queueId }); }
  seek(queueId, position)           { return this.command('player_queues/seek',   { queue_id: queueId, position: Math.round(position) }); }
  setShuffle(queueId, enabled)      { return this.command('player_queues/shuffle', { queue_id: queueId, shuffle_enabled: enabled }); }
  setRepeat(queueId, mode)          { return this.command('player_queues/repeat',  { queue_id: queueId, repeat_mode: mode }); }
  clearQueue(queueId)               { return this.command('player_queues/clear',   { queue_id: queueId }); }
  deleteQueueItem(queueId, itemIdOrIndex) {
    return this.command('player_queues/delete_item', { queue_id: queueId, item_id_or_index: itemIdOrIndex });
  }
  moveQueueItem(queueId, queueItemId, posShift) {
    return this.command('player_queues/move_item', { queue_id: queueId, queue_item_id: queueItemId, pos_shift: posShift });
  }
  transferQueue(sourceQueueId, targetQueueId, autoPlay = true) {
    return this.command('player_queues/transfer', {
      source_queue_id: sourceQueueId, target_queue_id: targetQueueId, auto_play: autoPlay,
    });
  }

  /**
   * Spill media på en kø.
   * @param {string} queueId
   * @param {string|string[]} media   – MA-URI (library://album/14, spotify--x://track/ID …)
   * @param {'replace'|'next'|'add'|'replace_next'|'play'} option
   * @param {string|null} startItem   – URI til sporet avspillingen skal starte fra (album/spilleliste)
   */
  playMedia(queueId, media, option = 'replace', startItem = null) {
    const args = { queue_id: queueId, media, option };
    if (startItem) args.start_item = startItem;
    return this.command('player_queues/play_media', args);
  }

  /** Hopp til et element i køen. MA tar `index` (posisjon ELLER queue_item_id). */
  playQueueItem(queueId, queueItemIdOrIndex) {
    return this.command('player_queues/play_index', { queue_id: queueId, index: queueItemIdOrIndex });
  }

  // Bibliotek / søk
  /** Returnerer { artists, albums, tracks, playlists, radio } */
  search(query, mediaTypes = ['track', 'album', 'artist', 'playlist'], limit = 20, libraryOnly = false) {
    return this.command('music/search', {
      search_query: query,
      media_types: mediaTypes,
      limit,
      library_only: libraryOnly,
    }, SLOW_TIMEOUT_MS);
  }

  /**
   * Bibliotekselementer av én type.
   * @param {'artist'|'album'|'track'|'playlist'|'radio'} mediaType
   * @param {{favorite?:boolean, search?:string, limit?:number, offset?:number, orderBy?:string}} opts
   *   orderBy: 'name' | 'timestamp_added_desc' | 'last_played_desc' | 'play_count_desc' | 'random' …
   */
  getLibraryItems(mediaType, { favorite, search, limit = 50, offset = 0, orderBy } = {}) {
    const plural = { artist: 'artists', album: 'albums', track: 'tracks', playlist: 'playlists', radio: 'radios' }[mediaType];
    const args = { limit, offset };
    if (favorite !== undefined) args.favorite = favorite;
    if (search) args.search = search;
    if (orderBy) args.order_by = orderBy;
    return this.command(`music/${plural}/library_items`, args);
  }
  getRecentlyPlayed(limit = 20, mediaTypes) {
    const args = { limit };
    if (mediaTypes) args.media_types = mediaTypes;
    return this.command('music/recently_played_items', args);
  }
  getAlbumTracks(itemId, provider)     { return this.command('music/albums/album_tracks',       { item_id: itemId, provider_instance_id_or_domain: provider }, SLOW_TIMEOUT_MS); }
  getArtistAlbums(itemId, provider)    { return this.command('music/artists/artist_albums',     { item_id: itemId, provider_instance_id_or_domain: provider }, SLOW_TIMEOUT_MS); }
  getArtistTracks(itemId, provider)    { return this.command('music/artists/artist_tracks',     { item_id: itemId, provider_instance_id_or_domain: provider }, SLOW_TIMEOUT_MS); }
  getPlaylistTracks(itemId, provider)  { return this.command('music/playlists/playlist_tracks', { item_id: itemId, provider_instance_id_or_domain: provider }, SLOW_TIMEOUT_MS); }
  getItemByUri(uri)                    { return this.command('music/item_by_uri', { uri }); }
  addFavorite(uri)                     { return this.command('music/favorites/add_item', { item: uri }); }
  removeFavorite(mediaType, libraryItemId) {
    return this.command('music/favorites/remove_item', { media_type: mediaType, library_item_id: libraryItemId });
  }

  // ── Internal ────────────────────────────────────────────────────

  _rawSend(msg, timeoutMs = CMD_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      const id    = msg.message_id;
      const timer = setTimeout(() => {
        this._pending.delete(id);
        reject(new Error(`MA timeout: ${msg.command}`));
      }, timeoutMs);
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
