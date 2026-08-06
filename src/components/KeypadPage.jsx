import React, { useState, useEffect, useMemo } from 'react';
import { Lock, Unlock, Delete, Settings } from 'lucide-react';
import { useHomey } from '../context/HomeyContext';
import { storage } from '../services/storage';

// Helside-variant av KeypadTile (kodepanelet), tilpasset NSPanel Pro (480×480).
// Gjenbruker innstillingene (handlinger, PIN, meldinger) fra en eksisterende
// kodepanel-flis — ingen egen konfigurasjon på siden. Velg kildeflis i redigeringsmodus
// hvis det finnes flere.

const parseValue = (raw) => {
    let val = raw || 'true';
    if (val === 'true') return true;
    if (val === 'false') return false;
    if (!isNaN(Number(val)) && String(val).trim() !== '') return Number(val);
    return val;
};

export default function KeypadPage({ page }) {
    const { api, devices, pages, isEditMode, updatePage } = useHomey();
    const [input, setInput] = useState('');
    const [status, setStatus] = useState('idle'); // idle, success, error

    // Fliser ligger i en flat liste i storage (med pageId), ikke på sideobjektene.
    // Last på mount og ved utgang fra redigeringsmodus (plukker opp endrede innstillinger).
    const [allTiles, setAllTiles] = useState([]);
    useEffect(() => {
        let cancelled = false;
        storage.get('tiles')
            .then(t => { if (!cancelled) setAllTiles(t || []); })
            .catch(e => console.error('KeypadPage: Failed to load tiles', e));
        return () => { cancelled = true; };
    }, [isEditMode]);

    // Finn alle kodepanel-fliser på tvers av sider
    const keypadTiles = useMemo(() =>
        allTiles
            .filter(t => t.type === 'keypad')
            .map(t => ({ tile: t, pageName: pages.find(p => p.id === t.pageId)?.name || '' })),
    [allTiles, pages]);

    const source = keypadTiles.find(k => k.tile.id === page.keypadTileId) || keypadTiles[0];
    const settings = source?.tile.settings;
    const actions = settings?.actions || [];
    const pinCode = settings?.pinCode || '0000';

    // Samme logikk som KeypadTile: første handling der enheten ikke allerede står i målverdien
    const nextAction = useMemo(() => {
        if (actions.length === 0) return null;
        for (const action of actions) {
            const dev = devices.find(d => d.id === action.deviceId);
            if (!dev) continue;
            const targetVal = parseValue(action.value);
            const currentVal = dev.capabilitiesObj?.[action.capabilityId]?.value;
            if (currentVal !== targetVal) return action;
        }
        return actions[0];
    }, [actions, devices]);

    const executeAction = async (action) => {
        try {
            await api.setCapability(action.deviceId, action.capabilityId, parseValue(action.value));
            setStatus('success');
        } catch (e) {
            console.error('KeypadPage: Failed to set capability', e);
            setStatus('error');
        }
        setTimeout(() => {
            setStatus('idle');
            setInput('');
        }, 2500);
    };

    const handleCheckPin = (currentInput) => {
        if (currentInput === pinCode) {
            executeAction(nextAction);
        } else {
            setStatus('error');
            setTimeout(() => setInput(''), 400);
        }
    };

    useEffect(() => {
        if (input.length === pinCode.length && status === 'idle' && pinCode.length > 0) {
            handleCheckPin(input);
        }
    }, [input]);

    const handlePress = (num) => {
        if (status === 'error') {
            setStatus('idle');
            setInput(String(num));
            return;
        }
        if (status !== 'idle') return;
        if (input.length < pinCode.length) setInput(prev => prev + num);
    };

    const handleDelete = () => {
        if (status === 'error') {
            setStatus('idle');
            setInput('');
            return;
        }
        if (status !== 'idle') return;
        setInput(prev => prev.slice(0, -1));
    };

    const requiresPin = nextAction?.requirePin !== false;
    const buttons = [1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'del'];
    const displayColor = status === 'success' ? '#4CAF50' : status === 'error' ? '#F44336' : 'rgba(255, 255, 255, 0.06)';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-bg-main, #0f1117)' }}>
            <style>{`
                @keyframes keypad-page-shake {
                    10%, 90% { transform: translate3d(-1px, 0, 0); }
                    20%, 80% { transform: translate3d(2px, 0, 0); }
                    30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
                    40%, 60% { transform: translate3d(4px, 0, 0); }
                }
                .keypad-page-btn {
                    width: clamp(52px, 16vmin, 96px);
                    height: clamp(52px, 16vmin, 96px);
                    border-radius: 50%;
                    border: none;
                    background: rgba(255,255,255,0.08);
                    color: white;
                    font-size: clamp(1.2rem, 5vmin, 1.9rem);
                    font-weight: 500;
                    display: flex; align-items: center; justify-content: center;
                    cursor: pointer;
                    transition: background 0.15s, transform 0.15s;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.1);
                }
                .keypad-page-btn:active { transform: scale(0.93); background: rgba(255,255,255,0.2); }
                .keypad-page-del { background: rgba(244, 67, 54, 0.15); }
                .keypad-page-del:active { background: rgba(244, 67, 54, 0.3); }
            `}</style>

            {isEditMode && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
                    <Settings size={16} style={{ opacity: 0.6 }} />
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, opacity: 0.85 }}>{page?.name || 'Kodepanel'}</span>
                    <label
                        style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', opacity: 0.85, cursor: 'pointer', whiteSpace: 'nowrap' }}
                        title="Skjuler topplinje og sidemeny på denne siden. En diskret knapp øverst til høyre henter dem frem igjen."
                    >
                        <input
                            type="checkbox"
                            checked={!!page.hideChrome}
                            onChange={e => updatePage({ ...page, hideChrome: e.target.checked })}
                        />
                        Fullskjerm (skjul menyer)
                    </label>
                    {keypadTiles.length > 1 && (
                        <select
                            value={source?.tile.id || ''}
                            onChange={e => updatePage({ ...page, keypadTileId: e.target.value })}
                            style={{
                                padding: '6px 8px', borderRadius: 6,
                                background: 'var(--color-bg-main)', color: 'white', border: '1px solid var(--color-border)', fontSize: '0.8rem'
                            }}
                        >
                            {keypadTiles.map(k => (
                                <option key={k.tile.id} value={k.tile.id}>
                                    {(k.tile.name || 'Kodepanel')} ({k.pageName})
                                </option>
                            ))}
                        </select>
                    )}
                    {keypadTiles.length === 1 && (
                        <span style={{ fontSize: '0.75rem', opacity: 0.5 }}>
                            Kilde: {(source?.tile.name || 'Kodepanel')} ({source?.pageName})
                        </span>
                    )}
                </div>
            )}

            {!settings || actions.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: 'var(--color-text-secondary)', padding: 24, fontSize: '0.9rem' }}>
                    Ingen kodepanel-flis med handlinger funnet.<br />Legg til og konfigurer en kodepanel-flis først.
                </div>
            ) : !requiresPin ? (
                // Neste handling krever ikke PIN — én stor knapp i stedet for tastatur
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4vmin' }}>
                    <button
                        onClick={() => status === 'idle' && executeAction(nextAction)}
                        style={{
                            width: 'min(70vmin, 340px)', height: 'min(70vmin, 340px)',
                            borderRadius: '50%', border: 'none', cursor: 'pointer',
                            background: status === 'success' ? '#4CAF50' : status === 'error' ? '#F44336' : '#4CAF50',
                            color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            gap: '3vmin', boxShadow: 'inset 0 0 30px rgba(0,0,0,0.2), 0 8px 30px rgba(0,0,0,0.3)',
                            transition: 'background 0.3s ease'
                        }}
                    >
                        <Unlock size={64} />
                        <span style={{ fontSize: 'clamp(1rem, 5vmin, 1.5rem)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', textShadow: '0 2px 4px rgba(0,0,0,0.4)' }}>
                            {status === 'success' ? (settings.successMessage || 'Vellykket') : status === 'error' ? (settings.errorMessage || 'Feil') : nextAction.label}
                        </span>
                    </button>
                </div>
            ) : (
                <div style={{
                    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', padding: 'clamp(8px, 2.5vmin, 24px)', boxSizing: 'border-box', minHeight: 0
                }}>
                    <div style={{
                        fontSize: 'clamp(0.85rem, 3.8vmin, 1.2rem)', fontWeight: 600, color: 'var(--color-text-secondary, #9aa3b2)',
                        marginBottom: 'clamp(8px, 2.5vmin, 20px)', textAlign: 'center',
                        display: 'flex', alignItems: 'center', gap: 8
                    }}>
                        <Lock size={18} style={{ flexShrink: 0 }} />
                        {nextAction.label}
                    </div>

                    <div style={{
                        background: displayColor,
                        padding: '0 20px',
                        borderRadius: 16,
                        marginBottom: 'clamp(12px, 4vmin, 32px)',
                        width: 'min(80vmin, 300px)',
                        textAlign: 'center',
                        letterSpacing: status === 'idle' ? '12px' : 'normal',
                        fontSize: status === 'idle' ? 'clamp(1.5rem, 6vmin, 2.2rem)' : 'clamp(1rem, 4vmin, 1.3rem)',
                        height: 'clamp(48px, 13vmin, 76px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background 0.3s ease',
                        animation: status === 'error' ? 'keypad-page-shake 0.4s cubic-bezier(.36,.07,.19,.97) both' : 'none',
                        boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.2)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: 'white', boxSizing: 'border-box'
                    }}>
                        {status === 'success' ? (
                            settings.successMessage ? <span>{settings.successMessage}</span> : <Unlock size={32} color="white" />
                        ) : status === 'error' ? (
                            settings.errorMessage ? <span>{settings.errorMessage}</span> : <Lock size={32} color="white" />
                        ) : (
                            input.split('').map(() => '●').join('')
                        )}
                    </div>

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: 'clamp(8px, 3vmin, 22px)',
                        justifyItems: 'center'
                    }}>
                        {buttons.map((btn, idx) => (
                            btn === null ? <div key={idx}></div> :
                            btn === 'del' ?
                                <button key={idx} onClick={handleDelete} className="keypad-page-btn keypad-page-del">
                                    <Delete size={26} />
                                </button> :
                                <button key={idx} onClick={() => handlePress(btn)} className="keypad-page-btn">
                                    {btn}
                                </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
