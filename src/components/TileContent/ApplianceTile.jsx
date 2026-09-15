import React, { useEffect, useMemo, useState } from 'react';
import { useHomey } from '../../context/HomeyContext';
import { Utensils, Shirt, Check, Power, Activity, Clock, DoorOpen, AlertTriangle, Sparkles, Droplets, Wind, CircleDashed, Pause, Timer } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, YAxis, XAxis, Tooltip } from 'recharts';
import { useFinishedPrompt } from '../FinishedPromptOverlay';
import { useApplianceState, findCycleDevice, nativeStateOf } from '../../hooks/useApplianceState';
import { getMachinePopupCfg } from '../../services/popup-settings';
import { hassAPI } from '../../services/hass-api';
import useIsMobile from '../../hooks/useIsMobile';

/**
 * Apparat på smartplugg (oppvaskmaskin, tørketrommel, ...).
 *
 * HA ser bare en stikkontakt med effektmåling — kjøretilstanden (Av/Standby/
 * Kjører/Ferdig) utledes fra effektkurven i useApplianceState.
 *
 * Ferdig-popupen («Er den tømt?») rendres IKKE her, men globalt av
 * FinishedPromptManager i App.jsx — slik at den vises uansett hvilken side
 * som er aktiv. Flisen bruker kun `acked`/`acknowledge` fra hooken for å
 * synke «Ferdig»-visningen med kvitteringen.
 */

const formatClock = (tMs) => new Date(tMs).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });

const formatDuration = (ms) => {
    const min = Math.floor(ms / 60000);
    const h = Math.floor(min / 60);
    const m = min % 60;
    return h > 0 ? `${h}t ${m}m` : `${m}m`;
};

// Tidspunkt med dagsprefiks når det ikke er i dag («i går 18:12», «12.9. 18:12»)
const formatWhen = (tMs) => {
    const d = new Date(tMs);
    const now = new Date();
    const clock = formatClock(tMs);
    if (d.toDateString() === now.toDateString()) return clock;
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return `i går ${clock}`;
    return `${d.getDate()}.${d.getMonth() + 1}. ${clock}`;
};

const formatMinutes = (min) => {
    const m = Math.round(min);
    const h = Math.floor(m / 60);
    return h > 0 ? `${h} t ${m % 60} min` : `${m} min`;
};

// Native maskintilstand (washdata_state, normalisert i hub-mapper) → norsk
// visningstekst. Stater som ikke står her (off/idle/endofcycle/...) faller
// tilbake til den effektbaserte statusen — «Ferdig» med kvittering styres
// fortsatt av tilstandsmaskinen i useApplianceState.
const WASH_STATE_LABELS = {
    running: 'Kjører',
    paused: 'Pause',
    delay_wait: 'Utsatt start',
};
const WASH_PAUSED_STATES = new Set(['paused', 'delay_wait']);

const WASH_PHASE_LABELS = {
    pre_wash: 'Forvask', prewash: 'Forvask', main_wash: 'Hovedvask', mainwash: 'Hovedvask', wash: 'Vask',
    rinse: 'Skylling', final_rinse: 'Siste skylling', dry: 'Tørking', drying: 'Tørking',
    heating: 'Oppvarming', drain: 'Tømming',
};
const prettyPhase = (p) => {
    if (!p) return null;
    const key = String(p).toLowerCase();
    if (['off', 'idle', 'none', 'unknown', 'unavailable', 'unspecified'].includes(key)) return null;
    return WASH_PHASE_LABELS[key] || (key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '));
};

const GraphTooltip = ({ active, payload, label }) => {
    if (!(active && payload && payload.length)) return null;
    return (
        <div style={{
            background: 'var(--color-bg-primary)',
            border: '1px solid rgba(255,255,255,0.1)',
            padding: '4px 8px',
            borderRadius: '8px',
            color: '#fff',
            fontSize: '0.8rem',
        }}>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem' }}>{formatClock(label)}</div>
            <div style={{ fontWeight: 'bold', color: payload[0].color }}>{Math.round(payload[0].value)} W</div>
        </div>
    );
};

const ApplianceTile = ({ tile, device, expanded = false }) => {
    const { api, devices, settings: globalSettings } = useHomey();
    const isMobile = useIsMobile();
    const settings = tile.settings || {};

    const kind = settings.applianceKind || device?.settings?.applianceKind || 'dishwasher';
    // Terskler for tilstandsmaskinen kommer fra de globale popup-innstillingene
    // (Innstillinger → Popups) — samme kilde som FinishedPromptManager bruker.
    const cfg = getMachinePopupCfg(globalSettings, kind, settings);
    const applianceLabel = tile.name || device?.name || (kind === 'dishwasher' ? 'Oppvaskmaskin' : 'Tørketrommel');
    const KindIcon = kind === 'dryer' ? Shirt : Utensils;

    const getCap = (id) => device?.capabilitiesObj?.[id];
    const power = parseFloat(getCap('measure_power')?.value) || 0;
    const isOn = getCap('onoff')?.value !== false; // mangler switch → anta på

    // ── Syklusdata (egen HA-enhet: maskinens egen integrasjon, f.eks. Electrolux) ──
    // Flisen peker typisk på smartplugg-compositen; syklusenheten er en egen
    // appliance-composite med washdata_*-capabilities. Auto-kobles på
    // applianceKind, kan overstyres/skrus av i innstillingene.
    const washDevice = useMemo(
        () => findCycleDevice(devices, device, settings),
        [devices, device, settings.washDataDeviceId, kind]
    );

    // ── Tilstandsmaskin (delt med FinishedPromptManager) ───────────────
    // Native maskintilstand (enheter med appliance_native) lar tilstandsmaskinen
    // gå til Ferdig umiddelbart ved «End Of Cycle» og undertrykker falsk Ferdig
    // i laveffekt-faser midt i programmet.
    const { machineState, history, finishedExpired } = useApplianceState(device, cfg, nativeStateOf(washDevice));

    // Kvitteringsstatus — selve popupen rendres globalt av FinishedPromptManager
    const { acked, acknowledge } = useFinishedPrompt({
        deviceId: device?.id || tile.id,
        finishedAt: (machineState.phase === 'finished' && !finishedExpired) ? machineState.finishedAt : null,
        ackKind: kind,
    });

    const isFinished = machineState.phase === 'finished' && !finishedExpired && !acked;
    const isRunning = machineState.phase === 'running';

    const washCapNum = (id) => {
        const v = parseFloat(washDevice?.capabilitiesObj?.[id]?.value);
        return isNaN(v) ? null : v;
    };
    const washState = String(washDevice?.capabilitiesObj?.washdata_state?.value || '').toLowerCase();
    // Gates på selve Ferdig-tilstanden, IKKE på isFinished (som inkluderer
    // !acked): skyen sender en falsk «Running» rett etter endt program, og en
    // klient som sov gjennom sluttsekvensen (Fully Kiosk-skjermsparer fryser
    // JS/WS) kan stå med frossen washdata_state='running' helt til neste
    // kjøring — maskinen er da frakoblet og sender ingen korrigerende
    // hendelse. Med !isFinished ble den frosne «Running» sluppet gjennom som
    // «Kjører» i det brukeren kvitterte popupen (sett 2/8-2026). Effekt-
    // tilstandsmaskinen er alltid fersk (pluggen rapporterer uansett) og
    // vinner derfor over native i visningen når den sier Ferdig.
    const cycleDone = machineState.phase === 'finished' && !finishedExpired;
    const washActive = !!WASH_STATE_LABELS[washState] && !cycleDone;
    const washRemaining = washActive ? washCapNum('washdata_time_remaining') : null;
    const washPhase = washActive ? prettyPhase(washDevice?.capabilitiesObj?.washdata_phase?.value) : null;
    const washProgram = washActive ? (washDevice?.capabilitiesObj?.appliance_program?.value || null) : null;

    // Native ekstra-info fra maskinens egen integrasjon (Electrolux)
    const doorOpen = washDevice?.capabilitiesObj?.appliance_door?.value === true;
    const alertSalt = washDevice?.capabilitiesObj?.alarm_salt?.value === true;
    const alertRinseAid = washDevice?.capabilitiesObj?.alarm_rinse_aid?.value === true;

    // Tabletteller — counter-helper i HA (counter.oppvasktabletter), trekkes
    // ned av automasjon ved hver ny syklus. Auto-detekteres på entity-id.
    const tabletDevice = useMemo(() => {
        if (kind !== 'dishwasher') return null;
        return devices.find(d => typeof d.id === 'string' &&
            d.id.startsWith('counter.') && d.id.includes('tablett')) || null;
    }, [devices, kind]);
    const tabletCount = tabletDevice ? parseInt(tabletDevice.state, 10) : NaN;
    const tabletsLow = !isNaN(tabletCount) && tabletCount <= 3;

    const adjustTablets = async (e, delta) => {
        e.stopPropagation();
        if (!tabletDevice) return;
        await hassAPI.callService('counter', delta > 0 ? 'increment' : 'decrement', tabletDevice.id);
    };

    // Påfyll: legg til en hel pakke i én operasjon (set_value = nåverdi + antall)
    const [refillOpen, setRefillOpen] = useState(false);
    const [refillAmount, setRefillAmount] = useState('');
    const submitRefill = async (e) => {
        e.stopPropagation();
        const n = parseInt(refillAmount, 10);
        if (!tabletDevice || isNaN(n) || n <= 0) return;
        await hassAPI.callService('counter', 'set_value', tabletDevice.id, { value: tabletCount + n });
        setRefillOpen(false);
        setRefillAmount('');
    };

    const isActive = isRunning || washActive;

    // ── Innholdsstatus: hva står det i maskinen? ───────────────────────
    // Native maskintilstand vinner når den melder aktiv syklus; ellers effektbasert.
    //   off     → stikkontakten er av
    //   running → program pågår
    //   paused  → pause / utsatt start (native)
    //   clean   → ferdig og ikke tømt (rent innhold, venter på tømming)
    //   empty   → tømt (kvittert) eller ingen kjent kjøring — klar til lasting
    let content;
    if (!isOn) content = 'off';
    else if (washActive) content = WASH_PAUSED_STATES.has(washState) ? 'paused' : 'running';
    else if (isRunning) content = 'running';
    else if (isFinished) content = 'clean';
    else content = 'empty';

    const isDishwasher = kind === 'dishwasher';
    const CONTENT_INFO = {
        off:     { title: 'Av',                                    pill: 'Stikkontakt av',   color: 'var(--color-text-tertiary)',    Icon: Power },
        running: { title: 'Kjører',                                pill: null,               color: 'var(--color-success)',          Icon: isDishwasher ? Droplets : Wind },
        paused:  { title: WASH_STATE_LABELS[washState] || 'Pause', pill: null,               color: 'var(--color-warning, #f59e0b)', Icon: washState === 'delay_wait' ? Timer : Pause },
        clean:   { title: isDishwasher ? 'Rent' : 'Tørt',          pill: 'Venter på tømming', color: '#38bdf8',                       Icon: Sparkles },
        empty:   { title: 'Tom',                                   pill: 'Klar til lasting', color: 'var(--color-text-secondary)',   Icon: CircleDashed },
    };
    const info = CONTENT_INFO[content];
    const statusColor = info.color;
    // Kort statustekst til utvidet visning (tidspunkt legges på egen linje der)
    const statusText = info.title;

    // Aktiv kjøring: pillen viser tid igjen (maskinens egen nedtelling), ellers effekt
    const showRemaining = settings.showTimeRemaining !== false && washRemaining != null;
    const activePill = showRemaining ? `≈ ${formatMinutes(washRemaining)} igjen` : `${Math.round(power)} W`;

    // Fremdrift kan bare anslås når både start og tid igjen er kjent
    let progress = null;
    if (isActive && showRemaining && machineState.runStartedAt) {
        const elapsed = Date.now() - machineState.runStartedAt;
        progress = Math.max(0.03, Math.min(0.97, elapsed / (elapsed + washRemaining * 60000)));
    }

    // Sist ferdig — beholdes i tilstandsmaskinen også etter kvittering
    const lastFinishedAt = machineState.finishedAt || null;

    // ── Statistikk-rader (utvidet) ─────────────────────────────────────
    const statRows = [];
    const addStat = (show, capId, label) => {
        const cap = getCap(capId);
        if (!show || cap?.value === undefined || cap?.value === null) return;
        const val = parseFloat(cap.value);
        if (isNaN(val)) return;
        statRows.push({ label, text: `${val.toLocaleString('nb-NO', { maximumFractionDigits: 1 })} ${cap.units || ''}`.trim() });
    };
    addStat(settings.showEnergyMonthly !== false, 'energy_monthly', 'Energi denne måneden');
    addStat(settings.showCostMonthly !== false, 'cost_monthly', 'Kostnad denne måneden');
    addStat(settings.showPrevMonth === true, 'energy_prev_month', 'Energi forrige måned');
    addStat(settings.showPrevMonth === true, 'cost_prev_month', 'Kostnad forrige måned');
    addStat(settings.showYtd === true, 'energy_ytd', 'Energi hittil i år');
    addStat(settings.showYtd === true, 'cost_ytd', 'Kostnad hittil i år');

    const washCycles = washCapNum('washdata_cycle_count');
    if (settings.showCycleCount !== false && washCycles != null) {
        statRows.push({ label: 'Antall sykluser', text: `${Math.round(washCycles)}` });
    }

    // ── Av/på med to-trinns bekreftelse (kun utvidet visning) ──────────
    const [confirmToggle, setConfirmToggle] = useState(false);
    useEffect(() => {
        if (!confirmToggle) return;
        const t = setTimeout(() => setConfirmToggle(false), 4000);
        return () => clearTimeout(t);
    }, [confirmToggle]);

    const handleToggle = async (e) => {
        e.stopPropagation();
        if (!confirmToggle) {
            setConfirmToggle(true);
            return;
        }
        setConfirmToggle(false);
        await api.setCapability(device.id, 'onoff', !isOn);
    };

    const graphData = useMemo(() => {
        const windowMs = 6 * 60 * 60 * 1000;
        const cutoff = Date.now() - windowMs;
        return history.filter(p => p.time >= cutoff);
    }, [history]);

    // ── Kompakt visning ────────────────────────────────────────────────
    // Statusmerke + innholdsstatus (Rent / Tom / Kjører). Tidspunktet for
    // «ferdig» hører hjemme i utvidet visning, ikke her.
    if (!expanded) {
        const hasAlert = alertSalt || alertRinseAid || tabletsLow;
        const StateIcon = info.Icon;
        return (
            <div className={`tile-content appliance-compact is-${content}`}>
                {hasAlert && (
                    <div className="appliance-alert">
                        <AlertTriangle size={14} strokeWidth={2.2} />
                    </div>
                )}
                <div
                    className={`appliance-badge${progress != null ? ' has-ring' : ''}`}
                    style={progress != null ? { '--appl-progress': Math.round(progress * 100) } : undefined}
                >
                    {progress != null && <div className="appliance-ring" />}
                    <StateIcon size={26} strokeWidth={1.8} />
                </div>
                {/* Under kjøring erstatter fasen «Kjører» — programnavnet vises i utvidet visning */}
                <div className="appliance-title">{content === 'running' && washPhase ? washPhase : info.title}</div>
                <div className="appliance-pill">
                    {content === 'clean' && <Check size={13} strokeWidth={3} />}
                    {isActive ? activePill : info.pill}
                </div>
            </div>
        );
    }

    // ── Utvidet visning ────────────────────────────────────────────────
    return (
        <div className="tile-content" style={{ display: 'flex', flexDirection: 'column', gap: '16px', minWidth: isMobile ? undefined : '420px' }}>
            {/* Status-topp */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{
                    width: '64px', height: '64px', borderRadius: '18px',
                    background: 'rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: statusColor, flexShrink: 0,
                }}>
                    <KindIcon size={34} strokeWidth={1.6} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '1.05rem', color: 'var(--color-text-secondary)' }}>{applianceLabel}</span>
                    <span style={{ fontSize: '1.5rem', fontWeight: 700, color: statusColor, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {isFinished && <Check size={22} strokeWidth={3} />}
                        {statusText}
                    </span>
                    {content === 'clean' && (
                        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <Clock size={13} /> Ferdig {formatWhen(machineState.finishedAt)} · venter på tømming
                        </span>
                    )}
                    {content === 'empty' && (
                        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            {lastFinishedAt
                                ? <><Clock size={13} /> Klar til lasting · sist ferdig {formatWhen(lastFinishedAt)}</>
                                : 'Klar til lasting'}
                        </span>
                    )}
                    {isActive && (washProgram || washPhase || machineState.runStartedAt) && (
                        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                            <Clock size={13} />
                            {[
                                washProgram,
                                washPhase,
                                machineState.runStartedAt
                                    ? `Startet ${formatClock(machineState.runStartedAt)} · kjørt i ${formatDuration(Date.now() - machineState.runStartedAt)}`
                                    : null,
                            ].filter(Boolean).join(' · ')}
                        </span>
                    )}
                </div>
            </div>

            {/* Info-chips fra maskinens egen integrasjon: dør + salt/glansemiddel + tabletter */}
            {(doorOpen || alertSalt || alertRinseAid || tabletsLow) && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {doorOpen && (
                        <span style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            background: 'rgba(255,255,255,0.06)', borderRadius: '10px',
                            padding: '6px 12px', fontSize: '0.85rem', color: 'var(--color-text-secondary)',
                        }}>
                            <DoorOpen size={15} /> Dør åpen
                        </span>
                    )}
                    {alertSalt && (
                        <span style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            background: 'rgba(245,158,11,0.12)', borderRadius: '10px',
                            padding: '6px 12px', fontSize: '0.85rem', color: 'var(--color-warning, #f59e0b)',
                        }}>
                            <AlertTriangle size={15} /> Mangler salt
                        </span>
                    )}
                    {alertRinseAid && (
                        <span style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            background: 'rgba(245,158,11,0.12)', borderRadius: '10px',
                            padding: '6px 12px', fontSize: '0.85rem', color: 'var(--color-warning, #f59e0b)',
                        }}>
                            <AlertTriangle size={15} /> Lite glansemiddel
                        </span>
                    )}
                    {tabletsLow && (
                        <span style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            background: 'rgba(245,158,11,0.12)', borderRadius: '10px',
                            padding: '6px 12px', fontSize: '0.85rem', color: 'var(--color-warning, #f59e0b)',
                        }}>
                            <AlertTriangle size={15} /> {tabletCount === 0 ? 'Tomt for oppvasktabletter' : `Få oppvasktabletter igjen (${tabletCount})`}
                        </span>
                    )}
                </div>
            )}

            {/* Tid igjen (fra maskinens egen nedtelling) */}
            {isActive && washRemaining != null && (
                <div style={{
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: '14px',
                    padding: '12px 16px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Tid igjen</span>
                    <span style={{ fontSize: '1.2rem', fontWeight: 700 }}>≈ {formatMinutes(washRemaining)}</span>
                </div>
            )}

            {/* Effekt nå + graf */}
            <div style={{
                background: 'rgba(255,255,255,0.05)',
                borderRadius: '14px',
                padding: '12px 16px',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Activity size={14} /> Effekt siste 6 timer
                    </span>
                    <span style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-accent)' }}>
                        {Math.round(power)} W
                    </span>
                </div>
                <div style={{ width: '100%', height: '90px' }}>
                    {graphData.length > 1 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={graphData}>
                                <Tooltip content={<GraphTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.15)', strokeWidth: 1 }} />
                                <XAxis dataKey="time" hide />
                                <YAxis hide domain={[0, dataMax => Math.max(dataMax, 50)]} />
                                <Line type="monotone" dataKey="value" stroke="var(--color-accent, #f59e0b)"
                                    strokeWidth={2} dot={false} isAnimationActive={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)', fontSize: '0.8rem' }}>
                            Ingen historikk tilgjengelig
                        </div>
                    )}
                </div>
            </div>

            {/* Statistikk */}
            {statRows.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {statRows.map(row => (
                        <div key={row.label} style={{
                            display: 'flex', justifyContent: 'space-between',
                            background: 'rgba(255,255,255,0.04)',
                            borderRadius: '10px', padding: '9px 14px',
                        }}>
                            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>{row.label}</span>
                            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{row.text}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Tabletteller med justeringsknapper og pakke-påfyll */}
            {!isNaN(tabletCount) && (
                <div style={{
                    display: 'flex', flexDirection: 'column', gap: '8px',
                    background: 'rgba(255,255,255,0.04)',
                    borderRadius: '10px', padding: '6px 8px 6px 14px',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Oppvasktabletter igjen</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <button
                                onClick={(e) => adjustTablets(e, -1)}
                                style={{
                                    width: '34px', height: '34px', borderRadius: '9px',
                                    border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)',
                                    color: 'var(--color-text-primary)', fontSize: '1.1rem', cursor: 'pointer',
                                }}
                            >−</button>
                            <span style={{
                                fontSize: '0.95rem', fontWeight: 600, minWidth: '34px', textAlign: 'center',
                                color: tabletsLow ? 'var(--color-warning, #f59e0b)' : undefined,
                            }}>{tabletCount}</span>
                            <button
                                onClick={(e) => adjustTablets(e, 1)}
                                style={{
                                    width: '34px', height: '34px', borderRadius: '9px',
                                    border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)',
                                    color: 'var(--color-text-primary)', fontSize: '1.1rem', cursor: 'pointer',
                                }}
                            >+</button>
                            <button
                                onClick={(e) => { e.stopPropagation(); setRefillOpen(o => !o); setRefillAmount(''); }}
                                style={{
                                    height: '34px', padding: '0 12px', borderRadius: '9px', marginLeft: '4px',
                                    border: refillOpen ? '1px solid var(--color-accent, #f59e0b)' : '1px solid rgba(255,255,255,0.15)',
                                    background: refillOpen ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.06)',
                                    color: refillOpen ? 'var(--color-accent, #f59e0b)' : 'var(--color-text-primary)',
                                    fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                                }}
                            >Fyll på</button>
                        </div>
                    </div>
                    {refillOpen && (
                        <div
                            onClick={(e) => e.stopPropagation()}
                            style={{ display: 'flex', alignItems: 'center', gap: '8px', paddingBottom: '4px' }}
                        >
                            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Antall i pakken:</span>
                            <input
                                type="number" inputMode="numeric" min="1" max="500"
                                value={refillAmount}
                                onChange={(e) => setRefillAmount(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') submitRefill(e); }}
                                autoFocus
                                style={{
                                    width: '72px', height: '34px', borderRadius: '9px',
                                    border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)',
                                    color: 'var(--color-text-primary)', fontSize: '0.95rem', textAlign: 'center',
                                }}
                            />
                            <button
                                onClick={submitRefill}
                                disabled={!(parseInt(refillAmount, 10) > 0)}
                                style={{
                                    height: '34px', padding: '0 14px', borderRadius: '9px', border: 'none',
                                    background: 'var(--color-success)', color: '#0b1220',
                                    fontSize: '0.85rem', fontWeight: 700,
                                    cursor: parseInt(refillAmount, 10) > 0 ? 'pointer' : 'default',
                                    opacity: parseInt(refillAmount, 10) > 0 ? 1 : 0.4,
                                }}
                            >Legg til{parseInt(refillAmount, 10) > 0 ? ` (→ ${tabletCount + parseInt(refillAmount, 10)})` : ''}</button>
                        </div>
                    )}
                </div>
            )}

            {/* Handlinger */}
            <div style={{ display: 'flex', gap: '10px' }}>
                {isFinished && (
                    <button
                        onClick={(e) => { e.stopPropagation(); acknowledge(); }}
                        style={{
                            flex: 1, minHeight: '48px', border: 'none', borderRadius: '12px',
                            background: 'var(--color-success)', color: '#0b1220',
                            fontSize: '1rem', fontWeight: 700, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        }}
                    >
                        <Check size={20} strokeWidth={3} /> Marker som tømt
                    </button>
                )}
                {getCap('onoff') && (
                    <button
                        onClick={handleToggle}
                        style={{
                            flex: 1, minHeight: '48px', borderRadius: '12px',
                            border: confirmToggle ? '1px solid var(--color-danger, #ef4444)' : '1px solid rgba(255,255,255,0.15)',
                            background: confirmToggle ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.06)',
                            color: confirmToggle ? 'var(--color-danger, #ef4444)' : 'var(--color-text-primary)',
                            fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        }}
                    >
                        <Power size={18} />
                        {confirmToggle
                            ? (isOn ? 'Sikker? Trykk igjen for å slå av' : 'Sikker? Trykk igjen for å slå på')
                            : (isOn ? 'Slå av stikkontakt' : 'Slå på stikkontakt')}
                    </button>
                )}
            </div>
        </div>
    );
};

export default ApplianceTile;
