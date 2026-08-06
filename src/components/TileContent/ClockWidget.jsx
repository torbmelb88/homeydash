import React, { useState, useEffect, useRef } from 'react';

const ClockWidget = ({ tile }) => {
    const [time, setTime] = useState(new Date());
    const containerRef = useRef(null);
    const [box, setBox] = useState({ w: 0, h: 0 });
    const design = tile.settings?.design || 'digital';
    const showSeconds = tile.settings?.showSeconds !== false; // Default true

    useEffect(() => {
        const timer = setInterval(() => {
            setTime(new Date());
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Klokkeflisen har fast rad-høyde (isFixedSizeWidget i Tile.jsx) og .tile har
    // overflow:hidden – på enheter med lav radhøyde (mobil-breakpoints / kompakt
    // rutenett) klippes datoen bort hvis skriftstørrelsene er faste. Mål derfor
    // tilgjengelig plass og skaler innholdet så det alltid får plass.
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const observer = new ResizeObserver(entries => {
            const rect = entries[0].contentRect;
            setBox({ w: rect.width, h: rect.height });
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    if (design === 'analog') {
        const seconds = time.getSeconds();
        const minutes = time.getMinutes();
        const hours = time.getHours();

        const secondDeg = (seconds / 60) * 360;
        const minuteDeg = ((minutes * 60 + seconds) / 3600) * 360;
        const hourDeg = ((hours % 12) / 12) * 360 + (minutes / 60) * 30;

        const available = Math.min(box.w || 120, box.h || 120);
        const diameter = Math.max(60, Math.min(120, available));
        const numberOffset = diameter / 2 - 15;
        const numberFontSize = Math.max(8, Math.round(diameter * 0.1));

        return (
            <div ref={containerRef} className="tile-content" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                <div style={{
                    width: `${diameter}px`,
                    height: `${diameter}px`,
                    borderRadius: '50%',
                    border: '4px solid var(--color-accent-primary)',
                    position: 'relative',
                    background: 'rgba(0,0,0,0.2)',
                    boxShadow: '0 0 20px rgba(0,0,0,0.3)'
                }}>
                    {/* Clock Numbers */}
                    {[...Array(12)].map((_, i) => {
                        const num = i + 1;
                        const rotation = num * 30;
                        return (
                            <div
                                key={num}
                                style={{
                                    position: 'absolute',
                                    top: '50%',
                                    left: '50%',
                                    transform: `translate(-50%, -50%) rotate(${rotation}deg) translate(0, -${numberOffset}px) rotate(-${rotation}deg)`,
                                    fontSize: `${numberFontSize}px`,
                                    fontWeight: '600',
                                    color: 'var(--color-text-secondary)',
                                    width: '20px',
                                    textAlign: 'center'
                                }}
                            >
                                {num}
                            </div>
                        );
                    })}
                    {/* Hour Hand */}
                    <div style={{
                        position: 'absolute',
                        bottom: '50%',
                        left: '50%',
                        width: '4px',
                        height: '30%',
                        background: 'var(--color-text-primary)',
                        transformOrigin: 'bottom center',
                        transform: `translateX(-50%) rotate(${hourDeg}deg)`,
                        borderRadius: '2px',
                        zIndex: 2
                    }} />
                    {/* Minute Hand */}
                    <div style={{
                        position: 'absolute',
                        bottom: '50%',
                        left: '50%',
                        width: '3px',
                        height: '40%',
                        background: 'var(--color-text-secondary)',
                        transformOrigin: 'bottom center',
                        transform: `translateX(-50%) rotate(${minuteDeg}deg)`,
                        borderRadius: '2px',
                        zIndex: 3
                    }} />
                    {/* Second Hand */}
                    {showSeconds && (
                        <div style={{
                            position: 'absolute',
                            bottom: '50%',
                            left: '50%',
                            width: '2px',
                            height: '45%',
                            background: 'var(--color-accent-primary)',
                            transformOrigin: 'bottom center',
                            transform: `translateX(-50%) rotate(${secondDeg}deg)`,
                            borderRadius: '1px',
                            zIndex: 4
                        }} />
                    )}
                    {/* Center Dot */}
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        background: 'var(--color-accent-primary)',
                        transform: 'translate(-50%, -50%)',
                        zIndex: 5
                    }} />
                </div>
            </div>
        );
    }

    // Digital – skaler tid og dato etter tilgjengelig høyde slik at begge alltid vises
    const h = box.h || 120;
    const timeFontSize = Math.max(18, Math.min(48, h * 0.45));
    const dateFontSize = Math.max(10, Math.min(16, h * 0.15));
    const dateMargin = Math.max(2, Math.min(8, h * 0.05));

    return (
        <div ref={containerRef} className="tile-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 0 }}>
            <div style={{ fontSize: `${timeFontSize}px`, fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: showSeconds ? '2-digit' : undefined })}
            </div>
            <div style={{ fontSize: `${dateFontSize}px`, color: 'var(--color-text-secondary)', marginTop: `${dateMargin}px`, lineHeight: 1.3, whiteSpace: 'nowrap' }}>
                {time.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
        </div>
    );
};

export default ClockWidget;
