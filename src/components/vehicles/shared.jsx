import React, { useState } from 'react';
import { Zap, SlidersHorizontal } from 'lucide-react';
import { CHARGER_PRESETS } from '../../services/vehicle';
import { OVERRIDE_LABEL, OVERRIDE_UNLESS_CRITICAL } from '../../services/load-manager';

// Felles småkomponenter for bilsiden (kort + utvidet visning)

export const fmt1 = (v) => (v == null || isNaN(v)) ? '–' : Number(v).toFixed(1).replace('.', ',');
export const fmt0 = (v) => (v == null || isNaN(v)) ? '–' : String(Math.round(Number(v)));
export const stop = (e) => e.stopPropagation();

// Batterilinje med markør for ladegrense
export const BatteryBar = ({ battery, limit, charging, large = false }) => (
    <div className={`vp-bar${large ? ' is-large' : ''}${charging ? ' is-charging' : ''}`}>
        <i style={{ width: `${Math.max(0, Math.min(100, battery ?? 0))}%` }} />
        {limit != null && <b style={{ left: `${Math.max(0, Math.min(100, limit))}%` }} title={`Ladegrense ${Math.round(limit)} %`} />}
    </div>
);

// Ladestrøm-velger (Stopp · 6 · 10 · 16 · 25 A). `value` = gjeldende grense, `pending` = sendt, ikke bekreftet.
export function AmpsPicker({ value, pending, disabled, onPick }) {
    const current = value == null ? null : Math.round(value);
    return (
        <div className={`vp-amps${pending ? ' is-pending' : ''}`} onClick={stop} onPointerDown={stop}>
            {CHARGER_PRESETS.map(a => (
                <button
                    key={a}
                    type="button"
                    disabled={disabled}
                    className={`${current === a ? 'is-on' : ''}${a === 0 ? ' is-stop' : ''}`}
                    onClick={() => onPick(a)}
                >{a === 0 ? 'Stopp' : `${a} A`}</button>
            ))}
        </div>
    );
}

// «Lad nå» / «Tilbake til automatikk» mot Strømstyring-integrasjonen. Overstyringen alene endrer
// ikke strømmen – laderen settes til 25 A i samme slengen. Optimistisk i maks 15 s.
export function useLoadManagerAction(api, charger, lm) {
    const [busy, setBusy] = useState(false);
    const [optimistic, setOptimistic] = useState(null);
    const override = (optimistic != null && lm?.override !== optimistic) ? optimistic : lm?.override;
    const active = !!override && override !== 'auto' && override !== 'unknown' && override !== 'unavailable';

    const set = async (mode) => {
        if (!lm || busy) return;
        setBusy(true);
        setOptimistic(mode);
        try {
            await api.setCapability(lm.overrideEntityId, 'select', mode);
            if (mode !== 'auto') await api.setCapability(charger.id, 'available_current_limit', CHARGER_PRESETS[CHARGER_PRESETS.length - 1]);
        } catch (err) {
            console.error('Strømstyring-overstyring feilet', err);
            setOptimistic(null);
        } finally {
            setBusy(false);
            setTimeout(() => setOptimistic(null), 15000);
        }
    };
    const toggle = () => set(active ? 'auto' : OVERRIDE_UNLESS_CRITICAL);
    return { override, active, busy, set, toggle };
}

export function LoadManagerRow({ lm, action, compact = false }) {
    if (!lm) return null;
    const sub = action.active
        ? (lm.critical ? 'Kritisk kapasitet – reduseres likevel' : 'Fredet fra tariffplanen')
        : [lm.stateText, lm.tariff ? `tariff ${lm.tariff}` : ''].filter(Boolean).join(' · ') || 'Lader etter tariffplanen';
    return (
        <div className={`vp-lm${action.active ? ' is-override' : ''}${lm.critical ? ' is-critical' : ''}`} onClick={stop} onPointerDown={stop}>
            <SlidersHorizontal size={15} className="vp-lm-icon" />
            <div className="vp-lm-text">
                <strong>Strømstyring <span className="vp-lm-badge">{OVERRIDE_LABEL[action.override] || action.override || 'Automatisk'}</span></strong>
                {!compact && <span>{sub}</span>}
            </div>
            <button type="button" className={`vp-lm-btn${action.active ? ' is-override' : ''}`} disabled={action.busy} onClick={action.toggle}>
                <Zap size={15} />
                {action.active ? 'Automatikk' : 'Lad nå'}
            </button>
        </div>
    );
}

// Segmentert velger (Av / Lav / Middels / Høy) – samme som bilflisen
const LEVEL_LABEL = { off: 'Av', low: 'Lav', medium: 'Middels', high: 'Høy' };
export const PRESET_LABEL = { off: 'Av', keep: 'Behold', dog: 'Hund', camp: 'Camp' };
export const SEAT_LABEL = {
    front_left: 'Fører', front_right: 'Passasjer',
    rear_left: 'Bak venstre', rear_center: 'Bak midten', rear_right: 'Bak høyre',
};
export const SEAT_ORDER = ['front_left', 'front_right', 'rear_left', 'rear_center', 'rear_right'];

export const LevelPicker = ({ value, options, onPick, pending, labels = LEVEL_LABEL }) => (
    <div className={`veh-seg${pending ? ' is-pending' : ''}`} onClick={stop} onPointerDown={stop}>
        {options.map(o => (
            <button
                key={o}
                type="button"
                className={`veh-seg-btn${value === o ? ' is-active' : ''}${o === 'off' ? ' is-off' : ''}`}
                onClick={() => onPick(o)}
            >{labels[o] || o}</button>
        ))}
    </div>
);

export const Toggle = ({ on, label, Icon, onToggle, pending }) => (
    <button
        type="button"
        className={`veh-toggle${on ? ' is-on' : ''}${pending ? ' is-pending' : ''}`}
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
    >
        {Icon && <Icon size={16} />}
        <span>{label}</span>
        <span className="veh-toggle-state">{on ? 'På' : 'Av'}</span>
    </button>
);

export const Group = ({ label, children }) => (
    <div className="climate-group">
        {label ? <label>{label}</label> : null}
        {children}
    </div>
);

// Statistikk-rutenett; utelates når ingen verdier finnes
export const Stats = ({ label, items }) => {
    const shown = items.filter(i => i.value != null && i.value !== '');
    if (shown.length === 0) return null;
    return (
        <Group label={label}>
            <div className="climate-stats">
                {shown.map(i => <div key={i.label}><span>{i.label}</span><b>{i.value}</b></div>)}
            </div>
        </Group>
    );
};
