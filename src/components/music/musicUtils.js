// Felles hjelpere for musikksiden (Music Assistant / Spotify-lignende UI)
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Music, Disc, Mic, ListMusic, Radio } from 'lucide-react';
import { proxiedServiceUrl } from '../../services/utils';
import { hassAPI } from '../../services/hass-api';
import { maAPI } from '../../services/ma-api';

export const TYPE_ICON = { track: Music, album: Disc, artist: Mic, playlist: ListMusic, radio: Radio };
export const TYPE_LABEL = {
  track: 'Spor', album: 'Album', artist: 'Artist', playlist: 'Spilleliste', radio: 'Radio',
};
export const TYPE_PLURAL = {
  track: 'Spor', album: 'Album', artist: 'Artister', playlist: 'Spillelister', radio: 'Radiostasjoner',
};

export function fmtTime(secs) {
  if (!isFinite(secs) || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function fmtDurationLong(totalSecs) {
  const m = Math.round((totalSecs || 0) / 60);
  if (m < 1) return '';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} t ${m % 60} min` : `${h} t`;
}

const pickImg = (img) => (typeof img === 'string' ? img : img?.path || img?.url || null);

function resolveMaImage(img, size) {
  if (!img) return null;
  const path = pickImg(img);
  if (!path) return null;
  // MA sine innebygde spillelister («All favorited tracks» o.l.) peker på en logo som
  // bildeproxyen svarer 400 på – vis heller plassholder.
  if (typeof img === 'object' && img.provider === 'builtin') return null;
  // Lokale bilder (filsystem-provider o.l.) må gå via MA sin bildeproxy
  if (typeof img === 'object' && img.remotely_accessible === false && img.provider) {
    const q = new URLSearchParams({ path, provider: img.provider, size: String(size || 0) });
    return `${maAPI.httpBase}/imageproxy?${q.toString()}`;
  }
  if (!/^https?:\/\//i.test(path)) return null;
  return proxiedServiceUrl(path);
}

/** Beste tilgjengelige bilde for et MA-medieobjekt (eller kø-element). */
export function imgOf(item, size = 0) {
  if (!item) return null;
  let url = resolveMaImage(item.image, size) || (item.image_url ? proxiedServiceUrl(item.image_url) : null);
  if (!url && Array.isArray(item.metadata?.images) && item.metadata.images.length) {
    const imgs = item.metadata.images;
    const thumb = imgs.find(i => i.type === 'thumb') || imgs[0];
    url = resolveMaImage(thumb, size);
  }
  if (!url && item.media_item) url = imgOf(item.media_item, size);
  if (!url && item.album) url = imgOf(item.album, size);
  return url || null;
}

/** Albumbilde fra HA media_player-entitet (entity_picture er relativ til HA). */
export function haArt(entity) {
  const pic = entity?.attributes?.entity_picture;
  if (!pic) return null;
  if (/^https?:\/\//i.test(pic)) return proxiedServiceUrl(pic);
  const base = (hassAPI.httpBase || hassAPI.url || '').replace(/\/$/, '');
  return `${base}${pic}`;
}

export const artistNames = (item) =>
  (item?.artists || []).map(a => a?.name).filter(Boolean).join(', ');

export function subtitleOf(item, type = item?.media_type) {
  if (!item) return '';
  switch (type) {
    case 'track':    return [artistNames(item), item.album?.name].filter(Boolean).join(' · ');
    case 'album':    return [item.year, artistNames(item)].filter(Boolean).join(' · ') || 'Album';
    case 'artist':   return 'Artist';
    case 'playlist': return item.owner ? `Av ${item.owner}` : 'Spilleliste';
    case 'radio':    return 'Radio';
    default:         return '';
  }
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 5)  return 'God natt';
  if (h < 11) return 'God morgen';
  if (h < 17) return 'God ettermiddag';
  return 'God kveld';
}

export const cleanPlayerName = (n) => (n || '').replace(/\s*\(MA\)\s*$/i, '').trim();

/** Er kø-/listesporet det som spilles nå? */
export function isSameTrack(track, now) {
  if (!track || !now?.hasMedia) return false;
  const uri = track.media_item?.uri || track.uri;
  if (uri && now.uri && uri === now.uri) return true;
  const name = (track.media_item?.name || track.name || '').toLowerCase();
  if (!name || name !== (now.title || '').toLowerCase()) return false;
  const artist = artistNames(track.media_item || track).toLowerCase();
  return !artist || !now.artist || artist.includes(now.artist.toLowerCase()) || now.artist.toLowerCase().includes(artist);
}

export const isTouchDevice = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(hover: none)').matches;

/** Interpolert avspillingsposisjon basert på HA-attributtene. */
export function usePlaybackPosition({ position, positionUpdatedAt, isPlaying, duration }) {
  const [pos, setPos] = useState(position || 0);
  const draggingRef = useRef(false);
  useEffect(() => {
    const base = position || 0;
    const t0 = positionUpdatedAt ? new Date(positionUpdatedAt).getTime() / 1000 : Date.now() / 1000;
    const calc = () => {
      if (draggingRef.current) return;
      if (isPlaying) setPos(Math.min(base + (Date.now() / 1000 - t0), duration || Infinity));
      else setPos(base);
    };
    calc();
    if (!isPlaying) return undefined;
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [position, positionUpdatedAt, isPlaying, duration]);
  return [pos, setPos, draggingRef];
}

/** 'mobile' (< 640) | 'compact' (640–999) | 'wide' (≥ 1000) – målt på selve siden. */
export function useLayout(ref) {
  const calc = (w) => (w < 640 ? 'mobile' : w < 1000 ? 'compact' : 'wide');
  const [layout, setLayout] = useState(() => calc(window.innerWidth));
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') {
      const h = () => setLayout(calc(window.innerWidth));
      window.addEventListener('resize', h);
      return () => window.removeEventListener('resize', h);
    }
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect?.width;
      // Skjult side (display:none) måler 0 – behold forrige layout
      if (w > 0) setLayout(calc(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return layout;
}

// ── Dominerende farge fra albumbilde (Spotify-gradient) ─────────────
const colorCache = new Map();

export function useArtColor(url) {
  // Resultat lagres sammen med URL-en det gjelder; cache-treff leses direkte under render
  const [result, setResult] = useState({ url: null, color: null });
  useEffect(() => {
    if (!url || colorCache.has(url)) return undefined;
    let cancelled = false;
    const setColor = (color) => setResult({ url, color });
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let col = null;
      try {
        const S = 24;
        const c = document.createElement('canvas');
        c.width = S; c.height = S;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, S, S);
        const d = ctx.getImageData(0, 0, S, S).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < d.length; i += 4) {
          const R = d[i], G = d[i + 1], B = d[i + 2];
          const max = Math.max(R, G, B), min = Math.min(R, G, B);
          const lum = (max + min) / 2;
          if (lum < 20 || lum > 240) continue;
          const w = 1 + (max - min) / 48; // vekt mettede piksler
          r += R * w; g += G * w; b += B * w; n += w;
        }
        if (n > 0) {
          // Demp litt så tekst forblir lesbar
          const k = 0.72;
          col = `rgb(${Math.round(r / n * k)}, ${Math.round(g / n * k)}, ${Math.round(b / n * k)})`;
        }
      } catch { col = null; }
      colorCache.set(url, col);
      if (!cancelled) setColor(col);
    };
    img.onerror = () => { colorCache.set(url, null); if (!cancelled) setColor(null); };
    img.src = url;
    return () => { cancelled = true; };
  }, [url]);
  if (!url) return null;
  if (colorCache.has(url)) return colorCache.get(url);
  return result.url === url ? result.color : null;
}

// ── Enkel datacache for MA-oppslag ──────────────────────────────────
const dataCache = new Map();
const CACHE_TTL = 2 * 60 * 1000;

/**
 * Henter data via loader() når `enabled`; cacher per key i 2 min.
 * Returnerer { data, loading, error, reload }.
 */
const cacheGet = (key) => {
  if (!key) return null;
  const c = dataCache.get(key);
  return c && Date.now() - c.ts < CACHE_TTL ? c : null;
};

export function useMaData(key, loader, enabled = true) {
  // Siste fullførte lasting (nøkkel + resultat). Cache-treff leses direkte under render,
  // så effekten gjør bare asynkront arbeid.
  const [res, setRes] = useState({ key: null, data: null, error: null });
  const [tick, setTick] = useState(0);
  const loaderRef = useRef(loader);
  useEffect(() => { loaderRef.current = loader; });

  useEffect(() => {
    if (!enabled || !key || cacheGet(key)) return undefined;
    let cancelled = false;
    Promise.resolve()
      .then(() => loaderRef.current())
      .then(data => {
        dataCache.set(key, { data, ts: Date.now() });
        if (!cancelled) setRes({ key, data, error: null });
      })
      .catch(e => {
        if (!cancelled) setRes({ key, data: null, error: e?.message || 'Feil ved lasting' });
      });
    return () => { cancelled = true; };
  }, [key, enabled, tick]);

  const cached = cacheGet(key);
  const own = res.key === key;
  const data = cached ? cached.data : own ? res.data : null;
  const error = !cached && own ? res.error : null;
  const loading = !!(enabled && key && !cached && !(own && (res.data != null || res.error)));
  const reload = () => { if (key) dataCache.delete(key); setRes({ key: null, data: null, error: null }); setTick(t => t + 1); };
  return { data, loading, error, reload };
}

export function invalidateMaCache(prefix) {
  for (const k of [...dataCache.keys()]) {
    if (!prefix || k.startsWith(prefix)) dataCache.delete(k);
  }
}

// ── Nylige søk (lagres lokalt per nettleser) ───────────────────────
const RECENT_KEY = 'mp_recent_items';

export function loadRecentItems() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}

export function pushRecentItem(item) {
  if (!item?.uri) return;
  const slim = {
    item_id: item.item_id, provider: item.provider, uri: item.uri, name: item.name,
    media_type: item.media_type, owner: item.owner, year: item.year,
    artists: (item.artists || []).slice(0, 2).map(a => ({ item_id: a.item_id, provider: a.provider, uri: a.uri, name: a.name, media_type: 'artist' })),
    image_url: imgOf(item) || undefined,
  };
  const list = loadRecentItems().filter(i => i.uri !== item.uri);
  list.unshift(slim);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 12))); } catch { /* ignore */ }
}

export function removeRecentItem(uri) {
  const list = loadRecentItems().filter(i => i.uri !== uri);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* ignore */ }
  return list;
}
