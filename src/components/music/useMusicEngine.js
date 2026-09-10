// «Motoren» bak musikksiden: spillerliste (HA ⇄ MA), aktiv spiller, kø,
// avspillingsstatus og alle kommandoer. UI-komponentene er bare visning.
//
// Kobling HA ⇄ MA: HA-entitetens registry `unique_id` er identisk med MA sin
// `player_id` (= `queue_id`). Derfor trengs ingen navnematching.
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { hassAPI } from '../../services/hass-api';
import { maAPI } from '../../services/ma-api';
import { useHomey } from '../../context/HomeyContext';
import { cleanPlayerName, haArt, imgOf, artistNames, invalidateMaCache } from './musicUtils';

const ACTIVE_KEY = 'mp_active_player';
const REPEAT_NEXT = { off: 'all', all: 'one', one: 'off' };
const CMD_THROTTLE_MS = 600;

function readRegistry() {
  const reg = hassAPI.entityRegistry || [];
  const players = new Map();     // media_player entity_id → MA player_id
  const favButtons = new Map();  // MA player_id → button.*_favorite_song entity_id
  for (const r of reg) {
    if (r.platform !== 'music_assistant') continue;
    const uid = String(r.unique_id || '');
    if (r.entity_id?.startsWith('media_player.')) players.set(r.entity_id, uid);
    else if (r.entity_id?.startsWith('button.') && uid.endsWith('_favorite_now_playing')) {
      favButtons.set(uid.replace(/_favorite_now_playing$/, ''), r.entity_id);
    }
  }
  return { players, favButtons };
}

// Bare feltene UI-et bryr seg om – MA sender player_updated hyppig
function slimPlayer(p) {
  return {
    player_id: p.player_id, name: p.display_name || p.name, type: p.type, provider: p.provider,
    available: p.available, powered: p.powered, playback_state: p.playback_state,
    active_source: p.active_source, icon: p.icon, volume_level: p.volume_level,
    volume_muted: p.volume_muted, group_members: p.group_members || [],
    can_group_with: p.can_group_with || [], synced_to: p.synced_to || null,
    active_group: p.active_group || null,
  };
}
const sameSlim = (a, b) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b);

function slimQueue(q) {
  if (!q) return null;
  return {
    queue_id: q.queue_id, state: q.state, active: q.active, items: q.items,
    current_index: q.current_index, current_item: q.current_item, next_item: q.next_item,
    shuffle_enabled: q.shuffle_enabled, repeat_mode: q.repeat_mode, display_name: q.display_name,
  };
}

export function useMusicEngine() {
  const { showToast } = useHomey();
  const toast = useCallback((msg, type = 'success', ms = 2200) => showToast?.(msg, type, ms), [showToast]);

  const [registry, setRegistry] = useState(readRegistry);
  const [haPlayers, setHaPlayers] = useState([]);
  const [maPlayers, setMaPlayers] = useState({});
  const [maConnected, setMaConnected] = useState(maAPI.connected);
  const [activePlayerId, setActivePlayerIdState] = useState(() => localStorage.getItem(ACTIVE_KEY) || null);
  const [queue, setQueue] = useState(null);
  const [queueItems, setQueueItems] = useState([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [favOverrides, setFavOverrides] = useState(() => new Map());

  // ── HA: MA-spillere fra entitetsregisteret ───────────────────────
  const haPlayersRef = useRef([]);
  const refreshPlayers = useCallback(() => {
    const reg = readRegistry();
    setRegistry(prev => (prev.players.size === reg.players.size && prev.favButtons.size === reg.favButtons.size ? prev : reg));
    const ents = hassAPI.entities || {};
    let list = reg.players.size
      ? [...reg.players.keys()].map(id => ents[id]).filter(Boolean)
      : Object.values(ents).filter(e => e.entity_id?.startsWith('media_player.') && e.attributes?.app_id === 'music_assistant');
    list = list.filter(e => e.state !== 'unavailable');
    const prev = haPlayersRef.current;
    const unchanged = prev.length === list.length && prev.every((e, i) => e === list[i]);
    if (unchanged) return;
    haPlayersRef.current = list;
    setHaPlayers(list);
  }, []);

  useEffect(() => {
    refreshPlayers();
    // HA-registeret kan komme etter mount – poll til vi har spillere
    let tries = 0;
    const poll = setInterval(() => {
      refreshPlayers();
      if (haPlayersRef.current.length > 0 || ++tries > 30) clearInterval(poll);
    }, 2000);

    let raf = null;
    const prevHandler = hassAPI.onStateChanged;
    hassAPI.onStateChanged = (newState) => {
      if (prevHandler) prevHandler(newState);
      if (!newState?.entity_id?.startsWith('media_player.')) return;
      if (raf) return;
      raf = setTimeout(() => { raf = null; refreshPlayers(); }, 60);
    };
    return () => {
      clearInterval(poll);
      clearTimeout(raf);
      hassAPI.onStateChanged = prevHandler;
    };
  }, [refreshPlayers]);

  // Sørg for at aktiv spiller finnes; ellers velg fornuftig standard
  useEffect(() => {
    if (!haPlayers.length) return;
    if (activePlayerId && haPlayers.some(p => p.entity_id === activePlayerId)) return;
    const pick = haPlayers.find(p => p.state === 'playing')
      || haPlayers.find(p => p.state === 'paused')
      || haPlayers[0];
    if (pick) setActivePlayerIdState(pick.entity_id);
  }, [haPlayers, activePlayerId]);

  const selectPlayer = useCallback((entityId) => {
    setActivePlayerIdState(entityId);
    try { localStorage.setItem(ACTIVE_KEY, entityId); } catch { /* ignore */ }
  }, []);

  // ── MA: tilkobling + spillerdata ─────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const loadMa = async () => {
      try {
        const data = await maAPI.getPlayers();
        const arr = Array.isArray(data) ? data : Object.values(data || {});
        if (!cancelled) setMaPlayers(Object.fromEntries(arr.map(p => [p.player_id, slimPlayer(p)])));
      } catch { /* ikke tilkoblet ennå */ }
    };
    maAPI.connect().then(() => { if (!cancelled) { setMaConnected(true); loadMa(); } }).catch(() => {});
    const unsubC = maAPI.onConnectionChange(c => { if (cancelled) return; setMaConnected(c); if (c) loadMa(); });
    const upd = (p) => {
      if (!p?.player_id) return;
      const s = slimPlayer(p);
      setMaPlayers(prev => (sameSlim(prev[p.player_id], s) ? prev : { ...prev, [p.player_id]: s }));
    };
    const u1 = maAPI.on('player_updated', upd);
    const u2 = maAPI.on('player_added', upd);
    const u3 = maAPI.on('player_removed', (p) => {
      const id = typeof p === 'string' ? p : p?.player_id;
      if (id) setMaPlayers(prev => { const n = { ...prev }; delete n[id]; return n; });
    });
    return () => { cancelled = true; unsubC(); u1(); u2(); u3(); maAPI.disconnect(); };
  }, []);

  // ── Aktiv spiller / kø ──────────────────────────────────────────
  const activeEntity = useMemo(
    () => haPlayers.find(p => p.entity_id === activePlayerId) || null,
    [haPlayers, activePlayerId]
  );
  const activeQueueId = activePlayerId ? (registry.players.get(activePlayerId) || null) : null;
  const maPlayer = activeQueueId ? maPlayers[activeQueueId] || null : null;
  // Kommandoer går til MA-køen når den er (eller kan bli) aktiv kilde; spiller
  // enheten f.eks. Spotify Connect direkte, styres den via HA media_player.
  const useMaTransport = maConnected && !!activeQueueId
    && (!maPlayer?.active_source || maPlayer.active_source === activeQueueId);

  const loadQueue = useCallback(async (qid) => {
    if (!qid || !maAPI.connected) return;
    setQueueLoading(true);
    try {
      const [q, items] = await Promise.all([maAPI.getQueue(qid), maAPI.getQueueItems(qid, 500, 0)]);
      setQueue(slimQueue(q));
      setQueueItems(Array.isArray(items) ? items : []);
    } catch { /* behold forrige */ } finally {
      setQueueLoading(false);
    }
  }, []);

  useEffect(() => {
    setQueue(null);
    setQueueItems([]);
    if (activeQueueId && maConnected) loadQueue(activeQueueId);
  }, [activeQueueId, maConnected, loadQueue]);

  useEffect(() => {
    if (!activeQueueId) return undefined;
    let t = null;
    const u1 = maAPI.on('queue_updated', d => {
      if (d?.queue_id !== activeQueueId) return;
      const s = slimQueue(d);
      setQueue(prev => (prev && JSON.stringify(prev) === JSON.stringify(s) ? prev : s));
    });
    const u2 = maAPI.on('queue_items_updated', d => {
      if (d?.queue_id !== activeQueueId) return;
      clearTimeout(t);
      t = setTimeout(() => loadQueue(activeQueueId), 1500);
    });
    return () => { u1(); u2(); clearTimeout(t); };
  }, [activeQueueId, loadQueue]);

  // ── Avledet «spilles nå» ─────────────────────────────────────────
  const attrs = activeEntity?.attributes || {};
  const maItem = useMaTransport ? queue?.current_item?.media_item || null : null;
  const sourceLabel = maPlayer?.active_source && maPlayer.active_source !== activeQueueId
    ? maPlayer.active_source.charAt(0).toUpperCase() + maPlayer.active_source.slice(1)
    : null;

  const nowPlaying = useMemo(() => {
    const title = maItem?.name || attrs.media_title || '';
    return {
      hasMedia: !!title,
      title,
      artist: artistNames(maItem) || attrs.media_artist || '',
      album: maItem?.album?.name || attrs.media_album_name || '',
      albumItem: maItem?.album || null,
      artists: maItem?.artists || [],
      art: imgOf(maItem) || haArt(activeEntity),
      duration: attrs.media_duration || maItem?.duration || 0,
      position: attrs.media_position || 0,
      positionUpdatedAt: attrs.media_position_updated_at || null,
      state: activeEntity?.state || 'off',
      isPlaying: activeEntity?.state === 'playing',
      shuffle: attrs.shuffle ?? queue?.shuffle_enabled ?? false,
      repeat: attrs.repeat ?? queue?.repeat_mode ?? 'off',
      volume: attrs.volume_level ?? 0,
      muted: !!attrs.is_volume_muted,
      mediaItem: maItem,
      uri: maItem?.uri || null,
      sourceLabel,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEntity, maItem, queue?.shuffle_enabled, queue?.repeat_mode, sourceLabel]);

  // Sikkerhetsnett: HA melder sporbytte → hent køen på nytt (dersom en MA-hendelse gikk tapt)
  useEffect(() => {
    if (!activeQueueId || !maConnected) return undefined;
    const t = setTimeout(() => loadQueue(activeQueueId), 1200);
    return () => clearTimeout(t);
  }, [attrs.media_title, activeQueueId, maConnected, loadQueue]);

  // ── Kommandoer ──────────────────────────────────────────────────
  const lastCmdRef = useRef({});
  const throttled = (key) => {
    const now = Date.now();
    if (now - (lastCmdRef.current[key] || 0) < CMD_THROTTLE_MS) return false;
    lastCmdRef.current[key] = now;
    return true;
  };
  const haCall = useCallback((service, data) => {
    if (!activePlayerId) return Promise.resolve();
    return hassAPI.callService('media_player', service, activePlayerId, data);
  }, [activePlayerId]);

  const transport = useCallback((key, maFn, haService, haData) => {
    if (!throttled(key)) return;
    if (useMaTransport && activeQueueId) {
      maFn(activeQueueId).catch(() => haCall(haService, haData));
    } else {
      haCall(haService, haData);
    }
  }, [useMaTransport, activeQueueId, haCall]);

  const playPause = useCallback(() => transport('pp', q => maAPI.playPause(q), 'media_play_pause'), [transport]);
  const next      = useCallback(() => transport('next', q => maAPI.next(q), 'media_next_track'), [transport]);
  const previous  = useCallback(() => transport('prev', q => maAPI.previous(q), 'media_previous_track'), [transport]);
  const seek = useCallback((pos) => {
    if (useMaTransport && activeQueueId) maAPI.seek(activeQueueId, pos).catch(() => haCall('media_seek', { seek_position: pos }));
    else haCall('media_seek', { seek_position: pos });
  }, [useMaTransport, activeQueueId, haCall]);
  const toggleShuffle = useCallback(() => {
    const v = !nowPlaying.shuffle;
    if (useMaTransport && activeQueueId) maAPI.setShuffle(activeQueueId, v).catch(() => {});
    else haCall('shuffle_set', { shuffle: v });
  }, [nowPlaying.shuffle, useMaTransport, activeQueueId, haCall]);
  const cycleRepeat = useCallback(() => {
    const v = REPEAT_NEXT[nowPlaying.repeat] || 'all';
    if (useMaTransport && activeQueueId) maAPI.setRepeat(activeQueueId, v).catch(() => {});
    else haCall('repeat_set', { repeat: v });
  }, [nowPlaying.repeat, useMaTransport, activeQueueId, haCall]);

  const volumeTimers = useRef({});
  const setVolume = useCallback((entityId, value) => {
    // Optimistisk lokal oppdatering for jevn slider
    const list = haPlayersRef.current.map(p => (p.entity_id === entityId
      ? { ...p, attributes: { ...p.attributes, volume_level: value } } : p));
    haPlayersRef.current = list;
    setHaPlayers(list);
    clearTimeout(volumeTimers.current[entityId]);
    volumeTimers.current[entityId] = setTimeout(() => {
      hassAPI.callService('media_player', 'volume_set', entityId, { volume_level: value });
    }, 150);
  }, []);
  const setMute = useCallback((entityId, muted) => {
    hassAPI.callService('media_player', 'volume_mute', entityId, { is_volume_muted: muted });
  }, []);

  /** Spill et MA-medieobjekt. option: replace | next | add. startItem: URI i album/spilleliste. */
  const play = useCallback((item, option = 'replace', startItem = null) => {
    const uri = item?.uri;
    if (!uri) return;
    if (!activePlayerId) { toast('Velg en høyttaler først', 'warning'); return; }
    if (maAPI.connected && activeQueueId) {
      maAPI.playMedia(activeQueueId, uri, option, startItem)
        .catch(e => toast(`Kunne ikke spille: ${e?.message || e}`, 'error', 4000));
    } else {
      hassAPI.callService('music_assistant', 'play_media', activePlayerId, {
        media_id: uri, media_type: item.media_type, enqueue: option,
      });
    }
    if (option === 'add') toast('Lagt til i køen');
    else if (option === 'next') toast('Spilles som neste');
  }, [activePlayerId, activeQueueId, toast]);

  const playShuffled = useCallback(async (item) => {
    if (maAPI.connected && activeQueueId) {
      try { await maAPI.setShuffle(activeQueueId, true); } catch { /* ignore */ }
    }
    play(item, 'replace');
  }, [activeQueueId, play]);

  const playQueueItem = useCallback((queueItemId) => {
    if (!activeQueueId) return;
    maAPI.playQueueItem(activeQueueId, queueItemId).catch(e => toast(`Feil: ${e?.message || e}`, 'error'));
  }, [activeQueueId, toast]);

  const removeQueueItem = useCallback((queueItemId) => {
    if (!activeQueueId) return;
    setQueueItems(prev => prev.filter(i => i.queue_item_id !== queueItemId));
    maAPI.deleteQueueItem(activeQueueId, queueItemId).catch(e => toast(`Feil: ${e?.message || e}`, 'error'));
  }, [activeQueueId, toast]);

  const clearQueue = useCallback(() => {
    if (!activeQueueId) return;
    maAPI.clearQueue(activeQueueId).then(() => { setQueueItems([]); toast('Køen er tømt'); })
      .catch(e => toast(`Feil: ${e?.message || e}`, 'error'));
  }, [activeQueueId, toast]);

  const findPlayer = useCallback((entityId) => haPlayersRef.current.find(p => p.entity_id === entityId), []);

  /** Flytt det som spilles (hele køen) til en annen spiller. */
  const transferTo = useCallback((destEntityId) => {
    if (!activePlayerId || destEntityId === activePlayerId) return;
    const src = activeQueueId;
    const dst = registry.players.get(destEntityId);
    const destName = cleanPlayerName(findPlayer(destEntityId)?.attributes?.friendly_name) || 'spilleren';
    const done = () => { selectPlayer(destEntityId); toast(`Flyttet til ${destName}`); };
    if (maAPI.connected && src && dst) {
      maAPI.transferQueue(src, dst, true).then(done)
        .catch(e => toast(`Kunne ikke flytte: ${e?.message || e}`, 'error', 4000));
    } else {
      hassAPI.callService('music_assistant', 'transfer_queue', destEntityId, {
        source_player: activePlayerId, auto_play: true,
      }).then(done).catch(() => toast('Kunne ikke flytte', 'error'));
    }
  }, [activePlayerId, activeQueueId, registry, findPlayer, selectPlayer, toast]);

  /** Dynamisk gruppe rundt aktiv spiller (MA cmd/set_members). */
  const setGroupMembers = useCallback((add = [], remove = []) => {
    if (!activeQueueId || !maAPI.connected) return;
    maAPI.setMembers(activeQueueId, add, remove)
      .catch(e => toast(`Gruppering feilet: ${e?.message || e}`, 'error', 4000));
  }, [activeQueueId, toast]);

  // ── Favoritter ──────────────────────────────────────────────────
  const isFavorite = useCallback((item) => {
    if (!item?.uri) return false;
    return favOverrides.has(item.uri) ? favOverrides.get(item.uri) : !!item.favorite;
  }, [favOverrides]);

  const setFavOverride = (uri, v) => setFavOverrides(prev => new Map(prev).set(uri, v));

  const toggleFavorite = useCallback(async (item) => {
    if (!item?.uri || !maAPI.connected) return;
    const fav = isFavorite(item);
    try {
      if (fav) {
        if (item.provider !== 'library') { toast('Fjern favoritten i Music Assistant-appen', 'info', 3000); return; }
        await maAPI.removeFavorite(item.media_type, item.item_id);
        setFavOverride(item.uri, false);
        toast('Fjernet fra favoritter');
      } else {
        await maAPI.addFavorite(item.uri);
        setFavOverride(item.uri, true);
        toast('Lagt til i favoritter');
      }
      invalidateMaCache('lib:');
    } catch (e) {
      toast(`Feil: ${e?.message || e}`, 'error');
    }
  }, [isFavorite, toast]);

  const favoriteNowPlaying = useCallback(() => {
    if (nowPlaying.mediaItem) { toggleFavorite(nowPlaying.mediaItem); return; }
    const btn = activeQueueId && registry.favButtons.get(activeQueueId);
    if (btn) {
      hassAPI.callService('button', 'press', btn);
      toast('Lagt til i favoritter');
    }
  }, [nowPlaying.mediaItem, activeQueueId, registry, toggleFavorite, toast]);

  // ── Spillerliste til UI ─────────────────────────────────────────
  const players = useMemo(() => haPlayers.map(e => {
    const pid = registry.players.get(e.entity_id);
    const ma = pid ? maPlayers[pid] : null;
    return {
      entityId: e.entity_id,
      playerId: pid || null,
      name: ma?.name || cleanPlayerName(e.attributes?.friendly_name) || e.entity_id,
      area: hassAPI.entityToArea?.[e.entity_id] || '',
      state: e.state,
      volume: e.attributes?.volume_level ?? 0,
      muted: !!e.attributes?.is_volume_muted,
      mediaTitle: e.attributes?.media_title || '',
      icon: ma?.icon || '',
      type: ma?.type || 'player',
      groupMembers: ma?.group_members || [],
      canGroupWith: ma?.can_group_with || [],
      syncedTo: ma?.synced_to || null,
      entity: e,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'nb')), [haPlayers, maPlayers, registry]);

  const activePlayer = players.find(p => p.entityId === activePlayerId) || null;

  return {
    maConnected,
    players, activePlayer, activePlayerId, activeQueueId, selectPlayer,
    nowPlaying, useMaTransport,
    queue, queueItems, queueLoading, reloadQueue: () => loadQueue(activeQueueId),
    playPause, next, previous, seek, toggleShuffle, cycleRepeat, setVolume, setMute,
    play, playShuffled, playQueueItem, removeQueueItem, clearQueue,
    transferTo, setGroupMembers,
    isFavorite, toggleFavorite, favoriteNowPlaying,
    canFavoriteNowPlaying: !!nowPlaying.mediaItem || !!(activeQueueId && registry.favButtons.get(activeQueueId)),
    toast,
  };
}
