import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useHomey } from '../../context/HomeyContext';
import { hassAPI } from '../../services/hass-api';
import { Scissors, Play, Pause, Home, Battery, BatteryCharging, AlertTriangle, CloudRain, Clock, Ruler, Minus, Plus, ArrowUp, Timer, Maximize2 } from 'lucide-react';

const STATE_LABELS = {
    mowing: 'Klipper',
    edge_cutting: 'Kantklipper',
    paused: 'Pauset',
    manual_stop: 'Stoppet',
    docked: 'I basen',
    home: 'I basen',
    charging: 'Lader',
    idle: 'Klar',
    leaving_home: 'Forlater basen',
    going_home: 'På vei hjem',
    returning: 'På vei hjem',
    rain_delay: 'Regnpause',
    locked: 'Låst',
    error: 'Feil',
    offline: 'Frakoblet',
    unavailable: 'Utilgjengelig',
    unknown: 'Ukjent',
};

const STATE_COLORS = {
    mowing: 'var(--color-success)',
    edge_cutting: 'var(--color-success)',
    leaving_home: 'var(--color-success)',
    charging: 'var(--color-info)',
    paused: 'var(--color-warning)',
    manual_stop: 'var(--color-warning)',
    going_home: 'var(--color-warning)',
    returning: 'var(--color-warning)',
    rain_delay: 'var(--color-info)',
    locked: 'var(--color-warning)',
    error: 'var(--color-danger)',
    offline: 'var(--color-text-secondary)',
    unavailable: 'var(--color-text-secondary)',
};

const ACTIVE_STATES = ['mowing', 'edge_cutting', 'leaving_home'];
const PAUSED_STATES = ['paused', 'manual_stop'];

const formatMinutes = (min) => {
    if (min == null || isNaN(min)) return null;
    if (min < 90) return `${Math.round(min)} min`;
    return `${(min / 60).toFixed(1).replace('.', ',')} t`;
};

const formatNextStart = (val) => {
    if (!val || val === 'unavailable' || val === 'unknown') return null;
    const date = new Date(val);
    if (isNaN(date.getTime())) return null;
    const now = new Date();
    if (date < now) return null;
    const hm = date.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayDiff = Math.floor((date - today) / 86400000);
    if (dayDiff === 0) return `I dag ${hm}`;
    if (dayDiff === 1) return `I morgen ${hm}`;
    const weekday = date.toLocaleDateString('nb-NO', { weekday: 'long' });
    return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)} ${hm}`;
};

const LawnMowerTile = ({ tile, device, expanded = false }) => {
    const { api, setIsInteracting, settings } = useHomey();

    // Utvidet visning – valgbare seksjoner (tile.settings, default på)
    const ts = tile?.settings || {};
    const showProgress      = ts.showProgress !== false;
    const showCuttingHeight = ts.showCuttingHeight !== false;
    const showStats         = ts.showStats !== false;
    const showMap           = ts.showMap !== false;

    const getCap = (id) => device?.capabilitiesObj?.[id]?.value;

    // Optimistisk statusoverstyring ved knappetrykk – nullstilles når HA-data kommer inn
    const [statusOverride, setStatusOverride] = useState(null);
    useEffect(() => {
        setStatusOverride(null);
    }, [device.capabilitiesObj]);

    const battery = getCap('measure_battery');
    const isOnline = getCap('online');
    const isCharging = getCap('lawn_mower_charging');
    const hasRain = getCap('lawn_mower_rain');
    const rainRemaining = getCap('lawn_mower_rain_remaining');
    const isLifted = getCap('lawn_mower_lifted');
    const errorMsg = getCap('lawn_mower_error');
    const totalTime = getCap('lawn_mower_total_time');
    const totalTimeUnit = device?.capabilitiesObj?.['lawn_mower_total_time']?.units;
    const nextStart = getCap('lawn_mower_next_start');
    const bladeTime = getCap('lawn_mower_blade_time');
    const bladeTimeUnit = device?.capabilitiesObj?.['lawn_mower_blade_time']?.units;
    const distance = getCap('lawn_mower_distance');
    // Worx-skytelleren (progress/area_today) henger ofte etter og kan stå på 0 hele dagen,
    // mens det lokale estimatet er live — bruk den største av de to
    const bestOf = (a, b) => (a == null ? b : b == null ? a : Math.max(a, b));
    const progress = bestOf(getCap('lawn_mower_progress'), getCap('lawn_mower_progress_est'));
    const areaToday = bestOf(getCap('lawn_mower_area_today'), getCap('lawn_mower_area_today_est'));
    const lawnArea = getCap('lawn_mower_lawn_area');
    const timeToday = getCap('lawn_mower_time_today');
    const cutHeight = getCap('cutting_height');
    const cutHeightOpts = device?.capabilitiesOptions?.['cutting_height'] || { min: 20, max: 60, step: 5 };
    const hasEdgeCut = device?.capabilities?.includes('lawn_mower_edge_cut');
    const mapUrl = getCap('lawn_mower_map_url');

    const mowerStatus = statusOverride || getCap('lawn_mower_status') || getCap('lawn_mower_state') || 'unknown';

    const isActive = ACTIVE_STATES.includes(mowerStatus);
    const isPaused = PAUSED_STATES.includes(mowerStatus);
    const isUnavailable = mowerStatus === 'unavailable' || mowerStatus === 'offline' || isOnline === false;
    const hasError = mowerStatus === 'error' || (errorMsg && errorMsg !== 'no_error');
    const showRain = hasRain || mowerStatus === 'rain_delay' || (rainRemaining != null && rainRemaining > 0);

    const stateLabel = STATE_LABELS[mowerStatus] || mowerStatus.replace(/_/g, ' ');
    const stateColor = isUnavailable
        ? 'var(--color-text-secondary)'
        : STATE_COLORS[mowerStatus] || 'var(--color-text-secondary)';

    const iconColor = isActive ? 'var(--color-success)' :
        hasError ? 'var(--color-danger)' :
        isCharging ? 'var(--color-info)' :
        'var(--color-text-secondary)';

    // Lokal klippehøyde for umiddelbar respons på +/- knappene
    const [localHeight, setLocalHeight] = useState(cutHeight);
    useEffect(() => { setLocalHeight(cutHeight); }, [cutHeight]);

    // «Nær live» kart: cache-bust hvert 2,5 s mens utvidet visning er åpen
    const hassBaseUrl = (hassAPI.httpBase || settings?.hassUrl || '').replace(/\/$/, '');
    const [mapImageTs, setMapImageTs] = useState(() => Date.now());
    useEffect(() => {
        if (!expanded || !mapUrl || !showMap) return;
        const id = setInterval(() => setMapImageTs(Date.now()), 2500);
        return () => clearInterval(id);
    }, [expanded, mapUrl, showMap]);

    const [mapFullscreen, setMapFullscreen] = useState(false);
    useEffect(() => {
        if (!expanded) setMapFullscreen(false);
    }, [expanded]);

    const mapImageUrl = mapUrl
        ? `${hassBaseUrl}${mapUrl}${mapUrl.includes('?') ? '&' : '?'}_t=${mapImageTs}`
        : null;

    const sendCommand = (capability, newStatus) => (e) => {
        e.stopPropagation();
        setStatusOverride(newStatus);
        setIsInteracting(true);
        api.setCapability(device.id, capability, true);
    };

    const handleHeight = (delta) => (e) => {
        e.stopPropagation();
        const step = cutHeightOpts.step || 5;
        const next = Math.min(cutHeightOpts.max ?? 60, Math.max(cutHeightOpts.min ?? 20, (localHeight ?? 40) + delta * step));
        if (next === localHeight) return;
        setLocalHeight(next);
        setIsInteracting(true);
        api.setCapability(device.id, 'cutting_height', next);
    };

    const nextStartLabel = formatNextStart(nextStart);
    const progressPct = (progress != null && !isNaN(progress)) ? Math.max(0, Math.min(100, progress)) : null;

    const btnStyle = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '5px',
        padding: '8px 14px',
        borderRadius: '10px',
        border: '1px solid rgba(255, 255, 255, 0.16)',
        cursor: isUnavailable ? 'not-allowed' : 'pointer',
        fontSize: '0.78rem',
        fontWeight: 600,
        background: 'var(--color-surface-raised)',
        color: isUnavailable ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.35)',
        opacity: isUnavailable ? 0.5 : 1,
        transition: 'background 0.15s',
    };

    const bannerStyle = (bg, color) => ({
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '6px 10px', borderRadius: '8px',
        background: bg,
        fontSize: '0.75rem',
        color,
    });

    const sectionLabel = (text) => (
        <div style={{ fontSize: '0.6rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
            {text}
        </div>
    );

    const BatteryIcon = isCharging ? BatteryCharging : Battery;

    return (
        <div className="tile-content" style={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: '100%',
            padding: '10px',
            gap: '6px',
        }}>
            {/* Kompakt visning / header */}
            <div style={{
                flex: expanded ? '0 0 auto' : 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
            }}>
                {/* Gressklipper-ikon */}
                <div style={{ position: 'relative' }}>
                    <Scissors
                        size={expanded ? 36 : 32}
                        color={iconColor}
                        style={{
                            filter: isActive ? `drop-shadow(0 0 6px ${iconColor})` : 'none',
                            transition: 'all 0.3s',
                        }}
                    />
                    {hasError && (
                        <AlertTriangle
                            size={14}
                            color="var(--color-danger)"
                            style={{ position: 'absolute', top: -4, right: -4 }}
                        />
                    )}
                    {isLifted && !hasError && (
                        <ArrowUp
                            size={14}
                            color="var(--color-warning)"
                            style={{ position: 'absolute', top: -4, right: -4 }}
                        />
                    )}
                    {showRain && !hasError && !isLifted && (
                        <CloudRain
                            size={14}
                            color="var(--color-info)"
                            style={{ position: 'absolute', top: -4, right: -4 }}
                        />
                    )}
                </div>

                {/* Status */}
                <span style={{
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    color: stateColor,
                    textAlign: 'center',
                }}>
                    {isUnavailable ? 'Frakoblet' : stateLabel}
                </span>

                {/* Fremdrift i dag (mini-bar) */}
                {!expanded && progressPct != null && (isActive || isPaused) && (
                    <div style={{
                        width: '70%',
                        height: '4px',
                        borderRadius: '2px',
                        background: 'var(--color-surface-raised)',
                        overflow: 'hidden',
                    }}>
                        <div style={{
                            width: `${progressPct}%`,
                            height: '100%',
                            borderRadius: '2px',
                            background: 'var(--color-success)',
                            transition: 'width 0.5s',
                        }} />
                    </div>
                )}

                {/* Batteri + neste start */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
                    {battery !== undefined && battery !== null && !isNaN(battery) && (
                        <span style={{
                            display: 'flex', alignItems: 'center', gap: '3px',
                            fontSize: '0.72rem',
                            color: isCharging ? 'var(--color-info)' :
                                battery < 20 ? 'var(--color-danger)' : 'var(--color-text-secondary)',
                        }}>
                            <BatteryIcon size={11} />
                            {Math.round(battery)}%
                        </span>
                    )}
                    {!expanded && nextStartLabel && !isActive && (
                        <span style={{
                            display: 'flex', alignItems: 'center', gap: '3px',
                            fontSize: '0.72rem',
                            color: 'var(--color-text-secondary)',
                        }}>
                            <Clock size={11} />
                            {nextStartLabel}
                        </span>
                    )}
                </div>
            </div>

            {/* Utvidet visning */}
            {expanded && (
                <div style={{ display: 'flex', flexDirection: 'row', gap: '12px', flex: 1, minHeight: 0 }}>

                    {/* Venstre: kontroller + info */}
                    <div style={{ flex: (showMap && mapImageUrl) ? '0 0 220px' : 1, display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', paddingTop: '4px' }}>

                        {/* Kontrollknapper */}
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {!isActive && (
                                <button
                                    onMouseDown={e => e.stopPropagation()}
                                    onClick={sendCommand('lawn_mower_start', 'mowing')}
                                    disabled={isUnavailable}
                                    style={{ ...btnStyle, ...(isUnavailable ? {} : { background: 'var(--color-success)', borderColor: 'var(--color-success)', color: 'white' }) }}
                                >
                                    <Play size={13} />
                                    Start
                                </button>
                            )}
                            {isActive && (
                                <button
                                    onMouseDown={e => e.stopPropagation()}
                                    onClick={sendCommand('lawn_mower_pause', 'paused')}
                                    disabled={isUnavailable}
                                    style={btnStyle}
                                >
                                    <Pause size={13} />
                                    Pause
                                </button>
                            )}
                            {(isActive || isPaused) && (
                                <button
                                    onMouseDown={e => e.stopPropagation()}
                                    onClick={sendCommand('lawn_mower_dock', 'going_home')}
                                    disabled={isUnavailable}
                                    style={btnStyle}
                                >
                                    <Home size={13} />
                                    Til base
                                </button>
                            )}
                            {hasEdgeCut && !isActive && (
                                <button
                                    onMouseDown={e => e.stopPropagation()}
                                    onClick={sendCommand('lawn_mower_edge_cut', 'edge_cutting')}
                                    disabled={isUnavailable}
                                    style={btnStyle}
                                >
                                    <Scissors size={13} />
                                    Kantklipp
                                </button>
                            )}
                        </div>

                        {/* Løftet-varsel */}
                        {isLifted && (
                            <div style={bannerStyle('rgba(245,158,11,0.1)', 'var(--color-warning)')}>
                                <ArrowUp size={14} />
                                Roboten er løftet fra bakken
                            </div>
                        )}

                        {/* Regnvarsel */}
                        {showRain && (
                            <div style={bannerStyle('rgba(59,130,246,0.1)', 'var(--color-info)')}>
                                <CloudRain size={14} />
                                {rainRemaining != null && rainRemaining > 0
                                    ? `Regnpause – ${formatMinutes(rainRemaining)} igjen`
                                    : 'Regnsensor aktiv – klipping utsatt'}
                            </div>
                        )}

                        {/* Feilmelding */}
                        {hasError && errorMsg && errorMsg !== 'no_error' && (
                            <div style={bannerStyle('rgba(239,68,68,0.1)', 'var(--color-danger)')}>
                                <AlertTriangle size={14} />
                                Feil: {errorMsg.replace(/_/g, ' ')}
                            </div>
                        )}

                        {/* Fremdrift i dag */}
                        {showProgress && (progressPct != null || areaToday != null) && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--color-text-secondary)' }}>Klipt i dag</span>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>
                                        {areaToday != null
                                            ? `${Math.round(areaToday)}${lawnArea != null ? ` av ${Math.round(lawnArea)}` : ''} m²`
                                            : `${Math.round(progressPct)} %`}
                                    </span>
                                </div>
                                {progressPct != null && (
                                    <div style={{
                                        width: '100%',
                                        height: '6px',
                                        borderRadius: '3px',
                                        background: 'var(--color-surface-raised)',
                                        overflow: 'hidden',
                                    }}>
                                        <div style={{
                                            width: `${progressPct}%`,
                                            height: '100%',
                                            borderRadius: '3px',
                                            background: 'var(--color-success)',
                                            transition: 'width 0.5s',
                                        }} />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Klippehøyde */}
                        {showCuttingHeight && localHeight != null && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                                    <Ruler size={13} />
                                    Klippehøyde
                                </span>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <button
                                        onMouseDown={e => e.stopPropagation()}
                                        onClick={handleHeight(-1)}
                                        disabled={isUnavailable || localHeight <= (cutHeightOpts.min ?? 20)}
                                        style={{ ...btnStyle, padding: '5px 9px' }}
                                    >
                                        <Minus size={12} />
                                    </button>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 600, minWidth: '44px', textAlign: 'center' }}>
                                        {localHeight} mm
                                    </span>
                                    <button
                                        onMouseDown={e => e.stopPropagation()}
                                        onClick={handleHeight(1)}
                                        disabled={isUnavailable || localHeight >= (cutHeightOpts.max ?? 60)}
                                        style={{ ...btnStyle, padding: '5px 9px' }}
                                    >
                                        <Plus size={12} />
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Statistikk */}
                        {showStats && (
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            {nextStartLabel && (
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--color-text-secondary)' }}>Neste start</span>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{nextStartLabel}</span>
                                </div>
                            )}
                            {timeToday != null && (
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--color-text-secondary)' }}>Klippetid i dag</span>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{formatMinutes(timeToday)}</span>
                                </div>
                            )}
                            {totalTime != null && (
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--color-text-secondary)' }}>Total driftstid</span>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                                        {totalTimeUnit === 'min' ? formatMinutes(totalTime) : `${totalTime}t`}
                                    </span>
                                </div>
                            )}
                            {bladeTime != null && (
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--color-text-secondary)' }}>Knivtid</span>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }}>
                                        <Timer size={11} />
                                        {bladeTimeUnit === 'min' ? formatMinutes(bladeTime) : `${bladeTime}t`}
                                    </span>
                                </div>
                            )}
                            {distance != null && (
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '0.65rem', color: 'var(--color-text-secondary)' }}>Kjørt distanse</span>
                                    <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{distance} m</span>
                                </div>
                            )}
                        </div>
                        )}
                    </div>

                    {/* Høyre: kart */}
                    {showMap && mapImageUrl && (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                            {sectionLabel('Kart')}
                            <div
                                onPointerDown={e => e.stopPropagation()}
                                onClick={() => setMapFullscreen(true)}
                                style={{
                                    borderRadius: '8px',
                                    overflow: 'hidden',
                                    background: '#0a0a0f',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'zoom-in',
                                    position: 'relative',
                                    flex: 1,
                                    minHeight: 0,
                                    maxHeight: '280px',
                                }}>
                                <img
                                    src={mapImageUrl}
                                    alt="Klipperkart"
                                    style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
                                    onError={(e) => { e.target.style.display = 'none'; e.target.parentNode.style.display = 'none'; }}
                                />
                                <div style={{
                                    position: 'absolute', top: '6px', right: '6px',
                                    background: 'rgba(0,0,0,0.55)', borderRadius: '6px',
                                    padding: '3px 5px', display: 'flex', alignItems: 'center',
                                    pointerEvents: 'none',
                                }}>
                                    <Maximize2 size={12} color="white" />
                                </div>
                            </div>

                            {/* Fullskjerm-kart */}
                            {mapFullscreen && createPortal(
                                <div
                                    onPointerDown={e => e.stopPropagation()}
                                    onClick={() => setMapFullscreen(false)}
                                    style={{
                                        position: 'fixed', inset: 0, zIndex: 99999,
                                        background: 'rgba(0,0,0,0.92)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'zoom-out',
                                    }}
                                >
                                    <img
                                        src={mapImageUrl}
                                        alt="Klipperkart"
                                        style={{ maxWidth: '100vw', maxHeight: '100vh', objectFit: 'contain', display: 'block' }}
                                        onClick={e => e.stopPropagation()}
                                    />
                                    <button
                                        onClick={() => setMapFullscreen(false)}
                                        style={{
                                            position: 'fixed', top: '16px', right: '16px',
                                            background: 'rgba(255,255,255,0.15)', border: 'none',
                                            borderRadius: '50%', width: '36px', height: '36px',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            cursor: 'pointer', color: 'white', fontSize: '1.1rem',
                                        }}
                                    >
                                        ✕
                                    </button>
                                </div>,
                                document.body
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default LawnMowerTile;
