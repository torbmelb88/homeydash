import React, { useEffect, useState } from 'react';
import { Copy, Trash2 } from 'lucide-react';
import { hassAPI } from '../services/hass-api';

const fmtTime = (t) => {
    const d = new Date(t);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
};

const fmtDate = (t) => {
    const d = new Date(t);
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Tilkoblingslogg for Home Assistant (Innstillinger → Hub). Konsollen er
 * utilgjengelig på mobilen, så hendelsene i gjenoppkoblingsløpet (skjult,
 * vekket, ping, forsøk, lastet …) samles i hass-api og vises her – med
 * kopieringsknapp så loggen kan limes inn i en melding.
 */
const ConnectionLog = () => {
    const [events, setEvents] = useState(() => hassAPI.getEvents());
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const t = setInterval(() => setEvents(hassAPI.getEvents()), 1000);
        return () => clearInterval(t);
    }, []);

    const rows = events.slice().reverse();
    const toText = () => rows.map(e => `${fmtDate(e.t)} ${fmtTime(e.t)}  ${e.text}`).join('\n');

    const copy = async () => {
        const text = toText();
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // Fallback (eldre WebView uten clipboard-API): marker teksten i et felt
            window.prompt('Kopier loggen:', text);
        }
    };

    return (
        <div className="form-section" style={{ marginTop: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <label style={{ margin: 0 }}>Tilkoblingslogg</label>
                <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="btn btn-secondary" onClick={copy} style={{ padding: '4px 10px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Copy size={13} /> {copied ? 'Kopiert' : 'Kopier'}
                    </button>
                    <button className="btn btn-secondary" onClick={() => { hassAPI.clearEvents(); setEvents([]); }} style={{ padding: '4px 10px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Trash2 size={13} /> Tøm
                    </button>
                </div>
            </div>
            <p className="hint" style={{ marginTop: '4px' }}>
                Status nå: <strong>{hassAPI.status?.phase === 'connected' ? 'tilkoblet' : hassAPI.status?.phase}</strong>.
                De siste hendelsene i tilkoblingen til Home Assistant, nyeste øverst. Overlever omlasting av siden.
            </p>
            <div style={{
                marginTop: '8px',
                maxHeight: '260px',
                overflowY: 'auto',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: '0.72rem',
                lineHeight: 1.45,
                background: 'rgba(0,0,0,0.25)',
                borderRadius: '8px',
                padding: '8px 10px',
                color: 'var(--color-text-secondary, #94a3b8)',
            }}>
                {rows.length === 0 && <div>Ingen hendelser ennå.</div>}
                {rows.map((e, i) => (
                    <div key={`${e.t}-${i}`} style={{ display: 'flex', gap: '8px', whiteSpace: 'pre-wrap' }}>
                        <span style={{ flexShrink: 0, opacity: 0.7 }}>{fmtTime(e.t)}</span>
                        <span style={{ color: 'var(--color-text-primary, #e2e8f0)' }}>{e.text}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ConnectionLog;
