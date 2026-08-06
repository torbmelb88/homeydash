import React, { useState, useEffect } from 'react';
import { useHomey } from '../../context/HomeyContext';
import { Lightbulb } from 'lucide-react';
import InteractiveCircularSlider from '../InteractiveCircularSlider';
import TileCapabilities from '../TileCapabilities';
import MiniPowerGraph from './MiniPowerGraph';

const LightTile = ({ tile, device, expanded = false }) => {
    const { api, setIsInteracting, devices } = useHomey();
    const [isOn, setIsOn] = useState(device.capabilitiesObj?.onoff?.value);
    const [dimLevel, setDimLevel] = useState(device.capabilitiesObj?.dim?.value || 0);
    const [optimisticDim, setOptimisticDim] = useState(null);

    const settings = tile.settings || {};
    const externalPowerDevice = settings.externalPowerDeviceId ? devices.find(d => d.id === settings.externalPowerDeviceId) : null;
    const externalPowerValue = externalPowerDevice?.capabilitiesObj?.[settings.externalPowerCapability || 'measure_power']?.value;
    const externalPowerUnit = externalPowerDevice?.capabilitiesObj?.[settings.externalPowerCapability || 'measure_power']?.units || 'W';

    // Sync state with device updates
    useEffect(() => {
        setIsOn(device.capabilitiesObj?.onoff?.value);
        setDimLevel(device.capabilitiesObj?.dim?.value || 0);
    }, [device.capabilitiesObj]);

    // Reset optimistic state when actual value updates to match
    useEffect(() => {
        if (optimisticDim === null) return;
        if (Math.abs(optimisticDim - dimLevel) < 0.01) {
            setOptimisticDim(null);
        }
    }, [dimLevel, optimisticDim]);

    const displayDim = optimisticDim !== null ? optimisticDim : dimLevel;

    const handleToggle = (e) => {
        e.stopPropagation(); // Prevent tile click
        const newState = !isOn;
        setIsOn(newState);
        api.setCapability(device.id, 'onoff', newState);
    };

    const handleDimChange = (val) => {
        setOptimisticDim(val);
    };

    const handleDimChangeEnd = (val) => {
        setOptimisticDim(val);
        api.setDim(device.id, val);
        setIsInteracting(false); // Ensure interaction ends
    };

    const hasDim = device.capabilities.includes('dim');

    const isHorizontal = tile.settings?.isHorizontal;
    const iconUrl = api.getIconUrl(device);

    return (
        <div className={`tile-content ${expanded ? 'expanded' : ''}`} style={{
            display: 'flex',
            flexDirection: isHorizontal ? 'row' : 'column',
            minHeight: '100%',
            padding: isHorizontal ? '10px 10px 10px 20px' : (expanded ? '2rem' : '10px 10px 2px 10px'),
            gap: isHorizontal ? '10px' : '4px',
            alignItems: 'center',
            justifyContent: isHorizontal ? 'space-between' : 'flex-start',
            position: 'relative'
        }}>

            {/* Left Section (Horizontal Only): Icon + Name (Approx 1/3 width) */}
            {isHorizontal && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: '1 1 33%', width: '33%', alignItems: 'flex-start', justifyContent: 'center', height: '100%', paddingRight: '5px' }}>
                    <div style={{ width: '28px', height: '28px', color: isOn ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)' }}>
                        {device.LucideIcon ? (
                            <device.LucideIcon size={28} strokeWidth={1.5} />
                        ) : (
                            <img src={iconUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        )}
                    </div>

                    {/* Name (multiline allowed) */}
                    <div style={{
                        fontSize: '0.9rem',
                        fontWeight: 500,
                        whiteSpace: 'normal',
                        wordBreak: 'break-word',
                        textAlign: 'left',
                        lineHeight: 1.25,
                        color: 'var(--color-text-primary)'
                    }}>
                        {tile.name || device.name}
                    </div>
                </div>
            )}

            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: isHorizontal ? '66%' : '100%',
                flexDirection: 'column',
                flex: expanded ? '0 0 auto' : (isHorizontal ? '2 1 66%' : '1'),
                height: isHorizontal ? '120px' : 'auto', // Enforce max height
                position: 'relative',
                overflow: isHorizontal ? 'hidden' : 'visible' // Clip content that exceeds this height
            }}>
                {hasDim ? (
                    // Visual Wrapper for positioning
                    <div style={{
                        marginTop: isHorizontal ? '0' : '0',
                        display: 'flex',
                        alignItems: isHorizontal ? 'flex-start' : 'center', // Align to top in horizontal
                        justifyContent: 'center',
                        height: isHorizontal ? '190px' : 'auto',
                        // Move DOWN significantly to align the top of the 190px circle with the top of the 120px box
                        transform: isHorizontal ? 'translateY(36px)' : 'none'
                    }}>
                        <InteractiveCircularSlider
                            value={displayDim}
                            min={0}
                            max={1}
                            onChange={handleDimChange}
                            onChangeEnd={handleDimChangeEnd}
                            onInteractionStart={() => setIsInteracting(true)}
                            onInteractionEnd={() => setIsInteracting(false)}
                            trackGradient={['#713f12', '#facc15']} // Dark Yellow -> Bright Yellow
                            startAngle={isHorizontal ? -90 : -130}
                            endAngle={isHorizontal ? 90 : 130}
                            size={expanded ? "250px" : (isHorizontal ? "190px" : "135px")}
                            strokeWidth={expanded ? 16 : (isHorizontal ? 14 : 10)}
                            interactionMode="knob"
                        >
                            <div
                                onClick={handleToggle}
                                onMouseDown={(e) => e.stopPropagation()}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center', // Ensure vertical centering for text
                                    cursor: 'pointer',
                                    color: isOn ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
                                    paddingTop: isHorizontal ? '0' : '10px',
                                    // Align text: In 190px box, center is 95px. Top half is 0-95.
                                    transform: isHorizontal ? 'translateY(-15px)' : 'none',
                                    width: '100%'
                                }}
                            >
                                {/* Hide center icon in horizontal mode if desired, or keep it small. 
                                    Thermostat hides mode icon usually, but here icon is the only visual except percentage.
                                    Let's keep it but adjust if needed. */}
                                {device.LucideIcon ? (
                                    <device.LucideIcon 
                                        size={expanded ? 48 : 32} 
                                        strokeWidth={1.5}
                                        style={{
                                            filter: isOn ? 'drop-shadow(0 0 4px var(--color-accent-primary))' : 'none',
                                            opacity: isOn ? 1 : 0.5,
                                            display: isHorizontal ? 'none' : 'block'
                                        }}
                                    />
                                ) : (
                                    <img
                                        src={api.getIconUrl(device)}
                                        alt=""
                                        style={{
                                            width: expanded ? '48px' : '32px',
                                            height: expanded ? '48px' : '32px',
                                            objectFit: 'contain',
                                            filter: isOn ? 'drop-shadow(0 0 4px var(--color-accent-primary))' : 'grayscale(100%) opacity(0.5)',
                                            display: isHorizontal ? 'none' : 'block'
                                        }}
                                    />
                                )}
                                <div style={{ fontSize: expanded ? '1.2rem' : (isHorizontal ? '2.0rem' : '0.9rem'), marginTop: isHorizontal ? '0' : '6px', fontWeight: expanded || isHorizontal ? 700 : 600, lineHeight: 1 }}>
                                    {Math.round(displayDim * 100)}%
                                </div>
                                {isHorizontal && (
                                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                                        {isOn ? 'PÅ' : 'AV'}
                                    </div>
                                )}
                            </div>
                        </InteractiveCircularSlider>
                    </div>
                ) : (
                    <div
                        onClick={handleToggle}
                        onMouseDown={(e) => e.stopPropagation()}
                        style={{
                            width: expanded ? '160px' : '80px',
                            height: expanded ? '160px' : '80px',
                            borderRadius: '50%',
                            background: isOn ? 'var(--color-accent-primary)' : 'rgba(255,255,255,0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            transition: 'all 0.3s ease',
                            boxShadow: isOn ? '0 0 20px rgba(255, 179, 0, 0.3)' : 'none'
                        }}
                    >
                        {device.LucideIcon ? (
                            <device.LucideIcon 
                                size={expanded ? 80 : 40} 
                                strokeWidth={1.5}
                                style={{
                                    color: isOn ? 'white' : 'inherit',
                                    opacity: isOn ? 1 : 0.5
                                }}
                            />
                        ) : (
                            <img
                                src={api.getIconUrl(device)}
                                alt=""
                                style={{
                                    width: expanded ? '80px' : '40px',
                                    height: expanded ? '80px' : '40px',
                                    objectFit: 'contain',
                                    filter: isOn ? 'brightness(0) invert(1)' : 'grayscale(100%) opacity(0.5)'
                                }}
                            />
                        )}
                    </div>
                )}
            </div>

            {/* Standard Capabilities (Interactive, Vertical List) - ONLY small view and NOT horizontal */}
            {(!expanded && !isHorizontal) && tile.capabilities && tile.capabilities.length > 0 && (
                <div style={{ width: '100%', marginTop: 'auto', paddingBottom: '4px', zIndex: 10 }}>
                    <TileCapabilities device={device} capabilities={tile.capabilities} />
                </div>
            )}

            {/* Expanded Controls */}
            {expanded && (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    width: '100%',
                    marginTop: '2rem',
                    background: 'rgba(255,255,255,0.03)',
                    padding: '1rem',
                    borderRadius: '1rem'
                }}>
                    {tile.expandedCapabilities?.map((capConfig) => (
                        <TileCapabilities key={typeof capConfig === 'string' ? capConfig : capConfig.id} device={device} capabilities={[capConfig]} />
                    ))}

                    {(device.capabilitiesObj?.measure_power || externalPowerDevice) && (
                        <div style={{ marginTop: '1rem', height: '120px' }}>
                            <MiniPowerGraph 
                                deviceId={externalPowerDevice ? externalPowerDevice.id : device.id} 
                                capabilityId={externalPowerDevice ? (settings.externalPowerCapability || 'measure_power') : 'measure_power'}
                                currentValue={device.capabilitiesObj?.measure_power?.value || externalPowerValue}
                                unit={device.capabilitiesObj?.measure_power?.units || externalPowerUnit || 'W'}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default LightTile;
