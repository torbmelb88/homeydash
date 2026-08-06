import React, { useState, useEffect, useRef, useId } from 'react';

const InteractiveCircularSlider = ({
    value = 0,
    min = 0,
    max = 100,
    onChange,
    onChangeEnd,
    onInteractionStart,
    onInteractionEnd,
    color = 'var(--color-accent-primary)',
    trackColor = 'rgba(255,255,255,0.1)',
    size = '100%',
    strokeWidth = 12,
    startAngle = 0,
    endAngle = 360,
    trackGradient = null, // Array of colors for linear gradient e.g. ['blue', 'red']
    strokeLinecap = 'round',
    progressColor = color,
    knobColor = '#fff',
    knobRadius = strokeWidth * 0.6,
    interactionMode = 'any', // 'any' (default) or 'knob'
    children
}) => {
    const svgRef = useRef(null);
    const gradientId = useId();
    const [isDragging, setIsDragging] = useState(false);
    const [localValue, setLocalValue] = useState(value);

    useEffect(() => {
        if (!isDragging) {
            setLocalValue(value);
        }
    }, [value, isDragging]);

    const radius = 42;
    const center = 50;

    // Helper to convert polar coordinates to cartesian
    const polarToCartesian = (centerX, centerY, radius, angleInDegrees) => {
        const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
        return {
            x: centerX + (radius * Math.cos(angleInRadians)),
            y: centerY + (radius * Math.sin(angleInRadians))
        };
    };

    // Helper to create SVG path for an arc
    const describeArc = (x, y, radius, startAngle, endAngle) => {
        const start = polarToCartesian(x, y, radius, endAngle);
        const end = polarToCartesian(x, y, radius, startAngle);
        const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
        const d = [
            "M", start.x, start.y,
            "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y
        ].join(" ");
        return d;
    };

    // Map value to angle
    const valueToAngle = (val) => {
        const clamped = Math.min(Math.max(val, min), max);
        const pct = (clamped - min) / (max - min);
        return startAngle + (pct * (endAngle - startAngle));
    };

    // Map angle to value
    const angleToValue = (angle) => {
        // Normalize angle relative to startAngle
        let relativeAngle = angle - startAngle;
        const totalSpan = endAngle - startAngle;

        // Handle wrapping if needed, but for gauge usually strictly bounded
        // Simple projection: find closest point on arc
        // For now, assume angle is raw 0-360 mapped to start-end

        // We need to map the mouse angle to the range [startAngle, endAngle]
        // This is tricky because atan2 returns -180 to 180.
        // Let's rely on the visual angle.

        // Normalize to 0-1 range
        const pct = Math.max(0, Math.min(1, relativeAngle / totalSpan));
        return min + (pct * (max - min));
    };

    const calculateValueFromEvent = (e) => {
        if (!svgRef.current) return;

        const rect = svgRef.current.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        const dx = clientX - centerX;
        const dy = clientY - centerY;

        // Angle in degrees, 0 at top (12 o'clock), clockwise
        let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90;

        // Normalize based on range type
        if (startAngle < 0) {
            // Range like -130 to 130. Normalize to -180 to 180
            while (angle > 180) angle -= 360;
            while (angle <= -180) angle += 360;
        } else {
            // Range like 0 to 360. Normalize to 0 to 360
            while (angle < 0) angle += 360;
            while (angle >= 360) angle -= 360;
        }

        // Clamp to closest end if outside range
        let clampedAngle = angle;
        if (angle < startAngle || angle > endAngle) {
            const distToStart = Math.abs(angle - startAngle);
            const distToEnd = Math.abs(angle - endAngle);
            if (distToStart < distToEnd) {
                clampedAngle = startAngle;
            } else {
                clampedAngle = endAngle;
            }
        }

        const totalSpan = endAngle - startAngle;
        const pct = (clampedAngle - startAngle) / totalSpan;

        return min + (Math.max(0, Math.min(1, pct)) * (max - min));
    };

    const handleStart = (e) => {
        // Since listeners are now only on the interactive elements (Hit Area and Knob),
        // we can assume any start event is valid for dragging.
        // No manual hit testing needed against radius.

        setIsDragging(true);
        if (onInteractionStart) onInteractionStart();
        const newValue = calculateValueFromEvent(e);
        setLocalValue(newValue);

        // Prevent default to avoid scrolling on touch devices while dragging slider
        // But be careful not to block clicks if it was just a tap? 
        // With pointer-events strategy, the "click" on background never hits this handler.
        // The "click" on the track SHOULD NOT expand. 
        // e.preventDefault() here stops mouse emulation (click) from firing on the track.
        // This is DESIRED for the track (we don't want to expand).
        // e.preventDefault(); 
    };

    const handleMove = (e) => {
        if (!isDragging) return;
        const newValue = calculateValueFromEvent(e);
        setLocalValue(newValue);
        if (onChange) onChange(newValue);
    };

    const handleEnd = () => {
        setIsDragging(false);
        if (onInteractionEnd) onInteractionEnd();
        if (onChangeEnd) onChangeEnd(localValue);
    };

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMove);
            window.addEventListener('mouseup', handleEnd);
            window.addEventListener('touchmove', handleMove, { passive: false });
            window.addEventListener('touchend', handleEnd);
            window.addEventListener('touchcancel', handleEnd); // Critical for preventing stuck state
        }
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleEnd);
            window.removeEventListener('touchmove', handleMove);
            window.removeEventListener('touchend', handleEnd);
            window.removeEventListener('touchcancel', handleEnd);
        };
    }, [isDragging, localValue]);

    const currentAngle = valueToAngle(localValue);
    const knobPos = polarToCartesian(center, center, radius, currentAngle);

    // Define paths for rendering
    const trackPath = describeArc(center, center, radius, startAngle, endAngle);
    const progressPath = describeArc(center, center, radius, startAngle, currentAngle);

    return (
        <div className="circular-slider-wrapper" style={{ position: 'relative', width: size, height: size, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg
                ref={svgRef}
                viewBox="0 0 100 100"
                style={{ width: '100%', height: '100%', overflow: 'visible' }}
            >
                <defs>
                    {trackGradient && (
                        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
                            {trackGradient.map((color, index) => (
                                <stop key={index} offset={`${(index / (trackGradient.length - 1)) * 100}%`} stopColor={color} />
                            ))}
                        </linearGradient>
                    )}
                </defs>

                {/* Background Track - Non-interactive visually, but technically part of SVG */}
                <path
                    d={trackPath}
                    stroke={trackColor}
                    strokeWidth={strokeWidth}
                    fill="none"
                    strokeLinecap={strokeLinecap}
                    style={{ pointerEvents: 'none' }}
                />

                {/* Progress Track */}
                <path
                    d={progressPath}
                    stroke={trackGradient ? `url(#${gradientId})` : progressColor}
                    strokeWidth={strokeWidth}
                    fill="none"
                    strokeLinecap={strokeLinecap}
                    style={{ transition: isDragging ? 'none' : 'd 0.3s ease', pointerEvents: 'none' }}
                />

                {/* Hit Area - The ONLY interactive part for dragging - CONDITIONAL based on interactionMode */}
                <path
                    d={trackPath}
                    stroke="transparent"
                    strokeWidth={strokeWidth + 30}
                    fill="none"
                    strokeLinecap={strokeLinecap}
                    style={{
                        cursor: interactionMode === 'knob' ? 'default' : 'grab',
                        pointerEvents: interactionMode === 'knob' ? 'none' : 'stroke',
                        touchAction: 'none'
                    }}
                    onMouseDown={(e) => {
                        if (interactionMode === 'knob') return;
                        e.stopPropagation(); // Stop click from bubbling to Tile
                        handleStart(e);
                    }}
                    onTouchStart={(e) => {
                        if (interactionMode === 'knob') return;
                        e.stopPropagation();
                        // e.preventDefault(); // This would block scrolling but also might block other things. 
                        // Using touch-action: none is better practice.
                        handleStart(e);
                    }}
                    onClick={(e) => e.stopPropagation()} // Stop click just in case
                />

                {/* Knob */}
                <circle
                    cx={knobPos.x}
                    cy={knobPos.y}
                    r={knobRadius}
                    fill={knobColor}
                    stroke={trackGradient ? 'rgba(0,0,0,0.1)' : color}
                    strokeWidth={1}
                    style={{
                        cursor: 'grab',
                        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.2))',
                        pointerEvents: 'fill',
                        touchAction: 'none'
                    }}
                    onMouseDown={(e) => {
                        e.stopPropagation();
                        handleStart(e);
                    }}
                    onTouchStart={(e) => {
                        e.stopPropagation();
                        handleStart(e);
                    }}
                    onClick={(e) => e.stopPropagation()}
                />
            </svg>

            {/* Center Content - Allow clicks to Bubble Up to Tile */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                {/* Re-enable pointer events for content if it has buttons, but default to bubbling */}
                <div style={{ pointerEvents: 'auto' }}>
                    {children}
                </div>
            </div>
        </div>
    );
};

export default InteractiveCircularSlider;
