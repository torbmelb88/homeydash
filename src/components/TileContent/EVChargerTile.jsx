import React, { useState, useEffect, useRef } from 'react';
import { Zap, Plug, Lock, Unlock, BatteryCharging, Thermometer, WifiOff, Car, Minus, Plus, Moon, Clock, Gauge, Route } from 'lucide-react';
import { useHomey } from '../../context/HomeyContext';
import useIsMobile from '../../hooks/useIsMobile';
import { findChargingVehicle, vehicleSummary, allVehicles, formatClock, formatUntil, locationText } from '../../services/vehicle';
import { meterReadings } from '../../services/climate';

// Zaptec mode values → norsk statustekst + stil
const CHARGE_MODE_MAP = {
    // Zaptec HA-integrasjon
    disconnected:          { text: 'Frakoblet',   color: 'var(--color-text-secondary)', Icon: Plug,           charging: false },
    connected_requesting:  { text: 'Tilkoblet',   color: 'var(--color-info)',           Icon: Plug,           charging: false },
    connected_charging:    { text: 'Lader',        color: 'var(--color-success)',        Icon: Zap,            charging: true  },
    connected_finished:    { text: 'Ferdigladet', color: 'var(--color-success)',        Icon: BatteryCharging, charging: false },
    waiting:               { text: 'Venter',       color: 'var(--color-info)',           Icon: Plug,           charging: false },
    charging:              { text: 'Lader',        color: 'var(--color-success)',        Icon: Zap,            charging: true  },
    charge_done:           { text: 'Ferdigladet', color: 'var(--color-success)',        Icon: BatteryCharging, charging: false },
    completed:             { text: 'Ferdigladet', color: 'var(--color-success)',        Icon: BatteryCharging, charging: false },
    // Homey-native legacy
    Charging:              { text: 'Lader',        color: 'var(--color-success)',        Icon: Zap,            charging: true  },
    'Charging finished':   { text: 'Ferdigladet', color: 'var(--color-success)',        Icon: BatteryCharging, charging: false },
    charging_finished:     { text: 'Ferdigladet', color: 'var(--color-success)',        Icon: BatteryCharging, charging: false },
    finished:              { text: 'Ferdigladet', color: 'var(--color-success)',        Icon: BatteryCharging, charging: false },
    Disconnected:          { text: 'Frakoblet',   color: 'var(--color-text-secondary)', Icon: Plug,           charging: false },
    Connected:             { text: 'Tilkoblet',   color: 'var(--color-info)',           Icon: Plug,           charging: false },
};

// Hurtigvalg for ladestrøm (A)
const CURRENT_PRESETS = [0, 6, 10, 16, 25];
// Hurtigvalg for ladegrense i bilen (%)
const LIMIT_PRESETS = [50, 60, 70, 80, 90, 100];
// Ladegrense sendes samlet etter siste trykk (Tesla-API-et er tregt og rate-begrenset)
const LIMIT_SEND_DELAY_MS = 800;
const LIMIT_PENDING_TIMEOUT_MS = 20000;

const fmtKwh = (v, d = 2) => Number(v ?? 0).toFixed(d);

// Batterilinje med markør for ladegrense
const BatteryBar = ({ battery, limit, charging, large }) => (
    <div className={`evc-bar${large ? ' evc-bar-lg' : ''}${charging ? ' is-charging' : ''}`}>
        <div className="evc-bar-fill" style={{ width: `${Math.max(0, Math.min(100, battery ?? 0))}%` }} />
        {limit != null && <div className="evc-bar-mark" style={{ left: `${Math.max(0, Math.min(100, limit))}%` }} title={`Ladegrense ${limit} %`} />}
    </div>
);

const EVChargerTile = ({ tile, device, expanded }) => {
    const { api, devices } = useHomey();
    const isMobile = useIsMobile();
    const settings = tile.settings || {};
    const isHA = device?.isHA || device?.hubType === 'hass';

    // Capabilities
    const power               = device?.capabilitiesObj?.measure_power?.value ?? 0;
    const sessionEnergy       = device?.capabilitiesObj?.['meter_power.current_session']?.value ?? 0;
    const lastSession         = device?.capabilitiesObj?.['meter_power.last_session']?.value ?? 0;
    const totalEnergy         = device?.capabilitiesObj?.meter_power?.value ?? 0;
    const isOnline            = device?.capabilitiesObj?.online?.value ?? true;
    const cableLocked         = device?.capabilitiesObj?.cable_permanent_lock?.value ?? false;
    const temperature         = device?.capabilitiesObj?.measure_temperature?.value;
    const chargeMode          = device?.capabilitiesObj?.charge_mode?.value || '';
    const phase1              = device?.capabilitiesObj?.['measure_current.phase1']?.value ?? 0;
    const phase2              = device?.capabilitiesObj?.['measure_current.phase2']?.value ?? 0;
    const phase3              = device?.capabilitiesObj?.['measure_current.phase3']?.value ?? 0;
    const costCurrent         = device?.capabilitiesObj?.cost_current?.value ?? 0;
    const allocatedCurrent    = device?.capabilitiesObj?.allocated_current?.value ?? 0;
    const availableCurrentLimit = device?.capabilitiesObj?.available_current_limit?.value ?? 0;

    const chargingButton = device?.capabilitiesObj?.charging_button?.value ?? false;
    const modeCharging = CHARGE_MODE_MAP[chargeMode]?.charging ?? false;
    // Fallback: effekt > 10W er det mest pålitelige ladetegnet
    const powerCharging = power > 10;
    const isCharging = modeCharging || powerCharging || (!isHA && chargingButton);

    // Status – mode-map slår inn, ellers fallback basert på isCharging
    const modeInfo = CHARGE_MODE_MAP[chargeMode] || null;
    let statusColor, statusText, StatusIcon;
    if (modeInfo) {
        ({ color: statusColor, text: statusText, Icon: StatusIcon } = modeInfo);
    } else if (isCharging) {
        statusColor = 'var(--color-success)'; statusText = 'Lader'; StatusIcon = Zap;
    } else {
        statusColor = 'var(--color-text-secondary)'; statusText = 'Frakoblet'; StatusIcon = Plug;
    }

    // ── Bilen som lader ──────────────────────────────────────────────────────
    // (React Compiler memoiserer – ingen manuell useMemo)
    const vehicle = findChargingVehicle(devices, device, settings);
    const car = vehicleSummary(vehicle);
    const vehicles = allVehicles(devices);
    const showCarCompact = !!car && settings.showVehicleCompact !== false;
    const showCarExpanded = !!car && settings.showVehicle !== false;

    // Nedtelling («om 1 t 20 min») må tikke selv om ingen sensor endres
    const [, setTick] = useState(0);
    const timeToFullMs = car?.timeToFull?.getTime() ?? null;
    useEffect(() => {
        if (timeToFullMs == null) return;
        const t = setInterval(() => setTick(n => n + 1), 60000);
        return () => clearInterval(t);
    }, [timeToFullMs]);

    // Ladegrense: optimistisk tall, sendes samlet etter siste trykk
    const [pendingLimit, setPendingLimit] = useState(null);
    const sendTimer = useRef(null);
    const expireTimer = useRef(null);
    useEffect(() => () => { clearTimeout(sendTimer.current); clearTimeout(expireTimer.current); }, []);
    // «Venter» til HA bekrefter samme verdi (eller til utløp)
    const limitPending = pendingLimit != null && car?.limit !== pendingLimit;

    const queueLimit = (next, e) => {
        e?.stopPropagation();
        if (!vehicle || !car?.hasChargeLimit) return;
        const { min = 50, max = 100 } = car.limitOptions;
        const clamped = Math.max(min, Math.min(max, next));
        setPendingLimit(clamped);
        clearTimeout(sendTimer.current);
        sendTimer.current = setTimeout(async () => {
            try {
                await api.setCapability(vehicle.id, 'vehicle_charge_limit', clamped);
            } catch (err) {
                console.error('Failed to set charge limit', err);
            }
            clearTimeout(expireTimer.current);
            expireTimer.current = setTimeout(() => setPendingLimit(null), LIMIT_PENDING_TIMEOUT_MS);
        }, LIMIT_SEND_DELAY_MS);
    };
    const displayLimit = limitPending ? pendingLimit : (car?.limit ?? null);
    // 5 % per trykk (Tesla oppgir trinn 1, men det er upraktisk); hurtigvalgene dekker resten
    const limitStep = Math.max(5, Number(car?.limitOptions?.step) || 1);

    const toggleCarCharge = async (e) => {
        e?.stopPropagation();
        if (!vehicle || !car?.hasChargeSwitch) return;
        try { await api.setCapability(vehicle.id, 'vehicle_charge_switch', !car.chargeSwitch); }
        catch (err) { console.error('Failed to toggle vehicle charging', err); }
    };

    // Handlers
    const setCurrentLimit = async (amps, e) => {
        e?.stopPropagation();
        try {
            await api.setCapability(device.id, 'available_current_limit', amps);
        } catch (err) {
            console.error('Failed to set current limit', err);
        }
    };

    const handleStart = async (e) => {
        e?.stopPropagation();
        if (isHA) {
            await setCurrentLimit(25, e);
        } else {
            if (settings.startChargingFlowId) {
                try { await api.triggerFlow(settings.startChargingFlowId); } catch (err) { console.error(err); }
            } else {
                try { await api.setCapability(device.id, 'charging_button', true); } catch (err) { console.error(err); }
            }
        }
    };

    const handleStop = async (e) => {
        e?.stopPropagation();
        if (isHA) {
            await setCurrentLimit(0, e);
        } else {
            try { await api.setCapability(device.id, 'charging_button', false); } catch (err) { console.error(err); }
        }
    };

    const toggleLock = async (e) => {
        e?.stopPropagation();
        try { await api.setCapability(device.id, 'cable_permanent_lock', !cableLocked); } catch (err) { console.error(err); }
    };

    // Periodestatistikk: kun tall som faktisk finnes. Energikostnad-integrasjonen legger
    // måneds-/årssensorene på en EGEN sensor-only HA-enhet (aldri composite), så de slås opp
    // som frittstående enheter via prefikset til effektsensoren (samme som klimasiden).
    const readings = meterReadings(devices, device, null);
    const capNum = (id) => {
        const v = readings[id] ?? device?.capabilitiesObj?.[id]?.value;
        return v == null || v === '' ? null : Number(v);
    };
    const periodStats = [
        { key: 'energy_daily',      label: 'I dag',                   unit: 'kWh', show: settings.showEnergyDaily !== false },
        { key: 'cost_daily',        label: 'Kostnad i dag',           unit: 'kr',  show: settings.showCostDaily !== false },
        { key: 'energy_monthly',    label: 'Denne måneden',           unit: 'kWh', show: settings.showEnergyMonthly !== false },
        { key: 'cost_monthly',      label: 'Kostnad denne måneden',   unit: 'kr',  show: settings.showCostMonthly !== false },
        { key: 'energy_prev_month', label: 'Forrige måned',           unit: 'kWh', show: !!settings.showPrevMonth },
        { key: 'cost_prev_month',   label: 'Kostnad forrige måned',   unit: 'kr',  show: !!settings.showPrevMonth },
        { key: 'energy_ytd',        label: 'Hittil i år',             unit: 'kWh', show: !!settings.showYtd },
        { key: 'cost_ytd',          label: 'Kostnad hittil i år',     unit: 'kr',  show: !!settings.showYtd },
    ].filter(s => s.show && capNum(s.key) != null && !isNaN(capNum(s.key)))
     .map(s => ({ ...s, text: `${capNum(s.key).toFixed(s.unit === 'kr' ? 0 : 1)} ${s.unit}` }));

    // Bilens egen status (brukes i kortet); laderens status er hovedstatus
    const carStateText = car?.stateInfo?.text || (car?.cableConnected ? 'Tilkoblet' : '');
    const carFinishText = car?.timeToFull && car.isCharging ? formatClock(car.timeToFull) : '';
    const carUntilText = car?.timeToFull && car.isCharging ? formatUntil(car.timeToFull) : '';

    // ── EXPANDED VIEW ─────────────────────────────────────────────────────────
    if (expanded) {
        return (
            <div className="tile-content expanded-charger" style={{ padding: '0', width: '100%', display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '1.5rem', alignItems: isMobile ? 'stretch' : 'flex-start' }}>

                {/* Status + knapper */}
                <div style={{ flex: isMobile ? '0 0 auto' : '0 0 220px', width: isMobile ? '100%' : undefined, display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '0.5rem' }}>
                        <div style={{
                            width: '64px', height: '64px', borderRadius: '50%',
                            background: `color-mix(in srgb, ${statusColor} 20%, transparent)`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: statusColor
                        }}>
                            <StatusIcon size={32} />
                        </div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{Math.round(power)} W</div>
                        <div style={{ color: statusColor, fontWeight: 500 }}>{statusText}</div>
                    </div>

                    {/* Start/Stopp + Lås */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', width: '100%' }}>
                        {!isHA && (
                            <button
                                className="btn"
                                onClick={isCharging ? handleStop : handleStart}
                                style={{
                                    background: isCharging ? 'var(--color-error)' : 'var(--color-success)',
                                    color: 'white', height: '50px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                                }}
                            >
                                <Zap size={20} />
                                {isCharging ? 'Stopp' : 'Start'}
                            </button>
                        )}
                        <button
                            className="btn btn-secondary"
                            onClick={toggleLock}
                            style={{
                                height: '50px',
                                gridColumn: isHA ? 'span 2' : undefined,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                            }}
                        >
                            {cableLocked ? <Lock size={20} /> : <Unlock size={20} />}
                            {cableLocked ? 'Lås opp kabel' : 'Lås kabel'}
                        </button>
                    </div>
                </div>

                {/* Høyre: strømvelger + bil + statistikk */}
                <div style={{ flex: 1, width: isMobile ? '100%' : undefined, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Strømvelger (kun HA) */}
                    {isHA && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                                Ladestrøm — tildelt: {Number(allocatedCurrent).toFixed(0)} A
                            </span>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                {CURRENT_PRESETS.map(amps => {
                                    const displayLimitA = availableCurrentLimit > 0
                                        ? Math.round(availableCurrentLimit)
                                        : (isCharging ? Math.round(allocatedCurrent) : 0);
                                    const isActive = displayLimitA === amps;
                                    return (
                                        <button
                                            key={amps}
                                            type="button"
                                            onClick={(e) => setCurrentLimit(amps, e)}
                                            style={{
                                                flex: 1,
                                                height: '40px',
                                                borderRadius: '8px',
                                                border: isActive ? `2px solid ${amps === 0 ? 'var(--color-error)' : 'var(--color-success)'}` : '2px solid rgba(255,255,255,0.15)',
                                                background: isActive
                                                    ? `color-mix(in srgb, ${amps === 0 ? 'var(--color-error)' : 'var(--color-success)'} 20%, transparent)`
                                                    : 'rgba(255,255,255,0.05)',
                                                color: isActive
                                                    ? (amps === 0 ? 'var(--color-error)' : 'var(--color-success)')
                                                    : 'var(--color-text-secondary)',
                                                fontWeight: isActive ? 600 : 400,
                                                fontSize: '0.85rem',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            {amps === 0 ? 'Stopp' : `${amps}A`}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Bilen som lader */}
                    {showCarExpanded && (
                        <div className={`evc-car-card${car.isCharging ? ' is-charging' : ''}`} onClick={e => e.stopPropagation()}>
                            <div className="evc-car-head">
                                <div className="evc-car-icon"><Car size={22} /></div>
                                <div className="evc-car-titles">
                                    <div className="evc-car-title">{car.name}</div>
                                    <div className="evc-car-sub">
                                        {[car.make && car.model ? `${car.make} ${car.model}` : (car.model || car.make), carStateText].filter(Boolean).join(' · ')}
                                        {car.awake === false && <span className="evc-car-asleep"><Moon size={11} /> sover</span>}
                                    </div>
                                </div>
                                <div className="evc-car-batt">
                                    {car.battery != null ? `${Math.round(car.battery)} %` : '–'}
                                    {car.limit != null && <span className="evc-car-batt-limit">→ {Math.round(displayLimit)} %</span>}
                                </div>
                            </div>
                            <BatteryBar battery={car.battery} limit={displayLimit} charging={car.isCharging} large />
                            <div className="evc-car-meta">
                                {car.range != null && (
                                    <span><Route size={13} /> {Math.round(car.range)} {car.rangeUnit}</span>
                                )}
                                {carFinishText && (
                                    <span><Clock size={13} /> Ferdig {carFinishText}{carUntilText ? ` (${carUntilText})` : ''}</span>
                                )}
                                {car.isCharging && car.chargeRate != null && car.chargeRate > 0 && (
                                    <span><Gauge size={13} /> {Math.round(car.chargeRate)} {car.chargeRateUnit}</span>
                                )}
                                {car.energyAdded != null && (car.isCharging || car.state === 'complete') && (
                                    <span><Zap size={13} /> +{fmtKwh(car.energyAdded, 1)} kWh i bilen</span>
                                )}
                                {car.scheduledCharging && !car.isCharging && (
                                    <span><Clock size={13} /> Planlagt lading venter</span>
                                )}
                            </div>

                            {settings.showVehicleControls !== false && (car.hasChargeLimit || car.hasChargeSwitch) && (
                                <div className="evc-car-controls">
                                    {car.hasChargeLimit && (
                                        <div className="evc-limit">
                                            <div className="evc-limit-row">
                                                <span className="evc-limit-label">Ladegrense</span>
                                                <div className={`evc-limit-stepper${limitPending ? ' is-pending' : ''}`}>
                                                    <button type="button" aria-label="Lavere ladegrense" onClick={(e) => queueLimit((displayLimit ?? 80) - limitStep, e)}><Minus size={16} /></button>
                                                    <span className="evc-limit-value">{displayLimit != null ? `${Math.round(displayLimit)} %` : '–'}</span>
                                                    <button type="button" aria-label="Høyere ladegrense" onClick={(e) => queueLimit((displayLimit ?? 80) + limitStep, e)}><Plus size={16} /></button>
                                                </div>
                                            </div>
                                            <div className="evc-limit-presets">
                                                {LIMIT_PRESETS.filter(p => p >= (car.limitOptions.min ?? 50) && p <= (car.limitOptions.max ?? 100)).map(p => (
                                                    <button
                                                        key={p}
                                                        type="button"
                                                        className={`evc-chip${Math.round(displayLimit) === p ? ' is-active' : ''}`}
                                                        onClick={(e) => queueLimit(p, e)}
                                                    >{p}</button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {car.hasChargeSwitch && (
                                        <button
                                            type="button"
                                            className={`evc-car-btn${car.chargeSwitch ? ' is-on' : ''}`}
                                            onClick={toggleCarCharge}
                                        >
                                            <Zap size={16} />
                                            {car.chargeSwitch ? 'Stopp lading i bilen' : 'Start lading i bilen'}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Ingen bil på laderen: kort oversikt over bilene */}
                    {!car && settings.showVehicleList !== false && vehicles.length > 0 && (
                        <div className="evc-car-list">
                            {vehicles.map(v => {
                                const s = vehicleSummary(v);
                                return (
                                    <div key={v.id} className="evc-car-list-row">
                                        <Car size={15} />
                                        <span className="evc-car-list-name">{s.name}</span>
                                        <span className="evc-car-list-batt">{s.battery != null ? `${Math.round(s.battery)} %` : '–'}</span>
                                        {s.range != null && <span className="evc-car-list-dim">{Math.round(s.range)} {s.rangeUnit}</span>}
                                        <span className="evc-car-list-dim">{locationText(s.location)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Statistikk */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', width: '100%', background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Økt</span>
                            <span style={{ fontSize: '1.1rem', fontWeight: 500 }}>
                                {isCharging ? sessionEnergy.toFixed(2) : lastSession.toFixed(2)} kWh
                            </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Totalt</span>
                            <span style={{ fontSize: '1.1rem', fontWeight: 500 }}>{Math.round(totalEnergy)} kWh</span>
                        </div>
                        {/* Perioder vises bare når sensoren finnes i HA (Zaptec har måned/forrige måned/hittil i år, ikke «i dag») */}
                        {periodStats.map(s => (
                            <div key={s.key} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{s.label}</span>
                                <span style={{ fontSize: '1.1rem', fontWeight: 500 }}>{s.text}</span>
                            </div>
                        ))}
                        {/* Fasestrømmer */}
                        <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                            {[['Fase 1', phase1], ['Fase 2', phase2], ['Fase 3', phase3]].map(([label, val]) => (
                                <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{label}</span>
                                    <span>{Number(val).toFixed(1)} A</span>
                                </div>
                            ))}
                        </div>
                        {/* Bunnrad: temperatur, tildelt strøm, offline */}
                        <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                            {temperature != null && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Thermometer size={14} />
                                    {Number(temperature).toFixed(1)}°C
                                </div>
                            )}
                            {settings.showAllocatedCurrent && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Zap size={14} />
                                    {Number(allocatedCurrent).toFixed(0)} A tildelt
                                </div>
                            )}
                            {!isOnline && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-error)' }}>
                                    <WifiOff size={14} />
                                    Offline
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ── COMPACT VIEW ──────────────────────────────────────────────────────────
    return (
        <div className="tile-content" style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', justifyContent: 'space-between', padding: '4px' }}>

            {/* Topp: ikon + lås/offline */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
                <div style={{
                    color: statusColor,
                    background: `color-mix(in srgb, ${statusColor} 15%, transparent)`,
                    padding: '8px', borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <StatusIcon size={24} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    {cableLocked && <Lock size={16} color="var(--color-text-secondary)" />}
                    {!isOnline && <WifiOff size={16} color="var(--color-error)" />}
                    {/* Vis strømgrense for HA når lading pågår */}
                    {isHA && isCharging && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                            {Math.round(availableCurrentLimit > 0 ? availableCurrentLimit : allocatedCurrent)} A
                        </span>
                    )}
                </div>
            </div>

            {/* Midten: effekt */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', margin: 'auto 0' }}>
                <span style={{ fontSize: '1.5rem', fontWeight: 600, lineHeight: 1 }}>
                    {Math.round(power)}
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>W</span>
            </div>

            {/* Bilen som lader: navn, batteri og ladegrense */}
            {showCarCompact && (
                <div className="evc-car-compact">
                    <div className="evc-car-line">
                        <Car size={13} />
                        <span className="evc-car-line-name">{car.name}</span>
                        <span className="evc-car-line-batt">{car.battery != null ? `${Math.round(car.battery)} %` : '–'}</span>
                        {car.limit != null && <span className="evc-car-line-limit">→ {Math.round(car.limit)} %</span>}
                    </div>
                    <BatteryBar battery={car.battery} limit={car.limit} charging={car.isCharging} />
                </div>
            )}

            {/* Bunn: økt-energi eller statustekst */}
            <div style={{ width: '100%', textAlign: 'center' }}>
                {isCharging ? (
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-success)', fontWeight: 500 }}>
                        +{sessionEnergy.toFixed(2)} kWh
                        {showCarCompact && carFinishText && (
                            <span style={{ marginLeft: '6px', opacity: 0.8 }}>· ferdig {carFinishText}</span>
                        )}
                        {settings.showCostCurrent && costCurrent > 0 && (
                            <span style={{ marginLeft: '6px', opacity: 0.8 }}>· {costCurrent.toFixed(1)} kr/h</span>
                        )}
                    </div>
                ) : (
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                        {statusText}
                        {showCarCompact && car.range != null && (
                            <span style={{ marginLeft: '6px', opacity: 0.8 }}>· {Math.round(car.range)} {car.rangeUnit}</span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default EVChargerTile;
