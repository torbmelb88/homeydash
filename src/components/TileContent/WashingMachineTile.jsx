import React, { useMemo } from 'react';
import { useHomey } from '../../context/HomeyContext';
import { Activity, Clock, Thermometer, Droplets } from 'lucide-react';
import useIsMobile from '../../hooks/useIsMobile';
import { getMachinePopupCfg, parseKeywords } from '../../services/popup-settings';

const WashingMachineTile = ({ tile, device, expanded = false }) => {
    const { api, settings: globalSettings } = useHomey();
    const isMobile = useIsMobile();
    const [fullDevice, setFullDevice] = React.useState(null);

    React.useEffect(() => {
        const fetchFullDevice = async () => {
            if (device && device.id) {
                try {
                    const full = await api.getDevice(device.id);
                    setFullDevice(full);
                } catch (e) {
                    // console.error('[WashingMachine] Failed to fetch full device', e);
                }
            }
        };
        fetchFullDevice();
    }, [device?.id]);

    // Helper to get capability value
    const getCapValue = (capId) => device?.capabilitiesObj?.[capId]?.value;

    // Helper to get friendly display value from options
    const getCapDisplayValue = (capId) => {
        const val = getCapValue(capId);

        // Use fullDevice if available for options, otherwise fall back to device
        const targetDevice = fullDevice || device;

        if (val === undefined || val === null) return null;

        // Try to find options in capabilitiesOptions or capabilitiesObj
        let options = targetDevice?.capabilitiesOptions?.[capId];

        // Fallback: Check capabilitiesObj[capId].values (Found via debug)
        if (!options && targetDevice?.capabilitiesObj?.[capId]?.values) {
            options = { values: targetDevice.capabilitiesObj[capId].values };
        }

        if (options && options.values) {
            const foundOption = options.values.find(v => v.id == val);
            if (foundOption) return foundOption.title;
        }
        return val;
    };

    const opState = getCapDisplayValue('operational_state');
    const program = getCapDisplayValue('laundry_washer_program');
    const mode = getCapDisplayValue('laundry_washer_mode');
    const temperature = getCapDisplayValue('laundry_washer_temperature');
    const spinSpeed = getCapDisplayValue('laundry_washer_speed');

    // Logic for "active" state
    // Check both raw value and resolved text for "inactive" keywords
    const rawOpState = getCapValue('operational_state');
    // Egendefinerte inaktiv-ord ligger i de globale popup-innstillingene
    // (Innstillinger → Popups → Vaskemaskin) — samme som FinishedPromptManager.
    const customKeywords = parseKeywords(
        getMachinePopupCfg(globalSettings, 'washer', tile.settings).inactiveKeywords
    );
    const inactiveKeywords = [
        'idle', 'off', 'standby', 'inactive', 'end', 'done', 'finished',
        'ferdig', 'completed', 'stopped', 'pause', 'paused', '0',
        ...customKeywords
    ];

    const isActive = rawOpState &&
        !inactiveKeywords.includes(String(rawOpState).toLowerCase()) &&
        (!opState || !inactiveKeywords.includes(String(opState).toLowerCase()));

    // External Power Logic
    const externalPowerDeviceId = tile.settings?.externalPowerDeviceId;
    const externalPowerCapability = tile.settings?.externalPowerCapability || 'measure_power';
    const [externalPowerValue, setExternalPowerValue] = React.useState(null);

    React.useEffect(() => {
        if (!externalPowerDeviceId) return;

        const fetchExternalPower = async () => {
            try {
                const device = await api.getDevice(externalPowerDeviceId);
                if (device && device.capabilitiesObj && device.capabilitiesObj[externalPowerCapability]) {
                    setExternalPowerValue(device.capabilitiesObj[externalPowerCapability].value);
                }
            } catch (e) {
                console.warn('Failed to fetch external power', e);
            }
        };

        fetchExternalPower();
        // Ideally we would subscribe to changes, but polling or parent refresh handles it for now.
        // If we need real-time, we would need to check if useHomey provides live updates for all devices or specific ones.
        // Assuming global device list updates trigger re-renders if passed down, but here we fetch manually.
        // Better: Find the device in the global 'devices' list if available via context.
    }, [externalPowerDeviceId, externalPowerCapability, api]);

    // Better approach: Use global devices list if available to get reactive updates
    const { devices } = useHomey();
    const externalPowerDevice = useMemo(() => {
        if (!externalPowerDeviceId || !devices) return null;
        return devices.find(d => d.id === externalPowerDeviceId);
    }, [devices, externalPowerDeviceId]);

    const liveExternalPower = externalPowerDevice?.capabilitiesObj?.[externalPowerCapability]?.value ?? externalPowerValue;

    // Auto-discovery logic for time remaining
    const resolvedTimeCapability = useMemo(() => {
        // meter_remaining_time = total remaining (HA remaining_time entity or Homey native)
        // meter_countdown = phase countdown (HA, fallback only)
        const commonTimeCaps = ['meter_remaining_time', 'meter_countdown', 'time_remaining', 'sensor_remaining_time', 'remaining_time'];
        const found = commonTimeCaps.find(c => device?.capabilities?.includes(c));
        return found || null;
    }, [device?.capabilities]);

    const resolvedTimeValue = resolvedTimeCapability ? getCapValue(resolvedTimeCapability) : null;

    // Ferdig-popupen («Er den tømt?») håndteres globalt av
    // FinishedPromptManager i App.jsx — vises uansett aktiv side.

    return (
        <div className="tile-content" style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            padding: '8px',
            position: 'relative',
            overflow: 'hidden'
        }}>
            {/* Top "Control Panel" */}
            <div style={{
                display: 'flex',
                justifyContent: expanded ? 'center' : 'space-between',
                alignItems: 'center',
                marginBottom: '10px',
                background: 'rgba(0,0,0,0.2)',
                padding: expanded ? '6px 16px' : '4px 8px', // More padding when expanded
                borderRadius: expanded ? '20px' : '4px', // Rounder when expanded
                fontSize: '0.70rem',
                width: expanded ? 'fit-content' : '100%', // Auto width when expanded
                alignSelf: expanded ? 'center' : 'stretch', // Center itself when expanded
                boxSizing: 'border-box',
                overflow: 'hidden', // Ensure it doesn't spill out
                whiteSpace: 'nowrap' // Keep single line
            }}>
                <div style={{ display: 'flex', gap: '4px', overflow: 'hidden' }}>
                    {/* External Power Display */}
                    {liveExternalPower !== null && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1px', color: 'var(--color-accent)' }}>
                            <Activity size={9} />
                            <span>{Math.round(liveExternalPower)}W</span>
                        </div>
                    )}
                    {temperature && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1px' }}>
                            <Thermometer size={9} />
                            <span>{temperature}{!isNaN(parseFloat(temperature)) ? '°' : ''}</span>
                        </div>
                    )}
                    {spinSpeed && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1px' }}>
                            <Activity size={9} />
                            <span>{spinSpeed}</span>
                        </div>
                    )}
                </div>
                {/* Status LED */}
                <div style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: isActive ? 'var(--color-success)' : 'var(--color-text-tertiary)',
                    boxShadow: isActive ? '0 0 4px var(--color-success)' : 'none'
                }} />
            </div>

            {/* Main "Door" Area */}
            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: (expanded && !isMobile) ? 'row' : 'column',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                gap: expanded ? '24px' : 0
            }}>
                {/* Door Frame */}
                <div style={{
                    width: expanded ? (isMobile ? '140px' : '180px') : '90px',
                    height: expanded ? (isMobile ? '140px' : '180px') : '90px',
                    borderRadius: '50%',
                    border: '8px solid var(--color-border)',
                    boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5), 0 4px 6px rgba(0,0,0,0.3)',
                    background: 'rgba(0,0,0,0.3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    transition: 'all 0.3s ease',
                    overflow: 'hidden' // Clip the spinning content
                }}>
                    {/* Door Handle (formerly reflection) */}
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '12px',
                        width: '6px', // Fixed width instead of % to ensure visibility
                        height: '24px', // Slightly taller
                        background: 'rgba(255,255,255,0.5)', // Much brighter (was 0.15)
                        borderRadius: '10px',
                        transform: 'translateY(-50%)',
                        zIndex: 3
                    }} />

                    {/* Spinning Content (Water/Clothes) - Improved Compatibility */}
                    <div className={isActive ? "washing-spin" : ""} style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        borderRadius: '50%',
                        // Fallback/Alternative to conic-gradient for better WebView compatibility
                        border: '8px solid rgba(255,255,255,0.1)',
                        borderTopColor: 'rgba(255,255,255,0.6)',
                        background: 'transparent',
                        zIndex: 1
                    }} />

                    {/* Inner Display (Static Text) */}
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        textAlign: 'center',
                        zIndex: 2,
                        position: 'relative',
                        width: '80%' // Restrict width to ensure wrapping happens inside bubble
                    }}>
                        <span style={{
                            fontSize: expanded ? '1.5rem' : '1rem',
                            fontWeight: 'bold',
                            color: 'var(--color-text-primary)',
                            textShadow: '0 2px 4px rgba(0,0,0,0.8)',
                            lineHeight: 1.2,
                            marginBottom: '2px'
                        }}>
                            {opState || '-'}
                        </span>
                        {isActive && program && !tile.settings?.hideProgram && (
                            <span style={{
                                fontSize: expanded ? '0.9rem' : '0.6rem', // Slightly smaller base size
                                color: 'var(--color-text-secondary)',
                                width: '100%',
                                lineHeight: '1.1',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden'
                            }}>
                                {program}
                            </span>
                        )}

                        {/* Time Remaining Display */}
                        {(() => {
                            // Check if machine is active before showing time
                            if (!isActive) return null;

                            const timeVal = resolvedTimeValue;

                            if (timeVal !== undefined && timeVal !== null && timeVal > 0) {
                                const val = Number(timeVal);
                                let display = "";
                                if (!isNaN(val)) {
                                    let minutes = 0;
                                    const val = Number(timeVal);
                                    const timeUnit = tile.settings?.timeUnit || 'auto';

                                    if (timeUnit === 'seconds') {
                                        minutes = val / 60;
                                    } else if (timeUnit === 'minutes') {
                                        minutes = val;
                                    } else if (timeUnit === 'hours') {
                                        minutes = val * 60;
                                    } else {
                                        // Auto detection of unit (seconds vs minutes vs hours)
                                        if (val > 500) {
                                            // > 500 likely seconds (>8 mins)
                                            minutes = val / 60;
                                        } else if (val < 10 && val % 1 !== 0) { // Small float likely hours
                                            minutes = val * 60;
                                        } else {
                                            // Standard minutes
                                            minutes = val;
                                        }
                                    }

                                    const h = Math.floor(minutes / 60);
                                    const m = Math.round(minutes % 60);
                                    display = h > 0 ? `${h}t ${m}m` : `${m}m`;
                                } else {
                                    display = String(timeVal);
                                }

                                return (
                                    <div style={{
                                        marginTop: '4px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        color: 'var(--color-accent)',
                                        fontWeight: 600,
                                        fontSize: expanded ? '1rem' : '0.8rem'
                                    }}>
                                        <Clock size={expanded ? 16 : 12} />
                                        <span>{display}</span>
                                    </div>
                                );
                            }
                            return null;
                        })()}
                    </div>
                </div>

                {/* Expanded Capabilities Panel – kun i stor visning */}
                {expanded && tile.expandedCapabilities && tile.expandedCapabilities.length > 0 && (
                    <div style={{
                        display: 'flex',
                        flexDirection: isMobile ? 'row' : 'column',
                        flexWrap: isMobile ? 'wrap' : 'nowrap',
                        gap: '10px',
                        width: isMobile ? '100%' : undefined,
                        minWidth: isMobile ? '0' : '160px',
                        maxWidth: isMobile ? '100%' : '220px',
                        alignSelf: 'center',
                    }}>
                        {tile.expandedCapabilities.map(capConfig => {
                            const rawVal = getCapValue(capConfig.id);
                            let displayVal = getCapDisplayValue(capConfig.id);
                            if (rawVal === undefined || rawVal === null) return null;
                            const capTitle = capConfig.title || device?.capabilitiesObj?.[capConfig.id]?.title || capConfig.id;
                            // React rendrer ikke rå boolean-verdier — formater som tekst
                            let valueColor;
                            if (typeof rawVal === 'boolean') {
                                const isEmptyAlarm = capConfig.id === 'alarm_detergent' || capConfig.id === 'alarm_softener';
                                displayVal = isEmptyAlarm ? (rawVal ? 'Tomt' : 'OK') : (rawVal ? 'Ja' : 'Nei');
                                if (rawVal && capConfig.id.startsWith('alarm_')) valueColor = 'var(--color-warning, #f59e0b)';
                            }
                            return (
                                <div key={capConfig.id} style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    background: 'rgba(255,255,255,0.06)',
                                    borderRadius: '10px',
                                    padding: '10px 14px',
                                }}>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>{capTitle}</span>
                                    <span style={{ fontSize: '1rem', fontWeight: 600, color: valueColor }}>{displayVal}</span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default WashingMachineTile;
