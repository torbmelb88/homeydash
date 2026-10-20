import React from 'react';
import { Car, Clock, Moon, Lock, Unlock, MapPin, Thermometer, Power, Fan, ChevronRight, Zap, Route } from 'lucide-react';
import TempStepper from '../TempStepper';
import { BatteryBar, fmt1, stop } from './shared';
import { climateKindOf, formatClock, formatUntil, locationText, reportedText, vehicleKey, FINISH_LABEL } from '../../services/vehicle';
import DeviceImage from '../DeviceImage';

// Klimagrenser (HA oppgir min/max/step på climate-entiteten; Tesla 15–28, trinn 0,5)
export const climateLimits = (v) => {
    const o = v?.capabilitiesOptions?.vehicle_climate_target || {};
    return { min: o.min ?? 15, max: o.max ?? 28, step: o.step || 0.5, fallback: 21 };
};

// Ett bilkort på bilsiden: batteri → ladegrense, rekkevidde, lading/ferdig-tid, posisjon og lås,
// pluss én klimarad (inne nå, −/+ ønsket temperatur, på/av). Alt annet ligger i utvidet visning.
export default function VehicleCard({ vehicle, car, name, onCharger, ctl, settings = {}, selected, onOpen }) {
    const caps = vehicle.capabilitiesObj || {};
    const climateKind = climateKindOf(vehicle);
    const climateOn = climateKind != null && !!ctl.capOf(vehicle, 'vehicle_climate_on');
    const climateNA = !!caps.vehicle_climate_on?.unavailable;
    const target = ctl.capOf(vehicle, 'vehicle_climate_target');
    const inside = caps['measure_temperature.inside']?.value ?? caps.vehicle_climate_current?.value ?? null;
    const outside = caps['measure_temperature.outside']?.value ?? null;
    const asleep = car.awake === false;
    const driving = car.ignition === true || (car.speed != null && car.speed > 0);
    const lim = climateLimits(vehicle);
    // Kona (Pleos) rapporterer med minutters forsinkelse – vis når dataene er fra
    const reported = car.lastReported && !car.isCharging ? reportedText(car) : '';

    const tone = climateOn ? 'climate' : car.isCharging ? 'charging' : 'idle';
    const model = [car.make && car.model ? `${car.make} ${car.model}` : (car.model || car.make)].filter(Boolean)[0];
    const status = onCharger
        ? (car.isCharging ? 'Lader på laderen' : car.state === 'complete' ? 'Ferdigladet på laderen' : 'Står på laderen')
        : car.isCharging ? 'Lader' : locationText(car.location);

    // Linjen under batteriet: ferdig-tid når det lades, ellers bilens egen ladestatus
    let line;
    if (car.isCharging && car.timeToFull) {
        line = <><Clock size={13} /> {FINISH_LABEL[car.finishSource] || 'Ferdig'} {formatClock(car.timeToFull)}{formatUntil(car.timeToFull) ? ` (${formatUntil(car.timeToFull)})` : ''}
            {car.finishRemainingKwh != null && ` · ${car.finishRemainingKwh.toFixed(1)} kWh igjen`}
            {car.finishSource !== 'smart' && car.chargerPower > 0 && ` · ${(car.chargerPower / 1000).toFixed(1)} kW`}
            {car.finishSource === 'smart' && car.finishAmps != null && ` · ${Math.round(car.finishAmps)} A`}
            {car.finishSource === 'car' && car.chargeRate > 0 && ` · ${Math.round(car.chargeRate)} ${car.chargeRateUnit}`}</>;
    } else if (car.isCharging) {
        line = <><Zap size={13} /> Lader{car.chargerPower > 0 ? ` · ${(car.chargerPower / 1000).toFixed(1)} kW` : ''}</>;
    } else if (car.state === 'complete') {
        line = <><Zap size={13} /> Fulladet{car.energyAdded != null ? ` · +${Number(car.energyAdded).toFixed(1)} kWh` : ''}</>;
    } else if (car.scheduledCharging) {
        line = <><Clock size={13} /> Planlagt lading venter</>;
    } else if (driving) {
        line = <><Route size={13} /> Kjører{car.speed > 0 ? ` · ${Math.round(car.speed)} km/t` : ''}{reported ? ` · ${reported}` : ''}</>;
    } else if (asleep) {
        line = <><Moon size={13} /> Sover{car.cableConnected ? ' · kabel tilkoblet' : ''}{reported ? ` · ${reported}` : ''}</>;
    } else {
        line = <>{car.stateInfo?.text || (car.cableConnected ? 'Kabel tilkoblet' : 'Ikke tilkoblet')}{reported ? ` · ${reported}` : ''}</>;
    }

    return (
        <div
            className={`vp-car tone-${tone}${selected ? ' is-selected' : ''}`}
            role="button"
            tabIndex={0}
            onClick={onOpen}
            onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(); } }}
        >
            <div className="vp-car-head">
                <DeviceImage device={vehicle} tileSettings={{ heroImage: settings.productImages?.[vehicleKey(vehicle)] }} slot="best" size={40} badge className={`vp-badge tone-${tone}`} fallback={climateOn ? <Fan size={22} strokeWidth={1.8} /> : <Car size={22} strokeWidth={1.8} />} />
                <div className="vp-car-name">
                    <strong>{name}</strong>
                    <span>{[model, status].filter(Boolean).join(' · ')}</span>
                </div>
                <div className="vp-chips">
                    {car.location && !onCharger && <span className="vp-chip"><MapPin size={12} />{locationText(car.location)}</span>}
                    {car.locked === false && <span className="vp-chip is-warn"><Unlock size={12} />Ulåst</span>}
                    {car.locked === true && <span className="vp-chip"><Lock size={12} />Låst</span>}
                    {asleep && <span className="vp-chip"><Moon size={12} />Sover</span>}
                </div>
                <ChevronRight className="vp-chevron" size={18} />
            </div>

            <div className="vp-batt">
                <span className="vp-batt-big" title={car.batteryEstimated ? `Anslag – bilen meldte ${Math.round(car.batteryReported)} %` : undefined}>{car.battery != null ? `${car.batteryEstimated ? '≈ ' : ''}${Math.round(car.battery)} %` : '–'}</span>
                {car.limit != null && <span className="vp-batt-lim">→ {Math.round(ctl.capOf(vehicle, 'vehicle_charge_limit'))} %</span>}
                {car.range != null && <span className="vp-batt-range" title={car.rangeEstimated ? `Anslag – bilen meldte ${Math.round(car.rangeReported)} ${car.rangeUnit}` : undefined}>{car.rangeEstimated ? '≈ ' : ''}{Math.round(car.range)} {car.rangeUnit}</span>}
            </div>
            <BatteryBar battery={car.battery} limit={ctl.capOf(vehicle, 'vehicle_charge_limit')} charging={car.isCharging} />
            <div className={`vp-line${car.isCharging ? ' is-ok' : ''}`}>{line}</div>

            {climateKind != null && (
                <div className={`vp-cl${climateOn ? ' is-on' : ''}`} onClick={stop} onPointerDown={stop}>
                    <Thermometer size={18} className="vp-dim" />
                    <div className="vp-cl-text">
                        <strong>{inside != null ? `${fmt1(inside)}° inne` : climateOn ? 'Klima på' : 'Klima av'}</strong>
                        <span>
                            {climateNA ? 'Klima utilgjengelig'
                                : ctl.isPending(vehicle, 'vehicle_climate_on') ? (climateOn ? 'Starter – venter på bilen …' : 'Slår av – venter på bilen …')
                                : climateOn ? `Varmer til ${fmt1(target)}°`
                                : inside != null ? 'Klima av' : `Innstilt ${fmt1(target)}°`}
                            {outside != null && ` · ute ${fmt1(outside)}°`}
                            {climateKind === 'status' && ' · kun status'}
                        </span>
                    </div>
                    {climateKind === 'entity' && <div className="vp-cl-ctl">
                        <TempStepper
                            value={target}
                            step={lim.step}
                            min={lim.min}
                            max={lim.max}
                            pending={ctl.isPending(vehicle, 'vehicle_climate_target')}
                            disabled={climateNA}
                            onStep={(dir) => ctl.stepValue(vehicle, 'vehicle_climate_target', dir, lim)}
                        />
                        <button
                            type="button"
                            className={`vp-pw${climateOn ? ' is-on' : ''}${ctl.isPending(vehicle, 'vehicle_climate_on') ? ' is-pending' : ''}`}
                            disabled={climateNA}
                            aria-label={climateOn ? 'Slå av klima' : 'Slå på klima'}
                            title={climateOn ? 'Slå av klima' : 'Slå på klima'}
                            onClick={() => ctl.setCap(vehicle, 'vehicle_climate_on', !climateOn)}
                        ><Power size={18} /></button>
                    </div>}
                </div>
            )}
        </div>
    );
}
