import React, { useMemo } from 'react';
import { X, Zap, Plug, BatteryCharging, Lock, Unlock, Car, ChevronRight, WifiOff } from 'lucide-react';
import MiniPowerGraph from '../TileContent/MiniPowerGraph';
import { AmpsPicker, BatteryBar, Group, LoadManagerRow, Stats, fmt0, fmt1 } from './shared';
import { formatClock, formatUntil } from '../../services/vehicle';
import { meterReadings, formatPower } from '../../services/climate';

const TONE_ICON = { charging: Zap, connected: Plug, done: BatteryCharging, idle: Plug };

// Utvidet visning for laderen: ladestrøm, Strømstyring, kabellås, bilen som henger på,
// forbruk per periode (Energikostnad-sensorene med samme prefiks), fasestrømmer og effektgraf.
export default function ChargerDetail({ charger, summary: s, car, carName, lm, lmAction, ctl, devices, settings, onClose, onOpenVehicle }) {
    const Icon = TONE_ICON[s.tone] || Plug;
    const limit = ctl.capOf(charger, 'available_current_limit', s.limit);
    const limitPending = ctl.isPending(charger, 'available_current_limit', s.limit);
    const cableLocked = !!ctl.capOf(charger, 'cable_permanent_lock');

    const readings = useMemo(() => meterReadings(devices, charger, null), [devices, charger]);
    const num = (id) => {
        const v = readings[id] ?? charger.capabilitiesObj?.[id]?.value;
        return v == null || v === '' || isNaN(Number(v)) ? null : Number(v);
    };
    const kwhKr = (kwhId, krId) => {
        const parts = [num(kwhId) != null ? `${num(kwhId).toFixed(0)} kWh` : null, num(krId) != null ? `${num(krId).toFixed(0)} kr` : null].filter(Boolean);
        return parts.length ? parts.join(' · ') : null;
    };
    const kwh = (v, d = 1) => (v == null ? null : `${Number(v).toFixed(d)} kWh`);

    return (
        <>
            <div className="climate-detail-head">
                <div className={`vp-badge tone-${s.tone} is-large`}><Icon size={24} strokeWidth={1.8} /></div>
                <div className="climate-detail-title">
                    <strong>{s.name}</strong>
                    <span>{[s.zoneName, s.statusText].filter(Boolean).join(' · ')}</span>
                </div>
                <button type="button" className="climate-close" onClick={onClose} aria-label="Lukk"><X size={20} /></button>
            </div>

            <div className="climate-detail-body">
                <div className="vp-hero">
                    <div className="vp-hero-value">{Math.round(s.power).toLocaleString('nb-NO')}<small> W</small></div>
                    <div className={`vp-hero-sub tone-${s.tone}`}>
                        {s.statusText}
                        {s.charging && s.costCurrent != null && Number(s.costCurrent) > 0 && ` · ${fmt1(s.costCurrent)} kr/t`}
                        {!s.online && <span className="vp-err"> · <WifiOff size={13} /> frakoblet</span>}
                    </div>
                </div>

                {s.isHA && s.hasLimit && (
                    <Group label={`Ladestrøm · grense ${fmt0(limit)} A`}>
                        <AmpsPicker value={limit} pending={limitPending} disabled={!s.online} onPick={(a) => ctl.setCap(charger, 'available_current_limit', a)} />
                        <div className="climate-tiny">
                            Grensen for kretsen. «Stopp» setter 0 A. Når Strømstyring er i automatikk, setter den grensen selv etter tariffen
                            (natt 25 A, dag 0 A), så et manuelt valg varer bare til neste tariffskifte.
                        </div>
                    </Group>
                )}
                {!s.isHA && (
                    <Group label="Lading">
                        <button type="button" className={`climate-wide-btn${s.charging ? ' is-danger' : ''}`} onClick={() => ctl.setCap(charger, 'charging_button', !s.charging)}>
                            <Zap size={18} /> {s.charging ? 'Stopp lading' : 'Start lading'}
                        </button>
                    </Group>
                )}

                {settings.showLoadManager !== false && lm && (
                    <Group label="Strømstyring">
                        <LoadManagerRow lm={lm} action={lmAction} />
                        <div className="climate-tiny">
                            {lmAction.active
                                ? 'Laderen er fredet fra tariffplanen og vanlige reduksjoner, men reduseres hvis huset når kritisk kapasitet. «Automatikk» gir laderen tilbake til tariffplanen.'
                                : '«Lad nå» freder laderen fra tariffplanen og setter 25 A med en gang.'}
                            {lm.mode && ` Huset: ${lm.mode}${lm.tariff ? ` · tariff ${lm.tariff}` : ''}.`}
                        </div>
                    </Group>
                )}

                <Group label="Bil på laderen">
                    {car ? (
                        <button type="button" className="vp-car-mini" onClick={onOpenVehicle}>
                            <div className="vp-car-mini-head">
                                <Car size={16} />
                                <strong>{carName}</strong>
                                <span>{car.battery != null ? `${Math.round(car.battery)} %` : '–'}{car.limit != null ? ` → ${Math.round(car.limit)} %` : ''}</span>
                                <ChevronRight size={16} className="vp-dim" />
                            </div>
                            <BatteryBar battery={car.battery} limit={car.limit} charging={car.isCharging} />
                            <div className="vp-car-mini-sub">
                                {car.isCharging && car.timeToFull
                                    ? `Ferdig ${formatClock(car.timeToFull)}${formatUntil(car.timeToFull) ? ` (${formatUntil(car.timeToFull)})` : ''}`
                                    : car.stateInfo?.text || 'Tilkoblet'}
                                {car.range != null && ` · ${Math.round(car.range)} ${car.rangeUnit}`}
                            </div>
                        </button>
                    ) : (
                        <div className="climate-tiny">{s.connected ? 'Fant ikke hvilken bil som er tilkoblet. Velg bil fast i sidens innstillinger om det skjer ofte.' : 'Ingen bil er tilkoblet.'}</div>
                    )}
                </Group>

                {s.hasCableLock && (
                    <Group label="Kabel">
                        <div className="climate-toggles">
                            <button type="button" className={cableLocked ? 'is-on' : ''} onClick={() => ctl.setCap(charger, 'cable_permanent_lock', !cableLocked)}>
                                <span className="vp-row-icon">{cableLocked ? <Lock size={16} /> : <Unlock size={16} />} Lås kabelen fast i laderen</span>
                                <span className="climate-switch" />
                            </button>
                        </div>
                    </Group>
                )}

                <Stats label="Forbruk" items={[
                    { label: s.charging ? 'Denne økta' : 'Forrige økt', value: kwh(s.charging ? s.sessionEnergy : (s.lastSession ?? s.sessionEnergy), 2) },
                    { label: 'Totalt', value: s.totalEnergy != null ? `${fmt0(s.totalEnergy)} kWh` : null },
                    { label: 'I dag', value: kwhKr('energy_daily', 'cost_daily') },
                    { label: 'Denne måneden', value: kwhKr('energy_monthly', 'cost_monthly') },
                    { label: 'Forrige måned', value: kwhKr('energy_prev_month', 'cost_prev_month') },
                    { label: 'Hittil i år', value: kwhKr('energy_ytd', 'cost_ytd') },
                ]} />

                <Stats label="Målinger" items={[
                    { label: 'Fase 1', value: s.phases[0] != null ? `${fmt1(s.phases[0])} A` : null },
                    { label: 'Fase 2', value: s.phases[1] != null ? `${fmt1(s.phases[1])} A` : null },
                    { label: 'Fase 3', value: s.phases[2] != null ? `${fmt1(s.phases[2])} A` : null },
                    { label: 'Temperatur i laderen', value: s.temperature != null ? `${fmt1(s.temperature)} °C` : null },
                    { label: 'Tildelt av Zaptec', value: settings.showAllocatedCurrent && s.allocated != null ? `${fmt0(s.allocated)} A` : null },
                ]} />

                {s.powerEntityId && (
                    <MiniPowerGraph stacked deviceId={s.powerEntityId} currentValue={s.power} unit="W" title="Effekt siste 6 timer" color="#34c37a" />
                )}
                {s.power > 0 && !s.powerEntityId && <div className="climate-tiny">{formatPower(s.power)}</div>}
            </div>
        </>
    );
}
