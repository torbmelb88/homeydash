import React from 'react';
import { Zap, Plug, BatteryCharging, Lock, WifiOff, ChevronRight, Car } from 'lucide-react';
import { AmpsPicker, LoadManagerRow, fmt0, stop } from './shared';
import { formatClock } from '../../services/vehicle';
import { formatPower } from '../../services/climate';

const TONE_ICON = { charging: Zap, connected: Plug, done: BatteryCharging, idle: Plug };

// Lader-kortet øverst på bilsiden. Laderen er én felles ressurs for alle bilene, derfor
// ligger den for seg selv: status + effekt, hvilken bil som henger på, ladestrøm og Strømstyring.
export default function ChargerCard({ charger, summary: s, car, carName, lm, lmAction, ctl, settings, selected, onOpen }) {
    const Icon = TONE_ICON[s.tone] || Plug;
    const limit = ctl.capOf(charger, 'available_current_limit', s.limit);
    const limitPending = ctl.isPending(charger, 'available_current_limit', s.limit);

    const sub = [];
    if (car) {
        sub.push(`${carName} er tilkoblet`);
        if (car.timeToFull && car.isCharging) sub.push(`ferdig ${formatClock(car.timeToFull)}`);
    } else if (s.connected) {
        sub.push('Bil tilkoblet');
    } else if (s.lastSession != null && Number(s.lastSession) > 0) {
        sub.push(`forrige økt ${Number(s.lastSession).toFixed(1)} kWh`);
    } else {
        sub.push('Ingen bil tilkoblet');
    }
    if (s.charging && s.sessionEnergy != null) sub.push(`+${Number(s.sessionEnergy).toFixed(1)} kWh denne økta`);
    if (s.hasLimit && s.charging) sub.push(`${fmt0(limit)} A`);

    const title = s.charging ? `Lader · ${formatPower(s.power)}` : s.statusText;

    return (
        <div
            className={`vp-charger tone-${s.tone}${selected ? ' is-selected' : ''}`}
            role="button"
            tabIndex={0}
            onClick={onOpen}
            onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(); } }}
        >
            <div className="vp-ch-status">
                <div className={`vp-badge tone-${s.tone}`}><Icon size={22} strokeWidth={1.8} /></div>
                <div className="vp-ch-text">
                    <strong>{title}</strong>
                    <span>{sub.join(' · ')}</span>
                </div>
                <div className="vp-ch-icons">
                    {s.cableLocked && <Lock size={15} />}
                    {!s.online && <WifiOff size={15} className="vp-err" />}
                    {car && <Car size={15} />}
                </div>
                <ChevronRight className="vp-chevron" size={18} />
            </div>

            {s.isHA && s.hasLimit ? (
                <AmpsPicker
                    value={limit}
                    pending={limitPending}
                    disabled={!s.online}
                    onPick={(a) => ctl.setCap(charger, 'available_current_limit', a)}
                />
            ) : !s.isHA ? (
                <div className="vp-amps" onClick={stop}>
                    <button type="button" className={s.charging ? 'is-on is-stop' : 'is-on'} onClick={() => ctl.setCap(charger, 'charging_button', !s.charging)}>
                        <Zap size={15} /> {s.charging ? 'Stopp lading' : 'Start lading'}
                    </button>
                </div>
            ) : null}

            {settings.showLoadManager !== false && lm && <LoadManagerRow lm={lm} action={lmAction} />}
        </div>
    );
}
