import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Lightbulb, Power, Settings, X, Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { useHomey } from '../context/HomeyContext';
import LightSlider from './LightSlider';
import LightPanelSettings from './LightPanelSettings';
import { CheckboxRow } from './SettingsControls';
import { buildLightGroups, DEFAULT_LIGHT_PRESETS } from './TileContent/LightPanelTile';
import useLightControl, { normalizePresets } from '../hooks/useLightControl';

const OTHER_TAB_ID = '__other__';

// Fordeler gruppene på fanene fra innstillingene. Grupper som ikke er tilordnet noen fane
// samles i en automatisk «Annet»-fane (bare hvis det finnes noen). Uten faner: én liste.
const splitIntoTabs = (groups, tabs) => {
    if (!tabs || tabs.length === 0) return null;
    const assigned = new Set();
    const result = tabs.map(t => {
        const ids = new Set(t.groupIds || []);
        const list = groups.filter(g => ids.has(g.id));
        list.forEach(g => assigned.add(g.id));
        return { id: t.id, name: t.name || 'Fane', groups: list };
    });
    const rest = groups.filter(g => !assigned.has(g.id));
    if (rest.length > 0) result.push({ id: OTHER_TAB_ID, name: 'Annet', groups: rest });
    return result;
};

// Helside lysstyring (pageType 'lights'). Samme innstillingsmodell som Lyspanel-flisen,
// lagret på siden som page.lightSettings. Alle rom er åpne; laget for mobil.
export default function LightPage({ page }) {
    const { api, devices, isEditMode, updatePage, setIsInteracting } = useHomey();
    const [showSettings, setShowSettings] = useState(false);

    const settings = page.lightSettings || {};
    const presets = normalizePresets(settings.presets, DEFAULT_LIGHT_PRESETS);
    const showPresets = settings.showPresets !== false;
    const showAllOff = settings.showAllOff !== false;

    const groups = useMemo(() => buildLightGroups(devices, settings), [devices, settings]);
    const { isOn, dimOf, hasDim, nameOf, setOnOff, setDim, toggleGroup, applyPreset, allOff, onCount } =
        useLightControl(api, groups, settings.customNames || {});

    // Faner (valgfritt). Valgt fane huskes per side i denne nettleseren.
    const tabs = useMemo(() => splitIntoTabs(groups, settings.tabs), [groups, settings.tabs]);
    const tabKey = `lightPageTab:${page.id}`;
    const [activeTabId, setActiveTabId] = useState(() => {
        try { return localStorage.getItem(tabKey) || null; } catch { return null; }
    });
    const activeTab = tabs ? (tabs.find(t => t.id === activeTabId) || tabs[0]) : null;
    useEffect(() => {
        if (!activeTab) return;
        try { localStorage.setItem(tabKey, activeTab.id); } catch { /* ignorér */ }
    }, [activeTab?.id, tabKey]); // eslint-disable-line react-hooks/exhaustive-deps

    const visibleGroups = activeTab ? activeTab.groups : groups;

    // Valgfritt: rom der alt er av legges nederst (det du kan slå av ligger øverst)
    const orderedGroups = useMemo(() => {
        if (!settings.offRoomsLast) return visibleGroups;
        const on = visibleGroups.filter(g => g.devices.some(isOn));
        const off = visibleGroups.filter(g => !g.devices.some(isOn));
        return [...on, ...off];
    }, [visibleGroups, settings.offRoomsLast, onCount]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSave = async (newSettings) => {
        await updatePage({ ...page, lightSettings: newSettings });
    };

    const renderLamp = (d) => {
        const on = isOn(d);
        const Icon = d.LucideIcon || Lightbulb;
        return (
            <div key={d.id} className="light-lamp">
                <div className={`light-lamp-name ${on ? '' : 'off'}`}>
                    <Icon size={16} strokeWidth={1.5} style={{ flexShrink: 0, color: on ? 'var(--color-accent-primary)' : 'inherit' }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{nameOf(d)}</span>
                </div>
                {hasDim(d) ? (
                    <LightSlider
                        value={dimOf(d)}
                        off={!on}
                        onInteractionStart={() => setIsInteracting(true)}
                        onInteractionEnd={() => setIsInteracting(false)}
                        onChangeEnd={(v) => setDim(d, v)}
                    />
                ) : (
                    <div className="light-lamp-onoff">{on ? 'På' : 'Av'}</div>
                )}
                <button
                    className={`light-toggle ${on ? 'on' : ''}`}
                    onClick={() => setOnOff(d, !on)}
                    title={on ? 'Slå av' : 'Slå på'}
                >
                    <Power size={20} />
                </button>
            </div>
        );
    };

    const renderGroup = (g) => {
        const on = g.devices.filter(isOn).length;
        const dimmable = g.devices.some(hasDim);
        return (
            <div key={g.id} className={`light-room open ${on > 0 ? 'any-on' : 'all-off'}`}>
                <div className="light-room-row static">
                    <div className="light-room-name">
                        <strong>{g.name}</strong>
                        <span>{on === 0 ? 'Alle av' : `${on} av ${g.devices.length} på`}</span>
                    </div>
                    <button
                        className={`light-toggle ${on > 0 ? 'on' : ''}`}
                        onClick={() => toggleGroup(g)}
                        title={on > 0 ? 'Slå av alle i rommet' : 'Slå på alle i rommet'}
                    >
                        <Power size={20} />
                    </button>
                </div>
                <div className="light-room-body">
                    {g.devices.map(renderLamp)}
                    {showPresets && dimmable && presets.length > 0 && (
                        <div className="light-presets">
                            {presets.map(p => (
                                <button key={p} className="light-preset-chip" onClick={() => applyPreset(g.devices, p)}>
                                    {p} %
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className={`light-page ${isEditMode ? 'light-page--edit' : ''}`}>
            {isEditMode && (
                <div className="light-page-editbar">
                    <Lightbulb size={16} style={{ opacity: 0.6 }} />
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, opacity: 0.85, flex: 1 }}>{page?.name || 'Lys'}</span>
                    <button className="light-page-editbtn" onClick={() => setShowSettings(true)} title="Innstillinger">
                        <Settings size={16} />
                    </button>
                </div>
            )}

            <div className="light-page-header">
                <Lightbulb size={22} style={{ color: onCount > 0 ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)', flexShrink: 0 }} />
                <div className="light-page-title">
                    <strong>{page?.name || 'Lys'}</strong>
                    <span>{onCount === 0 ? 'Alle lys er av' : `${onCount} lys på`}</span>
                </div>
                {showAllOff && (
                    <button className="light-panel-alloff light-page-alloff" disabled={onCount === 0} onClick={allOff}>
                        Alle av
                    </button>
                )}
            </div>

            {tabs && (
                <div className="light-page-tabs no-scrollbar">
                    {tabs.map(t => {
                        const tabOn = t.groups.reduce((n, g) => n + g.devices.filter(isOn).length, 0);
                        return (
                            <button
                                key={t.id}
                                className={`light-page-tab ${activeTab?.id === t.id ? 'active' : ''}`}
                                onClick={() => setActiveTabId(t.id)}
                            >
                                {t.name}
                                {tabOn > 0 && <span className="light-page-tab-badge">{tabOn}</span>}
                            </button>
                        );
                    })}
                </div>
            )}

            <div className="light-page-scroll">
                {groups.length === 0 ? (
                    <div className="light-panel-empty" style={{ minHeight: 200 }}>
                        <Lightbulb size={28} style={{ opacity: 0.5 }} />
                        <span>{settings.mode === 'custom' ? 'Ingen lys valgt' : 'Fant ingen lys'}</span>
                        <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>Åpne redigeringsmodus og trykk på tannhjulet for å sette opp siden</span>
                    </div>
                ) : orderedGroups.length === 0 ? (
                    <div className="light-panel-empty" style={{ minHeight: 160 }}>
                        <span>Ingen rom i denne fanen</span>
                    </div>
                ) : (
                    <div className="light-page-grid">
                        {orderedGroups.map(renderGroup)}
                    </div>
                )}
            </div>

            {showSettings && (
                <LightPageSettingsModal
                    settings={settings}
                    devices={devices}
                    onClose={() => setShowSettings(false)}
                    onSave={handleSave}
                />
            )}
        </div>
    );
}

// ── Faner: opprett faner og velg hvilke rom/grupper som hører til hver ──────────
function LightTabsSettings({ settings, devices, onChange }) {
    const tabs = settings.tabs || [];
    // Tilgjengelige grupper ut fra gjeldende (ulagrede) innstillinger
    const groups = useMemo(() => buildLightGroups(devices, settings), [devices, settings]);

    const setTabs = (next) => onChange({ tabs: next });
    const updateTab = (idx, patch) => setTabs(tabs.map((t, i) => i === idx ? { ...t, ...patch } : t));
    const moveTab = (idx, dir) => {
        const j = idx + dir;
        if (j < 0 || j >= tabs.length) return;
        const next = [...tabs];
        [next[idx], next[j]] = [next[j], next[idx]];
        setTabs(next);
    };
    const addTab = () => setTabs([...tabs, { id: Date.now().toString(), name: tabs.length === 0 ? '1. etasje' : 'Ny fane', groupIds: [] }]);
    const removeTab = (idx) => setTabs(tabs.filter((_, i) => i !== idx));

    const toggleGroupInTab = (idx, groupId, checked) => {
        const ids = new Set(tabs[idx].groupIds || []);
        checked ? ids.add(groupId) : ids.delete(groupId);
        updateTab(idx, { groupIds: [...ids] });
    };

    // Hvilken fane et rom allerede ligger i (til hint i lista)
    const tabOfGroup = (groupId, exceptIdx) =>
        tabs.find((t, i) => i !== exceptIdx && (t.groupIds || []).includes(groupId))?.name;

    return (
        <div className="form-group">
            <label>Faner</label>
            <p className="hint" style={{ marginTop: 0, marginBottom: '0.75rem' }}>
                Del lysene i faner, f.eks. «1. etasje» og «Kjeller». Rom som ikke er lagt i noen fane
                havner automatisk i en «Annet»-fane. Uten faner vises alle rom i én liste.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {tabs.map((t, idx) => (
                    <div key={t.id} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                            <input
                                type="text"
                                value={t.name}
                                onChange={(e) => updateTab(idx, { name: e.target.value })}
                                placeholder="Fanenavn"
                                style={{ flex: 1, minWidth: 0, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' }}
                            />
                            <button className="icon-btn" disabled={idx === 0} onClick={() => moveTab(idx, -1)}><ChevronUp size={16} /></button>
                            <button className="icon-btn" disabled={idx === tabs.length - 1} onClick={() => moveTab(idx, 1)}><ChevronDown size={16} /></button>
                            <button className="icon-btn" onClick={() => removeTab(idx)} style={{ color: 'var(--color-error)' }}><Trash2 size={16} /></button>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {groups.map(g => {
                                const elsewhere = tabOfGroup(g.id, idx);
                                return (
                                    <CheckboxRow
                                        key={g.id}
                                        label={g.name}
                                        description={elsewhere ? `Ligger også i «${elsewhere}»` : undefined}
                                        checked={(t.groupIds || []).includes(g.id)}
                                        onChange={(checked) => toggleGroupInTab(idx, g.id, checked)}
                                    />
                                );
                            })}
                            {groups.length === 0 && <span className="hint" style={{ fontStyle: 'italic' }}>Ingen rom å velge — sjekk inndelingen over.</span>}
                        </div>
                    </div>
                ))}
            </div>
            <button className="btn btn-secondary" onClick={addTab} style={{ marginTop: 10, width: '100%' }}>
                <Plus size={16} style={{ marginRight: 6 }} /> Ny fane
            </button>
        </div>
    );
}

function LightPageSettingsModal({ settings, devices, onClose, onSave }) {
    const [tab, setTab] = useState('lights');
    const [local, setLocal] = useState(settings || {});
    const handleChange = (patch) => setLocal(prev => ({ ...prev, ...patch }));

    return createPortal(
        <div className="modal">
            <div className="modal-content" style={{ maxWidth: 560, display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header">
                    <h2>Lysside – innstillinger</h2>
                    <button className="icon-btn close-modal" onClick={onClose}><X size={24} /></button>
                </div>

                <div className="fp-settings-tabs">
                    <button className={tab === 'lights' ? 'active' : ''} onClick={() => setTab('lights')}>Lys</button>
                    <button className={tab === 'tabs' ? 'active' : ''} onClick={() => setTab('tabs')}>Faner</button>
                    <button className={tab === 'display' ? 'active' : ''} onClick={() => setTab('display')}>Visning</button>
                </div>

                <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
                    {tab === 'lights' && (
                        <LightPanelSettings devices={devices} settings={local} onChange={handleChange} />
                    )}
                    {tab === 'tabs' && (
                        <LightTabsSettings devices={devices} settings={local} onChange={handleChange} />
                    )}
                    {tab === 'display' && (
                        <div className="form-group">
                            <CheckboxRow
                                label="Rom der alt er av legges nederst"
                                description="Det du faktisk kan slå av ligger øverst i lista."
                                checked={!!local.offRoomsLast}
                                onChange={(checked) => handleChange({ offRoomsLast: checked })}
                            />
                        </div>
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
