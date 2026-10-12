import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Settings, Zap } from 'lucide-react';
import { useHomey } from '../context/HomeyContext';
import EnergyDashboardWidget from './TileContent/EnergyDashboardWidget';
import '../styles/family-page.css';
import { EnergyDashboardGeneralSettings, EnergyDashboardDeviceConfig, EnergyDashboardPowerConfig } from './EnergyDashboardSettings';

// ── Settings modal ─────────────────────────────────────────────────────────────

function EnergyPageSettingsModal({ settings, onClose, onSave }) {
    const [tab, setTab] = useState('general');
    const [localSettings, setLocalSettings] = useState(settings || {});

    const handleChange = (patch) => setLocalSettings(prev => ({ ...prev, ...patch }));

    return createPortal(
        <div className="modal">
            <div className="modal-content" style={{ maxWidth: 520, display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header">
                    <h2>Energidashboard-innstillinger</h2>
                    <button className="icon-btn close-modal" onClick={onClose}><X size={24} /></button>
                </div>

                <div className="fp-settings-tabs">
                    <button className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}>Generelt</button>
                    <button className={tab === 'devices' ? 'active' : ''} onClick={() => setTab('devices')}>Enheter</button>
                    <button className={tab === 'power'   ? 'active' : ''} onClick={() => setTab('power')}>Effekt</button>
                </div>

                <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
                    {tab === 'general' && <EnergyDashboardGeneralSettings settings={localSettings} onChange={handleChange} />}
                    {tab === 'devices' && <EnergyDashboardDeviceConfig settings={localSettings} onChange={handleChange} />}
                    {tab === 'power'   && <EnergyDashboardPowerConfig settings={localSettings} onChange={handleChange} />}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>Avbryt</button>
                    <button className="btn btn-primary" onClick={() => { onSave(localSettings); onClose(); }}>Lagre</button>
                </div>
            </div>
        </div>,
        document.body
    );
}

// ── Main EnergyPage ────────────────────────────────────────────────────────────

export default function EnergyPage({ page }) {
    const { updatePage, isEditMode } = useHomey();
    const [showSettings, setShowSettings] = useState(false);

    const settings = page.energySettings || {};
    const fakeTile = { settings };

    const handleSave = async (newSettings) => {
        await updatePage({ ...page, energySettings: newSettings });
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-bg-main, #0f1117)' }}>
            {isEditMode && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
                    <Zap size={16} style={{ opacity: 0.6 }} />
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, opacity: 0.85, flex: 1 }}>{page?.name || 'Energi'}</span>
                    <button
                        onClick={() => setShowSettings(true)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, color: 'var(--color-text-primary)', cursor: 'pointer' }}
                        title="Innstillinger"
                    >
                        <Settings size={16} />
                    </button>
                </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto' }}>
                <div style={{ maxWidth: 720, margin: '0 auto', padding: '8px 0' }}>
                    <EnergyDashboardWidget tile={fakeTile} />
                </div>
            </div>

            {showSettings && (
                <EnergyPageSettingsModal
                    settings={settings}
                    onClose={() => setShowSettings(false)}
                    onSave={handleSave}
                />
            )}
        </div>
    );
}
