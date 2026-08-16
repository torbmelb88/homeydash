import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useHomey } from '../context/HomeyContext';
import { storage } from '../services/storage';
import { X, Copy, Trash2, History, Pencil, Save } from 'lucide-react';

const TABS = [
    { id: 'hub', label: 'Hub' },
    { id: 'display', label: 'Visning' },
    { id: 'layout', label: 'Layout' },
    { id: 'popups', label: 'Popups' },
    { id: 'backup', label: 'Sikkerhetskopi' },
];

const SettingsModal = ({ onClose }) => {
    const { settings, setSettings, devices } = useHomey();
    const [activeTab, setActiveTab] = useState('hub');
    const [hubType, setHubType] = useState(settings.hubType || 'homey');
    const [ip, setIp] = useState(settings.homeyIp || '');
    const [token, setToken] = useState(settings.homeyToken || '');
    const [hassUrl, setHassUrl] = useState(settings.hassUrl || '');
    const [hassToken, setHassToken] = useState(settings.hassToken || '');
    const [batteryDevice, setBatteryDevice] = useState(settings.batteryDeviceId || '');
    const [showFullscreen, setShowFullscreen] = useState(settings.showFullscreenBtn !== false);
    const [showSidebar, setShowSidebar] = useState(settings.showSidebar !== false);
    const [panelMode, setPanelMode] = useState(settings.panelMode || false);
    const [finishedPrompts, setFinishedPrompts] = useState(settings.finishedPromptsEnabled !== false);
    const [incomingCallPopup, setIncomingCallPopup] = useState(settings.incomingCallPopupEnabled !== false);
    const [wastePrompt, setWastePrompt] = useState(settings.wastePromptEnabled !== false);
    const [bladePrompt, setBladePrompt] = useState(settings.bladePromptEnabled !== false);
    const [gridColumns, setGridColumns] = useState(settings.gridColumns || 'auto');
    const [gridDensity, setGridDensity] = useState(settings.gridDensity || 'normal');
    const [status, setStatus] = useState('');
    const [showJsonExport, setShowJsonExport] = useState(false);
    const [jsonExportData, setJsonExportData] = useState('');
    const [versionName, setVersionName] = useState('');
    const [versions, setVersions] = useState(null); // null = liste skjult
    const [editingVersionId, setEditingVersionId] = useState(null);
    const [editVersionName, setEditVersionName] = useState('');

    const handleTestConnection = async () => {
        setStatus('⏳ Tester tilkobling...');
        try {
            if (hubType === 'homey') {
                const { homeyAPI } = await import('../services/homey-api');
                homeyAPI.configure(ip, token);
                const info = await homeyAPI.getSystemInfo();
                if (info) {
                    setStatus(`✅ Koblet til Homey: ${info.name}`);
                }
            } else {
                const { hassAPI } = await import('../services/hass-api');
                try {
                    // connect() now has a timeout and better error messages
                    await hassAPI.connect(hassUrl, hassToken);
                    setStatus('✅ Koblet til Home Assistant!');
                } catch (e) {
                    setStatus(`❌ HA Feil: ${e.message}`);
                }
            }
        } catch (error) {
            console.error('Test failed:', error);
            setStatus(`❌ Tilkobling feilet: ${error.message || 'Ukjent feil'}`);
        }
    };

    const handleSave = async () => {
        const newSettings = {
            ...settings,
            hubType,
            homeyIp: ip,
            homeyToken: token,
            hassUrl,
            hassToken,
            batteryDeviceId: batteryDevice,
            showFullscreenBtn: showFullscreen,
            showSidebar: showSidebar,
            panelMode: panelMode,
            finishedPromptsEnabled: finishedPrompts,
            incomingCallPopupEnabled: incomingCallPopup,
            wastePromptEnabled: wastePrompt,
            bladePromptEnabled: bladePrompt,
            gridColumns,
            gridDensity
        };
        await storage.set('settings', newSettings, 'config');
        setSettings(newSettings);
        window.location.reload();
    };

    const batteryDevices = devices.filter(d => d.capabilitiesObj?.measure_battery);

    const handleExport = async () => {
        const data = await storage.exportData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `homeydash-backup-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImport = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            await storage.importData(data);
            alert('Konfigurasjon importert! Siden lastes inn på nytt.');
            window.location.reload();
        } catch (e) {
            alert('Feil ved import: ' + e.message);
        }
        event.target.value = '';
    };

    const handleSync = () => {
        ['pages', 'tiles', 'settings', 'settings_config'].forEach(k => localStorage.removeItem(k));
        window.location.reload();
    };

    // «Synkroniser fra sky» viser versjonslisten når Firebase er aktiv;
    // uten Firebase (demo/offline) beholdes gammel oppførsel (tøm cache + reload).
    const handleSyncClick = async () => {
        if (!storage.useFirebase) { handleSync(); return; }
        if (versions !== null) { setVersions(null); return; } // toggle
        setStatus('⏳ Henter versjoner...');
        const list = await storage.listVersions();
        setVersions(list);
        setStatus('');
    };

    const formatVersionDate = (ts) => new Date(ts).toLocaleString('nb-NO', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const handleRestoreVersion = async (v) => {
        const label = v.name || formatVersionDate(v.createdAt);
        if (!window.confirm(`Hente versjonen «${label}»? Nåværende oppsett tas det automatisk sikkerhetskopi av først.`)) return;
        setStatus('⏳ Gjenoppretter versjon...');
        try {
            // Sikkerhetsnett: snapshot av det som ligger i skyen nå, før overskriving
            const current = await storage.exportData();
            await storage.saveVersion(current, '', true);
            const ok = await storage.restoreVersion(v.id);
            if (!ok) { setStatus('❌ Fant ikke versjonen i skyen'); return; }
            window.location.reload();
        } catch (e) {
            setStatus('❌ Feil ved gjenoppretting: ' + e.message);
        }
    };

    const handleRenameVersion = async (id) => {
        try {
            await storage.renameVersion(id, editVersionName);
            setEditingVersionId(null);
            setVersions(await storage.listVersions());
        } catch (e) {
            setStatus('❌ Feil ved navneendring: ' + e.message);
        }
    };

    const handleDeleteVersion = async (v) => {
        const label = v.name || formatVersionDate(v.createdAt);
        if (!window.confirm(`Slette versjonen «${label}»?`)) return;
        try {
            await storage.deleteVersion(v.id);
            setVersions(await storage.listVersions());
        } catch (e) {
            setStatus('❌ Feil ved sletting: ' + e.message);
        }
    };

    const handlePushToCloud = async () => {
        setStatus('⏳ Laster opp til sky...');
        try {
            const data = {
                pages: JSON.parse(localStorage.getItem('pages') || '[]'),
                tiles: JSON.parse(localStorage.getItem('tiles') || '[]'),
                settings: JSON.parse(localStorage.getItem('settings_config') || '{}'),
            };
            await storage.importData(data);
            const trimmedName = versionName.trim();
            await storage.saveVersion(data, trimmedName);
            setVersionName('');
            if (versions !== null) setVersions(await storage.listVersions());
            setStatus(trimmedName
                ? `✅ Dyttet til sky — versjonen «${trimmedName}» er lagret!`
                : '✅ Konfigurasjon er dyttet til sky!');
        } catch (e) {
            setStatus('❌ Feil: ' + e.message);
        }
    };

    return createPortal(
        <div className="modal">
            <div className="modal-content">
                <div className="modal-header">
                    <h2>Innstillinger</h2>
                    <button className="icon-btn close-modal" onClick={onClose}>
                        <X size={24} />
                    </button>
                </div>
                <div className="modal-tabs">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
                <div className="modal-body">
                    {activeTab === 'hub' && (
                    <div className="settings-section">
                        <h3>Hub Konfigurasjon</h3>

                        <div className="form-group">
                            <label>Velg Hub Type</label>
                            <div className="hub-selector" style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                <button
                                    className={`btn ${hubType === 'homey' ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => setHubType('homey')}
                                    style={{ flex: 1 }}
                                >
                                    Homey
                                </button>
                                <button
                                    className={`btn ${hubType === 'hass' ? 'btn-primary' : 'btn-secondary'}`}
                                    onClick={() => setHubType('hass')}
                                    style={{ flex: 1 }}
                                >
                                    Home Assistant
                                </button>
                            </div>
                        </div>

                        {hubType === 'homey' ? (
                            <>
                                <div className="form-group">
                                    <label>Homey IP-adresse</label>
                                    <input type="text" value={ip} onChange={e => setIp(e.target.value)} placeholder="192.168.1.100" />
                                </div>
                                <div className="form-group">
                                    <label>API Token</label>
                                    <input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="Din Homey API token" />
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="form-group">
                                    <label>Home Assistant URL</label>
                                    <input type="text" value={hassUrl} onChange={e => setHassUrl(e.target.value)} placeholder="http://192.168.1.x:8123" />
                                </div>
                                <div className="form-group">
                                    <label>Long-Lived Access Token</label>
                                    <input type="password" value={hassToken} onChange={e => setHassToken(e.target.value)} placeholder="Din HA LLAT token" />
                                </div>
                            </>
                        )}

                        <button className="btn btn-secondary" onClick={handleTestConnection} style={{ marginTop: '10px' }}>Test tilkobling</button>
                        <div className="connection-status" style={{ marginTop: '10px', fontSize: '0.9rem', color: status.includes('✅') ? '#4caf50' : '#f44336' }}>
                            {status}
                        </div>
                    </div>
                    )}

                    {activeTab === 'display' && (
                    <>
                    <div className="settings-section">
                        <h3>Visning</h3>
                        <div className="form-group checkbox-group">
                            <input type="checkbox" id="fsCheck" checked={showFullscreen} onChange={e => setShowFullscreen(e.target.checked)} />
                            <label htmlFor="fsCheck">Vis fullskjerm-knapp</label>
                        </div>
                        <div className="form-group checkbox-group">
                            <input type="checkbox" id="sbCheck" checked={showSidebar} onChange={e => setShowSidebar(e.target.checked)} />
                            <label htmlFor="sbCheck">Vis sidepanel (meny)</label>
                        </div>
                        <div className="form-group checkbox-group">
                            <input type="checkbox" id="panelCheck" checked={panelMode} onChange={e => setPanelMode(e.target.checked)} />
                            <label htmlFor="panelCheck">Aktiver Panel Mode (NSPanel Pro / Små skjermer)</label>
                        </div>
                    </div>

                    <div className="settings-section">
                        <h3>Batterienhet</h3>
                        <div className="form-group">
                            <label>Velg batterienhet</label>
                            <select value={batteryDevice} onChange={e => setBatteryDevice(e.target.value)}>
                                <option value="">Ingen valgt</option>
                                {batteryDevices.map(d => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    </>
                    )}

                    {activeTab === 'layout' && (
                    <div className="settings-section">
                        <h3>Dashboard Layout</h3>

                        <div className="form-group">
                            <label>Antall Kolonner (Bredde)</label>
                            <select value={gridColumns} onChange={e => setGridColumns(e.target.value)}>
                                <option value="auto">Automatisk (Responsiv)</option>
                                <option value="4">4 Kolonner</option>
                                <option value="5">5 Kolonner</option>
                                <option value="6">6 Kolonner</option>
                                <option value="8">8 Kolonner</option>
                                <option value="10">10 Kolonner</option>
                                <option value="12">12 Kolonner</option>
                            </select>
                            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                                Velg fast antall for å låse rutenettet, eller automatisk for å fylle skjermen.
                            </p>
                        </div>

                        <div className="form-group">
                            <label>Radhøyde (Tetthet)</label>
                            <select value={gridDensity} onChange={e => setGridDensity(e.target.value)}>
                                <option value="compact">Kompakt (Tettere)</option>
                                <option value="normal">Normal</option>
                                <option value="spacious">Luftig (Mer mellomrom)</option>
                            </select>
                        </div>
                    </div>
                    )}

                    {activeTab === 'popups' && (
                    <div className="settings-section">
                        <h3>Popups på denne profilen</h3>
                        <div className="form-group checkbox-group">
                            <input type="checkbox" id="finishedPromptCheck" checked={finishedPrompts} onChange={e => setFinishedPrompts(e.target.checked)} />
                            <label htmlFor="finishedPromptCheck">Vis ferdig-popup («Er maskinen tømt?»)</label>
                        </div>
                        <div className="form-group checkbox-group">
                            <input type="checkbox" id="callPopupCheck" checked={incomingCallPopup} onChange={e => setIncomingCallPopup(e.target.checked)} />
                            <label htmlFor="callPopupCheck">Vis anrops-popup (intercom ringer)</label>
                        </div>
                        <div className="form-group checkbox-group">
                            <input type="checkbox" id="wastePromptCheck" checked={wastePrompt} onChange={e => setWastePrompt(e.target.checked)} />
                            <label htmlFor="wastePromptCheck">Vis søppeltømming-popup («Er søpla båret ut?»)</label>
                        </div>
                        <div className="form-group checkbox-group">
                            <input type="checkbox" id="bladePromptCheck" checked={bladePrompt} onChange={e => setBladePrompt(e.target.checked)} />
                            <label htmlFor="bladePromptCheck">Vis knivbytte-popup for robotklipper («Er knivene byttet?»)</label>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '0.5rem' }}>
                            Gjelder kun denne enheten/profilen. Andre nettbrett og mobiler har egne valg.
                        </p>
                    </div>
                    )}

                    {activeTab === 'backup' && (
                    <div className="settings-section">
                        <h3>Sikkerhetskopi</h3>
                        <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                            <input
                                type="text"
                                value={versionName}
                                onChange={e => setVersionName(e.target.value)}
                                placeholder="Navn på versjon (valgfritt, f.eks. «Sommeroppsett»)"
                                maxLength={60}
                                style={{ width: '100%', padding: '8px', borderRadius: '4px', background: 'var(--color-bg-secondary)', color: 'white', border: '1px solid var(--color-border)' }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.5rem' }}>
                            <button className="btn btn-primary" onClick={handlePushToCloud} style={{ flex: 1 }}>
                                Dytt til sky
                            </button>
                            <button className="btn btn-secondary" onClick={handleSyncClick} style={{ flex: 1 }}>
                                Synkroniser fra sky
                            </button>
                        </div>
                        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '1rem' }}>
                            <strong>Dytt til sky</strong> (bruk på PC): sender det som er her til Firebase, inkludert opprydding av slettede fliser. Hvert dytt lagres også som en versjon — gi den navn hvis du er særlig fornøyd med oppsettet (navngitte versjoner beholdes for alltid, navnløse kun de 15 siste).<br />
                            <strong>Synkroniser fra sky</strong> (bruk på nettbrett): viser lagrede versjoner du kan hente — eller bare siste synkroniserte.
                        </p>
                        {versions !== null && (
                            <div style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '10px', marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <span style={{ fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <History size={16} /> Velg versjon
                                    </span>
                                    <button className="icon-btn" onClick={() => setVersions(null)}><X size={16} /></button>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '260px', overflowY: 'auto' }}>
                                    <button
                                        className="btn btn-secondary"
                                        onClick={handleSync}
                                        style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                                    >
                                        Siste synkroniserte oppsett (gjeldende i skyen)
                                    </button>
                                    {versions.map(v => (
                                        <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            {editingVersionId === v.id ? (
                                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0' }}>
                                                    <input
                                                        autoFocus
                                                        type="text"
                                                        value={editVersionName}
                                                        onChange={e => setEditVersionName(e.target.value)}
                                                        onKeyDown={e => {
                                                            if (e.key === 'Enter') handleRenameVersion(v.id);
                                                            if (e.key === 'Escape') setEditingVersionId(null);
                                                        }}
                                                        placeholder="Navn på versjon"
                                                        maxLength={60}
                                                        style={{ flex: 1, padding: '6px 8px', borderRadius: '4px', background: 'var(--color-bg-tertiary)', color: 'white', border: '1px solid var(--color-accent-primary)' }}
                                                    />
                                                    <button className="icon-btn" onClick={() => handleRenameVersion(v.id)} title="Lagre navn">
                                                        <Save size={15} />
                                                    </button>
                                                    <button className="icon-btn" onClick={() => setEditingVersionId(null)} title="Avbryt">
                                                        <X size={15} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    <button
                                                        className="btn btn-ghost"
                                                        onClick={() => handleRestoreVersion(v)}
                                                        style={{ flex: 1, justifyContent: 'flex-start', textAlign: 'left', flexDirection: 'column', alignItems: 'flex-start', gap: '2px', padding: '8px 10px' }}
                                                    >
                                                        <span style={{ fontSize: '0.9rem', fontWeight: v.name ? 600 : 400 }}>
                                                            {v.name || (v.auto ? 'Auto-sikkerhetskopi' : 'Uten navn')}
                                                        </span>
                                                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                                                            {formatVersionDate(v.createdAt)} · {v.tileCount ?? '?'} fliser · {v.pageCount ?? '?'} sider
                                                        </span>
                                                    </button>
                                                    <button
                                                        className="icon-btn"
                                                        onClick={() => { setEditingVersionId(v.id); setEditVersionName(v.name || ''); }}
                                                        title="Gi navn / endre navn"
                                                    >
                                                        <Pencil size={15} />
                                                    </button>
                                                    <button className="icon-btn" onClick={() => handleDeleteVersion(v)} title="Slett versjon" style={{ color: 'var(--color-error)' }}>
                                                        <Trash2 size={15} />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    ))}
                                    {versions.length === 0 && (
                                        <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontStyle: 'italic', padding: '4px' }}>
                                            Ingen lagrede versjoner ennå — de opprettes ved «Dytt til sky».
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}
                        {status && (
                            <p style={{ fontSize: '0.9rem', marginBottom: '1rem', color: status.includes('✅') ? '#4caf50' : '#f44336' }}>
                                {status}
                            </p>
                        )}
                        <div style={{ display: 'flex', gap: '1rem' }}>
                            <button className="btn btn-secondary" onClick={handleExport} style={{ flex: 1 }}>
                                Eksporter konfigurasjon
                            </button>
                            <label className="btn btn-secondary" style={{ flex: 1, cursor: 'pointer', textAlign: 'center' }}>
                                Importer konfigurasjon
                                <input
                                    type="file"
                                    accept=".json"
                                    onChange={handleImport}
                                    style={{ display: 'none' }}
                                />
                            </label>
                        </div>

                        <div style={{ marginTop: '1rem' }}>
                            <button
                                className="btn btn-secondary"
                                onClick={async () => {
                                    if (showJsonExport) {
                                        setShowJsonExport(false);
                                    } else {
                                        const data = await storage.exportData();
                                        setJsonExportData(JSON.stringify(data, null, 2));
                                        setShowJsonExport(true);
                                    }
                                }}
                                style={{ width: '100%' }}
                            >
                                {showJsonExport ? 'Skjul JSON' : 'Vis JSON (for klipp og lim)'}
                            </button>

                            {showJsonExport && (
                                <div style={{ marginTop: '0.5rem', position: 'relative' }}>
                                    <textarea
                                        readOnly
                                        value={jsonExportData}
                                        style={{
                                            width: '100%',
                                            height: '200px',
                                            background: 'var(--color-bg-primary)',
                                            color: 'var(--color-text-primary)',
                                            padding: '8px',
                                            border: '1px solid var(--color-border)',
                                            borderRadius: '4px',
                                            fontSize: '0.8rem',
                                            fontFamily: 'monospace'
                                        }}
                                    />
                                    <button
                                        className="icon-btn"
                                        onClick={() => {
                                            navigator.clipboard.writeText(jsonExportData);
                                            alert('Kopiert til utklippstavle!');
                                        }}
                                        style={{
                                            position: 'absolute',
                                            top: '8px',
                                            right: '8px',
                                            background: 'rgba(0,0,0,0.5)',
                                            padding: '4px'
                                        }}
                                        title="Kopier"
                                    >
                                        <Copy size={16} color="white" />
                                    </button>
                                </div>
                            )}
                        </div>

                        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '0.5rem' }}>
                            Eksport laster ned en fil. Import overskriver alt.
                        </p>
                    </div>
                    )}
                </div>
                <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button
                        className="btn"
                        style={{ background: 'transparent', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}
                        onClick={() => {
                            storage.clearActiveProfile();
                            window.location.reload();
                        }}
                    >
                        Bytt profil
                    </button>
                    <button className="btn btn-primary" onClick={handleSave}>Lagre</button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default SettingsModal;
