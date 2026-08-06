import React, { useState, useEffect } from 'react';
import { useHomey } from '../../context/HomeyContext';
import { Fan, Lightbulb, Thermometer, Power } from 'lucide-react';
import TileCapabilities from '../TileCapabilities';

const FanTile = ({ tile, device, expanded = false }) => {
    const { api, setIsInteracting } = useHomey();

    // Utvidet visning – valgbare seksjoner (default på)
    const showLight = tile?.settings?.showLight !== false;

    // Capabilities
    const CAP_ONOFF = 'onoff';
    const CAP_SPEED = 'fan_speed';
    const CAP_LIGHT = 'onoff.light';
    const CAP_TEMP = 'measure_temperature';

    const [isOn, setIsOn] = useState(device.capabilitiesObj?.[CAP_ONOFF]?.value);
    const [speed, setSpeed] = useState(device.capabilitiesObj?.[CAP_SPEED]?.value || 1);
    const [isLightOn, setIsLightOn] = useState(device.capabilitiesObj?.[CAP_LIGHT]?.value);

    const temperature = device.capabilitiesObj?.[CAP_TEMP]?.value;

    useEffect(() => {
        setIsOn(device.capabilitiesObj?.[CAP_ONOFF]?.value);
        setSpeed(device.capabilitiesObj?.[CAP_SPEED]?.value || 1);
        setIsLightOn(device.capabilitiesObj?.[CAP_LIGHT]?.value);
    }, [device.capabilitiesObj]);

    const handleToggle = (e) => {
        e.stopPropagation();
        const newState = !isOn;
        setIsOn(newState);
        api.setCapability(device.id, CAP_ONOFF, newState);
    };

    const handleSpeedChange = (newSpeed) => {
        setSpeed(newSpeed);
        api.setCapability(device.id, CAP_SPEED, newSpeed);

        // If speed is set, ensure fan is on (optional, but good UX usually)
        if (!isOn) {
            setIsOn(true);
            api.setCapability(device.id, CAP_ONOFF, true);
        }
    };

    const handleLightToggle = (e) => {
        e?.stopPropagation();
        const newState = !isLightOn;
        setIsLightOn(newState);
        api.setCapability(device.id, CAP_LIGHT, newState);
    };

    // --- Styling Variables ---
    const fanColor = isOn ? 'var(--color-info)' : 'var(--color-text-secondary)';

    return (
        <div className="tile-content" style={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: '100%',
            padding: '10px',
            gap: '4px',
            position: 'relative'
        }}>

            {/* --- Main Fan Icon / Status --- */}
            <div style={{
                flex: expanded ? '0 0 auto' : 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center'
            }}>
                <div
                    onClick={handleToggle}
                    onMouseDown={e => e.stopPropagation()}
                    style={{
                        position: 'relative',
                        cursor: 'pointer',
                        padding: '10px',
                        borderRadius: '50%',
                        background: isOn ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.05)',
                        transition: 'all 0.3s ease',
                        boxShadow: isOn ? '0 0 15px rgba(59, 130, 246, 0.3)' : 'none'
                    }}
                >
                    <Fan
                        size={expanded ? 64 : 42}
                        color={fanColor}
                        style={{
                            animation: isOn ? `spin ${3 / (speed || 1)}s linear infinite` : 'none',
                            transition: 'color 0.3s ease'
                        }}
                    />
                </div>

                {/* Speed Indicator (Small View) */}
                {isOn && !expanded && (
                    <div style={{
                        fontSize: '0.8rem',
                        fontWeight: 'bold',
                        marginTop: '4px',
                        color: 'var(--color-info)'
                    }}>
                        Nivå {speed}
                    </div>
                )}
            </div>

            {/* --- Top/Corner Info (Temp & Light) --- */}
            <div style={{
                position: 'absolute',
                top: 8,
                right: 8,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: 4
            }}>
                {/* Temperature */}
                {temperature !== undefined && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        fontSize: '0.75rem',
                        color: 'var(--color-text-primary)'
                    }}>
                        <Thermometer size={12} style={{ marginRight: 2 }} />
                        {temperature}°
                    </div>
                )}

                {/* Light Status Icon (Small View only, or always?) */}
                {!expanded && isLightOn && (
                    <Lightbulb size={12} color="var(--color-warning)" fill="currentColor" />
                )}
            </div>


            {/* --- Expanded Controls --- */}
            {expanded && (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    width: '100%',
                    marginTop: '1rem',
                    background: 'rgba(255,255,255,0.03)',
                    padding: '1rem',
                    borderRadius: '1rem'
                }}>

                    {/* Speed Controls */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Viftehastighet</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                className={`btn ${!isOn ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => handleToggle({ stopPropagation: () => { } })}
                                style={{ flex: 1, backgroundColor: !isOn ? 'var(--color-bg-elevated)' : '' }}
                            >
                                Av
                            </button>
                            {[1, 2, 3].map(lvl => (
                                <button
                                    key={lvl}
                                    className={`btn ${isOn && speed === lvl ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => handleSpeedChange(lvl)}
                                    style={{ flex: 1 }}
                                >
                                    {lvl}
                                </button>
                            ))}
                        </div>
                    </div>



                    {/* Light Control */}
                    {showLight && device.capabilitiesObj?.[CAP_LIGHT] && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Lightbulb size={20} color={isLightOn ? 'var(--color-warning)' : 'var(--color-text-secondary)'} />
                                <span style={{ fontSize: '1rem' }}>Lys</span>
                            </div>
                            <button
                                className={`btn ${isLightOn ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={handleLightToggle}
                                style={{ minWidth: '80px' }}
                            >
                                {isLightOn ? 'PÅ' : 'AV'}
                            </button>
                        </div>
                    )}
                </div>
            )}

            <style>{`
                @keyframes spin { 100% { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
};

export default FanTile;
