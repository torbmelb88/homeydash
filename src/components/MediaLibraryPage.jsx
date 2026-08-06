import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    X, Settings, Film, Tv, Download, Clock, AlertCircle,
    Loader, Calendar, History, Search, CheckCircle, List,
    Wifi, WifiOff, RefreshCw, Users, ArrowDown,
} from 'lucide-react';
import { useHomey } from '../context/HomeyContext';
import {
    getSonarrCalendar, getRadarrCalendar,
    getSonarrHistory, getRadarrHistory,
    getSonarrQueue, getRadarrQueue,
    getSonarrMissing, getRadarrMissing,
    getQbtTorrents, getSabQueue,
    sonarrPosterUrl, radarrPosterUrl,
    testSonarr, testRadarr, testQbt, testSab,
} from '../services/arr-api';
import { CheckboxRow } from './SettingsControls';
import '../styles/media-library-page.css';

// ── Formatters ─────────────────────────────────────────────────────────────────

function fmtSize(bytes) {
    if (!bytes || bytes < 0) return '';
    if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
    if (bytes > 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
    return `${Math.round(bytes / 1e3)} KB`;
}

// timeleft from Sonarr/Radarr: "HH:MM:SS" string
function fmtEta(timeleft) {
    if (!timeleft) return '';
    const parts = String(timeleft).split(':');
    if (parts.length === 3) {
        const h = parseInt(parts[0]);
        const m = parseInt(parts[1]);
        if (h > 24) return `${Math.floor(h / 24)}d`;
        if (h > 0) return `${h}t ${m}m`;
        if (m > 0) return `${m}m`;
        return '< 1m';
    }
    return timeleft;
}

// eta from qBittorrent: seconds integer
function fmtEtaSecs(secs) {
    if (!secs || secs < 0 || secs >= 8640000) return '';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h > 24) return `${Math.floor(h / 24)}d`;
    if (h > 0) return `${h}t ${m}m`;
    if (m > 0) return `${m}m`;
    return '< 1m';
}

function fmtSpeed(bytesPerSec) {
    if (!bytesPerSec || bytesPerSec <= 0) return '';
    if (bytesPerSec > 1e6) return `${(bytesPerSec / 1e6).toFixed(1)} MB/s`;
    if (bytesPerSec > 1e3) return `${Math.round(bytesPerSec / 1e3)} KB/s`;
    return `${bytesPerSec} B/s`;
}

function fmtRelativeDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
    const now = new Date();
    const diffMs = d - now;
    const diffDays = Math.round(diffMs / 86400000);
    if (diffDays === 0) return 'I dag';
    if (diffDays === 1) return 'I morgen';
    if (diffDays === -1) return 'I går';
    if (diffDays < 0) return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });
    if (diffDays < 7) return d.toLocaleDateString('nb-NO', { weekday: 'long' });
    return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });
}

function dateGroupLabel(dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((d - today) / 86400000);
    if (diffDays === 0) return { label: 'I dag', isToday: true };
    if (diffDays === 1) return { label: 'I morgen', isToday: false };
    if (diffDays < 7) return { label: d.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'short' }), isToday: false };
    return { label: d.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long' }), isToday: false };
}

function fmtDateAgo(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const diffMs = Date.now() - d;
    const diffH = Math.floor(diffMs / 3600000);
    if (diffH < 1) return 'Akkurat nå';
    if (diffH < 24) return `${diffH}t siden`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD}d siden`;
    return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });
}

function qbtStateLabel(state) {
    const map = {
        downloading: 'Laster ned', uploading: 'Seeder', stalledUP: 'Seeder (stoppet)',
        stalledDL: 'Stoppet', checkingDL: 'Sjekker', checkingUP: 'Sjekker',
        pausedDL: 'Pauset', pausedUP: 'Pauset', queuedDL: 'Kø', queuedUP: 'Kø',
        moving: 'Flytter', error: 'Feil', missingFiles: 'Mangler filer',
        unknown: 'Ukjent', forcedDL: 'Tvungen nedlasting', forcedUP: 'Tvungen seeding',
    };
    return map[state] || state;
}

function sabStateLabel(status) {
    const map = {
        Downloading: 'Laster ned', Queued: 'Kø', Paused: 'Pauset',
        Fetching: 'Henter', Grabbing: 'Henter', Checking: 'Sjekker',
        Verifying: 'Verifiserer', Repairing: 'Reparerer', Extracting: 'Pakker ut',
        Propagating: 'Venter', Deleted: 'Slettet',
    };
    return map[status] || status;
}

// ── Shared UI atoms ────────────────────────────────────────────────────────────

function Spinner({ size = 16 }) {
    return <span className="mlp-spinner" style={{ display: 'inline-flex' }}><Loader size={size} /></span>;
}

function PosterImg({ src, type = 'tv' }) {
    const [failed, setFailed] = useState(false);
    if (!src || failed) {
        return (
            <div className="mlp-poster">
                {type === 'tv' ? <Tv size={20} opacity={0.3} /> : <Film size={20} opacity={0.3} />}
            </div>
        );
    }
    return (
        <div className="mlp-poster">
            <img src={src} alt="" onError={() => setFailed(true)} />
        </div>
    );
}

function ErrorBar({ errors = {} }) {
    const entries = Object.entries(errors).filter(([, v]) => v);
    if (!entries.length) return null;
    return (
        <>
            {entries.map(([k, msg]) => (
                <div key={k} className="mlp-error-bar">
                    <AlertCircle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span><strong>{{ sonarr: 'Sonarr', radarr: 'Radarr', qbt: 'qBittorrent', sab: 'SABnzbd' }[k] || k}:</strong> {msg}</span>
                </div>
            ))}
        </>
    );
}

function Badge({ variant, children }) {
    return <span className={`mlp-badge mlp-badge-${variant}`}>{children}</span>;
}

// ── Calendar tab ───────────────────────────────────────────────────────────────

function buildCalendarItems(sonarrEps = [], radarrMovies = [], s, r) {
    const items = [];
    for (const ep of sonarrEps) {
        const date = ep.airDate;
        if (!date) continue;
        items.push({
            type: 'tv',
            date,
            id: ep.id,
            title: ep.series?.title || 'Ukjent serie',
            subtitle: `S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')} · ${ep.title || ''}`,
            meta: ep.series?.network || '',
            hasFile: !!ep.hasFile,
            posterUrl: ep.series?.id ? sonarrPosterUrl(s.sonarrUrl, s.sonarrApiKey, ep.series.id) : null,
            quality: ep.quality?.quality?.name || '',
        });
    }
    for (const mv of radarrMovies) {
        // Use the earliest upcoming release date that falls in range
        const date = mv.inCinemas || mv.digitalRelease || mv.physicalRelease;
        if (!date) continue;
        const releaseType = mv.inCinemas
            ? 'Kino'
            : mv.digitalRelease
                ? 'Digital'
                : 'Fysisk';
        items.push({
            type: 'movie',
            date: date.slice(0, 10),
            id: mv.id,
            title: mv.title || 'Ukjent film',
            subtitle: `${mv.year || ''} · ${releaseType}`,
            meta: mv.studio || '',
            hasFile: !!mv.hasFile,
            posterUrl: mv.id ? radarrPosterUrl(r.radarrUrl, r.radarrApiKey, mv.id) : null,
            quality: '',
        });
    }
    items.sort((a, b) => a.date.localeCompare(b.date));
    return items;
}

function CalendarTab({ settings, data, loading, errors }) {
    const items = buildCalendarItems(
        data?.sonarr, data?.radarr,
        settings, settings
    );

    const grouped = {};
    for (const item of items) {
        if (!grouped[item.date]) grouped[item.date] = [];
        grouped[item.date].push(item);
    }
    const sortedDates = Object.keys(grouped).sort();

    return (
        <div className="mlp-content">
            <ErrorBar errors={errors} />
            {loading && !items.length ? (
                <div className="mlp-loading"><Spinner size={20} /><span>Henter kalender…</span></div>
            ) : !items.length ? (
                <div className="mlp-empty">
                    <Calendar size={32} opacity={0.25} />
                    <p className="mlp-empty-title">Ingenting planlagt</p>
                    <p>Ingen episoder eller filmer de neste dagene.</p>
                </div>
            ) : (
                sortedDates.map(date => {
                    const { label, isToday } = dateGroupLabel(date);
                    return (
                        <div key={date} className="mlp-date-group">
                            <div className="mlp-date-label">
                                {label}
                                {isToday && <span className="mlp-date-label-today">I DAG</span>}
                            </div>
                            <div className="mlp-cards">
                                {grouped[date].map(item => (
                                    <div key={`${item.type}-${item.id}`} className="mlp-card">
                                        <PosterImg src={item.posterUrl} type={item.type} />
                                        <div className="mlp-card-body">
                                            <div className="mlp-card-title">{item.title}</div>
                                            <div className="mlp-card-subtitle">{item.subtitle}</div>
                                            <div className="mlp-card-meta">
                                                <Badge variant={item.type === 'tv' ? 'tv' : 'movie'}>
                                                    {item.type === 'tv' ? 'Serie' : 'Film'}
                                                </Badge>
                                                {item.hasFile && <Badge variant="ok">Lastet ned</Badge>}
                                                {item.meta && <span style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>{item.meta}</span>}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })
            )}
        </div>
    );
}

// ── Recently added tab ─────────────────────────────────────────────────────────

function buildRecentItems(sonarrHistory, radarrHistory) {
    const items = [];
    for (const r of (sonarrHistory?.records || [])) {
        items.push({
            type: 'tv',
            id: `s-${r.id}`,
            title: r.series?.title || 'Ukjent serie',
            subtitle: r.episode
                ? `S${String(r.episode.seasonNumber).padStart(2, '0')}E${String(r.episode.episodeNumber).padStart(2, '0')} · ${r.episode.title || ''}`
                : '',
            date: r.date,
            quality: r.quality?.quality?.name || '',
            seriesId: r.seriesId,
        });
    }
    for (const r of (radarrHistory?.records || [])) {
        items.push({
            type: 'movie',
            id: `r-${r.id}`,
            title: r.movie?.title || 'Ukjent film',
            subtitle: r.movie?.year ? String(r.movie.year) : '',
            date: r.date,
            quality: r.quality?.quality?.name || '',
            movieId: r.movieId,
        });
    }
    items.sort((a, b) => new Date(b.date) - new Date(a.date));
    return items;
}

function RecentTab({ settings, data, loading, errors }) {
    const items = buildRecentItems(data?.sonarr, data?.radarr);

    return (
        <div className="mlp-content">
            <ErrorBar errors={errors} />
            {loading && !items.length ? (
                <div className="mlp-loading"><Spinner size={20} /><span>Henter historikk…</span></div>
            ) : !items.length ? (
                <div className="mlp-empty">
                    <History size={32} opacity={0.25} />
                    <p className="mlp-empty-title">Ingenting lagt til nylig</p>
                    <p>Ingen nedlastede episoder eller filmer funnet.</p>
                </div>
            ) : (
                <div className="mlp-cards">
                    {items.map(item => {
                        const posterUrl = item.type === 'tv' && item.seriesId && settings.sonarrUrl
                            ? sonarrPosterUrl(settings.sonarrUrl, settings.sonarrApiKey, item.seriesId)
                            : item.type === 'movie' && item.movieId && settings.radarrUrl
                                ? radarrPosterUrl(settings.radarrUrl, settings.radarrApiKey, item.movieId)
                                : null;
                        return (
                            <div key={item.id} className="mlp-card">
                                <PosterImg src={posterUrl} type={item.type} />
                                <div className="mlp-card-body">
                                    <div className="mlp-card-title">{item.title}</div>
                                    <div className="mlp-card-subtitle">{item.subtitle}</div>
                                    <div className="mlp-card-meta">
                                        <Badge variant={item.type === 'tv' ? 'tv' : 'movie'}>
                                            {item.type === 'tv' ? 'Serie' : 'Film'}
                                        </Badge>
                                        {item.quality && <Badge variant="quality">{item.quality}</Badge>}
                                        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', marginLeft: 'auto' }}>
                                            {fmtDateAgo(item.date)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ── Queue tab ──────────────────────────────────────────────────────────────────

function buildQueueItems(sonarrQueue, radarrQueue) {
    const items = [];
    for (const r of (sonarrQueue?.records || [])) {
        const pct = r.size && r.sizeleft != null ? Math.round((1 - r.sizeleft / r.size) * 100) : 0;
        items.push({
            source: 'Sonarr',
            id: `sq-${r.id}`,
            title: r.series?.title || r.title || 'Ukjent',
            subtitle: r.episode
                ? `S${String(r.episode.seasonNumber).padStart(2, '0')}E${String(r.episode.episodeNumber).padStart(2, '0')} · ${r.episode.title || ''}`
                : r.title || '',
            status: r.status || r.trackedDownloadState || '',
            pct,
            size: r.size,
            sizeleft: r.sizeleft,
            eta: r.timeleft,
            quality: r.quality?.quality?.name || '',
        });
    }
    for (const r of (radarrQueue?.records || [])) {
        const pct = r.size && r.sizeleft != null ? Math.round((1 - r.sizeleft / r.size) * 100) : 0;
        items.push({
            source: 'Radarr',
            id: `rq-${r.id}`,
            title: r.movie?.title || r.title || 'Ukjent',
            subtitle: r.movie?.year ? String(r.movie.year) : '',
            status: r.status || r.trackedDownloadState || '',
            pct,
            size: r.size,
            sizeleft: r.sizeleft,
            eta: r.timeleft,
            quality: r.quality?.quality?.name || '',
        });
    }
    return items;
}

function QueueTab({ settings, data, loading, errors }) {
    const arrItems = buildQueueItems(data?.sonarr, data?.radarr);
    const qbtItems = data?.qbt || [];
    const sabQueue = data?.sab || null;
    const sabSlots = sabQueue?.slots || [];
    const totalCount = arrItems.length + qbtItems.length + sabSlots.length;

    return (
        <div className="mlp-content">
            <ErrorBar errors={errors} />
            {loading && !totalCount ? (
                <div className="mlp-loading"><Spinner size={20} /><span>Henter nedlastingskø…</span></div>
            ) : !totalCount ? (
                <div className="mlp-empty">
                    <Download size={32} opacity={0.25} />
                    <p className="mlp-empty-title">Ingen aktive nedlastinger</p>
                    <p>Nedlastingskøen er tom.</p>
                </div>
            ) : (
                <>
                    {arrItems.length > 0 && (
                        <>
                            <p className="mlp-section-title">Sonarr / Radarr ({arrItems.length})</p>
                            {arrItems.map(item => (
                                <div key={item.id} className="mlp-queue-card">
                                    <div className="mlp-queue-top">
                                        <div className="mlp-queue-text">
                                            <div className="mlp-card-title">{item.title}</div>
                                            {item.subtitle && <div className="mlp-card-subtitle">{item.subtitle}</div>}
                                        </div>
                                        <Badge variant={item.source === 'Sonarr' ? 'tv' : 'movie'}>
                                            {item.source}
                                        </Badge>
                                    </div>
                                    <div className="mlp-progress">
                                        <div className="mlp-progress-fill" style={{ width: `${item.pct}%` }} />
                                    </div>
                                    <div className="mlp-queue-meta">
                                        <span>{item.pct}%</span>
                                        {item.sizeleft != null && <span>{fmtSize(item.sizeleft)} igjen</span>}
                                        {item.size && <span>{fmtSize(item.size)} totalt</span>}
                                        {item.eta && <span>ETA {fmtEta(item.eta)}</span>}
                                        {item.quality && <Badge variant="quality">{item.quality}</Badge>}
                                        {item.status && <Badge variant={item.status === 'downloading' ? 'dl' : 'queued'}>{item.status}</Badge>}
                                    </div>
                                </div>
                            ))}
                        </>
                    )}

                    {qbtItems.length > 0 && (
                        <>
                            <p className="mlp-section-title" style={{ marginTop: arrItems.length ? 16 : 0 }}>
                                qBittorrent ({qbtItems.filter(t => !['uploading','stalledUP','pausedUP','queuedUP','forcedUP'].includes(t.state)).length} laster ned)
                            </p>
                            {qbtItems
                                .filter(t => !['uploading', 'stalledUP', 'pausedUP', 'queuedUP', 'forcedUP'].includes(t.state))
                                .sort((a, b) => (b.dlspeed || 0) - (a.dlspeed || 0))
                                .map(t => {
                                    const pct = t.progress != null ? Math.round(t.progress * 100) : 0;
                                    const eta = fmtEtaSecs(t.eta);
                                    const speed = fmtSpeed(t.dlspeed);
                                    const seeds = t.num_seeds != null ? t.num_seeds : null;
                                    const totalSeeds = t.num_complete != null ? t.num_complete : null;
                                    const peers = t.num_leechs != null ? t.num_leechs : null;
                                    const isActive = t.dlspeed > 0;
                                    return (
                                        <div key={t.hash} className="mlp-queue-card">
                                            <div className="mlp-queue-top">
                                                <div className="mlp-qbt-name" style={{ flex: 1 }}>{t.name}</div>
                                                <Badge variant={isActive ? 'dl' : 'queued'}>
                                                    {qbtStateLabel(t.state)}
                                                </Badge>
                                            </div>
                                            <div className="mlp-progress" style={{ margin: '6px 0 4px' }}>
                                                <div
                                                    className="mlp-progress-fill"
                                                    style={{
                                                        width: `${pct}%`,
                                                        background: isActive ? '#3b82f6' : 'rgba(255,255,255,0.2)',
                                                    }}
                                                />
                                            </div>
                                            <div className="mlp-queue-meta">
                                                <span style={{ fontWeight: 600 }}>{pct}%</span>
                                                {speed && (
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: '#60a5fa', fontWeight: 600 }}>
                                                        <ArrowDown size={11} /> {speed}
                                                    </span>
                                                )}
                                                {seeds != null && (
                                                    <span
                                                        title={`${seeds} tilkoblede seeds av ${totalSeeds ?? '?'} totalt`}
                                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}
                                                    >
                                                        <span style={{ color: '#4ade80', fontSize: '0.65rem' }}>▲</span>
                                                        {seeds}{totalSeeds != null ? `/${totalSeeds}` : ''} seeds
                                                    </span>
                                                )}
                                                {peers != null && peers > 0 && (
                                                    <span
                                                        title={`${peers} peers`}
                                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}
                                                    >
                                                        <Users size={10} /> {peers}
                                                    </span>
                                                )}
                                                {eta && <span>ETA {eta}</span>}
                                                {t.size > 0 && (
                                                    <span style={{ marginLeft: 'auto', color: 'var(--color-text-secondary)' }}>
                                                        {fmtSize(t.size * (1 - t.progress))} igjen / {fmtSize(t.size)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                        </>
                    )}

                    {sabSlots.length > 0 && (
                        <>
                            <p className="mlp-section-title" style={{ marginTop: (arrItems.length || qbtItems.length) ? 16 : 0 }}>
                                SABnzbd ({sabSlots.length} i kø
                                {sabQueue.status === 'Downloading' && parseFloat(sabQueue.kbpersec) > 0
                                    ? ` · ${fmtSpeed(parseFloat(sabQueue.kbpersec) * 1024)}`
                                    : ''})
                            </p>
                            {sabSlots.map(s => {
                                const pct = parseInt(s.percentage) || 0;
                                const eta = s.status === 'Downloading' ? fmtEta(s.timeleft) : '';
                                const isActive = s.status === 'Downloading';
                                return (
                                    <div key={s.nzo_id} className="mlp-queue-card">
                                        <div className="mlp-queue-top">
                                            <div className="mlp-qbt-name" style={{ flex: 1 }}>{s.filename}</div>
                                            <Badge variant={isActive ? 'dl' : 'queued'}>
                                                {sabStateLabel(s.status)}
                                            </Badge>
                                        </div>
                                        <div className="mlp-progress" style={{ margin: '6px 0 4px' }}>
                                            <div
                                                className="mlp-progress-fill"
                                                style={{
                                                    width: `${pct}%`,
                                                    background: isActive ? '#3b82f6' : 'rgba(255,255,255,0.2)',
                                                }}
                                            />
                                        </div>
                                        <div className="mlp-queue-meta">
                                            <span style={{ fontWeight: 600 }}>{pct}%</span>
                                            {s.cat && s.cat !== '*' && <Badge variant="quality">{s.cat}</Badge>}
                                            {eta && <span>ETA {eta}</span>}
                                            {s.size && (
                                                <span style={{ marginLeft: 'auto', color: 'var(--color-text-secondary)' }}>
                                                    {s.sizeleft} igjen / {s.size}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </>
                    )}
                </>
            )}
        </div>
    );
}

// ── Missing tab ────────────────────────────────────────────────────────────────

function MissingTab({ settings, data, loading, errors }) {
    const tvItems = (data?.sonarr?.records || []);
    const movieItems = (data?.radarr?.records || []);

    return (
        <div className="mlp-content">
            <ErrorBar errors={errors} />
            {loading && !tvItems.length && !movieItems.length ? (
                <div className="mlp-loading"><Spinner size={20} /><span>Henter manglende…</span></div>
            ) : !tvItems.length && !movieItems.length ? (
                <div className="mlp-empty">
                    <CheckCircle size={32} opacity={0.25} />
                    <p className="mlp-empty-title">Alt er på plass!</p>
                    <p>Ingen episoder eller filmer mangler.</p>
                </div>
            ) : (
                <>
                    {tvItems.length > 0 && (
                        <>
                            <p className="mlp-section-title">Serier – mangler episoder ({tvItems.length})</p>
                            <div className="mlp-cards" style={{ marginBottom: 16 }}>
                                {tvItems.map(ep => {
                                    const posterUrl = ep.series?.id && settings.sonarrUrl
                                        ? sonarrPosterUrl(settings.sonarrUrl, settings.sonarrApiKey, ep.series.id)
                                        : null;
                                    return (
                                        <div key={ep.id} className="mlp-card">
                                            <PosterImg src={posterUrl} type="tv" />
                                            <div className="mlp-card-body">
                                                <div className="mlp-card-title">{ep.series?.title || 'Ukjent'}</div>
                                                <div className="mlp-card-subtitle">
                                                    S{String(ep.seasonNumber).padStart(2, '0')}E{String(ep.episodeNumber).padStart(2, '0')} · {ep.title || ''}
                                                </div>
                                                <div className="mlp-card-meta">
                                                    <Badge variant="missing">Mangler</Badge>
                                                    {ep.airDate && <span style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>{fmtRelativeDate(ep.airDate)}</span>}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {movieItems.length > 0 && (
                        <>
                            <p className="mlp-section-title">Filmer – mangler ({movieItems.length})</p>
                            <div className="mlp-cards">
                                {movieItems.map(mv => {
                                    const posterUrl = mv.id && settings.radarrUrl
                                        ? radarrPosterUrl(settings.radarrUrl, settings.radarrApiKey, mv.id)
                                        : null;
                                    return (
                                        <div key={mv.id} className="mlp-card">
                                            <PosterImg src={posterUrl} type="movie" />
                                            <div className="mlp-card-body">
                                                <div className="mlp-card-title">{mv.title}</div>
                                                <div className="mlp-card-subtitle">{mv.year}</div>
                                                <div className="mlp-card-meta">
                                                    <Badge variant="missing">Mangler</Badge>
                                                    {mv.inCinemas && <span style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>Kino: {fmtRelativeDate(mv.inCinemas)}</span>}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </>
            )}
        </div>
    );
}

// ── Settings modal ─────────────────────────────────────────────────────────────

// Delt sjekkboksrad – samme utseende som flis-innstillingene (SettingsControls).
const ToggleRow = CheckboxRow;

function InputRow({ label, value, onChange, placeholder, type = 'text', mono = false }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>{label}</label>
            <input
                type={type}
                value={value || ''}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                style={{
                    padding: '7px 10px',
                    background: 'var(--color-bg-primary, #14161e)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 6,
                    color: 'var(--color-text-primary)',
                    fontSize: mono ? '0.78rem' : '0.82rem',
                    fontFamily: mono ? 'monospace' : 'inherit',
                    width: '100%',
                    boxSizing: 'border-box',
                }}
            />
        </div>
    );
}

function TestButton({ onTest, status }) {
    const isOk = status === 'ok';
    const isFail = status && status !== 'ok' && status !== 'testing';
    const isTesting = status === 'testing';
    return (
        <button
            onClick={onTest}
            disabled={isTesting}
            className={`mlp-test-btn${isOk ? ' mlp-test-ok' : isFail ? ' mlp-test-fail' : ''}`}
        >
            {isTesting ? <><Spinner size={12} /> Tester…</> : isOk ? '✓ OK' : isFail ? '✗ Feil' : 'Test'}
        </button>
    );
}

function ApiSettings({ settings, onChange }) {
    const [testStatus, setTestStatus] = useState({});

    const runTest = async (service) => {
        setTestStatus(prev => ({ ...prev, [service]: 'testing' }));
        try {
            if (service === 'sonarr') await testSonarr(settings.sonarrUrl, settings.sonarrApiKey);
            if (service === 'radarr') await testRadarr(settings.radarrUrl, settings.radarrApiKey);
            if (service === 'qbt') await testQbt(settings.qbtUrl, settings.qbtApiKey);
            if (service === 'sab') await testSab(settings.sabUrl, settings.sabApiKey);
            setTestStatus(prev => ({ ...prev, [service]: 'ok' }));
        } catch (err) {
            setTestStatus(prev => ({ ...prev, [service]: err.message || 'Feil' }));
        }
    };

    const inp = (key) => (val) => onChange({ [key]: val });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Sonarr */}
            <div className="mlp-service-block">
                <div className="mlp-service-block-title">
                    <Tv size={14} style={{ color: '#60a5fa' }} /> Sonarr
                    <div style={{ marginLeft: 'auto' }}>
                        <TestButton onTest={() => runTest('sonarr')} status={testStatus.sonarr} />
                    </div>
                </div>
                <InputRow label="URL" value={settings.sonarrUrl} onChange={inp('sonarrUrl')} placeholder="http://192.168.1.x:8989" mono />
                <InputRow label="API-nøkkel" value={settings.sonarrApiKey} onChange={inp('sonarrApiKey')} placeholder="32 tegn fra Sonarr → Innstillinger → Generelt" mono />
                {testStatus.sonarr && testStatus.sonarr !== 'ok' && testStatus.sonarr !== 'testing' && (
                    <div style={{ fontSize: '0.72rem', color: '#f87171' }}>{testStatus.sonarr}</div>
                )}
            </div>

            {/* Radarr */}
            <div className="mlp-service-block">
                <div className="mlp-service-block-title">
                    <Film size={14} style={{ color: '#c084fc' }} /> Radarr
                    <div style={{ marginLeft: 'auto' }}>
                        <TestButton onTest={() => runTest('radarr')} status={testStatus.radarr} />
                    </div>
                </div>
                <InputRow label="URL" value={settings.radarrUrl} onChange={inp('radarrUrl')} placeholder="http://192.168.1.x:7878" mono />
                <InputRow label="API-nøkkel" value={settings.radarrApiKey} onChange={inp('radarrApiKey')} placeholder="32 tegn fra Radarr → Innstillinger → Generelt" mono />
                {testStatus.radarr && testStatus.radarr !== 'ok' && testStatus.radarr !== 'testing' && (
                    <div style={{ fontSize: '0.72rem', color: '#f87171' }}>{testStatus.radarr}</div>
                )}
            </div>

            {/* qBittorrent */}
            <div className="mlp-service-block">
                <div className="mlp-service-block-title">
                    <Download size={14} style={{ color: '#facc15' }} /> qBittorrent
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <TestButton onTest={() => runTest('qbt')} status={testStatus.qbt} />
                    </div>
                </div>
                <ToggleRow
                    label="Aktiver qBittorrent"
                    description="Viser hastighet og seeds utover det Sonarr/Radarr rapporterer"
                    checked={settings.qbtEnabled}
                    onChange={v => onChange({ qbtEnabled: v })}
                />
                {settings.qbtEnabled && (
                    <>
                        <InputRow label="Proxy-URL" value={settings.qbtUrl} onChange={inp('qbtUrl')} placeholder="http://192.168.1.x:8093" mono />
                        <InputRow label="API-nøkkel" value={settings.qbtApiKey} onChange={inp('qbtApiKey')} placeholder="Fra qBittorrent → Innstillinger → Web UI → API Key" mono />
                        {testStatus.qbt && testStatus.qbt !== 'ok' && testStatus.qbt !== 'testing' && (
                            <div style={{ fontSize: '0.72rem', color: '#f87171' }}>{testStatus.qbt}</div>
                        )}
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                            Generer nøkkel i qBittorrent: Innstillinger → Web UI → API Key → «Generate a key».
                        </div>
                    </>
                )}
            </div>

            {/* SABnzbd */}
            <div className="mlp-service-block">
                <div className="mlp-service-block-title">
                    <Download size={14} style={{ color: '#fbbf24' }} /> SABnzbd
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <TestButton onTest={() => runTest('sab')} status={testStatus.sab} />
                    </div>
                </div>
                <ToggleRow
                    label="Aktiver SABnzbd"
                    description="Viser usenet-nedlastinger i kø-fanen"
                    checked={settings.sabEnabled}
                    onChange={v => onChange({ sabEnabled: v })}
                />
                {settings.sabEnabled && (
                    <>
                        <InputRow label="URL" value={settings.sabUrl} onChange={inp('sabUrl')} placeholder="http://192.168.1.x:8085" mono />
                        <InputRow label="API-nøkkel" value={settings.sabApiKey} onChange={inp('sabApiKey')} placeholder="Fra SABnzbd → Config → General → API Key" mono />
                        {testStatus.sab && testStatus.sab !== 'ok' && testStatus.sab !== 'testing' && (
                            <div style={{ fontSize: '0.72rem', color: '#f87171' }}>{testStatus.sab}</div>
                        )}
                        <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
                            Finn nøkkelen i SABnzbd: Config → General → Security → API Key.
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function DisplaySettings({ settings, onChange }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="form-group">
                <label>Dager fremover i kalender</label>
                <select
                    value={settings.daysAhead || 14}
                    onChange={e => onChange({ daysAhead: Number(e.target.value) })}
                    style={{ marginTop: 6, width: '100%', padding: '7px 10px', background: 'var(--color-bg-primary, #14161e)', border: '1px solid var(--color-border)', borderRadius: 6, color: 'var(--color-text-primary)', fontSize: '0.82rem' }}
                >
                    <option value={7}>7 dager</option>
                    <option value={14}>14 dager</option>
                    <option value={30}>30 dager</option>
                </select>
            </div>
            <div className="form-group">
                <label>Antall elementer i «Nylig lagt til»</label>
                <select
                    value={settings.recentLimit || 20}
                    onChange={e => onChange({ recentLimit: Number(e.target.value) })}
                    style={{ marginTop: 6, width: '100%', padding: '7px 10px', background: 'var(--color-bg-primary, #14161e)', border: '1px solid var(--color-border)', borderRadius: 6, color: 'var(--color-text-primary)', fontSize: '0.82rem' }}
                >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={30}>30</option>
                    <option value={50}>50</option>
                </select>
            </div>
            <div className="form-group">
                <label>Oppdateringsintervall</label>
                <select
                    value={settings.refreshInterval || 60}
                    onChange={e => onChange({ refreshInterval: Number(e.target.value) })}
                    style={{ marginTop: 6, width: '100%', padding: '7px 10px', background: 'var(--color-bg-primary, #14161e)', border: '1px solid var(--color-border)', borderRadius: 6, color: 'var(--color-text-primary)', fontSize: '0.82rem' }}
                >
                    <option value={30}>Hvert 30. sekund</option>
                    <option value={60}>Hvert minutt</option>
                    <option value={300}>Hvert 5. minutt</option>
                    <option value={0}>Manuelt</option>
                </select>
            </div>
        </div>
    );
}

function MediaSettingsModal({ settings, onClose, onSave }) {
    const [tab, setTab] = useState('api');
    const [local, setLocal] = useState(settings || {});

    const patch = (obj) => setLocal(prev => ({ ...prev, ...obj }));

    return createPortal(
        <div className="modal">
            <div className="modal-content" style={{ maxWidth: 520, display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header">
                    <h2>Mediebibliotek – innstillinger</h2>
                    <button className="icon-btn close-modal" onClick={onClose}><X size={24} /></button>
                </div>

                <div className="fp-settings-tabs">
                    <button className={tab === 'api' ? 'active' : ''} onClick={() => setTab('api')}>API-tilkobling</button>
                    <button className={tab === 'display' ? 'active' : ''} onClick={() => setTab('display')}>Visning</button>
                </div>

                <div className="modal-body" style={{ overflowY: 'auto' }}>
                    {tab === 'api'     && <ApiSettings     settings={local} onChange={patch} />}
                    {tab === 'display' && <DisplaySettings settings={local} onChange={patch} />}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>Avbryt</button>
                    <button className="btn btn-primary" onClick={() => { onSave(local); onClose(); }}>Lagre</button>
                </div>
            </div>
        </div>,
        document.body
    );
}

// ── Main component ─────────────────────────────────────────────────────────────

const TABS = [
    { key: 'calendar', label: 'Kommer snart', Icon: Calendar },
    { key: 'recent',   label: 'Nylig lagt til', Icon: History },
    { key: 'queue',    label: 'Laster ned',   Icon: Download },
    { key: 'missing',  label: 'Mangler',      Icon: Search },
];

export default function MediaLibraryPage({ page }) {
    const { updatePage, isEditMode } = useHomey();
    const settings = page.mediaSettings || {};

    const [activeTab, setActiveTab] = useState('calendar');
    const [showSettings, setShowSettings] = useState(false);

    // Data keyed by tab name
    const [tabData, setTabData] = useState({});
    const [tabLoading, setTabLoading] = useState({});
    const [tabErrors, setTabErrors] = useState({});

    // Count badges for queue and missing
    const queueCount = (tabData.queue?.sonarr?.records?.length || 0) + (tabData.queue?.radarr?.records?.length || 0) + (tabData.queue?.qbt?.filter(t => t.state === 'downloading')?.length || 0) + (tabData.queue?.sab?.slots?.filter(s => s.status !== 'Paused')?.length || 0);
    const missingCount = (tabData.missing?.sonarr?.records?.length || 0) + (tabData.missing?.radarr?.records?.length || 0);

    const hasConfig = !!(
        (settings.sonarrUrl && settings.sonarrApiKey) ||
        (settings.radarrUrl && settings.radarrApiKey)
    );

    const safeCall = async (fn, errorKey, errors) => {
        try { return await fn(); }
        catch (e) { errors[errorKey] = e.message || 'Ukjent feil'; return null; }
    };

    const fetchCalendar = useCallback(async () => {
        setTabLoading(prev => ({ ...prev, calendar: true }));
        const errors = {};
        const daysAhead = settings.daysAhead || 14;
        const [sonarr, radarr] = await Promise.all([
            settings.sonarrUrl && settings.sonarrApiKey
                ? safeCall(() => getSonarrCalendar(settings.sonarrUrl, settings.sonarrApiKey, daysAhead), 'sonarr', errors)
                : Promise.resolve([]),
            settings.radarrUrl && settings.radarrApiKey
                ? safeCall(() => getRadarrCalendar(settings.radarrUrl, settings.radarrApiKey, daysAhead), 'radarr', errors)
                : Promise.resolve([]),
        ]);
        setTabData(prev => ({ ...prev, calendar: { sonarr: sonarr || [], radarr: radarr || [] } }));
        setTabErrors(prev => ({ ...prev, calendar: errors }));
        setTabLoading(prev => ({ ...prev, calendar: false }));
    }, [settings.sonarrUrl, settings.sonarrApiKey, settings.radarrUrl, settings.radarrApiKey, settings.daysAhead]);

    const fetchRecent = useCallback(async () => {
        setTabLoading(prev => ({ ...prev, recent: true }));
        const errors = {};
        const limit = settings.recentLimit || 20;
        const [sonarr, radarr] = await Promise.all([
            settings.sonarrUrl && settings.sonarrApiKey
                ? safeCall(() => getSonarrHistory(settings.sonarrUrl, settings.sonarrApiKey, limit), 'sonarr', errors)
                : Promise.resolve(null),
            settings.radarrUrl && settings.radarrApiKey
                ? safeCall(() => getRadarrHistory(settings.radarrUrl, settings.radarrApiKey, limit), 'radarr', errors)
                : Promise.resolve(null),
        ]);
        setTabData(prev => ({ ...prev, recent: { sonarr, radarr } }));
        setTabErrors(prev => ({ ...prev, recent: errors }));
        setTabLoading(prev => ({ ...prev, recent: false }));
    }, [settings.sonarrUrl, settings.sonarrApiKey, settings.radarrUrl, settings.radarrApiKey, settings.recentLimit]);

    const fetchQueue = useCallback(async () => {
        setTabLoading(prev => ({ ...prev, queue: true }));
        const errors = {};
        const [sonarr, radarr, qbt, sab] = await Promise.all([
            settings.sonarrUrl && settings.sonarrApiKey
                ? safeCall(() => getSonarrQueue(settings.sonarrUrl, settings.sonarrApiKey), 'sonarr', errors)
                : Promise.resolve(null),
            settings.radarrUrl && settings.radarrApiKey
                ? safeCall(() => getRadarrQueue(settings.radarrUrl, settings.radarrApiKey), 'radarr', errors)
                : Promise.resolve(null),
            settings.qbtEnabled && settings.qbtUrl && settings.qbtApiKey
                ? safeCall(() => getQbtTorrents(settings.qbtUrl, settings.qbtApiKey), 'qbt', errors)
                : Promise.resolve([]),
            settings.sabEnabled && settings.sabUrl && settings.sabApiKey
                ? safeCall(() => getSabQueue(settings.sabUrl, settings.sabApiKey), 'sab', errors)
                : Promise.resolve(null),
        ]);
        setTabData(prev => ({ ...prev, queue: { sonarr, radarr, qbt: qbt || [], sab } }));
        setTabErrors(prev => ({ ...prev, queue: errors }));
        setTabLoading(prev => ({ ...prev, queue: false }));
    }, [settings.sonarrUrl, settings.sonarrApiKey, settings.radarrUrl, settings.radarrApiKey, settings.qbtEnabled, settings.qbtUrl, settings.qbtApiKey, settings.sabEnabled, settings.sabUrl, settings.sabApiKey]);

    const fetchMissing = useCallback(async () => {
        setTabLoading(prev => ({ ...prev, missing: true }));
        const errors = {};
        const [sonarr, radarr] = await Promise.all([
            settings.sonarrUrl && settings.sonarrApiKey
                ? safeCall(() => getSonarrMissing(settings.sonarrUrl, settings.sonarrApiKey), 'sonarr', errors)
                : Promise.resolve(null),
            settings.radarrUrl && settings.radarrApiKey
                ? safeCall(() => getRadarrMissing(settings.radarrUrl, settings.radarrApiKey), 'radarr', errors)
                : Promise.resolve(null),
        ]);
        setTabData(prev => ({ ...prev, missing: { sonarr, radarr } }));
        setTabErrors(prev => ({ ...prev, missing: errors }));
        setTabLoading(prev => ({ ...prev, missing: false }));
    }, [settings.sonarrUrl, settings.sonarrApiKey, settings.radarrUrl, settings.radarrApiKey]);

    const fetchForTab = useCallback((tab) => {
        if (!hasConfig) return;
        if (tab === 'calendar') fetchCalendar();
        if (tab === 'recent')   fetchRecent();
        if (tab === 'queue')    fetchQueue();
        if (tab === 'missing')  fetchMissing();
    }, [hasConfig, fetchCalendar, fetchRecent, fetchQueue, fetchMissing]);

    // Fetch on tab switch (only if no data yet)
    useEffect(() => {
        if (!hasConfig) return;
        if (!tabData[activeTab]) fetchForTab(activeTab);
    }, [activeTab, hasConfig]);

    // Auto-refresh
    useEffect(() => {
        const interval = settings.refreshInterval ?? 60;
        if (!hasConfig || interval === 0) return;
        const id = setInterval(() => fetchForTab(activeTab), interval * 1000);
        return () => clearInterval(id);
    }, [activeTab, hasConfig, settings.refreshInterval, fetchForTab]);

    const handleSaveSettings = async (newSettings) => {
        await updatePage({ ...page, mediaSettings: newSettings });
        setTabData({});
    };

    const tabBadge = { queue: queueCount || null, missing: missingCount || null };

    return (
        <div className="mlp">
            {/* Header – only in edit mode */}
            {isEditMode && (
                <div className="mlp-header">
                    <Film size={15} style={{ opacity: 0.6 }} />
                    <span className="mlp-header-title">{page?.name || 'Mediebibliotek'}</span>
                    <button className="mlp-icon-btn" onClick={() => setShowSettings(true)} title="Innstillinger">
                        <Settings size={15} />
                    </button>
                </div>
            )}

            {!hasConfig ? (
                <div className="mlp-setup">
                    <Film size={40} opacity={0.25} />
                    <h3>Mediebibliotek</h3>
                    <p>Koble til Sonarr og Radarr for å se filmer og TV-serier, nedlastinger og kommende episoder.</p>
                    <button className="mlp-setup-btn" onClick={() => setShowSettings(true)}>
                        <Settings size={16} /> Konfigurer tilkobling
                    </button>
                </div>
            ) : (
                <>
                    {/* Tab bar */}
                    <div className="mlp-tabs">
                        {TABS.map(({ key, label, Icon }) => (
                            <button
                                key={key}
                                className={`mlp-tab${activeTab === key ? ' active' : ''}`}
                                onClick={() => setActiveTab(key)}
                            >
                                <Icon size={13} />
                                {label}
                                {tabBadge[key] ? <span className="mlp-tab-badge">{tabBadge[key]}</span> : null}
                                {tabLoading[key] && <Spinner size={11} />}
                            </button>
                        ))}
                        <button
                            className="mlp-tab"
                            style={{ marginLeft: 'auto' }}
                            onClick={() => fetchForTab(activeTab)}
                            title="Oppdater"
                        >
                            <RefreshCw size={13} />
                        </button>
                    </div>

                    {/* Tab content */}
                    {activeTab === 'calendar' && (
                        <CalendarTab
                            settings={settings}
                            data={tabData.calendar}
                            loading={!!tabLoading.calendar}
                            errors={tabErrors.calendar || {}}
                        />
                    )}
                    {activeTab === 'recent' && (
                        <RecentTab
                            settings={settings}
                            data={tabData.recent}
                            loading={!!tabLoading.recent}
                            errors={tabErrors.recent || {}}
                        />
                    )}
                    {activeTab === 'queue' && (
                        <QueueTab
                            settings={settings}
                            data={tabData.queue}
                            loading={!!tabLoading.queue}
                            errors={tabErrors.queue || {}}
                        />
                    )}
                    {activeTab === 'missing' && (
                        <MissingTab
                            settings={settings}
                            data={tabData.missing}
                            loading={!!tabLoading.missing}
                            errors={tabErrors.missing || {}}
                        />
                    )}
                </>
            )}

            {showSettings && (
                <MediaSettingsModal
                    settings={settings}
                    onClose={() => setShowSettings(false)}
                    onSave={handleSaveSettings}
                />
            )}
        </div>
    );
}
