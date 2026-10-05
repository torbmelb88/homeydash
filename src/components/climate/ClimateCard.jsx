import React from 'react';
import { Flame, Droplet, Power, Waves, WifiOff, ChevronRight } from 'lucide-react';
import TempStepper from '../TempStepper';
import { modeIcon } from './climateIcons';
import { climateStatus, formatPower, formatTemp, kindOf, limitsOf, powerCapOf } from '../../services/climate';

// Statusmerke: fylt + glød = jobber nå, ring = på men i ro, grått = av
export function ClimateBadge({ device, status, mode, large = false }) {
    const kind = kindOf(device);
    const icon = status.na ? WifiOff
        : kind === 'wh' ? Droplet
        : status.off ? Power
        : kind === 'floor' ? Waves
        : modeIcon(mode);
    return (
        <div className={`climate-badge tone-${status.tone} ${status.active ? 'is-active' : ''} ${large ? 'is-large' : ''}`}>
            {React.createElement(icon, { size: large ? 24 : 20, strokeWidth: 1.8 })}
        </div>
    );
}

// Ett kort på klimasiden. Venstre del (merke + navn) åpner utvidet visning; høyre del er
// −/+ (termostater), «Slå på» (av) eller fyllingsgrad + Boost (bereder).
export default function ClimateCard({ device, meter, name, ctl, settings, selected, onOpen }) {
    const kind = kindOf(device);
    const mode = ctl.capOf(device, 'thermostat_mode');
    const target = ctl.targetOf(device);
    const status = climateStatus(device, { mode, target, meter });
    const { min, max, step } = limitsOf(device, settings);
    const caps = device.capabilitiesObj || {};
    const current = caps.measure_temperature?.value;
    const power = powerCapOf(device, meter)?.value;

    let sub;
    if (status.na) sub = 'Utilgjengelig';
    else if (kind === 'wh') sub = <>{formatTemp(current)}°<span className="climate-card-status"> · {status.active && power > 10 ? `Varmer ${formatPower(power)}` : status.label}</span></>;
    else sub = <>{current != null ? `Nå ${formatTemp(current)}°` : ''}<span className="climate-card-status"> · {status.label}</span></>;

    let control = null;
    if (status.na) {
        control = null;
    } else if (kind === 'wh') {
        const fill = caps.fill_level?.value;
        const boost = !!ctl.capOf(device, 'boost');
        control = (
            <div className="climate-wh" onClick={(e) => e.stopPropagation()}>
                {fill != null && (
                    <div className="climate-wh-fill" title="Fyllingsgrad">
                        <strong>{Math.round(fill)}<small> %</small></strong>
                        <div className="climate-wh-bar"><i style={{ width: `${Math.min(100, Math.max(0, fill))}%` }} /></div>
                    </div>
                )}
                {device.capabilities?.includes('boost') && (
                    <button
                        type="button"
                        className={`climate-boost ${boost ? 'is-on' : ''}`}
                        onClick={() => ctl.setCap(device, 'boost', !boost)}
                        title={boost ? 'Slå av boost' : 'Boost: varm tanken helt opp nå'}
                    >
                        <Flame size={18} /> <span>Boost</span>
                    </button>
                )}
            </div>
        );
    } else if (status.off) {
        control = (
            <button type="button" className="climate-on-btn" onClick={(e) => { e.stopPropagation(); ctl.turnOn(device); }}>
                <Power size={16} /> Slå på
            </button>
        );
    } else {
        control = (
            <TempStepper
                value={target}
                step={step}
                min={min}
                max={max}
                pending={ctl.isPending(device)}
                onStep={(dir) => ctl.stepTarget(device, dir)}
            />
        );
    }

    return (
        <div
            className={`climate-card ${status.off ? 'is-off' : ''} ${status.na ? 'is-na' : ''} ${selected ? 'is-selected' : ''}`}
            role="button"
            tabIndex={0}
            onClick={onOpen}
            onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(); } }}
        >
            <ClimateBadge device={device} status={status} mode={mode} />
            <div className="climate-card-name">
                <strong>{name}</strong>
                <span>{sub}</span>
            </div>
            <ChevronRight className="climate-card-chevron" size={18} />
            <div className="climate-card-control">{control}</div>
        </div>
    );
}
