import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Music, Speaker, Volume2, VolumeX, Play, Pause,
  SkipBack, SkipForward, Shuffle, Repeat, Repeat1,
  Search, X, Settings, ListMusic, Plus, Loader,
  Mic, Disc, PlaySquare, Radio, ArrowRightLeft,
  ChevronLeft, ChevronRight, ChevronDown, Wifi, WifiOff,
  Eye, EyeOff
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { hassAPI } from '../services/hass-api';
import { maAPI } from '../services/ma-api';
import { proxiedServiceUrl } from '../services/utils';

// Expose for console debugging
if (typeof window !== 'undefined') {
  window._hassAPI = hassAPI;
  window._maAPI   = maAPI;
}
import { useHomey } from '../context/HomeyContext';
import '../styles/music-page.css';

// ── Helpers ────────────────────────────────────────────────────────

function fmtTime(secs) {
  if (!isFinite(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function getStateLabel(state) {
  if (state === 'playing') return { label: 'Spiller', cls: 'playing' };
  if (state === 'paused')  return { label: 'Pause', cls: 'paused' };
  return { label: 'Inaktiv', cls: 'idle' };
}

function artUrl(entity) {
  const pic = entity?.attributes?.entity_picture;
  if (!pic) return null;
  if (pic.startsWith('http')) return pic;
  const base = (hassAPI.url || '').replace(/\/$/, '');
  return `${base}${pic}`;
}

const SEARCH_TABS = [
  { key: 'track',    label: 'Spor',         Icon: Music },
  { key: 'album',    label: 'Album',        Icon: Disc },
  { key: 'artist',   label: 'Artister',     Icon: Mic },
  { key: 'playlist', label: 'Spillelister', Icon: ListMusic },
];

const TYPE_ICON = { track: Music, album: Disc, artist: Mic, playlist: ListMusic, radio: Radio };

// ── Left panel: single player row ─────────────────────────────────

function PlayerItem({ entity, isActive, onSelect, onVolumeChange, onMute, onTransfer, sourceHasMedia }) {
  const attrs = entity.attributes || {};
  const state = entity.state;
  const vol = attrs.volume_level ?? 0;
  const muted = attrs.is_volume_muted;
  const area = hassAPI.entityToArea?.[entity.entity_id] || '';
  const stateInfo = getStateLabel(state);

  const handleVolume = useCallback((e) => {
    e.stopPropagation();
    onVolumeChange(entity.entity_id, parseFloat(e.target.value));
  }, [entity.entity_id, onVolumeChange]);

  const handleMute = useCallback((e) => {
    e.stopPropagation();
    onMute(entity.entity_id, !muted);
  }, [entity.entity_id, muted, onMute]);

  const handleTransfer = useCallback((e) => {
    e.stopPropagation();
    onTransfer(entity.entity_id);
  }, [entity.entity_id, onTransfer]);

  return (
    <div
      className={`mp-player-item${isActive ? ' mp-player-item--active' : ''}`}
      onClick={() => onSelect(entity.entity_id)}
    >
      <div className="mp-player-row">
        <Speaker size={14} className="mp-player-icon" />
        <div className="mp-player-info">
          <div className="mp-player-name">{area || attrs.friendly_name}</div>
          {area && <div className="mp-player-area">{attrs.friendly_name}</div>}
        </div>
        {/* Transfer button: only on non-active players when source has media */}
        {!isActive && sourceHasMedia && (
          <button
            className="mp-transfer-btn"
            onClick={handleTransfer}
            title="Flytt musikk hit"
          >
            <ArrowRightLeft size={10} />
            Flytt hit
          </button>
        )}
        <span className={`mp-player-state mp-player-state--${stateInfo.cls}`}>
          {stateInfo.label}
        </span>
      </div>
      <div className="mp-volume-row">
        <button className={`mp-mute-btn${muted ? ' mp-mute-btn--muted' : ''}`} onClick={handleMute}>
          {muted ? <VolumeX size={11} /> : <Volume2 size={11} />}
        </button>
        <input
          className="mp-volume-slider"
          type="range" min={0} max={1} step={0.01}
          value={muted ? 0 : vol}
          onChange={handleVolume}
          onClick={e => e.stopPropagation()}
        />
        <span className="mp-volume-pct">{Math.round(vol * 100)}%</span>
      </div>
    </div>
  );
}

// ── Player dropdown ────────────────────────────────────────────────

function PlayerDropdown({ players, activeEntityId, onSelect, onVolumeChange, onMute, onTransfer, sourceHasMedia }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const activeEntity = players.find(p => p.entity_id === activeEntityId);
  const area = hassAPI.entityToArea?.[activeEntityId] || '';
  const name = activeEntity?.attributes?.friendly_name || activeEntityId || 'Velg spiller';
  const stateInfo = getStateLabel(activeEntity?.state);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div className="mp-player-dropdown" ref={ref}>
      <button className="mp-player-dropdown-trigger" onClick={() => setOpen(v => !v)}>
        <Speaker size={13} className="mp-player-dropdown-icon" />
        <span className="mp-player-dropdown-name">{area || name}</span>
        <span className={`mp-player-state mp-player-state--${stateInfo.cls}`}>{stateInfo.label}</span>
        <ChevronDown size={12} className={`mp-player-dropdown-chevron${open ? ' mp-player-dropdown-chevron--open' : ''}`} />
      </button>

      {open && window.innerWidth < 640 && (
        <div className="mp-player-dropdown-backdrop" onClick={() => setOpen(false)} />
      )}
      {open && (
        <div className="mp-player-dropdown-panel">
          <div className="mp-player-dropdown-label">Spillere</div>
          {players.length === 0 && (
            <div className="mp-search-empty" style={{ padding: '12px 14px' }}>Ingen spillere funnet</div>
          )}
          {players.map(entity => (
            <PlayerItem
              key={entity.entity_id}
              entity={entity}
              isActive={entity.entity_id === activeEntityId}
              onSelect={(id) => { onSelect(id); setOpen(false); }}
              onVolumeChange={onVolumeChange}
              onMute={onMute}
              onTransfer={(id) => { onTransfer(id); setOpen(false); }}
              sourceHasMedia={sourceHasMedia}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Center panel: now playing ──────────────────────────────────────

function NowPlaying({ entity, activeQueueId, currentMaTrack, maPlayers, onSelectPlayer, onVolumeChange, onMute, onTransfer, onBrowse }) {
  const [position, setPosition] = useState(0);
  const intervalRef = useRef(null);

  const attrs = entity?.attributes || {};
  const state = entity?.state;
  const isPlaying = state === 'playing';
  const duration = attrs.media_duration || 0;
  const shuffle = attrs.shuffle || false;
  const repeat = attrs.repeat || 'off';
  const vol = attrs.volume_level ?? 0;
  const muted = attrs.is_volume_muted || false;

  // MA real-time track data overrides stale HA entity during track transitions
  const maMedia = currentMaTrack?.media_item || null;
  const resolveImg = (obj) => proxiedServiceUrl(obj?.image_url
    || (typeof obj?.image === 'string' ? obj.image : null)
    || obj?.metadata?.images?.[0]?.url
    || obj?.metadata?.images?.[0]?.path);
  const maArt = resolveImg(currentMaTrack) || resolveImg(maMedia) || resolveImg(maMedia?.album);
  const albumArt = maArt || artUrl(entity);
  const mediaTitle  = maMedia?.name || attrs.media_title;
  const mediaArtist = maMedia?.artists?.map(a => a.name).join(', ') || attrs.media_artist;
  const mediaAlbum  = maMedia?.album?.name || attrs.media_album_name;

  // Interpolate playback position
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!entity) return;

    const basePos = attrs.media_position || 0;
    const updatedAt = attrs.media_position_updated_at
      ? new Date(attrs.media_position_updated_at).getTime() / 1000
      : Date.now() / 1000;

    const calc = () => {
      if (isPlaying) {
        setPosition(Math.min(basePos + (Date.now() / 1000 - updatedAt), duration || Infinity));
      } else {
        setPosition(basePos);
      }
    };
    calc();
    if (isPlaying) {
      intervalRef.current = setInterval(calc, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [entity?.entity_id, attrs.media_position, attrs.media_position_updated_at, isPlaying]);

  const handleSeekVisual = (e) => {
    setPosition(parseFloat(e.target.value));
  };

  const handleSeekCommit = (e) => {
    if (!entity || !duration) return;
    const val = parseFloat(e.target.value);
    setPosition(val);
    if (activeQueueId && maAPI.connected) {
      maAPI.seek(activeQueueId, val).catch(() => {
        hassAPI.callService('media_player', 'media_seek', entity.entity_id, { seek_position: val });
      });
    } else {
      hassAPI.callService('media_player', 'media_seek', entity.entity_id, { seek_position: val });
    }
  };

  const lastCmdRef = useRef({});
  const cmd = (maCmd, haService) => {
    const now = Date.now();
    const key = maCmd || haService;
    if (now - (lastCmdRef.current[key] || 0) < 800) return;
    lastCmdRef.current[key] = now;
    if (activeQueueId && maAPI.connected) {
      if (maCmd === 'play_pause') maAPI.playPause(activeQueueId).catch(() => {});
      else if (maCmd === 'next')   maAPI.next(activeQueueId).catch(() => {});
      else if (maCmd === 'prev')   maAPI.previous(activeQueueId).catch(() => {});
    } else if (haService) {
      hassAPI.callService('media_player', haService, entity?.entity_id);
    }
  };

  const toggleShuffle = () => {
    if (activeQueueId && maAPI.connected) {
      maAPI.setShuffle(activeQueueId, !shuffle).catch(() => {});
    } else {
      hassAPI.callService('media_player', 'shuffle_set', entity?.entity_id, { shuffle: !shuffle });
    }
  };

  const cycleRepeat = () => {
    const maRepeatMap = { off: 'one', one: 'all', all: 'off' };
    const haRepeatMap = { off: 'all', all: 'one', one: 'off' };
    if (activeQueueId && maAPI.connected) {
      const next = maRepeatMap[repeat] ?? 'one';
      maAPI.setRepeat(activeQueueId, next).catch(() => {});
    } else {
      const next = haRepeatMap[repeat] ?? 'all';
      hassAPI.callService('media_player', 'repeat_set', entity?.entity_id, { repeat: next });
    }
  };

  if (!entity) {
    return (
      <div className="mp-now-playing">
        <div className="mp-art-placeholder" style={{ width: 160, height: 160, borderRadius: 12 }}>
          <Music size={48} />
        </div>
        <p className="mp-idle-text">Velg en spiller til venstre</p>
      </div>
    );
  }

  const hasMedia = !!(mediaTitle);

  return (
    <div className="mp-now-playing">
      {/* Album art */}
      <div className="mp-art-wrapper">
        {albumArt && hasMedia ? (
          <img className="mp-art" src={albumArt} alt="" />
        ) : (
          <div className="mp-art-placeholder">
            <Music size={56} />
          </div>
        )}
      </div>

      {/* Track info */}
      <div className="mp-track-info">
        {hasMedia ? (
          <>
            <div className="mp-track-title">{mediaTitle}</div>
            <div className="mp-track-subtitle">
              {mediaArtist && (
                <button
                  className="mp-browse-link"
                  onClick={() => onBrowse?.(mediaArtist, 'artist')}
                  title="Gå til artist"
                >
                  {mediaArtist}
                </button>
              )}
              {mediaArtist && mediaAlbum && (
                <span className="mp-browse-sep"> · </span>
              )}
              {mediaAlbum && (
                <button
                  className="mp-browse-link"
                  onClick={() => onBrowse?.(mediaAlbum, 'album')}
                  title="Gå til album"
                >
                  {mediaAlbum}
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="mp-idle-text">
            {state === 'idle' || state === 'off' ? 'Inaktiv' : 'Laster…'}
          </div>
        )}
      </div>

      {/* Progress */}
      {hasMedia && duration > 0 && (
        <div className="mp-progress">
          <span className="mp-time">{fmtTime(position)}</span>
          <input
            className="mp-progress-bar"
            type="range" min={0} max={duration} step={1}
            value={Math.min(position, duration)}
            onChange={handleSeekVisual}
            onMouseUp={handleSeekCommit}
            onTouchEnd={handleSeekCommit}
          />
          <span className="mp-time mp-time--right">{fmtTime(duration)}</span>
        </div>
      )}

      {/* Transport */}
      <div className="mp-transport">
        <button className="mp-ctrl-btn" onClick={() => cmd('prev', 'media_previous_track')} disabled={!hasMedia}>
          <SkipBack size={22} />
        </button>
        <button className="mp-ctrl-btn mp-ctrl-btn--play" onClick={() => cmd('play_pause', 'media_play_pause')}>
          {isPlaying ? <Pause size={22} /> : <Play size={22} />}
        </button>
        <button className="mp-ctrl-btn" onClick={() => cmd('next', 'media_next_track')} disabled={!hasMedia}>
          <SkipForward size={22} />
        </button>
      </div>

      {/* Shuffle / repeat / player picker */}
      <div className="mp-secondary-controls">
        <button
          className={`mp-ctrl-btn${shuffle ? ' mp-ctrl-btn--active' : ''}`}
          onClick={toggleShuffle}
          title="Tilfeldig rekkefølge"
        >
          <Shuffle size={16} />
        </button>
        <button
          className={`mp-ctrl-btn${repeat !== 'off' ? ' mp-ctrl-btn--active' : ''}`}
          onClick={cycleRepeat}
          title="Gjenta"
        >
          {repeat === 'one' ? <Repeat1 size={16} /> : <Repeat size={16} />}
        </button>
        <PlayerDropdown
          players={maPlayers}
          activeEntityId={entity.entity_id}
          onSelect={onSelectPlayer}
          onVolumeChange={onVolumeChange}
          onMute={onMute}
          onTransfer={onTransfer}
          sourceHasMedia={!!mediaTitle}
        />
      </div>

      {/* Active player volume */}
      <div className="mp-active-volume">
        <button
          className={`mp-mute-btn${muted ? ' mp-mute-btn--muted' : ''}`}
          onClick={() => onMute?.(entity.entity_id, !muted)}
          title={muted ? 'Demp av' : 'Demp'}
        >
          {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
        <input
          className="mp-volume-slider mp-active-volume-slider"
          type="range" min={0} max={1} step={0.01}
          value={muted ? 0 : vol}
          onChange={e => onVolumeChange?.(entity.entity_id, parseFloat(e.target.value))}
        />
        <span className="mp-volume-pct">{Math.round(vol * 100)}%</span>
      </div>
    </div>
  );
}

// ── Search result item ────────────────────────────────────────────

function ResultItem({ item, type, onPlay, onAdd, onBrowse }) {
  const Icon = TYPE_ICON[type] || Music;
  const sub = useMemo(() => {
    if (type === 'track')    return [item.artists?.map(a => a.name).join(', '), item.album?.name].filter(Boolean).join(' · ');
    if (type === 'album')    return item.artists?.map(a => a.name).join(', ') || '';
    if (type === 'artist')   return '';
    if (type === 'playlist') return item.owner ? `av ${item.owner}` : '';
    return '';
  }, [item, type]);

  // MA direct API may nest images under metadata.images[0].path or similar
  const thumb = proxiedServiceUrl(item.image_url
    || (typeof item.image === 'string' ? item.image : null)
    || item.metadata?.images?.[0]?.path
    || item.metadata?.images?.[0]?.url
    || item.thumb);
  const browsable = (type === 'artist' || type === 'album') && !!onBrowse;

  return (
    <div className="mp-result-item">
      <div
        className={`mp-result-main${browsable ? ' mp-result-main--browsable' : ''}`}
        onClick={browsable ? () => onBrowse(item, type) : undefined}
      >
        {thumb ? (
          <img className="mp-result-thumb" src={thumb} alt="" />
        ) : (
          <div className="mp-result-thumb-placeholder">
            <Icon size={16} />
          </div>
        )}
        <div className="mp-result-info">
          <div className="mp-result-name">{item.name}</div>
          {sub && <div className="mp-result-sub">{sub}</div>}
        </div>
        {type === 'track' && item.duration && (
          <span className="mp-result-duration">{fmtTime(item.duration)}</span>
        )}
        {browsable && <ChevronRight size={12} className="mp-result-chevron" />}
      </div>
      <div className="mp-result-actions">
        <button className="mp-result-add" onClick={() => onAdd(item, type)} title="Legg til i kø">
          <Plus size={12} />
        </button>
        <button className="mp-result-play" onClick={() => onPlay(item, type)} title="Spill nå">
          <Play size={12} />
        </button>
      </div>
    </div>
  );
}

// ── Queue item ────────────────────────────────────────────────────

function QueueItem({ item, index, isCurrent, onPlay }) {
  const media = item.media_item || item;
  const resolveThumb = (obj) => proxiedServiceUrl(obj?.image_url
    || (typeof obj?.image === 'string' ? obj.image : null)
    || obj?.metadata?.images?.[0]?.path
    || obj?.metadata?.images?.[0]?.url
    || obj?.thumb);
  const thumb = resolveThumb(media) || resolveThumb(item);
  const trackName = media.name || item.name;
  const artistStr = (media.artists || item.artists)?.map(a => a.name).join(', ') || '';

  return (
    <div
      className={`mp-queue-item${isCurrent ? ' mp-queue-item--current' : ''}${onPlay ? ' mp-queue-item--clickable' : ''}`}
      onClick={onPlay}
      title={onPlay && !isCurrent ? 'Spill denne låten' : undefined}
    >
      <span className="mp-queue-item-idx">
        {isCurrent ? <Play size={10} /> : index + 1}
      </span>
      {thumb ? (
        <img className="mp-result-thumb" src={thumb} alt="" />
      ) : (
        <div className="mp-result-thumb-placeholder">
          <Music size={14} />
        </div>
      )}
      <div className="mp-result-info">
        <div className="mp-result-name">{trackName}</div>
        {artistStr && <div className="mp-result-sub">{artistStr}</div>}
      </div>
      {item.duration && <span className="mp-result-duration">{fmtTime(item.duration)}</span>}
    </div>
  );
}

// ── Right panel: search ───────────────────────────────────────────

function SearchPanel({ activeEntityId, activeQueueId, maConfigEntryId, browseTarget, playerState, onCollapse }) {
  const [activePanel, setActivePanel] = useState('search'); // 'search' | 'queue'
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null);
  const [searchError, setSearchError] = useState(null);
  const [activeTab, setActiveTab] = useState('track');
  const [queue, setQueue] = useState(null);
  const [queueItems, setQueueItems] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [queueError, setQueueError] = useState(null);
  // drilldown: null | { type, item, results, loading, error, parent }
  const [drilldown, setDrilldown] = useState(null);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  // Respond to external browse requests (from NowPlaying artist/album links)
  useEffect(() => {
    if (!browseTarget) return;
    setActivePanel('search');
    setQuery(browseTarget.query);
    setActiveTab(browseTarget.tab);
    setDrilldown(null);
  }, [browseTarget?.key]);

  // Clear drilldown when user types a new search
  useEffect(() => {
    if (query.trim()) setDrilldown(null);
  }, [query]);

  const runSearch = useCallback(async (q) => {
    if (!q.trim()) return;
    setSearching(true);
    setSearchError(null);
    setResults(null);
    try {
      let data;
      if (maAPI.connected) {
        data = await maAPI.search(q.trim(), ['track', 'album', 'artist', 'playlist'], 20);
      } else if (maConfigEntryId) {
        const raw = await hassAPI.callServiceWithResponse('music_assistant', 'search', null, {
          config_entry_id: maConfigEntryId,
          name: q.trim(),
          media_type: ['track', 'album', 'artist', 'playlist'],
          limit: 10,
        });
        data = raw?.tracks !== undefined ? raw : raw?.response || raw || {};
      } else {
        setSearchError('Ikke tilkoblet Music Assistant. Sjekker tilkobling…');
        maAPI.connect().catch(() => {});
        return;
      }
      setResults(data || {});
    } catch (e) {
      setSearchError(`Søk feilet: ${e?.message || e}`);
    } finally {
      setSearching(false);
    }
  }, [maConfigEntryId]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults(null); return; }
    debounceRef.current = setTimeout(() => runSearch(query), 500);
    return () => clearTimeout(debounceRef.current);
  }, [query, runSearch]);

  // Tracks the queue ID actually used by the last successful loadQueue call.
  // activeQueueId may be null for groups where name-matching fails, but once
  // loadQueue discovers the ID via getQueues(), we store it here so that
  // real-time events can still match against it.
  const resolvedQueueIdRef = useRef(null);

  const loadQueue = useCallback(async (qid) => {
    let queueId = qid ?? activeQueueId;
    if (!maAPI.connected && !activeEntityId) return;
    setLoadingQueue(true);
    setQueueError(null);
    try {
      if (maAPI.connected) {
        // If we don't have a queue ID yet, try exact/area match against all queues.
        // Never fall back to "first playing queue" — that sends commands to the wrong player.
        if (!queueId) {
          const allQueues = await maAPI.getQueues();
          if (Array.isArray(allQueues) && allQueues.length > 0) {
            const normalize = (s) => (s || '').toLowerCase().trim().replace(/\s*\(ma\)\s*$/, '').trim();
            const haName     = normalize(hassAPI.entities?.[activeEntityId]?.attributes?.friendly_name || '');
            const area       = normalize(hassAPI.entityToArea?.[activeEntityId] || '');
            const entityPart = normalize(
              (activeEntityId || '').replace(/^media_player\./, '').replace(/_?ma$/, '').replace(/_/g, ' ')
            );
            const byCombined   = haName && area && allQueues.find(q => {
              const n = normalize(q.display_name);
              return n === haName + ' ' + area || n === area + ' ' + haName;
            });
            const byExact      = haName     && allQueues.find(q => normalize(q.display_name) === haName);
            const byArea       = area       && allQueues.find(q => normalize(q.display_name) === area);
            const byEntityId   = entityPart && allQueues.find(q => normalize(q.display_name) === entityPart);
            queueId = (byCombined || byExact || byArea || byEntityId)?.queue_id || null;
          }
        }
        // MA path: load full queue with item list
        if (queueId) {
          resolvedQueueIdRef.current = queueId;
          const [queueData, items] = await Promise.all([
            maAPI.getQueue(queueId),
            maAPI.getQueueItems(queueId, 200, 0),
          ]);
          setQueue(queueData);
          setQueueItems(Array.isArray(items) ? items : []);
          return;
        }
        // MA connected but couldn't resolve queue — fall through to HA service
      }
      // HA fallback: no MA connection or queue ID couldn't be resolved
      if (!activeEntityId) return;
      const res = await hassAPI.callServiceWithResponse('music_assistant', 'get_queue', activeEntityId, {});
      const queueData = (res?.items !== undefined || res?.queue_items !== undefined)
        ? res : (Object.values(res || {})[0] ?? res);
      setQueue(queueData);
      setQueueItems([]);
    } catch (e) {
      setQueueError(e?.message || 'Ukjent feil');
    } finally {
      setLoadingQueue(false);
    }
  }, [activeQueueId, activeEntityId]);

  // Load queue when player changes
  useEffect(() => {
    if (activeQueueId || activeEntityId) loadQueue();
  }, [activeQueueId, activeEntityId]);

  // Subscribe to MA real-time queue events.
  // queue_items_updated fires mid-transition (track change); querying MA during
  // that window causes an extra skip — debounce by 3s, same as the original fix.
  const eventDebounceRef = useRef(null);
  useEffect(() => {
    const matchesQueue = (qid) =>
      qid && (qid === activeQueueId || qid === resolvedQueueIdRef.current);

    const unsub1 = maAPI.on('queue_updated', (data) => {
      if (matchesQueue(data?.queue_id)) {
        setQueue(prev => ({ ...prev, ...data }));
      }
    });
    const unsub2 = maAPI.on('queue_items_updated', (data) => {
      if (matchesQueue(data?.queue_id)) {
        clearTimeout(eventDebounceRef.current);
        eventDebounceRef.current = setTimeout(() => loadQueue(), 3000);
      }
    });
    return () => {
      unsub1();
      unsub2();
      clearTimeout(eventDebounceRef.current);
    };
  }, [activeQueueId, loadQueue]);

  const stateDebounceRef = useRef(null);

  const playMedia = useCallback((item, type, enqueue = 'replace') => {
    const mediaUri = item.uri || item.item_id || item.name;
    const optionMap = { replace: 'replace', add: 'add', next: 'next' };
    if (activeQueueId && maAPI.connected) {
      maAPI.playMedia(activeQueueId, mediaUri, optionMap[enqueue] || 'replace').catch(() => {});
    } else if (activeEntityId) {
      hassAPI.callService('music_assistant', 'play_media', activeEntityId, {
        media_id: mediaUri,
        media_type: type,
        enqueue,
      });
    }
    clearTimeout(stateDebounceRef.current);
    stateDebounceRef.current = setTimeout(() => loadQueue(), 3000);
  }, [activeQueueId, activeEntityId, loadQueue]);

  const addToQueue = useCallback((item, type) => playMedia(item, type, 'add'), [playMedia]);

  // Drill into artist (→ albums) or album (→ tracks)
  const browseDrilldown = useCallback(async (item, type) => {
    setDrilldown(prev => ({ type, item, results: null, loading: true, error: null, parent: prev }));
    try {
      let drillResults;
      if (type === 'artist') {
        let albums;
        if (maAPI.connected) {
          const raw = await maAPI.search(item.name, ['album'], 30);
          albums = raw?.albums || [];
        } else if (maConfigEntryId) {
          const raw = await hassAPI.callServiceWithResponse('music_assistant', 'search', null, {
            config_entry_id: maConfigEntryId, name: item.name, media_type: ['album'], limit: 30,
          });
          albums = raw?.albums || raw?.response?.albums || [];
        }
        drillResults = (albums || []).filter(a =>
          a.artists?.some(ar => ar.name.toLowerCase() === item.name.toLowerCase())
        );
      } else if (type === 'album') {
        const artistName = item.artists?.[0]?.name || item.name;
        let tracks;
        if (maAPI.connected) {
          const raw = await maAPI.search(artistName, ['track'], 50);
          tracks = raw?.tracks || [];
        } else if (maConfigEntryId) {
          const raw = await hassAPI.callServiceWithResponse('music_assistant', 'search', null, {
            config_entry_id: maConfigEntryId, name: artistName, media_type: ['track'], limit: 50,
          });
          tracks = raw?.tracks || raw?.response?.tracks || [];
        }
        drillResults = (tracks || []).filter(t =>
          t.album?.name === item.name || (item.item_id && t.album?.item_id === item.item_id)
        );
      }
      setDrilldown(curr => {
        if (!curr || curr.item?.item_id !== item.item_id || curr.type !== type) return curr;
        return { ...curr, results: drillResults, loading: false };
      });
    } catch (e) {
      setDrilldown(curr => {
        if (!curr || curr.item?.item_id !== item.item_id) return curr;
        return { ...curr, loading: false, error: e?.message || 'Feil ved lasting' };
      });
    }
  }, [maConfigEntryId]);

  const tabResults = useMemo(() => {
    if (!results) return [];
    const map = { track: results.tracks, album: results.albums, artist: results.artists, playlist: results.playlists };
    return map[activeTab] || [];
  }, [results, activeTab]);

  // Derived queue data – computed once for display + badge
  const { itemList, totalCount, currentItem, nextItem, currentIdx } = useMemo(() => {
    const fallbackList = Array.isArray(queue?.items) ? queue.items
      : Array.isArray(queue?.queue_items) ? queue.queue_items : [];
    const list = queueItems.length > 0 ? queueItems : fallbackList;
    const rawTotal = queue?.items;
    return {
      itemList: list,
      totalCount: typeof rawTotal === 'number' ? rawTotal : list.length,
      currentItem: queue?.current_item ?? null,
      nextItem: queue?.next_item ?? null,
      currentIdx: queue?.current_index ?? -1,
    };
  }, [queue, queueItems]);

  const drillTypeLabel = drilldown?.type === 'artist' ? 'Album' : 'Spor';
  const drillChildType = drilldown?.type === 'artist' ? 'album' : 'track';

  return (
    <>
      {/* ── Tab-toggle + collapse ── */}
      <div className="mp-panel-toggle">
        <button
          className={`mp-panel-toggle-btn${activePanel === 'search' ? ' mp-panel-toggle-btn--active' : ''}`}
          onClick={() => setActivePanel('search')}
        >
          <Search size={12} />
          Søk
        </button>
        <button
          className={`mp-panel-toggle-btn${activePanel === 'queue' ? ' mp-panel-toggle-btn--active' : ''}`}
          onClick={() => setActivePanel('queue')}
        >
          <ListMusic size={12} />
          Kø
          {totalCount > 0 && (
            <span className="mp-panel-toggle-badge">{totalCount}</span>
          )}
        </button>
        <div style={{ flex: 1 }} />
        {onCollapse && (
          <button className="mp-collapse-btn" onClick={onCollapse} title="Skjul panel">
            <ChevronRight size={14} />
          </button>
        )}
      </div>

      {/* ── SØKE-PANEL ── */}
      {activePanel === 'search' && (
        <>
          <div className="mp-search-header">
            <div className="mp-search-input-row">
              <Search size={14} style={{ color: 'rgba(255,255,255,0.35)', flexShrink: 0 }} />
              <input
                ref={inputRef}
                className="mp-search-input"
                placeholder="Søk etter musikk…"
                value={query}
                onChange={e => setQuery(e.target.value)}
              />
              {query && (
                <button className="mp-search-clear" onClick={() => { setQuery(''); setResults(null); }}>
                  <X size={13} />
                </button>
              )}
            </div>
            {results && !drilldown && (
              <div className="mp-search-tabs">
                {SEARCH_TABS.map(({ key, label }) => (
                  <button
                    key={key}
                    className={`mp-search-tab${activeTab === key ? ' mp-search-tab--active' : ''}`}
                    onClick={() => setActiveTab(key)}
                  >
                    {label}
                    {results[key + 's'] !== undefined && (
                      <span style={{ marginLeft: 3, opacity: 0.6 }}>
                        ({(results[key + 's'] || []).length})
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {drilldown && (
            <div className="mp-drill-breadcrumb">
              <button
                className="mp-drill-back"
                onClick={() => setDrilldown(d => d?.parent ?? null)}
              >
                <ChevronLeft size={13} />
                {drilldown.parent ? drilldown.parent.item.name : 'Søk'}
              </button>
              <div className="mp-drill-heading">
                <span className="mp-drill-title">{drilldown.item.name}</span>
                <span className="mp-drill-sub">{drillTypeLabel}</span>
              </div>
            </div>
          )}

          <div className="mp-search-body">
            {drilldown ? (
              <>
                {drilldown.loading && (
                  <div className="mp-search-spinner">
                    <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />
                  </div>
                )}
                {drilldown.error && !drilldown.loading && (
                  <div className="mp-search-empty" style={{ color: '#f87171', opacity: 1, fontSize: '0.75rem', padding: '12px' }}>
                    {drilldown.error}
                  </div>
                )}
                {!drilldown.loading && !drilldown.error && drilldown.results?.length === 0 && (
                  <div className="mp-search-empty">
                    Ingen {drillTypeLabel.toLowerCase()} funnet for {drilldown.item.name}
                  </div>
                )}
                {drilldown.results?.map((item, i) => (
                  <ResultItem
                    key={item.item_id || i}
                    item={item}
                    type={drillChildType}
                    onPlay={(it, tp) => playMedia(it, tp, 'replace')}
                    onAdd={addToQueue}
                    onBrowse={browseDrilldown}
                  />
                ))}
              </>
            ) : (
              <>
                {searching && (
                  <div className="mp-search-spinner">
                    <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />
                  </div>
                )}
                {searchError && !searching && (
                  <div className="mp-search-empty" style={{ color: '#f87171', opacity: 1, fontSize: '0.75rem', padding: '12px' }}>
                    {searchError}
                  </div>
                )}
                {results && !searching && !searchError && (
                  tabResults.length === 0 ? (
                    <div className="mp-search-empty">
                      Ingen {SEARCH_TABS.find(t => t.key === activeTab)?.label?.toLowerCase()} funnet
                    </div>
                  ) : (
                    tabResults.map((item, i) => (
                      <ResultItem
                        key={item.item_id || i}
                        item={item}
                        type={activeTab}
                        onPlay={(it, tp) => playMedia(it, tp, 'replace')}
                        onAdd={addToQueue}
                        onBrowse={browseDrilldown}
                      />
                    ))
                  )
                )}
                {!results && !searching && !searchError && (
                  <div className="mp-search-empty">
                    Søk etter artister, album, spor eller spillelister
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* ── KØ-PANEL ── */}
      {activePanel === 'queue' && (
        <div className="mp-search-body">
          <div className="mp-section-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 12 }}>
            <span>Spillekø</span>
            <button
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', opacity: 0.6, padding: 0, display: 'flex' }}
              onClick={() => loadQueue()}
              title="Oppdater kø"
            >
              {loadingQueue
                ? <Loader size={11} style={{ animation: 'spin 1s linear infinite' }} />
                : <PlaySquare size={11} />}
            </button>
          </div>

          {queueError && (
            <div className="mp-search-empty" style={{ color: '#f87171', fontSize: '0.72rem', padding: '8px 12px', opacity: 1 }}>
              {queueError}
            </div>
          )}
          {loadingQueue && !queue && (
            <div className="mp-search-spinner">
              <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          )}
          {!queue && !loadingQueue && (
            <div className="mp-search-empty">
              {activeEntityId ? 'Køen er tom' : 'Velg en spiller for å se kø'}
            </div>
          )}

          {/* Full item list (when MA returns actual array) */}
          {itemList.length > 0 && itemList.map((item, i) => {
            const isCurrentItem = i === currentIdx || item.queue_item_id === currentItem?.queue_item_id;
            const effectiveQueueId = activeQueueId || resolvedQueueIdRef.current;
            return (
              <QueueItem
                key={item.queue_item_id || item.item_id || i}
                item={item}
                index={i}
                isCurrent={isCurrentItem}
                onPlay={!isCurrentItem && effectiveQueueId && item.queue_item_id
                  ? () => maAPI.playQueueItem(effectiveQueueId, item.queue_item_id).catch(() => {})
                  : undefined}
              />
            );
          })}

          {/* Partial: MA only returned current + next */}
          {queue && itemList.length === 0 && (() => {
            if (!currentItem && !nextItem) return (
              <div className="mp-search-empty">Køen er tom</div>
            );
            const visible = [
              currentItem && { item: currentItem, idx: currentIdx, isCurrent: true },
              nextItem    && { item: nextItem,    idx: currentIdx + 1, isCurrent: false },
            ].filter(Boolean);
            const remaining = totalCount - visible.length;
            const effectiveQueueId = activeQueueId || resolvedQueueIdRef.current;
            return (
              <>
                {visible.map(({ item, idx, isCurrent }) => (
                  <QueueItem
                    key={item.queue_item_id || idx}
                    item={item}
                    index={idx}
                    isCurrent={isCurrent}
                    onPlay={!isCurrent && effectiveQueueId && item.queue_item_id
                      ? () => maAPI.playQueueItem(effectiveQueueId, item.queue_item_id).catch(() => {})
                      : undefined}
                  />
                ))}
                {remaining > 0 && (
                  <div className="mp-search-empty" style={{ opacity: 0.5, fontSize: '0.75rem', paddingTop: 8 }}>
                    + {remaining} sanger til i køen
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}
    </>
  );
}

// ── Mobile mini now-playing bar ────────────────────────────────────

function MiniNowPlaying({ entity, activeQueueId, onTap }) {
  const attrs = entity?.attributes || {};
  const isPlaying = entity?.state === 'playing';
  const albumArt = artUrl(entity);

  const handlePlayPause = (e) => {
    e.stopPropagation();
    if (activeQueueId && maAPI.connected) {
      maAPI.playPause(activeQueueId).catch(() => {});
    } else if (entity) {
      hassAPI.callService('media_player', 'media_play_pause', entity.entity_id);
    }
  };

  return (
    <div className="mp-mini-bar" onClick={onTap}>
      {albumArt ? (
        <img className="mp-mini-art" src={albumArt} alt="" />
      ) : (
        <div className="mp-mini-art mp-mini-art--placeholder"><Music size={14} /></div>
      )}
      <div className="mp-mini-info">
        <div className="mp-mini-title">{attrs.media_title || 'Ingenting spilles'}</div>
        {attrs.media_artist && <div className="mp-mini-artist">{attrs.media_artist}</div>}
      </div>
      <button className="mp-mini-play" onClick={handlePlayPause}>
        {isPlaying ? <Pause size={18} /> : <Play size={18} />}
      </button>
    </div>
  );
}

// ── MA Settings overlay ────────────────────────────────────────────

function MASettingsOverlay({ onClose }) {
  const [host,  setHost]  = useState(() => maAPI.host  || '');
  const [port,  setPort]  = useState(() => String(maAPI.port  || 8095));
  const [token, setToken] = useState(() => maAPI.token || '');
  const [showToken, setShowToken] = useState(false);
  const [status, setStatus] = useState(null); // null | 'saving' | 'ok' | 'error'

  const save = async () => {
    if (!token.trim()) { setStatus('error'); return; }
    setStatus('saving');
    await maAPI.configure({ host: host.trim(), port: parseInt(port, 10) || 8095, token: token.trim() });
    try {
      await maAPI.connect();
      setStatus('ok');
      setTimeout(onClose, 800);
    } catch {
      setStatus('error');
    }
  };

  return createPortal(
    <div className="modal">
      <div className="modal-content" style={{ maxWidth: 460, display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h2>Music Assistant-tilkobling</h2>
          <button className="icon-btn close-modal" onClick={onClose}><X size={24} /></button>
        </div>

        <div className="modal-body" style={{ overflowY: 'auto' }}>
          <div className="form-group">
            <label>Host</label>
            <input
              type="text"
              value={host}
              onChange={e => setHost(e.target.value)}
              placeholder="192.168.1.x"
              spellCheck={false}
            />
          </div>

          <div className="form-group">
            <label>Port</label>
            <input
              type="number"
              value={port}
              onChange={e => setPort(e.target.value)}
              placeholder="8095"
            />
          </div>

          <div className="form-group">
            <label>Token (langtidstoken)</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="eyJ…"
                spellCheck={false}
                style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.85em' }}
              />
              <button
                className="icon-btn"
                onClick={() => setShowToken(v => !v)}
                title={showToken ? 'Skjul token' : 'Vis token'}
                style={{ flexShrink: 0 }}
              >
                {showToken ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <p className="hint">
              Lag token i Music Assistant under Innstillinger → Sikkerhet → Langtidstoken.
            </p>
          </div>

          {status === 'error' && (
            <p className="hint" style={{ color: 'var(--color-error, #ef4444)' }}>
              Kunne ikke koble til – sjekk host, port og token.
            </p>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Avbryt</button>
          <button
            className="btn btn-primary"
            onClick={save}
            disabled={status === 'saving'}
            style={status === 'ok' ? { background: '#22c55e', borderColor: '#22c55e' } : undefined}
          >
            {status === 'saving' ? 'Kobler til…' : status === 'ok' ? 'Tilkoblet ✓' : 'Lagre og koble til'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Main MusicPage ─────────────────────────────────────────────────

export default function MusicPage({ page }) {
  const { isEditMode } = useHomey();

  const [maPlayers, setMaPlayers] = useState([]);
  const [activePlayerId, setActivePlayerId] = useState(null);
  const [maConfigEntryId, setMaConfigEntryId] = useState(null);
  // Current track from MA (more real-time than HA entity during track transitions)
  const [currentMaTrack, setCurrentMaTrack] = useState(null);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [browseTarget, setBrowseTarget] = useState(null);
  const [maConnected, setMaConnected] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [mobileTab, setMobileTab] = useState('player'); // 'player' | 'search'
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  // Full MA player list – used to derive activeQueueId reactively
  const [maApiPlayers, setMaApiPlayers] = useState([]);

  const handleBrowse = useCallback((query, tab) => {
    setRightCollapsed(false);
    setMobileTab('search');
    setBrowseTarget(prev => ({ key: (prev?.key ?? 0) + 1, query, tab }));
  }, []);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const volumeTimerRef = useRef({});

  // Resolve MA config entry ID: try entityRegistry first, fall back to WS call
  useEffect(() => {
    let cancelled = false;
    const tryResolve = async () => {
      // Method 1: already-loaded entity registry (platform field)
      const reg = hassAPI.entityRegistry || [];
      const regEntry = reg.find(e =>
        e.platform === 'music_assistant' || e.integration === 'music_assistant'
      );
      if (regEntry?.config_entry_id) {
        if (!cancelled) setMaConfigEntryId(regEntry.config_entry_id);
        return;
      }
      // Method 2: config/config_entries/list WS call
      try {
        const entries = await hassAPI.getConfigEntries();
        const entry = entries?.find(e => e.domain === 'music_assistant');
        if (entry?.entry_id && !cancelled) setMaConfigEntryId(entry.entry_id);
      } catch (e) {
        console.warn('MA config entry lookup failed:', e);
      }
    };
    tryResolve();
    // Retry after a short delay in case HA wasn't ready on mount
    const t = setTimeout(tryResolve, 3000);
    return () => { cancelled = true; clearTimeout(t); };
  }, []);

  // Connect to MA WebSocket and load player list
  useEffect(() => {
    let cancelled = false;

    const loadMaPlayers = async () => {
      try {
        const data = await maAPI.getPlayers();
        // MA may return array or dict keyed by player_id
        const players = Array.isArray(data)
          ? data
          : (data && typeof data === 'object' ? Object.values(data) : []);
        if (!cancelled && players.length > 0) setMaApiPlayers(players);
      } catch {}
    };

    maAPI.connect()
      .then(() => { if (!cancelled) { setMaConnected(true); loadMaPlayers(); } })
      .catch(() => {});

    const unsub = maAPI.onConnectionChange((connected) => {
      if (!cancelled) {
        setMaConnected(connected);
        if (connected) loadMaPlayers();
      }
    });

    // Refresh MA player list when HA entities arrive (in case timing was off)
    const haReadyTimer = setTimeout(() => {
      if (!cancelled && maAPI.connected) loadMaPlayers();
    }, 4000);

    return () => { cancelled = true; unsub(); clearTimeout(haReadyTimer); maAPI.disconnect(); };
  }, []);

  // Collect MA entities from hassAPI and subscribe to updates.
  // Uses entity registry (platform='music_assistant') so the list is stable regardless
  // of current app_id (which reflects the streaming source, not the integration).
  const refreshPlayers = useCallback(() => {
    const all = Object.values(hassAPI.entities || {});
    const maEntityIds = new Set(
      (hassAPI.entityRegistry || [])
        .filter(r => r.platform === 'music_assistant' && r.entity_id?.startsWith('media_player.'))
        .map(r => r.entity_id)
    );
    const ma = all.filter(e =>
      e.entity_id?.startsWith('media_player.') &&
      (maEntityIds.has(e.entity_id) || e.attributes?.app_id === 'music_assistant')
    );
    ma.sort((a, b) => (a.attributes?.friendly_name || '').localeCompare(b.attributes?.friendly_name || '', 'nb'));
    setMaPlayers(ma);
    // Only auto-select on first load (prev === null). Never override an explicit user selection —
    // involuntary switches send commands to the wrong player/queue.
    setActivePlayerId(prev => {
      if (prev !== null) return prev;
      return (
        ma.find(p => p.state === 'playing')?.entity_id ||
        ma.find(p => p.state === 'paused')?.entity_id ||
        ma[0]?.entity_id ||
        null
      );
    });
  }, []); // no deps: reads live from hassAPI at call time

  useEffect(() => {
    refreshPlayers();

    // Poll every 4s until players are found (handles HA not yet connected on mount)
    const poll = setInterval(() => {
      if (Object.keys(hassAPI.entities || {}).length > 0) {
        refreshPlayers();
        clearInterval(poll);
      }
    }, 4000);

    const prev = hassAPI.onStateChanged;
    hassAPI.onStateChanged = (newState) => {
      if (prev) prev(newState);
      if (newState.entity_id?.startsWith('media_player.')) {
        refreshPlayers();
      }
    };
    return () => {
      clearInterval(poll);
      hassAPI.onStateChanged = prev;
    };
  }, [refreshPlayers]);

  const activeEntity = maPlayers.find(p => p.entity_id === activePlayerId) || null;

  // Derive activeQueueId: match the active HA entity to an MA player (player_id === queue_id).
  // Only exact matches to avoid sending commands to the wrong queue.
  const activeQueueId = useMemo(() => {
    if (!activeEntity || !maApiPlayers.length) {
      console.log('[MA match] skip — activeEntity:', !!activeEntity, 'maApiPlayers:', maApiPlayers.length);
      return null;
    }
    const normalize = (s) => (s || '').toLowerCase().trim().replace(/\s*\(ma\)\s*$/, '').trim();
    const maNames = maApiPlayers.map(p => ({ id: p.player_id, name: normalize(p.display_name) }));

    // 1. Exact friendly_name match
    const haName = normalize(activeEntity.attributes?.friendly_name);
    let found = maApiPlayers.find(p => normalize(p.display_name) === haName);
    if (found) { console.log('[MA match] tier1 name:', haName, '→', found.player_id); return found.player_id; }

    // 2. Area match
    const area = normalize(hassAPI.entityToArea?.[activeEntity.entity_id] || '');
    if (area) {
      found = maApiPlayers.find(p => normalize(p.display_name) === area);
      if (found) { console.log('[MA match] tier2 area:', area, '→', found.player_id); return found.player_id; }
    }

    // 2b. Combined name + area (e.g. HA friendly="Høyttaler" area="Vaskerom" → MA "Høyttaler Vaskerom")
    if (haName && area) {
      found = maApiPlayers.find(p => {
        const n = normalize(p.display_name);
        return n === haName + ' ' + area || n === area + ' ' + haName;
      });
      if (found) { console.log('[MA match] tier2b combined:', haName, '+', area, '→', found.player_id); return found.player_id; }
    }

    // 3. Entity ID match: strip "media_player." + "_ma" suffix + underscores
    const entityPart = normalize(
      (activeEntity.entity_id || '').replace(/^media_player\./, '').replace(/_?ma$/, '').replace(/_/g, ' ')
    );
    if (entityPart) {
      found = maApiPlayers.find(p => normalize(p.display_name) === entityPart);
      if (found) { console.log('[MA match] tier3 entityId:', entityPart, '→', found.player_id); return found.player_id; }
    }

    console.log('[MA match] NO MATCH — haName:', haName, 'area:', area, 'entityPart:', entityPart, 'MA names:', maNames);
    return null;
  }, [activeEntity, maApiPlayers]);

  const handleVolumeChange = useCallback((entityId, value) => {
    // Update local state immediately for smooth slider
    setMaPlayers(prev => prev.map(p =>
      p.entity_id === entityId
        ? { ...p, attributes: { ...p.attributes, volume_level: value } }
        : p
    ));
    // Debounce HA call
    clearTimeout(volumeTimerRef.current[entityId]);
    volumeTimerRef.current[entityId] = setTimeout(() => {
      hassAPI.callService('media_player', 'volume_set', entityId, { volume_level: value });
    }, 150);
  }, []);

  const handleMute = useCallback((entityId, muted) => {
    hassAPI.callService('media_player', 'volume_mute', entityId, { is_volume_muted: muted });
  }, []);

  const handleTransfer = useCallback((destinationEntityId) => {
    if (!activePlayerId || destinationEntityId === activePlayerId) return;
    hassAPI.callService('music_assistant', 'transfer_queue', destinationEntityId, {
      source_player: activePlayerId,
      auto_play: true,
    });
    setActivePlayerId(destinationEntityId);
  }, [activePlayerId]);

  // Reset MA track info when switching players, and subscribe to real-time queue updates
  useEffect(() => {
    setCurrentMaTrack(null);
  }, [activeQueueId]);

  useEffect(() => {
    return maAPI.on('queue_updated', (data) => {
      // Require an exact match — never accept events from unknown/other queues
      if (!data?.queue_id || !activeQueueId || data.queue_id !== activeQueueId) return;
      if ('current_item' in data) setCurrentMaTrack(data.current_item || null);
    });
  }, [activeQueueId]);

  // Auto-open settings if token is not configured
  useEffect(() => {
    if (!maAPI.token) setShowSettings(true);
  }, []);

  return (
    <div className={`music-page${isEditMode ? ' music-page--edit' : ''}`}>
      {showSettings && <MASettingsOverlay onClose={() => setShowSettings(false)} />}

      <div className="mp-header">
        {isEditMode && (
          <>
            <Music size={18} style={{ opacity: 0.6 }} />
            <span className="mp-header-title">{page?.name || 'Musikk'}</span>
          </>
        )}
        <div style={{ flex: 1 }} />
        <button
          className="mp-settings-btn"
          onClick={() => setShowSettings(true)}
          title={maConnected ? 'MA-innstillinger' : 'Kobler til Music Assistant…'}
        >
          {maConnected
            ? <Settings size={15} />
            : <WifiOff size={15} style={{ color: '#f87171' }} />}
        </button>
      </div>

      <div className="mp-columns">
        {/* Center: now playing */}
        <div className={`mp-panel-center${isMobile && mobileTab !== 'player' ? ' mp-panel--mobile-hidden' : ''}`}>
          <NowPlaying
            entity={activeEntity}
            activeQueueId={activeQueueId}
            currentMaTrack={currentMaTrack}
            maPlayers={maPlayers}
            onSelectPlayer={setActivePlayerId}
            onVolumeChange={handleVolumeChange}
            onMute={handleMute}
            onTransfer={handleTransfer}
            onBrowse={handleBrowse}
          />
        </div>

        {/* Right: search + queue */}
        <div className={`mp-panel-right${!isMobile && rightCollapsed ? ' mp-panel-right--collapsed' : ''}${isMobile && mobileTab !== 'search' ? ' mp-panel--mobile-hidden' : ''}`}>
          {/* Mini now-playing bar: mobile only, in search tab */}
          {isMobile && (
            <MiniNowPlaying
              entity={activeEntity}
              activeQueueId={activeQueueId}
              onTap={() => setMobileTab('player')}
            />
          )}
          {!isMobile && rightCollapsed ? (
            <div className="mp-panel-tab-strip" onClick={() => setRightCollapsed(false)} title="Vis søk / kø">
              <ChevronLeft size={14} style={{ color: 'var(--color-text-secondary)', opacity: 0.6 }} />
              <span className="mp-panel-tab-label">Søk / Kø</span>
            </div>
          ) : (
            <SearchPanel
              activeEntityId={activePlayerId}
              activeQueueId={activeQueueId}
              maConfigEntryId={maConfigEntryId}
              browseTarget={browseTarget}
              playerState={activeEntity?.state}
              onCollapse={isMobile ? undefined : () => setRightCollapsed(true)}
            />
          )}
        </div>
      </div>

      {/* Mobile bottom tab bar */}
      {isMobile && (
        <div className="mp-mobile-tabs">
          <button
            className={`mp-mobile-tab${mobileTab === 'player' ? ' mp-mobile-tab--active' : ''}`}
            onClick={() => setMobileTab('player')}
          >
            <Music size={20} />
            <span>Spiller</span>
          </button>
          <button
            className={`mp-mobile-tab${mobileTab === 'search' ? ' mp-mobile-tab--active' : ''}`}
            onClick={() => setMobileTab('search')}
          >
            <Search size={20} />
            <span>Søk / Kø</span>
          </button>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
