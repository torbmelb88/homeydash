import React, { useState, useEffect } from 'react';
import { useHomey } from '../../context/HomeyContext';
import { Lock, Unlock, Bell, Battery } from 'lucide-react';

const DoorControlTile = ({ tile }) => {
    const { api, devices, isInteracting, setIsInteracting } = useHomey();
    const [lockState, setLockState] = useState(null); // true = locked, false = unlocked
    const [doorbellActive, setDoorbellActive] = useState(false);
    const [optimisticLockState, setOptimisticLockState] = useState(null);

    const lockDeviceId = tile.settings?.deviceId || tile.deviceId;
    const doorbellDeviceId = tile.settings?.doorbellDeviceId;

    const lockDevice = devices.find(d => d.id === lockDeviceId);
    const doorbellDevice = devices.find(d => d.id === doorbellDeviceId);

    useEffect(() => {
        if (lockDevice && !isInteracting) {
            setLockState(lockDevice.capabilitiesObj?.locked?.value);
        }
    }, [lockDevice, isInteracting]);

    useEffect(() => {
        if (doorbellDevice) {
            // Check various capabilities for trigger
            const alarmContact = doorbellDevice.capabilitiesObj?.alarm_contact?.value;
            const alarmMotion = doorbellDevice.capabilitiesObj?.alarm_motion?.value;
            const alarmGeneric = doorbellDevice.capabilitiesObj?.alarm_generic?.value;
            const onOff = doorbellDevice.capabilitiesObj?.onoff?.value;

            setDoorbellActive(alarmContact || alarmMotion || alarmGeneric || onOff || false);
        }
    }, [doorbellDevice]);

    const handleToggleLock = async (e) => {
        e.stopPropagation();
        if (!lockDevice) return;

        const newState = !lockState;
        setOptimisticLockState(newState);
        setIsInteracting(true);

        try {
            await api.setCapability(lockDeviceId, 'locked', newState);
            setTimeout(() => {
                setOptimisticLockState(null);
                setIsInteracting(false);
            }, 2000); // Reset optimistic state after a delay or real update
        } catch (err) {
            console.error("Failed to toggle lock", err);
            setOptimisticLockState(null);
            setIsInteracting(false);
        }
    };

    if (!lockDevice) {
        return (
            <div className="tile-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-secondary)' }}>
                <Lock size={24} style={{ marginBottom: '8px', opacity: 0.5 }} />
                <span style={{ fontSize: '0.8rem' }}>Konfigurer Dørlås</span>
            </div>
        );
    }

    const isLocked = optimisticLockState !== null ? optimisticLockState : lockState;
    const batteryLevel = lockDevice.capabilitiesObj?.measure_battery?.value;

    return (
        <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            animation: doorbellActive ? 'pulse-bg 1s infinite alternate' : 'none'
        }}>
            <style>
                {`
                @keyframes pulse-bg {
                    from { background-color: rgba(255, 0, 0, 0.1); }
                    to { background-color: rgba(255, 0, 0, 0.4); }
                }
                `}
            </style>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px' }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {tile.name || lockDevice.name}
                </div>
                {batteryLevel !== undefined && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: batteryLevel < 20 ? 'var(--color-error)' : 'var(--color-text-secondary)' }}>
                        <Battery size={14} />
                        <span>{batteryLevel}%</span>
                    </div>
                )}
            </div>

            {/* Main Content */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>

                {/* Doorbell Alert */}
                {doorbellActive && (
                    <div style={{
                        position: 'absolute',
                        top: '40px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: 'var(--color-error)',
                        padding: '4px 12px',
                        borderRadius: '16px',
                        animation: 'bounce 1s infinite'
                    }}>
                        <Bell size={16} color="white" />
                        <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: 'white' }}>DET RINGER PÅ!</span>
                    </div>
                )}

                {/* Lock Button */}
                <button
                    onClick={handleToggleLock}
                    style={{
                        width: '80px',
                        height: '80px',
                        borderRadius: '50%',
                        border: 'none',
                        background: isLocked ? 'var(--color-error)' : 'var(--color-success)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                        transition: 'all 0.2s transform',
                        padding: '12px' // Add padding so icon has breathing room
                    }}
                    className="lock-btn"
                >
                    {lockDevice.LucideIcon ? (
                        <lockDevice.LucideIcon 
                            size={40} 
                            strokeWidth={1.5}
                            style={{
                                color: 'white'
                            }}
                        />
                    ) : (
                        <img
                            src={api.getIconUrl(lockDevice)}
                            alt={isLocked ? "Låst" : "Åpen"}
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'contain',
                                filter: 'brightness(0) invert(1)' // Make white to contrast with colored button
                            }}
                        />
                    )}
                </button>

                <div style={{ fontSize: '1rem', fontWeight: 500, color: isLocked ? 'var(--color-text-secondary)' : 'var(--color-success)' }}>
                    {isLocked ? 'Låst' : 'Åpen'}
                </div>
            </div>
        </div>
    );
};

export default DoorControlTile;
