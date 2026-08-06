import React, { useEffect, useReducer, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, AlarmClock, ChevronUp, ChevronDown } from 'lucide-react';
import useKeepScreenAwake from '../hooks/useKeepScreenAwake';

/**
 * «Dynamisk flis»-popup: vises i stort format over hele dashbordet når et
 * apparat er ferdig, og krever et aktivt valg — «Ja» (kvitter ut) eller
 * «Slumre 5 min» (kommer tilbake).
 *
 * Kvittering/slumring lagres i localStorage per enhet, nøklet på finishedAt-
 * tidspunktet, slik at samme fullførte kjøring ikke spør på nytt etter reload.
 */

const readState = (key) => {
    try {
        return JSON.parse(localStorage.getItem(key)) || {};
    } catch {
        return {};
    }
};

// finishedAt rekonstrueres fra HA-historikk ved reload og kan avvike noen
// minutter fra live-verdien som ble kvittert ut — bruk toleranse ved matching.
const ACK_TOLERANCE_MS = 10 * 60 * 1000;
const isAcked = (stored, finishedAt) =>
    stored.ackFor != null && Math.abs(stored.ackFor - finishedAt) < ACK_TOLERANCE_MS;

export const useFinishedPrompt = ({ deviceId, finishedAt, enabled = true }) => {
    const storageKey = `finishedPrompt:${deviceId}`;
    const [, forceRender] = useReducer(x => x + 1, 0);

    const stored = readState(storageKey);
    const snoozedUntil = stored.snoozeUntil || 0;
    const acked = finishedAt ? isAcked(stored, finishedAt) : false;
    const visible = Boolean(
        enabled &&
        finishedAt &&
        !acked &&
        Date.now() >= snoozedUntil
    );

    // Re-render når slumringen utløper slik at popupen kommer tilbake
    useEffect(() => {
        if (!enabled || !finishedAt || acked) return;
        const remaining = snoozedUntil - Date.now();
        if (remaining <= 0) return;
        const timer = setTimeout(forceRender, remaining + 250);
        return () => clearTimeout(timer);
    }, [enabled, finishedAt, snoozedUntil, acked]);

    // Synk mellom flere instanser av samme flis (kompakt + utvidet visning
    // er montert samtidig) — kvittering i én instans må re-rendre de andre.
    useEffect(() => {
        const onChange = (e) => {
            if (e.detail?.deviceId === deviceId) forceRender();
        };
        window.addEventListener('finished-prompt-changed', onChange);
        return () => window.removeEventListener('finished-prompt-changed', onChange);
    }, [deviceId]);

    const notifyChange = useCallback(() => {
        window.dispatchEvent(new CustomEvent('finished-prompt-changed', { detail: { deviceId } }));
    }, [deviceId]);

    const acknowledge = useCallback(() => {
        localStorage.setItem(storageKey, JSON.stringify({ ackFor: finishedAt }));
        forceRender();
        notifyChange();
    }, [storageKey, finishedAt, notifyChange]);

    const snooze = useCallback((minutes = 5) => {
        const prev = readState(storageKey);
        localStorage.setItem(storageKey, JSON.stringify({
            ...prev,
            snoozeUntil: Date.now() + minutes * 60 * 1000,
        }));
        forceRender();
        notifyChange();
    }, [storageKey, notifyChange]);

    return { visible, acked, acknowledge, snooze };
};

// Hurtigvalg for slumretid på selve popupen (pil-knappen ved Slumre)
const SNOOZE_OPTIONS = [10, 15, 30, 60];

const FinishedPromptOverlay = ({
    visible,
    icon = null,
    title = 'Maskinen er ferdig',
    question = 'Er den tømt?',
    onYes,
    onSnooze,
    snoozeMinutes = 5,
}) => {
    // Vekk skjermen og hold skjermsparer unna (Fully Kiosk) KUN mens popupen
    // er synlig — ellers sluker skjermspareren det første trykket. I slumre-
    // perioden skal skjermspareren få slå inn; når popupen kommer tilbake,
    // vekkes skjermen på nytt av denne hooken.
    useKeepScreenAwake(visible);

    const [showSnoozeOptions, setShowSnoozeOptions] = useState(false);

    // Lukk valgene når popupen forsvinner (slumring/kvittering) slik at den
    // kommer tilbake i standardvisning.
    useEffect(() => {
        if (!visible) setShowSnoozeOptions(false);
    }, [visible]);

    if (!visible) return null;

    return createPortal(
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 4000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0, 0, 0, 0.75)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
                animation: 'finished-prompt-fade 0.25s ease',
            }}
        >
            <style>{`
                @keyframes finished-prompt-fade {
                    from { opacity: 0; }
                    to   { opacity: 1; }
                }
                @keyframes finished-prompt-pop {
                    from { transform: scale(0.85); opacity: 0; }
                    to   { transform: scale(1); opacity: 1; }
                }
                @keyframes finished-prompt-pulse {
                    0%, 100% { transform: scale(1); }
                    50%      { transform: scale(1.08); }
                }
            `}</style>
            <div
                style={{
                    width: 'min(92vw, 520px)',
                    background: 'var(--color-bg-secondary, #1e2430)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '28px',
                    boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
                    padding: '2.5rem 2rem 2rem',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                    animation: 'finished-prompt-pop 0.3s cubic-bezier(0.34, 1.4, 0.64, 1)',
                }}
            >
                {icon && (
                    <div
                        style={{
                            width: '96px',
                            height: '96px',
                            borderRadius: '50%',
                            background: 'rgba(74, 222, 128, 0.12)',
                            border: '2px solid var(--color-success, #4ade80)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--color-success, #4ade80)',
                            marginBottom: '1.5rem',
                            animation: 'finished-prompt-pulse 2.5s ease-in-out infinite',
                        }}
                    >
                        {icon}
                    </div>
                )}
                <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--color-text-primary, #fff)', marginBottom: '0.5rem' }}>
                    {title}
                </div>
                <div style={{ fontSize: '1.15rem', color: 'var(--color-text-secondary, rgba(255,255,255,0.6))', marginBottom: '2rem' }}>
                    {question}
                </div>
                {showSnoozeOptions && (
                    <div style={{ display: 'flex', gap: '10px', width: '100%', marginBottom: '14px' }}>
                        {SNOOZE_OPTIONS.map(min => (
                            <button
                                key={min}
                                onClick={() => onSnooze?.(min)}
                                style={{
                                    flex: 1,
                                    minHeight: '52px',
                                    borderRadius: '14px',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    background: 'rgba(255,255,255,0.08)',
                                    color: 'var(--color-text-primary, #fff)',
                                    fontSize: '1rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                }}
                            >
                                {min} min
                            </button>
                        ))}
                    </div>
                )}
                <div style={{ display: 'flex', gap: '14px', width: '100%' }}>
                    <button
                        onClick={onYes}
                        style={{
                            flex: 1.4,
                            minHeight: '68px',
                            border: 'none',
                            borderRadius: '18px',
                            background: 'var(--color-success, #4ade80)',
                            color: '#0b1220',
                            fontSize: '1.25rem',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '10px',
                            cursor: 'pointer',
                        }}
                    >
                        <Check size={26} strokeWidth={3} />
                        Ja
                    </button>
                    <div style={{ flex: 1, display: 'flex' }}>
                        <button
                            onClick={() => onSnooze?.(snoozeMinutes)}
                            style={{
                                flex: 1,
                                minHeight: '68px',
                                borderRadius: '18px 0 0 18px',
                                border: '1px solid rgba(255,255,255,0.2)',
                                borderRight: 'none',
                                background: 'rgba(255,255,255,0.08)',
                                color: 'var(--color-text-primary, #fff)',
                                fontSize: '1.05rem',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                cursor: 'pointer',
                            }}
                        >
                            <AlarmClock size={22} />
                            Slumre {snoozeMinutes} min
                        </button>
                        <button
                            onClick={() => setShowSnoozeOptions(v => !v)}
                            aria-label="Velg slumretid"
                            style={{
                                width: '52px',
                                minHeight: '68px',
                                borderRadius: '0 18px 18px 0',
                                border: '1px solid rgba(255,255,255,0.2)',
                                borderLeft: '1px solid rgba(255,255,255,0.12)',
                                background: showSnoozeOptions
                                    ? 'rgba(255,255,255,0.16)'
                                    : 'rgba(255,255,255,0.08)',
                                color: 'var(--color-text-primary, #fff)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                            }}
                        >
                            {showSnoozeOptions ? <ChevronDown size={22} /> : <ChevronUp size={22} />}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default FinishedPromptOverlay;
