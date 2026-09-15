import React, { useMemo } from 'react';
import { Plus, Trash2, Search } from 'lucide-react';
import { hassAPI } from '../services/hass-api';
import { CheckboxRow } from './SettingsControls';
import OutdoorTempTile from './TileContent/OutdoorTempTile';
import {
    DEFAULT_OUTDOOR_TEMP_SETTINGS, WALL_LABEL, compassName, wallBearing, detectOutdoorTempSensors,
} from '../services/outdoor-temp';

// Innstillinger for utetemperatur-widgeten. Skriver til tile.settings via onChange(partial).
// Forhåndsvisningen øverst er selve flisen, så bruker ser huset snu seg mens
// husretningen justeres (nordpilen skal peke som på kartet).

const WALLS = ['top', 'bottom', 'right', 'left'];

const inputStyle = {
    width: '100%', padding: '6px 8px', background: 'var(--color-bg-secondary)',
    border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)',
    color: 'var(--color-text-primary)', fontSize: '0.85rem',
};

const OutdoorTempSettings = ({ settings, onChange }) => {
    const cfg = { ...DEFAULT_OUTDOOR_TEMP_SETTINGS, ...(settings || {}) };
    const units = cfg.units || [];
    const setUnits = (next) => onChange({ units: next });
    const patchUnit = (id, patch) => setUnits(units.map(u => (u.id === id ? { ...u, ...patch } : u)));

    // Alle temperatursensorer i HA, gruppert på rom: «[Rom] Navn (entity_id)»
    const sensorOptions = useMemo(() => {
        const list = Object.values(hassAPI.entities || {}).filter(e => {
            if (!e.entity_id?.startsWith('sensor.')) return false;
            const a = e.attributes || {};
            return a.device_class === 'temperature' || a.unit_of_measurement === '°C';
        }).map(e => ({
            id: e.entity_id,
            name: e.attributes?.friendly_name || e.entity_id,
            room: hassAPI.entityToArea?.[e.entity_id] || '',
        }));
        return list.sort((a, b) =>
            (a.room || 'Ø').localeCompare(b.room || 'Ø', 'nb') || a.name.localeCompare(b.name, 'nb'));
    }, []);

    const nextId = `u${Math.max(0, ...units.map(u => parseInt(String(u.id).replace(/D/g, ''), 10) || 0)) + 1}`;
    const addUnit = () => setUnits([...units, {
        id: nextId, name: `Utedel ${units.length + 1}`, entityId: '',
        wall: 'bottom', pos: 50, blockFromAz: '', blockToAz: '',
    }]);

    const autoDetect = () => {
        const have = new Set(units.map(u => u.entityId));
        const found = detectOutdoorTempSensors(hassAPI.entities, hassAPI.entityToArea).filter(u => !have.has(u.entityId));
        if (found.length) setUnits([...units, ...found]);
    };

    return (
        <div>
            <div className="form-section">
                <label>Forhåndsvisning</label>
                <div style={{ background: 'var(--color-bg-primary)', borderRadius: 'var(--radius-lg)', padding: 12, maxWidth: 340 }}>
                    <OutdoorTempTile tile={{ id: 'preview', settings: cfg }} />
                </div>
            </div>

            <div className="form-section">
                <label>Utedeler</label>
                <p className="hint" style={{ marginTop: 0 }}>
                    Én rad per utedel: temperatursensoren, hvilken vegg den står på og hvor langt langs veggen
                    (0 % = venstre/øverst, 100 % = høyre/nederst i tegningen). Flere innedeler på samme utedel
                    (multisplit) viser samme temperatur, så bruk bare én av dem.
                </p>
                {units.map(u => {
                    const bearing = wallBearing(u.wall, cfg.houseBearing);
                    const hasBlock = u.blockFromAz !== '' && u.blockFromAz != null;
                    return (
                        <div key={u.id} style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: 10, marginBottom: 10, display: 'grid', gap: 8 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, alignItems: 'center' }}>
                                <input
                                    type="text"
                                    value={u.name || ''}
                                    placeholder="Navn (f.eks. Stue)"
                                    onChange={e => patchUnit(u.id, { name: e.target.value })}
                                    style={inputStyle}
                                />
                                <select value={u.wall || 'bottom'} onChange={e => patchUnit(u.id, { wall: e.target.value })} style={inputStyle}>
                                    {WALLS.map(w => (
                                        <option key={w} value={w}>{WALL_LABEL[w]} (mot {compassName(wallBearing(w, cfg.houseBearing))})</option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    className="icon-btn"
                                    title="Fjern utedel"
                                    onClick={() => setUnits(units.filter(x => x.id !== u.id))}
                                    style={{ color: 'var(--color-danger)' }}
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                            <select value={u.entityId || ''} onChange={e => patchUnit(u.id, { entityId: e.target.value })} style={inputStyle}>
                                <option value="">Velg temperatursensor…</option>
                                {sensorOptions.map(o => (
                                    <option key={o.id} value={o.id}>{o.room ? `[${o.room}] ` : ''}{o.name} ({o.id})</option>
                                ))}
                            </select>
                            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 8, alignItems: 'center', fontSize: '0.8rem' }}>
                                <span className="hint">Plassering</span>
                                <input type="range" min="0" max="100" value={u.pos ?? 50} onChange={e => patchUnit(u.id, { pos: Number(e.target.value) })} />
                                <span className="hint" style={{ minWidth: 36, textAlign: 'right' }}>{u.pos ?? 50} %</span>
                            </div>
                            <CheckboxRow
                                label="Noe skygger for sola (platting, paviljong, nabohus)"
                                description={`Veggen vender mot ${compassName(bearing)} (${bearing}°). Sola regnes borte når den står i asimut-intervallet under.`}
                                checked={hasBlock}
                                onChange={(on) => patchUnit(u.id, on
                                    ? { blockFromAz: u.blockFromAz || String(Math.round((bearing + 60) % 360)), blockToAz: u.blockToAz || String(Math.round((bearing + 90) % 360)) }
                                    : { blockFromAz: '', blockToAz: '' })}
                            />
                            {hasBlock && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto 1fr', gap: 8, alignItems: 'center', fontSize: '0.8rem', paddingLeft: 28 }}>
                                    <span className="hint">fra</span>
                                    <input type="number" min="0" max="360" value={u.blockFromAz} onChange={e => patchUnit(u.id, { blockFromAz: e.target.value })} style={inputStyle} />
                                    <span className="hint">til</span>
                                    <input type="number" min="0" max="360" value={u.blockToAz} onChange={e => patchUnit(u.id, { blockToAz: e.target.value })} style={inputStyle} />
                                </div>
                            )}
                        </div>
                    );
                })}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-secondary" onClick={addUnit} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Plus size={14} /> Legg til utedel
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={autoDetect} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <Search size={14} /> Finn utedeler automatisk
                    </button>
                </div>
            </div>

            <div className="form-section">
                <label>Huset</label>
                <p className="hint" style={{ marginTop: 0 }}>
                    Husretningen er kompassretningen langsiden peker mot høyre i tegningen (0 = nord, 90 = øst).
                    Juster til nordpilen i forhåndsvisningen peker som på kartet.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
                    <div>
                        <span className="hint">Husretning (°)</span>
                        <input type="number" min="0" max="359" value={cfg.houseBearing} onChange={e => onChange({ houseBearing: Number(e.target.value) })} style={inputStyle} />
                    </div>
                    <div>
                        <span className="hint">Langside / kortside</span>
                        <input type="number" min="1" max="4" step="0.05" value={cfg.houseRatio} onChange={e => onChange({ houseRatio: Number(e.target.value) })} style={inputStyle} />
                    </div>
                    <div>
                        <span className="hint">Tegn huset</span>
                        <select value={cfg.orientation} onChange={e => onChange({ orientation: e.target.value })} style={inputStyle}>
                            <option value="house">Vannrett (som i klipper-appen)</option>
                            <option value="north">Nord opp (som på kartet)</option>
                        </select>
                    </div>
                    <div>
                        <span className="hint">Avkjølingstid (min)</span>
                        <input type="number" min="0" max="180" step="15" value={cfg.graceMinutes} onChange={e => onChange({ graceMinutes: Number(e.target.value) })} style={inputStyle} />
                    </div>
                </div>
            </div>

            <div className="form-section">
                <label>Visning</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <CheckboxRow label="Vis skyggen huset kaster" checked={cfg.showShadow !== false} onChange={v => onChange({ showShadow: v })} />
                    <CheckboxRow label="Vis kompassring og nordpil" checked={cfg.showCompass !== false} onChange={v => onChange({ showCompass: v })} />
                    <CheckboxRow label="Vis beste anslag midt i huset" checked={cfg.showEstimate !== false} onChange={v => onChange({ showEstimate: v })} />
                </div>
            </div>
        </div>
    );
};

export default OutdoorTempSettings;
