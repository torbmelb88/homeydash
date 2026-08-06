import React, { useState, useEffect } from 'react';
import * as LucideIcons from 'lucide-react';
import { useHomey } from '../../context/HomeyContext';
import TileCapabilities from '../TileCapabilities';
import MiniPowerGraph from './MiniPowerGraph';

const UniversalTile = ({ tile, isEditing, onSettings, expanded = false }) => {
    const { api, devices } = useHomey();
    const [localValue, setLocalValue] = useState(null);
    const [isUpdating, setIsUpdating] = useState(false);

    const device = devices.find(d => d.id === tile.deviceId);
    if (!device) return <div className="tile-error">Enhet ikke funnet</div>;

    const settings = tile.settings || {};
    const isOn = device.capabilitiesObj?.onoff?.value || false;

    // External power logic
    const externalPowerDevice = settings.externalPowerDeviceId ? devices.find(d => d.id === settings.externalPowerDeviceId) : null;
    const externalPowerValue = externalPowerDevice?.capabilitiesObj?.[settings.externalPowerCapability || 'measure_power']?.value;
    const externalPowerUnit = externalPowerDevice?.capabilitiesObj?.[settings.externalPowerCapability || 'measure_power']?.units || 'W';

    // Use custom icon if set, otherwise fallback to device class icon
    const MainIcon = settings.mainIcon && LucideIcons[settings.mainIcon] ? LucideIcons[settings.mainIcon] : null;
    const CustomIcon = settings.customIcon && LucideIcons[settings.customIcon] ? LucideIcons[settings.customIcon] : null;
    const DefaultIcon = settings.customIcon ? LucideIcons.Activity : (isOn ? LucideIcons.Lightbulb : LucideIcons.LightbulbOff);
    
    // For the main button icon, prioritize mainIcon, then customIcon, then default
    const MainIconComponent = MainIcon || CustomIcon || DefaultIcon;
    const HeaderIconComponent = CustomIcon || DefaultIcon;

    useEffect(() => {
        if (device.capabilitiesObj?.dim) {
            setLocalValue(device.capabilitiesObj.dim.value * 100);
        }
    }, [device.capabilitiesObj?.dim?.value]);

    const handleToggle = async (e) => {
        if (isEditing) return;
        e.stopPropagation();
        const newValue = !isOn;
        try {
            await api.setCapability(device.id, 'onoff', newValue);
        } catch (error) {
            console.error('Toggle failed:', error);
        }
    };

    const handleSliderChange = async (e) => {
        const val = parseFloat(e.target.value);
        setLocalValue(val);
    };

    const handleSliderCommit = async (e) => {
        const val = parseFloat(e.target.value) / 100;
        setIsUpdating(true);
        try {
            await api.setCapability(device.id, 'dim', val);
        } catch (error) {
            console.error('Dim failed:', error);
        } finally {
            setIsUpdating(false);
        }
    };

    const handleControlChange = async (e, ctrl, isSelect = false) => {
        e.stopPropagation();
        if (isEditing) return;
        
        try {
            const ctrlDevice = devices.find(d => d.id === ctrl.deviceId);
            if (!ctrlDevice) return;

            let newVal;
            if (isSelect) {
                newVal = e.target.value;
            } else {
                const currentVal = ctrlDevice.capabilitiesObj?.[ctrl.capabilityId]?.value;
                if (typeof currentVal === 'boolean') {
                    newVal = !currentVal;
                } else if (ctrl.capabilityId.includes('button')) {
                    newVal = true;
                } else {
                    newVal = !currentVal; // Default toggle
                }
            }

            await api.setCapability(ctrl.deviceId, ctrl.capabilityId, newVal);
        } catch (err) {
            console.error('Secondary control change failed:', err);
        }
    };

    return (
        <div className={`universal-tile ${isOn ? 'on' : 'off'} ${settings.centeredMain ? 'centered-layout' : ''} ${expanded ? 'expanded' : ''}`} onClick={handleToggle}>

            <div className="universal-tile-content">
                {/* Internal header removed by default to avoid redundancy with the main Tile header */}
                {settings.showInternalHeader && (
                    <div className="universal-header">
                        <div className="universal-main-icon" onClick={handleToggle}>
                            {React.createElement(MainIconComponent, { 
                                size: settings.centeredMain ? 32 : 28, 
                                color: isOn ? 'var(--color-primary)' : 'var(--color-text-secondary)'
                            })}
                        </div>
                        {!settings.hideMainInfo && (
                            <div className="universal-info">
                                <span className="universal-name">{tile.name || device.name}</span>
                                <span className="universal-status">
                                    {!settings.hideStatus && (isOn ? 'På' : 'Av')}
                                    {device.capabilitiesObj?.dim && !settings.hideSlider && (
                                        <>
                                            {!settings.hideStatus && ' • '}
                                            {Math.round((localValue !== null ? localValue : device.capabilitiesObj.dim.value * 100))}%
                                        </>
                                    )}
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* Status indicator for standard layout when header is hidden */}
                {!settings.showInternalHeader && (
                    <div className="universal-compact-status">
                        <span className={`status-dot ${isOn ? 'active' : ''}`}></span>
                        {!settings.hideStatus && <span className="status-text">{isOn ? 'På' : 'Av'}</span>}
                    </div>
                )}

                {/* Central Action (Main Switch) */}
                {!settings.showInternalHeader && (
                    <div className="universal-center-action" onClick={handleToggle}>
                        <div className={`main-switch-button ${isOn ? 'active' : ''}`}>
                            {React.createElement(MainIconComponent, { 
                                size: 42, 
                                strokeWidth: 1.5,
                                color: isOn ? 'white' : 'var(--color-text-secondary)'
                            })}
                        </div>
                    </div>
                )}

                {settings.secondaryControls?.length > 0 && (
                    <div className="universal-secondary-controls">
                        {settings.secondaryControls.map(ctrl => {
                            const ctrlDevice = devices.find(d => d.id === ctrl.deviceId);
                            const cap = ctrlDevice?.capabilitiesObj?.[ctrl.capabilityId];
                            const val = cap?.value;
                            
                            return (
                                <div key={ctrl.id} className="universal-row">
                                    <div className="universal-row-info">
                                        <span className="universal-row-label">{ctrl.label}</span>
                                    </div>
                                    <div className="universal-row-control">
                                        {ctrl.type === 'control' ? (
                                            cap?.values ? (
                                                <div className="universal-select-wrapper" onClick={(e) => e.stopPropagation()}>
                                                    <select 
                                                        className="universal-select"
                                                        value={val || ''}
                                                        onChange={(e) => handleControlChange(e, ctrl, true)}
                                                    >
                                                        {cap.values.map(option => (
                                                            <option key={option.id} value={option.id}>
                                                                {option.title || option.id}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                            ) : (
                                                <button 
                                                    className={`universal-btn ${val ? 'active' : ''}`}
                                                    onClick={(e) => handleControlChange(e, ctrl)}
                                                >
                                                    {typeof val === 'boolean' ? (val ? 'PÅ' : 'AV') : 'Trigger'}
                                                </button>
                                            )
                                        ) : (
                                            <span className="universal-row-value">
                                                {typeof val === 'number' ? Math.round(val * 10) / 10 : String(val ?? '--')}
                                                {ctrl.suffix && <span className="universal-suffix">{ctrl.suffix}</span>}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {!settings.hideSlider && device.capabilitiesObj?.dim && (
                <div className="universal-footer" onClick={(e) => e.stopPropagation()}>
                    <div className="universal-slider-label">
                        <span>Lysstyrke</span>
                        <span>{Math.round(localValue)}%</span>
                    </div>
                    <div className={`universal-slider-wrapper ${isUpdating ? 'universal-slider-loading' : ''}`}>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={localValue ?? 0}
                            onChange={handleSliderChange}
                            onMouseUp={handleSliderCommit}
                            onTouchEnd={handleSliderCommit}
                            className="universal-slider"
                        />
                    </div>
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

                    {(!tile.expandedCapabilities || tile.expandedCapabilities.length === 0) && (
                        <div style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic', textAlign: 'center' }}>
                            Ingen kontroller valgt for utvidet visning.
                        </div>
                    )}

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

export default UniversalTile;
