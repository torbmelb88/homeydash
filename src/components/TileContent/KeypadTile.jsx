import React, { useState, useEffect } from 'react';
import { useHomey } from '../../context/HomeyContext';
import { resolveTileDevice } from '../../services/utils';
import { Lock, Unlock, Delete } from 'lucide-react';

const KeypadTile = ({ tile, expanded, settings, onCloseExpanded }) => {
    const { api, devices } = useHomey();
    const [input, setInput] = useState('');
    const [status, setStatus] = useState('idle'); // idle, success, error
    const [selectedAction, setSelectedAction] = useState(null);
    const [smartNoPinRunning, setSmartNoPinRunning] = useState(false);

    const deviceId = settings?.deviceId;
    const targetDevice = resolveTileDevice(devices, deviceId, settings?.entityId);

    // Normalize actions
    const actions = settings?.actions || (settings?.deviceId ? [{
        id: 'legacy',
        label: tile.name || targetDevice?.name || 'Handling',
        deviceId: settings.deviceId,
        capabilityId: settings.capabilityId,
        value: settings.successValue || 'true',
        requirePin: true
    }] : []);

    // Determine the next action context based on device state
    const nextAction = React.useMemo(() => {
        if (actions.length === 0) return null;
        for (const action of actions) {
            const dev = resolveTileDevice(devices, action.deviceId, action.entityId);
            if (!dev) continue;
            
            let targetVal = action.value || 'true';
            if (targetVal === 'true') targetVal = true;
            if (targetVal === 'false') targetVal = false;
            if (!isNaN(Number(targetVal)) && targetVal.trim() !== '') targetVal = Number(targetVal);

            const currentVal = dev.capabilitiesObj?.[action.capabilityId]?.value;
            if (currentVal !== targetVal) {
                return action;
            }
        }
        return actions[0]; // fallback
    }, [actions, devices]);

    const isUnlocked = nextAction && !nextAction.requirePin;

    const runSmartActionNoPin = async (action) => {
        setStatus('idle');
        try {
            let val = action.value || 'true';
            if (val === 'true') val = true;
            if (val === 'false') val = false;
            if (!isNaN(Number(val)) && val.trim() !== '') val = Number(val);

            const dev = resolveTileDevice(devices, action.deviceId, action.entityId);
            await api.setCapability(dev?.id || action.deviceId, action.capabilityId, val);
            setStatus('success');
        } catch(e) {
            console.error("Keypad: Failed to set capability", e);
            setStatus('error');
        }

        setTimeout(() => {
            setStatus('idle');
        }, 2000);
    };

    // If not expanded, show enhanced secure tile representation
    if (!expanded) {
        if (isUnlocked) {
            return (
                <div 
                    onClick={(e) => {
                        e.stopPropagation(); // Prevent Tile.jsx from opening modal
                        runSmartActionNoPin(nextAction);
                    }}
                    style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        background: status === 'success' ? '#4CAF50' : status === 'error' ? '#F44336' : '#4CAF50',
                        color: 'white',
                        borderRadius: 'inherit',
                        overflow: 'hidden',
                        boxShadow: 'inset 0 0 20px rgba(0,0,0,0.2)',
                        transition: 'background 0.3s ease',
                        cursor: 'pointer'
                    }}>
                    <Unlock size={38} color="#fff" style={{ marginBottom: '8px', filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.3))' }} />
                    <span style={{ 
                        position: 'relative', zIndex: 1,
                        fontSize: '0.85rem', fontWeight: 600, textAlign: 'center',
                        textTransform: 'uppercase', letterSpacing: '0.5px',
                        textShadow: '0 2px 4px rgba(0,0,0,0.4)',
                        background: 'rgba(0,0,0,0.2)',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255,255,255,0.1)'
                    }}>
                        {status === 'success' ? 'Vellykket' : status === 'error' ? 'Feil' : tile.name || targetDevice?.name || 'Åpen'}
                    </span>
                </div>
            );
        } else {
            return (
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    background: status === 'success' ? '#4CAF50' : status === 'error' ? '#F44336' : 'linear-gradient(135deg, #b71c1c 0%, #d32f2f 100%)',
                    color: 'white',
                    borderRadius: 'inherit',
                    overflow: 'hidden',
                    boxShadow: 'inset 0 0 20px rgba(0,0,0,0.4)',
                    transition: 'background 0.3s ease'
                }}>
                    {/* Diagonal hazard stripes */}
                    {status === 'idle' && (
                        <div style={{
                            position: 'absolute', top: '-50%', left: '-50%', width: '200%', height: '200%',
                            backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 15px, rgba(0,0,0,0.15) 15px, rgba(0,0,0,0.15) 30px)',
                            zIndex: 0
                        }} />
                    )}
                    
                    {/* Chains crossing the tile */}
                    {status === 'idle' && (
                        <svg style={{ position: 'absolute', width: '100%', height: '100%', zIndex: 0, opacity: 0.35 }}>
                            <path d="M -20 -20 L 250 250" stroke="black" strokeWidth="16" strokeDasharray="20 10" strokeLinecap="round" />
                            <path d="M -20 -20 L 250 250" stroke="#aaa" strokeWidth="10" strokeDasharray="20 10" strokeLinecap="round" />
                            
                            <path d="M -20 250 L 250 -20" stroke="black" strokeWidth="16" strokeDasharray="20 10" strokeLinecap="round" />
                            <path d="M -20 250 L 250 -20" stroke="#aaa" strokeWidth="10" strokeDasharray="20 10" strokeLinecap="round" />
                        </svg>
                    )}

                    <div style={{
                        position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                        background: status === 'success' ? 'rgba(255,255,255,0.2)' : status === 'error' ? 'rgba(0,0,0,0.2)' : 'radial-gradient(circle, rgba(160,20,20,0.9) 0%, rgba(120,10,10,0.9) 100%)',
                        padding: '12px',
                        borderRadius: '50%',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.5), inset 0 2px 4px rgba(255,255,255,0.2)',
                        border: '1px solid rgba(0,0,0,0.5)',
                        marginBottom: '8px',
                        transition: 'all 0.3s'
                    }}>
                        {status === 'success' ? <Unlock size={28} color="#fff" /> : <Lock size={28} color="#fff" style={{ filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.5))' }} />}
                    </div>
                    
                    <span style={{ 
                        position: 'relative', zIndex: 1,
                        fontSize: '0.85rem', fontWeight: 600, textAlign: 'center',
                        textTransform: 'uppercase', letterSpacing: '0.5px',
                        textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                        background: 'rgba(0,0,0,0.4)',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255,255,255,0.1)'
                    }}>
                        {tile.name || targetDevice?.name || 'Sikret'}
                    </span>
                </div>
            );
        }
    }

    // --- Expanded View ---

    // Automatically check when input length matches pin code length.
    const pinCode = settings?.pinCode || '0000';
    
    useEffect(() => {
        if (!expanded) {
            setInput('');
            setStatus('idle');
            setSelectedAction(null);
        } else {
            if (nextAction && nextAction.requirePin) {
                setSelectedAction(nextAction);
            } else if (nextAction && !nextAction.requirePin) {
                // If it opened anyway, just run it
                runSmartActionNoPin(nextAction);
            }
        }
    }, [expanded]); // intentionally not depending on nextAction to avoid swapping during UI presentation

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
        if (status !== 'idle') return; // block input while success animating
        if (input.length < pinCode.length) {
            setInput(prev => prev + num);
        }
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

    const executeAction = async (action) => {
        try {
            let val = action.value || 'true';
            if (val === 'true') val = true;
            if (val === 'false') val = false;
            if (!isNaN(Number(val)) && val.trim() !== '') val = Number(val);

            const dev = resolveTileDevice(devices, action.deviceId, action.entityId);
            await api.setCapability(dev?.id || action.deviceId, action.capabilityId, val);
            setStatus('success');
        } catch(e) {
            console.error("Keypad: Failed to set capability", e);
            setStatus('error');
        }
    };

    const handleCheckPin = async (currentInput) => {
        if (currentInput === pinCode) {
            if (selectedAction) {
                await executeAction(selectedAction);
            } else {
                setStatus('success');
            }

            // reset after 2.5s and automatically close panel
            setTimeout(() => {
                setStatus('idle');
                setInput('');
                if (onCloseExpanded) onCloseExpanded();
            }, 2500);
        } else {
            setStatus('error');
            // Allow them to read the "Access Denied" text, but wipe input quickly
            // so if they type again it's fresh.
            setTimeout(() => {
                setInput('');
            }, 400);
        }
    };

    if (expanded && actions.length === 0) {
        return <div style={{ padding: '20px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>Ingen handlinger konfigurert.<br/>Gå til innstillinger.</div>;
    }

    if (expanded && !selectedAction) {
        // Fallback or purely un-configured state
        return (
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <div style={{ color: 'var(--color-text-secondary)' }}>Laster...</div>
            </div>
        );
    }

    const displayColor = status === 'success' ? '#4CAF50' : status === 'error' ? '#F44336' : 'rgba(255, 255, 255, 0.05)';
    const shakeAnim = status === 'error' ? 'shake 0.4s cubic-bezier(.36,.07,.19,.97) both' : 'none';
    
    // Create keypad layout 1-2-3, 4-5-6, 7-8-9, (empty)-0-del
    const buttons = [1, 2, 3, 4, 5, 6, 7, 8, 9, null, 0, 'del'];

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', 
            justifyContent: 'center', padding: 'min(20px, 2vh)', height: '100%', boxSizing: 'border-box'
        }}>
            <style>
                {`
                @keyframes shake {
                    10%, 90% { transform: translate3d(-1px, 0, 0); }
                    20%, 80% { transform: translate3d(2px, 0, 0); }
                    30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
                    40%, 60% { transform: translate3d(4px, 0, 0); }
                }
                .keypad-btn {
                    width: clamp(45px, 12vh, 70px); 
                    height: clamp(45px, 12vh, 70px);
                    border-radius: 50%;
                    border: none;
                    background: rgba(255,255,255,0.08); /* slight glassy feel */
                    color: white;
                    font-size: clamp(1.1rem, 3vh, 1.5rem);
                    font-weight: 500;
                    display: flex; align-items: center; justify-content: center;
                    cursor: pointer;
                    transition: all 0.2s;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.1);
                    backdrop-filter: blur(10px);
                    -webkit-backdrop-filter: blur(10px);
                }
                .keypad-btn:hover { background: rgba(255,255,255,0.15); transform: scale(1.05); }
                .keypad-btn:active { transform: scale(0.95); background: rgba(255,255,255,0.2); }
                .keypad-del { background: rgba(244, 67, 54, 0.15); }
                .keypad-del:hover { background: rgba(244, 67, 54, 0.25); }
                `}
            </style>

            <div style={{
                background: displayColor,
                padding: '10px 20px',
                borderRadius: '16px',
                marginBottom: 'clamp(15px, 4vh, 40px)',
                width: '100%',
                maxWidth: '240px',
                textAlign: 'center',
                letterSpacing: status === 'success' || status === 'error' ? 'normal' : '10px',
                fontSize: status === 'success' || status === 'error' ? 'clamp(1rem, 2.5vh, 1.2rem)' : 'clamp(1.5rem, 4vh, 2rem)',
                height: 'clamp(50px, 10vh, 70px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 0.3s ease',
                animation: shakeAnim,
                boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.2), 0 4px 15px rgba(0,0,0,0.1)',
                border: '1px solid rgba(255,255,255,0.1)',
                backdropFilter: 'blur(5px)',
                color: 'white'
            }}>
                {status === 'success' ? (
                    settings?.successMessage ? <span>{settings.successMessage}</span> : <Unlock size={32} color="white" />
                ) : status === 'error' ? (
                    settings?.errorMessage ? <span>{settings.errorMessage}</span> : <Lock size={32} color="white" />
                ) : (
                    input.split('').map(() => '●').join('')
                )}
            </div>

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 'clamp(10px, 2vh, 20px)',
                justifyItems: 'center'
            }}>
                {buttons.map((btn, idx) => (
                    btn === null ? <div key={idx}></div> :
                    btn === 'del' ? 
                        <button key={idx} onClick={handleDelete} className="keypad-btn keypad-del">
                            <Delete size={24} />
                        </button> :
                        <button key={idx} onClick={() => handlePress(btn)} className="keypad-btn">
                            {btn}
                        </button>
                ))}
            </div>
            
        </div>
    );
};

export default KeypadTile;
