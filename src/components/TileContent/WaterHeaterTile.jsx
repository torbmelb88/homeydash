import React, { useState } from 'react';
import { Thermometer, Zap, Droplets, Flame, Power } from 'lucide-react';
import { useHomey } from '../../context/HomeyContext';
import useIsMobile from '../../hooks/useIsMobile';


const WaterHeaterTile = ({ device, expanded, tile }) => {
    const { api } = useHomey();
    const isMobile = useIsMobile();

    // Capability Mapping – aligned with hub-mapper.jsx water heater entity mapping
    const temp = device?.capabilitiesObj?.measure_temperature?.value;
    const targetTemp = device?.capabilitiesObj?.target_temperature?.value;
    const power = device?.capabilitiesObj?.measure_power?.value;
    const energyInTank = device?.capabilitiesObj?.energy_in_tank?.value;
    const fillLevel = device?.capabilitiesObj?.fill_level?.value ?? 0; // 0-100
    const isBoostOn = device?.capabilitiesObj?.boost?.value;
    const isOn = device?.capabilitiesObj?.onoff?.value;
    const hasOnoff = device?.capabilities?.includes('onoff');
    const element1Active = device?.capabilitiesObj?.element_1_active?.value;
    const element2Active = device?.capabilitiesObj?.element_2_active?.value;
    // Fallback: derive active state from power or elements when no onoff capability
    const isActive = hasOnoff ? isOn : ((power != null && power > 10) || element1Active || element2Active);
    const programSelection = device?.capabilitiesObj?.program_selection?.value;
    const powerMode = device?.capabilitiesObj?.power_mode?.value;
    const energyDaily = device?.capabilitiesObj?.energy_daily?.value;
    const energyTotal = device?.capabilitiesObj?.meter_power?.value;

    const formatNumber = (num, decimals = 1) => (num !== undefined && num !== null) ? Number(num).toFixed(decimals) : '-';

    const handleToggle = async (capabilityId, currentValue, e) => {
        e.stopPropagation();
        // Find the entity_id for this capability
        const capObj = device?.capabilitiesObj?.[capabilityId];
        const entityId = capObj?.entity_id || device.id;
        try {
            await api.setCapability(entityId, capabilityId, !currentValue);
        } catch (err) {
            console.error(`Failed to toggle ${capabilityId}`, err);
        }
    };

    const handleTargetTempChange = async (newVal) => {
        const capObj = device?.capabilitiesObj?.target_temperature;
        const entityId = capObj?.entity_id || device.id;
        try {
            await api.setCapability(entityId, 'target_temperature', newVal);
        } catch (err) {
            console.error("Failed to set temp", err);
        }
    };

    // Wave Animation CSS
    // utilizing inline styles for simplicity in this file, or we could add to global CSS.
    // We'll create a simple CSS based wave.

    // Settings
    const showFillLevel = tile.settings?.showFillLevel !== false;
    const showPower     = !!tile.settings?.showPower;
    const showEnergyInTank = !!tile.settings?.showEnergyInTank;
    const tempMin  = tile.settings?.tempMin  ?? 30;
    const tempMax  = tile.settings?.tempMax  ?? 90;
    const tempStep = tile.settings?.tempStep ?? 1;

    const s = tile.settings || {};
    const expandedShowEnergyDaily    = s.expandedShowEnergyDaily    !== undefined ? s.expandedShowEnergyDaily    : true;
    const expandedShowEnergyTotal    = s.expandedShowEnergyTotal    !== undefined ? s.expandedShowEnergyTotal    : true;
    const expandedShowElements       = s.expandedShowElements       !== undefined ? s.expandedShowElements       : true;
    const expandedShowProgram        = s.expandedShowProgram        !== undefined ? s.expandedShowProgram        : true;
    const expandedShowPowerMode      = s.expandedShowPowerMode      !== undefined ? s.expandedShowPowerMode      : true;
    const expandedShowEnergyYesterday= s.expandedShowEnergyYesterday !== undefined ? s.expandedShowEnergyYesterday : false;
    const expandedShowEnergyMonthly  = s.expandedShowEnergyMonthly  !== undefined ? s.expandedShowEnergyMonthly  : false;

    const waterHeight = showFillLevel ? Math.min(Math.max(fillLevel, 0), 100) : 0;
    const waterColor = isBoostOn ? 'rgba(255, 100, 100, 0.6)' : 'rgba(56, 189, 248, 0.6)';

    // Wave animation styles
    const waveStyle = `
        @keyframes wave {
            0% { transform: translateX(-50%) rotate(0deg); }
            50% { transform: translateX(-50%) rotate(2deg); }
            100% { transform: translateX(-50%) rotate(0deg); }
        }
        @keyframes slosh {
            0% { transform: translate(0, 0) rotate(0deg); }
            25% { transform: translate(2px, 2px) rotate(1deg); }
            50% { transform: translate(0, 4px) rotate(0deg); }
            75% { transform: translate(-2px, 2px) rotate(-1deg); }
            100% { transform: translate(0, 0) rotate(0deg); }
        }
    `;

    if (!expanded) {
        return (
            <div className="tile-content" style={{ position: 'relative', overflow: 'hidden', height: '100%', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                <style>{waveStyle}</style>

                {/* Background Water Level */}
                <div style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    width: '100%',
                    height: `${waterHeight}%`,
                    background: `linear-gradient(to top, ${waterColor}, rgba(255,255,255,0.1))`,
                    transition: 'height 1s ease-in-out',
                    zIndex: -1,
                    // Simple "surface" animation container
                }}>
                    {/* Animated Surface */}
                    <div style={{
                        position: 'absolute',
                        top: '-15px',
                        left: '-10%',
                        width: '120%',
                        height: '30px',
                        background: waterColor,
                        borderRadius: '50%',
                        opacity: 0.8,
                        animation: 'slosh 3s ease-in-out infinite'
                    }} />
                    <div style={{
                        position: 'absolute',
                        top: '-10px',
                        left: '-5%',
                        width: '110%',
                        height: '20px',
                        background: 'rgba(255,255,255,0.3)',
                        borderRadius: '50%',
                        animation: 'slosh 4s ease-in-out infinite reverse'
                    }} />
                </div>

                {/* Content */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1 }}>
                        {formatNumber(temp, 1)}°
                    </div>
                    {/* Fill Level Label */}
                    <div style={{ fontSize: '0.8rem', opacity: 0.9, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Droplets size={12} /> {formatNumber(fillLevel, 0)}%
                    </div>
                </div>

                {/* Top Right Status */}
                <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    {isBoostOn && <Flame size={16} style={{ color: '#f87171' }} fill="currentColor" />}
                    {showPower && power > 0 && (
                        <div style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '2px' }}>
                            <Zap size={12} /> {Math.round(power)}W
                        </div>
                    )}
                    {showEnergyInTank && energyInTank > 0 && (
                        <div style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '2px', opacity: 0.8 }}>
                            {formatNumber(energyInTank, 1)} kWh
                        </div>
                    )}
                </div>

                {!isActive && (
                    <div style={{ position: 'absolute', top: 8, left: 8, opacity: 0.7 }}>
                        <Power size={16} color="var(--color-text-secondary)" />
                    </div>
                )}
            </div>
        );
    }

    // Expanded View
    return (
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '16px', width: '100%', alignItems: 'flex-start', color: 'var(--color-text-primary)' }}>

            {/* Tank + temp-kontroll + knapper */}
            <div style={{ flex: isMobile ? '0 0 auto' : '0 0 220px', width: isMobile ? '100%' : undefined, display: 'flex', flexDirection: 'column', gap: '12px' }}>

                {/* Temperatur-header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 700, lineHeight: 1 }}>{formatNumber(temp, 1)}°C</div>
                        <div style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: '2px' }}>{isActive ? 'Varmer' : 'Standby'}{isBoostOn ? ' · Boost' : ''}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {isBoostOn && <Flame size={20} color="#f87171" fill="currentColor" />}
                        {!isOn && <Power size={16} color="var(--color-text-secondary)" />}
                    </div>
                </div>

                {/* Tankvisualisering */}
                <div style={{
                    height: '90px', borderRadius: '12px',
                    background: 'rgba(0,0,0,0.2)', position: 'relative',
                    overflow: 'hidden', border: '2px solid rgba(255,255,255,0.1)', flexShrink: 0
                }}>
                    <div style={{
                        position: 'absolute', bottom: 0, width: '100%',
                        height: `${waterHeight}%`,
                        background: isBoostOn
                            ? 'linear-gradient(to top, #ef4444, #f87171)'
                            : 'linear-gradient(to top, #0284c7, #38bdf8)',
                        transition: 'height 0.5s ease-out'
                    }}>
                        <div style={{ position: 'absolute', top: 0, width: '100%', height: '4px', background: 'rgba(255,255,255,0.5)' }} />
                    </div>
                    <div style={{ position: 'absolute', bottom: '6px', left: '12px', fontWeight: 700, fontSize: '1rem', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                        {formatNumber(fillLevel, 0)}% Full
                    </div>
                    <div style={{ position: 'absolute', bottom: '6px', right: '12px', fontSize: '0.85rem', opacity: 0.9, textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                        {energyInTank ? `${formatNumber(energyInTank)} kWh` : ''}
                    </div>
                </div>

                {/* Måltemperatur */}
                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '10px 12px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>Måltemperatur</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <button className="icon-btn"
                            onClick={() => handleTargetTempChange(Math.max(tempMin, (targetTemp ?? tempMin) - tempStep))}
                            disabled={(targetTemp ?? tempMin) <= tempMin}
                        >−</button>
                        <span style={{ fontSize: '1.1rem', fontWeight: 600 }}>{targetTemp ?? '–'}°C</span>
                        <button className="icon-btn"
                            onClick={() => handleTargetTempChange(Math.min(tempMax, (targetTemp ?? tempMax) + tempStep))}
                            disabled={(targetTemp ?? tempMax) >= tempMax}
                        >+</button>
                    </div>
                </div>

                {/* Knapper */}
                <div style={{ display: 'grid', gridTemplateColumns: hasOnoff ? '1fr 1fr' : '1fr', gap: '10px' }}>
                    {hasOnoff && (
                        <button
                            className={`btn ${isOn ? 'btn-primary' : 'btn-secondary'}`}
                            style={{ height: '44px' }}
                            onClick={(e) => handleToggle('onoff', isOn, e)}
                        >
                            <Power size={16} style={{ marginRight: '6px' }} />
                            {isOn ? 'På' : 'Av'}
                        </button>
                    )}
                    <button
                        className={`btn ${isBoostOn ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ height: '44px', background: isBoostOn ? 'var(--color-error)' : undefined, borderColor: isBoostOn ? 'transparent' : undefined }}
                        onClick={(e) => handleToggle('boost', isBoostOn, e)}
                    >
                        <Flame size={16} style={{ marginRight: '6px' }} />
                        Boost
                    </button>
                </div>
            </div>

            {/* Statistikk + elementer + program */}
            <div style={{ flex: 1, width: isMobile ? '100%' : undefined, display: 'flex', flexDirection: 'column', gap: '12px' }}>

                {/* Stats Grid */}
                {(() => {
                    const stats = [
                        { show: true,                        label: 'Effekt nå',        value: `${formatNumber(power, 0)} W` },
                        { show: expandedShowEnergyTotal,     label: 'Energi totalt',    value: `${formatNumber(energyTotal, 0)} kWh` },
                        { show: expandedShowEnergyDaily,     label: 'Energi i dag',     value: `${formatNumber(energyDaily, 1)} kWh` },
                        { show: true,                        label: 'Lagret energi',    value: `${formatNumber(energyInTank, 1)} kWh` },
                        { show: expandedShowEnergyYesterday, label: 'Energi i går',     value: `${formatNumber(device?.capabilitiesObj?.energy_yesterday?.value, 1)} kWh` },
                        { show: expandedShowEnergyMonthly,   label: 'Energi denne mnd', value: `${formatNumber(device?.capabilitiesObj?.energy_monthly?.value, 0)} kWh` },
                    ].filter(s => s.show);
                    return (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                            {stats.map(stat => (
                                <div key={stat.label} style={{ background: 'rgba(255,255,255,0.05)', padding: '8px 12px', borderRadius: '10px' }}>
                                    <div style={{ fontSize: '0.75rem', opacity: 0.7, marginBottom: '2px' }}>{stat.label}</div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{stat.value}</div>
                                </div>
                            ))}
                        </div>
                    );
                })()}

                {/* Varmeelementer */}
                {expandedShowElements && (element1Active !== undefined || element2Active !== undefined) && (
                    <div style={{ background: 'rgba(255,255,255,0.05)', padding: '10px 12px', borderRadius: '12px' }}>
                        <div style={{ fontSize: '0.75rem', opacity: 0.7, marginBottom: '6px' }}>Varmeelementer</div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {[{ label: 'Element 1', active: element1Active }, { label: 'Element 2', active: element2Active }].map(el => (
                                <div key={el.label} style={{
                                    flex: 1, padding: '6px 8px', borderRadius: '8px', textAlign: 'center',
                                    background: el.active ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)',
                                    border: `1px solid ${el.active ? 'rgba(239,68,68,0.5)' : 'transparent'}`
                                }}>
                                    <div style={{ fontSize: '0.72rem', opacity: 0.7 }}>{el.label}</div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: el.active ? '#f87171' : 'inherit' }}>
                                        {el.active ? 'Aktiv' : 'Av'}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Program / Strømmodus */}
                {(expandedShowProgram || expandedShowPowerMode) && (programSelection || powerMode) && (
                    <div style={{ background: 'rgba(255,255,255,0.05)', padding: '10px 12px', borderRadius: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            {expandedShowProgram && programSelection && (
                                <div>
                                    <div style={{ fontSize: '0.75rem', opacity: 0.7, marginBottom: '2px' }}>Program</div>
                                    <div style={{ fontWeight: 600 }}>{programSelection}</div>
                                </div>
                            )}
                            {expandedShowPowerMode && powerMode && (
                                <div style={{ textAlign: expandedShowProgram && programSelection ? 'right' : 'left' }}>
                                    <div style={{ fontSize: '0.75rem', opacity: 0.7, marginBottom: '2px' }}>Strømmodus</div>
                                    <div style={{ fontWeight: 600 }}>{powerMode}</div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default WaterHeaterTile;
