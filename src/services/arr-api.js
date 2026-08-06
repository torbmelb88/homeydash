// API wrappers for Sonarr v3, Radarr v3, qBittorrent v2, and SABnzbd
import { proxiedServiceUrl } from './utils';

async function fetchJson(url, headers = {}) {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return res.json();
}

function buildUrl(baseUrl, path, params = {}) {
    const url = new URL(`${proxiedServiceUrl(baseUrl).replace(/\/$/, '')}/api/v3/${path}`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    return url.toString();
}

function isoDate(d) { return d.toISOString().slice(0, 10); }
function today() { return isoDate(new Date()); }
function daysFrom(n) { const d = new Date(); d.setDate(d.getDate() + n); return isoDate(d); }

// ── Sonarr ────────────────────────────────────────────────────────────────────

function sonarrHeaders(apiKey) { return { 'X-Api-Key': apiKey }; }
function radarrHeaders(apiKey) { return { 'X-Api-Key': apiKey }; }

export async function testSonarr(url, apiKey) {
    return fetchJson(buildUrl(url, 'system/status'), sonarrHeaders(apiKey));
}

export async function getSonarrCalendar(url, apiKey, daysAhead = 14) {
    return fetchJson(buildUrl(url, 'calendar', {
        start: today(),
        end: daysFrom(daysAhead),
        includeSeries: true,
        includeEpisodeFile: false,
        includeEpisodeImages: false,
    }), sonarrHeaders(apiKey));
}

export async function getSonarrHistory(url, apiKey, limit = 30) {
    return fetchJson(buildUrl(url, 'history', {
        pageSize: limit,
        page: 1,
        sortKey: 'date',
        sortDirection: 'descending',
        eventType: 3,           // downloadFolderImported
        includeSeries: true,
        includeEpisode: true,
    }), sonarrHeaders(apiKey));
}

export async function getSonarrQueue(url, apiKey) {
    return fetchJson(buildUrl(url, 'queue', {
        pageSize: 50,
        includeEpisode: true,
        includeSeries: true,
        includeUnknownSeriesItems: false,
    }), sonarrHeaders(apiKey));
}

export async function getSonarrMissing(url, apiKey, limit = 30) {
    return fetchJson(buildUrl(url, 'wanted/missing', {
        pageSize: limit,
        page: 1,
        sortKey: 'airDateUtc',
        sortDirection: 'descending',
        includeSeries: true,
    }), sonarrHeaders(apiKey));
}

export function sonarrPosterUrl(baseUrl, apiKey, seriesId) {
    return `${proxiedServiceUrl(baseUrl).replace(/\/$/, '')}/api/v3/MediaCover/${seriesId}/poster-250.jpg?apikey=${apiKey}`;
}

// ── Radarr ────────────────────────────────────────────────────────────────────

export async function testRadarr(url, apiKey) {
    return fetchJson(buildUrl(url, 'system/status'), radarrHeaders(apiKey));
}

export async function getRadarrCalendar(url, apiKey, daysAhead = 14) {
    return fetchJson(buildUrl(url, 'calendar', {
        start: today(),
        end: daysFrom(daysAhead),
        includeMovie: true,
    }), radarrHeaders(apiKey));
}

export async function getRadarrHistory(url, apiKey, limit = 30) {
    return fetchJson(buildUrl(url, 'history', {
        pageSize: limit,
        page: 1,
        sortKey: 'date',
        sortDirection: 'descending',
        eventType: 2,           // downloadFolderImported in Radarr
        includeMovie: true,
    }), radarrHeaders(apiKey));
}

export async function getRadarrQueue(url, apiKey) {
    return fetchJson(buildUrl(url, 'queue', {
        pageSize: 50,
        includeMovie: true,
        includeUnknownMovieItems: false,
    }), radarrHeaders(apiKey));
}

export async function getRadarrMissing(url, apiKey, limit = 30) {
    return fetchJson(buildUrl(url, 'wanted/missing', {
        pageSize: limit,
        page: 1,
        sortKey: 'inCinemas',
        sortDirection: 'descending',
    }), radarrHeaders(apiKey));
}

export function radarrPosterUrl(baseUrl, apiKey, movieId) {
    return `${proxiedServiceUrl(baseUrl).replace(/\/$/, '')}/api/v3/MediaCover/${movieId}/poster-250.jpg?apikey=${apiKey}`;
}

// ── qBittorrent ───────────────────────────────────────────────────────────────
// Uses API key auth (qBittorrent >= 4.6.0) via Authorization: Bearer header.
// No cookies needed - no SameSite/CSRF issues.
// Generate key: qBittorrent WebUI -> Settings -> Web UI -> API Key -> Generate.

function qbtHeaders(apiKey) {
    return { 'Authorization': `Bearer ${apiKey}` };
}

export async function getQbtTorrents(url, apiKey) {
    const base = proxiedServiceUrl(url).replace(/\/$/, '');
    const res = await fetch(`${base}/api/v2/torrents/info`, {
        headers: qbtHeaders(apiKey),
    });
    if (!res.ok) throw new Error(`Torrents HTTP ${res.status}`);
    return res.json();
}

export async function testQbt(url, apiKey) {
    const base = proxiedServiceUrl(url).replace(/\/$/, '');
    const res = await fetch(`${base}/api/v2/app/version`, {
        headers: qbtHeaders(apiKey),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
}

// ── SABnzbd ───────────────────────────────────────────────────────────────────
// Standard SABnzbd JSON API, API key as query param.
// Key: SABnzbd WebUI -> Config -> General -> API Key.
// NB: SABnzbd returns HTTP 200 with {"error": "..."} on auth failure.

function sabApiUrl(baseUrl, params) {
    const url = new URL(`${proxiedServiceUrl(baseUrl).replace(/\/$/, '')}/api`);
    url.searchParams.set('output', 'json');
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    return url.toString();
}

export async function getSabQueue(url, apiKey) {
    const json = await fetchJson(sabApiUrl(url, { mode: 'queue', apikey: apiKey }));
    if (json.error) throw new Error(json.error);
    return json.queue || null;
}

export async function testSab(url, apiKey) {
    const json = await fetchJson(sabApiUrl(url, { mode: 'queue', limit: 1, apikey: apiKey }));
    if (json.error) throw new Error(json.error);
    return json.queue?.version;
}
