import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, DoorOpen, Clock, Layers, Gauge, Maximize2, Video, VideoOff, Lightbulb, Thermometer, Fan, Droplets, Camera } from 'lucide-react';
import { useHomey } from '../../context/HomeyContext';
import { hassAPI } from '../../services/hass-api';
import useIsMobile from '../../hooks/useIsMobile';
import { proxiedServiceUrl } from '../../services/utils';

// 3D-printer-flis (Bambu Lab via bambu_lab-integrasjonen).
// Kompakt: status + fremdrift + ferdig-tid. Utvidet: jobb, temperaturer, filament (AMS),
// vifter, detaljer og kamera. Kameraet er «nær live» som klipperkartet: stillbildet fra
// HA sin camera_proxy (1080p, ~1 s å hente) lastes på nytt hvert 2. sekund mens utvidet
// visning er åpen, og byttes først når det nye bildet er ferdig lastet (ingen blinking).
// HA sin egen strømmotor (HLS/MJPEG-proxy) klarer ikke printerens RTSPS-kilde — verifisert
// okt 2026 (stream worker: «Error opening stream»; MJPEG-proxyen gir integrasjonens røde
// «!»-plassholder på 320×240). Ekte video krever en go2rtc-kilde; URL-en settes i
// flisinnstillingene (`liveStreamUrl`) og brukes da i stedet for stillbildene.

const SNAPSHOT_COMPACT_MS = 30000;   // stillbilde i kompakt (valgfritt)
const SNAPSHOT_LIVE_MS = 2000;       // «nær live» i utvidet/fullskjerm
const TICK_MS = 30000;               // nedtelling
const OPTIMISTIC_EXPIRE_MS = 15000;

const STATUS_LABEL = {
    running: 'Printer',
    pause: 'Pauset',
    finish: 'Ferdig',
    idle: 'Klar',
    failed: 'Mislyktes',
    prepare: 'Forbereder',
    slicing: 'Slicer',
    init: 'Starter',
    offline: 'Frakoblet',
    unknown: 'Ukjent',
};

// Nåværende steg (sensor.*_current_stage) – de vanlige får norsk navn, resten vises rått
const STAGE_LABEL = {
    printing: 'Printer',
    idle: 'Klar',
    auto_bed_leveling: 'Nivellerer plata',
    bed_level_phase_1: 'Nivellerer plata',
    bed_level_phase_2: 'Nivellerer plata',
    bed_level_high_temperature: 'Nivellerer plata',
    heatbed_preheating: 'Varmer plata',
    waiting_for_heatbed_temperature: 'Varmer plata',
    heating_hotend: 'Varmer dysa',
    preparing_hotend: 'Varmer dysa',
    checking_extruder_temperature: 'Sjekker dysetemperatur',
    heating_chamber: 'Varmer kammeret',
    waiting_chamber_temperature_equalize: 'Varmer kammeret',
    homing_toolhead: 'Kjører hjem',
    cleaning_nozzle_tip: 'Renser dysa',
    inspecting_first_layer: 'Sjekker første lag',
    print_calibration_lines: 'Kalibreringslinjer',
    pre_extrusion_before_printing: 'Forbereder ekstrudering',
    changing_filament: 'Bytter filament',
    filament_loading: 'Laster filament',
    filament_unloading: 'Trekker ut filament',
    cooling_chamber: 'Kjøler kammeret',
    cooling_nozzle: 'Kjøler dysa',
    heated_bedcooling: 'Kjøler plata',
    purifying_chamber_air: 'Renser lufta',
    scanning_bed_surface: 'Skanner plata',
    measuring_surface: 'Skanner plata',
    identifying_build_plate_type: 'Sjekker platetype',
    build_plate_alignment_detection: 'Sjekker plata',
    heatbed_surface_foreign_object_detection: 'Sjekker plata',
    check_material: 'Sjekker filament',
    check_material_position: 'Sjekker filament',
    preparing_ams: 'Forbereder AMS',
    m400_pause: 'Pauset (G-kode)',
    paused_user: 'Pauset av bruker',
    paused_user_gcode: 'Pauset (G-kode)',
    paused_filament_runout: 'Tomt for filament',
    paused_nozzle_clog: 'Dysa er tett',
    paused_first_layer_error: 'Feil på første lag',
    paused_front_cover_falling: 'Dekselet løsnet',
    paused_ams_lost: 'Mistet kontakt med AMS',
    paused_skipped_step: 'Motor hoppet over steg',
    paused_low_fan_speed_heat_break: 'Heatbreak-vifte for treg',
    paused_cutter_error: 'Kutterfeil',
    paused_nozzle_temperature_malfunction: 'Dysetemperatur-feil',
    paused_heat_bed_temperature_malfunction: 'Platetemperatur-feil',
    paused_chamber_temperature_control_error: 'Kammertemperatur-feil',
    paused_nozzle_filament_covered_detected: 'Filament på dysa',
    offline: 'Frakoblet',
};

const SPEED_LABEL = { silent: 'Stille', standard: 'Standard', sport: 'Sport', ludicrous: 'Ludicrous' };
const NOZZLE_TYPE_LABEL = { hardened_steel: 'herdet stål', stainless_steel: 'rustfritt stål', brass: 'messing' };

const stageLabel = (stage) => {
    if (!stage) return null;
    if (STAGE_LABEL[stage]) return STAGE_LABEL[stage];
    if (stage.startsWith('calibrat')) return 'Kalibrerer';
    if (stage.startsWith('paused_')) return 'Pauset';
    return stage.replace(/_/g, ' ');
};

const formatMinutes = (min) => {
    if (min == null || isNaN(min)) return null;
    const m = Math.max(0, Math.round(min));
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `${h} t ${r} min` : `${h} t`;
};

const formatClock = (date) => date.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });

// «Ferdig 12:50» / «Ferdig i morgen 08:10»
const formatEnd = (date) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayDiff = Math.floor((date - today) / 86400000);
    const hm = formatClock(date);
    if (dayDiff === 0) return hm;
    if (dayDiff === 1) return `i morgen ${hm}`;
    return `${date.toLocaleDateString('nb-NO', { weekday: 'short' })} ${hm}`;
};

const parseDate = (val) => {
    if (!val) return null;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
};

// Jobbnavn uten filendelse («3_spiderman_ramme.stl» → «3_spiderman_ramme»)
const cleanTaskName = (name) => (name || '').replace(/\.(3mf|stl|gcode(\.3mf)?|obj|step)$/i, '');

const fmtTemp = (v) => (v == null || isNaN(v)) ? '–' : `${Math.round(v)}°`;

// Stillbilde som byttes først når neste er ferdig lastet (forhåndslasting via Image())
const PolledImage = ({ url, alt, className, imgRef }) => {
    const [shown, setShown] = useState(url);
    useEffect(() => {
        if (!url) return;
        let cancelled = false;
        const img = new Image();
        img.onload = () => { if (!cancelled) setShown(url); };
        img.onerror = () => { /* behold forrige bilde */ };
        img.src = url;
        return () => { cancelled = true; };
    }, [url]);
    if (!url) return null;
    if (!shown) return <div className="p3d-cam-loading">Henter bilde …</div>;
    return <img ref={imgRef} className={className} src={shown} alt={alt} />;
};

// Live-strøm fra go2rtc/Frigate: MJPEG-URL-er går i <img>, alt annet (stream.html, webrtc) i iframe
const LiveStream = ({ url, className }) => {
    const isMjpeg = /mjpeg|\.jpg|\.jpeg|frame\.jpeg/i.test(url);
    if (isMjpeg) return <img className={className} src={url} alt="Kamera (live)" />;
    return (
        <iframe
            className={className}
            src={url}
            title="Kamera (live)"
            allow="autoplay; fullscreen"
            style={{ border: 'none', width: '100%', height: '100%', background: '#000' }}
        />
    );
};

// Fargeprikk for en spole
const Spool = ({ color, empty, active, size = 18, title }) => (
    <span
        className={`p3d-spool${active ? ' is-active' : ''}${empty ? ' is-empty' : ''}`}
        style={{ '--spool-color': color || 'transparent', width: size, height: size }}
        title={title}
    />
);

const PrinterTile = ({ tile, device, expanded = false }) => {
    const { api, settings } = useHomey();
    const isMobile = useIsMobile();
    const ts = tile?.settings || {};
    const showCamera   = ts.showCamera !== false;
    const showTemps    = ts.showTemps !== false;
    const showFilament = ts.showFilament !== false;
    const showFans     = ts.showFans !== false;
    const showDetails  = ts.showDetails !== false;
    const showControls = ts.showControls !== false;
    const showSnapshotCompact = !!ts.showSnapshotCompact;

    const caps = device?.capabilitiesObj || {};
    const cap = (id) => caps[id]?.value;

    // ── Tilstand ───────────────────────────────────────────────────────────
    const status = cap('print_status') || 'unknown';
    const stage = cap('print_stage');
    const online = cap('online');
    const isOffline = online === false || status === 'offline';
    const alarmPrint = cap('alarm_print') === true;
    const alarmHms = cap('alarm_hms') === true;
    const hmsCount = cap('hms_error_count');
    const doorOpen = cap('door_open') === true;
    const isActive = status === 'running' && !isOffline;
    const isPaused = status === 'pause' && !isOffline;
    const isFinished = status === 'finish';
    const hasError = alarmPrint || status === 'failed';
    const progress = cap('print_progress');
    const progressPct = (progress != null && !isNaN(progress)) ? Math.max(0, Math.min(100, progress)) : null;
    const layer = cap('print_layer');
    const layers = cap('print_layers');
    const taskName = cleanTaskName(cap('print_task'));
    const remainingMin = cap('print_remaining');
    const endTime = parseDate(cap('print_end_time'));
    const startTime = parseDate(cap('print_start_time'));

    // Nedtelling: «nå» oppdateres hvert 30 s mens noe pågår
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!isActive && !isPaused) return;
        const id = setInterval(() => setNow(Date.now()), TICK_MS);
        return () => clearInterval(id);
    }, [isActive, isPaused]);

    // Tid igjen: foretrekk ferdig-tidspunktet (oppdateres av printeren), ellers HA-minuttene
    const minutesLeft = (endTime && endTime.getTime() > now)
        ? Math.round((endTime.getTime() - now) / 60000)
        : remainingMin;

    let statusText;
    let statusTone = 'idle';
    if (isOffline) {
        statusText = 'Frakoblet';
    } else if (hasError) {
        statusText = alarmPrint ? 'Utskriftsfeil' : 'Mislyktes';
        statusTone = 'error';
    } else if (isPaused) {
        statusText = (stage && stage.startsWith('paused_') && STAGE_LABEL[stage]) ? STAGE_LABEL[stage] : 'Pauset';
        statusTone = 'paused';
    } else if (isActive) {
        statusText = (stage && stage !== 'printing' && stageLabel(stage)) || 'Printer';
        statusTone = 'active';
    } else if (isFinished) {
        statusText = 'Ferdig';
        statusTone = 'done';
    } else {
        statusText = STATUS_LABEL[status] || status;
        if (status === 'prepare' || status === 'slicing' || status === 'init') statusTone = 'active';
    }

    // ── Kamera ─────────────────────────────────────────────────────────────
    const hassBaseUrl = (hassAPI.httpBase || settings?.hassUrl || '').replace(/\/$/, '');
    const abs = (path) => (path ? `${hassBaseUrl}${path}` : null);
    const snapshotPath = cap('camera_snapshot_url');
    const cameraState = cap('camera_state');
    const cameraEnabled = cap('camera_enabled');
    const hasCamera = !!snapshotPath;
    // Ekte HA-URL-er har alt '?token=…', demo-bildene har ingen spørrestreng
    const join = (path, q) => `${path}${path.includes('?') ? '&' : '?'}${q}`;
    // Frakoblet printer gir ingen bilder — vis det som tekst i stedet for svart rute
    const cameraOff = cameraEnabled === false || cameraState === 'unavailable' || isOffline;
    const cameraOffText = cameraEnabled === false ? 'Kameraet er avslått'
        : isOffline ? 'Printeren er frakoblet' : 'Kameraet er utilgjengelig';
    // go2rtc-adressen skrives over til /svc/1984/ når dashbordet går over HTTPS (mixed content)
    const liveStreamUrl = proxiedServiceUrl((ts.liveStreamUrl || '').trim());

    // Fullskjerm lever bare mens utvidet visning er åpen (avledet, ingen reset-effekt)
    const [camFullscreenState, setCamFullscreen] = useState(false);
    const camFullscreen = camFullscreenState && expanded;

    // Stillbilde-polling: «nær live» i utvidet visning (2 s), sjeldnere i kompakt (30 s).
    // Med en ekte strøm-URL hentes ikke stillbilder i utvidet visning.
    const liveOn = expanded && showCamera && hasCamera && !cameraOff;
    const wantSnapshot = (!expanded && showSnapshotCompact && isActive && hasCamera && !cameraOff)
        || (liveOn && !liveStreamUrl);
    const [snapTs, setSnapTs] = useState(() => Date.now());
    useEffect(() => {
        if (!wantSnapshot) return;
        // Første henting straks (asynkront), deretter fast intervall
        const first = setTimeout(() => setSnapTs(Date.now()), 0);
        const id = setInterval(() => setSnapTs(Date.now()), expanded ? SNAPSHOT_LIVE_MS : SNAPSHOT_COMPACT_MS);
        return () => { clearTimeout(first); clearInterval(id); };
    }, [wantSnapshot, expanded]);
    const snapshotUrl = snapshotPath ? `${hassBaseUrl}${join(snapshotPath, `_t=${snapTs}`)}` : null;

    // ── Brytere (kammerlys, kamera) med optimistisk tilstand ───────────────
    const [optimistic, setOptimistic] = useState({});
    const expireTimers = useRef({});
    useEffect(() => () => Object.values(expireTimers.current).forEach(clearTimeout), []);
    const valueOf = (id) => {
        const o = optimistic[id];
        const actual = cap(id);
        return (o !== undefined && o !== actual) ? o : actual;
    };
    const toggle = async (id) => {
        if (!device) return;
        const next = !valueOf(id);
        setOptimistic(prev => ({ ...prev, [id]: next }));
        clearTimeout(expireTimers.current[id]);
        expireTimers.current[id] = setTimeout(() => {
            setOptimistic(prev => { const n = { ...prev }; delete n[id]; return n; });
        }, OPTIMISTIC_EXPIRE_MS);
        try { await api.setCapability(device.id, id, next); }
        catch (err) { console.error('Printer toggle failed', id, err); }
    };

    // ── Filament ───────────────────────────────────────────────────────────
    const trays = [1, 2, 3, 4]
        .map(n => caps[`filament_tray_${n}`])
        .filter(Boolean)
        .map(c => ({ slot: c.slot, name: c.value, color: c.color, material: c.material, remain: c.remain, empty: c.empty, active: c.active }));
    const activeTray = caps.filament_active;
    const external = caps.filament_external;
    const externalActive = cap('external_spool_active') === true;

    const nozzleT = cap('measure_temperature.nozzle'), nozzleTarget = cap('target_temperature.nozzle');
    const bedT = cap('measure_temperature.bed'), bedTarget = cap('target_temperature.bed');
    const chamberT = cap('measure_temperature.chamber');
    const fans = [
        ['Kjøling', cap('fan_speed.cooling')],
        ['Hjelpevifte', cap('fan_speed.aux')],
        ['Kammer', cap('fan_speed.chamber')],
        ['Heatbreak', cap('fan_speed.heatbreak')],
    ].filter(([, v]) => v != null);

    const speedProfile = cap('print_speed_profile');
    const speedMod = cap('print_speed_modifier');
    const nozzleSize = cap('nozzle_size');
    const nozzleType = cap('nozzle_type');
    const amsHumidity = cap('ams_humidity');
    const amsTemp = cap('ams_temperature');
    const totalUsage = cap('print_total_usage');
    const coverUrl = abs(cap('print_cover_url'));

    const name = tile?.name || device?.name || '3D-printer';

    // Tidslinje-tekst
    const endText = (isActive || isPaused) && minutesLeft != null
        ? `${endTime ? `Ferdig ${formatEnd(endTime)}` : 'Ferdig'} · ${formatMinutes(minutesLeft)} igjen`
        : null;
    // Kompakt bunnlinje: på en 1 kolonne bred flis er det bare plass til én av delene
    const narrowTile = /^1x/.test(tile?.size || '');
    const endTextShort = (isActive || isPaused) && minutesLeft != null
        ? (endTime
            ? (narrowTile ? `Ferdig ${formatEnd(endTime)}` : `Ferdig ${formatEnd(endTime)} · ${formatMinutes(minutesLeft)} igjen`)
            : `${formatMinutes(minutesLeft)} igjen`)
        : null;

    // ── KOMPAKT ────────────────────────────────────────────────────────────
    if (!expanded) {
        const bgUrl = (showSnapshotCompact && isActive && !cameraOff) ? snapshotUrl : null;
        return (
            <div className={`tile-content p3d-compact tone-${statusTone}${bgUrl ? ' has-bg' : ''}`}>
                {bgUrl && <img className="p3d-compact-bg" src={bgUrl} alt="" />}
                <div className="p3d-compact-body">
                    <div className="p3d-compact-status">
                        {(hasError || alarmHms) && <AlertTriangle size={14} />}
                        <span>{statusText}</span>
                    </div>
                    {(isActive || isPaused) && progressPct != null ? (
                        <div className="p3d-progress-row">
                            <div className="p3d-progress"><div className="p3d-progress-fill" style={{ width: `${progressPct}%` }} /></div>
                            <span className="p3d-progress-pct">{Math.round(progressPct)} %</span>
                        </div>
                    ) : (
                        <div className="p3d-compact-sub">{taskName ? `Sist: ${taskName}` : ' '}</div>
                    )}
                    <div className="p3d-compact-foot">
                        {endTextShort ? (<><Clock size={11} /><span>{endTextShort}</span></>)
                            : (isActive || isPaused) && layer != null && layers > 0 ? (<><Layers size={11} /><span>Lag {layer} av {layers}</span></>)
                            : ' '}
                    </div>
                </div>
            </div>
        );
    }

    // ── UTVIDET ────────────────────────────────────────────────────────────
    const sectionLabel = (text) => <div className="p3d-section-label">{text}</div>;

    const cameraBox = showCamera && hasCamera && (
        <div className="p3d-cam">
            {sectionLabel('Kamera')}
            <div
                className={`p3d-cam-frame${liveOn && !camFullscreen ? ' is-live' : ''}`}
                onPointerDown={e => e.stopPropagation()}
                onClick={() => { if (!cameraOff) setCamFullscreen(true); }}
            >
                {cameraOff ? (
                    <div className="p3d-cam-off">
                        <VideoOff size={28} />
                        <span>{cameraOffText}</span>
                        {cameraEnabled === false && showControls && 'camera_enabled' in caps && (
                            <button type="button" className="p3d-btn" onClick={(e) => { e.stopPropagation(); toggle('camera_enabled'); }}>
                                <Video size={14} /> Slå på kameraet
                            </button>
                        )}
                    </div>
                ) : camFullscreen ? (
                    // Fullskjermen eier strømmen/pollingen; her står siste bilde
                    <img src={snapshotUrl} alt="Kamera" />
                ) : liveStreamUrl ? (
                    <LiveStream url={liveStreamUrl} />
                ) : (
                    <PolledImage url={snapshotUrl} alt="Kamera" />
                )}
                {!cameraOff && liveOn && !camFullscreen && (
                    <div className="p3d-cam-badge">
                        <span className="p3d-live-dot" />{liveStreamUrl ? 'LIVE' : 'NÆR LIVE'}
                    </div>
                )}
                {/* Egen knapp: en iframe (go2rtc stream.html) sluker klikk på selve ruta */}
                {!cameraOff && (
                    <button type="button" className="p3d-cam-zoom" aria-label="Fullskjerm"
                        onClick={(e) => { e.stopPropagation(); setCamFullscreen(true); }}>
                        <Maximize2 size={12} />
                    </button>
                )}
            </div>
            {camFullscreen && createPortal(
                <div
                    className="p3d-cam-fullscreen"
                    onPointerDown={e => e.stopPropagation()}
                    onClick={() => setCamFullscreen(false)}
                >
                    <div className="p3d-cam-fullscreen-media" onClick={e => e.stopPropagation()}>
                        {liveStreamUrl
                            ? <LiveStream url={liveStreamUrl} />
                            : <PolledImage url={snapshotUrl} alt="Kamera" />}
                    </div>
                    <div className="p3d-cam-fullscreen-caption">
                        <span>{name}{taskName ? ` · ${taskName}` : ''}</span>
                        {progressPct != null && (isActive || isPaused) && <span>{Math.round(progressPct)} %{minutesLeft != null ? ` · ${formatMinutes(minutesLeft)} igjen` : ''}</span>}
                    </div>
                    <button type="button" className="p3d-cam-close" onClick={() => setCamFullscreen(false)}>✕</button>
                </div>,
                document.body
            )}
        </div>
    );

    return (
        <div className={`tile-content p3d-expanded tone-${statusTone}`}>
            {/* Header: jobb + status + fremdrift */}
            <div className="p3d-head">
                {coverUrl && <img className="p3d-cover" src={coverUrl} alt="" onError={(e) => { e.target.style.display = 'none'; }} />}
                <div className="p3d-head-text">
                    <div className="p3d-head-title">
                        <span className="p3d-job">{taskName || name}</span>
                        <span className={`p3d-badge tone-${statusTone}`}>
                            {(hasError || alarmHms) && <AlertTriangle size={12} />}
                            {statusText}{progressPct != null && (isActive || isPaused) ? ` · ${Math.round(progressPct)} %` : ''}
                        </span>
                    </div>
                    <div className="p3d-head-sub">
                        {taskName && <span className="p3d-dim">{name}</span>}
                        {startTime && <span>Startet {formatClock(startTime)}</span>}
                        {endText && <span>{endText}</span>}
                        {!endText && isFinished && endTime && <span>Ferdig {formatEnd(endTime)}</span>}
                        {(isActive || isPaused) && layer != null && layers > 0 && <span>Lag {layer} av {layers}</span>}
                    </div>
                </div>
            </div>
            {(isActive || isPaused) && progressPct != null && (
                <div className="p3d-progress p3d-progress-lg"><div className="p3d-progress-fill" style={{ width: `${progressPct}%` }} /></div>
            )}

            {/* Varsler */}
            {(alarmPrint || status === 'failed') && (
                <div className="p3d-banner is-error"><AlertTriangle size={14} />{alarmPrint ? 'Printeren melder utskriftsfeil' : 'Utskriften mislyktes'}</div>
            )}
            {alarmHms && (
                <div className="p3d-banner is-error"><AlertTriangle size={14} />HMS-feil{hmsCount > 1 ? ` (${hmsCount})` : ''} — se Bambu Handy for detaljer</div>
            )}
            {doorOpen && isActive && (
                <div className="p3d-banner is-warn"><DoorOpen size={14} />Døra er åpen mens den printer</div>
            )}
            {isOffline && (
                <div className="p3d-banner is-muted"><VideoOff size={14} />Printeren er frakoblet</div>
            )}

            <div className={`p3d-main${isMobile ? ' is-stacked' : ''}`}>
                {isMobile && cameraBox}

                <div className="p3d-side">
                    {showTemps && (nozzleT != null || bedT != null || chamberT != null) && (
                        <div className="p3d-card">
                            {sectionLabel('Temperaturer')}
                            <div className="p3d-rows">
                                {nozzleT != null && (
                                    <div className="p3d-row"><span className="p3d-row-label"><Thermometer size={13} />Dyse</span><span className="p3d-row-value">{fmtTemp(nozzleT)}{nozzleTarget ? <span className="p3d-dim"> / {fmtTemp(nozzleTarget)}</span> : null}</span></div>
                                )}
                                {bedT != null && (
                                    <div className="p3d-row"><span className="p3d-row-label"><Thermometer size={13} />Plate</span><span className="p3d-row-value">{fmtTemp(bedT)}{bedTarget ? <span className="p3d-dim"> / {fmtTemp(bedTarget)}</span> : null}</span></div>
                                )}
                                {chamberT != null && (
                                    <div className="p3d-row"><span className="p3d-row-label"><Thermometer size={13} />Kammer</span><span className="p3d-row-value">{fmtTemp(chamberT)}</span></div>
                                )}
                            </div>
                        </div>
                    )}

                    {showFilament && (trays.length > 0 || activeTray) && (
                        <div className="p3d-card">
                            {sectionLabel('Filament')}
                            {trays.length > 0 && (
                                <div className="p3d-trays">
                                    {trays.map(t => (
                                        <div key={t.slot} className={`p3d-tray${t.active ? ' is-active' : ''}${t.empty ? ' is-empty' : ''}`} title={t.name || 'Tom'}>
                                            <Spool color={t.color} empty={t.empty} active={t.active} size={22} />
                                            <span className="p3d-tray-slot">{t.slot}</span>
                                            <span className="p3d-tray-material">{t.empty ? 'Tom' : (t.material || '–')}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {activeTray?.value && !activeTray.empty && (
                                <div className="p3d-active-tray">
                                    <Spool color={activeTray.color} size={14} />
                                    <span>{activeTray.value}</span>
                                    {activeTray.material && <span className="p3d-dim">· {activeTray.material}</span>}
                                    {activeTray.remain != null && <span className="p3d-dim">· {Math.round(activeTray.remain)} % igjen</span>}
                                </div>
                            )}
                            {external?.value && externalActive && (
                                <div className="p3d-active-tray">
                                    <Spool color={external.color} size={14} />
                                    <span>Ekstern spole: {external.value}</span>
                                </div>
                            )}
                            {(amsHumidity != null || amsTemp != null) && (
                                <div className="p3d-dim p3d-small">
                                    <Droplets size={11} /> AMS {amsHumidity != null ? `${Math.round(amsHumidity)} % fuktighet` : ''}{amsHumidity != null && amsTemp != null ? ' · ' : ''}{amsTemp != null ? `${Math.round(amsTemp)}°` : ''}
                                </div>
                            )}
                        </div>
                    )}

                    {showFans && fans.length > 0 && (
                        <div className="p3d-card">
                            {sectionLabel('Vifter')}
                            <div className="p3d-chips">
                                {fans.map(([label, v]) => (
                                    <span key={label} className={`p3d-chip${v > 0 ? ' is-on' : ''}`}><Fan size={11} />{label} {Math.round(v)} %</span>
                                ))}
                            </div>
                        </div>
                    )}

                    {showDetails && (
                        <div className="p3d-card">
                            {sectionLabel('Detaljer')}
                            <div className="p3d-rows">
                                {speedProfile && (
                                    <div className="p3d-row"><span className="p3d-row-label"><Gauge size={13} />Hastighet</span><span className="p3d-row-value">{SPEED_LABEL[speedProfile] || speedProfile}{speedMod != null && speedMod !== 100 ? <span className="p3d-dim"> ({Math.round(speedMod)} %)</span> : null}</span></div>
                                )}
                                {nozzleSize != null && (
                                    <div className="p3d-row"><span className="p3d-row-label">Dyse</span><span className="p3d-row-value">{String(nozzleSize).replace('.', ',')} mm{nozzleType ? <span className="p3d-dim"> · {NOZZLE_TYPE_LABEL[nozzleType] || nozzleType.replace(/_/g, ' ')}</span> : null}</span></div>
                                )}
                                {totalUsage != null && totalUsage > 0 && (
                                    <div className="p3d-row"><span className="p3d-row-label"><Clock size={13} />Total brukstid</span><span className="p3d-row-value">{formatMinutes(totalUsage * 60)}</span></div>
                                )}
                                {cap('print_file') && (
                                    <div className="p3d-row"><span className="p3d-row-label">Fil</span><span className="p3d-row-value p3d-ellipsis" title={cap('print_file')}>{String(cap('print_file')).split('/').pop()}</span></div>
                                )}
                            </div>
                        </div>
                    )}

                    {showControls && ('chamber_light' in caps || 'camera_enabled' in caps) && (
                        <div className="p3d-toggles">
                            {'chamber_light' in caps && (
                                <button type="button" className={`p3d-toggle${valueOf('chamber_light') ? ' is-on' : ''}`} onClick={(e) => { e.stopPropagation(); toggle('chamber_light'); }}>
                                    <Lightbulb size={15} /><span>Kammerlys</span><span className="p3d-toggle-state">{valueOf('chamber_light') ? 'På' : 'Av'}</span>
                                </button>
                            )}
                            {'camera_enabled' in caps && (
                                <button type="button" className={`p3d-toggle${valueOf('camera_enabled') ? ' is-on' : ''}`} onClick={(e) => { e.stopPropagation(); toggle('camera_enabled'); }}>
                                    <Camera size={15} /><span>Kamera</span><span className="p3d-toggle-state">{valueOf('camera_enabled') ? 'På' : 'Av'}</span>
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {!isMobile && cameraBox}
            </div>
        </div>
    );
};

export default PrinterTile;
