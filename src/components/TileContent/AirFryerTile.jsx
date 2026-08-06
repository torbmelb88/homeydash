import React, { useState, useEffect, useRef } from 'react';
import { useHomey } from '../../context/HomeyContext';
import InteractiveCircularSlider from '../InteractiveCircularSlider';
import { Play, Pause, Power, Clock, X, Check } from 'lucide-react';

const AirFryerTile = ({ tile, device, expanded = false }) => {
    const { api, setIsInteracting } = useHomey();
    const [targetTemp, setTargetTemp] = useState(device.capabilitiesObj?.target_temperature?.value || 180);
    const [optimisticTemp, setOptimisticTemp] = useState(null);
    const [showTimePicker, setShowTimePicker] = useState(false);

    // Timer state for picker
    const [pickerHours, setPickerHours] = useState(0);
    const [pickerMinutes, setPickerMinutes] = useState(0);

    // Capabilities
    // Timer is usually 'measure_devicecapabilities_slider_number.number3' based on screenshot
    const timerCapId = tile.settings?.timerCapability || 'measure_devicecapabilities_slider_number.number3';
    const currentTimerVal = device.capabilitiesObj?.[timerCapId]?.value || 0;

    const startCapId = 'devicecapabilities_button.button2'; // Start
    const pauseCapId = 'devicecapabilities_button.button3'; // Pause
    const onOffCapId = 'onoff';

    // Temp Sync
    useEffect(() => {
        setTargetTemp(device.capabilitiesObj?.target_temperature?.value || 180);
    }, [device.capabilitiesObj?.target_temperature?.value]);

    // Optimistic Temp Reset
    useEffect(() => {
        if (optimisticTemp === null) return;
        if (Math.abs(optimisticTemp - targetTemp) < 1) {
            setOptimisticTemp(null);
        }
    }, [targetTemp, optimisticTemp]);

    const displayTemp = optimisticTemp !== null ? optimisticTemp : targetTemp;

    const handleTempChange = (val) => {
        setOptimisticTemp(Math.round(val));
    };

    const handleTempChangeEnd = (val) => {
        const rounded = Math.round(val);
        setOptimisticTemp(rounded);
        api.setCapability(device.id, 'target_temperature', rounded)
            .catch(e => console.error("Failed to set temp", e));
        setIsInteracting(false);
    };

    // Timer Logic
    const formatTime = (minutesVal) => {
        if (!minutesVal) return "00:00";
        const h = Math.floor(minutesVal / 60);
        const m = Math.round(minutesVal % 60);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    const openTimePicker = (e) => {
        e.stopPropagation();
        const h = Math.floor(currentTimerVal / 60);
        const m = Math.round(currentTimerVal % 60);
        setPickerHours(h);
        setPickerMinutes(m);
        setShowTimePicker(true);
        setIsInteracting(true); // Prevent tile clicks
    };

    const saveTime = (e) => {
        e.stopPropagation();
        const totalMinutes = (pickerHours * 60) + pickerMinutes;
        api.setCapability(device.id, timerCapId, totalMinutes)
            .catch(e => console.error('Failed to set timer', e));
        setShowTimePicker(false);
        setIsInteracting(false);
    };

    const cancelTime = (e) => {
        e.stopPropagation();
        setShowTimePicker(false);
        setIsInteracting(false);
    };

    // Button Actions
    const togglePower = (e) => {
        e.stopPropagation();
        const current = device.capabilitiesObj?.[onOffCapId]?.value;
        api.setCapability(device.id, onOffCapId, !current);
    };

    const triggerAction = (e, capId) => {
        e.stopPropagation();
        // Identify if it's a button (boolean set to true) or toggle
        // Usually 'button' capabilities are triggered by setting true
        api.setCapability(device.id, capId, true);
    };

    // Render Time Picker Overlay
    const renderTimePicker = () => (
        <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.92)', // Even darker for better focus
            zIndex: 100,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'inherit',
            backdropFilter: 'blur(8px)'
        }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: '1rem', marginBottom: '20px', color: 'var(--color-text-primary)', fontWeight: 600 }}>Sett Tid</div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '30px' }}>
                {/* Hours */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '60px' }}>
                    <button
                        className="btn-icon"
                        onClick={() => setPickerHours(h => Math.min(24, h + 1))}
                        style={{
                            background: 'rgba(255,255,255,0.15)',
                            width: '44px', height: '44px',
                            borderRadius: '50%',
                            color: 'white',
                            fontSize: '1.2rem',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                    >▲</button>
                    <div style={{ fontSize: '2.5rem', fontWeight: 'bold', width: '100%', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                        {String(pickerHours).padStart(2, '0')}
                    </div>
                    <button
                        className="btn-icon"
                        onClick={() => setPickerHours(h => Math.max(0, h - 1))}
                        style={{
                            background: 'rgba(255,255,255,0.15)',
                            width: '44px', height: '44px',
                            borderRadius: '50%',
                            color: 'white',
                            fontSize: '1.2rem',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                    >▼</button>
                </div>

                <div style={{ fontSize: '2.5rem', fontWeight: 'bold', paddingBottom: '0px', opacity: 0.5, alignSelf: 'center' }}>:</div>

                {/* Minutes */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '60px' }}>
                    <button
                        className="btn-icon"
                        onClick={() => setPickerMinutes(m => Math.min(59, m + 1))}
                        style={{
                            background: 'rgba(255,255,255,0.15)',
                            width: '44px', height: '44px',
                            borderRadius: '50%',
                            color: 'white',
                            fontSize: '1.2rem',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                    >▲</button>
                    <div style={{ fontSize: '2.5rem', fontWeight: 'bold', width: '100%', textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
                        {String(pickerMinutes).padStart(2, '0')}
                    </div>
                    <button
                        className="btn-icon"
                        onClick={() => setPickerMinutes(m => Math.max(0, m - 1))}
                        style={{
                            background: 'rgba(255,255,255,0.15)',
                            width: '44px', height: '44px',
                            borderRadius: '50%',
                            color: 'white',
                            fontSize: '1.2rem',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}
                    >▼</button>
                </div>
            </div>

            <div style={{ display: 'flex', gap: '20px' }}>
                <button
                    className="btn round big"
                    onClick={cancelTime}
                    style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--color-text-primary)' }}
                >
                    <X size={24} />
                </button>
                <button
                    className="btn round big"
                    onClick={saveTime}
                    style={{ background: 'var(--color-success)', color: 'white', border: 'none' }}
                >
                    <Check size={24} />
                </button>
            </div>
        </div>
    );

    return (
        <div className="tile-content" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '10px', position: 'relative' }}>
            {showTimePicker && renderTimePicker()}

            {/* Top Bar: Power */}
            <div style={{ position: 'absolute', top: '8px', right: '8px', zIndex: 10 }}>
                <button
                    onClick={togglePower}
                    style={{
                        background: device.capabilitiesObj?.[onOffCapId]?.value
                            ? 'var(--color-success)'
                            : 'rgba(255,255,255,0.1)',
                        border: 'none',
                        borderRadius: '50%',
                        width: '32px',
                        height: '32px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        boxShadow: device.capabilitiesObj?.[onOffCapId]?.value
                            ? '0 0 10px rgba(74, 222, 128, 0.4)'
                            : 'none'
                    }}
                >
                    <Power size={18} color="white" />
                </button>
            </div>

            {/* Center: Temp Slider */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', marginTop: '24px' }}>
                <InteractiveCircularSlider
                    value={displayTemp}
                    min={40}
                    max={220} // Airfryer typical range
                    onChange={handleTempChange}
                    onChangeEnd={handleTempChangeEnd}
                    onInteractionStart={() => setIsInteracting(true)}
                    onInteractionEnd={() => setIsInteracting(false)}
                    trackGradient={['#fbbf24', '#ef4444']} // Orange -> Red
                    size={expanded ? "220px" : "130px"}
                    strokeWidth={expanded ? 16 : 10}
                    interactionMode="knob"
                >
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ fontSize: expanded ? '2.5rem' : '1.8rem', fontWeight: 700, lineHeight: 1 }}>
                            {displayTemp}°
                        </div>
                        {/* Status Text (e.g. "Cooking") */}
                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '4px', maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {device.capabilitiesObj?.['devicecapabilities_text.text1']?.value || 'Standby'}
                        </div>
                    </div>
                </InteractiveCircularSlider>
            </div>

            {/* Bottom: Timer & Controls */}
            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>

                {/* Timer Display (Clickable) */}
                <div
                    onClick={openTimePicker}
                    style={{
                        background: 'rgba(0,0,0,0.3)',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                        border: '1px solid rgba(255,255,255,0.1)'
                    }}
                >
                    <Clock size={16} color="var(--color-accent)" />
                    <span style={{ fontSize: '1.2rem', fontWeight: 'bold', fontFamily: 'monospace' }}>
                        {formatTime(currentTimerVal)}
                    </span>
                </div>

                {/* Transport Controls */}
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        className="btn btn-secondary"
                        style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'rgba(50, 200, 50, 0.2)' }}
                        onClick={(e) => triggerAction(e, startCapId)}
                    >
                        <Play size={18} fill="currentColor" />
                    </button>
                    <button
                        className="btn btn-secondary"
                        style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'rgba(200, 200, 50, 0.2)' }}
                        onClick={(e) => triggerAction(e, pauseCapId)}
                    >
                        <Pause size={18} fill="currentColor" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AirFryerTile;
