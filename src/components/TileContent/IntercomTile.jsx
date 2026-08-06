import React, { useState, useEffect } from 'react';
import { Phone, PhoneOff, PhoneIncoming, PhoneCall, MicOff, Loader2, Star } from 'lucide-react';
import { useHomey } from '../../context/HomeyContext';
import { useIntercomCall } from '../../hooks/useIntercomCall';
import { intercomCall, micAvailable } from '../../services/intercom-call';

/**
 * Intercom-flis — «view» over den globale samtale-motoren i
 * services/intercom-call.js. All samtale-/lydlogikk ligger i tjenesten:
 * dermed varsler IncomingCallOverlay (App.jsx) om innkommende anrop uansett
 * aktiv side, og en pågående samtale overlever at flisen unmountes.
 *
 * Kompakt: ringer standard-enheten (tile.settings.targetDeviceId, ellers
 * første tilgjengelige). Utvidet: liste over alle intercom-enheter så man
 * kan velge hvem som ringes.
 */
const IntercomTile = ({ tile, expanded }) => {
    const { showToast } = useHomey();
    const { callState, peerName, busy, devices } = useIntercomCall();
    const [elapsed, setElapsed] = useState(0);

    const noMic = !micAvailable();

    const configuredId = tile.settings?.targetDeviceId || '';
    const defaultTarget = (configuredId && devices.some(d => d.device_id === configuredId))
        ? configuredId
        : devices[0]?.device_id;
    const defaultDevice = devices.find(d => d.device_id === defaultTarget);
    const defaultLabel = defaultDevice?.name || tile.settings?.targetName || 'Intercom';

    // Sørg for at samtale-motoren kjører (idempotent — App-overlayet
    // starter den også, men flisen kan finnes på profiler uten overlay).
    useEffect(() => {
        intercomCall.init();
    }, []);

    // Samtale-timer
    useEffect(() => {
        if (callState !== 'in_call') { setElapsed(0); return; }
        const t = setInterval(() => setElapsed(e => e + 1), 1000);
        return () => clearInterval(t);
    }, [callState]);

    const run = (fn) => fn().catch(err => showToast(err.message || String(err), 'error'));

    const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

    const btn = (color) => ({
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
        width: '100%', padding: expanded ? '0.85rem' : '0.7rem', borderRadius: '0.75rem', border: 'none',
        background: color, color: '#fff', fontSize: '1rem', fontWeight: 600,
        cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
    });

    const stateIcon = (
        <>
            {callState === 'incoming' && (
                <PhoneIncoming size={expanded ? 56 : 36} className="intercom-pulse" style={{ color: 'var(--color-accent-primary, #38bdf8)' }} />
            )}
            {callState === 'in_call' && (
                <PhoneCall size={expanded ? 56 : 36} style={{ color: '#22c55e' }} />
            )}
            {(callState === 'idle' || callState === 'outgoing') && (
                <Phone size={expanded ? 56 : 36} style={{ color: callState === 'outgoing' ? 'var(--color-accent-primary, #38bdf8)' : 'var(--color-text-secondary)' }} />
            )}
        </>
    );

    const stateText = (
        <div style={{ fontSize: expanded ? '1.3rem' : '0.95rem', fontWeight: 600, lineHeight: 1.2 }}>
            {callState === 'idle' && (expanded ? 'Intercom' : defaultLabel)}
            {callState === 'outgoing' && `Ringer ${peerName || defaultLabel}…`}
            {callState === 'incoming' && `Innkommende: ${peerName || 'ukjent'}`}
            {callState === 'in_call' && `I samtale${peerName ? ` · ${peerName}` : ''}`}
        </div>
    );

    const callTimer = callState === 'in_call' && (
        <div style={{ fontSize: expanded ? '1rem' : '0.85rem', color: 'var(--color-text-secondary)', fontVariantNumeric: 'tabular-nums' }}>{fmtTime(elapsed)}</div>
    );

    const micWarning = noMic && callState === 'idle' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.72rem', color: '#f59e0b', maxWidth: '90%' }}>
            <MicOff size={14} /> Mikrofon krever HTTPS
        </div>
    );

    const inCallButtons = (
        <>
            {callState === 'incoming' && (
                <>
                    <button style={btn('#22c55e')} disabled={busy} onClick={(e) => { e.stopPropagation(); run(() => intercomCall.answer()); }}>
                        <Phone size={18} /> Svar
                    </button>
                    <button style={btn('#ef4444')} disabled={busy} onClick={(e) => { e.stopPropagation(); run(() => intercomCall.decline()); }}>
                        <PhoneOff size={18} /> Avvis
                    </button>
                </>
            )}
            {(callState === 'outgoing' || callState === 'in_call') && (
                <button style={btn('#ef4444')} disabled={busy} onClick={(e) => { e.stopPropagation(); run(() => intercomCall.hangup()); }}>
                    <PhoneOff size={18} /> Legg på
                </button>
            )}
        </>
    );

    const animCss = (
        <style>{`
            @keyframes intercom-spin { to { transform: rotate(360deg); } }
            @keyframes intercom-ring { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.12); opacity: 0.6; } }
            .intercom-pulse { animation: intercom-ring 1s ease-in-out infinite; }
            .spin { animation: intercom-spin 0.8s linear infinite; }
        `}</style>
    );

    // ── Utvidet visning: velg hvilken enhet som ringes ──────────────────
    if (expanded) {
        return (
            <div className="tile-content" style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: '1rem', minWidth: 'min(420px, 85vw)', textAlign: 'center', padding: '0.5rem',
            }}>
                {animCss}
                {stateIcon}
                {stateText}
                {callTimer}
                {micWarning}

                {callState === 'idle' && (
                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {devices.length === 0 && (
                            <div style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                                Ingen intercom-enheter funnet
                            </div>
                        )}
                        {devices.map(d => {
                            const isDefault = d.device_id === defaultTarget;
                            return (
                                <button
                                    key={d.device_id}
                                    disabled={busy}
                                    onClick={() => run(() => intercomCall.startCall(d.device_id))}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                                        width: '100%', padding: '0.85rem 1rem', borderRadius: '0.75rem',
                                        border: `1px solid ${isDefault ? 'var(--color-accent-primary, #38bdf8)' : 'var(--color-border, rgba(128,128,128,0.3))'}`,
                                        background: 'var(--color-bg-secondary, rgba(128,128,128,0.1))',
                                        color: 'var(--color-text-primary, inherit)',
                                        fontSize: '1rem', fontWeight: 600, textAlign: 'left',
                                        cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1,
                                    }}
                                >
                                    {busy ? <Loader2 size={20} className="spin" /> : (
                                        <span style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            width: '2.2rem', height: '2.2rem', borderRadius: '50%',
                                            background: '#22c55e', color: '#fff', flexShrink: 0,
                                        }}>
                                            <Phone size={18} />
                                        </span>
                                    )}
                                    <span style={{ flex: 1 }}>{d.name}</span>
                                    {isDefault && (
                                        <Star size={16} style={{ color: 'var(--color-accent-primary, #38bdf8)', flexShrink: 0 }} title="Standard" />
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}

                {callState !== 'idle' && (
                    <div style={{ display: 'flex', gap: '0.6rem', width: '100%', maxWidth: '320px' }}>
                        {inCallButtons}
                    </div>
                )}
            </div>
        );
    }

    // ── Kompakt visning: ringer standard-enheten, klikk på flisen åpner
    //    utvidet visning der man kan velge en annen enhet ────────────────
    return (
        <div className="tile-content" style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: '0.75rem', height: '100%', textAlign: 'center', padding: '0.25rem',
        }}>
            {animCss}
            {stateIcon}
            {stateText}
            {callTimer}
            {micWarning}

            <div style={{ display: 'flex', gap: '0.6rem', width: '100%', maxWidth: '260px' }}>
                {callState === 'idle' && (
                    <button style={btn('#22c55e')} disabled={busy} onClick={(e) => { e.stopPropagation(); run(() => intercomCall.startCall(defaultTarget)); }}>
                        {busy ? <Loader2 size={18} className="spin" /> : <Phone size={18} />} Ring
                    </button>
                )}
                {inCallButtons}
            </div>
        </div>
    );
};

export default IntercomTile;
