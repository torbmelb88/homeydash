import React, { useState, useMemo } from 'react';
import { Zap } from 'lucide-react';
import { hassAPI } from '../services/hass-api';
import { CheckboxRow } from './SettingsControls';

// Felles innstillingspaneler for «Strøm & kostnad» – brukes både av flisen (TileSettingsModal)
// og energisiden (EnergyPage), så bryterne ikke sklir fra hverandre.

export const ENERGY_BAR_COLORS = [
    '#f97316','#3b82f6','#22c55e','#a855f7','#ec4899',
    '#06b6d4','#eab308','#ef4444','#84cc16','#f59e0b','#6366f1',
    '#0ea5e9','#d946ef','#10b981','#fb923c',
];

// ── Oppdagelse av kostnadsenheter i HA ──────────────────────────────────────

// Finn eksakt entity-ID for en kostnadsentitet ved å filtrere på "Kostnad" i friendly name.
// Løser navnekonflikter der HA auto-renamer (f.eks. _energy_monthly_2) fordi en annen sensor
// med samme navn allerede eksisterer.
function findCostEntity(entities, prefix, partialSuffix) {
    const base = `sensor.${prefix}_${partialSuffix}`;
    const candidates = Object.keys(entities).filter(eid =>
        eid.startsWith(`sensor.${prefix}_`) &&
        eid.includes(partialSuffix) &&
        entities[eid]?.attributes?.friendly_name?.includes('Kostnad')
    );
    if (candidates.length === 1) return candidates[0];
    if (candidates.includes(base)) return base;
    return base;
}

// Lesbart stedsnavn fra entity-prefix som fallback når HA-sone ikke finnes.
// Eks: "tech_outlet_basement_heat_pump" → "Kjeller", "bathroom_floor_heating" → "Bad"
function locationFromPrefix(prefix) {
    const STRIP_SUFFIXES = ['_floor_heating','_heat_pump','_washing_machine','_dishwasher','_water_heater','_car_charger','_multisplit'];
    const TRANSLATIONS = {
        bathroom: 'Bad', laundry_room: 'Vaskerom', guest_room: 'Gjesterom',
        toilet: 'Toalett', basement: 'Kjeller', living_room: 'Stue',
        kitchen: 'Kjøkken', bedroom: 'Soverom', hallway: 'Gang', garage: 'Garasje',
        outdoor: 'Utendørs', office: 'Kontor', attic: 'Loft',
    };
    let loc = prefix.replace(/^tech_outlet_/, '');
    for (const s of STRIP_SUFFIXES) loc = loc.replace(s, '');
    loc = loc.replace(/_+$/, '').replace(/_+/g, '_');
    return TRANSLATIONS[loc] || loc.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || null;
}

export function discoverEnergyCostDevices() {
    const entities = hassAPI.entities || {};
    const result = [];
    Object.keys(entities).forEach(eid => {
        if (!eid.startsWith('sensor.') || !eid.endsWith('_total_cost_monthly')) return;
        const prefix = eid.replace(/^sensor\./, '').replace(/_total_cost_monthly$/, '');
        const friendlyName = entities[eid]?.attributes?.friendly_name || '';
        const name = friendlyName.replace(/\s*Total\s*\(mnd\)\s*$/i, '').trim() || prefix;
        const area = hassAPI.entityToArea?.[eid] || locationFromPrefix(prefix) || '';
        const p = (suffix) => `sensor.${prefix}_${suffix}`;
        const e = (partialSuffix) => findCostEntity(entities, prefix, partialSuffix);
        result.push({
            prefix, name, area,
            entities: {
                monthly:    { energy: e('energy_monthly'),    power: p('power_cost_monthly'),    grid: p('grid_tariff_monthly'),    capacity: p('capacity_cost_monthly'),    total: eid },
                ytd:        { energy: e('energy_ytd'),        power: p('power_cost_ytd'),        grid: p('grid_tariff_ytd'),        capacity: p('capacity_cost_ytd'),        total: p('total_cost_ytd') },
                prev_month: { energy: e('energy_prev_month'), power: p('power_cost_prev_month'), grid: p('grid_tariff_prev_month'), capacity: p('capacity_cost_prev_month'), total: p('total_cost_prev_month') },
                prev_year:  { energy: e('energy_prev_year'),  power: p('power_cost_prev_year'),  grid: p('grid_tariff_prev_year'),  capacity: p('capacity_cost_prev_year'),  total: p('total_cost_prev_year') },
            },
        });
    });
    return result.sort((a, b) => a.name.localeCompare(b.name, 'nb'));
}

// ── Stiler ───────────────────────────────────────────────────────────────────

const iconBtnStyle = (disabled) => ({
    padding: '2px 7px',
    background: 'transparent',
    border: '1px solid var(--color-border)',
    borderRadius: 4,
    color: disabled ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.4 : 1,
    fontSize: '0.85rem',
});

const selectStyle = {
    width: '100%', padding: '7px 8px',
    background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--color-text-primary)',
    fontSize: '0.8rem',
};

// ── Generelt: hvilke kort/seksjoner/kolonner som vises ──────────────────────

export function EnergyDashboardGeneralSettings({ settings, onChange }) {
    const tog = (key, def = true) => settings?.[key] !== undefined ? settings[key] : def;
    return (
        <div>
            <div className="form-group">
                <label>Vis øverste infokort</label>
                <div style={{ marginTop: 6 }}>
                    <CheckboxRow label="Effektiv pris"                    checked={tog('showPriceCard')}    onChange={v => onChange({ showPriceCard: v })} />
                    <CheckboxRow label="I dag (kostnad, kWh og i går)"    checked={tog('showTodayCard')}    onChange={v => onChange({ showTodayCard: v })} />
                    <CheckboxRow label="Kapasitetstrinn"                  checked={tog('showCapacityCard')} onChange={v => onChange({ showCapacityCard: v })} />
                    <CheckboxRow label="Snitt toppforbruk"                checked={tog('showPeakCard')}     onChange={v => onChange({ showPeakCard: v })} />
                    <CheckboxRow label="Totalkostnad (sporet kostnad)"    checked={tog('showTrackedCard')}  onChange={v => onChange({ showTrackedCard: v })} />
                    <CheckboxRow label="Estimert månedstotal"             checked={tog('showEstimateCard')} onChange={v => onChange({ showEstimateCard: v })} />
                </div>
            </div>
            <div className="form-group">
                <label>Seksjoner</label>
                <div style={{ marginTop: 6 }}>
                    <CheckboxRow label="Toppforbruk-rad (topp 1/2/3)" checked={tog('showPeaksRow')}    onChange={v => onChange({ showPeaksRow: v })} />
                    <CheckboxRow label="Nattandel-rad"                 checked={tog('showNightRow')}    onChange={v => onChange({ showNightRow: v })} />
                    <CheckboxRow label="Søylediagram"                  checked={tog('showBarChart')}    onChange={v => onChange({ showBarChart: v })} />
                    {tog('showBarChart') && (
                        <CheckboxRow label="Del søylene i natt/dag"    checked={tog('showNightInBars')} onChange={v => onChange({ showNightInBars: v })} />
                    )}
                    <CheckboxRow label="Detaljert oversikt (knapp)"    checked={tog('showTable')}       onChange={v => onChange({ showTable: v })} />
                    <CheckboxRow label="Strømstyring (knapp)"          checked={tog('showLoadMgr')}     onChange={v => onChange({ showLoadMgr: v })} />
                </div>
            </div>
            {tog('showTable') && (
                <div className="form-group">
                    <label>Kolonner i detaljert oversikt</label>
                    <div style={{ marginTop: 6 }}>
                        <CheckboxRow label="kWh (energiforbruk)"      checked={tog('showColEnergy')}        onChange={v => onChange({ showColEnergy: v })} />
                        <CheckboxRow label="Strøm (kr)"               checked={tog('showColPower')}         onChange={v => onChange({ showColPower: v })} />
                        <CheckboxRow label="Energiledd (kr)"          checked={tog('showColGrid')}          onChange={v => onChange({ showColGrid: v })} />
                        <CheckboxRow label="Kapasitetsledd (kr)"      checked={tog('showColCapacity')}      onChange={v => onChange({ showColCapacity: v })} />
                        <CheckboxRow label="Nattandel (%)"            checked={tog('showColNightShare')}    onChange={v => onChange({ showColNightShare: v })} />
                        <CheckboxRow label="Spart på nattsats (kr)"   checked={tog('showColNightSavings')}  onChange={v => onChange({ showColNightSavings: v })} />
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Enheter: hvilke kostnadsenheter som følges ──────────────────────────────

export function EnergyDashboardDeviceConfig({ settings, onChange }) {
    const devices = settings?.devices || [];
    const [editingIdx, setEditingIdx] = useState(null);
    const [editName, setEditName] = useState('');
    const [selectedPrefix, setSelectedPrefix] = useState('');

    const available = discoverEnergyCostDevices();
    const addedPrefixes = new Set(devices.map(d => d.prefix));
    const notAdded = available.filter(d => !addedPrefixes.has(d.prefix));

    const addDevice = () => {
        if (!selectedPrefix) return;
        const found = available.find(d => d.prefix === selectedPrefix);
        if (!found) return;
        onChange({ devices: [...devices, { prefix: found.prefix, name: found.name, entities: found.entities }] });
        setSelectedPrefix('');
    };

    const removeDevice = (idx) => onChange({ devices: devices.filter((_, i) => i !== idx) });

    const startEdit = (idx) => { setEditingIdx(idx); setEditName(devices[idx].name); };
    const commitEdit = () => {
        if (editingIdx === null) return;
        onChange({ devices: devices.map((d, i) => i === editingIdx ? { ...d, name: editName.trim() || d.name } : d) });
        setEditingIdx(null);
    };

    const move = (idx, dir) => {
        const to = idx + dir;
        if (to < 0 || to >= devices.length) return;
        const next = [...devices];
        [next[idx], next[to]] = [next[to], next[idx]];
        onChange({ devices: next });
    };

    return (
        <div>
            <div className="form-group">
                <label>Legg til enhet</label>
                {notAdded.length === 0 ? (
                    <p style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: 6 }}>
                        {available.length === 0
                            ? 'Ingen kostnadssensorer funnet i Home Assistant. Sjekk at HA er tilkoblet.'
                            : 'Alle tilgjengelige enheter er allerede lagt til.'}
                    </p>
                ) : (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <select value={selectedPrefix} onChange={e => setSelectedPrefix(e.target.value)} style={{ ...selectStyle, flex: 1, width: undefined }}>
                            <option value="">– Velg enhet –</option>
                            {notAdded.map(d => <option key={d.prefix} value={d.prefix}>{d.area ? `${d.name} (${d.area})` : d.name}</option>)}
                        </select>
                        <button onClick={addDevice} disabled={!selectedPrefix} style={{ padding: '7px 14px', background: selectedPrefix ? 'var(--color-accent, #3b82f6)' : 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)', cursor: selectedPrefix ? 'pointer' : 'default', fontSize: '0.8rem', opacity: selectedPrefix ? 1 : 0.5 }}>
                            Legg til
                        </button>
                    </div>
                )}
            </div>

            {devices.length > 0 && (
                <div className="form-group">
                    <label>Konfigurerte enheter ({devices.length})</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                        {devices.map((dev, idx) => (
                            <div key={dev.prefix} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '6px 10px' }}>
                                <span style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: ENERGY_BAR_COLORS[idx % ENERGY_BAR_COLORS.length] }} />
                                {editingIdx === idx ? (
                                    <input autoFocus value={editName} onChange={e => setEditName(e.target.value)}
                                        onBlur={commitEdit} onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingIdx(null); }}
                                        style={{ flex: 1, padding: '2px 6px', background: 'var(--color-bg-primary)', border: '1px solid var(--color-accent, #3b82f6)', borderRadius: 4, color: 'var(--color-text-primary)', fontSize: '0.8rem' }} />
                                ) : (
                                    <span style={{ flex: 1, cursor: 'pointer', minWidth: 0 }} onClick={() => startEdit(idx)} title="Klikk for å endre navn">
                                        <div style={{ fontSize: '0.8rem' }}>{dev.name}</div>
                                        {dev.area && <div style={{ fontSize: '0.68rem', opacity: 0.45, marginTop: 1 }}>{dev.area}</div>}
                                    </span>
                                )}
                                <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                                    <button onClick={() => move(idx, -1)} disabled={idx === 0}                  style={iconBtnStyle(idx === 0)}                  title="Flytt opp">↑</button>
                                    <button onClick={() => move(idx, 1)}  disabled={idx === devices.length - 1} style={iconBtnStyle(idx === devices.length - 1)} title="Flytt ned">↓</button>
                                    <button onClick={() => removeDevice(idx)} style={{ ...iconBtnStyle(false), color: '#ef4444' }} title="Fjern">×</button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <p style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: 6 }}>Klikk på enhetsnavn for å endre det.</p>
                </div>
            )}
        </div>
    );
}

// ── Effekt: live W-entitet per enhet ────────────────────────────────────────

export function EnergyDashboardPowerConfig({ settings, onChange }) {
    const devices = settings?.devices || [];
    const devicePowerEntities = settings?.devicePowerEntities || {};
    const powerEntities = useMemo(() => {
        const entities = hassAPI?.entities || {};
        return Object.keys(entities)
            .filter(eid => entities[eid]?.attributes?.unit_of_measurement === 'W')
            .map(eid => ({ eid, name: String(entities[eid].attributes.friendly_name || eid) }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, []);

    if (devices.length === 0) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', gap: 10, textAlign: 'center' }}>
                <Zap size={28} style={{ opacity: 0.3 }} />
                <p style={{ fontSize: '0.85rem', fontWeight: 600, margin: 0 }}>Ingen enheter konfigurert</p>
                <p style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', margin: 0 }}>Legg til enheter under «Enheter»-fanen.</p>
            </div>
        );
    }

    return (
        <div>
            <div className="form-group">
                <label>Effektentitet per enhet (W)</label>
                <p style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: 4, marginBottom: 10 }}>
                    Velg en HA-entitet som måler øyeblikkelig effekt (W) for hver enhet. Vises i detaljert oversikt.
                </p>
                {powerEntities.length === 0 && <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>Ingen W-entiteter funnet i Home Assistant.</p>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {devices.map((dev, idx) => (
                        <div key={dev.prefix}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <span style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: ENERGY_BAR_COLORS[idx % ENERGY_BAR_COLORS.length] }} />
                                <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>{dev.name}</span>
                            </div>
                            <select
                                value={devicePowerEntities[dev.prefix] || ''}
                                onChange={e => {
                                    const val = e.target.value;
                                    const updated = { ...devicePowerEntities };
                                    if (val) updated[dev.prefix] = val; else delete updated[dev.prefix];
                                    onChange({ devicePowerEntities: updated });
                                }}
                                style={{ ...selectStyle, fontSize: '0.78rem' }}
                            >
                                <option value="">– Ingen / ikke vis –</option>
                                {powerEntities.map(item => <option key={item.eid} value={item.eid}>{item.name === item.eid ? item.eid : `${item.name} — ${item.eid}`}</option>)}
                            </select>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
