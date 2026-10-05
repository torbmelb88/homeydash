import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Thermometer, Settings, X, Zap, ChevronUp, ChevronDown } from 'lucide-react';
import { useHomey } from '../context/HomeyContext';
import { useLayout } from './music/musicUtils';
import { CheckboxRow, ShowOptionsGroup } from './SettingsControls';
import ClimateCard from './climate/ClimateCard';
import ClimateDetail from './climate/ClimateDetail';
import useClimateControl from '../hooks/useClimateControl';
import {
    buildClimateSections, climateStatus, defaultNameOf, findPowerDevice, formatPower, formatTemp, isPowerCandidate, keyOf, powerCapOf,
} from '../services/climate';
import '../styles/climate-page.css';

const OUTDOOR_ENTITY = 'sensor.utetemperatur_skygge';

// Utetemperatur til headeren: skygge-sensoren (se OutdoorTempTile) hvis den finnes,
// ellers laveste utedel-måling fra varmepumpene (utedeler i sol måler for høyt).
const outdoorTempOf = (devices, climateDevices) => {
    const sensor = devices.find(d => d.id === OUTDOOR_ENTITY || d.entityId === OUTDOOR_ENTITY);
    const v = parseFloat(sensor?.capabilitiesObj?.measure_temperature?.value ?? sensor?.state);
    if (!isNaN(v)) return v;
    const units = climateDevices
        .map(d => d.capabilitiesObj?.['measure_temperature.outdoor']?.value)
        .filter(t => typeof t === 'number' && !isNaN(t));
    return units.length ? Math.min(...units) : null;
};

// Helside klimastyring (pageType 'climate'): varmepumper, varmegulv og bereder.
// Hovedsiden = temperatur opp/ned med knapper; resten ligger i utvidet visning per enhet
// (bunnark på mobil, modal på mellomstore skjermer, sidepanel på nettbrett).
// Innstillinger lagres på siden som page.climateSettings.
export default function ClimatePage({ page }) {
    const { api, devices, isEditMode, updatePage, currentPage } = useHomey();
    const rootRef = useRef(null);
    const layout = useLayout(rootRef);
    const [showSettings, setShowSettings] = useState(false);
    const [openKey, setOpenKey] = useState(null);

    const settings = page.climateSettings || {};
    const sections = useMemo(() => buildClimateSections(devices, settings), [devices, settings]);
    const all = useMemo(() => sections.flatMap(s => s.devices), [sections]);
    const ctl = useClimateControl(api, all, settings);
    const nameOf = (d) => settings.customNames?.[keyOf(d)] || defaultNameOf(d);
    // Tilknyttet strømmåler (smartplugg) per enhet: deviceId → måler-enhet
    const meters = useMemo(
        () => Object.fromEntries(all.map(d => [d.id, findPowerDevice(devices, d, settings)])),
        [all, devices, settings]
    );

    const openDevice = openKey ? all.find(d => keyOf(d) === openKey) : null;
    // Utvidet visning portaleres til <body> på små skjermer — lukk den når siden ikke vises
    useEffect(() => {
        if (isEditMode || currentPage !== page.id) setOpenKey(null);
    }, [isEditMode, currentPage, page.id]);

    // Oppsummering: «3 varmer · 1 kjøler · 1 av»
    const statuses = all.map(d => climateStatus(d, { mode: ctl.capOf(d, 'thermostat_mode'), target: ctl.targetOf(d), meter: meters[d.id] }));
    const heating = statuses.filter(s => s.active && s.tone === 'heat').length;
    const cooling = statuses.filter(s => s.active && s.tone === 'cool').length;
    const off = statuses.filter(s => s.off).length;
    const summary = [heating && `${heating} varmer`, cooling && `${cooling} kjøler`, off && `${off} av`]
        .filter(Boolean).join(' · ') || (all.length ? 'Alt er i ro' : '');

    const powers = all.map(d => powerCapOf(d, meters[d.id])?.value).filter(p => typeof p === 'number');
    const totalPower = powers.reduce((sum, p) => sum + p, 0);
    const outdoor = settings.showOutdoor !== false ? outdoorTempOf(devices, all) : null;

    const detail = openDevice && (
        <ClimateDetail device={openDevice} devices={devices} meter={meters[openDevice.id]} name={nameOf(openDevice)} ctl={ctl} settings={settings} onClose={() => setOpenKey(null)} />
    );

    return (
        <div ref={rootRef} className={`climate-page climate-page--${layout} ${isEditMode ? 'climate-page--edit' : ''}`}>
            {isEditMode && (
                <div className="light-page-editbar">
                    <Thermometer size={16} style={{ opacity: 0.6 }} />
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, opacity: 0.85, flex: 1 }}>{page?.name || 'Klima'}</span>
                    <button className="light-page-editbtn" onClick={() => setShowSettings(true)} title="Innstillinger">
                        <Settings size={16} />
                    </button>
                </div>
            )}

            <div className="climate-shell">
                <div className="climate-main">
                    <div className="light-page-header">
                        <Thermometer size={22} style={{ color: heating + cooling > 0 ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)', flexShrink: 0 }} />
                        <div className="light-page-title">
                            <strong>{page?.name || 'Klima'}</strong>
                            <span>{summary}</span>
                        </div>
                        {outdoor != null && <div className="climate-pill">Ute {formatTemp(outdoor, 1)}°</div>}
                        {settings.showPower !== false && powers.length > 0 && layout !== 'mobile' && (
                            <div className="climate-pill"><Zap size={13} /> {formatPower(totalPower)}</div>
                        )}
                    </div>

                    <div className="climate-scroll">
                        {all.length === 0 ? (
                            <div className="light-panel-empty" style={{ minHeight: 200 }}>
                                <Thermometer size={28} style={{ opacity: 0.5 }} />
                                <span>Fant ingen varmepumper, termostater eller beredere</span>
                            </div>
                        ) : sections.map(s => (
                            <section key={s.kind} className="climate-section">
                                <h3><span>{s.label}</span><span>{s.devices.length}</span></h3>
                                <div className="climate-grid">
                                    {s.devices.map(d => (
                                        <ClimateCard
                                            key={d.id}
                                            device={d}
                                            meter={meters[d.id]}
                                            name={nameOf(d)}
                                            ctl={ctl}
                                            settings={settings}
                                            selected={layout === 'wide' && openKey === keyOf(d)}
                                            onOpen={() => setOpenKey(keyOf(d))}
                                        />
                                    ))}
                                </div>
                            </section>
                        ))}
                    </div>
                </div>

                {detail && layout === 'wide' && <aside className="climate-detail climate-detail--panel">{detail}</aside>}
            </div>

            {detail && layout !== 'wide' && createPortal(
                <div className={`climate-layer climate-layer--${layout}`} onClick={() => setOpenKey(null)}>
                    <div className="climate-detail" onClick={(e) => e.stopPropagation()}>{detail}</div>
                </div>,
                document.body
            )}

            {showSettings && (
                <ClimatePageSettingsModal
                    settings={settings}
                    devices={devices}
                    onClose={() => setShowSettings(false)}
                    onSave={(next) => updatePage({ ...page, climateSettings: next })}
                />
            )}
        </div>
    );
}

const autoMeterName = (devices, d) => {
    const auto = findPowerDevice(devices, d, {});
    return auto ? `auto (${auto.name})` : 'ingen funnet automatisk';
};

// ── Enheter: vis/skjul, eget navn, trinn, strømmåler og rekkefølge ──────────────────────────
function ClimateDevicesSettings({ settings, devices, onChange }) {
    const sections = useMemo(() => buildClimateSections(devices, settings, { includeExcluded: true }), [devices, settings]);
    const excluded = settings.excludedDeviceIds || [];

    const setExcluded = (key, hide) =>
        onChange({ excludedDeviceIds: hide ? [...excluded, key] : excluded.filter(k => k !== key) });
    const setMapValue = (field, key, value) => {
        const next = { ...(settings[field] || {}) };
        if (value) next[key] = value; else delete next[key];
        onChange({ [field]: next });
    };
    // Rekkefølgen lagres som én flat liste over alle seksjoner
    const move = (section, idx, dir) => {
        const j = idx + dir;
        if (j < 0 || j >= section.devices.length) return;
        const order = sections.map(s => {
            const keys = s.devices.map(keyOf);
            if (s.kind === section.kind) [keys[idx], keys[j]] = [keys[j], keys[idx]];
            return keys;
        }).flat();
        onChange({ order });
    };

    // Kandidater til strømmåler: [Rom] Navn (entity_id), sortert rom → navn (uten rom sist)
    const meterOptions = useMemo(() => devices
        .filter(isPowerCandidate)
        .map(m => ({ key: keyOf(m), zone: m.zoneName || '', name: m.name }))
        .sort((a, b) => (a.zone || 'Ø').localeCompare(b.zone || 'Ø', 'nb') || a.name.localeCompare(b.name, 'nb')),
    [devices]);

    if (sections.length === 0) return <p className="hint">Fant ingen klimaenheter.</p>;

    return sections.map(s => (
        <div key={s.kind} className="form-group">
            <label>{s.label}</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {s.devices.map((d, idx) => {
                    const key = keyOf(d);
                    const shown = !excluded.includes(key);
                    return (
                        <div key={key} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <CheckboxRow
                                        label={defaultNameOf(d)}
                                        description={`${d.name} · ${key}`}
                                        checked={shown}
                                        onChange={(checked) => setExcluded(key, !checked)}
                                    />
                                </div>
                                <button className="icon-btn" disabled={idx === 0} onClick={() => move(s, idx, -1)} title="Flytt opp"><ChevronUp size={16} /></button>
                                <button className="icon-btn" disabled={idx === s.devices.length - 1} onClick={() => move(s, idx, 1)} title="Flytt ned"><ChevronDown size={16} /></button>
                            </div>
                            {shown && (
                                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                                    <input
                                        type="text"
                                        value={settings.customNames?.[key] || ''}
                                        onChange={(e) => setMapValue('customNames', key, e.target.value)}
                                        placeholder={`Eget navn (${defaultNameOf(d)})`}
                                        style={{ flex: '1 1 160px', minWidth: 0, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' }}
                                    />
                                    {s.kind !== 'wh' && (
                                        <select
                                            className="select-input"
                                            value={settings.steps?.[key] || ''}
                                            onChange={(e) => setMapValue('steps', key, e.target.value ? Number(e.target.value) : null)}
                                            title="Hvor mye ett trykk på −/+ endrer temperaturen"
                                        >
                                            <option value="">Trinn: fra enheten</option>
                                            <option value="0.5">Trinn: 0,5°</option>
                                            <option value="1">Trinn: 1°</option>
                                        </select>
                                    )}
                                    {s.kind !== 'wh' && (
                                        <select
                                            className="select-input"
                                            style={{ flex: '1 1 100%', minWidth: 0 }}
                                            value={settings.powerDevices?.[key] || ''}
                                            onChange={(e) => setMapValue('powerDevices', key, e.target.value)}
                                            title="Smartplugg eller måler som viser forbruket til denne enheten"
                                        >
                                            <option value="">Strømmåler: {autoMeterName(devices, d)}</option>
                                            <option value="none">Strømmåler: ingen</option>
                                            {meterOptions.map(m => (
                                                <option key={m.key} value={m.key}>{m.zone ? `[${m.zone}] ` : ''}{m.name} ({m.key})</option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    ));
}

function ClimatePageSettingsModal({ settings, devices, onClose, onSave }) {
    const [tab, setTab] = useState('devices');
    const [local, setLocal] = useState(settings || {});
    const handleChange = (patch) => setLocal(prev => ({ ...prev, ...patch }));

    return createPortal(
        <div className="modal">
            <div className="modal-content" style={{ maxWidth: 560, display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header">
                    <h2>Klimaside – innstillinger</h2>
                    <button className="icon-btn close-modal" onClick={onClose}><X size={24} /></button>
                </div>

                <div className="fp-settings-tabs">
                    <button className={tab === 'devices' ? 'active' : ''} onClick={() => setTab('devices')}>Enheter</button>
                    <button className={tab === 'display' ? 'active' : ''} onClick={() => setTab('display')}>Visning</button>
                </div>

                <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
                    {tab === 'devices' && (
                        <>
                            <p className="hint" style={{ marginTop: 0 }}>
                                Siden finner selv alle varmepumper, termostater og beredere. Fjern haken for å skjule en enhet.
                            </p>
                            <ClimateDevicesSettings devices={devices} settings={local} onChange={handleChange} />
                        </>
                    )}
                    {tab === 'display' && (
                        <ShowOptionsGroup
                            title="Øverst på siden"
                            options={[
                                { key: 'showOutdoor', label: 'Vis utetemperatur', def: true },
                                { key: 'showPower', label: 'Vis samlet effekt (nettbrett)', def: true },
                            ]}
                            values={local}
                            onChange={(key, checked) => handleChange({ [key]: checked })}
                        />
                    )}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>Avbryt</button>
                    <button className="btn btn-primary" onClick={() => { onSave(local); onClose(); }}>Lagre</button>
                </div>
            </div>
        </div>,
        document.body
    );
}
