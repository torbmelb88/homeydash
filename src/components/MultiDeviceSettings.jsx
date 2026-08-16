import React, { useState } from 'react';
import { Save, Trash2, Plus, Search, X } from 'lucide-react';
import { resolveTileDevice } from '../services/utils';

// Felles enhetsliste-redigering for multi-fliser (multi-light, multi-thermostat).
// deviceFilter avgjør hvilke enheter som kan velges; listLabel er overskriften.
const MultiDeviceSettings = ({ devices, multiDevices, settings, onChange, deviceFilter, listLabel = 'Valgte enheter' }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [showDeviceSearch, setShowDeviceSearch] = useState(false);
    const [editingDeviceId, setEditingDeviceId] = useState(null);
    const [tempName, setTempName] = useState('');

    const filteredDevices = devices.filter(d => {
        if (!d.name.toLowerCase().includes(searchTerm.toLowerCase())) return false;
        if (d._inComposite) return false;
        return deviceFilter(d);
    });

    const addMultiDevice = (device) => {
        if (!multiDevices.includes(device.id)) {
            const change = { multiDevices: [...multiDevices, device.id] };
            // Entity-hint så raden overlever at HA gir composite-enheten ny device-ID
            if (device.primaryEntityId) {
                change.settings = {
                    deviceEntityHints: {
                        ...(settings.deviceEntityHints || {}),
                        [device.id]: device.primaryEntityId
                    }
                };
            }
            onChange(change);
        }
        setShowDeviceSearch(false);
        setSearchTerm('');
    };

    const removeMultiDevice = (index) => {
        onChange({ multiDevices: multiDevices.filter((_, i) => i !== index) });
    };

    const moveDevice = (index, direction) => {
        const newDevices = [...multiDevices];
        if (direction === 'up' && index > 0) {
            [newDevices[index - 1], newDevices[index]] = [newDevices[index], newDevices[index - 1]];
        } else if (direction === 'down' && index < newDevices.length - 1) {
            [newDevices[index + 1], newDevices[index]] = [newDevices[index], newDevices[index + 1]];
        }
        onChange({ multiDevices: newDevices });
    };

    const startEditingName = (deviceId, currentName) => {
        setEditingDeviceId(deviceId);
        setTempName(currentName);
    };

    const saveCustomName = (deviceId) => {
        onChange({
            settings: {
                customNames: {
                    ...(settings.customNames || {}),
                    [deviceId]: tempName
                }
            }
        });
        setEditingDeviceId(null);
    };

    return (
        <div className="form-group">
            <div className="form-group">
                <label>{listLabel}</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                    {multiDevices.map((deviceId, index) => {
                        const d = resolveTileDevice(devices, deviceId, settings.deviceEntityHints?.[deviceId]);
                        const customName = settings.customNames?.[deviceId] || d?.name || deviceId;

                        return (
                            <div key={deviceId} style={{ display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.05)', borderRadius: '6px', overflow: 'hidden' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px' }}>
                                    {editingDeviceId === deviceId ? (
                                        <div style={{ display: 'flex', gap: '8px', flex: 1, marginRight: '8px' }}>
                                            <input
                                                autoFocus
                                                type="text"
                                                value={tempName}
                                                onChange={(e) => setTempName(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') saveCustomName(deviceId);
                                                    if (e.key === 'Escape') setEditingDeviceId(null);
                                                }}
                                                style={{ flex: 1, padding: '4px', borderRadius: '4px', border: '1px solid var(--color-accent-primary)', background: 'var(--color-bg-secondary)', color: 'white' }}
                                            />
                                            <button className="icon-btn" onClick={() => saveCustomName(deviceId)}><Save size={16} /></button>
                                        </div>
                                    ) : (
                                        <span style={{ fontSize: '0.9rem', cursor: 'pointer', flex: 1 }} onClick={() => startEditingName(deviceId, customName)} title="Klikk for å endre navn">
                                            {customName}
                                        </span>
                                    )}

                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        <button className="icon-btn" disabled={index === 0} onClick={() => moveDevice(index, 'up')}>↑</button>
                                        <button className="icon-btn" disabled={index === multiDevices.length - 1} onClick={() => moveDevice(index, 'down')}>↓</button>
                                        <button className="icon-btn" onClick={() => removeMultiDevice(index)} style={{ color: 'var(--color-error)' }}><Trash2 size={16} /></button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                    {multiDevices.length === 0 && <span style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>Ingen enheter lagt til</span>}
                </div>

                {showDeviceSearch ? (
                    <div style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                            <Search size={16} />
                            <input
                                type="text"
                                placeholder="Søk etter enhet..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                autoFocus
                                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'white' }}
                            />
                            <button className="icon-btn" onClick={() => setShowDeviceSearch(false)}><X size={16} /></button>
                        </div>
                        <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {filteredDevices.map(d => (
                                <button
                                    key={d.id}
                                    className="btn btn-ghost"
                                    onClick={() => addMultiDevice(d)}
                                    style={{ justifyContent: 'flex-start', padding: '8px 6px', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}
                                >
                                    <span style={{ fontSize: '0.9rem' }}>{d.name}</span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', display: 'flex', gap: '8px' }}>
                                        {d.zoneName && <span>{d.zoneName}</span>}
                                        {d.entityId && <span style={{ opacity: 0.6 }}>{d.entityId}</span>}
                                    </span>
                                </button>
                            ))}
                            {filteredDevices.length === 0 && <div style={{ padding: '10px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>Ingen treff</div>}
                        </div>
                    </div>
                ) : (
                    <button className="btn btn-secondary" onClick={() => setShowDeviceSearch(true)} style={{ width: '100%', justifyContent: 'center' }}>
                        <Plus size={16} style={{ marginRight: '6px' }} />
                        Legg til enhet
                    </button>
                )}
            </div>
        </div>
    );
};

export default MultiDeviceSettings;
