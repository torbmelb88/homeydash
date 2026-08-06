import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useHomey } from '../../context/HomeyContext';
import { AlertCircle, Thermometer, Flame, Snowflake, RefreshCw, Power, Maximize2, X } from 'lucide-react';
import ThermostatTile from './ThermostatTile';

const MultiThermostatTile = ({ tile }) => {
    const { api, devices, isInteracting, setIsInteracting } = useHomey();
    const [optimisticTemps, setOptimisticTemps] = useState({});
    const [sliderHeight, setSliderHeight] = useState(150);
    const [expandedDeviceId, setExpandedDeviceId] = useState(null);
    const sliderRef = useRef(null);

    // Filter valid devices
    const tileDevices = (tile.devices || [])
        .map(id => devices.find(d => d.id === id))
        .filter(Boolean);

    // Measure slider height for vertical orientation styling if needed
    useEffect(() => {
        if (!sliderRef.current) return;
        const observer = new ResizeObserver(entries => {
            for (let entry of entries) {
                setSliderHeight(entry.contentRect.height);
            }
        });
        observer.observe(sliderRef.current);
        return () => observer.disconnect();
    }, []);

    // Sync effect
    useEffect(() => {
        const newOptimistic = { ...optimisticTemps };
        let updated = false;

        tileDevices.forEach(device => {
            if (optimisticTemps[device.id] !== undefined) {
                const actual = device.capabilitiesObj?.target_temperature?.value;
                if (Math.abs(actual - optimisticTemps[device.id]) < 0.2) {
                    delete newOptimistic[device.id];
                    updated = true;
                }
            }
        });

        if (updated) {
            setOptimisticTemps(newOptimistic);
        }
    }, [devices, optimisticTemps]); // Sync when devices update

    if (tileDevices.length === 0) {
        return (
            <div className="tile-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-secondary)', fontSize: '0.8rem', textAlign: 'center', padding: '10px' }}>
                <AlertCircle size={24} style={{ marginBottom: '8px', opacity: 0.5 }} />
                <span>Ingen termostater valgt</span>
                <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>Trykk for å konfigurere</span>
            </div>
        );
    }

    const handleSliderChange = (e, deviceId) => {
        const val = parseFloat(e.target.value);
        setOptimisticTemps(prev => ({ ...prev, [deviceId]: val }));
        if (!isInteracting) setIsInteracting(true);
    };

    const handleSliderEnd = (e, deviceId) => {
        const val = parseFloat(e.target.value);
        api.setTargetTemperature(deviceId, val).catch(err => console.error(err));
        // Small delay to clear interaction state smoothly
        setTimeout(() => setIsInteracting(false), 500);
    };

    const isVertical = tile.orientation === 'vertical';
    const minTemp = 5;
    const maxTemp = 35;

    // Helper to calculate percentage for gradient stop
    const getPercent = (val) => ((val - minTemp) / (maxTemp - minTemp)) * 100;

    // Helper for mode icons
    const getModeIcon = (mode) => {
        switch (mode) {
            case 'heat': return <Flame size={12} />;
            case 'cool': return <Snowflake size={12} />;
            case 'auto': return <RefreshCw size={12} />;
            case 'off': return <Power size={12} />;
            default: return <Thermometer size={12} />;
        }
    };

    const expandedDevice = expandedDeviceId ? devices.find(d => d.id === expandedDeviceId) : null;

    return (
        <div className={`tile-content multi-light-container ${isVertical ? 'vertical' : 'horizontal'}`} style={{ gap: '8px', padding: '8px' }}>
            {tile.name && <div style={{ width: '100%', fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-secondary)', textAlign: 'left', padding: '0 4px', marginBottom: '4px' }}>{tile.name}</div>}
            {tileDevices.map((device) => {
                const displayName = tile.settings?.customNames?.[device.id] || device.name;
                const currentTemp = device.capabilitiesObj?.measure_temperature?.value;
                const targetTemp = optimisticTemps[device.id] !== undefined
                    ? optimisticTemps[device.id]
                    : (device.capabilitiesObj?.target_temperature?.value || 20);

                // Only show mode if capability exists
                const hasMode = device.capabilities?.includes('thermostat_mode');
                const mode = hasMode ? device.capabilitiesObj?.thermostat_mode?.value : null;

                const pct = getPercent(targetTemp);

                // Gradient from Blue (#3b82f6) to Red (#ef4444)
                // We shift the midpoint based on value to give visual feedback
                const gradient = `linear-gradient(to right, #3b82f6 0%, #ef4444 100%)`;

                return (
                    <div key={device.id} className="multi-light-item" style={{ display: 'flex', position: 'relative', overflow: 'hidden', borderRadius: '12px', background: 'rgba(0,0,0,0.2)' }}>

                        {/* Expand Button (left side) */}
                        <button
                            className="btn-icon"
                            style={{
                                zIndex: 10,
                                position: 'relative',
                                padding: '0 12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: 'transparent',
                                border: 'none',
                                borderRight: '1px solid rgba(255,255,255,0.1)',
                                color: 'white',
                                opacity: 0.8,
                                cursor: 'pointer',
                                outline: 'none'
                            }}
                            onClick={(e) => { e.stopPropagation(); setExpandedDeviceId(device.id); }}
                        >
                            <Maximize2 size={16} />
                        </button>

                        {/* Slider Container (takes rest of space) */}
                        <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
                            {/* Background Gradient Bar */}
                            <div
                                style={{
                                    position: 'absolute',
                                    top: 0, bottom: 0, left: 0,
                                    width: `${pct}%`,
                                    background: gradient,
                                    opacity: 0.8,
                                    transition: isInteracting ? 'none' : 'width 0.3s ease-out',
                                }}
                            />

                            {/* Content Overlay */}
                            <div style={{ position: 'relative', zIndex: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '100%', padding: '12px 12px', pointerEvents: 'none' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', minWidth: 0, paddingRight: '10px' }}>
                                    <div style={{ fontWeight: 500, fontSize: '0.85rem', textShadow: '0 1px 2px rgba(0,0,0,0.8)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                                        {displayName}
                                    </div>
                                    {mode && (
                                        <div style={{ fontSize: '0.7rem', opacity: 0.8, display: 'flex', alignItems: 'center', gap: '4px', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}>
                                            {getModeIcon(mode)}
                                            <span style={{ textTransform: 'capitalize' }}>{mode}</span>
                                        </div>
                                    )}
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', textShadow: '0 1px 2px rgba(0,0,0,0.8)', flexShrink: 0 }}>
                                    {currentTemp !== undefined && (
                                        <div style={{ fontSize: '0.75rem', opacity: 0.8, display: 'flex', alignItems: 'center', gap: '2px' }}>
                                            <Thermometer size={12} />
                                            {currentTemp.toFixed(1)}°
                                        </div>
                                    )}
                                    <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>
                                        {targetTemp.toFixed(1)}°
                                    </div>
                                </div>
                            </div>

                            {/* Invisible Input Slider Overlay */}
                            <input
                                type="range"
                                min={minTemp}
                                max={maxTemp}
                                step="0.5"
                                value={targetTemp}
                                onChange={(e) => handleSliderChange(e, device.id)}
                                onMouseUp={(e) => handleSliderEnd(e, device.id)}
                                onTouchEnd={(e) => handleSliderEnd(e, device.id)}
                                style={{
                                    position: 'absolute',
                                    inset: 0,
                                    width: '100%',
                                    height: '100%',
                                    opacity: 0,
                                    cursor: 'ew-resize',
                                    margin: 0
                                }}
                            />
                        </div>
                    </div>
                );
            })}

            {/* Render Expanded Overlay for the selected thermostat */}
            {expandedDeviceId && expandedDevice && createPortal(
                <div className="tile-expanded-overlay" onClick={() => setExpandedDeviceId(null)}>
                    <div
                        className="tile-expanded-content"
                        onClick={e => e.stopPropagation()}
                    >
                        <button
                            className="tile-expanded-close"
                            onClick={() => setExpandedDeviceId(null)}
                        >
                            <X size={32} />
                        </button>
                        <div className="tile-expanded-header">
                            <h2>{tile.settings?.customNames?.[expandedDeviceId] || expandedDevice.name}</h2>
                        </div>
                        <div className="tile-expanded-body">
                            {/* We re-use ThermostatTile, passing it a customized tile config so per-device user settings (expandedCapabilities) are respected */}
                            <ThermostatTile
                                tile={{
                                    ...tile,
                                    expandedCapabilities: tile.settings?.multiExpandedCapabilities?.[expandedDeviceId] || []
                                }}
                                device={expandedDevice}
                                expanded={true}
                            />
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default MultiThermostatTile;
