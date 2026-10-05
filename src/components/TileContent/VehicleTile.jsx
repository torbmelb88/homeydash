import React, { useState, useEffect, useRef } from 'react';
import { Car, Moon, Lock, Unlock, Thermometer, Snowflake, Fan, Power, Armchair, CircleDot, Shield, DoorOpen, Battery, BatteryCharging, MapPin, Route } from 'lucide-react';
import { useHomey } from '../../context/HomeyContext';
import useIsMobile from '../../hooks/useIsMobile';
import TempStepper from '../TempStepper';
import { formatTemp } from '../../services/climate';
import { vehicleSummary, locationText } from '../../services/vehicle';

// Bilflis: kupéklima i fokus (temperatur, setevarme, rattvarme, avising) + status.
// Lading ligger på billader-flisen (EVChargerTile) – her vises bare batteri/rekkevidde.

const SEND_DELAY_MS = 800;      // samler raske −/+-trykk (Tesla-API-et er tregt)
const EXPIRE_MS = 15000;        // ubekreftet optimistisk verdi faller tilbake

const LEVEL_LABEL = { off: 'Av', low: 'Lav', medium: 'Middels', high: 'Høy' };
const PRESET_LABEL = { off: 'Av', keep: 'Behold', dog: 'Hund', camp: 'Camp' };
const SEAT_LABEL = {
    front_left: 'Fører', front_right: 'Passasjer',
    rear_left: 'Bak venstre', rear_center: 'Bak midten', rear_right: 'Bak høyre',
};
const SEAT_ORDER = ['front_left', 'front_right', 'rear_left', 'rear_center', 'rear_right'];

const fmt1 = (v) => (v == null || isNaN(v)) ? '–' : Number(v).toFixed(1).replace('.', ',');

// Segmentert velger (Av / Lav / Middels / Høy)
const LevelPicker = ({ value, options, onPick, pending }) => (
    <div className={`veh-seg${pending ? ' is-pending' : ''}`} onClick={e => e.stopPropagation()}>
        {options.map(o => (
            <button
                key={o}
                type="button"
                className={`veh-seg-btn${value === o ? ' is-active' : ''}${o === 'off' ? ' is-off' : ''}`}
                onClick={() => onPick(o)}
            >{LEVEL_LABEL[o] || o}</button>
        ))}
    </div>
);

const Toggle = ({ on, label, Icon, onToggle, pending, danger }) => (
    <button
        type="button"
        className={`veh-toggle${on ? ' is-on' : ''}${pending ? ' is-pending' : ''}${danger ? ' is-danger' : ''}`}
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
    >
        {Icon && <Icon size={16} />}
        <span>{label}</span>
        <span className="veh-toggle-state">{on ? 'På' : 'Av'}</span>
    </button>
);

const VehicleTile = ({ tile, device, expanded }) => {
    const { api } = useHomey();
    const isMobile = useIsMobile();
    const settings = tile.settings || {};
    const caps = device?.capabilitiesObj || {};
    const car = vehicleSummary(device);

    // ── Optimistisk tilstand (capId → verdi) ───────────────────────────────
    const [optimistic, setOptimistic] = useState({});
    const expireTimers = useRef({});
    const sendTimer = useRef(null);
    useEffect(() => () => {
        Object.values(expireTimers.current).forEach(clearTimeout);
        clearTimeout(sendTimer.current);
    }, []);

    const valueOf = (capId) => {
        const o = optimistic[capId];
        const actual = caps[capId]?.value;
        if (o !== undefined && o !== actual) return o;
        return actual;
    };
    const isPending = (capId) => optimistic[capId] !== undefined && optimistic[capId] !== caps[capId]?.value;

    const armExpire = (capId) => {
        clearTimeout(expireTimers.current[capId]);
        expireTimers.current[capId] = setTimeout(() => {
            setOptimistic(prev => { const n = { ...prev }; delete n[capId]; return n; });
        }, EXPIRE_MS);
    };

    const send = async (capId, value) => {
        if (!device) return;
        setOptimistic(prev => ({ ...prev, [capId]: value }));
        armExpire(capId);
        try { await api.setCapability(device.id, capId, value); }
        catch (err) { console.error('Vehicle command failed', capId, err); }
    };

    // Måltemperatur: endre tallet straks, send 800 ms etter siste trykk
    const targetOpts = device?.capabilitiesOptions?.vehicle_climate_target || {};
    const tMin = targetOpts.min ?? 15, tMax = targetOpts.max ?? 28, tStep = targetOpts.step || 0.5;
    const target = valueOf('vehicle_climate_target');
    const stepTarget = (dir) => {
        const base = Number(target ?? 21);
        const next = Math.max(tMin, Math.min(tMax, Math.round((base + dir * tStep) / tStep) * tStep));
        setOptimistic(prev => ({ ...prev, vehicle_climate_target: next }));
        armExpire('vehicle_climate_target');
        clearTimeout(sendTimer.current);
        sendTimer.current = setTimeout(async () => {
            try { await api.setCapability(device.id, 'vehicle_climate_target', next); }
            catch (err) { console.error('Set cabin temperature failed', err); }
            armExpire('vehicle_climate_target');
        }, SEND_DELAY_MS);
    };

    // ── Avledede verdier ───────────────────────────────────────────────────
    const hasClimate = 'vehicle_climate_on' in caps;
    const climateOn = !!valueOf('vehicle_climate_on');
    const climateUnavailable = !!caps.vehicle_climate_on?.unavailable;
    const inside = caps['measure_temperature.inside']?.value ?? caps.vehicle_climate_current?.value ?? null;
    const outside = caps['measure_temperature.outside']?.value ?? null;
    const preset = valueOf('vehicle_climate_preset');
    const presetOptions = device?.capabilitiesOptions?.vehicle_climate_preset?.values || [];
    const seats = SEAT_ORDER.filter(pos => `vehicle_seat_heater.${pos}` in caps);
    const hasWheel = 'vehicle_wheel_heater' in caps;
    const asleep = car?.awake === false;

    const statusText = climateUnavailable ? 'Klima utilgjengelig'
        : climateOn ? `Varmer til ${formatTemp(target, tStep)}°`
        : asleep ? 'Sover' : 'Klima av';
    const accent = climateOn ? 'var(--color-warning, #f59e0b)' : 'var(--color-text-secondary)';

    if (!device) return <div className="tile-content">Bil ikke funnet</div>;

    // ── UTVIDET ────────────────────────────────────────────────────────────
    if (expanded) {
        return (
            <div className="tile-content veh-expanded" style={{ flexDirection: isMobile ? 'column' : 'row' }}>
                {/* Venstre: identitet + status */}
                <div className="veh-side">
                    <div className="veh-hero" style={{ '--veh-accent': accent }}>
                        <div className="veh-hero-icon"><Car size={34} /></div>
                        <div className="veh-hero-name">{car.name}</div>
                        <div className="veh-hero-sub">
                            {[car.make && car.model ? `${car.make} ${car.model}` : (car.model || car.make)].filter(Boolean).join(' ')}
                            {asleep && <span className="veh-asleep"><Moon size={12} /> sover</span>}
                        </div>
                        <div className="veh-hero-temp">
                            <Thermometer size={16} />
                            <span>Inne {fmt1(inside)}°</span>
                            {outside != null && <span className="veh-dim">· Ute {fmt1(outside)}°</span>}
                        </div>
                    </div>

                    {settings.showBattery !== false && (
                        <div className="veh-facts">
                            {car.battery != null && (
                                <div className="veh-fact">
                                    {car.isCharging ? <BatteryCharging size={15} /> : <Battery size={15} />}
                                    <span>{Math.round(car.battery)} %</span>
                                    {car.limit != null && <span className="veh-dim">→ {Math.round(car.limit)} %</span>}
                                </div>
                            )}
                            {car.range != null && <div className="veh-fact"><Route size={15} /><span>{Math.round(car.range)} {car.rangeUnit}</span></div>}
                            {car.location && <div className="veh-fact"><MapPin size={15} /><span>{locationText(car.location)}</span></div>}
                        </div>
                    )}

                    {settings.showStatus !== false && (
                        <div className="veh-chips">
                            {car.locked != null && (
                                <span className={`veh-chip${car.locked ? '' : ' is-warn'}`}>
                                    {car.locked ? <Lock size={13} /> : <Unlock size={13} />}{car.locked ? 'Låst' : 'Ulåst'}
                                </span>
                            )}
                            {caps.vehicle_windows_open?.value && <span className="veh-chip is-warn"><DoorOpen size={13} />Vinduer åpne</span>}
                            {caps.vehicle_frunk_open?.value && <span className="veh-chip is-warn"><DoorOpen size={13} />Frunk åpen</span>}
                            {caps.vehicle_trunk_open?.value && <span className="veh-chip is-warn"><DoorOpen size={13} />Bagasjerom åpent</span>}
                            {car.portOpen && <span className="veh-chip"><CircleDot size={13} />Ladeluke åpen</span>}
                            {'vehicle_sentry' in caps && (
                                <span className={`veh-chip${caps.vehicle_sentry.value ? ' is-on' : ''}`}><Shield size={13} />Vaktmodus {caps.vehicle_sentry.value ? 'på' : 'av'}</span>
                            )}
                            {car.userPresent && <span className="veh-chip">Noen i bilen</span>}
                        </div>
                    )}
                </div>

                {/* Høyre: klima + seter */}
                <div className="veh-main">
                    {hasClimate && (
                        <div className={`veh-card veh-climate${climateOn ? ' is-on' : ''}`}>
                            <div className="veh-card-head">
                                <div className="veh-card-title"><Fan size={18} /> Kupéklima</div>
                                <button
                                    type="button"
                                    className={`veh-power${climateOn ? ' is-on' : ''}${isPending('vehicle_climate_on') ? ' is-pending' : ''}`}
                                    disabled={climateUnavailable}
                                    onClick={(e) => { e.stopPropagation(); send('vehicle_climate_on', !climateOn); }}
                                >
                                    <Power size={18} />
                                    {climateOn ? 'Slå av' : 'Slå på'}
                                </button>
                            </div>
                            <div className="veh-climate-body">
                                <div className="veh-climate-now">
                                    <span className="veh-climate-now-value">{fmt1(inside)}°</span>
                                    <span className="veh-dim">inne nå{outside != null ? ` · ${fmt1(outside)}° ute` : ''}</span>
                                </div>
                                <div className="veh-climate-target">
                                    <TempStepper
                                        value={target}
                                        step={tStep}
                                        min={tMin}
                                        max={tMax}
                                        size={isMobile ? 'md' : 'xl'}
                                        pending={isPending('vehicle_climate_target')}
                                        disabled={climateUnavailable}
                                        onStep={stepTarget}
                                    />
                                    <span className="veh-dim">ønsket</span>
                                </div>
                            </div>
                            {settings.showPresets !== false && presetOptions.length > 0 && (
                                <div className="veh-presets" onClick={e => e.stopPropagation()}>
                                    {presetOptions.map(p => (
                                        <button
                                            key={p}
                                            type="button"
                                            className={`veh-seg-btn${preset === p ? ' is-active' : ''}${isPending('vehicle_climate_preset') ? ' is-pending' : ''}`}
                                            onClick={() => send('vehicle_climate_preset', p)}
                                        >{PRESET_LABEL[p] || p}</button>
                                    ))}
                                </div>
                            )}
                            {settings.showDefrost !== false && 'vehicle_defrost' in caps && (
                                <Toggle
                                    on={!!valueOf('vehicle_defrost')}
                                    label="Avising"
                                    Icon={Snowflake}
                                    pending={isPending('vehicle_defrost')}
                                    onToggle={() => send('vehicle_defrost', !valueOf('vehicle_defrost'))}
                                />
                            )}
                        </div>
                    )}

                    {settings.showSeats !== false && (seats.length > 0 || hasWheel) && (
                        <div className="veh-card">
                            <div className="veh-card-title"><Armchair size={18} /> Setevarme og rattvarme</div>
                            <div className="veh-rows">
                                {seats.map(pos => {
                                    const capId = `vehicle_seat_heater.${pos}`;
                                    const opts = device.capabilitiesOptions?.[capId]?.values || ['off', 'low', 'medium', 'high'];
                                    return (
                                        <div key={pos} className="veh-row">
                                            <span className="veh-row-label">{SEAT_LABEL[pos] || pos}</span>
                                            <LevelPicker value={valueOf(capId)} options={opts} pending={isPending(capId)} onPick={(v) => send(capId, v)} />
                                        </div>
                                    );
                                })}
                                {hasWheel && (
                                    <div className="veh-row">
                                        <span className="veh-row-label">Ratt</span>
                                        <LevelPicker
                                            value={valueOf('vehicle_wheel_heater')}
                                            options={device.capabilitiesOptions?.vehicle_wheel_heater?.values || ['off', 'low', 'high']}
                                            pending={isPending('vehicle_wheel_heater')}
                                            onPick={(v) => send('vehicle_wheel_heater', v)}
                                        />
                                    </div>
                                )}
                            </div>
                            {settings.showAutoHeat !== false && ('vehicle_auto_seat.left' in caps || 'vehicle_auto_wheel' in caps) && (
                                <div className="veh-auto">
                                    {'vehicle_auto_seat.left' in caps && (
                                        <Toggle on={!!valueOf('vehicle_auto_seat.left')} label="Auto sete V" pending={isPending('vehicle_auto_seat.left')} onToggle={() => send('vehicle_auto_seat.left', !valueOf('vehicle_auto_seat.left'))} />
                                    )}
                                    {'vehicle_auto_seat.right' in caps && (
                                        <Toggle on={!!valueOf('vehicle_auto_seat.right')} label="Auto sete H" pending={isPending('vehicle_auto_seat.right')} onToggle={() => send('vehicle_auto_seat.right', !valueOf('vehicle_auto_seat.right'))} />
                                    )}
                                    {'vehicle_auto_wheel' in caps && (
                                        <Toggle on={!!valueOf('vehicle_auto_wheel')} label="Auto ratt" pending={isPending('vehicle_auto_wheel')} onToggle={() => send('vehicle_auto_wheel', !valueOf('vehicle_auto_wheel'))} />
                                    )}
                                    <span className="veh-hint">Auto = bilen velger nivå etter kupétemperaturen når klimaet er på.</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ── KOMPAKT ────────────────────────────────────────────────────────────
    return (
        <div className={`tile-content veh-compact${climateOn ? ' is-on' : ''}`} style={{ '--veh-accent': accent }}>
            <div className="veh-compact-top">
                <div className="veh-compact-icon"><Car size={22} /></div>
                {/* Batteri-% vises allerede i flishodet (Tile.jsx viser measure_battery for alle enheter) */}
                <div className="veh-compact-badges">
                    {car.locked === false && <Unlock size={14} className="veh-warn" />}
                    {car.isCharging && <BatteryCharging size={14} className="veh-dim" />}
                </div>
            </div>
            <div className="veh-compact-temp">
                <span className="veh-compact-temp-value">{fmt1(inside)}°</span>
                <span className="veh-dim">inne</span>
            </div>
            <div className="veh-compact-status">
                {climateOn ? <Fan size={13} /> : asleep ? <Moon size={13} /> : <Power size={13} />}
                {statusText}
            </div>
        </div>
    );
};

export default VehicleTile;
