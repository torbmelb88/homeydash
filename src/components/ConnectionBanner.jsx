import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useHomey } from '../context/HomeyContext';

// Hvor lenge tilkoblingen må være nede før pillen vises – korte brudd
// (vekking fra bakgrunn som går fint) skal ikke blinke.
const SHOW_AFTER_MS = 4000;

/**
 * Liten pille nederst på skjermen mens dashbordet kobler til Home Assistant
 * på nytt. Gjør det synlig at noe skjer (og når det er over) i stedet for at
 * brukeren lurer på om verdiene er ferske.
 */
const PHASE_TEXT = {
    checking: 'Sjekker tilkoblingen til Home Assistant …',
    connecting: 'Kobler til Home Assistant på nytt …',
    loading: 'Henter enheter fra Home Assistant …',
    waiting: 'Venter før nytt forsøk …',
};

const ConnectionBanner = () => {
    const { haConnected, haStatus, settings } = useHomey();
    const [show, setShow] = useState(false);

    useEffect(() => {
        if (haConnected) {
            setShow(false);
            return;
        }
        const t = setTimeout(() => setShow(true), SHOW_AFTER_MS);
        return () => clearTimeout(t);
    }, [haConnected]);

    if (!show || settings?.hubType !== 'hass') return null;

    return (
        <>
            <style>{`
                @keyframes conn-banner-spin { to { transform: rotate(360deg); } }
                @keyframes conn-banner-in { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }
            `}</style>
            <div
                role="status"
                data-testid="ha-connection-banner"
                style={{
                    position: 'fixed',
                    left: '50%',
                    bottom: 'max(14px, env(safe-area-inset-bottom))',
                    transform: 'translateX(-50%)',
                    zIndex: 9998,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 14px',
                    borderRadius: '999px',
                    background: 'var(--color-surface-raised, #1e2130)',
                    border: '1px solid rgba(245, 158, 11, 0.45)',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                    color: 'var(--color-text-primary, #e2e8f0)',
                    fontSize: '0.8rem',
                    pointerEvents: 'none',
                    animation: 'conn-banner-in 0.2s ease',
                    whiteSpace: 'nowrap',
                }}
            >
                <RefreshCw size={14} color="var(--color-warning, #f59e0b)" style={{ animation: 'conn-banner-spin 1.2s linear infinite' }} />
                {PHASE_TEXT[haStatus?.phase] || PHASE_TEXT.connecting}
                {haStatus?.attempt > 1 && (haStatus.phase === 'connecting' || haStatus.phase === 'waiting') ? ` (forsøk ${haStatus.attempt})` : ''}
            </div>
        </>
    );
};

export default ConnectionBanner;
