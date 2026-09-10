// Visninger for musikksiden: Hjem, Søk, Bibliotek, Detalj (album/artist/
// spilleliste), Kø – pluss delte byggeklosser (kort, sporrader, hurtigmeny).
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Play, Pause, Heart, Ellipsis, Search, X, Music, Disc, Mic,
  Loader, Shuffle, ListPlus, ListEnd, Trash2, ChevronRight, Clock, Settings, RefreshCw,
} from 'lucide-react';
import { maAPI } from '../../services/ma-api';
import {
  imgOf, subtitleOf, artistNames, fmtTime, fmtDurationLong, greeting,
  TYPE_LABEL, TYPE_PLURAL, TYPE_ICON, useMaData, isSameTrack, useArtColor,
  loadRecentItems, pushRecentItem, removeRecentItem, isTouchDevice,
} from './musicUtils';

const stop = (e) => { e.stopPropagation(); };

// ── Små byggeklosser ───────────────────────────────────────────────

export function Spinner({ size = 22 }) {
  return (
    <div className="mp-spinner"><Loader size={size} className="mp-spin" /></div>
  );
}

export function Empty({ children, error }) {
  return <div className={`mp-empty${error ? ' mp-empty--error' : ''}`}>{children}</div>;
}

const brokenImages = new Set(); // URL-er som ga lastefeil (MA-genererte spillelister uten bilde o.l.)

export function Art({ item, type = item?.media_type, size, className = '', round }) {
  const Icon = TYPE_ICON[type] || Music;
  const src = imgOf(item);
  const [broken, setBroken] = useState(null);
  const style = size ? { width: size, height: size } : undefined;
  const cls = `mp-art${round || type === 'artist' ? ' mp-art--round' : ''} ${className}`;
  if (src && broken !== src && !brokenImages.has(src)) {
    return (
      <img className={cls} src={src} alt="" style={style} loading="lazy" draggable={false}
        onError={() => { brokenImages.add(src); setBroken(src); }} />
    );
  }
  return <div className={`${cls} mp-art--empty`} style={style}><Icon size={size ? Math.max(14, size * 0.42) : 28} /></div>;
}

export function PlayBtn({ playing, onClick, size = 48, className = '', title }) {
  const icon = Math.round(size * 0.45);
  return (
    <button
      className={`mp-playbtn ${className}`}
      style={{ width: size, height: size }}
      onClick={(e) => { e.stopPropagation(); onClick?.(e); }}
      title={title || (playing ? 'Pause' : 'Spill')}
      aria-label={playing ? 'Pause' : 'Spill'}
    >
      {playing ? <Pause size={icon} fill="currentColor" strokeWidth={0} /> : <Play size={icon} fill="currentColor" strokeWidth={0} style={{ marginLeft: size * 0.06 }} />}
    </button>
  );
}

export function Equalizer() {
  return <span className="mp-eq" aria-label="Spiller"><i /><i /><i /></span>;
}

function HeartBtn({ item, ui, size = 18, className = '' }) {
  const fav = ui.engine.isFavorite(item);
  if (!item?.uri) return null;
  return (
    <button
      className={`mp-iconbtn mp-heart${fav ? ' mp-heart--on' : ''} ${className}`}
      onClick={(e) => { e.stopPropagation(); ui.engine.toggleFavorite(item); }}
      title={fav ? 'Fjern fra favoritter' : 'Legg til i favoritter'}
    >
      <Heart size={size} fill={fav ? 'currentColor' : 'none'} />
    </button>
  );
}

// ── Kort / hyller / rutenett ───────────────────────────────────────

const isContainer = (type) => type === 'album' || type === 'artist' || type === 'playlist';

export function MediaCard({ item, type = item.media_type, ui, sub }) {
  const open = () => (isContainer(type) ? ui.openItem(item) : ui.engine.play(item));
  return (
    <div className="mp-card" onClick={open} role="button" tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') open(); }}>
      <div className="mp-card-art">
        <Art item={item} type={type} />
        <PlayBtn className="mp-card-play" size={40} onClick={() => ui.engine.play(item)} title="Spill" />
      </div>
      <div className="mp-card-name" title={item.name}>{item.name}</div>
      <div className="mp-card-sub">{sub ?? subtitleOf(item, type)}</div>
      <button className="mp-iconbtn mp-card-more" onClick={(e) => { e.stopPropagation(); ui.openMenu(item, e); }} title="Mer">
        <Ellipsis size={16} />
      </button>
    </div>
  );
}

export function Shelf({ title, items, type, ui, onShowAll, sub, loading, error }) {
  if (!loading && !error && !items?.length) return null;
  return (
    <section className="mp-shelf">
      <div className="mp-shelf-head">
        <h2 className="mp-h2" onClick={onShowAll} style={onShowAll ? { cursor: 'pointer' } : undefined}>{title}</h2>
        {onShowAll && <button className="mp-linkbtn" onClick={onShowAll}>Vis alle</button>}
      </div>
      {error ? <Empty error>{error}</Empty> : loading && !items?.length ? <Spinner /> : (
        <div className="mp-shelf-row">
          {items.map((it, i) => (
            <MediaCard key={it.uri || it.item_id || i} item={it} type={type || it.media_type} ui={ui}
              sub={typeof sub === 'function' ? sub(it) : sub} />
          ))}
        </div>
      )}
    </section>
  );
}

export function CardGrid({ items, type, ui, sub }) {
  return (
    <div className="mp-grid">
      {items.map((it, i) => (
        <MediaCard key={it.uri || it.item_id || i} item={it} type={type || it.media_type} ui={ui}
          sub={typeof sub === 'function' ? sub(it) : sub} />
      ))}
    </div>
  );
}

// ── Sporrader ──────────────────────────────────────────────────────

export function TrackRow({ track, index, ui, showArt, showAlbum, onPlay, menuContext, removable, onRemove }) {
  const { nowPlaying } = ui.engine;
  const media = track.media_item || track;
  const current = isSameTrack(track, nowPlaying);
  const artists = media.artists || [];
  const duration = media.duration || track.duration;
  return (
    <div
      className={`mp-track${current ? ' mp-track--current' : ''}`}
      onClick={onPlay}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onPlay?.(); }}
    >
      <div className="mp-track-idx">
        {current && nowPlaying.isPlaying
          ? <Equalizer />
          : <span className="mp-track-num">{index != null ? index + 1 : ''}</span>}
        <Play size={14} fill="currentColor" strokeWidth={0} className="mp-track-hoverplay" />
      </div>
      {showArt && <Art item={media} type="track" size={40} className="mp-track-art" />}
      <div className="mp-track-main">
        <div className="mp-track-name">{media.name || track.name}</div>
        <div className="mp-track-sub">
          {artists.length ? artists.map((a, i) => (
            <React.Fragment key={a.uri || a.item_id || i}>
              {i > 0 && ', '}
              <span className="mp-link" onClick={(e) => { stop(e); ui.goToArtist(a); }}>{a.name}</span>
            </React.Fragment>
          )) : (artistNames(media) || (media.media_type === 'radio' ? 'Radio' : ''))}
        </div>
      </div>
      {showAlbum && (
        <div className="mp-track-album">
          {media.album && (
            <span className="mp-link" onClick={(e) => { stop(e); ui.openItem(media.album); }}>{media.album.name}</span>
          )}
        </div>
      )}
      <HeartBtn item={media} ui={ui} size={16} className="mp-track-fav" />
      <span className="mp-track-dur">{duration ? fmtTime(duration) : ''}</span>
      {removable ? (
        <button className="mp-iconbtn mp-track-more" onClick={(e) => { stop(e); onRemove?.(); }} title="Fjern fra køen">
          <X size={16} />
        </button>
      ) : (
        <button className="mp-iconbtn mp-track-more" onClick={(e) => { stop(e); ui.openMenu(media, e, menuContext); }} title="Mer">
          <Ellipsis size={16} />
        </button>
      )}
    </div>
  );
}

export function TrackList({ tracks, ui, container, showArt, showAlbum, startIndex = 0 }) {
  const wide = ui.layout === 'wide';
  const albumCol = showAlbum && wide;
  return (
    <div className={`mp-tracklist${albumCol ? ' mp-tracklist--album' : ''}${showArt ? ' mp-tracklist--art' : ''}`}>
      {wide && (
        <div className="mp-track mp-track--head">
          <div className="mp-track-idx">#</div>
          {showArt && <div />}
          <div className="mp-track-main">Tittel</div>
          {albumCol && <div className="mp-track-album">Album</div>}
          <div />
          <span className="mp-track-dur"><Clock size={14} /></span>
          <div />
        </div>
      )}
      {tracks.map((t, i) => (
        <TrackRow
          key={t.queue_item_id || t.uri || t.item_id || i}
          track={t}
          index={startIndex + i}
          ui={ui}
          showArt={showArt}
          showAlbum={albumCol}
          menuContext={container}
          onPlay={() => (container && container.media_type !== 'artist'
            ? ui.engine.play(container, 'replace', t.uri)
            : ui.engine.play(t))}
        />
      ))}
    </div>
  );
}

// ── Hjem ───────────────────────────────────────────────────────────

const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'nb');

export function HomeView({ ui }) {
  const on = ui.engine.maConnected;
  const playlists = useMaData('lib:playlist:recent', () =>
    maAPI.getLibraryItems('playlist', { limit: 30, orderBy: 'last_played_desc' })
      .catch(() => maAPI.getLibraryItems('playlist', { limit: 30, orderBy: 'name' })), on);
  const recent = useMaData('recent', () => maAPI.getRecentlyPlayed(40), on);
  const albums = useMaData('lib:album:new', () => maAPI.getLibraryItems('album', { limit: 20, orderBy: 'timestamp_added_desc' }), on);
  const artists = useMaData('lib:artist:recent', () =>
    maAPI.getLibraryItems('artist', { limit: 20, orderBy: 'last_played_desc' })
      .catch(() => maAPI.getLibraryItems('artist', { limit: 20, orderBy: 'name' })), on);
  const radios = useMaData('lib:radio:all', () => maAPI.getLibraryItems('radio', { limit: 30, orderBy: 'name' }), on);

  const recentItems = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const it of recent.data || []) {
      const k = it.media_type === 'track' ? (it.album?.uri || it.album?.name || it.uri) : it.uri;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(it);
      if (out.length >= 16) break;
    }
    return out;
  }, [recent.data]);

  const quick = (playlists.data?.length ? playlists.data : albums.data || []).slice(0, 6);

  return (
    <div className="mp-view mp-home">
      <div className="mp-view-head">
        <h1 className="mp-h1">{greeting()}</h1>
        {ui.layout === 'mobile' && (
          <button className="mp-iconbtn" onClick={ui.openSettings} title="Music Assistant-innstillinger"><Settings size={20} /></button>
        )}
      </div>

      {!on && (
        <Empty>Ikke tilkoblet Music Assistant – kobler til…</Empty>
      )}

      {quick.length > 0 && (
        <div className="mp-quick">
          {quick.map(it => (
            <div key={it.uri} className="mp-quick-tile" onClick={() => ui.openItem(it)} role="button" tabIndex={0}>
              <Art item={it} size={56} className="mp-quick-art" />
              <span className="mp-quick-name">{it.name}</span>
              <PlayBtn className="mp-quick-play" size={36} onClick={() => ui.engine.play(it)} />
            </div>
          ))}
        </div>
      )}

      <Shelf title="Nylig spilt" items={recentItems} ui={ui} loading={recent.loading}
        sub={(it) => (it.media_type === 'track' ? artistNames(it) : subtitleOf(it))} />
      <Shelf title="Spillelister" items={playlists.data || []} type="playlist" ui={ui}
        loading={playlists.loading} onShowAll={() => ui.showAll('playlist')} />
      <Shelf title="Nytt i biblioteket" items={albums.data || []} type="album" ui={ui}
        loading={albums.loading} onShowAll={() => ui.showAll('album')} />
      <Shelf title="Artister" items={artists.data || []} type="artist" ui={ui}
        loading={artists.loading} onShowAll={() => ui.showAll('artist')} />
      <Shelf title="Radio" items={radios.data || []} type="radio" ui={ui}
        loading={radios.loading} onShowAll={() => ui.showAll('radio')} />
    </div>
  );
}

// ── Søk ────────────────────────────────────────────────────────────

const SEARCH_TYPES = ['track', 'artist', 'album', 'playlist', 'radio'];
const FILTERS = [
  { key: 'all', label: 'Alt' }, { key: 'track', label: 'Spor' }, { key: 'artist', label: 'Artister' },
  { key: 'album', label: 'Album' }, { key: 'playlist', label: 'Spillelister' }, { key: 'radio', label: 'Radio' },
];
const searchMemo = { query: '', results: null, filter: 'all' }; // overlever navigasjon

const resultsOf = (results, type) => {
  if (!results) return [];
  const map = { track: results.tracks, artist: results.artists, album: results.albums, playlist: results.playlists, radio: results.radio || results.radios };
  return map[type] || [];
};

export function SearchView({ ui }) {
  const [query, setQuery] = useState(searchMemo.query);
  const [results, setResults] = useState(searchMemo.results);
  const [filter, setFilter] = useState(searchMemo.filter);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [recent, setRecent] = useState(loadRecentItems);
  const inputRef = useRef(null);
  const reqRef = useRef(0);
  const on = ui.engine.maConnected;

  useEffect(() => { searchMemo.query = query; searchMemo.results = results; searchMemo.filter = filter; }, [query, results, filter]);
  useEffect(() => { if (!isTouchDevice()) inputRef.current?.focus(); }, []);

  // Tilstand oppdateres i handleren; effekten planlegger bare selve søket (debounce 350 ms)
  const changeQuery = (q) => {
    setQuery(q);
    setError(null);
    if (!q.trim()) { setResults(null); setLoading(false); } else setLoading(true);
  };
  useEffect(() => {
    const q = query.trim();
    if (!q || !on) return undefined;
    const id = ++reqRef.current;
    const t = setTimeout(() => {
      maAPI.search(q, SEARCH_TYPES, 25)
        .then(r => { if (reqRef.current === id) { setResults(r || {}); setLoading(false); } })
        .catch(e => { if (reqRef.current === id) { setError(`Søk feilet: ${e?.message || e}`); setLoading(false); } });
    }, 350);
    return () => clearTimeout(t);
  }, [query, on]);
  const shownError = error || (query.trim() && !on ? 'Ikke tilkoblet Music Assistant' : null);

  // Husk elementer man åpner/spiller fra søk
  const sui = useMemo(() => ({
    ...ui,
    openItem: (it) => { pushRecentItem(it); ui.openItem(it); },
    engine: {
      ...ui.engine,
      play: (it, opt, start) => { if (opt === undefined || opt === 'replace') pushRecentItem(it); ui.engine.play(it, opt, start); },
    },
  }), [ui]);

  const tracks = resultsOf(results, 'track');
  const artists = resultsOf(results, 'artist');
  const albums = resultsOf(results, 'album');
  const playlists = resultsOf(results, 'playlist');
  const radios = resultsOf(results, 'radio');
  const hasAny = tracks.length + artists.length + albums.length + playlists.length + radios.length > 0;

  const top = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (it) => (it.name || '').toLowerCase() === q;
    return artists.find(match) || albums.find(match) || playlists.find(match) || tracks.find(match)
      || artists[0] || tracks[0] || albums[0] || playlists[0] || radios[0] || null;
  }, [query, artists, albums, playlists, tracks, radios]);

  const removeRecent = (uri) => setRecent(removeRecentItem(uri));

  return (
    <div className="mp-view mp-searchview">
      <div className="mp-search-bar">
        <Search size={20} className="mp-search-icon" />
        <input
          ref={inputRef}
          className="mp-search-input"
          placeholder="Hva vil du høre på?"
          value={query}
          onChange={e => changeQuery(e.target.value)}
          enterKeyHint="search"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        {query && (
          <button className="mp-iconbtn mp-search-clear" onClick={() => { changeQuery(''); inputRef.current?.focus(); }} title="Tøm">
            <X size={18} />
          </button>
        )}
      </div>

      {query.trim() && results && hasAny && (
        <div className="mp-chips">
          {FILTERS.filter(f => f.key === 'all' || resultsOf(results, f.key).length > 0).map(f => (
            <button key={f.key} className={`mp-chip${filter === f.key ? ' mp-chip--on' : ''}`} onClick={() => setFilter(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {!query.trim() && (
        recent.length ? (
          <section className="mp-shelf">
            <div className="mp-shelf-head"><h2 className="mp-h2">Nylige søk</h2>
              <button className="mp-linkbtn" onClick={() => { localStorage.removeItem('mp_recent_items'); setRecent([]); }}>Tøm</button>
            </div>
            <div className="mp-shelf-row">
              {recent.map(it => (
                <div key={it.uri} className="mp-card-wrap">
                  <MediaCard item={it} ui={sui} />
                  <button className="mp-iconbtn mp-card-x" onClick={(e) => { stop(e); removeRecent(it.uri); }} title="Fjern"><X size={14} /></button>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <Empty>Søk etter artister, album, spor, spillelister eller radio</Empty>
        )
      )}

      {query.trim() && on && loading && !results && <Spinner />}
      {shownError && <Empty error>{shownError}</Empty>}
      {query.trim() && results && !loading && !hasAny && !shownError && <Empty>Ingen treff for «{query.trim()}»</Empty>}

      {query.trim() && results && hasAny && filter === 'all' && (
        <>
          <div className="mp-search-top">
            {top && (
              <section className="mp-search-topsec">
                <h2 className="mp-h2">Beste treff</h2>
                <div className="mp-top-result" onClick={() => (isContainer(top.media_type) ? sui.openItem(top) : sui.engine.play(top))} role="button" tabIndex={0}>
                  <Art item={top} size={92} className="mp-top-art" />
                  <div className="mp-top-name">{top.name}</div>
                  <div className="mp-top-sub">
                    <span className="mp-top-type">{TYPE_LABEL[top.media_type]}</span>
                    {top.media_type !== 'artist' && artistNames(top) && <> · {artistNames(top)}</>}
                  </div>
                  <PlayBtn className="mp-top-play" size={48} onClick={() => sui.engine.play(top)} />
                </div>
              </section>
            )}
            {tracks.length > 0 && (
              <section className="mp-search-tracksec">
                <h2 className="mp-h2">Spor</h2>
                <TrackList tracks={tracks.slice(0, 5)} ui={sui} showArt />
              </section>
            )}
          </div>
          <Shelf title="Artister" items={artists} type="artist" ui={sui} onShowAll={() => setFilter('artist')} />
          <Shelf title="Album" items={albums} type="album" ui={sui} onShowAll={() => setFilter('album')} />
          <Shelf title="Spillelister" items={playlists} type="playlist" ui={sui} onShowAll={() => setFilter('playlist')} />
          <Shelf title="Radio" items={radios} type="radio" ui={sui} onShowAll={() => setFilter('radio')} />
        </>
      )}

      {query.trim() && results && hasAny && filter === 'track' && (
        <TrackList tracks={tracks} ui={sui} showArt showAlbum />
      )}
      {query.trim() && results && hasAny && filter !== 'all' && filter !== 'track' && (
        <CardGrid items={resultsOf(results, filter)} type={filter} ui={sui} />
      )}
    </div>
  );
}

// ── Bibliotek ──────────────────────────────────────────────────────

const LIB_TABS = [
  { key: 'playlist', label: 'Spillelister' }, { key: 'album', label: 'Album' },
  { key: 'artist', label: 'Artister' }, { key: 'radio', label: 'Radio' }, { key: 'track', label: 'Likte spor' },
];

export function LibraryView({ ui, type: initialType = 'playlist' }) {
  const [type, setType] = useState(initialType);
  const [filter, setFilter] = useState('');
  const on = ui.engine.maConnected;
  // Ny «Vis alle»-navigasjon endrer ønsket fane
  const [prevInitial, setPrevInitial] = useState(initialType);
  if (initialType !== prevInitial) {
    setPrevInitial(initialType);
    setType(initialType);
  }

  const { data, loading, error, reload } = useMaData(`lib:${type}:all`, () =>
    maAPI.getLibraryItems(type, { limit: 500, orderBy: 'name', favorite: type === 'track' ? true : undefined }), on);

  const items = useMemo(() => {
    const list = [...(data || [])].sort(byName);
    const f = filter.trim().toLowerCase();
    if (!f) return list;
    return list.filter(it => (it.name || '').toLowerCase().includes(f) || artistNames(it).toLowerCase().includes(f) || (it.owner || '').toLowerCase().includes(f));
  }, [data, filter]);

  return (
    <div className="mp-view mp-library">
      <div className="mp-view-head">
        <h1 className="mp-h1">Ditt bibliotek</h1>
        <button className="mp-iconbtn" onClick={reload} title="Oppdater"><RefreshCw size={18} className={loading ? 'mp-spin' : ''} /></button>
      </div>
      <div className="mp-chips">
        {LIB_TABS.map(t => (
          <button key={t.key} className={`mp-chip${type === t.key ? ' mp-chip--on' : ''}`} onClick={() => setType(t.key)}>{t.label}</button>
        ))}
      </div>
      <div className="mp-search-bar mp-search-bar--small">
        <Search size={16} className="mp-search-icon" />
        <input className="mp-search-input" placeholder={`Filtrer ${TYPE_PLURAL[type].toLowerCase()}…`} value={filter} onChange={e => setFilter(e.target.value)} />
        {filter && <button className="mp-iconbtn mp-search-clear" onClick={() => setFilter('')}><X size={16} /></button>}
      </div>
      {!on && <Empty>Ikke tilkoblet Music Assistant</Empty>}
      {error && <Empty error>{error}</Empty>}
      {loading && !data && <Spinner />}
      {data && !items.length && <Empty>{filter ? 'Ingen treff' : `Ingen ${TYPE_PLURAL[type].toLowerCase()} i biblioteket`}</Empty>}
      {items.length > 0 && (
        <>
          <div className="mp-count">{items.length} {TYPE_PLURAL[type].toLowerCase()}</div>
          {type === 'track'
            ? <TrackList tracks={items} ui={ui} showArt showAlbum />
            : <CardGrid items={items} type={type} ui={ui} />}
        </>
      )}
    </div>
  );
}

// ── Detalj: album / spilleliste / artist ───────────────────────────

export function DetailView({ item, ui }) {
  const type = item.media_type;
  const on = ui.engine.maConnected;
  const key = `detail:${type}:${item.provider}:${item.item_id}`;
  // Bibliotek-artister har bare de få sporene/albumene som er lagt til lokalt; for
  // «Populære» og full diskografi må vi spørre kilde-provideren (Spotify o.l.) via provider_mappings.
  const needFull = !imgOf(item) || (type === 'album' && !item.artists?.length)
    || (type === 'artist' && item.provider === 'library' && !item.provider_mappings);
  const full = useMaData(needFull && item.uri ? `${key}:item` : null, () => maAPI.getItemByUri(item.uri), on);
  const shown = full.data || item;
  const fullReady = !needFull || !!full.data || !!full.error;
  const extMap = type === 'artist' && item.provider === 'library'
    ? (shown.provider_mappings || []).find(m => m.provider_instance && m.provider_instance !== 'library' && m.available !== false) || null
    : null;
  const mapKey = extMap ? `${extMap.provider_instance}:${extMap.item_id}` : 'own';
  const mergeUnique = (lists) => {
    const seen = new Set();
    // Nøkkel = navn (samme spor finnes både som library:// og spotify://)
    return lists.flat().filter(t => { const k = (t.name || '').toLowerCase(); if (!k || seen.has(k)) return false; seen.add(k); return true; });
  };
  const withExternal = async (fn) => {
    const own = await fn(item.item_id, item.provider).catch(() => []);
    if (!extMap) return own;
    const ext = await fn(extMap.item_id, extMap.provider_instance).catch(() => []);
    return mergeUnique([own || [], ext || []]);
  };

  const tracks = useMaData(type !== 'artist' ? `${key}:tracks` : null, () =>
    (type === 'album' ? maAPI.getAlbumTracks(item.item_id, item.provider) : maAPI.getPlaylistTracks(item.item_id, item.provider)), on);
  const artistTracks = useMaData(type === 'artist' && fullReady ? `${key}:tracks:${mapKey}` : null, async () => {
    const all = await withExternal((id, prov) => maAPI.getArtistTracks(id, prov));
    // Mest populære først (Spotify-popularitet når den finnes), maks 20
    return [...all].sort((a, b) => (b.metadata?.popularity ?? 0) - (a.metadata?.popularity ?? 0)).slice(0, 20);
  }, on);
  const artistAlbums = useMaData(type === 'artist' && fullReady ? `${key}:albums:${mapKey}` : null,
    () => withExternal((id, prov) => maAPI.getArtistAlbums(id, prov)), on);
  const [showAllTop, setShowAllTop] = useState(false);

  const art = imgOf(shown);
  const tint = useArtColor(art);
  const list = (type === 'artist' ? artistTracks.data : tracks.data) || [];
  const totalSecs = list.reduce((s, t) => s + (t.duration || 0), 0);
  const { nowPlaying } = ui.engine;
  const playingHere = nowPlaying.isPlaying && list.some(t => isSameTrack(t, nowPlaying));

  const albums = useMemo(() => {
    const all = [...(artistAlbums.data || [])].sort((a, b) => (b.year || 0) - (a.year || 0));
    return {
      albums: all.filter(a => !a.album_type || a.album_type === 'album'),
      singles: all.filter(a => a.album_type === 'single' || a.album_type === 'ep'),
      other: all.filter(a => a.album_type && !['album', 'single', 'ep'].includes(a.album_type)),
    };
  }, [artistAlbums.data]);

  const playAll = () => {
    if (playingHere) { ui.engine.playPause(); return; }
    ui.engine.play(shown);
  };

  const metaParts = [];
  if (type === 'album') {
    if (shown.year) metaParts.push(String(shown.year));
  } else if (type === 'playlist' && shown.owner) {
    metaParts.push(`Av ${shown.owner}`);
  }
  if (list.length && type !== 'artist') {
    metaParts.push(`${list.length} spor${totalSecs ? `, ${fmtDurationLong(totalSecs)}` : ''}`);
  }

  const topTracks = showAllTop ? list.slice(0, 20) : list.slice(0, 5);

  return (
    <div className={`mp-view mp-detail mp-detail--${type}`} style={tint ? { '--mp-tint': tint } : undefined}>
      <header className="mp-detail-head">
        <Art item={shown} type={type} className="mp-detail-art" />
        <div className="mp-detail-meta">
          <span className="mp-detail-type">{TYPE_LABEL[type]}</span>
          <h1 className="mp-detail-title">{shown.name}</h1>
          <div className="mp-detail-sub">
            {type === 'album' && (shown.artists || []).map((a, i) => (
              <React.Fragment key={a.uri || i}>{i > 0 && ', '}<span className="mp-link mp-link--strong" onClick={() => ui.goToArtist(a)}>{a.name}</span></React.Fragment>
            ))}
            {type === 'album' && shown.artists?.length > 0 && metaParts.length > 0 && ' · '}
            {metaParts.join(' · ')}
          </div>
        </div>
      </header>

      <div className="mp-detail-actions">
        <PlayBtn size={56} playing={playingHere} onClick={playAll} />
        <button className="mp-iconbtn mp-iconbtn--lg" onClick={() => ui.engine.playShuffled(shown)} title="Spill i tilfeldig rekkefølge"><Shuffle size={22} /></button>
        <HeartBtn item={shown} ui={ui} size={24} className="mp-iconbtn--lg" />
        {type !== 'artist' && (
          <button className="mp-iconbtn mp-iconbtn--lg" onClick={() => ui.engine.play(shown, 'add')} title="Legg til i køen"><ListPlus size={22} /></button>
        )}
        <button className="mp-iconbtn mp-iconbtn--lg" onClick={(e) => ui.openMenu(shown, e)} title="Mer"><Ellipsis size={22} /></button>
      </div>

      {!on && <Empty>Ikke tilkoblet Music Assistant</Empty>}

      {type !== 'artist' && (
        <>
          {tracks.loading && !tracks.data && <Spinner />}
          {tracks.error && <Empty error>{tracks.error}</Empty>}
          {tracks.data && !list.length && <Empty>Ingen spor funnet</Empty>}
          {list.length > 0 && (
            <TrackList tracks={list} ui={ui} container={shown} showArt={type === 'playlist'} showAlbum={type === 'playlist'} />
          )}
        </>
      )}

      {type === 'artist' && (
        <>
          <section className="mp-section">
            <h2 className="mp-h2">Populære</h2>
            {artistTracks.loading && !artistTracks.data && <Spinner />}
            {artistTracks.error && <Empty error>{artistTracks.error}</Empty>}
            {artistTracks.data && !list.length && <Empty>Ingen spor funnet</Empty>}
            {topTracks.length > 0 && <TrackList tracks={topTracks} ui={ui} container={shown} showArt />}
            {list.length > 5 && (
              <button className="mp-linkbtn mp-linkbtn--block" onClick={() => setShowAllTop(v => !v)}>
                {showAllTop ? 'Vis færre' : 'Vis flere'}
              </button>
            )}
          </section>
          {artistAlbums.loading && !artistAlbums.data && <Spinner />}
          <Shelf title="Album" items={albums.albums} type="album" ui={ui} sub={(a) => (a.year ? `${a.year} · Album` : 'Album')} />
          <Shelf title="Singler og EP-er" items={albums.singles} type="album" ui={ui} sub={(a) => (a.year ? `${a.year} · Singel` : 'Singel')} />
          <Shelf title="Annet" items={albums.other} type="album" ui={ui} />
        </>
      )}
    </div>
  );
}

// ── Kø ─────────────────────────────────────────────────────────────

export function QueueView({ ui, panel }) {
  const { engine } = ui;
  const { queue, queueItems, queueLoading, activeQueueId, activePlayer, maConnected } = engine;
  const [showEarlier, setShowEarlier] = useState(false);

  const items = useMemo(() => [...queueItems].sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0)), [queueItems]);
  let currentIdx = -1;
  if (queue?.current_item?.queue_item_id) currentIdx = items.findIndex(i => i.queue_item_id === queue.current_item.queue_item_id);
  if (currentIdx < 0 && typeof queue?.current_index === 'number') currentIdx = queue.current_index;
  const current = currentIdx >= 0 ? items[currentIdx] : (queue?.current_item || null);
  const upcoming = currentIdx >= 0 ? items.slice(currentIdx + 1) : items;
  const earlier = currentIdx > 0 ? items.slice(0, currentIdx) : [];

  const row = (it, i, idx) => (
    <TrackRow
      key={it.queue_item_id || i}
      track={it}
      index={idx}
      ui={ui}
      showArt
      removable
      onRemove={() => engine.removeQueueItem(it.queue_item_id)}
      onPlay={() => engine.playQueueItem(it.queue_item_id)}
    />
  );

  return (
    <div className={`mp-view mp-queue${panel ? ' mp-queue--panel' : ''}`}>
      <div className="mp-view-head">
        <div>
          <h1 className={panel ? 'mp-h2' : 'mp-h1'}>Kø</h1>
          {activePlayer && <div className="mp-muted">{activePlayer.name}</div>}
        </div>
        <div className="mp-row-actions">
          <button className="mp-iconbtn" onClick={engine.reloadQueue} title="Oppdater"><RefreshCw size={16} className={queueLoading ? 'mp-spin' : ''} /></button>
          {items.length > 0 && (
            <button className="mp-iconbtn" onClick={engine.clearQueue} title="Tøm køen"><Trash2 size={16} /></button>
          )}
        </div>
      </div>

      {!maConnected && <Empty>Ikke tilkoblet Music Assistant</Empty>}
      {maConnected && !activeQueueId && <Empty>Velg en høyttaler for å se køen</Empty>}
      {maConnected && activeQueueId && !queueLoading && !items.length && !current && (
        <Empty>Køen er tom. Finn noe å spille under Søk eller Hjem.</Empty>
      )}
      {queueLoading && !items.length && <Spinner />}

      {current && (
        <section className="mp-section">
          <h3 className="mp-h3">Spilles nå</h3>
          <TrackRow track={current} index={null} ui={ui} showArt onPlay={engine.playPause} menuContext={null} />
        </section>
      )}
      {upcoming.length > 0 && (
        <section className="mp-section">
          <h3 className="mp-h3">Neste i køen</h3>
          {upcoming.map((it, i) => row(it, i, i))}
        </section>
      )}
      {earlier.length > 0 && (
        <section className="mp-section">
          <button className="mp-linkbtn mp-linkbtn--block" onClick={() => setShowEarlier(v => !v)}>
            {showEarlier ? 'Skjul tidligere' : `Vis ${earlier.length} tidligere spor`}
            <ChevronRight size={14} style={{ transform: showEarlier ? 'rotate(90deg)' : 'none' }} />
          </button>
          {showEarlier && earlier.map((it, i) => row(it, i, i))}
        </section>
      )}
    </div>
  );
}

// ── Hurtigmeny (⋯) ─────────────────────────────────────────────────

export function ItemMenu({ menu, ui, onClose }) {
  const { item, rect, context } = menu;
  const { engine } = ui;
  const mobile = ui.layout === 'mobile';
  const type = item.media_type;
  const fav = engine.isFavorite(item);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const act = (fn) => () => { fn(); onClose(); };
  const actions = [];
  actions.push({ icon: Play, label: 'Spill nå', run: () => engine.play(item) });
  if (type === 'track' && context && context.media_type !== 'artist') {
    actions.push({ icon: Play, label: `Spill herfra i ${context.media_type === 'album' ? 'albumet' : 'spillelisten'}`, run: () => engine.play(context, 'replace', item.uri) });
  }
  if (type !== 'radio') {
    actions.push({ icon: ListEnd, label: 'Spill som neste', run: () => engine.play(item, 'next') });
    actions.push({ icon: ListPlus, label: 'Legg til i køen', run: () => engine.play(item, 'add') });
  }
  if (type === 'album' || type === 'playlist' || type === 'artist') {
    actions.push({ icon: Shuffle, label: 'Spill i tilfeldig rekkefølge', run: () => engine.playShuffled(item) });
  }
  if (item.uri) actions.push({ icon: Heart, label: fav ? 'Fjern fra favoritter' : 'Legg til i favoritter', run: () => engine.toggleFavorite(item), on: fav });
  if (type === 'track' && item.album?.uri) actions.push({ icon: Disc, label: 'Gå til album', run: () => ui.openItem(item.album) });
  if ((type === 'track' || type === 'album') && item.artists?.[0]) {
    actions.push({ icon: Mic, label: 'Gå til artist', run: () => ui.goToArtist(item.artists[0]) });
  }

  // Popover-plassering beregnes fra antatt størrelse (ingen DOM-måling nødvendig)
  let pos = null;
  if (!mobile) {
    const w = 260;
    const h = 76 + actions.length * 42 + 8;
    let left = rect ? rect.right - w : (window.innerWidth - w) / 2;
    let top = rect ? rect.bottom + 6 : (window.innerHeight - h) / 2;
    if (left < 8) left = 8;
    if (left + w > window.innerWidth - 8) left = window.innerWidth - 8 - w;
    if (top + h > window.innerHeight - 8) top = Math.max(8, (rect ? rect.top : top) - h - 6);
    pos = { left, top };
  }

  return createPortal(
    <div className={`mp-menu-layer${mobile ? ' mp-menu-layer--sheet' : ''}`} onClick={onClose}>
      <div
        className={`mp-menu${mobile ? ' mp-menu--sheet' : ''}`}
        style={pos ? { left: pos.left, top: pos.top } : undefined}
        onClick={stop}
      >
        <div className="mp-menu-head">
          <Art item={item} type={type} size={44} />
          <div className="mp-menu-meta">
            <div className="mp-menu-name">{item.name}</div>
            <div className="mp-menu-sub">{subtitleOf(item, type) || TYPE_LABEL[type]}</div>
          </div>
        </div>
        {actions.map((a, i) => (
          <button key={i} className={`mp-menu-item${a.on ? ' mp-menu-item--on' : ''}`} onClick={act(a.run)}>
            <a.icon size={18} fill={a.on ? 'currentColor' : 'none'} />
            <span>{a.label}</span>
          </button>
        ))}
        {mobile && <button className="mp-menu-item mp-menu-cancel" onClick={onClose}>Avbryt</button>}
      </div>
    </div>,
    document.body
  );
}
