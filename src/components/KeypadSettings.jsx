import React, { useState } from 'react';
import { Plus, Trash2, Eye, EyeOff, Lock } from 'lucide-react';
import { resolveTileDevice } from '../services/utils';

/**
 * KeypadSettings
 * Props:
 *   - devices:    array of all devices
 *   - settings:   current keypad widgetSettings
 *   - activeTab:  'actions' | 'pin' | 'behavior'  (controlled by parent modal)
 *   - onChange:   fn(updatedSettings)
 */
const KeypadSettings = ({ devices, settings, activeTab, onChange }) => {
    const [local, setLocal] = useState({
        actions: settings?.actions || [],
        pinCode: settings?.pinCode || '',
        successMessage: settings?.successMessage || '',
        errorMessage: settings?.errorMessage || '',
        smartToggle: settings?.smartToggle || false,
    });

    // Form state for adding an action
    const [showActionForm, setShowActionForm] = useState(false);
    const [label, setLabel] = useState('');
    const [device, setDevice] = useState('');
    const [capability, setCapability] = useState('');
    const [value, setValue] = useState('');
    const [requirePin, setRequirePin] = useState(true);

    // PIN state
    const [isPinUnlocked, setIsPinUnlocked] = useState(!settings?.pinCode);
    const [pinCheckInput, setPinCheckInput] = useState('');
    const [pinCheckError, setPinCheckError] = useState(false);
    const [showPinLiteral, setShowPinLiteral] = useState(false);

    const update = (patch) => {
        const next = { ...local, ...patch };
        setLocal(next);
        onChange(next);
    };

    const getCapabilities = (deviceId) => {
        const d = devices.find(dev => dev.id === deviceId);
        if (!d) return [];
        return Object.entries(d.capabilitiesObj || {}).map(([id, obj]) => ({
            id,
            title: obj.title || id
        }));
    };

    const addAction = () => {
        if (!label || !device || !capability) return;
        const selDev = devices.find(d => d.id === device);
        const newAction = {
            id: Date.now().toString(),
            label,
            deviceId: device,
            // Entity-hint så handlingen overlever at HA gir composite-enheten ny device-ID
            entityId: selDev?.primaryEntityId || selDev?.entityId || null,
            capabilityId: capability,
            value,
            requirePin
        };
        const updated = [...local.actions, newAction];
        update({ actions: updated });
        setShowActionForm(false);
        setLabel('');
        setDevice('');
        setCapability('');
        setValue('');
        setRequirePin(true);
    };

    const removeAction = (index) => {
        update({ actions: local.actions.filter((_, i) => i !== index) });
    };

    const inputStyle = {
        width: '100%',
        padding: '8px',
        borderRadius: '4px',
        background: 'var(--color-bg-secondary)',
        color: 'white',
        border: '1px solid var(--color-border)'
    };

    return (
        <div>

            {/* ── Actions ───────────────────────────────── */}
            {activeTab === 'actions' && (
                <div className="form-group" style={{ animation: 'fadeIn 0.2s ease-out' }}>
                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>
                        Legg til knappene/handlingene du ønsker. Åpen døra (med PIN), Lukk (uten PIN) etc.
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                        {local.actions.map((action, index) => {
                            const d = resolveTileDevice(devices, action.deviceId, action.entityId);
                            return (
                                <div key={action.id} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '6px'
                                }}>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
                                            {action.label} {action.requirePin ? '🔒' : '🔓'}
                                        </span>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                                            {d ? d.name : 'Ukjent enhet'} ({action.capabilityId}) = {action.value || 'true'}
                                        </span>
                                    </div>
                                    <button className="icon-btn" onClick={() => removeAction(index)} style={{ color: 'var(--color-error)' }}>
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            );
                        })}
                        {local.actions.length === 0 && (
                            <span style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic', padding: '10px 0' }}>Ingen handlinger lagt til</span>
                        )}
                    </div>

                    {showActionForm ? (
                        <div style={{
                            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                            borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px',
                            animation: 'slideDown 0.2s ease-out'
                        }}>
                            <input
                                type="text"
                                placeholder="Etikett (f.eks. Åpne Bokhylledør)"
                                value={label}
                                onChange={e => setLabel(e.target.value)}
                                style={inputStyle}
                            />
                            <select
                                value={device}
                                onChange={e => { setDevice(e.target.value); setCapability(''); }}
                                style={inputStyle}
                            >
                                <option value="">Velg enhet...</option>
                                {devices.map(d => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </select>

                            {device && (
                                <select
                                    value={capability}
                                    onChange={e => setCapability(e.target.value)}
                                    style={inputStyle}
                                >
                                    <option value="">Velg egenskap...</option>
                                    {getCapabilities(device).map(cap => (
                                        <option key={cap.id} value={cap.id}>{cap.title || cap.id}</option>
                                    ))}
                                </select>
                            )}

                            <input
                                type="text"
                                placeholder="Verdi som sendes (f.eks. true, false, on, off)"
                                value={value}
                                onChange={e => setValue(e.target.value)}
                                style={inputStyle}
                            />

                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '4px' }}>
                                <input
                                    type="checkbox"
                                    checked={requirePin}
                                    onChange={e => setRequirePin(e.target.checked)}
                                />
                                Krever PIN-Kode (Sikkerhetslås)
                            </label>

                            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                <button className="btn btn-secondary" onClick={() => setShowActionForm(false)} style={{ flex: 1 }}>Avbryt</button>
                                <button
                                    className="btn btn-primary"
                                    onClick={addAction}
                                    disabled={!label || !device || !capability}
                                    style={{ flex: 1 }}
                                >
                                    Lagre handling
                                </button>
                            </div>
                        </div>
                    ) : (
                        <button className="btn btn-secondary" onClick={() => setShowActionForm(true)} style={{ width: '100%', padding: '10px' }}>
                            <Plus size={16} style={{ marginRight: '6px' }} />
                            Legg til ny handling
                        </button>
                    )}
                </div>
            )}

            {/* ── PIN Code ─────────────────────────────── */}
            {activeTab === 'pin' && (
                <div className="form-group" style={{ animation: 'fadeIn 0.2s ease-out' }}>
                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '12px' }}>
                        Koden som kreves for å utføre handlinger som er merket med sikkerhetslås.
                    </p>

                    {!local.pinCode || isPinUnlocked ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type={showPinLiteral ? 'text' : 'password'}
                                    pattern="[0-9]*"
                                    inputMode="numeric"
                                    value={local.pinCode}
                                    onChange={e => update({ pinCode: e.target.value })}
                                    placeholder="Legg til ny kode (f.eks. 1234)"
                                    style={{
                                        ...inputStyle,
                                        paddingRight: '40px',
                                        fontSize: '1.2rem',
                                        letterSpacing: showPinLiteral ? '0.2em' : 'normal'
                                    }}
                                />
                                <button
                                    onClick={() => setShowPinLiteral(!showPinLiteral)}
                                    style={{
                                        position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                                        background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer'
                                    }}
                                >
                                    {showPinLiteral ? <EyeOff size={20} /> : <Eye size={20} />}
                                </button>
                            </div>
                            {local.pinCode && <p style={{ fontSize: '0.8rem', color: '#4CAF50', margin: 0 }}>Koden er låst opp og kan endres.</p>}
                        </div>
                    ) : (
                        <div style={{
                            display: 'flex', flexDirection: 'column', gap: '8px', padding: '15px',
                            background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid var(--color-border)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-primary)' }}>
                                <Lock size={18} />
                                <span style={{ fontWeight: 500 }}>PIN-koden er skjult</span>
                            </div>
                            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', margin: 0 }}>
                                Tast inn gjeldende PIN for å se eller endre koden:
                            </p>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    type="password"
                                    pattern="[0-9]*"
                                    inputMode="numeric"
                                    value={pinCheckInput}
                                    onChange={e => { setPinCheckInput(e.target.value); setPinCheckError(false); }}
                                    placeholder="Gjeldende PIN"
                                    style={{
                                        ...inputStyle,
                                        flex: 1,
                                        border: pinCheckError ? '1px solid var(--color-error)' : '1px solid var(--color-border)'
                                    }}
                                />
                                <button
                                    className="btn btn-primary"
                                    onClick={() => {
                                        if (pinCheckInput === local.pinCode) {
                                            setIsPinUnlocked(true);
                                            setPinCheckError(false);
                                            setPinCheckInput('');
                                        } else {
                                            setPinCheckError(true);
                                        }
                                    }}
                                >
                                    Lås opp
                                </button>
                            </div>
                            {pinCheckError && <span style={{ fontSize: '0.8rem', color: 'var(--color-error)', margin: 0 }}>Feil PIN-kode</span>}
                        </div>
                    )}
                </div>
            )}

            {/* ── Behavior / Messages ─────────────────────────────── */}
            {activeTab === 'behavior' && (
                <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
                    <div className="form-group">
                        <label>Suksess Melding (Valgfritt)</label>
                        <input
                            type="text"
                            value={local.successMessage}
                            onChange={e => update({ successMessage: e.target.value })}
                            placeholder="F.eks. Låst Opp"
                            style={{ ...inputStyle, width: '100%' }}
                        />
                    </div>
                    <div className="form-group">
                        <label>Feil Melding (Valgfritt)</label>
                        <input
                            type="text"
                            value={local.errorMessage}
                            onChange={e => update({ errorMessage: e.target.value })}
                            placeholder="F.eks. Feil Kode"
                            style={{ ...inputStyle, width: '100%' }}
                        />
                    </div>

                    <div className="form-group" style={{
                        display: 'flex', alignItems: 'flex-start', gap: '12px', marginTop: '15px',
                        padding: '15px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', border: '1px solid var(--color-border)'
                    }}>
                        <input
                            type="checkbox"
                            id="keypad-smart-toggle"
                            checked={local.smartToggle}
                            onChange={e => update({ smartToggle: e.target.checked })}
                            style={{ width: '18px', height: '18px', cursor: 'pointer', marginTop: '2px' }}
                        />
                        <label htmlFor="keypad-smart-toggle" style={{ margin: 0, cursor: 'pointer', flex: 1 }}>
                            <strong>Smart Toggle</strong><br />
                            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', fontWeight: 400, display: 'block', marginTop: '4px' }}>
                                Gjett neste handling automatisk basert på enheters nåværende tilstand (on/off), og hopp over handlingsmenyen for å bare vise talltastaturet umiddelbart.
                            </span>
                        </label>
                    </div>
                </div>
            )}
        </div>
    );
};

export default KeypadSettings;
