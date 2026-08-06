import React, { useState, useEffect } from 'react';
import { useHomey } from '../context/HomeyContext';
import { ChevronDown } from 'lucide-react';

const TileCapabilities = ({ device, capabilities }) => {
    const { api } = useHomey();
    const [optimisticValues, setOptimisticValues] = useState({});

    // Reset optimistic value when actual device value matches (or updates)
    useEffect(() => {
        if (!device?.capabilitiesObj) return;

        setOptimisticValues(prev => {
            const next = { ...prev };
            let changed = false;

            Object.keys(next).forEach(capId => {
                const deviceVal = device.capabilitiesObj[capId]?.value;
                // If device value matches optimistic value, clear optimistic
                if (deviceVal === next[capId]) {
                    delete next[capId];
                    changed = true;
                }
            });

            return changed ? next : prev;
        });
    }, [device.capabilitiesObj]);

    if (!device || !capabilities || capabilities.length === 0) return null;

    const handleCapabilityChange = (capId, value) => {
        // Set optimistic value immediately
        setOptimisticValues(prev => ({ ...prev, [capId]: value }));
        api.setCapability(device.id, capId, value);
    };

    const renderCapability = (capConfig) => {
        const capId = typeof capConfig === 'string' ? capConfig : capConfig.id;
        const customTitle = typeof capConfig === 'object' ? capConfig.title : null;

        const cap = device.capabilitiesObj?.[capId];
        if (!cap) return null;

        const displayTitle = customTitle || cap.title || capId;

        // Use optimistic value if available, otherwise device value
        const currentValue = optimisticValues[capId] !== undefined ? optimisticValues[capId] : cap.value;

        if (cap.type === 'boolean') {
            return (
                <div key={capId} style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '4px 8px',
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: '8px'
                }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--color-text-primary)' }}>
                        {displayTitle}
                    </span>

                    <div
                        onClick={(e) => {
                            e.stopPropagation();
                            handleCapabilityChange(capId, !currentValue);
                        }}
                        style={{
                            width: '40px',
                            height: '22px',
                            background: currentValue ? 'var(--color-accent-primary)' : 'rgba(255,255,255,0.2)',
                            borderRadius: '11px',
                            position: 'relative',
                            cursor: 'pointer',
                            transition: 'background 0.3s ease'
                        }}
                    >
                        <div style={{
                            width: '18px',
                            height: '18px',
                            background: '#fff',
                            borderRadius: '50%',
                            position: 'absolute',
                            top: '2px',
                            left: currentValue ? '20px' : '2px',
                            transition: 'left 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                        }} />
                    </div>
                </div>
            );
        }

        if (cap.values) {
            // Dropdown for enum capabilities (e.g. thermostat_mode)
            return (
                <div key={capId} style={{ width: '100%', position: 'relative' }}>
                    <div style={{
                        fontSize: '0.75rem',
                        color: 'var(--color-text-secondary)',
                        marginBottom: '2px',
                        paddingLeft: '2px'
                    }}>
                        {displayTitle}
                    </div>
                    <div style={{ position: 'relative', width: '100%' }}>
                        <select
                            value={currentValue}
                            onChange={(e) => handleCapabilityChange(capId, e.target.value)}
                            style={{
                                width: '100%',
                                background: 'rgba(255,255,255,0.08)',
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: 'var(--color-text-primary)',
                                padding: '6px 24px 6px 10px',
                                borderRadius: '6px',
                                fontSize: '0.85rem',
                                appearance: 'none',
                                cursor: 'pointer',
                                outline: 'none'
                            }}
                            onMouseDown={(e) => e.stopPropagation()} // Prevent tile click
                        >
                            {cap.values.map(val => (
                                <option key={val.id} value={val.id} style={{ color: 'black' }}>
                                    {val.title || val.id}
                                </option>
                            ))}
                        </select>
                        <ChevronDown
                            size={14}
                            style={{
                                position: 'absolute',
                                right: '8px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                pointerEvents: 'none',
                                color: 'rgba(255,255,255,0.5)'
                            }}
                        />
                    </div>
                </div>
            );
        }

        // Simple value display for others
        return (
            <div key={capId} style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                {displayTitle}: {currentValue}
            </div>
        );
    };

    return (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            {capabilities.map(capConfig => renderCapability(capConfig))}
        </div>
    );
};

export default TileCapabilities;
