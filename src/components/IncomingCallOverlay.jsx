import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Phone, PhoneOff, PhoneIncoming, PhoneCall } from 'lucide-react';
import { useHomey } from '../context/HomeyContext';
import { useIntercomCall } from '../hooks/useIntercomCall';
import { intercomCall } from '../services/intercom-call';
import useKeepScreenAwake from '../hooks/useKeepScreenAwake';

/**
 * Global anrops-popup («dynamisk flis» for intercom): vises ved innkommende
 * anrop uansett hvilken side som er aktiv, fordi den er montert på App-nivå
 * og samtale-motoren (intercom-call.js) lytter på call-events globalt.
 *
 * Svarer man HER, blir overlayet stående med timer + «Legg på». Svarer man
 * fra selve intercom-flisen, forsvinner overlayet (flisen viser samtalen).
 * Kan skrus av per profil via settings.incomingCallPopupEnabled.
 */
const IncomingCallOverlay = () => {
    const { settings, showToast } = useHomey();
    const isHass = settings?.hubType === 'hass';
    const popupEnabled = settings?.incomingCallPopupEnabled !== false;

    const { callState, peerName, busy } = useIntercomCall();
    const answeredHereRef = useRef(false);
    const [elapsed, setElapsed] = useState(0);

    // Start samtale-motoren globalt (idempotent) så innkommende anrop
    // fanges selv om intercom-flisen aldri har vært montert.
    useEffect(() => {
        if (isHass) intercomCall.init();
    }, [isHass]);

    useEffect(() => {
        if (callState === 'idle') answeredHereRef.current = false;
    }, [callState]);

    useEffect(() => {
        if (callState !== 'in_call') { setElapsed(0); return; }
        const t = setInterval(() => setElapsed(e => e + 1), 1000);
        return () => clearInterval(t);
    }, [callState]);

    const run = (fn) => fn().catch(err => showToast(err.message || String(err), 'error'));

    const visible = isHass && popupEnabled && (
        callState === 'incoming' ||
        (callState === 'in_call' && answeredHereRef.current)
    );

    // Vekk skjermen ved anrop (Fully Kiosk) — ellers sluker skjermspareren
    // det første trykket på Svar/Avvis, og ringingen kan stå usynlig.
    useKeepScreenAwake(visible);

    if (!visible) return null;

    const inCall = callState === 'in_call';
    const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

    const bigBtn = (color) => ({
        flex: 1,
        minHeight: '68px',
        border: 'none',
        borderRadius: '18px',
        background: color,
        color: '#fff',
        fontSize: '1.2rem',
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        cursor: busy ? 'wait' : 'pointer',
        opacity: busy ? 0.7 : 1,
    });

    return createPortal(
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 4500,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0, 0, 0, 0.78)',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
                animation: 'incoming-call-fade 0.2s ease',
            }}
        >
            <style>{`
                @keyframes incoming-call-fade {
                    from { opacity: 0; }
                    to   { opacity: 1; }
                }
                @keyframes incoming-call-pop {
                    from { transform: scale(0.85); opacity: 0; }
                    to   { transform: scale(1); opacity: 1; }
                }
                @keyframes incoming-call-ring {
                    0%, 100% { transform: scale(1); }
                    50%      { transform: scale(1.14); }
                }
            `}</style>
            <div
                style={{
                    width: 'min(92vw, 480px)',
                    background: 'var(--color-bg-secondary, #1e2430)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '28px',
                    boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
                    padding: '2.5rem 2rem 2rem',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    textAlign: 'center',
                    animation: 'incoming-call-pop 0.25s cubic-bezier(0.34, 1.4, 0.64, 1)',
                }}
            >
                <div
                    style={{
                        width: '96px',
                        height: '96px',
                        borderRadius: '50%',
                        background: inCall ? 'rgba(34, 197, 94, 0.12)' : 'rgba(56, 189, 248, 0.12)',
                        border: `2px solid ${inCall ? '#22c55e' : 'var(--color-accent-primary, #38bdf8)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: inCall ? '#22c55e' : 'var(--color-accent-primary, #38bdf8)',
                        marginBottom: '1.5rem',
                        animation: inCall ? 'none' : 'incoming-call-ring 1s ease-in-out infinite',
                    }}
                >
                    {inCall ? <PhoneCall size={44} strokeWidth={1.8} /> : <PhoneIncoming size={44} strokeWidth={1.8} />}
                </div>

                <div style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--color-text-primary, #fff)', marginBottom: '0.4rem' }}>
                    {inCall ? 'I samtale' : 'Innkommende anrop'}
                </div>
                <div style={{ fontSize: '1.15rem', color: 'var(--color-text-secondary, rgba(255,255,255,0.6))', marginBottom: '0.6rem' }}>
                    {peerName || 'Intercom'}
                </div>
                {inCall && (
                    <div style={{ fontSize: '1rem', color: 'var(--color-text-secondary, rgba(255,255,255,0.6))', fontVariantNumeric: 'tabular-nums', marginBottom: '1.4rem' }}>
                        {fmtTime(elapsed)}
                    </div>
                )}
                {!inCall && <div style={{ marginBottom: '1.4rem' }} />}

                <div style={{ display: 'flex', gap: '14px', width: '100%' }}>
                    {!inCall && (
                        <>
                            <button
                                style={bigBtn('#22c55e')}
                                disabled={busy}
                                onClick={() => { answeredHereRef.current = true; run(() => intercomCall.answer()); }}
                            >
                                <Phone size={26} /> Svar
                            </button>
                            <button
                                style={bigBtn('#ef4444')}
                                disabled={busy}
                                onClick={() => run(() => intercomCall.decline())}
                            >
                                <PhoneOff size={26} /> Avvis
                            </button>
                        </>
                    )}
                    {inCall && (
                        <button
                            style={bigBtn('#ef4444')}
                            disabled={busy}
                            onClick={() => run(() => intercomCall.hangup())}
                        >
                            <PhoneOff size={26} /> Legg på
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

export default IncomingCallOverlay;
