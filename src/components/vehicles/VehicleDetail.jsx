import React from 'react';
import { X, Car, Fan, Power, Zap, Minus, Plus, Snowflake, Armchair, Lock, Unlock, DoorOpen, CircleDot, Shield, MapPin, Moon } from 'lucide-react';
import TempStepper from '../TempStepper';
import { BatteryBar, Group, Stats, LevelPicker, Toggle, PRESET_LABEL, SEAT_LABEL, SEAT_ORDER, fmt1, stop } from './shared';
import { climateKindOf, formatClock, formatUntil, locationText } from '../../services/vehicle';
import { climateLimits } from './VehicleCard';

const LIMIT_PRESETS = [50, 60, 70, 80, 90, 100];

// Utvidet visning for én bil: lading (ladegrense, start/stopp i bilen), kupéklima, seter/ratt,
// status og detaljer. Bygges av det bilen faktisk har – bil nr. 2 får bare sine egne grupper.
export default function VehicleDetail({ vehicle, car, name, onCharger, chargerSummary: ch, lm, ctl, settings, onClose }) {
    const caps = vehicle.capabilitiesObj || {};
    const climateKind = climateKindOf(vehicle);
    const climateOn = climateKind === 'entity' && !!ctl.capOf(vehicle, 'vehicle_climate_on');
    const climateNA = !!caps.vehicle_climate_on?.unavailable;
    const target = ctl.capOf(vehicle, 'vehicle_climate_target');
    const inside = caps['measure_temperature.inside']?.value ?? caps.vehicle_climate_current?.value ?? null;
    const outside = caps['measure_temperature.outside']?.value ?? null;
    const asleep = car.awake === false;
    const lim = climateLimits(vehicle);
    const tone = climateOn ? 'climate' : car.isCharging ? 'charging' : 'idle';
    const model = [car.make && car.model ? `${car.make} ${car.model}` : (car.model || car.make)].filter(Boolean)[0];

    // Ladegrense: 5 % per trykk (Tesla oppgir trinn 1, upraktisk), hurtigvalg dekker resten
    const limitOpts = car.limitOptions || { min: 50, max: 100, step: 1 };
    const limitStep = Math.max(5, Number(limitOpts.step) || 1);
    const limit = ctl.capOf(vehicle, 'vehicle_charge_limit');
    const limitPending = ctl.isPending(vehicle, 'vehicle_charge_limit');
    const chargeSwitch = !!ctl.capOf(vehicle, 'vehicle_charge_switch');

    const preset = ctl.capOf(vehicle, 'vehicle_climate_preset');
    const presetOptions = vehicle.capabilitiesOptions?.vehicle_climate_preset?.values || [];
    const seats = SEAT_ORDER.filter(pos => `vehicle_seat_heater.${pos}` in caps);
    const hasWheel = 'vehicle_wheel_heater' in caps;

    return (
        <>
            <div className="climate-detail-head">
                <div className={`vp-badge tone-${tone} is-large`}>{climateOn ? <Fan size={24} strokeWidth={1.8} /> : <Car size={24} strokeWidth={1.8} />}</div>
                <div className="climate-detail-title">
                    <strong>{name}</strong>
                    <span>
                        {[model, onCharger ? 'på laderen' : locationText(car.location)].filter(Boolean).join(' · ')}
                        {asleep && <> · <Moon size={11} style={{ verticalAlign: '-1px' }} /> sover</>}
                    </span>
                </div>
                <button type="button" className="climate-close" onClick={onClose} aria-label="Lukk"><X size={20} /></button>
            </div>

            <div className="climate-detail-body">
                {/* ── Lading ─────────────────────────────────────────── */}
                <Group label={car.isCharging && car.timeToFull ? `Lading · ferdig ${formatClock(car.timeToFull)}` : 'Lading'}>
                    <div className="vp-batt">
                        <span className="vp-batt-big">{car.battery != null ? `${Math.round(car.battery)} %` : '–'}</span>
                        {limit != null && <span className="vp-batt-lim">→ {Math.round(limit)} %</span>}
                        {car.range != null && <span className="vp-batt-range">{Math.round(car.range)} {car.rangeUnit}</span>}
                    </div>
                    <BatteryBar battery={car.battery} limit={limit} charging={car.isCharging} large />

                    {car.hasChargeLimit && (
                        <div className="vp-limit" onClick={stop} onPointerDown={stop}>
                            <div className="vp-limit-row">
                                <span className="vp-dim">Ladegrense</span>
                                <div className={`vp-limit-stepper${limitPending ? ' is-pending' : ''}`}>
                                    <button type="button" aria-label="Lavere ladegrense" onClick={() => ctl.stepValue(vehicle, 'vehicle_charge_limit', -1, { ...limitOpts, step: limitStep, fallback: 80 })}><Minus size={18} /></button>
                                    <span className="vp-limit-value">{limit != null ? `${Math.round(limit)} %` : '–'}</span>
                                    <button type="button" aria-label="Høyere ladegrense" onClick={() => ctl.stepValue(vehicle, 'vehicle_charge_limit', 1, { ...limitOpts, step: limitStep, fallback: 80 })}><Plus size={18} /></button>
                                </div>
                            </div>
                            <div className="climate-chips">
                                {LIMIT_PRESETS.filter(p => p >= (limitOpts.min ?? 50) && p <= (limitOpts.max ?? 100)).map(p => (
                                    <button key={p} type="button" className={Math.round(limit) === p ? 'is-on' : ''} onClick={() => ctl.queueValue(vehicle, 'vehicle_charge_limit', p)}>{p}</button>
                                ))}
                            </div>
                        </div>
                    )}

                    {car.hasChargeSwitch && (
                        <button type="button" className={`climate-wide-btn${chargeSwitch ? ' is-danger' : ''}`} onClick={() => ctl.setCap(vehicle, 'vehicle_charge_switch', !chargeSwitch)}>
                            <Zap size={18} /> {chargeSwitch ? 'Stopp lading i bilen' : 'Start lading i bilen'}
                        </button>
                    )}

                    <Stats label="" items={[
                        { label: 'Status', value: car.stateInfo?.text || null },
                        { label: 'Effekt', value: car.isCharging && car.chargerPower > 0 ? `${(car.chargerPower / 1000).toFixed(1)} kW${car.chargerCurrent ? ` · ${Math.round(car.chargerCurrent)} A` : ''}` : null },
                        { label: 'Lagt til denne økta', value: car.energyAdded != null && (car.isCharging || car.state === 'complete') ? `${Number(car.energyAdded).toFixed(1)} kWh` : null },
                        { label: 'Ladehastighet', value: car.isCharging && car.chargeRate > 0 ? `${Math.round(car.chargeRate)} ${car.chargeRateUnit}` : null },
                        { label: 'Ferdig', value: car.isCharging && car.timeToFull ? `${formatClock(car.timeToFull)}${formatUntil(car.timeToFull) ? ` (${formatUntil(car.timeToFull)})` : ''}` : null },
                        { label: 'Laderen', value: onCharger && ch ? `${ch.hasLimit ? `${Math.round(ch.limit)} A` : ch.statusText}${lm ? ` · ${lm.override === 'auto' ? 'automatikk' : 'overstyrt'}` : ''}` : null },
                    ]} />
                    {!onCharger && !car.isCharging && <div className="climate-tiny">Bilen står ikke på laderen hjemme.</div>}
                </Group>

                {/* ── Kupéklima ──────────────────────────────────────── */}
                {climateKind === 'entity' && (
                    <Group label="Kupéklima">
                        <div className="vp-climate-hero">
                            <TempStepper
                                size="xl"
                                value={target}
                                step={lim.step}
                                min={lim.min}
                                max={lim.max}
                                pending={ctl.isPending(vehicle, 'vehicle_climate_target')}
                                disabled={climateNA}
                                onStep={(dir) => ctl.stepValue(vehicle, 'vehicle_climate_target', dir, lim)}
                            />
                            <div className="climate-hero-now">
                                {inside != null && <span>Inne <b>{fmt1(inside)}°</b></span>}
                                {outside != null && <span>Ute <b>{fmt1(outside)}°</b></span>}
                                <span className={climateOn ? 'tone-heat' : ''}>{climateNA ? 'Utilgjengelig' : climateOn ? 'Klima på' : 'Klima av'}</span>
                            </div>
                        </div>
                        <button
                            type="button"
                            className={`climate-wide-btn${climateOn ? ' is-warm' : ''}${ctl.isPending(vehicle, 'vehicle_climate_on') ? ' is-pending' : ''}`}
                            disabled={climateNA}
                            onClick={() => ctl.setCap(vehicle, 'vehicle_climate_on', !climateOn)}
                        >
                            <Power size={18} /> {climateOn ? 'Slå av klima' : 'Slå på klima'}
                        </button>
                        {settings.showPresets !== false && presetOptions.length > 0 && (
                            <div className="climate-chips">
                                {presetOptions.map(p => (
                                    <button key={p} type="button" className={preset === p ? 'is-on' : ''} onClick={() => ctl.setCap(vehicle, 'vehicle_climate_preset', p)}>{PRESET_LABEL[p] || p}</button>
                                ))}
                            </div>
                        )}
                        {'vehicle_defrost' in caps && (
                            <Toggle on={!!ctl.capOf(vehicle, 'vehicle_defrost')} label="Avising" Icon={Snowflake} pending={ctl.isPending(vehicle, 'vehicle_defrost')} onToggle={() => ctl.setCap(vehicle, 'vehicle_defrost', !ctl.capOf(vehicle, 'vehicle_defrost'))} />
                        )}
                    </Group>
                )}

                {/* ── Seter og ratt ──────────────────────────────────── */}
                {settings.showSeats !== false && (seats.length > 0 || hasWheel) && (
                    <Group label="Setevarme og rattvarme">
                        <div className="veh-rows">
                            {seats.map(pos => {
                                const capId = `vehicle_seat_heater.${pos}`;
                                const opts = vehicle.capabilitiesOptions?.[capId]?.values || ['off', 'low', 'medium', 'high'];
                                return (
                                    <div key={pos} className="veh-row">
                                        <span className="veh-row-label">{SEAT_LABEL[pos] || pos}</span>
                                        <LevelPicker value={ctl.capOf(vehicle, capId)} options={opts} pending={ctl.isPending(vehicle, capId)} onPick={(v) => ctl.setCap(vehicle, capId, v)} />
                                    </div>
                                );
                            })}
                            {hasWheel && (
                                <div className="veh-row">
                                    <span className="veh-row-label">Ratt</span>
                                    <LevelPicker value={ctl.capOf(vehicle, 'vehicle_wheel_heater')} options={vehicle.capabilitiesOptions?.vehicle_wheel_heater?.values || ['off', 'low', 'high']} pending={ctl.isPending(vehicle, 'vehicle_wheel_heater')} onPick={(v) => ctl.setCap(vehicle, 'vehicle_wheel_heater', v)} />
                                </div>
                            )}
                        </div>
                        {('vehicle_auto_seat.left' in caps || 'vehicle_auto_wheel' in caps) && (
                            <div className="veh-auto">
                                {'vehicle_auto_seat.left' in caps && <Toggle on={!!ctl.capOf(vehicle, 'vehicle_auto_seat.left')} label="Auto sete V" pending={ctl.isPending(vehicle, 'vehicle_auto_seat.left')} onToggle={() => ctl.setCap(vehicle, 'vehicle_auto_seat.left', !ctl.capOf(vehicle, 'vehicle_auto_seat.left'))} />}
                                {'vehicle_auto_seat.right' in caps && <Toggle on={!!ctl.capOf(vehicle, 'vehicle_auto_seat.right')} label="Auto sete H" pending={ctl.isPending(vehicle, 'vehicle_auto_seat.right')} onToggle={() => ctl.setCap(vehicle, 'vehicle_auto_seat.right', !ctl.capOf(vehicle, 'vehicle_auto_seat.right'))} />}
                                {'vehicle_auto_wheel' in caps && <Toggle on={!!ctl.capOf(vehicle, 'vehicle_auto_wheel')} label="Auto ratt" pending={ctl.isPending(vehicle, 'vehicle_auto_wheel')} onToggle={() => ctl.setCap(vehicle, 'vehicle_auto_wheel', !ctl.capOf(vehicle, 'vehicle_auto_wheel'))} />}
                                <span className="veh-hint">Auto = bilen velger nivå etter kupétemperaturen når klimaet er på.</span>
                            </div>
                        )}
                    </Group>
                )}

                {/* ── Status ─────────────────────────────────────────── */}
                {settings.showStatus !== false && (
                    <Group label="Status">
                        <div className="vp-chips vp-chips--wrap">
                            {car.locked != null && <span className={`vp-chip${car.locked ? '' : ' is-warn'}`}>{car.locked ? <Lock size={12} /> : <Unlock size={12} />}{car.locked ? 'Låst' : 'Ulåst'}</span>}
                            {'vehicle_windows_open' in caps && <span className={`vp-chip${caps.vehicle_windows_open.value ? ' is-warn' : ''}`}><DoorOpen size={12} />Vinduer {caps.vehicle_windows_open.value ? 'åpne' : 'lukket'}</span>}
                            {caps.vehicle_frunk_open?.value && <span className="vp-chip is-warn"><DoorOpen size={12} />Frunk åpen</span>}
                            {caps.vehicle_trunk_open?.value && <span className="vp-chip is-warn"><DoorOpen size={12} />Bagasjerom åpent</span>}
                            {car.portOpen != null && <span className="vp-chip"><CircleDot size={12} />Ladeluke {car.portOpen ? 'åpen' : 'lukket'}</span>}
                            {'vehicle_sentry' in caps && <span className={`vp-chip${caps.vehicle_sentry.value ? ' is-on' : ''}`}><Shield size={12} />Vaktmodus {caps.vehicle_sentry.value ? 'på' : 'av'}</span>}
                            {car.location && <span className="vp-chip"><MapPin size={12} />{locationText(car.location)}</span>}
                            {car.userPresent && <span className="vp-chip">Noen i bilen</span>}
                            {asleep && <span className="vp-chip"><Moon size={12} />Sover</span>}
                        </div>
                    </Group>
                )}

                <Stats label="Detaljer" items={[
                    { label: 'Kilometerstand', value: caps.vehicle_odometer?.value != null ? `${Math.round(caps.vehicle_odometer.value).toLocaleString('nb-NO')} km` : null },
                    { label: 'Brukbart batteri', value: car.batteryUsable != null ? `${Math.round(car.batteryUsable)} %` : null },
                    { label: 'Rekkevidde', value: car.range != null ? `${Math.round(car.range)} ${car.rangeUnit}` : null },
                    { label: 'Kabel', value: car.cableConnected == null ? null : car.cableConnected ? 'Tilkoblet' : 'Ikke tilkoblet' },
                ]} />
            </div>
        </>
    );
}
