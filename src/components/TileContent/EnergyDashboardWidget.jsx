import React, { useState, useEffect, useRef } from 'react';
import { hassAPI } from '../../services/hass-api';
import { AlertTriangle, TrendingUp, Activity, Zap, ChevronRight, ArrowLeft, LayoutList, Sliders, Plus, Minus, Moon } from 'lucide-react';

const MONTH_NAMES = ['Januar','Februar','Mars','April','Mai','Juni','Juli','August','September','Oktober','November','Desember'];

const BAR_COLORS = [
    '#f97316','#3b82f6','#22c55e','#a855f7','#ec4899',
    '#06b6d4','#eab308','#ef4444','#84cc16','#f59e0b','#6366f1',
    '#0ea5e9','#d946ef','#10b981','#fb923c',
];

const PERIODS = [
    { id: 'today',      label: 'I dag' },
    { id: 'yesterday',  label: 'I går' },
    { id: 'monthly',    label: 'Denne mnd' },
    { id: 'ytd',        label: 'Hittil i år' },
    { id: 'prev_month', label: 'Forrige mnd' },
    { id: 'prev_year',  label: 'Forrige år' },
];

const HOUSE = {
    monthly:    { total: 'sensor.global_energy_cost_total_cost_monthly',    power: 'sensor.global_energy_cost_electricity_monthly',    grid: 'sensor.global_energy_cost_energy_tariff_monthly',    capacity: 'sensor.global_energy_cost_capacity_tier',               energy: 'sensor.global_energy_cost_total_consumption_monthly' },
    ytd:        { total: 'sensor.global_energy_cost_total_cost_ytd',        power: 'sensor.global_energy_cost_electricity_ytd',        grid: 'sensor.global_energy_cost_energy_tariff_ytd',        capacity: 'sensor.global_energy_cost_capacity_tariff_ytd',        energy: 'sensor.global_energy_cost_consumption_ytd' },
    prev_month: { total: 'sensor.global_energy_cost_total_cost_prev_month', power: 'sensor.global_energy_cost_electricity_prev_month', grid: 'sensor.global_energy_cost_energy_tariff_prev_month', capacity: 'sensor.global_energy_cost_capacity_tariff_prev_month', energy: 'sensor.global_energy_cost_consumption_prev_month' },
    prev_year:  { total: 'sensor.global_energy_cost_total_cost_prev_year',  power: 'sensor.global_energy_cost_electricity_prev_year',  grid: 'sensor.global_energy_cost_energy_tariff_prev_year',  capacity: 'sensor.global_energy_cost_capacity_tariff_prev_year', energy: 'sensor.global_energy_cost_consumption_prev_year' },
    // Kapasitetsleddet per dag er et estimat fra integrasjonen (attributt kapasitetsledd_estimat)
    today:      { total: 'sensor.global_energy_cost_total_cost_today',      power: 'sensor.global_energy_cost_electricity_today',      grid: 'sensor.global_energy_cost_energy_tariff_today',      capacity: 'sensor.global_energy_cost_capacity_tariff_today',     energy: 'sensor.global_energy_cost_consumption_today' },
    yesterday:  { total: 'sensor.global_energy_cost_total_cost_yesterday',  power: 'sensor.global_energy_cost_electricity_yesterday',  grid: 'sensor.global_energy_cost_energy_tariff_yesterday',  capacity: 'sensor.global_energy_cost_capacity_tariff_yesterday', energy: 'sensor.global_energy_cost_consumption_yesterday' },
};

// Nattsats-sensorene har samme suffiks for alle perioder (today/yesterday/monthly/prev_month/ytd/prev_year)
const HOUSE_NIGHT = (period) => ({
    share:    `sensor.global_energy_cost_night_share_${period}`,
    savings:  `sensor.global_energy_cost_night_savings_${period}`,
    nightKwh: `sensor.global_energy_cost_consumption_night_rate_${period}`,
    dayKwh:   `sensor.global_energy_cost_consumption_day_rate_${period}`,
});
const DEVICE_NIGHT = (prefix, period) => ({
    share:    `sensor.${prefix}_night_share_${period}`,
    savings:  `sensor.${prefix}_night_savings_${period}`,
    nightKwh: `sensor.${prefix}_energy_night_rate_${period}`,
});

const NIGHT_COLOR = '#6366f1';
const DAY_COLOR   = '#f59e0b';
const MONTH_SHORT = ['jan','feb','mar','apr','mai','jun','jul','aug','sep','okt','nov','des'];

// ── Strømstyring (load manager) ───────────────────────────────────────────────
const LM_STATE_PREFIX    = 'sensor.global_load_manager_';
const LM_OVERRIDE_PREFIX = 'select.global_load_manager_';
const LM_CAPACITY_EID    = 'number.global_load_manager_capacity_target';
const LM_MODE_EID        = 'sensor.global_load_manager_mode';
const LM_HEADROOM_EID    = 'sensor.global_load_manager_headroom';
const LM_TARIFF_EID      = 'sensor.global_load_manager_tariff';
// Husets effekt fra HAN-måleren – samme sensor som Strømstyring-integrasjonen styrer etter
// (`power_sensor` i integrasjonens oppsett). Kortet skjules når sensoren mangler.
const LM_POWER_EID       = 'sensor.tech_han_meter_power';

const MODE_STYLE = {
    normal:    { label: 'Normal',    color: '#22c55e' },
    reduserer: { label: 'Reduserer', color: '#f97316' },
    kritisk:   { label: 'Kritisk',   color: '#ef4444' },
    av:        { label: 'Av',        color: 'rgba(255,255,255,0.4)' },
};

const OVERRIDE_LABELS = {
    auto:                       'Automatisk',
    override:                   'Alltid på',
    override_unless_critical:   'På (unntatt kritisk)',
    override_til_tariffendring: 'På til tariffskifte',
};

function getStateStyle(state) {
    if (!state || state === 'normal') return { label: 'Normal', color: 'rgba(255,255,255,0.45)', bg: 'rgba(255,255,255,0.07)' };
    if (state === 'boost')           return { label: 'Boost',   color: '#3b82f6',               bg: 'rgba(59,130,246,0.15)' };
    if (state === 'av')              return { label: 'Av',      color: '#ef4444',               bg: 'rgba(239,68,68,0.15)' };
    if (state.startsWith('redusert_')) {
        const n = state.replace('redusert_', '');
        return { label: `Redusert ×${n}`, color: '#f97316', bg: 'rgba(249,115,22,0.15)' };
    }
    return { label: state, color: '#a855f7', bg: 'rgba(168,85,247,0.15)' };
}

// ── Hjelpere ──────────────────────────────────────────────────────────────────
const getVal = (eid) => {
    const e = hassAPI.entities?.[eid];
    if (!e || e.state === 'unavailable' || e.state === 'unknown') return null;
    const n = parseFloat(e.state);
    return isNaN(n) ? null : n;
};
const getStr = (eid) => {
    const e = hassAPI.entities?.[eid];
    if (!e || e.state === 'unavailable' || e.state === 'unknown') return null;
    return e.state;
};

const getAttrs = (eid) => hassAPI.entities?.[eid]?.attributes || {};

const fmt    = (val, dec = 2) => (val === null || val === undefined) ? '–' : val.toFixed(dec);
const fmtPct = (val) => (val === null || val === undefined) ? '–' : `${Math.round(val)} %`;
const fmtKwh = (val) => (val === null || val === undefined) ? '–' : `${val >= 100 ? Math.round(val) : val.toFixed(1)} kWh`;

// Kapasitetsledd per dag er et estimat (integrasjonen flagger det med estimat/kapasitetsledd_estimat).
// Månedens tall er også flagget (trinnet er ikke endelig før måneden er over), men vises som før –
// «≈» brukes bare i dagsperiodene, der fordelingen per dag er et rent anslag.
const DAY_PERIODS = new Set(['today', 'yesterday']);
const isEstimate = (eid, period) => {
    if (!DAY_PERIODS.has(period)) return false;
    const a = getAttrs(eid);
    return a.estimat === true || a.kapasitetsledd_estimat === true;
};
const fmtKr = (val, eid, period) => val === null ? '–' : `${isEstimate(eid, period) ? '≈ ' : ''}${fmt(val)} kr`;

// Nattsats-sensorene dekker bare fra en viss måned (attributt dekker_fra: «2026-09»).
// Returnerer «fra sep.» når dekningen starter etter periodens start, ellers ''.
const coverageNote = (eid, period) => {
    const from = getAttrs(eid).dekker_fra;
    if (!from || !/^\d{4}-\d{2}$/.test(from)) return '';
    const now = new Date();
    let start;
    if (period === 'ytd')             start = `${now.getFullYear()}-01`;
    else if (period === 'prev_year')  start = `${now.getFullYear() - 1}-01`;
    else if (period === 'prev_month') { const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; }
    else                              start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (from <= start) return '';
    const [y, m] = from.split('-').map(Number);
    return y === now.getFullYear() ? `fra ${MONTH_SHORT[m - 1]}.` : `fra ${MONTH_SHORT[m - 1]}. ${y}`;
};
const tog    = (cfg, key, def = true) => cfg?.[key] !== undefined ? cfg[key] : def;

function resolveDeviceEntities(dev, period) {
    if (dev.entities?.[period]) return dev.entities[period];
    if (period === 'monthly') {
        return {
            energy:   dev.entityEnergy       || `sensor.${dev.prefix}_energy_monthly`,
            power:    dev.entityPowerCost    || `sensor.${dev.prefix}_power_cost_monthly`,
            grid:     dev.entityGridTariff   || `sensor.${dev.prefix}_grid_tariff_monthly`,
            capacity: dev.entityCapacityCost || `sensor.${dev.prefix}_capacity_cost_monthly`,
            total:    dev.entityTotal        || `sensor.${dev.prefix}_total_cost_monthly`,
        };
    }
    return {
        energy:   `sensor.${dev.prefix}_energy_${period}`,
        power:    `sensor.${dev.prefix}_power_cost_${period}`,
        grid:     `sensor.${dev.prefix}_grid_tariff_${period}`,
        capacity: `sensor.${dev.prefix}_capacity_cost_${period}`,
        total:    `sensor.${dev.prefix}_total_cost_${period}`,
    };
}

// ── Delkomponenter ────────────────────────────────────────────────────────────
function PeriodSelector({ period, onChange }) {
    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 4 }}>
            {PERIODS.map(p => (
                <button key={p.id} onClick={() => onChange(p.id)} style={{
                    padding: '5px 2px',
                    background: period === p.id ? 'rgba(59,130,246,0.35)' : 'rgba(255,255,255,0.05)',
                    border: period === p.id ? '1px solid rgba(59,130,246,0.6)' : '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6, color: 'var(--text-primary, #fff)', cursor: 'pointer',
                    fontSize: '0.65rem', fontFamily: 'inherit',
                    fontWeight: period === p.id ? 600 : 400,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                    {p.label}
                </button>
            ))}
        </div>
    );
}

function StatCard({ label, value, sub, accent, alert }) {
    return (
        <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: '9px 10px', borderLeft: `3px solid ${accent}`, minWidth: 0 }}>
            <div style={{ fontSize: '0.58rem', opacity: 0.45, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {alert && <AlertTriangle size={8} style={{ color: '#ef4444', marginRight: 3, verticalAlign: 'middle' }} />}
                {label}
            </div>
            <div style={{ fontSize: '0.88rem', fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
            {/* sub = '' beholder linjen (tom) så kortene ikke skifter høyde når teksten mangler */}
            {sub !== undefined && <div style={{ fontSize: '0.62rem', opacity: 0.5, marginTop: 2, lineHeight: 1.3, minHeight: '1.3em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub || ' '}</div>}
        </div>
    );
}

// Tynn todelt linje: andel på nattsats (blå) mot dagsats (gul)
function NightSplitBar({ share, height = 5 }) {
    if (share === null || share === undefined) return null;
    const pct = Math.max(0, Math.min(100, share));
    return (
        <div style={{ height, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden', display: 'flex' }}>
            <div style={{ width: `${pct}%`, background: NIGHT_COLOR, transition: 'width 0.6s ease' }} />
            <div style={{ width: `${100 - pct}%`, background: DAY_COLOR, opacity: 0.8, transition: 'width 0.6s ease' }} />
        </div>
    );
}

function DetailPair({ label, value, color }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <span style={{ fontSize: '0.58rem', opacity: 0.4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 500, color: color || 'inherit' }}>{value}</span>
        </div>
    );
}

function CustomSelect({ value, options, labels, onChange }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    return (
        <div ref={ref} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
            <button
                onClick={() => setOpen(o => !o)}
                style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 6, color: 'var(--text-primary, #fff)', fontSize: '0.68rem',
                    padding: '4px 8px', fontFamily: 'inherit', cursor: 'pointer', gap: 6,
                }}
            >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {labels[value] || value}
                </span>
                <span style={{ opacity: 0.5, flexShrink: 0, fontSize: '0.55rem' }}>▾</span>
            </button>
            {open && (
                <div style={{
                    position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 2,
                    background: '#1e2433', border: '1px solid rgba(255,255,255,0.18)',
                    borderRadius: 7, overflow: 'hidden', zIndex: 100,
                    boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
                }}>
                    {options.map(opt => (
                        <button
                            key={opt}
                            onClick={() => { onChange(opt); setOpen(false); }}
                            style={{
                                display: 'block', width: '100%', textAlign: 'left',
                                padding: '7px 10px', background: opt === value ? 'rgba(59,130,246,0.25)' : 'transparent',
                                border: 'none', color: opt === value ? '#93c5fd' : 'var(--text-primary, #fff)',
                                fontSize: '0.68rem', fontFamily: 'inherit', cursor: 'pointer',
                                borderBottom: '1px solid rgba(255,255,255,0.06)',
                            }}
                        >
                            {labels[opt] || opt}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function StateBadge({ state }) {
    const st = getStateStyle(state);
    return (
        <span style={{
            fontSize: '0.62rem', fontWeight: 600, padding: '2px 8px',
            borderRadius: 4, background: st.bg, color: st.color,
            letterSpacing: '0.02em', whiteSpace: 'nowrap', flexShrink: 0,
        }}>
            {st.label}
        </span>
    );
}

// ── Hovedkomponent ────────────────────────────────────────────────────────────
export default function EnergyDashboardWidget({ tile, onContentUpdate }) {
    const [tick,            setTick]            = useState(0);
    const [view,            setView]            = useState('main');
    const [period,          setPeriod]          = useState('monthly');
    // Periodevalget finnes bare i detaljvisningen; hovedvisningen er alltid «denne måneden»
    // (ellers endret flishøyden seg ved periodebytte)
    useEffect(() => { if (view === 'main') setPeriod('monthly'); }, [view]);
    const [capacityTarget,  setCapacityTarget]  = useState(null);
    const rootRef = useRef(null);

    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 10000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        if (!onContentUpdate || !rootRef.current) return;
        const t = setTimeout(() => {
            if (rootRef.current) onContentUpdate(rootRef.current.scrollHeight);
        }, 30);
        return () => clearTimeout(t);
    }, [view]);

    // Smal widget (flis) → statuskortene i Strømstyring legges 2×2 i stedet for fire på rad.
    // Observatøren bindes på nytt per visning fordi hver visning har sin egen rot-div.
    const [narrow, setNarrow] = useState(false);
    useEffect(() => {
        const el = rootRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(entries => {
            const w = entries[0]?.contentRect?.width;
            if (w > 0) setNarrow(w < 500);
        });
        ro.observe(el);
        return () => ro.disconnect();
    }, [view]);

    // Synkroniser kapasitetsmål fra HA når man åpner strømstyring-visning
    useEffect(() => {
        if (view === 'loadmgr') {
            const val = getVal(LM_CAPACITY_EID);
            if (val !== null) setCapacityTarget(val);
        }
    }, [view, tick]);

    const cfg               = tile.settings || {};
    const devices           = cfg.devices || [];
    const devicePowerEntities = cfg.devicePowerEntities || {};
    const showLoadMgr       = tog(cfg, 'showLoadMgr', true);

    const showPriceCard    = tog(cfg, 'showPriceCard');
    const showTodayCard    = tog(cfg, 'showTodayCard');
    const showNightRow     = tog(cfg, 'showNightRow');
    const showNightInBars  = tog(cfg, 'showNightInBars');
    const showColNightShare   = tog(cfg, 'showColNightShare');
    const showColNightSavings = tog(cfg, 'showColNightSavings');
    const showCapacityCard = tog(cfg, 'showCapacityCard');
    const showPeakCard     = tog(cfg, 'showPeakCard');
    const showTrackedCard  = tog(cfg, 'showTrackedCard');
    const showEstimateCard = tog(cfg, 'showEstimateCard');
    const showPeaksRow    = tog(cfg, 'showPeaksRow');
    const showBarChart     = tog(cfg, 'showBarChart');
    const showTable        = tog(cfg, 'showTable');
    const showColEnergy    = tog(cfg, 'showColEnergy');
    const showColPower     = tog(cfg, 'showColPower');
    const showColGrid      = tog(cfg, 'showColGrid');
    const showColCapacity  = tog(cfg, 'showColCapacity');

    const now       = new Date();
    const monthName = MONTH_NAMES[now.getMonth()];

    // Kostnad/energi-data
    const effectivePrice  = getVal('sensor.global_energy_cost_effective_price');
    const tariffState     = getStr('sensor.global_energy_cost_tariff');
    const capacityEntity  = hassAPI.entities?.['sensor.global_energy_cost_capacity_tier'];
    const peakAvg         = getVal('sensor.global_energy_cost_peak_avg');
    const marginNextTier  = getVal('sensor.global_energy_cost_margin_next_tier');
    const capacityAlert   = hassAPI.entities?.['sensor.global_energy_cost_capacity_alert']?.state === 'on';
    const peak1           = getVal('sensor.global_energy_cost_peak_1');
    const peak2           = getVal('sensor.global_energy_cost_peak_2');
    const peak3           = getVal('sensor.global_energy_cost_peak_3');
    const peak1Attrs      = hassAPI.entities?.['sensor.global_energy_cost_peak_1']?.attributes || {};
    const peak2Attrs      = hassAPI.entities?.['sensor.global_energy_cost_peak_2']?.attributes || {};
    const peak3Attrs      = hassAPI.entities?.['sensor.global_energy_cost_peak_3']?.attributes || {};
    const capacityAttrs   = capacityEntity?.attributes || {};
    const capacityCostVal = parseFloat(capacityEntity?.state) || null;
    const monthEstimate      = getVal('sensor.global_energy_cost_total_cost_month_estimate');
    const monthEstimateAttrs = hassAPI.entities?.['sensor.global_energy_cost_total_cost_month_estimate']?.attributes || {};
    const monthEstimateSub   = monthEstimateAttrs.rest_kr != null ? `+${fmt(monthEstimateAttrs.rest_kr)} kr igjen` : '';
    const tariffLabel     = tariffState === 'dag' ? '☀ Dag' : tariffState === 'natt' ? '🌙 Natt' : tariffState || '–';

    const deviceData = devices.map((dev, i) => {
        const eids     = resolveDeviceEntities(dev, period);
        const night    = DEVICE_NIGHT(dev.prefix, period);
        const nightNow = DEVICE_NIGHT(dev.prefix, 'monthly'); // søylene i hovedvisningen er alltid «denne måneden»
        const powerEid = devicePowerEntities[dev.prefix];
        return {
            ...dev,
            color:        BAR_COLORS[i % BAR_COLORS.length],
            energy:       getVal(eids.energy),
            power:        getVal(eids.power),
            grid:         getVal(eids.grid),
            capacity:     getVal(eids.capacity),
            capacityEid:  eids.capacity,
            total:        getVal(eids.total),
            nightShare:   getVal(night.share),
            nightSavings: getVal(night.savings),
            nightKwh:     getVal(night.nightKwh),
            nightShareMonthly: getVal(nightNow.share),
            livePower:    powerEid ? getVal(powerEid) : undefined,
        };
    }).sort((a, b) => (b.total ?? -Infinity) - (a.total ?? -Infinity));

    const maxCost   = Math.max(...deviceData.map(d => d.total ?? 0), 0.01);
    const sumTotal  = deviceData.reduce((s, d) => s + (d.total    ?? 0), 0);
    const sumEnergy = deviceData.reduce((s, d) => s + (d.energy   ?? 0), 0);
    const sumPower  = deviceData.reduce((s, d) => s + (d.power    ?? 0), 0);
    const sumGrid   = deviceData.reduce((s, d) => s + (d.grid     ?? 0), 0);
    const sumCap    = deviceData.reduce((s, d) => s + (d.capacity ?? 0), 0);

    const houseEids    = HOUSE[period];
    const houseTotal   = getVal(houseEids.total);
    const houseEnergy  = getVal(houseEids.energy);
    const housePower   = getVal(houseEids.power);
    const houseGrid    = getVal(houseEids.grid);
    const houseCapacity= getVal(houseEids.capacity);
    const houseNightEids    = HOUSE_NIGHT(period);
    const houseNightShare   = getVal(houseNightEids.share);
    const houseNightSavings = getVal(houseNightEids.savings);
    const houseNightKwh     = getVal(houseNightEids.nightKwh);
    const houseDayKwh       = getVal(houseNightEids.dayKwh);
    const houseNightNote    = coverageNote(houseNightEids.share, period);

    // Hovedvisningen: i dag / i går og nattandel denne måneden
    const todayTotal     = getVal(HOUSE.today.total);
    const todayEnergy    = getVal(HOUSE.today.energy);
    const yesterdayTotal = getVal(HOUSE.yesterday.total);
    const monthNight     = HOUSE_NIGHT('monthly');
    const monthNightShare   = getVal(monthNight.share);
    const monthNightSavings = getVal(monthNight.savings);
    const monthNightKwh     = getVal(monthNight.nightKwh);
    const monthDayKwh       = getVal(monthNight.dayKwh);

    // Hent live modus for badge i navigasjonsknapper (felles for alle visninger)
    const lmModeLive  = getStr(LM_MODE_EID);
    const lmModeStyle = MODE_STYLE[lmModeLive] || null;

    // ── Strømstyring – hjelper for kapasitetsjustering ────────────────────────
    const adjustCapacity = (delta) => {
        const cap = hassAPI.entities?.[LM_CAPACITY_EID];
        if (!cap) return;
        const min     = cap.attributes?.min  ?? 1;
        const max     = cap.attributes?.max  ?? 20;
        const step    = cap.attributes?.step ?? 0.5;
        const current = parseFloat(cap.state) || (capacityTarget ?? 5);
        const raw     = current + delta;
        const newVal  = Math.min(max, Math.max(min, Math.round(raw / step) * step));
        setCapacityTarget(newVal);
        hassAPI.callService('number', 'set_value', LM_CAPACITY_EID, { value: String(newVal) });
    };

    const setOverride = (overrideEid, option) => {
        hassAPI.callService('select', 'select_option', overrideEid, { option });
    };

    // ── Strømstyring-visning ──────────────────────────────────────────────────
    if (view === 'loadmgr') {
        const lmMode     = getStr(LM_MODE_EID);
        const lmHeadroom = getVal(LM_HEADROOM_EID);
        const lmTariff   = getStr(LM_TARIFF_EID);
        const lmPower    = getVal(LM_POWER_EID);
        const capTarget  = capacityTarget ?? getVal(LM_CAPACITY_EID);
        // Farge etter hvor nær kapasitetsmålet forbruket ligger: grønn < 90 %, oransje ≥ 90 %, rød over målet
        const capTargetW = capTarget !== null ? capTarget * 1000 : null;
        const lmPowerAccent = lmPower === null || capTargetW === null ? '#8b5cf6'
            : lmPower > capTargetW        ? '#ef4444'
            : lmPower > capTargetW * 0.9  ? '#f97316'
            : '#22c55e';
        const capAttrs   = hassAPI.entities?.[LM_CAPACITY_EID]?.attributes || {};
        const modeStyle  = MODE_STYLE[lmMode] || { label: lmMode || '–', color: 'rgba(255,255,255,0.4)' };
        const lmTariffLabel = lmTariff === 'dag' ? '☀ Dag' : lmTariff === 'natt' ? '🌙 Natt' : lmTariff || '–';

        // Finn alle styr-enheter dynamisk fra HA
        const lmDevices = Object.entries(hassAPI.entities || {})
            .filter(([eid]) => eid.startsWith(LM_STATE_PREFIX) && eid.endsWith('_state'))
            .map(([eid, entity]) => {
                const key         = eid.slice(LM_STATE_PREFIX.length, -'_state'.length);
                const overrideEid = `${LM_OVERRIDE_PREFIX}${key}_override`;
                const overrideEnt = hassAPI.entities?.[overrideEid];
                return {
                    key,
                    eid,
                    overrideEid,
                    name:           (entity.attributes?.friendly_name || key).replace('Strømstyring ', ''),
                    state:          entity.state,
                    priority:       entity.attributes?.prioritet ?? 0,
                    peakW:          entity.attributes?.observert_toppeffekt_w ?? null,
                    override:       overrideEnt?.state || 'auto',
                    overrideOptions: overrideEnt?.attributes?.options || ['auto', 'override', 'override_unless_critical', 'override_til_tariffendring'],
                };
            })
            .sort((a, b) => a.priority - b.priority);

        return (
            <div ref={rootRef} style={s.root}>
                {/* Tittelrad */}
                <div style={s.titleRow}>
                    <button onClick={() => setView('main')} style={s.backBtn}>
                        <ArrowLeft size={13} /><span>Tilbake</span>
                    </button>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, opacity: 0.8 }}>Strømstyring</span>
                    <span style={s.timestamp}>{now.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>

                {/* Statusbanner – fire kort på én rad, 2×2 i smal widget */}
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${narrow && lmPower !== null ? 2 : lmPower !== null ? 4 : 3}, 1fr)`, gap: 6 }}>
                    <StatCard label="Modus"        value={modeStyle.label} accent={modeStyle.color} />
                    {lmPower !== null && (
                        <StatCard label="Forbruk nå" value={`${Math.round(lmPower).toLocaleString('nb-NO')} W`} accent={lmPowerAccent} />
                    )}
                    <StatCard label="Tilgjengelig" value={lmHeadroom !== null ? `${Math.round(lmHeadroom)} W` : '–'} accent="#3b82f6" />
                    <StatCard label="Tariff"       value={lmTariffLabel} accent="#f59e0b" />
                </div>

                {/* Kapasitetsmål */}
                <div style={{ ...s.detailCard, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                        <div style={{ fontSize: '0.58rem', opacity: 0.45, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 2 }}>Kapasitetsmål</div>
                        <div style={{ fontSize: '0.7rem', opacity: 0.4 }}>
                            {capAttrs.min ?? 1}–{capAttrs.max ?? 20} kW, steg {capAttrs.step ?? 0.5}
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <button onClick={() => adjustCapacity(-(capAttrs.step ?? 0.5))} style={s.adjBtn}><Minus size={12} /></button>
                        <span style={{ fontWeight: 700, fontSize: '1rem', minWidth: 52, textAlign: 'center' }}>
                            {capTarget !== null ? `${capTarget.toString().replace('.', ',')} kW` : '–'}
                        </span>
                        <button onClick={() => adjustCapacity(capAttrs.step ?? 0.5)} style={s.adjBtn}><Plus size={12} /></button>
                    </div>
                </div>

                {/* Enhetsliste */}
                <div style={{ fontSize: '0.6rem', opacity: 0.4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Styrte enheter — sortert etter prioritet
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {lmDevices.map(dev => (
                        <div key={dev.key} style={s.detailCard}>
                            {/* Rad 1: navn + tilstand */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                        width: 18, height: 18, borderRadius: '50%',
                                        background: 'rgba(255,255,255,0.08)',
                                        fontSize: '0.55rem', fontWeight: 700, flexShrink: 0, opacity: 0.6,
                                    }}>{dev.priority}</span>
                                    <span style={{ fontWeight: 600, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {dev.name}
                                    </span>
                                </div>
                                <StateBadge state={dev.state} />
                            </div>
                            {/* Rad 2: overstyring + toppeffekt */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                <CustomSelect
                                    value={dev.override}
                                    options={dev.overrideOptions}
                                    labels={OVERRIDE_LABELS}
                                    onChange={opt => setOverride(dev.overrideEid, opt)}
                                />
                                {dev.peakW !== null && (
                                    <span style={{ fontSize: '0.68rem', opacity: 0.45, flexShrink: 0, whiteSpace: 'nowrap' }}>
                                        topp {Math.round(dev.peakW)} W
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                    {lmDevices.length === 0 && (
                        <div style={{ textAlign: 'center', opacity: 0.35, padding: '16px 0', fontSize: '0.75rem' }}>
                            Ingen styrte enheter funnet
                        </div>
                    )}
                </div>

                {showTable && devices.length > 0 && (
                    <button onClick={() => setView('detail')} style={s.navBtn}>
                        <LayoutList size={13} />
                        <span>Detaljert oversikt</span>
                        <ChevronRight size={13} style={{ marginLeft: 'auto' }} />
                    </button>
                )}
            </div>
        );
    }

    // ── Detaljvisning ─────────────────────────────────────────────────────────
    if (view === 'detail') {
        return (
            <div ref={rootRef} style={s.root}>
                <div style={s.titleRow}>
                    <button onClick={() => setView('main')} style={s.backBtn}>
                        <ArrowLeft size={13} /><span>Tilbake</span>
                    </button>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, opacity: 0.8 }}>Detaljert oversikt</span>
                    <span style={s.timestamp}>{now.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>

                <PeriodSelector period={period} onChange={setPeriod} />

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {deviceData.map(dev => (
                        <div key={dev.prefix} style={s.detailCard}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: dev.color, flexShrink: 0 }} />
                                    <span style={{ fontWeight: 600, fontSize: '0.82rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dev.name}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexShrink: 0, marginLeft: 8 }}>
                                    {dev.livePower !== undefined && (
                                        <span style={{ fontSize: '0.75rem', opacity: 0.6, fontWeight: 500 }}>
                                            {dev.livePower !== null ? `${Math.round(dev.livePower)} W` : '– W'}
                                        </span>
                                    )}
                                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{fmt(dev.total)} kr</span>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '4px 10px' }}>
                                {showColEnergy   && <DetailPair label="Forbruk"    value={dev.energy   !== null ? `${fmt(dev.energy, 2)} kWh` : '–'} />}
                                {showColPower    && <DetailPair label="Strøm"      value={dev.power    !== null ? `${fmt(dev.power)} kr` : '–'} />}
                                {showColGrid     && <DetailPair label="Energiledd" value={dev.grid     !== null ? `${fmt(dev.grid)} kr` : '–'} />}
                                {showColCapacity && <DetailPair label="Kapasitet"  value={fmtKr(dev.capacity, dev.capacityEid, period)} />}
                                {showColNightShare   && <DetailPair label="Nattandel"  value={fmtPct(dev.nightShare)} />}
                                {showColNightSavings && <DetailPair label="Spart natt" value={dev.nightSavings !== null ? `${fmt(dev.nightSavings)} kr` : '–'} />}
                            </div>
                            {showColNightShare && dev.nightShare !== null && (
                                <div style={{ marginTop: 6 }}><NightSplitBar share={dev.nightShare} /></div>
                            )}
                        </div>
                    ))}

                    {deviceData.length > 0 && (
                        <div style={{ ...s.detailCard, background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.12)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                <span style={{ fontWeight: 600, fontSize: '0.78rem', opacity: 0.65 }}>Sporede enheter</span>
                                <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{fmt(sumTotal)} kr</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '4px 10px' }}>
                                {showColEnergy   && <DetailPair label="Forbruk"    value={`${fmt(sumEnergy, 2)} kWh`} />}
                                {showColPower    && <DetailPair label="Strøm"      value={`${fmt(sumPower)} kr`} />}
                                {showColGrid     && <DetailPair label="Energiledd" value={`${fmt(sumGrid)} kr`} />}
                                {showColCapacity && <DetailPair label="Kapasitet"  value={`${fmt(sumCap)} kr`} />}
                            </div>
                        </div>
                    )}

                    {houseTotal !== null && (
                        <div style={{ ...s.detailCard, borderColor: 'rgba(245,158,11,0.35)', background: 'rgba(245,158,11,0.06)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                <span style={{ fontWeight: 700, fontSize: '0.82rem', color: '#f59e0b' }}>Hele huset</span>
                                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#f59e0b' }}>{fmt(houseTotal)} kr</span>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '4px 10px' }}>
                                {showColEnergy   && <DetailPair label="Forbruk"    value={houseEnergy   !== null ? `${fmt(houseEnergy, 2)} kWh` : '–'} color="#f59e0b" />}
                                {showColPower    && <DetailPair label="Strøm"      value={housePower    !== null ? `${fmt(housePower)} kr` : '–'} color="#f59e0b" />}
                                {showColGrid     && <DetailPair label="Energiledd" value={houseGrid     !== null ? `${fmt(houseGrid)} kr` : '–'} color="#f59e0b" />}
                                {showColCapacity && <DetailPair label="Kapasitet"  value={fmtKr(houseCapacity, houseEids.capacity, period)} color="#f59e0b" />}
                                {showColNightShare   && <DetailPair label="Nattandel"  value={houseNightShare !== null ? `${fmtPct(houseNightShare)}${houseNightNote ? ` (${houseNightNote})` : ''}` : '–'} color="#f59e0b" />}
                                {showColNightSavings && <DetailPair label="Spart natt" value={houseNightSavings !== null ? `${fmt(houseNightSavings)} kr` : '–'} color="#f59e0b" />}
                            </div>
                            {showColNightShare && houseNightShare !== null && (
                                <div style={{ marginTop: 6 }}><NightSplitBar share={houseNightShare} /></div>
                            )}
                            {showEstimateCard && period === 'monthly' && monthEstimate !== null && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8, paddingTop: 6, borderTop: '1px solid rgba(245,158,11,0.2)', fontSize: '0.75rem' }}>
                                    <span style={{ opacity: 0.7 }}>Estimert hele {monthName.toLowerCase()}{monthEstimateAttrs.grunnlag ? ` (${monthEstimateAttrs.grunnlag})` : ''}</span>
                                    <span style={{ fontWeight: 700, color: '#f59e0b' }}>≈ {fmt(monthEstimate)} kr</span>
                                </div>
                            )}
                            {(sumTotal > 0 || (showColNightShare && houseNightKwh !== null) || (showColCapacity && isEstimate(houseEids.capacity, period))) && (
                                <div style={{ fontSize: '0.65rem', opacity: 0.45, marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: '2px 10px' }}>
                                    {showColNightShare && houseNightKwh !== null && <span>{fmtKwh(houseNightKwh)} natt · {fmtKwh(houseDayKwh)} dag</span>}
                                    {sumTotal > 0 && houseTotal > 0 && <span>{((sumTotal / houseTotal) * 100).toFixed(0)} % av totalen sporet</span>}
                                    {showColCapacity && isEstimate(houseEids.capacity, period) && <span>≈ kapasitetsledd er estimert per dag</span>}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {showLoadMgr && (
                    <button onClick={() => setView('loadmgr')} style={s.navBtn}>
                        <Sliders size={13} />
                        <span>Strømstyring</span>
                        {lmModeStyle && (
                            <span style={{ marginLeft: 'auto', fontSize: '0.6rem', fontWeight: 700, color: lmModeStyle.color, whiteSpace: 'nowrap' }}>
                                {lmModeStyle.label}
                            </span>
                        )}
                    </button>
                )}
            </div>
        );
    }

    // ── Hovedvisning ──────────────────────────────────────────────────────────
    const visibleCardCount = [showPriceCard, showTodayCard, showCapacityCard, showPeakCard, showTrackedCard, showEstimateCard].filter(Boolean).length;
    const todaySub = [
        todayEnergy !== null ? fmtKwh(todayEnergy) : null,
        yesterdayTotal !== null ? `i går ${fmt(yesterdayTotal)} kr` : null,
    ].filter(Boolean).join(' · ');

    return (
        <div ref={rootRef} style={s.root}>
            {/* Tittelrad */}
            <div style={s.titleRow}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                    <Activity size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
                    <span style={{ ...s.title, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Strøm &amp; kostnad – {monthName} {now.getFullYear()}</span>
                </div>
                <span style={s.timestamp}>{now.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>

            {/* Infokort */}
            {visibleCardCount > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                    {showPriceCard    && <StatCard label="Effektiv pris"   value={effectivePrice !== null ? `${effectivePrice.toFixed(3)} kr/kWh` : '–'} sub={tariffLabel} accent="#f59e0b" />}
                    {showTodayCard    && <StatCard label="I dag"           value={todayTotal !== null ? `${fmt(todayTotal)} kr` : '–'} sub={todaySub} accent="#22c55e" />}
                    {showCapacityCard && <StatCard label={`Trinn ${capacityAttrs.trinn ?? '?'}`} value={capacityCostVal !== null ? `${capacityCostVal} kr/mnd` : '–'} sub={capacityAttrs.intervall || ''} accent={capacityAlert ? '#ef4444' : '#22c55e'} alert={capacityAlert} />}
                    {showPeakCard     && <StatCard label="Snitt topp"      value={peakAvg !== null ? `${peakAvg.toFixed(2)} kW` : '–'} sub={marginNextTier !== null ? `Margin: ${marginNextTier.toFixed(2)} kW` : ''} accent={capacityAlert ? '#f97316' : '#3b82f6'} />}
                    {showTrackedCard  && <StatCard label="Totalkostnad"    value={houseTotal !== null ? `${fmt(houseTotal)} kr` : `${fmt(sumTotal)} kr`} sub={devices.length > 0 && sumTotal > 0 ? `Sporet: ${fmt(sumTotal)} kr` : ''} accent="#8b5cf6" />}
                    {showEstimateCard && <StatCard label="Estimert mnd" value={monthEstimate !== null ? `${fmt(monthEstimate)} kr` : '–'} sub={monthEstimateSub} accent="#ec4899" />}
                </div>
            )}

            {/* Nattandel denne måneden */}
            {showNightRow && monthNightShare !== null && (
                <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, fontSize: '0.68rem' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, opacity: 0.8 }}><Moon size={11} style={{ color: NIGHT_COLOR }} />Nattandel denne måneden</span>
                        <span style={{ fontWeight: 700, fontSize: '0.8rem' }}>{fmtPct(monthNightShare)}</span>
                    </div>
                    <NightSplitBar share={monthNightShare} height={9} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.62rem', opacity: 0.5, whiteSpace: 'nowrap' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{monthNightKwh !== null ? `${fmtKwh(monthNightKwh)} natt · ${fmtKwh(monthDayKwh)} dag` : ''}</span>
                        {monthNightSavings !== null && <span style={{ flexShrink: 0 }}>Spart {fmt(monthNightSavings)} kr</span>}
                    </div>
                </div>
            )}

            {/* Toppforbruk-rad */}
            {showPeaksRow && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {[
                        { label: 'Topp 1', val: peak1, attrs: peak1Attrs },
                        { label: 'Topp 2', val: peak2, attrs: peak2Attrs },
                        { label: 'Topp 3', val: peak3, attrs: peak3Attrs },
                    ].map(({ label, val, attrs }) => (
                        <div key={label} style={s.peakChip}>
                            <TrendingUp size={10} style={{ opacity: 0.5, marginRight: 4 }} />
                            <span style={{ opacity: 0.5, marginRight: 4 }}>{label}:</span>
                            <span style={{ fontWeight: 600 }}>{val !== null ? `${val.toFixed(2)} kW` : '–'}</span>
                            {attrs?.dato && <span style={{ opacity: 0.35, marginLeft: 5 }}>{attrs.dato}</span>}
                        </div>
                    ))}
                    {marginNextTier !== null && (
                        <div style={{ ...s.peakChip, borderColor: capacityAlert ? 'rgba(239,68,68,0.3)' : undefined }}>
                            {capacityAlert ? <AlertTriangle size={10} style={{ color: '#ef4444', marginRight: 4 }} /> : <Zap size={10} style={{ opacity: 0.5, marginRight: 4 }} />}
                            <span style={{ opacity: 0.5, marginRight: 4 }}>Margin:</span>
                            <span style={{ fontWeight: 600, color: capacityAlert ? '#f97316' : undefined }}>{marginNextTier.toFixed(2)} kW</span>
                            {capacityAttrs.neste_trinn_kr && <span style={{ opacity: 0.4, marginLeft: 5 }}>→ {capacityAttrs.neste_trinn_kr} kr</span>}
                        </div>
                    )}
                </div>
            )}

            {/* Søylediagram */}
            {showBarChart && devices.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={s.sectionLabel}>
                        {PERIODS.find(p => p.id === period)?.label} – kostnad per enhet
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {deviceData.length > 0 ? deviceData.map(dev => (
                            <div key={dev.prefix} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 4 }}>
                                    <span style={{ fontSize: '0.78rem', opacity: 0.88, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{dev.name}</span>
                                    <span style={{ fontSize: '0.78rem', fontWeight: 600, flexShrink: 0, marginLeft: 4 }}>{fmt(dev.total)} kr</span>
                                </div>
                                <div style={{ height: 9, background: 'rgba(255,255,255,0.07)', borderRadius: 3, overflow: 'hidden' }}>
                                    {/* Søylen er kostnad; den mørke delen er andelen av kWh på nattsats, den lyse dagsats */}
                                    <div style={{ height: '100%', width: `${((dev.total ?? 0) / maxCost) * 100}%`, borderRadius: 3, overflow: 'hidden', display: 'flex', transition: 'width 0.6s ease' }}>
                                        {showNightInBars && dev.nightShareMonthly !== null ? (
                                            <>
                                                <div style={{ width: `${dev.nightShareMonthly}%`, background: dev.color, opacity: 0.95 }} />
                                                <div style={{ width: `${100 - dev.nightShareMonthly}%`, background: dev.color, opacity: 0.4 }} />
                                            </>
                                        ) : (
                                            <div style={{ width: '100%', background: dev.color, opacity: 0.85 }} />
                                        )}
                                    </div>
                                </div>
                            </div>
                        )) : (
                            <div style={{ opacity: 0.4, fontSize: '0.78rem', textAlign: 'center' }}>Ingen data for denne perioden</div>
                        )}
                    </div>
                </div>
            )}

            {devices.length === 0 && (
                <div style={{ padding: '24px 0', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.35, fontSize: '0.75rem', flexDirection: 'column', gap: 4 }}>
                    <Activity size={18} />
                    <span>Legg til enheter i innstillinger for forbruksoversikt</span>
                </div>
            )}

            {/* Navigasjonsknapper */}
            <div style={{ display: 'grid', gridTemplateColumns: showLoadMgr ? '1fr 1fr' : '1fr', gap: 6 }}>
                {showTable && devices.length > 0 && (
                    <button onClick={() => setView('detail')} style={s.navBtn}>
                        <LayoutList size={13} />
                        <span>Detaljert oversikt</span>
                        <ChevronRight size={13} style={{ marginLeft: 'auto' }} />
                    </button>
                )}
                {showLoadMgr && (
                    <button onClick={() => setView('loadmgr')} style={s.navBtn}>
                        <Sliders size={13} />
                        <span>Strømstyring</span>
                        {lmModeStyle && (
                            <span style={{
                                marginLeft: 'auto', fontSize: '0.6rem', fontWeight: 700,
                                color: lmModeStyle.color, whiteSpace: 'nowrap',
                            }}>
                                {lmModeStyle.label}
                            </span>
                        )}
                    </button>
                )}
            </div>
        </div>
    );
}

const s = {
    root:      { padding: 14, display: 'flex', flexDirection: 'column', gap: 9, fontFamily: 'inherit', color: 'var(--text-primary, #fff)', boxSizing: 'border-box', fontSize: '0.8rem' },
    titleRow:  { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    title:     { fontSize: '0.88rem', fontWeight: 600, opacity: 0.9 },
    timestamp: { fontSize: '0.6rem', opacity: 0.3, flexShrink: 0, marginLeft: 8 },
    peakChip:  { display: 'flex', alignItems: 'center', background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '3px 8px', fontSize: '0.68rem', border: '1px solid rgba(255,255,255,0.08)' },
    sectionLabel: { fontSize: '0.6rem', opacity: 0.4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' },
    navBtn:    { display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'var(--text-primary, #fff)', cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'inherit' },
    backBtn:   { display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, color: 'var(--text-primary, #fff)', cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'inherit' },
    detailCard: { background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.08)' },
    adjBtn:    { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, color: 'var(--text-primary, #fff)', cursor: 'pointer', flexShrink: 0 },
};
