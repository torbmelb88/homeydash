import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useHomey } from '../../context/HomeyContext';
import { Disc2, Play, Pause, Home, Battery, MapPin, AlertTriangle, Droplets,
         Volume2, BellOff, Map, Maximize2 } from 'lucide-react';
import { hassAPI } from '../../services/hass-api';

const STATE_LABELS = {
    docked: 'Dokket',
    charging: 'Lader',
    charging_complete: 'Ferdigladet',
    cleaning: 'Rengjør',
    returning_home: 'Returnerer',
    paused: 'Pauset',
    idle: 'Inaktiv',
    error: 'Feil',
    starting: 'Starter',
    charger_disconnected: 'Frakoblet lader',
    emptying_the_bin: 'Tømmer beholder',
    washing_the_mop: 'Vasker mopp',
    going_to_wash_the_mop: 'Kjører til moppevask',
    back_to_dock_washing_duster: 'Til dock for vasking',
    docking: 'Dokker',
    going_to_target: 'Kjører til mål',
    zoned_cleaning: 'Sonerengj.',
    segment_cleaning: 'Romrengj.',
    spot_cleaning: 'Punktrengj.',
    robot_status_mopping: 'Mopper',
    segment_mopping: 'Rom-mopping',
    manual_mode: 'Manuell',
    remote_control_active: 'Fjernkontroll',
};

const STATE_COLORS = {
    cleaning: 'var(--color-info)',
    zoned_cleaning: 'var(--color-info)',
    segment_cleaning: 'var(--color-info)',
    spot_cleaning: 'var(--color-info)',
    robot_status_mopping: 'var(--color-info)',
    segment_mopping: 'var(--color-info)',
    returning_home: 'var(--color-warning)',
    docking: 'var(--color-warning)',
    going_to_wash_the_mop: 'var(--color-warning)',
    back_to_dock_washing_duster: 'var(--color-warning)',
    error: 'var(--color-danger)',
    paused: 'var(--color-warning)',
    charging: 'var(--color-success)',
    charging_complete: 'var(--color-success)',
    docked: 'var(--color-success)',
};

const FAN_SPEED_LABELS = {
    quiet: 'Stille', balanced: 'Balansert', turbo: 'Turbo', max: 'Maks',
    off: 'Av', custom: 'Tilpasset',
};

const MOP_INTENSITY_LABELS = {
    off: 'Av', mild: 'Mild', standard: 'Standard', intense: 'Intens', custom: 'Tilpasset',
};

const MOP_MODE_LABELS = {
    standard: 'Standard', deep: 'Dyp', deep_plus: 'Ekstra dyp', custom: 'Tilpasset',
};

const PillBtn = ({ active, onClick, children, disabled }) => (
    <button
        onPointerDown={e => e.stopPropagation()}
        onClick={onClick}
        disabled={disabled}
        style={{
            padding: '4px 10px',
            borderRadius: '12px',
            border: 'none',
            cursor: disabled ? 'default' : 'pointer',
            fontSize: '0.72rem',
            fontWeight: 500,
            background: active ? 'var(--color-info)' : 'var(--color-surface-raised)',
            color: active ? 'white' : 'var(--color-text-primary)',
            opacity: disabled ? 0.4 : 1,
            transition: 'background 0.15s',
            flexShrink: 0,
        }}
    >
        {children}
    </button>
);

const LifeBar = ({ label, hours, warnBelow = 50, dangerBelow = 20 }) => {
    if (hours === undefined) return null;
    const color = hours < dangerBelow ? 'var(--color-danger)' : hours < warnBelow ? 'var(--color-warning)' : 'var(--color-text-secondary)';
    return (
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ fontSize: '0.6rem', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>{label}</span>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color }}>{hours}t</span>
        </div>
    );
};

const VacuumTile = ({ tile, device, expanded = false }) => {
    const { api, setIsInteracting, devices, settings } = useHomey();
    const s = tile.settings || {};

    // If the tile points to a standalone vacuum entity, prefer the composite device
    // so we get all capabilities (maps, mop, maintenance, timestamps, etc.)
    const effectiveDevice = useMemo(() => {
        if (!device || device.id?.startsWith('composite:')) return device;
        const composite = devices?.find(d =>
            d.id?.startsWith('composite:') &&
            d.settings?.vacuumEntityId === device.entityId
        );
        return composite || device;
    }, [device, devices]);

    const hassBaseUrl = (hassAPI.httpBase || settings?.hassUrl || '').replace(/\/$/, '');


    const showFanSpeed    = s.showFanSpeed    !== false;
    const showMopControls = s.showMopControls !== false;
    const showMapSelect   = s.showMapSelect   !== false;
    const showLastClean   = s.showLastClean   !== false;
    const showMaintenance = s.showMaintenance !== false;
    const showVolumeDnd   = s.showVolumeDnd   === true;

    const getCap = (id) => effectiveDevice?.capabilitiesObj?.[id]?.value;

    const [vacuumState, setVacuumState] = useState(getCap('vacuum_state') || 'docked');
    const [fanSpeed, setFanSpeed]       = useState(getCap('vacuum_fan_speed'));
    const [mopIntensity, setMopIntensity] = useState(getCap('mop_intensity'));
    const [mopMode, setMopMode]         = useState(getCap('mop_mode'));
    const [selectedMap, setSelectedMap] = useState(getCap('selected_map'));
    const [dnd, setDnd]                 = useState(getCap('vacuum_dnd'));

    useEffect(() => {
        if (!effectiveDevice?.capabilitiesObj) return;
        setVacuumState(getCap('vacuum_state') || 'docked');
        setFanSpeed(getCap('vacuum_fan_speed'));
        setMopIntensity(getCap('mop_intensity'));
        setMopMode(getCap('mop_mode'));
        setSelectedMap(getCap('selected_map'));
        setDnd(getCap('vacuum_dnd'));
    }, [effectiveDevice?.capabilitiesObj]);

    // Refresh map image while expanded (cache-bust every 2.5s)
    const [mapImageTs, setMapImageTs] = useState(() => Date.now());
    useEffect(() => {
        if (!expanded) return;
        const id = setInterval(() => setMapImageTs(Date.now()), 2500);
        return () => clearInterval(id);
    }, [expanded]);

    const [mapFullscreen, setMapFullscreen] = useState(false);
    useEffect(() => {
        if (!expanded) setMapFullscreen(false);
    }, [expanded]);

    const battery      = getCap('measure_battery');
    const cleaningArea = getCap('cleaning_area');
    const cleaningTime = getCap('cleaning_time');
    const currentRoom  = getCap('current_room');
    const errorCode    = getCap('vacuum_error');
    const mopAttached  = getCap('mop_attached');
    const waterTank    = getCap('water_tank_attached');
    const alarmWater   = getCap('alarm_water');
    const brushMain    = getCap('brush_life_main');
    const brushSide    = getCap('brush_life_side');
    const filterLife   = getCap('filter_life');
    const sensorLife   = getCap('sensor_life');
    const vacuumVolume = getCap('vacuum_volume');
    const lastCleanStart = getCap('last_clean_start');
    const lastCleanEnd   = getCap('last_clean_end');
    const totalCleans    = getCap('total_cleans_count');
    const mapImageUrls   = getCap('map_image_urls') || {};

    const fanSpeedOptions     = effectiveDevice?.capabilitiesOptions?.['vacuum_fan_speed']?.values || [];
    const mopIntensityOptions = effectiveDevice?.capabilitiesOptions?.['mop_intensity']?.values || [];
    const mopModeOptions      = effectiveDevice?.capabilitiesOptions?.['mop_mode']?.values || [];
    const mapOptions          = effectiveDevice?.capabilitiesOptions?.['selected_map']?.values || [];

    const stateLabel = STATE_LABELS[vacuumState] || vacuumState;
    const stateColor = STATE_COLORS[vacuumState] || 'var(--color-text-secondary)';

    const isCleaning  = ['cleaning', 'zoned_cleaning', 'segment_cleaning', 'spot_cleaning',
        'robot_status_mopping', 'segment_mopping', 'manual_mode', 'remote_control_active'].includes(vacuumState);
    const isReturning = ['returning_home', 'docking', 'going_to_wash_the_mop',
        'back_to_dock_washing_duster', 'emptying_the_bin', 'washing_the_mop'].includes(vacuumState);
    const isDocked    = ['docked', 'charging', 'charging_complete'].includes(vacuumState);
    const isPaused    = vacuumState === 'paused';
    const isError     = vacuumState === 'error';
    const hasError    = isError || (errorCode && errorCode !== 'none' && errorCode !== 'dock');

    const devId = effectiveDevice?.id;

    const cmd = (capId, optimistic, setFn) => (e) => {
        e.stopPropagation();
        if (optimistic !== undefined && setFn) setFn(optimistic);
        setIsInteracting(true);
        api.setCapability(devId, capId, true);
    };

    const setOpt = (capId, val, setFn) => (e) => {
        e.stopPropagation();
        setFn(val);
        setIsInteracting(true);
        api.setCapability(devId, capId, val);
    };

    const fmtTime = (iso) => {
        if (!iso) return null;
        try {
            const d = new Date(iso);
            return d.toLocaleString('nb-NO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
        } catch { return null; }
    };

    const durationMin = (start, end) => {
        if (!start || !end) return null;
        const diff = (new Date(end) - new Date(start)) / 60000;
        return isNaN(diff) || diff < 0 ? null : Math.round(diff);
    };

    const lastDuration = durationMin(lastCleanStart, lastCleanEnd);

    // Current map image URL – append cache-buster so browser fetches fresh image each interval
    const currentMapImageUrl = selectedMap && mapImageUrls[selectedMap]
        ? `${hassBaseUrl}${mapImageUrls[selectedMap]}&_t=${mapImageTs}`
        : null;

    const sectionLabel = (text) => (
        <div style={{ fontSize: '0.6rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
            {text}
        </div>
    );

    return (
        <div className="tile-content" style={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: '100%',
            padding: expanded ? '12px' : '10px',
            gap: '6px',
        }}>
            {/* ── Kompakt header ── */}
            <div style={{
                display: expanded ? 'none' : 'flex',
                flex: expanded ? '0 0 auto' : 1,
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '5px',
            }}>
                <div style={{ position: 'relative' }}>
                    <Disc2
                        size={expanded ? 38 : 30}
                        color={stateColor}
                        strokeWidth={1.5}
                        style={{
                            filter: isCleaning ? `drop-shadow(0 0 7px ${stateColor})` : 'none',
                            transition: 'color 0.4s, filter 0.4s',
                        }}
                    />
                    {hasError && (
                        <AlertTriangle size={13} color="var(--color-danger)"
                            style={{ position: 'absolute', top: -3, right: -5 }} />
                    )}
                    {dnd && (
                        <BellOff size={11} color="var(--color-text-secondary)"
                            style={{ position: 'absolute', bottom: -3, right: -5 }} />
                    )}
                </div>

                <span style={{
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    color: stateColor,
                    textAlign: 'center',
                    lineHeight: 1.1,
                }}>
                    {stateLabel}
                </span>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                    {battery !== undefined && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.7rem',
                            color: battery < 20 ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}>
                            <Battery size={10} />
                            {Math.round(battery)}%
                        </span>
                    )}
                    {currentRoom && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.7rem',
                            color: 'var(--color-text-secondary)' }}>
                            <MapPin size={10} />
                            {currentRoom}
                        </span>
                    )}
                    {isCleaning && cleaningArea > 0 && (
                        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>
                            {cleaningArea} m²
                        </span>
                    )}
                </div>
            </div>

            {/* ── Utvidet visning ── */}
            {expanded && (
                <div style={{ display: 'flex', flexDirection: 'row', gap: '12px', flex: 1, minHeight: 0 }}>

                    {/* Venstre: kontroller + alle innstillinger */}
                    <div style={{ flex: '0 0 210px', display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>

                        {/* Kontrollknapper */}
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {!isCleaning && (
                                <button onPointerDown={e => e.stopPropagation()} onClick={cmd('vacuum_start', 'cleaning', setVacuumState)}
                                    style={{ ...controlBtn(), background: 'var(--color-info)', color: 'white' }}>
                                    <Play size={12} /> Start
                                </button>
                            )}
                            {(isCleaning || isReturning) && (
                                <button onPointerDown={e => e.stopPropagation()} onClick={cmd('vacuum_pause', 'paused', setVacuumState)}
                                    style={controlBtn()}>
                                    <Pause size={12} /> Pause
                                </button>
                            )}
                            {(isCleaning || isPaused || (!isDocked && !isReturning)) && (
                                <button onPointerDown={e => e.stopPropagation()} onClick={cmd('vacuum_return_home', 'returning_home', setVacuumState)}
                                    style={controlBtn()}>
                                    <Home size={12} /> Hjem
                                </button>
                            )}
                        </div>

                        {/* Nåværende økt */}
                        {(cleaningArea > 0 || cleaningTime > 0) && (
                            <div>
                                {sectionLabel('Nåværende økt')}
                                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                    {cleaningArea > 0 && <StatCell label="Areal" value={`${cleaningArea} m²`} />}
                                    {cleaningTime > 0 && <StatCell label="Tid" value={`${Math.round(cleaningTime)} min`} />}
                                    {currentRoom && <StatCell label="Rom" value={currentRoom} />}
                                </div>
                            </div>
                        )}

                        {/* Mopp/vanntank */}
                        {(mopAttached !== undefined || waterTank !== undefined) && (
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                {mopAttached !== undefined && (
                                    <span style={{ ...badge(mopAttached ? 'info' : 'neutral') }}>
                                        Mopp {mopAttached ? '✓' : '—'}
                                    </span>
                                )}
                                {waterTank !== undefined && (
                                    <span style={{ ...badge(alarmWater ? 'danger' : waterTank ? 'info' : 'neutral'), display: 'flex', alignItems: 'center', gap: '3px' }}>
                                        <Droplets size={9} />
                                        {alarmWater ? 'Lite vann!' : waterTank ? 'Vann ok' : 'Ingen tank'}
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Sugestyrke */}
                        {showFanSpeed && fanSpeedOptions.filter(o => o.id !== 'custom').length > 0 && (
                            <div>
                                {sectionLabel('Sugestyrke')}
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                    {fanSpeedOptions.filter(o => o.id !== 'custom').map(opt => (
                                        <PillBtn key={opt.id} active={fanSpeed === opt.id}
                                            onClick={setOpt('vacuum_fan_speed', opt.id, setFanSpeed)}>
                                            {FAN_SPEED_LABELS[opt.id] || opt.title}
                                        </PillBtn>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Moppekontroller */}
                        {showMopControls && mopAttached && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {mopIntensityOptions.filter(o => o.id !== 'custom').length > 0 && (
                                    <div>
                                        {sectionLabel('Moppestyrke')}
                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                            {mopIntensityOptions.filter(o => o.id !== 'custom').map(opt => (
                                                <PillBtn key={opt.id} active={mopIntensity === opt.id}
                                                    onClick={setOpt('mop_intensity', opt.id, setMopIntensity)}>
                                                    {MOP_INTENSITY_LABELS[opt.id] || opt.title}
                                                </PillBtn>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {mopModeOptions.filter(o => o.id !== 'custom').length > 0 && (
                                    <div>
                                        {sectionLabel('Moppemodus')}
                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                            {mopModeOptions.filter(o => o.id !== 'custom').map(opt => (
                                                <PillBtn key={opt.id} active={mopMode === opt.id}
                                                    onClick={setOpt('mop_mode', opt.id, setMopMode)}>
                                                    {MOP_MODE_LABELS[opt.id] || opt.title}
                                                </PillBtn>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Siste rens */}
                        {showLastClean && (lastCleanStart || lastCleanEnd) && (
                            <div>
                                {sectionLabel('Siste rens')}
                                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                    {fmtTime(lastCleanStart) && <StatCell label="Startet" value={fmtTime(lastCleanStart)} />}
                                    {lastDuration !== null && <StatCell label="Varighet" value={`${lastDuration} min`} />}
                                    {totalCleans !== undefined && <StatCell label="Totalt" value={`${totalCleans} runder`} />}
                                </div>
                            </div>
                        )}

                        {/* Vedlikehold */}
                        {showMaintenance && (brushMain !== undefined || brushSide !== undefined || filterLife !== undefined || sensorLife !== undefined) && (
                            <div>
                                {sectionLabel('Levetid igjen')}
                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                    <LifeBar label="Hovedbørste" hours={brushMain} />
                                    <LifeBar label="Sidebørste" hours={brushSide} />
                                    <LifeBar label="Filter" hours={filterLife} />
                                    <LifeBar label="Sensorer" hours={sensorLife} warnBelow={20} dangerBelow={5} />
                                </div>
                            </div>
                        )}

                        {/* Volum + Ikke forstyrr */}
                        {showVolumeDnd && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {vacuumVolume !== undefined && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                        <Volume2 size={13} color="var(--color-text-secondary)" />
                                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Volum</span>
                                        <div style={{ display: 'flex', gap: '3px' }}>
                                            {[0, 33, 66, 100].map(v => (
                                                <PillBtn key={v} active={Math.abs(vacuumVolume - v) < 20}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setIsInteracting(true);
                                                        api.setCapability(devId, 'vacuum_volume', v);
                                                    }}>
                                                    {v === 0 ? 'Av' : `${v}%`}
                                                </PillBtn>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {dnd !== undefined && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <BellOff size={13} color={dnd ? 'var(--color-info)' : 'var(--color-text-secondary)'} />
                                        <PillBtn active={dnd} onClick={(e) => {
                                            e.stopPropagation();
                                            setDnd(!dnd);
                                            setIsInteracting(true);
                                            api.setCapability(devId, 'vacuum_dnd', !dnd);
                                        }}>
                                            {dnd ? 'Ikke forstyrr på' : 'Ikke forstyrr av'}
                                        </PillBtn>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Høyre: kun kart */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}>

                        {/* Kartvalg + kartbilde */}
                        {showMapSelect && mapOptions.length > 0 && (
                            <div>
                                {sectionLabel('Kart / etasje')}
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: currentMapImageUrl ? '8px' : 0 }}>
                                    {mapOptions.map(opt => (
                                        <PillBtn key={opt.id} active={selectedMap === opt.id}
                                            disabled={isCleaning || isReturning}
                                            onClick={setOpt('selected_map', opt.id, setSelectedMap)}>
                                            {opt.title}
                                        </PillBtn>
                                    ))}
                                    {(isCleaning || isReturning) && mapOptions.length > 1 && (
                                        <span style={{ fontSize: '0.65rem', color: 'var(--color-text-secondary)', alignSelf: 'center', marginLeft: '4px' }}>
                                            (kan ikke byttes under rengjøring)
                                        </span>
                                    )}
                                </div>
                                {currentMapImageUrl && (
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
                                            maxHeight: '260px',
                                        }}>
                                        <img
                                            src={currentMapImageUrl}
                                            alt={selectedMap}
                                            style={{ width: '100%', maxHeight: '260px', objectFit: 'contain', display: 'block' }}
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
                                )}

                                {/* Fullscreen map overlay */}
                                {mapFullscreen && currentMapImageUrl && createPortal(
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
                                            src={currentMapImageUrl}
                                            alt={selectedMap}
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
                                {!currentMapImageUrl && mapOptions.length > 0 && (
                                    <div style={{
                                        display: 'flex', alignItems: 'center', gap: '4px',
                                        fontSize: '0.7rem', color: 'var(--color-text-secondary)',
                                        padding: '6px 0',
                                    }}>
                                        <Map size={11} />
                                        {selectedMap || 'Ingen kart valgt'}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

const controlBtn = () => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
    padding: '6px 12px', borderRadius: '8px', border: 'none', cursor: 'pointer',
    fontSize: '0.75rem', fontWeight: 500,
    background: 'var(--color-surface-raised)',
    color: 'var(--color-text-primary)',
    transition: 'opacity 0.15s',
});

const badge = (type) => ({
    fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px',
    background: type === 'info' ? 'rgba(59,130,246,0.15)' : type === 'danger' ? 'rgba(239,68,68,0.15)' : 'var(--color-surface-raised)',
    color: type === 'info' ? 'var(--color-info)' : type === 'danger' ? 'var(--color-danger)' : 'var(--color-text-secondary)',
});

const StatCell = ({ label, value }) => (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontSize: '0.6rem', color: 'var(--color-text-secondary)' }}>{label}</span>
        <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>{value}</span>
    </div>
);

export default VacuumTile;
