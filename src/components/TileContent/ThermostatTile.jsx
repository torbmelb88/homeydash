import React, { useState, useEffect } from 'react';
import { useHomey } from '../../context/HomeyContext';
import InteractiveCircularSlider from '../InteractiveCircularSlider';
import TileCapabilities from '../TileCapabilities';
import MiniPowerGraph from './MiniPowerGraph';
import { Flame, Snowflake, Wind, Power, Droplets, Zap, Thermometer, WifiOff } from 'lucide-react';
import useIsMobile from '../../hooks/useIsMobile';

const ThermostatTile = ({ tile, device, expanded = false }) => {
    const { api, setIsInteracting, devices } = useHomey();
    const isMobile = useIsMobile();
    // ... existing state ...

    // Helper to find external power device
    const externalPowerDevice = tile.settings?.externalPowerDeviceId ? devices.find(d => d.id === tile.settings.externalPowerDeviceId) : null;
    const externalPowerValue = externalPowerDevice?.capabilitiesObj?.[tile.settings?.externalPowerCapability || 'measure_power']?.value;
    const externalPowerUnit = externalPowerDevice?.capabilitiesObj?.[tile.settings?.externalPowerCapability || 'measure_power']?.units || 'W';

    const [targetTemp, setTargetTemp] = useState(device.capabilitiesObj?.target_temperature?.value || 21);
    const [optimisticTemp, setOptimisticTemp] = useState(null);
    const [optimisticCaps, setOptimisticCaps] = useState({});

    // Sync state with device updates
    useEffect(() => {
        setTargetTemp(device.capabilitiesObj?.target_temperature?.value || 21);
    }, [device.capabilitiesObj]);

    // Reset optimistic state when actual value updates to match
    useEffect(() => {
        if (optimisticTemp === null) return;
        if (Math.abs(optimisticTemp - targetTemp) < 0.1) {
            setOptimisticTemp(null);
        }
    }, [targetTemp, optimisticTemp]);

    // Reset optimistic capabilities when actual values update to match
    useEffect(() => {
        const capsToClear = [];
        Object.keys(optimisticCaps).forEach(capId => {
            const actual = device.capabilitiesObj?.[capId]?.value;
            if (actual === optimisticCaps[capId]) {
                capsToClear.push(capId);
            }
        });

        if (capsToClear.length > 0) {
            setOptimisticCaps(prev => {
                const next = { ...prev };
                capsToClear.forEach(id => delete next[id]);
                return next;
            });
        }
    }, [device.capabilitiesObj, optimisticCaps]);

    const isUnavailable = device.state === 'unavailable' ||
        device.capabilitiesObj?.thermostat_mode?.value === 'unavailable';

    const displayTemp = optimisticTemp !== null ? optimisticTemp : targetTemp;
    const currentTemp = device.capabilitiesObj?.measure_temperature?.value;

    const handleTempChange = (val) => {
        // Round to nearest 0.5
        const rounded = Math.round(val * 2) / 2;
        setOptimisticTemp(rounded);
    };

    const handleTempChangeEnd = (val) => {
        const rounded = Math.round(val * 2) / 2;
        setOptimisticTemp(rounded);
        api.setTargetTemperature(device.id, rounded);
        setIsInteracting(false); // Ensure interaction ends
    };

    // Helper to get mode icon
    const getModeIcon = () => {
        // 1. Try standard thermostat_mode or climate_mode
        let mode = device.capabilitiesObj?.thermostat_mode?.value || device.capabilitiesObj?.climate_mode?.value;

        // 2. Try thermostat_mode_single (often 'heat' or 'off' implicitly, but sometimes just specific string)
        if (!mode && device.capabilitiesObj?.thermostat_mode_single) {
            // Single mode typically implies it IS in that mode if on?
            // Or capability value is the mode.
            mode = device.capabilitiesObj.thermostat_mode_single.value;
        }

        // Check hvac_action (thermostat_state) – dims icon if unit is idle
        const hvacAction = device.capabilitiesObj?.thermostat_state?.value;
        const isActivelyRunning = hvacAction
            ? ['heating', 'cooling', 'drying', 'fan'].includes(hvacAction)
            : true; // If no action info, assume active

        // 3. Fallback: Check onoff if no specific mode capability
        if (!mode && device.capabilitiesObj?.onoff) {
            mode = device.capabilitiesObj.onoff.value ? 'on' : 'off';
        }

        if (!mode) return null;

        // Normalize mode string to lowercase just in case
        mode = mode.toLowerCase();

        const activeOpacity = isActivelyRunning ? 1 : 0.35;
        switch (mode) {
            case 'heat':
            case 'heating':
            case 'on':
                return <Flame size={expanded ? 24 : 16} color="var(--color-warning)" style={{ opacity: activeOpacity }} />;
            case 'cool': return <Snowflake size={expanded ? 24 : 16} color="var(--color-info)" style={{ opacity: activeOpacity }} />;
            case 'fan':
            case 'fan_only':
                return <Wind size={expanded ? 24 : 16} color="var(--color-text-secondary)" style={{ opacity: activeOpacity }} />;
            case 'dry': return <Droplets size={expanded ? 24 : 16} color="var(--color-info)" style={{ opacity: activeOpacity }} />;
            case 'auto':
            case 'heat_cool':
                return <Zap size={expanded ? 24 : 16} color="var(--color-accent-warm)" style={{ opacity: activeOpacity }} />;
            case 'off': return <Power size={expanded ? 24 : 16} color="var(--color-text-secondary)" />;
            default:
                return <Flame size={expanded ? 24 : 16} color="var(--color-text-secondary)" style={{ opacity: 0.5 }} />;
        }
    };

    const isHorizontal = tile.settings?.isHorizontal;
    const horizontalSliderSize = 100;
    const iconUrl = api.getIconUrl(device);

    return (
        <div className="tile-content" style={{
            display: 'flex',
            flexDirection: expanded ? (isMobile ? 'column' : 'row') : (isHorizontal ? 'row' : 'column'),
            minHeight: '100%',
            width: expanded ? '100%' : undefined,
            padding: expanded ? '8px' : (isHorizontal ? '10px 10px 10px 20px' : '10px 10px 2px 10px'),
            gap: expanded ? '16px' : (isHorizontal ? '10px' : '4px'),
            alignItems: expanded ? (isMobile ? 'center' : 'flex-start') : 'center',
            justifyContent: expanded ? 'flex-start' : (isHorizontal ? 'space-between' : 'flex-start')
        }}>


            {/* Left Section (Horizontal Only): Icon + Name (Approx 1/3 width) */}
            {isHorizontal && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: '1 1 33%', width: '33%', alignItems: 'flex-start', justifyContent: 'center', height: '100%', paddingRight: '5px' }}>
                    {/* Icon */}
                    <div style={{ width: '28px', height: '28px', color: 'var(--color-text-secondary)' }}>
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

            {/* Slider Section (Approx 2/3 width) */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: expanded ? (isMobile ? '100%' : '230px') : (isHorizontal ? '66%' : '100%'),
                flexDirection: 'column',
                flex: expanded ? (isMobile ? '0 0 auto' : '0 0 230px') : (isHorizontal ? '2 1 66%' : '1'),
                height: isHorizontal ? '120px' : 'auto',
                position: 'relative',
                overflow: isHorizontal ? 'hidden' : 'visible'
            }}>
                {/* Visual Wrapper for positioning */}
                <div style={{
                    marginTop: isHorizontal ? '0' : '0',
                    display: 'flex',
                    alignItems: 'flex-start', // Align to top
                    justifyContent: 'center',
                    height: isHorizontal ? '190px' : 'auto',
                    // Move DOWN significantly to align the top of the 190px circle with the top of the 120px box
                    // (190 - 120) / 2 = 35px overflow at top if centered. Convert to positive shift.
                    transform: isHorizontal ? 'translateY(36px)' : 'none'
                }}>
                    <InteractiveCircularSlider
                        value={displayTemp}
                        min={10}
                        max={30}
                        onChange={handleTempChange}
                        onChangeEnd={handleTempChangeEnd}
                        onInteractionStart={() => setIsInteracting(true)}
                        onInteractionEnd={() => setIsInteracting(false)}
                        trackGradient={['#3b82f6', '#8b5cf6', '#ef4444']} // Blue -> Purple -> Red
                        startAngle={isHorizontal ? -90 : -130}
                        endAngle={isHorizontal ? 90 : 130}
                        size={expanded ? (isMobile ? "180px" : "220px") : (isHorizontal ? "190px" : "135px")}
                        strokeWidth={expanded ? (isMobile ? 14 : 16) : (isHorizontal ? 14 : 10)}
                        interactionMode="knob"
                    >
                        {/* Content INSIDE slider */}
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transform: isHorizontal ? 'translateY(-15px)' : 'none',
                            pointerEvents: 'none',
                            width: '100%',
                            opacity: isUnavailable ? 0.45 : 1
                        }}>
                            {isUnavailable ? (
                                <>
                                    <WifiOff size={isHorizontal ? 22 : 18} color="var(--color-text-secondary)" />
                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                                        Utilgjengelig
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div style={{ fontSize: isHorizontal ? '2.0rem' : '1.8rem', fontWeight: 700, lineHeight: 1 }}>
                                        {displayTemp}°
                                    </div>
                                    {currentTemp !== undefined && (
                                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '2px' }}>
                                            Nå: {currentTemp}°
                                        </div>
                                    )}
                                    <div style={{ marginTop: '6px' }}>
                                        {getModeIcon()}
                                    </div>
                                </>
                            )}
                        </div>
                    </InteractiveCircularSlider>
                </div>
            </div>

            {/* Standard Capabilities (Interactive, Vertical List) - Hide in Horizontal Mode to save space */}
            {(!expanded && !isHorizontal) && tile.capabilities && tile.capabilities.length > 0 && (
                <div style={{ width: '100%', marginTop: 'auto', paddingBottom: '4px', zIndex: 10 }}>
                    <TileCapabilities device={device} capabilities={tile.capabilities} />
                </div>
            )}

            {/* Expanded Controls */}
            {expanded && (
                <div style={{
                    flex: 1,
                    alignSelf: 'stretch',
                    background: 'rgba(255,255,255,0.03)',
                    padding: '0.75rem',
                    borderRadius: '1rem',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                }}>



                    {/* Render configured expanded capabilities.
                        Strømforbruk-grafen legges alltid nederst uavhengig av lagret rekkefølge. */}
                    {[
                        ...(tile.expandedCapabilities || []).filter(c => c.id !== 'measure_power'),
                        ...(tile.expandedCapabilities || []).filter(c => c.id === 'measure_power'),
                    ].map(capConfig => {
                        const capId = capConfig.id;

                        // Enhanced Power Display (Internal)
                        if (capId === 'measure_power' && device.capabilitiesObj?.[capId]) {
                            const powerValue = device.capabilitiesObj[capId].value;
                            const powerUnit = device.capabilitiesObj[capId].units || 'W';
                            return (
                                <MiniPowerGraph
                                    key={capId}
                                    deviceId={device.id}
                                    currentValue={powerValue}
                                    unit={powerUnit}
                                    title={capConfig.title || 'Strømforbruk'}
                                />
                            );
                        }

                        // Thermostat Mode Control (supports thermostat_mode and climate_mode)
                        if ((capId === 'thermostat_mode' || capId === 'climate_mode') && device.capabilitiesObj?.[capId]) {
                            const modeOptions = device.capabilitiesOptions?.[capId]?.values || [];

                            // Map technical names to friendly labels
                            const getLabel = (modeObj) => {
                                const mode = (typeof modeObj === 'object' && modeObj !== null && modeObj.id) ? modeObj.id : modeObj;
                                if (!mode) return '';
                                
                                const map = {
                                    'off': 'Av',
                                    'heat': 'Varme',
                                    'heating': 'Varme',
                                    'cool': 'Kjøling',
                                    'cooling': 'Kjøling',
                                    'auto': 'Auto',
                                    'fan': 'Vifte',
                                    'fan_only': 'Vifte',
                                    'fanOnly': 'Vifte',
                                    'dry': 'Tørk',
                                    'heat_cool': 'Auto', 
                                    'eco': 'Spare'
                                };
                                
                                if (typeof mode === 'string' && map[mode.toLowerCase()]) return map[mode.toLowerCase()];
                                if (typeof modeObj === 'object' && modeObj !== null && modeObj.title) return modeObj.title;
                                if (typeof mode === 'string') return mode.charAt(0).toUpperCase() + mode.slice(1);
                                return String(mode);
                            };

                            // Determine which modes to show
                            let modesToRender = [];

                            if (modeOptions.length > 0) {
                                modesToRender = modeOptions;
                            } else if (device.hvac_modes && Array.isArray(device.hvac_modes)) {
                                modesToRender = device.hvac_modes;
                            } else if (device.settings?.hvac_modes) {
                                const hvacModes = device.settings.hvac_modes;
                                if (Array.isArray(hvacModes)) {
                                    modesToRender = hvacModes;
                                } else if (typeof hvacModes === 'string') {
                                    try {
                                        const parsed = JSON.parse(hvacModes);
                                        if (Array.isArray(parsed)) modesToRender = parsed;
                                    } catch (e) {}
                                }
                            } else if (device.capabilitiesObj?.[capId]?.values && Array.isArray(device.capabilitiesObj[capId].values)) {
                                modesToRender = device.capabilitiesObj[capId].values;
                            } else {
                                modesToRender = ['off', 'heat', 'cool', 'auto', 'fan'];
                            }

                            return (
                                <div key={capId} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                                    <label style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>Modus ({capId === 'climate_mode' ? 'Klima' : 'Termostat'})</label>
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        {modesToRender.map(modeObj => {
                                            const modeId = (typeof modeObj === 'object' && modeObj !== null && modeObj.id) ? modeObj.id : modeObj;
                                                        const currentVal = optimisticCaps[capId] || device.capabilitiesObj[capId].value;
                                                        const isActive = currentVal === modeId;

                                                        return (
                                                            <button
                                                                key={String(modeId)}
                                                                className={`btn ${isActive ? 'btn-primary' : 'btn-secondary'}`}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setOptimisticCaps(prev => ({ ...prev, [capId]: modeId }));
                                                                    api.setCapability(device.id, capId, modeId)
                                                                        .catch(err => {
                                                                            console.error("Failed to set mode", err);
                                                                            setOptimisticCaps(prev => {
                                                                                const next = { ...prev };
                                                                                delete next[capId];
                                                                                return next;
                                                                            });
                                                                        });
                                                                }}
                                                    onPointerDown={(e) => e.stopPropagation()}
                                                    style={{ flex: 1, minWidth: '70px', textTransform: 'capitalize', fontSize: '0.85rem', padding: '8px 4px' }}
                                                >
                                                    {getLabel(modeObj)}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        }

                        // Generic mapping for all select-style capabilities (Fan, Swing, etc.)
                        const selectStyleCapabilities = [
                            'fan_mode', 'climate_mode_fan', 'thermostat_fan_speed', 'fan_speed',
                            'vertical_swing', 'horizontal_swing', 'swing_mode', 'preset_mode'
                        ];

                        if (selectStyleCapabilities.includes(capId) && device.capabilitiesObj?.[capId]) {
                            const modeOptions = device.capabilitiesOptions?.[capId]?.values || [];
                            const isSwing = capId.includes('swing');
                            const isPreset = capId.includes('preset');

                            const getGenericLabel = (modeObj) => {
                                const mode = (typeof modeObj === 'object' && modeObj !== null && modeObj.id) ? modeObj.id : modeObj;
                                if (!mode) return '';
                                
                                const map = {
                                    'off': 'Av',
                                    'low': 'Lav',
                                    'medium': 'Medium',
                                    'high': 'Høy',
                                    'on': 'På',
                                    'auto': 'Auto',
                                    'smart': 'Smart',
                                    'automatic': 'Auto',
                                    'silent': 'Stille',
                                    'full': 'Turbo',
                                    'top': 'Topp',
                                    'middle': 'Midten',
                                    'bottom': 'Bunn',
                                    'swing': 'Sving',
                                    'both': 'Begge',
                                    'vertical': 'Vertikal',
                                    'horizontal': 'Horisontal',
                                    'fixed': 'Låst',
                                    'none': 'Ingen',
                                    'normal': 'Normal',
                                    'powerful': 'Kraftig',
                                    'quiet': 'Stille',
                                    'boost': 'Boost',
                                    'eco': 'Øko',
                                    'comfort': 'Komfort',
                                    'away': 'Borte',
                                    'sleep': 'Natt',
                                    'freeze protection': 'Frostsikring'
                                };
                                
                                if (typeof mode === 'string' && map[mode.toLowerCase()]) return map[mode.toLowerCase()];
                                if (typeof modeObj === 'object' && modeObj !== null && modeObj.title) return modeObj.title;
                                if (typeof mode === 'string') return mode.charAt(0).toUpperCase() + mode.slice(1);
                                return String(mode);
                            };

                            let modesToRender = [];
                            if (modeOptions.length > 0) {
                                modesToRender = modeOptions;
                            } else if (device.capabilitiesObj?.[capId]?.values) {
                                modesToRender = device.capabilitiesObj[capId].values;
                            } else {
                                modesToRender = ['off', 'low', 'medium', 'high', 'auto'];
                            }
                            const currentMode = optimisticCaps[capId] || device.capabilitiesObj[capId]?.value;
                            const title = capConfig.title || (isSwing ? 'Sving' : isPreset ? 'Preset' : 'Viftehastighet');

                            return (
                                <div key={capId} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
                                    <label style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>{title}</label>
                                    <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                        {modesToRender.map(modeObj => {
                                            const modeId = (typeof modeObj === 'object' && modeObj !== null && modeObj.id) ? modeObj.id : modeObj;
                                            const isActive = currentMode === modeId;

                                            return (
                                                <button
                                                    key={String(modeId)}
                                                    className={`btn ${isActive ? 'btn-primary' : 'btn-secondary'}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setOptimisticCaps(prev => ({ ...prev, [capId]: modeId }));
                                                        api.setCapability(device.id, capId, modeId)
                                                            .catch(e => {
                                                                console.error(`Failed to set ${capId}`, e);
                                                                setOptimisticCaps(prev => {
                                                                    const next = { ...prev };
                                                                    delete next[capId];
                                                                    return next;
                                                                });
                                                            });
                                                    }}
                                                    onPointerDown={(e) => e.stopPropagation()}
                                                    style={{ flex: 1, minWidth: '70px', textTransform: 'capitalize', fontSize: '0.85rem', padding: '8px 4px' }}
                                                >
                                                    {getGenericLabel(modeObj)}
                                                </button>
                                            )
                                        })}
                                    </div>
                                </div>
                            );
                        }

                        // Fallback: Use standard TileCapabilities for other things (e.g. humidity, power metered)
                        // Create a mini-config for just this capability
                        return (
                            <TileCapabilities key={capId} device={device} capabilities={[capConfig]} />
                        );
                    })}

                    {/* External Power Source Display - MOVED to bottom */}
                    {externalPowerDevice && externalPowerValue !== undefined && (
                        <MiniPowerGraph
                            key="external_power"
                            deviceId={externalPowerDevice.id}
                            capabilityId={tile.settings?.externalPowerCapability || 'measure_power'}
                            currentValue={externalPowerValue}
                            unit={externalPowerUnit}
                            title="Strømforbruk"
                            color="var(--color-warning)"
                        // Note: We could pass subtitle={externalPowerDevice.name} if we extended MiniPowerGraph
                        />
                    )}

                    {(!tile.expandedCapabilities || tile.expandedCapabilities.length === 0) && (
                        <div style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic', textAlign: 'center' }}>
                            Ingen kontroller valgt for utvidet visning.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ThermostatTile;
