import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Eye, EyeOff } from 'lucide-react';
import { maAPI } from '../../services/ma-api';

// Innstillinger for direkte-tilkobling til Music Assistant (host/port/token).
// Bruker felles .modal-markup fra main.css.
export default function MASettingsOverlay({ onClose }) {
  const [host,  setHost]  = useState(() => maAPI.host  || '');
  const [port,  setPort]  = useState(() => String(maAPI.port  || 8095));
  const [token, setToken] = useState(() => maAPI.token || '');
  const [showToken, setShowToken] = useState(false);
  const [status, setStatus] = useState(null); // null | 'saving' | 'ok' | 'error'

  const save = async () => {
    if (!token.trim()) { setStatus('error'); return; }
    setStatus('saving');
    await maAPI.configure({ host: host.trim(), port: parseInt(port, 10) || 8095, token: token.trim() });
    try {
      await maAPI.connect();
      setStatus('ok');
      setTimeout(onClose, 800);
    } catch {
      setStatus('error');
    }
  };

  return createPortal(
    <div className="modal" style={{ zIndex: 1300 }}>
      <div className="modal-content" style={{ maxWidth: 460, display: 'flex', flexDirection: 'column' }}>
        <div className="modal-header">
          <h2>Music Assistant-tilkobling</h2>
          <button className="icon-btn close-modal" onClick={onClose}><X size={24} /></button>
        </div>

        <div className="modal-body" style={{ overflowY: 'auto' }}>
          <div className="form-group">
            <label>Host</label>
            <input
              type="text"
              value={host}
              onChange={e => setHost(e.target.value)}
              placeholder="192.168.1.x"
              spellCheck={false}
            />
          </div>

          <div className="form-group">
            <label>Port</label>
            <input
              type="number"
              value={port}
              onChange={e => setPort(e.target.value)}
              placeholder="8095"
            />
          </div>

          <div className="form-group">
            <label>Token (langtidstoken)</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={e => setToken(e.target.value)}
                placeholder="eyJ…"
                spellCheck={false}
                style={{ flex: 1, fontFamily: 'monospace', fontSize: '0.85em' }}
              />
              <button
                className="icon-btn"
                onClick={() => setShowToken(v => !v)}
                title={showToken ? 'Skjul token' : 'Vis token'}
                style={{ flexShrink: 0 }}
              >
                {showToken ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <p className="hint">
              Lag token i Music Assistant under Innstillinger → Sikkerhet → Langtidstoken.
            </p>
          </div>

          {status === 'error' && (
            <p className="hint" style={{ color: 'var(--color-error, #ef4444)' }}>
              Kunne ikke koble til – sjekk host, port og token.
            </p>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Avbryt</button>
          <button
            className="btn btn-primary"
            onClick={save}
            disabled={status === 'saving'}
            style={status === 'ok' ? { background: '#22c55e', borderColor: '#22c55e' } : undefined}
          >
            {status === 'saving' ? 'Kobler til…' : status === 'ok' ? 'Tilkoblet ✓' : 'Lagre og koble til'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
