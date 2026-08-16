import React, { useState, useEffect, useRef } from 'react';
import { useHomey } from '../../context/HomeyContext';
import { resolveTileDevice } from '../../services/utils';
import { Power, AlertCircle } from 'lucide-react';

const MultiLightTile = ({ tile, expanded, onOpenExpanded, onCloseExpanded }) => {
    const { api, devices, isInteracting, setIsInteracting } = useHomey();
    const [localStates, setLocalStates] = useState({});
    const [optimisticStates, setOptimisticStates] = useState({});
    const [sliderHeight, setSliderHeight] = useState(150);
    const sliderRef = useRef(null);

    // Filter valid devices (entity-hint fallback survives nye HA device-ID-er)
    const deviceEntityHints = tile.settings?.deviceEntityHints || {};
    const tileDevices = (tile.devices || [])
        .map(id => resolveTileDevice(devices, id, deviceEntityHints[id]))
        .filter(Boolean);

    // Sync local state and clear optimistic state when matched
    useEffect(() => {
        const newStates = {};
        let optimisticUpdated = false;
        const newOptimistic = { ...optimisticStates };

        tileDevices.forEach(device => {
            // Update local state
            if (!isInteracting) {
                newStates[device.id] = {
                    onoff: device.capabilitiesObj?.onoff?.value,
                    dim: device.capabilitiesObj?.dim?.value || 0
                };
            }

            // Check if optimistic state matches actual state (sync complete)
            if (optimisticStates[device.id] !== undefined) {
                const actualDim = device.capabilitiesObj?.dim?.value || 0;
                const optimisticDim = optimisticStates[device.id];

                // If values are close enough, clear optimistic state
                if (Math.abs(actualDim - optimisticDim) < 0.05) {
                    delete newOptimistic[device.id];
                    optimisticUpdated = true;
                }
            }
        });

        if (!isInteracting) {
            setLocalStates(prev => ({ ...prev, ...newStates }));
        }

        if (optimisticUpdated) {
            setOptimisticStates(newOptimistic);
        }
    }, [devices, isInteracting, optimisticStates]); // Sync when devices update

    // Measure slider height for vertical orientation
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

    const handleToggle = (e, device) => {
        e.stopPropagation();
        const newState = !localStates[device.id]?.onoff;

        // Optimistic update
        setLocalStates(prev => ({
            ...prev,
            [device.id]: { ...prev[device.id], onoff: newState }
        }));

        api.setCapability(device.id, 'onoff', newState).catch(err => {
            console.error("Failed to toggle", err);
        });
    };

    const handleDimChange = (e, deviceId) => {
        const val = parseFloat(e.target.value);

        // Update optimistic state immediately
        setOptimisticStates(prev => ({
            ...prev,
            [deviceId]: val
        }));

        // Only trigger interaction state if not already interacting
        if (!isInteracting) {
            setIsInteracting(true);
        }
    };

    const handleDimChangeEnd = (e, deviceId) => {
        const val = parseFloat(e.target.value);

        // Send command
        api.setDim(deviceId, val);

        // Don't clear optimistic state here; let the useEffect handle it when value syncs
        setIsInteracting(false);
    };

    if (tileDevices.length === 0) {
        return (
            <div className="tile-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-secondary)', fontSize: '0.8rem', textAlign: 'center', padding: '10px' }}>
                <AlertCircle size={24} style={{ marginBottom: '8px', opacity: 0.5 }} />
                <span>Ingen lamper valgt</span>
                <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>Trykk for å konfigurere</span>
            </div>
        );
    }

    const isCompact = tile.settings?.compact && !expanded;
    const effectiveOrientation = (expanded && tile.settings?.expandedOrientation) 
        ? tile.settings.expandedOrientation 
        : tile.orientation;
    const isVertical = effectiveOrientation === 'vertical';
    const columns = tile.settings?.columns || 'auto';

    // Auto-detect columns based on tile width if 'auto'
    let effectiveColumns = columns;
    if (columns === 'auto') {
        const widthPart = tile.size ? parseInt(tile.size.split('x')[0]) : 1;
        effectiveColumns = widthPart; // 1x1 -> 1 col, 2x1 -> 2 cols
    }

    // Calculate grid columns style
    const gridStyle = {
        display: 'grid',
        gap: '8px',
        flex: 1,
        alignContent: 'start',
        gridTemplateColumns: `repeat(${effectiveColumns}, 1fr)`
    };

    // Compact View (Grid of Icons)
    if (isCompact) {
        return (
            <div
                className="tile-content"
                onClick={onOpenExpanded}
                style={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    cursor: 'pointer',
                    padding: '8px'
                }}
            >
                {tile.name && (
                    <div style={{
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        color: 'var(--color-text-secondary)',
                        marginBottom: '8px',
                        paddingLeft: '4px'
                    }}>
                        {tile.name}
                    </div>
                )}

                <div style={gridStyle}>
                    {tileDevices.map((device) => {
                        const state = localStates[device.id] || {};
                        const isOn = state.onoff;
                        const name = tile.settings?.customNames?.[device.id] || device.name;

                        return (
                            <div
                                key={device.id}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'flex-start',
                                    width: '100%',
                                    minHeight: 0
                                }}
                            >
                                <div
                                    onClick={(e) => handleToggle(e, device)}
                                    title={name}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: isOn ? 'rgba(255, 255, 255, 0.25)' : 'rgba(255, 255, 255, 0.1)',
                                        borderRadius: '50%', // Round
                                        aspectRatio: '1',
                                        width: '100%', // Fill the grid cell width
                                        maxWidth: '70px', // Cap max size to avoid huge buttons
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        border: isOn ? '2px solid var(--color-accent-primary)' : '1px solid rgba(255, 255, 255, 0.2)',
                                        boxShadow: isOn ? '0 0 12px rgba(255, 193, 7, 0.3)' : 'none', // Glow when on
                                        marginBottom: '6px'
                                    }}
                                >
                                    {device.LucideIcon ? (
                                        <device.LucideIcon 
                                            size={28} 
                                            strokeWidth={1.5}
                                            style={{
                                                color: isOn ? 'var(--color-accent-primary)' : 'inherit',
                                                filter: isOn ? 'drop-shadow(0 0 2px var(--color-accent-primary))' : 'grayscale(100%) opacity(0.7)'
                                            }}
                                        />
                                    ) : (
                                        <img
                                            src={api.getIconUrl(device)}
                                            alt={name}
                                            style={{
                                                width: '50%', // Relative to button
                                                height: '50%',
                                                objectFit: 'contain',
                                                filter: isOn ? 'drop-shadow(0 0 2px var(--color-accent-primary))' : 'grayscale(100%) opacity(0.7)'
                                            }}
                                        />
                                    )}
                                </div>
                                <span style={{
                                    fontSize: '0.7rem',
                                    lineHeight: '1.1',
                                    maxWidth: '100%',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap', // Keep single line for neatness
                                    textAlign: 'center',
                                    color: isOn ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                                    fontWeight: isOn ? 600 : 400
                                }}>{name}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    // Standard / Expanded View (Sliders)
    // If vertical, use flex-row to place items side by side (columns), but sliders are vertical inside.
    // Wait, the user said "Vertical (Kolonner)" -> this means items are side-by-side?
    // In Settings: "Vertikal (Kolonner)" sets orientation='vertical'.
    // If orientation='vertical', existing code used flex-direction: column? No, class 'vertical' usually implies something.
    // Let's redefine:
    // Horizontal (Rader): Items stacked vertically (rows), sliders horizontal.
    // Vertical (Kolonner): Items side-by-side (columns), sliders VERTICAL.

    return (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
            {(tile.name && !expanded) && <div style={{ width: '100%', fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-secondary)', textAlign: 'left', padding: '4px 8px', marginBottom: '4px', flexShrink: 0 }}>{tile.name}</div>}

            <div
                className={`tile-content multi-light-container ${isVertical ? 'vertical' : 'horizontal'}`}
                style={{
                    flex: 1,
                    minHeight: 0,
                    display: 'flex',
                    flexDirection: isVertical ? 'row' : 'column',
                    // overflowX: isVertical ? 'auto' : 'hidden', // Let parent handle width
                    overflowY: isVertical ? 'hidden' : 'auto',
                    gap: '16px',
                    padding: '8px'
                }}
            >
                {tileDevices.map((device, index) => {
                    const state = localStates[device.id] || {};
                    const isOn = state.onoff;
                    const dim = optimisticStates[device.id] !== undefined ? optimisticStates[device.id] : state.dim;
                    const name = tile.settings?.customNames?.[device.id] || device.name;

                    return (
                        <div key={device.id} className="multi-light-item" style={{
                            display: 'flex',
                            flexDirection: isVertical ? 'column' : 'row',
                            alignItems: 'center',
                            flex: isVertical ? '0 0 80px' : '0 0 auto', // Fixed width for vertical columns
                            gap: '8px',
                            height: isVertical ? '100%' : 'auto',
                            width: isVertical ? 'auto' : '100%'
                        }}>
                            <div className="slider-name" style={{
                                fontSize: '0.8rem',
                                width: isVertical ? '100%' : '120px',
                                textAlign: isVertical ? 'center' : 'left',
                                whiteSpace: isVertical ? 'normal' : 'nowrap',
                                overflow: 'hidden',
                                textOverflow: isVertical ? 'clip' : 'ellipsis',
                                lineHeight: '1.2',
                                height: isVertical ? '3em' : 'auto', // Fixed height to align sliders
                                display: isVertical ? 'flex' : 'block',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }} title={name}>{name}</div>

                            {/* Slider Container */}
                            {device.capabilities.includes('dim') ? (
                                <div
                                    className="slider-wrapper"
                                    style={{
                                        '--val': dim,
                                        flex: 1,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: isVertical ? '100%' : 'auto',
                                        height: isVertical ? '100%' : '48px', // Increased from auto/default to 48px
                                        minHeight: isVertical ? '200px' : '48px',
                                        position: 'relative' // Ensure relative for absolute input
                                    }}
                                    ref={index === 0 ? sliderRef : null}
                                >
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.01"
                                        value={dim || 0}
                                        onChange={(e) => handleDimChange(e, device.id)}
                                        onMouseUp={(e) => handleDimChangeEnd(e, device.id)}
                                        onTouchEnd={(e) => handleDimChangeEnd(e, device.id)}
                                        className="multi-light-slider"
                                        style={isVertical ? {
                                            // Vertical slider using transform
                                            width: `${sliderHeight}px`, // Set width to the height of container
                                            height: '42px', // Match standard width
                                            position: 'absolute',
                                            top: '50%',
                                            left: '50%',
                                            transform: 'translate(-50%, -50%) rotate(-90deg)',
                                            margin: 0,
                                            opacity: 0, // Invisible
                                            cursor: 'pointer'
                                        } : {
                                            // Horizontal slider
                                            width: '100%',
                                            height: '100%',
                                            opacity: 0,
                                            cursor: 'pointer'
                                        }}
                                    />
                                    {/* Percent inside/next to the bar */}
                                    {!isVertical && <div className="slider-percent" style={{ width: '40px', textAlign: 'right', fontSize: '0.8rem' }}>{Math.round((dim || 0) * 100)}%</div>}
                                    {isVertical && <div className="slider-percent" style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>{Math.round((dim || 0) * 100)}%</div>}
                                </div>
                            ) : (
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    {/* Spacer for non-dimmable devices to maintain alignment if needed, or just leave empty */}
                                </div>
                            )}

                            <button
                                className={`slider-toggle ${isOn ? 'on' : 'off'}`}
                                onClick={(e) => handleToggle(e, device)}
                                style={{
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '50%',
                                    border: 'none',
                                    background: isOn ? 'var(--color-surface)' : 'rgba(255,255,255,0.1)',
                                    color: isOn ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    boxShadow: isOn ? '0 0 10px var(--color-accent-primary)' : 'none'
                                }}
                            >
                                <Power size={18} />
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default MultiLightTile;
