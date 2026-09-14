import React, { useMemo, useState } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, X } from 'lucide-react';
import { CheckboxRow } from './SettingsControls';
import { resolveTileDevice } from '../services/utils';
import { isLightDevice, DEFAULT_LIGHT_PRESETS, NO_ROOM_LABEL } from './TileContent/LightPanelTile';

// Innstillinger for Lyspanel-widgeten. Skriver til tile.settings via onChange(partial).
//   mode: 'areas' | 'custom'
//   excludedDeviceIds: [] (areas)      groups: [{ id, name, deviceIds[] }] (custom)
//   presets: [10, 40, 100]             showPresets / showAllOff (default true)
//   customNames: { [deviceId]: navn }  deviceEntityHints: { [deviceId]: entity_id }
const LightPanelSettings = ({ devices, settings, onChange }) => {
    const mode = settings.mode === 'custom' ? 'custom' : 'areas';
    const lights = useMemo(() => devices.filter(isLightDevice), [devices]);
    const presets = settings.presets && settings.presets.length ? settings.presets : DEFAULT_LIGHT_PRESETS;

    // Lys gruppert per rom (til både unntaksliste og velger)
    const byZone = useMemo(() => {
        const m = new Map();
        lights.forEach(d => {
            const z = d.zoneName || NO_ROOM_LABEL;
            if (!m.has(z)) m.set(z, []);
            m.get(z).push(d);
        });
        return [...m.entries()].sort(([a], [b]) => {
            if (a === NO_ROOM_LABEL) return 1;
            if (b === NO_ROOM_LABEL) return -1;
            return a.localeCompare(b, 'nb');
        });
    }, [lights]);

    const excluded = new Set(settings.excludedDeviceIds || []);
    const toggleExcluded = (id, included) => {
        const next = new Set(excluded);
        included ? next.delete(id) : next.add(id);
        onChange({ excludedDeviceIds: [...next] });
    };

    const groups = settings.groups || [];
    const setGroups = (next) => onChange({ groups: next });
    const updateGroup = (idx, patch) => setGroups(groups.map((g, i) => i === idx ? { ...g, ...patch } : g));
    const moveGroup = (idx, dir) => {
        const j = idx + dir;
        if (j < 0 || j >= groups.length) return;
        const next = [...groups];
        [next[idx], next[j]] = [next[j], next[idx]];
        setGroups(next);
    };
    const addGroup = () => setGroups([...groups, { id: Date.now().toString(), name: 'Ny gruppe', deviceIds: [] }]);
    const removeGroup = (idx) => setGroups(groups.filter((_, i) => i !== idx));

    const [pickerFor, setPickerFor] = useState(null); // gruppeindeks som legger til lys

    const addDeviceToGroup = (idx, deviceId) => {
        const g = groups[idx];
        if (!deviceId || g.deviceIds.includes(deviceId)) return;
        const d = lights.find(x => x.id === deviceId);
        const patch = { groups: groups.map((x, i) => i === idx ? { ...x, deviceIds: [...x.deviceIds, deviceId] } : x) };
        if (d?.primaryEntityId) {
            patch.deviceEntityHints = { ...(settings.deviceEntityHints || {}), [deviceId]: d.primaryEntityId };
        }
        onChange(patch);
        setPickerFor(null);
    };
    const removeDeviceFromGroup = (idx, deviceId) =>
        updateGroup(idx, { deviceIds: groups[idx].deviceIds.filter(id => id !== deviceId) });
    const moveDeviceInGroup = (idx, di, dir) => {
        const ids = [...groups[idx].deviceIds];
        const j = di + dir;
        if (j < 0 || j >= ids.length) return;
        [ids[di], ids[j]] = [ids[j], ids[di]];
        updateGroup(idx, { deviceIds: ids });
    };

    const setPreset = (i, val) => {
        const next = [...presets];
        next[i] = Math.max(1, Math.min(100, parseInt(val, 10) || 0));
        onChange({ presets: next });
    };

    const setCustomName = (deviceId, name) => {
        const next = { ...(settings.customNames || {}) };
        if (name.trim()) next[deviceId] = name; else delete next[deviceId];
        onChange({ customNames: next });
    };

    const labelFor = (d) => (d.zoneName ? `${d.zoneName} – ${d.name}` : d.name);

    return (
        <>
            <div className="form-group">
                <label>Inndeling</label>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                        className={`btn btn-secondary ${mode === 'areas' ? 'active' : ''}`}
                        onClick={() => onChange({ mode: 'areas' })}
                        style={{ flex: 1, borderColor: mode === 'areas' ? 'var(--color-accent-primary)' : '' }}
                    >
                        Automatisk etter rom
                    </button>
                    <button
                        className={`btn btn-secondary ${mode === 'custom' ? 'active' : ''}`}
                        onClick={() => onChange({ mode: 'custom' })}
                        style={{ flex: 1, borderColor: mode === 'custom' ? 'var(--color-accent-primary)' : '' }}
                    >
                        Egendefinerte grupper
                    </button>
                </div>
                <p className="hint" style={{ marginTop: 6 }}>
                    {mode === 'areas'
                        ? 'Alle lys grupperes etter rommet de tilhører i Home Assistant. Fjern haken på lys du ikke vil ha med.'
                        : 'Lag egne grupper med de lysene du faktisk bruker, i den rekkefølgen du vil.'}
                </p>
            </div>

            {mode === 'areas' && (
                <div className="form-group">
                    <label>Lys som vises</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '320px', overflowY: 'auto', paddingRight: 4 }}>
                        {byZone.map(([zone, list]) => (
                            <div key={zone}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{zone}</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {list.map(d => (
                                        <CheckboxRow
                                            key={d.id}
                                            label={d.name}
                                            checked={!excluded.has(d.id)}
                                            onChange={(checked) => toggleExcluded(d.id, checked)}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                        {lights.length === 0 && <span className="hint">Fant ingen lys.</span>}
                    </div>
                </div>
            )}

            {mode === 'custom' && (
                <div className="form-group">
                    <label>Grupper</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {groups.map((g, idx) => (
                            <div key={g.id} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                    <input
                                        type="text"
                                        value={g.name}
                                        onChange={(e) => updateGroup(idx, { name: e.target.value })}
                                        placeholder="Gruppenavn"
                                        style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' }}
                                    />
                                    <button className="icon-btn" disabled={idx === 0} onClick={() => moveGroup(idx, -1)}><ChevronUp size={16} /></button>
                                    <button className="icon-btn" disabled={idx === groups.length - 1} onClick={() => moveGroup(idx, 1)}><ChevronDown size={16} /></button>
                                    <button className="icon-btn" onClick={() => removeGroup(idx)} style={{ color: 'var(--color-error)' }}><Trash2 size={16} /></button>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                    {g.deviceIds.map((id, di) => {
                                        const d = resolveTileDevice(devices, id, settings.deviceEntityHints?.[id]);
                                        return (
                                            <div key={id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <input
                                                    type="text"
                                                    value={settings.customNames?.[id] ?? ''}
                                                    placeholder={d ? labelFor(d) : id}
                                                    title={d ? `Egendefinert navn (standard: ${labelFor(d)})` : 'Enheten finnes ikke lenger'}
                                                    onChange={(e) => setCustomName(id, e.target.value)}
                                                    style={{ flex: 1, minWidth: 0, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)', color: d ? 'var(--color-text-primary)' : 'var(--color-error)', fontSize: '0.85rem' }}
                                                />
                                                <button className="icon-btn" disabled={di === 0} onClick={() => moveDeviceInGroup(idx, di, -1)}><ChevronUp size={14} /></button>
                                                <button className="icon-btn" disabled={di === g.deviceIds.length - 1} onClick={() => moveDeviceInGroup(idx, di, 1)}><ChevronDown size={14} /></button>
                                                <button className="icon-btn" onClick={() => removeDeviceFromGroup(idx, id)}><X size={14} /></button>
                                            </div>
                                        );
                                    })}
                                    {g.deviceIds.length === 0 && <span className="hint" style={{ fontStyle: 'italic' }}>Ingen lys i gruppen</span>}
                                </div>

                                {pickerFor === idx ? (
                                    <select
                                        autoFocus
                                        className="select-input"
                                        defaultValue=""
                                        onChange={(e) => addDeviceToGroup(idx, e.target.value)}
                                        onBlur={() => setPickerFor(null)}
                                        style={{ width: '100%', marginTop: 8 }}
                                    >
                                        <option value="" disabled>Velg lys …</option>
                                        {byZone.map(([zone, list]) => (
                                            <optgroup key={zone} label={zone}>
                                                {list.filter(d => !g.deviceIds.includes(d.id)).map(d => (
                                                    <option key={d.id} value={d.id}>{d.name}</option>
                                                ))}
                                            </optgroup>
                                        ))}
                                    </select>
                                ) : (
                                    <button className="btn btn-secondary" onClick={() => setPickerFor(idx)} style={{ marginTop: 8, padding: '5px 10px', fontSize: '0.8rem' }}>
                                        <Plus size={14} style={{ marginRight: 4 }} /> Legg til lys
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                    <button className="btn btn-secondary" onClick={addGroup} style={{ marginTop: 10, width: '100%' }}>
                        <Plus size={16} style={{ marginRight: 6 }} /> Ny gruppe
                    </button>
                </div>
            )}

            <div className="form-group">
                <label>Hurtignivåer (%)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                    {[0, 1, 2].map(i => (
                        <input
                            key={i}
                            type="number"
                            min={1}
                            max={100}
                            value={presets[i] ?? ''}
                            onChange={(e) => setPreset(i, e.target.value)}
                            style={{ width: 70, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' }}
                        />
                    ))}
                </div>
                <p className="hint" style={{ marginTop: 6 }}>Knapper under hvert rom som setter alle dimbare lys i rommet til nivået.</p>
            </div>

            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <CheckboxRow
                    label="Vis hurtignivå-knapper"
                    checked={settings.showPresets !== false}
                    onChange={(checked) => onChange({ showPresets: checked })}
                />
                <CheckboxRow
                    label="Vis «Alle av»-knapp"
                    description="Slår av alle lys i panelet."
                    checked={settings.showAllOff !== false}
                    onChange={(checked) => onChange({ showAllOff: checked })}
                />
            </div>
        </>
    );
};

export default LightPanelSettings;
