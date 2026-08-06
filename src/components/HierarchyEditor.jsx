import React, { useState } from 'react';
import { ChevronRight, ArrowLeft, Plus, Trash2, Edit2, Folder, Zap, Settings, Search, Check, ArrowUp, ArrowDown, Home, Box, Layers, Sun, Snowflake, Droplet, Wind, Palette, X, Coins, Banknote, Gauge, Activity } from 'lucide-react';

// Norske titler for vanlige capability-ID-er (brukes som fallback når capObj.title ikke er satt)
const CAP_TITLE_MAP = {
    'measure_power': 'Effekt',
    'measure_temperature': 'Temperatur',
    'measure_humidity': 'Luftfuktighet',
    'measure_pressure': 'Trykk',
    'measure_luminance': 'Lys',
    'measure_co2': 'CO₂',
    'measure_current': 'Strøm',
    'measure_voltage': 'Spenning',
    'measure_generic': 'Generell verdi',
    'measure_water': 'Vann',
    'meter_power': 'Energi totalt',
    'meter_power.current_session': 'Energi (økt)',
    'meter_power.last_session': 'Energi (forrige økt)',
    'meter_gas': 'Gass totalt',
    'meter_water': 'Vann totalt',
    'fill_level': 'Fyllingsgrad',
    'energy_in_tank': 'Lagret energi',
    'energy_daily': 'Energi i dag',
    'energy_monthly': 'Energi denne måneden',
    'energy_yesterday': 'Energi i går',
    'power_estimated': 'Estimert effekt',
    'target_temperature': 'Ønsket temperatur',
    'cost_current': 'Kostnad nå',
    'cost_daily': 'Kostnad i dag',
    'cost_monthly': 'Kostnad denne måneden',
    'cost_prev_month': 'Kostnad forrige måned',
    'cost_ytd': 'Kostnad hittil i år',
    'energy_prev_month': 'Energi forrige måned',
    'energy_ytd': 'Energi hittil i år',
    'allocated_current': 'Tildelt strøm',
    'available_current_limit': 'Tilgjengelig strøm',
    'charge_mode': 'Lademodus',
    'measure_current.phase1': 'Strøm fase 1',
    'measure_current.phase2': 'Strøm fase 2',
    'measure_current.phase3': 'Strøm fase 3',
    'washdata_time_remaining': 'Tid igjen',
    'washdata_cycle_count': 'Antall sykluser',
};

const getCapTitle = (capId, capObj) => {
    if (capObj?.title) return capObj.title;
    return CAP_TITLE_MAP[capId] || capId;
};

const HierarchyEditor = ({ hierarchy, onChange, devices, theme }) => {
    // path is array of indices
    const [path, setPath] = useState([]);

    // Helper: Clone tree to avoid mutation
    const clone = (obj) => JSON.parse(JSON.stringify(obj));

    // Icon Helper (Duplicated from HierarchyTile for consistency)
    const getIcon = (iconName, size = 20, theme = 'default') => {
        const IconMap = {
            'Home': Home, 'Zap': Zap, 'Activity': Activity, 'Box': Box, 'Layers': Layers,
            'Sun': Sun, 'Snowflake': Snowflake, 'Droplet': Droplet, 'Wind': Wind,
            'Coins': Coins, 'Banknote': Banknote, 'Gauge': Gauge
        };

        let finalIconName = iconName;
        if (!finalIconName || finalIconName === 'default') {
            if (theme === 'money') finalIconName = 'Coins';
            else if (theme === 'power') finalIconName = 'Zap';
            else finalIconName = 'Zap';
        }

        const IconCmp = IconMap[finalIconName] || IconMap[iconName] || Zap;
        return <IconCmp size={size} />;
    };

    const resolveNode = (root, pathIndices) => {
        let current = root;
        for (const idx of pathIndices) {
            if (!current.children) current.children = [];
            if (!current.children[idx]) return current;
            current = current.children[idx];
        }
        return current;
    };

    const root = hierarchy || { name: 'Ny Hierarki', children: [] };
    const currentNode = resolveNode(root, path);

    const handleUpdateRoot = (newRoot) => {
        onChange(newRoot);
    };

    // --- Actions ---

    const handleAddChild = () => {
        const newRoot = clone(root);
        const parent = resolveNode(newRoot, path);
        if (!parent.children) parent.children = [];
        parent.children.push({ name: 'Ny Gruppe', children: [] });
        handleUpdateRoot(newRoot);
    };

    // Legg til capability-par (deviceId::capId) som løvnoder
    const handleAddCapabilityPairs = (selectedPairIds, allCapItems) => {
        const newRoot = clone(root);
        const parent = resolveNode(newRoot, path);
        if (!parent.children) parent.children = [];

        selectedPairIds.forEach(pairId => {
            const item = allCapItems.find(c => c.id === pairId);
            if (!item) return;
            parent.children.push({
                name: item.label,
                deviceId: item.deviceId,
                capability: item.capability,
                children: []
            });
        });

        handleUpdateRoot(newRoot);
    };

    const handleDeleteChild = (index, e) => {
        e.stopPropagation();
        // Direct delete (User can Cancel modal to undo)

        const newRoot = clone(root);
        const parent = resolveNode(newRoot, path);
        parent.children.splice(index, 1);
        handleUpdateRoot(newRoot);
    };

    const handleMoveChild = (index, direction) => {
        const newRoot = clone(root);
        const parent = resolveNode(newRoot, path);
        if (!parent.children) return;

        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= parent.children.length) return;

        // Swap
        [parent.children[index], parent.children[newIndex]] = [parent.children[newIndex], parent.children[index]];
        handleUpdateRoot(newRoot);
    };

    const handleUpdateChildInList = (index, updates) => {
        const newRoot = clone(root);
        const parent = resolveNode(newRoot, path);
        parent.children[index] = { ...parent.children[index], ...updates };
        handleUpdateRoot(newRoot);
    };

    const handleUpdateCurrentNode = (updates) => {
        const newRoot = clone(root);
        const node = resolveNode(newRoot, path);
        Object.assign(node, updates);
        handleUpdateRoot(newRoot);
    };

    // --- State ---
    const [editingTarget, setEditingTarget] = useState(null);
    const [showDevicePicker, setShowDevicePicker] = useState(false);
    const [showDeviceLinker, setShowDeviceLinker] = useState(false); // Koble til enhet-picker
    const [deviceLinkerSearch, setDeviceLinkerSearch] = useState('');

    // Capability Picker State
    const [pickerSearch, setPickerSearch] = useState('');
    const [selectedPickerIds, setSelectedPickerIds] = useState([]);

    const togglePickerId = (id) => {
        if (selectedPickerIds.includes(id)) {
            setSelectedPickerIds(selectedPickerIds.filter(x => x !== id));
        } else {
            setSelectedPickerIds([...selectedPickerIds, id]);
        }
    };

    const confirmPicker = (allCapItems) => {
        handleAddCapabilityPairs(selectedPickerIds, allCapItems);
        setShowDevicePicker(false);
        setSelectedPickerIds([]);
        setPickerSearch('');
    };

    const openEditChild = (index, e) => {
        e.stopPropagation();
        const child = currentNode.children[index];
        setEditingTarget({
            type: 'child',
            index: index,
            data: {
                name: child.name,
                deviceId: child.deviceId || '',
                capability: child.capability || 'measure_power',
                icon: child.icon || 'default',
                color: child.color || ''
            }
        });
    };

    const openEditCurrent = () => {
        setEditingTarget({
            type: 'current',
            index: null,
            data: {
                name: currentNode.name,
                deviceId: currentNode.deviceId || '',
                capability: currentNode.capability || 'measure_power',
                icon: currentNode.icon || 'default',
                color: currentNode.color || ''
            }
        });
    };

    const saveEdit = () => {
        if (editingTarget.type === 'child') {
            handleUpdateChildInList(editingTarget.index, editingTarget.data);
        } else {
            handleUpdateCurrentNode(editingTarget.data);
        }
        setEditingTarget(null);
    };

    // --- Render ---

    // 1. Capability-Picker Overlay – viser individuelle målinger (capability-par)
    if (showDevicePicker) {
        // Bygg flat liste av alle numeriske capability-par fra alle enheter
        const allCapItems = [];
        for (const dev of devices) {
            for (const cap of (dev.capabilities || [])) {
                const capObj = dev.capabilitiesObj?.[cap];
                if (!capObj) continue;
                if (capObj.type !== 'number') continue; // kun tallverdier
                const resolvedTitle = getCapTitle(cap, capObj);
                // Beste tilgjengelige ID for identifikasjon:
                // 1. capObj.entity_id (satt av generic composite-mapping)
                // 2. dev.entityId (standalone HA-entiteter)
                // 3. dev.id (fallback – kan være composite:uuid for composites)
                const displayId = capObj.entity_id || dev.entityId || dev.id || '';
                allCapItems.push({
                    id: `${dev.id}::${cap}`,
                    deviceId: dev.id,
                    capability: cap,
                    label: `${dev.name} – ${resolvedTitle}`,
                    capTitle: resolvedTitle,
                    deviceName: dev.name,
                    zoneName: dev.zoneName || '',
                    capId: cap,
                    value: capObj.value,
                    unit: capObj.units || capObj.unit || '',
                    displayId,
                });
            }
        }

        // Sorter: rom → enhetsnavn → capability-tittel
        allCapItems.sort((a, b) => {
            const zA = a.zoneName || 'Ø';
            const zB = b.zoneName || 'Ø';
            if (zA !== zB) return zA.localeCompare(zB, 'no');
            if (a.deviceName !== b.deviceName) return a.deviceName.localeCompare(b.deviceName, 'no');
            return a.capTitle.localeCompare(b.capTitle, 'no');
        });

        const q = pickerSearch.toLowerCase();
        const filtered = allCapItems.filter(item =>
            item.deviceName.toLowerCase().includes(q) ||
            item.capTitle.toLowerCase().includes(q) ||
            item.capId.toLowerCase().includes(q) ||
            item.zoneName.toLowerCase().includes(q) ||
            (item.displayId || '').toLowerCase().includes(q)
        );

        // Grupper etter rom for visning (ikke enhetsnavn, som kan være like/generiske)
        const groups = [];
        let lastZone = null;
        for (const item of filtered) {
            const zone = item.zoneName || '';
            if (zone !== lastZone) {
                groups.push({ type: 'header', label: zone || 'Ingen sone' });
                lastZone = zone;
            }
            groups.push({ type: 'cap', item });
        }

        return (
            <div className="hierarchy-device-picker" style={{ background: 'var(--color-bg-secondary)', padding: '16px', borderRadius: '8px', display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                    <button className="icon-btn" onClick={() => setShowDevicePicker(false)}>
                        <ArrowLeft size={20} />
                    </button>
                    <h4 style={{ margin: '0 0 0 12px' }}>Legg til målinger</h4>
                </div>
                <p style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '12px', marginLeft: '2px' }}>
                    Velg enkelt-verdier (effekt, energi, kostnad, temp...) som skal inngå i hierarkiet.
                </p>

                <div style={{ position: 'relative', marginBottom: '12px' }}>
                    <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', opacity: 0.5 }} />
                    <input
                        type="text"
                        className="form-control"
                        placeholder="Søk på navn, variabel eller rom..."
                        style={{ paddingLeft: '32px' }}
                        value={pickerSearch}
                        onChange={e => setPickerSearch(e.target.value)}
                    />
                </div>

                <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: '8px' }}>
                    {groups.map((item, i) => {
                        if (item.type === 'header') {
                            return (
                                <div key={`h-${i}`} style={{
                                    padding: '5px 10px',
                                    fontSize: '0.7rem',
                                    fontWeight: 700,
                                    letterSpacing: '0.04em',
                                    textTransform: 'uppercase',
                                    opacity: 0.5,
                                    background: 'rgba(0,0,0,0.25)',
                                    borderBottom: '1px solid var(--color-border)',
                                    position: 'sticky',
                                    top: 0
                                }}>
                                    {item.label}
                                </div>
                            );
                        }
                        const { item: capItem } = item;
                        const isSelected = selectedPickerIds.includes(capItem.id);
                        return (
                            <div
                                key={capItem.id}
                                onClick={() => togglePickerId(capItem.id)}
                                style={{
                                    padding: '8px 10px',
                                    borderBottom: '1px solid var(--color-border)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    cursor: 'pointer',
                                    background: isSelected ? 'rgba(var(--color-accent-rgb), 0.1)' : 'transparent'
                                }}
                            >
                                <div style={{
                                    width: '18px', height: '18px',
                                    borderRadius: '4px', border: '1px solid var(--color-border)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0,
                                    background: isSelected ? 'var(--color-accent)' : 'transparent'
                                }}>
                                    {isSelected && <Check size={12} color="white" />}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                                    <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>
                                        {capItem.deviceName} – {capItem.capTitle}
                                    </span>
                                    <span style={{ fontSize: '0.7rem', opacity: 0.45, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {(!capItem.displayId || capItem.displayId.startsWith('composite:'))
                                            ? capItem.capId
                                            : `${capItem.displayId} · ${capItem.capId}`}
                                    </span>
                                </div>
                                {capItem.value !== undefined && capItem.value !== null && (
                                    <span style={{ fontSize: '0.8rem', opacity: 0.6, flexShrink: 0 }}>
                                        {typeof capItem.value === 'number' ? capItem.value.toFixed(1) : capItem.value}
                                        {capItem.unit ? ` ${capItem.unit}` : ''}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                    {groups.length === 0 && (
                        <div style={{ padding: '20px', textAlign: 'center', opacity: 0.5 }}>Ingen målinger funnet</div>
                    )}
                </div>

                <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
                    <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowDevicePicker(false)}>Avbryt</button>
                    <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => confirmPicker(allCapItems)} disabled={selectedPickerIds.length === 0}>
                        Legg til ({selectedPickerIds.length})
                    </button>
                </div>
            </div>
        );
    }

    // 2. Edit Form
    if (editingTarget) {
        return (
            <div className="hierarchy-editor-form" style={{ background: 'var(--color-bg-secondary)', padding: '16px', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
                    <button className="icon-btn" onClick={() => setEditingTarget(null)}>
                        <ArrowLeft size={20} />
                    </button>
                    <h4 style={{ margin: '0 0 0 12px' }}>
                        {editingTarget.type === 'current' ? 'Rediger Denne Gruppen' : 'Rediger Enhet / Gruppe'}
                    </h4>
                </div>

                <div className="form-group">
                    <label>Navn</label>
                    <input
                        type="text"
                        value={editingTarget.data.name}
                        onChange={e => setEditingTarget({
                            ...editingTarget,
                            data: { ...editingTarget.data, name: e.target.value }
                        })}
                        className="form-control"
                    />
                </div>

                <div className="form-group">
                    <label>Koble til enhet</label>
                    <p style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '8px' }}>
                        Hvis valgt, vises denne enhetens data her. Hvis 'Ingen', vises summen av undergruppene.
                    </p>

                    {/* Valgt enhet – vis og klikk for å bytte */}
                    {!showDeviceLinker ? (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <div
                                onClick={() => { setShowDeviceLinker(true); setDeviceLinkerSearch(''); }}
                                style={{
                                    flex: 1, padding: '8px 12px', borderRadius: '8px',
                                    border: '1px solid var(--color-border)',
                                    background: 'var(--color-bg-secondary)',
                                    cursor: 'pointer', display: 'flex', flexDirection: 'column'
                                }}
                            >
                                {editingTarget.data.deviceId ? (() => {
                                    const d = devices.find(x => x.id === editingTarget.data.deviceId);
                                    const dispId = d?.entityId || d?.id || '';
                                    return <>
                                        <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{d?.name || editingTarget.data.deviceId}</span>
                                        {dispId && !dispId.startsWith('composite:') && (
                                            <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>{dispId}</span>
                                        )}
                                    </>;
                                })() : (
                                    <span style={{ opacity: 0.5, fontSize: '0.9rem' }}>-- Ingen (Gruppe / Summering) --</span>
                                )}
                            </div>
                            {editingTarget.data.deviceId && (
                                <button className="icon-btn" onClick={() => setEditingTarget({ ...editingTarget, data: { ...editingTarget.data, deviceId: '' } })} title="Fjern kobling">
                                    <X size={16} />
                                </button>
                            )}
                        </div>
                    ) : (
                        /* Inline enhet-picker */
                        <div style={{ border: '1px solid var(--color-border)', borderRadius: '8px', overflow: 'hidden' }}>
                            <div style={{ padding: '8px', background: 'rgba(0,0,0,0.2)', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <Search size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
                                <input
                                    type="text"
                                    autoFocus
                                    className="form-control"
                                    placeholder="Søk på navn, rom eller ID..."
                                    style={{ padding: '4px 8px', fontSize: '0.85rem' }}
                                    value={deviceLinkerSearch}
                                    onChange={e => setDeviceLinkerSearch(e.target.value)}
                                />
                                <button className="icon-btn" onClick={() => setShowDeviceLinker(false)} title="Lukk">
                                    <X size={14} />
                                </button>
                            </div>
                            <div style={{ maxHeight: '220px', overflowY: 'auto' }}>
                                {/* Ingen-valg */}
                                <div
                                    onClick={() => { setEditingTarget({ ...editingTarget, data: { ...editingTarget.data, deviceId: '' } }); setShowDeviceLinker(false); }}
                                    style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-border)', cursor: 'pointer', opacity: 0.6, fontSize: '0.85rem' }}
                                >
                                    -- Ingen (Gruppe / Summering) --
                                </div>
                                {(() => {
                                    const q = deviceLinkerSearch.toLowerCase();
                                    const sorted = [...devices].sort((a, b) => {
                                        const zA = a.zoneName || 'Ø';
                                        const zB = b.zoneName || 'Ø';
                                        if (zA !== zB) return zA.localeCompare(zB, 'no');
                                        return a.name.localeCompare(b.name, 'no');
                                    });
                                    const filtered = q
                                        ? sorted.filter(d =>
                                            d.name.toLowerCase().includes(q) ||
                                            (d.zoneName || '').toLowerCase().includes(q) ||
                                            (d.entityId || d.id || '').toLowerCase().includes(q)
                                          )
                                        : sorted;

                                    let lastZone = null;
                                    return filtered.map(d => {
                                        const zone = d.zoneName || '';
                                        const dispId = d.entityId || d.id || '';
                                        const isSelected = d.id === editingTarget.data.deviceId;
                                        const header = zone !== lastZone ? (lastZone = zone, (
                                            <div key={`z-${zone}`} style={{
                                                padding: '4px 12px', fontSize: '0.65rem', fontWeight: 700,
                                                textTransform: 'uppercase', letterSpacing: '0.05em',
                                                opacity: 0.45, background: 'rgba(0,0,0,0.2)',
                                                borderBottom: '1px solid var(--color-border)', position: 'sticky', top: 0
                                            }}>
                                                {zone || 'Ingen sone'}
                                            </div>
                                        )) : null;
                                        return [header, (
                                            <div
                                                key={d.id}
                                                onClick={() => { setEditingTarget({ ...editingTarget, data: { ...editingTarget.data, deviceId: d.id } }); setShowDeviceLinker(false); }}
                                                style={{
                                                    padding: '8px 12px', borderBottom: '1px solid var(--color-border)',
                                                    cursor: 'pointer', display: 'flex', flexDirection: 'column',
                                                    background: isSelected ? 'rgba(var(--color-accent-rgb),0.12)' : 'transparent'
                                                }}
                                            >
                                                <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{d.name}</span>
                                                {dispId && !dispId.startsWith('composite:') && (
                                                    <span style={{ fontSize: '0.7rem', opacity: 0.45 }}>{dispId}</span>
                                                )}
                                            </div>
                                        )];
                                    });
                                })()}
                            </div>
                        </div>
                    )}
                </div>

                {editingTarget.data.deviceId && (
                    <div className="form-group">
                        <label>Variabel</label>
                        <p style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '8px' }}>
                            Hvilken verdi fra enheten skal vises / summeres.
                        </p>
                        <select
                            className="form-control"
                            value={editingTarget.data.capability}
                            onChange={e => setEditingTarget({
                                ...editingTarget,
                                data: { ...editingTarget.data, capability: e.target.value }
                            })}
                        >
                            {(() => {
                                const dev = devices.find(d => d.id === editingTarget.data.deviceId);
                                if (!dev) return <option value="measure_power">measure_power</option>;
                                return [...dev.capabilities]
                                    .sort((a, b) => {
                                        const tA = dev.capabilitiesObj?.[a]?.title || a;
                                        const tB = dev.capabilitiesObj?.[b]?.title || b;
                                        return tA.localeCompare(tB, 'no');
                                    })
                                    .map(cap => {
                                        const title = dev.capabilitiesObj?.[cap]?.title;
                                        return (
                                            <option key={cap} value={cap}>
                                                {title ? `${title}  –  ${cap}` : cap}
                                            </option>
                                        );
                                    });
                            })()}
                        </select>
                    </div>
                )}

                <div className="form-group" style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                    <div style={{ flex: 1 }}>
                        <label>Ikon</label>
                        <select
                            className="form-control"
                            value={editingTarget.data.icon || 'default'}
                            onChange={e => setEditingTarget({
                                ...editingTarget,
                                data: { ...editingTarget.data, icon: e.target.value }
                            })}
                        >
                            <option value="default">Standard</option>
                            <option value="Home">Hjem</option>
                            <option value="Zap">Strøm (Lyn)</option>
                            <option value="Activity">Aktivitet (Puls)</option>
                            <option value="Box">Boks</option>
                            <option value="Layers">Lag/Etasje</option>
                            <option value="Sun">Sol/Varmt</option>
                            <option value="Snowflake">Snø/Kaldt</option>
                            <option value="Droplet">Vann</option>
                            <option value="Wind">Vind</option>
                            <option value="Coins">Mynter (Pris)</option>
                            <option value="Banknote">Seddel (Kostnad)</option>
                            <option value="Gauge">Måler</option>
                        </select>
                    </div>
                    <div>
                        <label>Farge</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                                type="color"
                                value={editingTarget.data.color || '#ffffff'}
                                onChange={e => setEditingTarget({
                                    ...editingTarget,
                                    data: { ...editingTarget.data, color: e.target.value }
                                })}
                                style={{
                                    width: '40px',
                                    height: '40px',
                                    border: 'none',
                                    borderRadius: '4px',
                                    background: 'transparent',
                                    cursor: 'pointer'
                                }}
                            />
                            {editingTarget.data.color && (
                                <button
                                    className="icon-btn"
                                    onClick={() => setEditingTarget({
                                        ...editingTarget,
                                        data: { ...editingTarget.data, color: '' }
                                    })}
                                    title="Tilbakestill farge"
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                    <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setEditingTarget(null)}>Avbryt</button>
                    <button className="btn btn-primary" style={{ flex: 1 }} onClick={saveEdit}>Lagre</button>
                </div>
            </div>
        );
    }

    // 3. Browser View
    return (
        <div className="hierarchy-browser">
            {/* Header: Breadcrumbs + Edit Current Node */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', overflow: 'hidden' }}>
                    {path.length > 0 && (
                        <button onClick={() => setPath(path.slice(0, -1))} className="icon-btn-small">
                            <ArrowLeft size={16} />
                        </button>
                    )}
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {getIcon(currentNode.icon, 20, theme)}
                        <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{currentNode.name || 'Rot'}</span>
                    </span>
                </div>

                <button className="icon-btn" onClick={openEditCurrent} title="Innstillinger for denne gruppen">
                    <Settings size={16} />
                </button>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button className="btn btn-primary" onClick={() => setShowDevicePicker(true)} style={{ flex: 1, justifyContent: 'center' }}>
                    <Plus size={16} style={{ marginRight: '6px' }} />
                    Legg til målinger
                </button>
                <button className="btn btn-secondary" onClick={handleAddChild} style={{ flex: 1, justifyContent: 'center' }}>
                    <Folder size={16} style={{ marginRight: '6px' }} />
                    Ny Gruppe
                </button>
            </div>

            {/* List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {currentNode.children?.map((child, index) => {
                    const isGroup = !child.deviceId;
                    return (
                        <div key={index} style={{
                            background: 'rgba(255,255,255,0.05)',
                            padding: '12px',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: isGroup ? 'pointer' : 'default'
                        }}
                            onClick={() => isGroup && setPath([...path, index])}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                                {getIcon(child.icon, 20, theme)}
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontWeight: 600 }}>{child.name}</span>
                                    <span style={{ fontSize: '0.75rem', opacity: 0.6 }}>
                                        {child.deviceId ? devices.find(d => d.id === child.deviceId)?.name || 'Enhet' :
                                            `${child.children?.length || 0} elementer`}
                                    </span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', marginRight: '8px' }}>
                                    <button
                                        className="icon-btn-small"
                                        onClick={(e) => { e.stopPropagation(); handleMoveChild(index, -1); }}
                                        disabled={index === 0}
                                        style={{ params: '4px', opacity: index === 0 ? 0.3 : 1 }}
                                    >
                                        <ArrowUp size={14} />
                                    </button>
                                    <button
                                        className="icon-btn-small"
                                        onClick={(e) => { e.stopPropagation(); handleMoveChild(index, 1); }}
                                        disabled={index === currentNode.children.length - 1}
                                        style={{ params: '4px', opacity: index === currentNode.children.length - 1 ? 0.3 : 1 }}
                                    >
                                        <ArrowDown size={14} />
                                    </button>
                                </div>

                                <button className="icon-btn" onClick={(e) => openEditChild(index, e)} title="Rediger">
                                    <Edit2 size={16} />
                                </button>
                                <button className="icon-btn" onClick={(e) => handleDeleteChild(index, e)} style={{ color: 'var(--color-error)' }} title="Slett">
                                    <Trash2 size={16} />
                                </button>
                                {isGroup && <ChevronRight size={16} style={{ opacity: 0.3, marginLeft: '4px' }} />}
                            </div>
                        </div>
                    );
                })}

                {(!currentNode.children || currentNode.children.length === 0) && (
                    <div className="text-center opacity-50 py-8" style={{ fontStyle: 'italic', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '8px' }}>
                        Gruppen er tom.
                    </div>
                )}
            </div>
        </div>
    );
};

export default HierarchyEditor;
