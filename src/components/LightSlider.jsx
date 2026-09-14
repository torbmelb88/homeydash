import React, { useEffect, useRef, useState } from 'react';

// Rett dim-slider laget for berøring: trykk hvor som helst setter nivået direkte,
// dra justerer. Ingen skjult <input type="range"> og ingen rotasjonstriks.
// value er 0–1. onChange kalles under drag (valgfritt), onChangeEnd ved slipp/trykk.
// Horisontal slider slipper vertikal rulling gjennom (touch-action: pan-y), så den
// kan brukes i rullbare lister; vertikal slipper horisontal rulling gjennom.
const LightSlider = ({
    value = 0,
    orientation = 'horizontal',
    off = false,            // demper fyllet når lampen er av
    disabled = false,
    onChange,
    onChangeEnd,
    onInteractionStart,
    onInteractionEnd,
    className = '',
    style,
    showPercent = true,
    children,
}) => {
    const ref = useRef(null);
    const draggingRef = useRef(false);
    const [local, setLocal] = useState(value);
    const [dragging, setDragging] = useState(false);
    const vertical = orientation === 'vertical';

    // Følg ekte verdi når vi ikke drar. Etter slipp beholdes den lokale verdien
    // til hub-en sender ny status (unngår "hopp tilbake" mens kommandoen går).
    useEffect(() => {
        if (!draggingRef.current) setLocal(value);
    }, [value]);

    const calc = (e) => {
        const r = ref.current.getBoundingClientRect();
        const pct = vertical
            ? 1 - (e.clientY - r.top) / r.height
            : (e.clientX - r.left) / r.width;
        return Math.max(0, Math.min(1, pct));
    };

    const onPointerDown = (e) => {
        if (disabled) return;
        e.stopPropagation();
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignorér */ }
        draggingRef.current = true;
        setDragging(true);
        const v = calc(e);
        setLocal(v);
        onInteractionStart?.();
        onChange?.(v);
    };

    const onPointerMove = (e) => {
        if (!draggingRef.current) return;
        const v = calc(e);
        setLocal(v);
        onChange?.(v);
    };

    const finish = (commit, e) => {
        if (!draggingRef.current) return;
        draggingRef.current = false;
        setDragging(false);
        onInteractionEnd?.();
        if (commit) {
            const v = e ? calc(e) : local;
            setLocal(v);
            onChangeEnd?.(v);
        } else {
            setLocal(value); // avbrutt (nettleseren tok over for rulling)
        }
    };

    const pct = Math.round(local * 100);

    return (
        <div
            ref={ref}
            className={`light-slider ${vertical ? 'vertical' : 'horizontal'} ${off ? 'off' : ''} ${dragging ? 'dragging' : ''} ${disabled ? 'disabled' : ''} ${className}`}
            style={{ '--val': local, ...style }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => { e.stopPropagation(); finish(true, e); }}
            onPointerCancel={() => finish(false)}
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            role="slider"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
        >
            {children !== undefined ? children : (showPercent && (
                <span className="light-slider-label">{pct}%</span>
            ))}
        </div>
    );
};

export default LightSlider;
