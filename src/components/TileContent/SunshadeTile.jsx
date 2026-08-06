import React, { useState, useEffect, useRef } from 'react';
import { useHomey } from '../../context/HomeyContext';
import { Blinds } from 'lucide-react';

const SunshadeTile = ({ tile, device }) => {
    const { api, isInteracting, setIsInteracting } = useHomey();
    const invert = !!tile.settings?.invertPosition;
    const rawPosition = device.capabilitiesObj?.windowcoverings_set?.value || 0;
    const toDisplay = (raw) => invert ? 1 - raw : raw;
    const toRaw = (display) => invert ? 1 - display : display;

    const [position, setPosition] = useState(toDisplay(rawPosition));
    const [optimisticPosition, setOptimisticPosition] = useState(null);
    const [sliderHeight, setSliderHeight] = useState(150);
    const sliderRef = useRef(null);

    // Sync state with device updates
    useEffect(() => {
        setPosition(toDisplay(device.capabilitiesObj?.windowcoverings_set?.value || 0));
    }, [device.capabilitiesObj?.windowcoverings_set?.value, invert]);

    // Reset optimistic state when actual value updates to match
    useEffect(() => {
        if (optimisticPosition === null) return;
        if (Math.abs(optimisticPosition - position) < 0.05) {
            setOptimisticPosition(null);
        }
    }, [position, optimisticPosition]);

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

    const displayPosition = optimisticPosition !== null ? optimisticPosition : position;

    const handleChange = (e) => {
        const val = parseFloat(e.target.value);
        setOptimisticPosition(val);
        if (!isInteracting) {
            setIsInteracting(true);
        }
    };

    const handleChangeEnd = (e) => {
        const val = parseFloat(e.target.value);
        setOptimisticPosition(val);
        api.setCapability(device.id, 'windowcoverings_set', toRaw(val)).catch(err => {
            console.error("Failed to set position", err);
            setOptimisticPosition(null);
        });
        setIsInteracting(false);
    };

    return (
        <div className="tile-content" style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '10px', alignItems: 'center', justifyContent: 'center' }}>
            <div className="multi-light-container vertical" style={{ height: '100%', width: '100%', padding: 0 }}>
                <div className="multi-light-item" style={{ height: '100%' }}>
                    {/* Slider Container (The Bar) */}
                    <div
                        className="slider-wrapper"
                        style={{ '--val': displayPosition }}
                        ref={sliderRef}
                    >
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.01"
                            value={displayPosition || 0}
                            onChange={handleChange}
                            onMouseUp={handleChangeEnd}
                            onTouchEnd={handleChangeEnd}
                            className="multi-light-slider"
                            style={{ width: `${sliderHeight}px` }}
                        />
                        {/* Percent inside the bar */}
                        <div className="slider-percent" style={{ pointerEvents: 'none' }}>
                            {Math.round((displayPosition || 0) * 100)}%
                        </div>

                        {/* Icon overlay at the bottom or top? 
                            MultiLightTile doesn't have an icon inside the bar.
                            Let's add a small blinds icon at the bottom of the bar for visual indication.
                        */}
                        <div style={{
                            position: 'absolute',
                            bottom: '10px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            pointerEvents: 'none',
                            opacity: 0.5,
                            color: 'white',
                            zIndex: 2
                        }}>
                            <Blinds size={16} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SunshadeTile;
