import React from 'react';
import { Car, Clock, Moon, Lock, Unlock, MapPin, Thermometer, Power, Fan, ChevronRight, Zap } from 'lucide-react';
import TempStepper from '../TempStepper';
import { BatteryBar, fmt1, stop } from './shared';
import { climateKindOf, formatClock, formatUntil, locationText } from '../../services/vehicle';

// Klimagrenser (HA oppgir min/max/step på climate-entiteten; Tesla 15–28, trinn 0,5)
export const climateLimits = (v) => {
    const o = v?.capabilitiesOptions?.vehicle_climate_target || {};
    return { min: o.min ?? 15, max: o.max ?? 28, step: o.step || 0.5, fallback: 21 };
};

// Ett bilkort på bilsiden: batteri → ladegrense, rekkevidde, lading/ferdig-tid, posisjon og lås,
// pluss én klimarad (inne nå, −/+ ønsket temperatur, på/av). Alt annet ligger i utvidet visning.
export default function VehicleCard({ vehicle, car, name, onCharger, ctl, selected, onOpen }) {
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
    const status = onCharger
        ? (car.isCharging ? 'Lader på laderen' : car.state === 'complete' ? 'Ferdigladet på laderen' : 'Står på laderen')
        : car.isCharging ? 'Lader' : locationText(car.location);

    // Linjen under batteriet: ferdig-tid når det lades, ellers bilens egen ladestatus
    let line;
    if (car.isCharging && car.timeToFull) {
        line = <><Clock size={13} /> Ferdig {formatClock(car.timeToFull)}{formatUntil(car.timeToFull) ? ` (${formatUntil(car.timeToFull)})` : ''}
            {car.chargerPower > 0 && ` · ${(car.chargerPower / 1000).toFixed(1)} kW`}
            {car.chargeRate > 0 && ` · ${Math.round(car.chargeRate)} ${car.chargeRateUnit}`}</>;
    } else if (car.isCharging) {
        line = <><Zap size={13} /> Lader{car.chargerPower > 0 ? ` · ${(car.chargerPower / 1000).toFixed(1)} kW` : ''}</>;
    } else if (car.state === 'complete') {
        line = <><Zap size={13} /> Fulladet{car.energyAdded != null ? ` · +${Number(car.energyAdded).toFixed(1)} kWh` : ''}</>;
    } else if (car.scheduledCharging) {
        line = <><Clock size={13} /> Planlagt lading venter</>;
    } else if (asleep) {
        line = <><Moon size={13} /> Sover{car.cableConnected ? ' · kabel tilkoblet' : ''}</>;
    } else {
        line = <>{car.stateInfo?.text || (car.cableConnected ? 'Kabel tilkoblet' : 'Ikke tilkoblet')}</>;
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
                <div className={`vp-badge tone-${tone}`}>{climateOn ? <Fan size={22} strokeWidth={1.8} /> : <Car size={22} strokeWidth={1.8} />}</div>
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
                <span className="vp-batt-big">{car.battery != null ? `${Math.round(car.battery)} %` : '–'}</span>
                {car.limit != null && <span className="vp-batt-lim">→ {Math.round(ctl.capOf(vehicle, 'vehicle_charge_limit'))} %</span>}
                {car.range != null && <span className="vp-batt-range">{Math.round(car.range)} {car.rangeUnit}</span>}
            </div>
            <BatteryBar battery={car.battery} limit={ctl.capOf(vehicle, 'vehicle_charge_limit')} charging={car.isCharging} />
            <div className={`vp-line${car.isCharging ? ' is-ok' : ''}`}>{line}</div>

            {climateKind === 'entity' && (
                <div className={`vp-cl${climateOn ? ' is-on' : ''}`} onClick={stop} onPointerDown={stop}>
                    <Thermometer size={18} className="vp-dim" />
                    <div className="vp-cl-text">
                        <strong>{inside != null ? `${fmt1(inside)}° inne` : 'Kupé'}</strong>
                        <span>
                            {climateNA ? 'Klima utilgjengelig' : climateOn ? `Varmer til ${fmt1(target)}°` : 'Klima av'}
                            {outside != null && ` · ute ${fmt1(outside)}°`}
                        </span>
                    </div>
                    <div className="vp-cl-ctl">
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
                    </div>
                </div>
            )}
        </div>
    );
}
