import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Save, Trash2, Plus, Search, Wind, Settings, Eye, EyeOff, Lock, Unlock, ChevronUp, ChevronDown, Zap } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { useHomey } from '../context/HomeyContext';
import { SETTINGS_WIDGET_TYPES } from '../constants';
import { hassAPI } from '../services/hass-api';
import { intercomCall } from '../services/intercom-call';
import { useIntercomCall } from '../hooks/useIntercomCall';
import HierarchyEditor from './HierarchyEditor';
import UniversalTileSettings from './UniversalTileSettings';
import MultiSensorSettings from './MultiSensorSettings';
import KeypadSettings from './KeypadSettings';
import MultiDeviceSettings from './MultiDeviceSettings';
import { CheckboxRow, ShowOptionsGroup } from './SettingsControls';
import { resolveTileDevice } from '../services/utils';

// Norske fallback-titler for capabilities uten egen title (typisk HA-composite).
// Følger CAP_TITLE_MAP-mønsteret fra HierarchyEditor.
const CAP_TITLE_MAP = {
    'thermostat_mode': 'Modus',
    'fan_mode': 'Viftehastighet',
    'swing_mode': 'Sving',
    'preset_mode': 'Preset',
    'measure_power': 'Effekt',
    'measure_temperature': 'Temperatur',
    'measure_humidity': 'Luftfuktighet',
    'meter_power': 'Energi totalt',
    'energy_daily': 'Energi i dag',
    'energy_monthly': 'Energi denne måneden',
    'thermostat_state': 'Status',
};

const getCapTitle = (capId, capObj) => capObj?.title || CAP_TITLE_MAP[capId] || capId;

const TileSettingsModal = ({ tile, onClose, onSave, onDelete }) => {
    const { devices, flows, api, settings } = useHomey();
    const isMultiLight = tile.type === 'multi-light';
    const isMultiThermostat = tile.type === 'multi-thermostat';
    const isMultiSensor = tile.type === 'multi-sensor';
    const isWidget = SETTINGS_WIDGET_TYPES.has(tile.type);

    // Single device logic
    const device = (!isMultiLight && !isMultiThermostat && !isMultiSensor && !isWidget) ? resolveTileDevice(devices, tile.deviceId, tile.settings?.fallbackEntityId) : null;

    const [size, setSize] = useState(tile.size || '1x1');
    const [customName, setCustomName] = useState(tile.name || (device ? device.name : ''));
    const [forcedType, setForcedType] = useState(tile.forcedType || '');

    // Multi-device specific state (Lights & Thermostats share this structure)
    const [multiDevices, setMultiDevices] = useState(tile.devices || []);
    const [orientation, setOrientation] = useState(tile.orientation || 'horizontal');
    const [expandedOrientation, setExpandedOrientation] = useState(tile.settings?.expandedOrientation || tile.orientation || 'horizontal');

    // Multi-sensor specific state
    const [multiItems, setMultiItems] = useState(tile.items || []);
    const [columns, setColumns] = useState(tile.columns || 'auto');

    // Single device specific state
    const [primaryCapability, setPrimaryCapability] = useState(tile.primaryCapability || '');
    const [selectedCapabilities, setSelectedCapabilities] = useState(() => {
        if (!tile.capabilities) return [];
        return tile.capabilities.map(c => typeof c === 'string' ? { id: c, title: '' } : c);
    });

    // Expanded view state (for thermostat mainly, but generic enough)
    const [expandedCapabilities, setExpandedCapabilities] = useState(() => {
        if (!tile.expandedCapabilities) return [];
        return tile.expandedCapabilities.map(c => typeof c === 'string' ? { id: c, title: '' } : c);
    });

    const [widgetSettings, setWidgetSettings] = useState(tile.settings || {});
    const [secondaryControls, setSecondaryControls] = useState(tile.settings?.secondaryControls || []);

    // UniversalTile specialized settings
    const [mainIcon, setMainIcon] = useState(tile.settings?.mainIcon || '');
    const [customIcon, setCustomIcon] = useState(tile.settings?.customIcon || '');
    // Initial load for compact setting and keypad migration
    useEffect(() => {
        const initialSettings = { ...(tile.settings || {}) };
        
        if (initialSettings.compact !== undefined || initialSettings.customNames !== undefined) {
            initialSettings.compact = initialSettings.compact;
            initialSettings.columns = initialSettings.columns;
            initialSettings.customNames = initialSettings.customNames;
            initialSettings.supportedModes = initialSettings.supportedModes || [];
        }

        // Migrate keypad legacy settings to actions array
        if (tile.type === 'keypad') {
            if (!initialSettings.actions && initialSettings.deviceId) {
                initialSettings.actions = [{
                    id: 'legacy-action',
                    label: tile.name || devices.find(d => d.id === initialSettings.deviceId)?.name || 'Handling',
                    deviceId: initialSettings.deviceId,
                    capabilityId: initialSettings.capabilityId,
                    value: initialSettings.successValue || 'true',
                    requirePin: true
                }];
                // Clean up legacy fields to avoid confusion later
                delete initialSettings.deviceId;
                delete initialSettings.capabilityId;
                delete initialSettings.successValue;
            } else if (!initialSettings.actions) {
                initialSettings.actions = [];
            }
        }
        
        setWidgetSettings(initialSettings);
    }, []);

    const [supportedModes, setSupportedModes] = useState(tile.settings?.supportedModes || []);

    // Intercom: liste over enheter som kan ringes (fra intercom_native)
    const { devices: intercomDevices } = useIntercomCall();
    useEffect(() => {
        if (tile.type === 'intercom') {
            intercomCall.init();      // idempotent
            intercomCall.loadDevices(); // refresh i tilfelle nye enheter siden init
        }
    }, [tile.type]);

    const getEffectiveType = () => {
        if (forcedType && forcedType !== 'auto') return forcedType;
        // Run capability-based overrides before trusting tile.type (mirrors Tile.jsx detection)
        if (device?.capabilities) {
            if (device.capabilities.includes('homey_water_heater') || device.settings?.compositeType === 'water_heater') return 'water-heater';
            if (device.capabilities.includes('smart_plug_appliance') || device.settings?.compositeType === 'appliance') return 'appliance';
            if (device.capabilities.includes('person_presence')) return 'presence';
            if (device.capabilities.includes('laundry') || device.settings?.compositeType === 'washer') return 'cleaning';
            if (device.capabilities.includes('homey_ev_charger') || device.settings?.compositeType === 'ev_charger') return 'ev-charger';
            if (device.capabilities.includes('posten_sensor') || device.settings?.compositeType === 'postal') return 'postal';
            if (device.capabilities.includes('homey_vacuum') || device.settings?.compositeType === 'vacuum') return 'vacuum';
            if (device.capabilities.includes('homey_lawn_mower') || device.settings?.compositeType === 'lawn_mower') return 'lawn-mower';
            if (device.capabilities.includes('homey_irrigation') || device.settings?.compositeType === 'irrigation') return 'irrigation';
            if (device.capabilities.includes('fan_speed')) return 'fan';
        }
        if (tile.type && tile.type !== 'auto') return tile.type;
        if (device) return api.getDeviceType(device);
        return 'unknown';
    };

    const effectiveType = getEffectiveType();

    // Graph Widget state
    const [insightLogs, setInsightLogs] = useState([]);
    const [graphSettings, setGraphSettings] = useState(tile.settings || { logs: [], range: 'last24Hours' });

    // Hierarchy State
    const [hierarchySettings, setHierarchySettings] = useState(tile.settings?.hierarchy || { name: 'Huset', children: [] });
    const [hierarchyUnit, setHierarchyUnit] = useState(tile.settings?.unit || '');
    const [activeTab, setActiveTab] = useState('general');
    const [expandedConfigDeviceId, setExpandedConfigDeviceId] = useState(null);
    const modalContentRef = React.useRef(null);
    useEffect(() => {
        if (modalContentRef.current) modalContentRef.current.scrollTop = 0;
    }, [activeTab]);

    // ── Dynamic tab definitions ─────────────────────────────────────────
    const getTabsForTile = () => {
        const base = [{ id: 'general', label: 'Generelt' }];
        const type = effectiveType || tile.type || '';

        if (type === 'keypad') {
            return [
                ...base,
                { id: 'actions',  label: 'Handlinger' },
                { id: 'pin',      label: 'PIN Kode'   },
                { id: 'behavior', label: 'Oppførsel'  },
            ];
        }
        if (isMultiLight) {
            return [
                ...base,
                { id: 'config',   label: 'Enheter'       },
                { id: 'layout',   label: 'Layout'        },
                { id: 'expanded', label: 'Utvidet (Stor)' },
            ];
        }
        if (isMultiThermostat) {
            return [
                ...base,
                { id: 'config',   label: 'Enheter'       },
                { id: 'layout',   label: 'Layout'        },
                { id: 'expanded', label: 'Utvidet (Stor)' },
            ];
        }
        if (isMultiSensor) {
            return [
                ...base,
                { id: 'config', label: 'Sensorer' },
            ];
        }
        if (type === 'vacuum') {
            return [
                ...base,
                { id: 'expanded', label: 'Utvidet (Stor)' },
            ];
        }
        if (type === 'lawn-mower') {
            return [
                ...base,
                { id: 'expanded', label: 'Utvidet (Stor)' },
            ];
        }
        if (type === 'irrigation') {
            return [
                ...base,
                { id: 'config',   label: 'Innstillinger'  },
                { id: 'expanded', label: 'Utvidet (Stor)' },
            ];
        }
        if (type === 'fan') {
            return [
                ...base,
                { id: 'expanded', label: 'Utvidet (Stor)' },
            ];
        }
        if (type === 'trash') {
            return [
                ...base,
                { id: 'expanded', label: 'Utvidet (Stor)' },
            ];
        }
        if (type === 'weather') {
            return [
                ...base,
                { id: 'config',   label: 'Innstillinger' },
                { id: 'expanded', label: 'Utvidet (Stor)' },
            ];
        }
        if (type === 'energy-dashboard') {
            return [
                ...base,
                { id: 'config', label: 'Enheter' },
                { id: 'power', label: 'Live Forbruk' },
            ];
        }
        // Single-device tiles that can expand
        if (['thermostat', 'light', 'switch', 'socket'].includes(type)) {
            return [
                ...base,
                { id: 'expanded', label: 'Utvidet (Stor)' },
            ];
        }
        if (type === 'cleaning') {
            return [
                ...base,
                { id: 'config',   label: 'Innstillinger'  },
                { id: 'expanded', label: 'Utvidet (Stor)'  },
            ];
        }
        if (type === 'water-heater') {
            return [
                ...base,
                { id: 'config',   label: 'Innstillinger'  },
                { id: 'expanded', label: 'Utvidet (Stor)'  },
            ];
        }
        if (type === 'ev-charger') {
            return [
                ...base,
                { id: 'config',   label: 'Innstillinger' },
                { id: 'expanded', label: 'Utvidet (Stor)' },
            ];
        }
        if (type === 'appliance') {
            return [
                ...base,
                { id: 'config',   label: 'Innstillinger' },
                { id: 'expanded', label: 'Utvidet (Stor)' },
            ];
        }
        if (type === 'presence') {
            return [
                ...base,
                { id: 'config', label: 'Innstillinger' },
            ];
        }
        if (type === 'postal') {
            return [
                ...base,
                { id: 'expanded', label: 'Utvidet (Stor)' },
            ];
        }
        if (type === 'sunshade') {
            return [
                ...base,
                { id: 'config', label: 'Innstillinger' },
            ];
        }
        // Tiles with settings but no expanded view
        if ([
            'flow', 'graph', 'hierarchy', 'clock',
            'video', 'web', 'app-launcher', 'door-control', 'header', 'intercom'
        ].includes(type)) {
            return [
                ...base,
                { id: 'config', label: 'Innstillinger' },
            ];
        }
        return base;
    };
    const tabs = getTabsForTile();


    const [logsError, setLogsError] = useState(null);
    const [logSearchTerm, setLogSearchTerm] = useState('');

    const formatLogLabel = (log) => api.formatLogLabel(log, devices);

    useEffect(() => {
        if (tile.type === 'graph') {
            const fetchLogs = async () => {
                try {
                    setLogsError(null);
                    const logs = await api.getInsightLogs();
                    if (!logs || (Array.isArray(logs) && logs.length === 0)) {
                        setLogsError('Ingen logger returnert fra API');
                    }
                    // Sort logs by name safely
                    logs.sort((a, b) => {
                        const nameA = a.label || a.name || a.id || '';
                        const nameB = b.label || b.name || b.id || '';
                        return nameA.localeCompare(nameB);
                    });
                    setInsightLogs(logs);
                } catch (err) {
                    console.error("Failed to load insight logs", err);
                    setLogsError(err.message || 'Feil ved lasting av logger');
                }
            };
            fetchLogs();
        }
    }, [tile.type]);

    if (!device && !isMultiLight && !isMultiThermostat && !isMultiSensor && !isWidget) return null;

    const handleSave = () => {
        const updatedTile = {
            ...tile,
            size,
            name: customName,
            forcedType: forcedType === 'auto' ? '' : forcedType,
            // For regular devices, deviceId is top-level. For widgets that point to a device (like ev-charger), we ideally want it top-level too so Tile.jsx finds 'device'.
            // But Tile.jsx looks at tile.deviceId.
            deviceId: widgetSettings.deviceId || tile.deviceId,
            settings: {
                ...tile.settings,
                ...widgetSettings,
                secondaryControls,
                mainIcon,
                customIcon,
            }
        };

        if (isMultiLight || isMultiThermostat) {
            updatedTile.devices = multiDevices;
            updatedTile.orientation = orientation;
            if (isMultiLight) {
                updatedTile.settings = {
                    ...tile.settings,
                    compact: widgetSettings.compact,
                    columns: widgetSettings.columns,
                    customNames: widgetSettings.customNames,
                    expandedOrientation: expandedOrientation
                };
            }
            if (isMultiThermostat) {
                updatedTile.settings = {
                    ...(updatedTile.settings || {}),
                    multiExpandedCapabilities: widgetSettings.multiExpandedCapabilities || tile.settings?.multiExpandedCapabilities || {},
                    customNames: widgetSettings.customNames
                }
            }
        } else if (isMultiSensor) {
            updatedTile.items = multiItems;
            updatedTile.columns = columns;
        } else if (isWidget) {
            // Widget settings
            const settingsToSave = { ...widgetSettings };
            if (tile.type === 'graph') {
                // Merge graph settings
                Object.assign(settingsToSave, graphSettings);
            }
            if (tile.type === 'hierarchy' || forcedType === 'hierarchy') {
                settingsToSave.hierarchy = hierarchySettings;
                settingsToSave.unit = hierarchyUnit;
            }
            updatedTile.settings = settingsToSave;
        } else {
            updatedTile.primaryCapability = primaryCapability;
            updatedTile.capabilities = selectedCapabilities;
            updatedTile.expandedCapabilities = expandedCapabilities;
            updatedTile.settings = { ...(updatedTile.settings || {}), supportedModes };
        }

        if (forcedType === 'hierarchy' || tile.type === 'hierarchy') {
            updatedTile.settings = {
                ...updatedTile.settings,
                hierarchy: hierarchySettings,
                unit: hierarchyUnit
            };
        }

        if (effectiveType === 'vacuum') {
            console.log('[VacuumSettings] Saving settings:', JSON.stringify(updatedTile.settings));
        }
        onSave(updatedTile);
        onClose();
    };

    const toggleExpandedCapability = (capId) => {
        if (expandedCapabilities.some(c => c.id === capId)) {
            setExpandedCapabilities(expandedCapabilities.filter(c => c.id !== capId));
        } else {
            setExpandedCapabilities([...expandedCapabilities, { id: capId, title: '' }]);
        }
    };

    const allCapabilities = device ? Object.entries(device.capabilitiesObj || {}).map(([id, obj]) => ({
        id,
        title: getCapTitle(id, obj),
        type: obj.type
    })) : [];

    // Filter out standard capabilities for specific types to avoid clutter
    const availableCapabilities = allCapabilities.filter(cap => {
        if (['light', 'switch', 'socket'].includes(effectiveType)) {
            // Hide onoff and dim as they are the main controls
            return !['onoff', 'dim'].includes(cap.id);
        }
        if (effectiveType === 'thermostat') {
            // We only hide target_temperature as it's always the main slider.
            // All other capabilities like fan_speed, fan_mode, thermostat_mode,
            // swing modes, etc. should be available for selection.
            return !['target_temperature'].includes(cap.id);
        }
        if (effectiveType === 'cleaning') {
            // Allow showing capabilities for cleaning tiles (like measure_power, alarm_contact etc)
            // But hide the laundry specific states if they are redundant with the main UI?
            // For now, let's just SHOW everything so the user can add 'measure_power' or others.
            return true;
        }
        return true;
    });


    return createPortal(
        <div className="modal">
            <div ref={modalContentRef} className="modal-content" style={{
                maxWidth: '500px',
                maxHeight: '90vh',
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                touchAction: 'pan-y',
                overscrollBehavior: 'contain'
            }}>
                <div className="modal-header">
                    <h2>{isMultiLight ? 'Konfigurer Multi Lysflis' : isMultiThermostat ? 'Konfigurer Multi Termostat' : isMultiSensor ? 'Konfigurer Multi Sensor' : isWidget ? 'Konfigurer Widget' : 'Innstillinger for flis'}</h2>
                    <button className="icon-btn close-modal" onClick={onClose}>
                        <X size={24} />
                    </button>
                </div>
                <div className="modal-tabs">
                    {tabs.map(tab => (
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
                    {/* ── Strøm & kostnad: Live Forbruk ─────────────── */}
                    {activeTab === 'power' && (() => {
                        const pwrDevices = widgetSettings?.devices || [];
                        const devicePowerEntities = widgetSettings?.devicePowerEntities || {};
                        const allEntities = hassAPI?.entities || {};
                        const wEntities = Object.entries(allEntities)
                            .filter(function(kv) { var e = kv[1]; return e && e.attributes && e.attributes.unit_of_measurement === 'W'; })
                            .map(function(kv) { return { eid: kv[0], name: String((kv[1].attributes && kv[1].attributes.friendly_name) || kv[0]) }; })
                            .sort(function(a, b) { return a.name.localeCompare(b.name); });
                        const BAR_COLORS = ['#f97316','#3b82f6','#22c55e','#a855f7','#ec4899','#06b6d4','#eab308','#ef4444'];
                        if (pwrDevices.length === 0) {
                            return (
                                <div style={{ padding: '32px 16px', textAlign: 'center' }}>
                                    <p style={{ fontSize: '0.85rem', color: 'var(--color-text-primary)', fontWeight: 600, margin: 0 }}>Ingen enheter konfigurert</p>
                                    <p style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', margin: '8px 0 0' }}>Legg til enheter under «Enheter»-fanen.</p>
                                </div>
                            );
                        }
                        return (
                            <div>
                                <div className="form-group">
                                    <label>Effektentitet per enhet (W)</label>
                                    <p style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: 4, marginBottom: 10 }}>
                                        Velg en HA-entitet som måler øyeblikkelig effekt (W) for hver enhet. Vises i detaljert visning.
                                    </p>
                                    {wEntities.length === 0 && (
                                        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>Ingen W-entiteter funnet i Home Assistant.</p>
                                    )}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        {pwrDevices.map(function(dev, idx) {
                                            return (
                                                <div key={dev.prefix || idx}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                        <span style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: BAR_COLORS[idx % BAR_COLORS.length] }} />
                                                        <span style={{ fontSize: '0.8rem', fontWeight: 500 }}>{dev.name}</span>
                                                    </div>
                                                    <select
                                                        value={devicePowerEntities[dev.prefix] || ''}
                                                        onChange={function(e) {
                                                            var val = e.target.value;
                                                            var updated = Object.assign({}, devicePowerEntities);
                                                            if (val) { updated[dev.prefix] = val; } else { delete updated[dev.prefix]; }
                                                            setWidgetSettings(function(prev) { return Object.assign({}, prev, { devicePowerEntities: updated }); });
                                                        }}
                                                        style={{ width: '100%', padding: '7px 8px', background: 'var(--color-bg-secondary)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)', fontSize: '0.78rem' }}
                                                    >
                                                        <option value="">– Ingen / ikke vis –</option>
                                                        {wEntities.map(function(item) { return <option key={item.eid} value={item.eid}>{item.name} — {item.eid}</option>; })}
                                                    </select>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        );
                    })()}
                    {/* ── Generelt ─────────────────────────────────── */}
                    {activeTab === 'general' && (
                        <UniversalTileSettings
                            device={device}
                            originalTile={tile}
                            values={{
                                size,
                                customName,
                                forcedType,
                                mainIcon,
                                customIcon,
                            }}
                            onChange={(key, val) => {
                                if (key === 'size') setSize(val);
                                if (key === 'customName') setCustomName(val);
                                if (key === 'forcedType') setForcedType(val);
                                if (key === 'mainIcon') setMainIcon(val);
                                if (key === 'customIcon') setCustomIcon(val);
                            }}
                        />
                    )}

                    {/* ── Keypad: Handlinger ────────────────────────── */}
                    {activeTab === 'actions' && tile.type === 'keypad' && (
                        <KeypadSettings
                            devices={devices}
                            settings={widgetSettings}
                            activeTab="actions"
                            onChange={(updated) => setWidgetSettings(prev => ({ ...prev, ...updated }))}
                        />
                    )}

                    {/* ── Keypad: PIN Kode ──────────────────────────── */}
                    {activeTab === 'pin' && tile.type === 'keypad' && (
                        <KeypadSettings
                            devices={devices}
                            settings={widgetSettings}
                            activeTab="pin"
                            onChange={(updated) => setWidgetSettings(prev => ({ ...prev, ...updated }))}
                        />
                    )}

                    {/* ── Keypad: Oppførsel ─────────────────────────── */}
                    {activeTab === 'behavior' && tile.type === 'keypad' && (
                        <KeypadSettings
                            devices={devices}
                            settings={widgetSettings}
                            activeTab="behavior"
                            onChange={(updated) => setWidgetSettings(prev => ({ ...prev, ...updated }))}
                        />
                    )}

                    {/* ── Innstillinger / Enheter / Sensorer ───────── */}
                    {activeTab === 'config' && (
                        <>

                    {/* Multi-Device Selection (Lights & Thermostats) */}
                    {isMultiLight && (
                        <MultiDeviceSettings
                            deviceFilter={(d) => d.class === 'light' || d.virtualClass === 'light' || d.capabilities?.includes('onoff')}
                            listLabel="Valgte enheter"
                            devices={devices}
                            multiDevices={multiDevices}
                            settings={widgetSettings}
                            onChange={({ multiDevices: updatedMultiDevices, settings: updatedSettings }) => {
                                if (updatedMultiDevices !== undefined) setMultiDevices(updatedMultiDevices);
                                if (updatedSettings !== undefined) setWidgetSettings(prev => ({ ...prev, ...updatedSettings }));
                            }}
                        />
                    )}

                    {isMultiThermostat && (
                        <MultiDeviceSettings
                            deviceFilter={(d) => d.capabilities?.includes('target_temperature')}
                            listLabel="Valgte termostater"
                            devices={devices}
                            multiDevices={multiDevices}
                            settings={widgetSettings}
                            onChange={({ multiDevices: updatedMultiDevices, settings: updatedSettings }) => {
                                if (updatedMultiDevices !== undefined) setMultiDevices(updatedMultiDevices);
                                if (updatedSettings !== undefined) setWidgetSettings(prev => ({ ...prev, ...updatedSettings }));
                            }}
                        />
                    )}

                    {isMultiSensor && (
                        <MultiSensorSettings
                            devices={devices}
                            items={multiItems}
                            columns={columns}
                            onChange={({ items, columns: cols }) => {
                                setMultiItems(items);
                                setColumns(cols);
                            }}
                        />
                    )}

                    {isWidget && (
                        <>
                            {tile.type === 'clock' && (
                                <div className="form-group">
                                    <label>Design</label>
                                    <select
                                        value={widgetSettings.design || 'digital'}
                                        onChange={(e) => setWidgetSettings({ ...widgetSettings, design: e.target.value })}
                                        style={{
                                            width: '100%',
                                            padding: '8px',
                                            background: 'var(--color-bg-secondary)',
                                            border: '1px solid var(--color-border)',
                                            borderRadius: 'var(--radius-md)',
                                            color: 'var(--color-text-primary)'
                                        }}
                                    >
                                        <option value="digital">Digital</option>
                                        <option value="analog">Analog</option>
                                    </select>
                                    <div style={{ marginTop: '10px' }}>
                                        <CheckboxRow
                                            label="Vis sekunder (kun digital)"
                                            checked={widgetSettings.showSeconds !== false}
                                            onChange={(checked) => setWidgetSettings({ ...widgetSettings, showSeconds: checked })}
                                        />
                                    </div>
                                </div>
                            )}

                            {tile.type === 'door-control' && (
                                <div className="form-group">
                                    <label>Dørlås (Hovedenhet)</label>
                                    <select
                                        value={widgetSettings.deviceId || ''}
                                        onChange={(e) => setWidgetSettings({ ...widgetSettings, deviceId: e.target.value })}
                                        style={{
                                            width: '100%',
                                            padding: '8px',
                                            background: 'var(--color-bg-secondary)',
                                            border: '1px solid var(--color-border)',
                                            borderRadius: 'var(--radius-md)',
                                            color: 'var(--color-text-primary)',
                                            marginBottom: '10px'
                                        }}
                                    >
                                        <option value="">Velg dørlås...</option>
                                        {devices.filter(d => d.class === 'lock' || d.capabilities.includes('locked')).map(d => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>

                                    <label>Ringeklokke Sensor (Virtuell)</label>
                                    <select
                                        value={widgetSettings.doorbellDeviceId || ''}
                                        onChange={(e) => setWidgetSettings({ ...widgetSettings, doorbellDeviceId: e.target.value })}
                                        style={{
                                            width: '100%',
                                            padding: '8px',
                                            background: 'var(--color-bg-secondary)',
                                            border: '1px solid var(--color-border)',
                                            borderRadius: 'var(--radius-md)',
                                            color: 'var(--color-text-primary)'
                                        }}
                                    >
                                        <option value="">Velg sensor (valgfritt)...</option>
                                        {devices.filter(d => d.class === 'sensor' || d.class === 'other' || d.virtualClass === 'sensor' || d.capabilities.includes('alarm_contact') || d.capabilities.includes('alarm_motion') || d.capabilities.includes('onoff')).map(d => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                                        Velg en sensor/enhet som aktiveres (alarm/on) når det ringer på.
                                    </p>
                                </div>
                            )}

                            {tile.type === 'hierarchy' && (
                                <div className="form-group">
                                    <label>Hierarki Oppsett</label>
                                    <div style={{ padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', marginBottom: '10px' }}>
                                        <HierarchyEditor
                                            hierarchy={hierarchySettings}
                                            onChange={setHierarchySettings}
                                            devices={devices}
                                            theme={widgetSettings.theme}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Enhet for visning</label>
                                        <input
                                            type="text"
                                            value={hierarchyUnit}
                                            onChange={e => setHierarchyUnit(e.target.value)}
                                            placeholder="f.eks W, kr, °C"
                                            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)', color: 'white' }}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Tema</label>
                                        <select
                                            value={widgetSettings.theme || 'default'}
                                            onChange={(e) => setWidgetSettings({ ...widgetSettings, theme: e.target.value })}
                                            style={{
                                                width: '100%',
                                                padding: '8px',
                                                background: 'var(--color-bg-secondary)',
                                                border: '1px solid var(--color-border)',
                                                borderRadius: 'var(--radius-md)',
                                                color: 'var(--color-text-primary)'
                                            }}
                                        >
                                            <option value="default">Standard (mørk)</option>
                                            <option value="power">Strøm / Effekt (Blå/Cyan)</option>
                                            <option value="money">Penger / Kostnad (Grønn/Gull)</option>
                                        </select>
                                    </div>

                                    <div className="form-group">
                                        <label>Desimaler</label>
                                        <select
                                            value={widgetSettings.decimals ?? 0}
                                            onChange={(e) => setWidgetSettings({ ...widgetSettings, decimals: Number(e.target.value) })}
                                            style={{
                                                width: '100%',
                                                padding: '8px',
                                                background: 'var(--color-bg-secondary)',
                                                border: '1px solid var(--color-border)',
                                                borderRadius: 'var(--radius-md)',
                                                color: 'var(--color-text-primary)'
                                            }}
                                        >
                                            <option value={0}>0 (eks. 1 500)</option>
                                            <option value={1}>1 (eks. 1,5)</option>
                                            <option value={2}>2 (eks. 1,50)</option>
                                        </select>
                                    </div>

                                    <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        <label>Visningsalternativer</label>
                                        {[
                                            { key: 'autoPrefix', label: 'Auto-prefix (1500 W → 1,5 kW)', defaultVal: false },
                                            { key: 'showPercentage', label: 'Vis %-andel per gruppe i utvidet visning', defaultVal: false },
                                            { key: 'sortByValue', label: 'Sorter grupper etter verdi (høyest øverst)', defaultVal: false },
                                            { key: 'hideZero', label: 'Skjul grupper med verdi = 0', defaultVal: false },
                                        ].map(({ key, label, defaultVal }) => (
                                            <CheckboxRow
                                                key={key}
                                                label={label}
                                                checked={widgetSettings[key] !== undefined ? widgetSettings[key] : defaultVal}
                                                onChange={(checked) => setWidgetSettings({ ...widgetSettings, [key]: checked })}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {tile.type === 'weather' && (
                                <div className="form-group">
                                    <label>Sted (By eller område)</label>
                                    <input
                                        type="text"
                                        value={widgetSettings.location || ''}
                                        onChange={(e) => setWidgetSettings({ ...widgetSettings, location: e.target.value })}
                                        placeholder="F.eks. Oslo"
                                        style={{
                                            width: '100%',
                                            padding: '8px',
                                            background: 'var(--color-bg-secondary)',
                                            border: '1px solid var(--color-border)',
                                            borderRadius: 'var(--radius-md)',
                                            color: 'var(--color-text-primary)'
                                        }}
                                    />
                                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                                        Søker automatisk etter sted når du lagrer.
                                    </p>
                                </div>
                            )}

                            {tile.type === 'video' && (
                                <>
                                    <div className="form-group">
                                        <label>Kilde</label>
                                        <select
                                            value={widgetSettings.sourceType || 'direct'}
                                            onChange={(e) => setWidgetSettings({ ...widgetSettings, sourceType: e.target.value })}
                                            style={{
                                                width: '100%',
                                                padding: '8px',
                                                background: 'var(--color-bg-secondary)',
                                                border: '1px solid var(--color-border)',
                                                borderRadius: 'var(--radius-md)',
                                                color: 'var(--color-text-primary)',
                                                marginBottom: '10px'
                                            }}
                                        >
                                            <option value="direct">Direkte URL</option>
                                            <option value="frigate">Frigate NVR</option>
                                        </select>
                                    </div>

                                    {widgetSettings.sourceType === 'frigate' ? (
                                        <>
                                            <div className="form-group">
                                                <label>Frigate Host (m/ port)</label>
                                                <input
                                                    type="text"
                                                    value={widgetSettings.frigateHost || ''}
                                                    onChange={(e) => setWidgetSettings({ ...widgetSettings, frigateHost: e.target.value })}
                                                    placeholder="http://192.168.1.xxx:5000"
                                                    style={{
                                                        width: '100%',
                                                        padding: '8px',
                                                        background: 'var(--color-bg-secondary)',
                                                        border: '1px solid var(--color-border)',
                                                        borderRadius: 'var(--radius-md)',
                                                        color: 'var(--color-text-primary)'
                                                    }}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label>Kameranavn (i Frigate)</label>
                                                <input
                                                    type="text"
                                                    value={widgetSettings.cameraName || ''}
                                                    onChange={(e) => setWidgetSettings({ ...widgetSettings, cameraName: e.target.value })}
                                                    placeholder="f.eks. utestue"
                                                    style={{
                                                        width: '100%',
                                                        padding: '8px',
                                                        background: 'var(--color-bg-secondary)',
                                                        border: '1px solid var(--color-border)',
                                                        borderRadius: 'var(--radius-md)',
                                                        color: 'var(--color-text-primary)'
                                                    }}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label>Protokoll</label>
                                                <select
                                                    value={widgetSettings.frigateProtocol || 'webrtc'}
                                                    onChange={(e) => setWidgetSettings({ ...widgetSettings, frigateProtocol: e.target.value })}
                                                    style={{
                                                        width: '100%',
                                                        padding: '8px',
                                                        background: 'var(--color-bg-secondary)',
                                                        border: '1px solid var(--color-border)',
                                                        borderRadius: 'var(--radius-md)',
                                                        color: 'var(--color-text-primary)'
                                                    }}
                                                >
                                                    <option value="webrtc">WebRTC (Standard)</option>
                                                    <option value="go2rtc">Go2RTC Minimal (/webrtc)</option>
                                                    <option value="go2rtc_mse">Go2RTC Stream (MSE)</option>
                                                    <option value="mse">MSE (Stabil, TCP)</option>
                                                    <option value="mjpeg">MJPEG (Kompatibel, lavere FPS)</option>
                                                </select>
                                            </div>
                                            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                                                Prøv MSE eller MJPEG hvis WebRTC ikke laster (svart skjerm).
                                            </p>
                                        </>
                                    ) : (
                                        <div className="form-group">
                                            <label>Strøm URL (go2rtc / mjpeg)</label>
                                            <input
                                                type="text"
                                                value={widgetSettings.streamUrl || ''}
                                                onChange={(e) => setWidgetSettings({ ...widgetSettings, streamUrl: e.target.value })}
                                                placeholder="http://<ip>:1984/stream.html?src=<camera>"
                                                style={{
                                                    width: '100%',
                                                    padding: '8px',
                                                    background: 'var(--color-bg-secondary)',
                                                    border: '1px solid var(--color-border)',
                                                    borderRadius: 'var(--radius-md)',
                                                    color: 'var(--color-text-primary)'
                                                }}
                                            />
                                            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                                                Full URL til videostrømmen.
                                            </p>
                                        </div>
                                    )}
                                </>
                            )}

                            {tile.type === 'web' && (
                                <>
                                    <div className="form-group">
                                        <label>Widget Modus</label>
                                        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                                            <button
                                                className={`btn btn-secondary ${widgetSettings.mode !== 'embed' ? 'active' : ''}`}
                                                onClick={() => setWidgetSettings({ ...widgetSettings, mode: 'url' })}
                                                style={{ flex: 1, borderColor: widgetSettings.mode !== 'embed' ? 'var(--color-accent-primary)' : '' }}
                                            >
                                                Nettadresse (URL)
                                            </button>
                                            <button
                                                className={`btn btn-secondary ${widgetSettings.mode === 'embed' ? 'active' : ''}`}
                                                onClick={() => setWidgetSettings({ ...widgetSettings, mode: 'embed' })}
                                                style={{ flex: 1, borderColor: widgetSettings.mode === 'embed' ? 'var(--color-accent-primary)' : '' }}
                                            >
                                                Egen Kode
                                            </button>
                                        </div>
                                    </div>

                                    {widgetSettings.mode === 'embed' ? (
                                        <div className="form-group">
                                            <label>HTML Embed Kode</label>
                                            <textarea
                                                value={widgetSettings.embedCode || ''}
                                                onChange={(e) => setWidgetSettings({ ...widgetSettings, embedCode: e.target.value })}
                                                placeholder="<iframe src='...' style='...'></iframe>"
                                                rows={5}
                                                style={{
                                                    width: '100%',
                                                    padding: '10px',
                                                    background: 'var(--color-bg-secondary)',
                                                    border: '1px solid var(--color-border)',
                                                    borderRadius: 'var(--radius-md)',
                                                    color: 'var(--color-text-primary)',
                                                    fontFamily: 'monospace',
                                                    fontSize: '0.85rem',
                                                    resize: 'vertical'
                                                }}
                                            />
                                            <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                                                Lim inn HTML, scripts eller iframe-kode. Advarsel: Kjøres direkte i nettleseren.
                                            </p>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="form-group">
                                                <label>Nettadresse (URL)</label>
                                                <input
                                                    type="text"
                                                    value={widgetSettings.url || ''}
                                                    onChange={(e) => setWidgetSettings({ ...widgetSettings, url: e.target.value })}
                                                    placeholder="https://example.com"
                                                    style={{
                                                        width: '100%',
                                                        padding: '8px',
                                                        background: 'var(--color-bg-secondary)',
                                                        border: '1px solid var(--color-border)',
                                                        borderRadius: 'var(--radius-md)',
                                                        color: 'var(--color-text-primary)'
                                                    }}
                                                />
                                            </div>

                                            <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                                                <CheckboxRow
                                                    label="Desktop Mode (Skalering)"
                                                    checked={!!widgetSettings.desktopMode}
                                                    onChange={(checked) => setWidgetSettings({ ...widgetSettings, desktopMode: checked })}
                                                />

                                                {widgetSettings.desktopMode && (
                                                    <div style={{ marginLeft: '24px' }}>
                                                        <label style={{ fontSize: '0.85rem' }}>Virtuell Bredde (px)</label>
                                                        <input
                                                            type="number"
                                                            min="300"
                                                            max="3840"
                                                            step="10"
                                                            value={widgetSettings.viewportWidth || 1280}
                                                            onChange={(e) => setWidgetSettings({ ...widgetSettings, viewportWidth: parseInt(e.target.value) || 1280 })}
                                                            style={{
                                                                width: '100%',
                                                                padding: '6px',
                                                                background: 'var(--color-bg-primary)',
                                                                border: '1px solid var(--color-border)',
                                                                borderRadius: '4px',
                                                                color: 'var(--color-text-primary)'
                                                            }}
                                                        />
                                                        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', margin: '4px 0 0 0' }}>
                                                            Angi hvor mange piksler nettsiden skal tro den har. Høyere verdi = mer plass (mindre tekst).
                                                        </p>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="form-group">
                                                <label>Oppdatering (minutter)</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={widgetSettings.refreshInterval || 0}
                                                    onChange={(e) => setWidgetSettings({ ...widgetSettings, refreshInterval: parseInt(e.target.value) || 0 })}
                                                    style={{
                                                        width: '100%',
                                                        padding: '8px',
                                                        background: 'var(--color-bg-secondary)',
                                                        border: '1px solid var(--color-border)',
                                                        borderRadius: 'var(--radius-md)',
                                                        color: 'var(--color-text-primary)'
                                                    }}
                                                />
                                                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                                                    0 = ingen automatisk oppdatering.
                                                </p>
                                            </div>
                                        </>
                                    )}
                                </>
                            )}


                            {tile.type === 'header' && (
                                <>
                                    <div className="form-group">
                                        <label>Tittel</label>
                                        <input
                                            type="text"
                                            value={widgetSettings.title || customName || ''}
                                            onChange={(e) => {
                                                setWidgetSettings({ ...widgetSettings, title: e.target.value });
                                                setCustomName(e.target.value);
                                            }}
                                            placeholder="Overskrift..."
                                            style={{
                                                width: '100%',
                                                padding: '8px',
                                                background: 'var(--color-bg-secondary)',
                                                border: '1px solid var(--color-border)',
                                                borderRadius: 'var(--radius-md)',
                                                color: 'var(--color-text-primary)'
                                            }}
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label>Undertittel (valgfritt)</label>
                                        <input
                                            type="text"
                                            value={widgetSettings.subtitle || ''}
                                            onChange={(e) => setWidgetSettings({ ...widgetSettings, subtitle: e.target.value })}
                                            placeholder="f.eks. 'Stue & Kjøkken'"
                                            style={{
                                                width: '100%',
                                                padding: '8px',
                                                background: 'var(--color-bg-secondary)',
                                                border: '1px solid var(--color-border)',
                                                borderRadius: 'var(--radius-md)',
                                                color: 'var(--color-text-primary)'
                                            }}
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label>Naviger til side</label>
                                        <select
                                            value={widgetSettings.targetPageId || ''}
                                            onChange={(e) => setWidgetSettings({ ...widgetSettings, targetPageId: e.target.value })}
                                            style={{
                                                width: '100%',
                                                padding: '8px',
                                                background: 'var(--color-bg-secondary)',
                                                border: '1px solid var(--color-border)',
                                                borderRadius: 'var(--radius-md)',
                                                color: 'var(--color-text-primary)'
                                            }}
                                        >
                                            <option value="">Ingen (Kun visning)</option>
                                            {(useHomey().pages || []).map(page => (
                                                <option key={page.id} value={page.id}>
                                                    {page.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="form-group">
                                        <label>Tema / Stil</label>
                                        <select
                                            value={widgetSettings.theme || 'general'}
                                            onChange={(e) => setWidgetSettings({ ...widgetSettings, theme: e.target.value })}
                                            style={{
                                                width: '100%',
                                                padding: '8px',
                                                background: 'var(--color-bg-secondary)',
                                                border: '1px solid var(--color-border)',
                                                borderRadius: 'var(--radius-md)',
                                                color: 'var(--color-text-primary)'
                                            }}
                                        >
                                            <option value="general">Generelt (Blå)</option>
                                            <option value="climate">Klima / Vær (Cyan)</option>
                                            <option value="lights">Lys / Varme (Gul/Oransje)</option>
                                            <option value="energy">Energi / Strøm (Grønn/Blå)</option>
                                            <option value="security">Sikkerhet / Alarm (Rød)</option>
                                            <option value="media">Multimedia / Musikk (Lilla)</option>
                                        </select>
                                    </div>

                                    <div className="form-group">
                                        <label>Ikon (Lucide navn, valgfritt)</label>
                                        <input
                                            type="text"
                                            value={widgetSettings.icon || ''}
                                            onChange={(e) => setWidgetSettings({ ...widgetSettings, icon: e.target.value })}
                                            placeholder="F.eks. Home, Sun, Zap..."
                                            style={{
                                                width: '100%',
                                                padding: '8px',
                                                background: 'var(--color-bg-secondary)',
                                                border: '1px solid var(--color-border)',
                                                borderRadius: 'var(--radius-md)',
                                                color: 'var(--color-text-primary)'
                                            }}
                                        />
                                        <div style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '4px' }}>
                                            La stå tomt for å bruke standard ikon for temaet.
                                        </div>
                                    </div>
                                </>
                            )}

                            {tile.type === 'app-launcher' && (
                                <>
                                    <div className="form-group">
                                        <label>App URL / URI Scheme</label>
                                        <input
                                            type="text"
                                            value={widgetSettings.url || ''}
                                            onChange={(e) => setWidgetSettings({ ...widgetSettings, url: e.target.value })}
                                            placeholder="f.eks. spotify:// eller https://google.com"
                                            style={{
                                                width: '100%',
                                                padding: '8px',
                                                background: 'var(--color-bg-secondary)',
                                                border: '1px solid var(--color-border)',
                                                borderRadius: 'var(--radius-md)',
                                                color: 'var(--color-text-primary)'
                                            }}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label>Ikon Bilde URL (valgfri)</label>
                                        <input
                                            type="text"
                                            value={widgetSettings.iconImage || ''}
                                            onChange={(e) => setWidgetSettings({ ...widgetSettings, iconImage: e.target.value })}
                                            placeholder="https://eksempel.com/ikon.png"
                                            style={{
                                                width: '100%',
                                                padding: '8px',
                                                background: 'var(--color-bg-secondary)',
                                                border: '1px solid var(--color-border)',
                                                borderRadius: 'var(--radius-md)',
                                                color: 'var(--color-text-primary)'
                                            }}
                                        />
                                        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                                            Overstyrer valgt ikon hvis fylt ut.
                                        </p>
                                    </div>
                                    <div className="form-group">
                                        <label>Ikon (Lucide icon name)</label>
                                        <select
                                            value={widgetSettings.icon || 'AppWindow'}
                                            onChange={(e) => setWidgetSettings({ ...widgetSettings, icon: e.target.value })}
                                            style={{
                                                width: '100%',
                                                padding: '8px',
                                                background: 'var(--color-bg-secondary)',
                                                border: '1px solid var(--color-border)',
                                                borderRadius: 'var(--radius-md)',
                                                color: 'var(--color-text-primary)'
                                            }}
                                        >
                                            <option value="AppWindow">AppWindow (Standard)</option>
                                            <option value="Music">Music (Spotify)</option>
                                            <option value="PlayCircle">Play (Netflix/YouTube)</option>
                                            <option value="Youtube">Youtube</option> {/* Lucide might not have this, check? Assuming generic play */}
                                            <option value="Home">Home (Homey/Hus)</option>
                                            <option value="Globe">Globe (Nettleser)</option>
                                            <option value="Map">Map (Kart)</option>
                                            <option value="Mail">Mail (E-post)</option>
                                            <option value="Calendar">Calendar (Kalender)</option>
                                            <option value="Gamepad2">Gamepad (Spill)</option>
                                            <option value="MessageCircle">Message (Chat)</option>
                                            <option value="Camera">Camera (Kamera)</option>
                                            <option value="Newspaper">Newspaper (Avis)</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Farge</label>
                                        <select
                                            value={widgetSettings.color || 'var(--color-primary)'}
                                            onChange={(e) => setWidgetSettings({ ...widgetSettings, color: e.target.value })}
                                            style={{
                                                width: '100%',
                                                padding: '8px',
                                                background: 'var(--color-bg-secondary)',
                                                border: '1px solid var(--color-border)',
                                                borderRadius: 'var(--radius-md)',
                                                color: 'var(--color-text-primary)'
                                            }}
                                        >
                                            <option value="var(--color-primary)">Standard (Blå)</option>
                                            <option value="#1DB954">Spotify Grønn</option>
                                            <option value="#E50914">Netflix Rød</option>
                                            <option value="#FF0000">YouTube Rød</option>
                                            <option value="#4285F4">Google Blå</option>
                                            <option value="#ffab40">Oransje</option>
                                            <option value="#ff5252">Rød</option>
                                            <option value="#69f0ae">Grønn</option>
                                        </select>
                                    </div>
                                </>
                            )}

                            {tile.type === 'flow' && (
                                <>
                                    <div className="form-group">
                                        <label>Velg Flow / Scene</label>
                                        <select
                                            value={widgetSettings.flowId || ''}
                                            onChange={(e) => {
                                                const selectedFlow = flows.find(f => f.id === e.target.value);
                                                setWidgetSettings({
                                                    ...widgetSettings,
                                                    flowId: e.target.value,
                                                    label: selectedFlow ? selectedFlow.name : widgetSettings.label
                                                });
                                            }}
                                            style={{
                                                width: '100%',
                                                padding: '8px',
                                                background: 'var(--color-bg-secondary)',
                                                border: '1px solid var(--color-border)',
                                                borderRadius: 'var(--radius-md)',
                                                color: 'var(--color-text-primary)'
                                            }}
                                        >
                                            <option value="">-- Velg en flow --</option>
                                            {flows.map(f => (
                                                <option key={f.id} value={f.id}>{f.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="form-group">
                                        <label>Etikett (På knappen)</label>
                                        <input
                                            type="text"
                                            value={widgetSettings.label || ''}
                                            onChange={(e) => setWidgetSettings({ ...widgetSettings, label: e.target.value })}
                                            placeholder="F.eks. God Natt"
                                            style={{
                                                width: '100%',
                                                padding: '8px',
                                                background: 'var(--color-bg-secondary)',
                                                border: '1px solid var(--color-border)',
                                                borderRadius: 'var(--radius-md)',
                                                color: 'var(--color-text-primary)'
                                            }}
                                        />
                                    </div>

                                    <div className="form-group">
                                        <label>Farge</label>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                                            {['blue', 'red', 'green', 'purple', 'orange', 'teal', 'pink', 'indigo', 'gray'].map(color => (
                                                <button
                                                    key={color}
                                                    onClick={() => setWidgetSettings({ ...widgetSettings, color })}
                                                    style={{
                                                        height: '32px',
                                                        borderRadius: '6px',
                                                        border: widgetSettings.color === color ? '2px solid white' : 'none',
                                                        background: `var(--color-${color}-500, ${color})`,
                                                        backgroundImage: `linear-gradient(135deg, ${color}, dark${color})`,
                                                        cursor: 'pointer'
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    <div className="form-group">
                                        <label>Ikon</label>
                                        <select
                                            value={widgetSettings.icon || 'Play'}
                                            onChange={(e) => setWidgetSettings({ ...widgetSettings, icon: e.target.value })}
                                            style={{
                                                width: '100%',
                                                padding: '8px',
                                                background: 'var(--color-bg-secondary)',
                                                border: '1px solid var(--color-border)',
                                                borderRadius: 'var(--radius-md)',
                                                color: 'var(--color-text-primary)'
                                            }}
                                        >
                                            <option value="Play">Play (Standard)</option>
                                            <option value="Moon">Moon (Natt)</option>
                                            <option value="Sun">Sun (Dag)</option>
                                            <option value="Coffee">Coffee (Morgen)</option>
                                            <option value="Tv">Tv (Film)</option>
                                            <option value="Music">Music (Musikk)</option>
                                            <option value="Zap">Zap (Strøm)</option>
                                            <option value="Home">Home (Hjemme)</option>
                                            <option value="LogOut">LogOut (Borte)</option>
                                            <option value="Lock">Lock (Lås)</option>
                                            <option value="Unlock">Unlock (Lås opp)</option>
                                            <option value="Power">Power (Av/På)</option>
                                            <option value="Trash2">Trash (Søppel)</option>
                                            <option value="Sparkles">Sparkles (Vask/Fest)</option>
                                        </select>
                                    </div>
                                </>
                            )}

                            {tile.type === 'ev-charger' && !tile.deviceId?.startsWith('composite:') && (
                                <div className="form-group">
                                    <label>Velg Lader (Enhet)</label>
                                    <select
                                        value={widgetSettings.deviceId || ''}
                                        onChange={(e) => setWidgetSettings({ ...widgetSettings, deviceId: e.target.value })}
                                        className="select-input"
                                        style={{ marginBottom: '1rem' }}
                                    >
                                        <option value="">-- Velg enhet --</option>
                                        {devices
                                            .filter(d =>
                                                d.capabilities.includes('measure_power') ||
                                                d.capabilities.includes('charging_button') ||
                                                d.capabilities.some(c => c.includes('charge')) ||
                                                d.capabilities.some(c => c.includes('measure_current'))
                                            )
                                            .map(d => (
                                                <option key={d.id} value={d.id}>{d.name}</option>
                                            ))
                                        }
                                    </select>

                                    <label>Velg 'Tilgjengelig Strøm' (Valgfritt)</label>
                                    <select
                                        value={widgetSettings.currentLimitCapability || ''}
                                        onChange={(e) => setWidgetSettings({ ...widgetSettings, currentLimitCapability: e.target.value })}
                                        className="select-input"
                                    >
                                        <option value="">-- Ingen / Skjul --</option>
                                        {(() => {
                                            const selectedDevice = devices.find(d => d.id === (widgetSettings.deviceId || tile.deviceId));
                                            if (!selectedDevice) return null;

                                            return selectedDevice.capabilities
                                                .filter(c => !c.startsWith('alarm_') && !c.startsWith('button'))
                                                .map(c => (
                                                    <option key={c} value={c}>{selectedDevice.capabilitiesObj?.[c]?.title || c}</option>
                                                ));
                                        })()}
                                    </select>
                                    <p className="hint">Velg verdien som viser maks ladestrøm (f.eks. current_limit).</p>

                                    <label>Flow for 'Start Lading' (Valgfritt)</label>
                                    <select
                                        value={widgetSettings.startChargingFlowId || ''}
                                        onChange={(e) => setWidgetSettings({ ...widgetSettings, startChargingFlowId: e.target.value })}
                                        className="select-input"
                                    >
                                        <option value="">-- Ingen / Bruk standard --</option>
                                        {flows.map(flow => (
                                            <option key={flow.id} value={flow.id}>{flow.name}</option>
                                        ))}
                                    </select>
                                    <p className="hint">Kjør denne flowen når du trykker 'Start' (istedet for standard API-kall).</p>
                                </div>
                            )}

                            {tile.type === 'graph' && (
                                <>
                                    <div className="form-group">
                                        <label>Velg datakilder (Loggr)</label>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', padding: '0 4px' }}>
                                            <Search size={16} style={{ color: 'var(--color-text-secondary)' }} />
                                            <input
                                                type="text"
                                                placeholder="Søk i logger..."
                                                value={logSearchTerm}
                                                onChange={e => setLogSearchTerm(e.target.value)}
                                                style={{
                                                    flex: 1,
                                                    background: 'transparent',
                                                    border: 'none',
                                                    borderBottom: '1px solid var(--color-border)',
                                                    padding: '4px',
                                                    color: 'var(--color-text-primary)'
                                                }}
                                            />
                                        </div>

                                        <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', padding: '0.5rem' }}>
                                            {logsError && (
                                                <div style={{ padding: '0.5rem', color: 'var(--color-error)' }}>
                                                    Feil: {logsError}
                                                </div>
                                            )}
                                            {(() => {
                                                const isHass = settings?.hubType === 'hass';
                                                const term = logSearchTerm.toLowerCase();
                                                const filtered = insightLogs.filter(log => {
                                                    const label = formatLogLabel(log).toLowerCase();
                                                    const area = (log.area || '').toLowerCase();
                                                    return label.includes(term) || log.id.toLowerCase().includes(term) || area.includes(term);
                                                });

                                                if (!isHass) {
                                                    // Homey: flat liste (eksisterende oppførsel)
                                                    return filtered.map(log => (
                                                        <label key={log.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px', cursor: 'pointer', borderRadius: '4px' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={graphSettings.logs && graphSettings.logs.includes(log.id)}
                                                                onChange={(e) => {
                                                                    const newLogs = e.target.checked
                                                                        ? [...(graphSettings.logs || []), log.id]
                                                                        : (graphSettings.logs || []).filter(id => id !== log.id);
                                                                    setGraphSettings({ ...graphSettings, logs: newLogs });
                                                                }}
                                                            />
                                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                <span style={{ fontSize: '0.9rem' }}>{formatLogLabel(log)}</span>
                                                                <span style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>{log.id}</span>
                                                            </div>
                                                        </label>
                                                    ));
                                                }

                                                // HA: grupper etter rom
                                                const grouped = new Map();
                                                filtered.forEach(log => {
                                                    const area = log.area || null;
                                                    const key = area || '__ingen_rom__';
                                                    if (!grouped.has(key)) grouped.set(key, []);
                                                    grouped.get(key).push(log);
                                                });

                                                const sections = [];
                                                grouped.forEach((logs, key) => {
                                                    const areaLabel = key === '__ingen_rom__' ? 'Ingen rom' : key;
                                                    sections.push(
                                                        <div key={key}>
                                                            <div style={{
                                                                fontSize: '0.7rem',
                                                                fontWeight: 600,
                                                                textTransform: 'uppercase',
                                                                letterSpacing: '0.05em',
                                                                color: 'var(--color-text-secondary)',
                                                                padding: '6px 8px 2px 8px',
                                                                position: 'sticky',
                                                                top: 0,
                                                                background: 'var(--color-bg-secondary)',
                                                                zIndex: 1
                                                            }}>
                                                                {areaLabel}
                                                            </div>
                                                            {logs.map(log => (
                                                                <label key={log.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px', cursor: 'pointer', borderRadius: '4px' }}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={graphSettings.logs && graphSettings.logs.includes(log.id)}
                                                                        onChange={(e) => {
                                                                            const newLogs = e.target.checked
                                                                                ? [...(graphSettings.logs || []), log.id]
                                                                                : (graphSettings.logs || []).filter(id => id !== log.id);
                                                                            setGraphSettings({ ...graphSettings, logs: newLogs });
                                                                        }}
                                                                    />
                                                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                                        <span style={{ fontSize: '0.9rem' }}>{formatLogLabel(log)}{log.unit ? ` (${log.unit})` : ''}</span>
                                                                        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>{log.id}</span>
                                                                    </div>
                                                                </label>
                                                            ))}
                                                        </div>
                                                    );
                                                });
                                                return sections.length > 0 ? sections : null;
                                            })()}
                                            {insightLogs.length === 0 && (
                                                <div style={{ padding: '0.5rem', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                                                    Laster logger...
                                                </div>
                                            )}
                                        </div>
                                        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                                            Velg opptil 5 datakilder for best visning.
                                        </p>
                                    </div>

                                    {graphSettings.logs && graphSettings.logs.length > 0 && (
                                        <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px', background: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                                            <label style={{ color: 'var(--color-accent)' }}>Valgte datakilder ({graphSettings.logs.length})</label>
                                            {graphSettings.logs.map((logId) => {
                                                const logObj = insightLogs.find(l => l.id === logId);
                                                const defaultLabel = logObj ? formatLogLabel(logObj) : logId;
                                                const customName = widgetSettings.customNames?.[logId] || '';

                                                return (
                                                    <div key={logId} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '4px' }}>
                                                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                            <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                                                                {defaultLabel}
                                                            </span>
                                                            <input
                                                                type="text"
                                                                placeholder="Eget navn (valgfritt)"
                                                                value={customName}
                                                                onChange={(e) => {
                                                                    setWidgetSettings(prev => ({
                                                                        ...prev,
                                                                        customNames: {
                                                                            ...(prev.customNames || {}),
                                                                            [logId]: e.target.value
                                                                        }
                                                                    }));
                                                                }}
                                                                style={{
                                                                    padding: '4px 8px',
                                                                    fontSize: '0.9rem',
                                                                    background: 'rgba(255,255,255,0.05)',
                                                                    border: '1px solid rgba(255,255,255,0.1)',
                                                                    borderRadius: '4px',
                                                                    width: '100%',
                                                                    color: 'var(--color-text-primary)'
                                                                }}
                                                            />
                                                        </div>
                                                        <button
                                                            className="icon-btn"
                                                            onClick={() => {
                                                                const newLogs = graphSettings.logs.filter(id => id !== logId);
                                                                setGraphSettings({ ...graphSettings, logs: newLogs });
                                                            }}
                                                            style={{ color: 'var(--color-error)' }}
                                                            title="Fjern fra graf"
                                                        >
                                                            <X size={18} />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    <div className="form-group">
                                        <label>Tidsperiode</label>
                                        <select
                                            value={graphSettings.range || 'last24Hours'}
                                            onChange={(e) => setGraphSettings({ ...graphSettings, range: e.target.value })}
                                            style={{
                                                width: '100%',
                                                padding: '8px',
                                                background: 'var(--color-bg-secondary)',
                                                border: '1px solid var(--color-border)',
                                                borderRadius: 'var(--radius-md)',
                                                color: 'var(--color-text-primary)'
                                            }}
                                        >
                                            <option value="last6Hours">Siste 6 timer</option>
                                            <option value="last24Hours">Siste 24 timer</option>
                                            <option value="last7Days">Siste 7 dager</option>
                                            <option value="last31Days">Siste 31 dager</option>
                                        </select>
                                    </div>
                                </>
                            )}

                            {tile.type === 'energy-dashboard' && (
                                <EnergyDashboardGeneralSettings
                                    settings={widgetSettings}
                                    onChange={(updated) => setWidgetSettings(prev => ({ ...prev, ...updated }))}
                                />
                            )}
                        </>
                    )}

                    {/* ── Strøm & kostnad: Enheter ──────────────────── */}
                    {activeTab === 'config' && tile.type === 'energy-dashboard' && (
                        <EnergyDashboardDeviceConfig
                            settings={widgetSettings}
                            onChange={(updated) => setWidgetSettings(prev => ({ ...prev, ...updated }))}
                        />
                    )}

                    {/* ── Varmtvannsbereder: Innstillinger ─────────── */}
                    {activeTab === 'config' && effectiveType === 'water-heater' && (
                        <div>
                            <div className="form-group">
                                <label>Visning (kompaktflis)</label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
                                    <CheckboxRow
                                        label="Vis fyllingsgrad (vannivå-animasjon)"
                                        checked={widgetSettings.showFillLevel !== false}
                                        onChange={(checked) => setWidgetSettings({ ...widgetSettings, showFillLevel: checked })}
                                    />
                                    <CheckboxRow
                                        label="Vis effekt (W) øverst"
                                        checked={!!widgetSettings.showPower}
                                        onChange={(checked) => setWidgetSettings({ ...widgetSettings, showPower: checked })}
                                    />
                                    <CheckboxRow
                                        label="Vis lagret energi (kWh)"
                                        checked={!!widgetSettings.showEnergyInTank}
                                        onChange={(checked) => setWidgetSettings({ ...widgetSettings, showEnergyInTank: checked })}
                                    />
                                </div>
                            </div>

                            <div className="form-group" style={{ marginTop: '1.2rem' }}>
                                <label>Temperaturkontroll</label>
                                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                                    Grenser for +/− knappene i stor visning.
                                </p>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                                    <div>
                                        <label style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Min (°C)</label>
                                        <input
                                            type="number"
                                            value={widgetSettings.tempMin ?? 30}
                                            onChange={(e) => setWidgetSettings({ ...widgetSettings, tempMin: Number(e.target.value) })}
                                            style={{ width: '100%', padding: '6px 8px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Maks (°C)</label>
                                        <input
                                            type="number"
                                            value={widgetSettings.tempMax ?? 90}
                                            onChange={(e) => setWidgetSettings({ ...widgetSettings, tempMax: Number(e.target.value) })}
                                            style={{ width: '100%', padding: '6px 8px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Trinn (°C)</label>
                                        <input
                                            type="number"
                                            value={widgetSettings.tempStep ?? 1}
                                            onChange={(e) => setWidgetSettings({ ...widgetSettings, tempStep: Number(e.target.value) })}
                                            style={{ width: '100%', padding: '6px 8px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-primary)' }}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Billader: Innstillinger ──────────────────── */}
                    {activeTab === 'config' && effectiveType === 'ev-charger' && (
                        <div>
                            <div className="form-group">
                                <label>Kompaktvisning</label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
                                    <CheckboxRow
                                        label="Vis kostnad nå (kr/h)"
                                        checked={!!widgetSettings.showCostCurrent}
                                        onChange={(checked) => setWidgetSettings({ ...widgetSettings, showCostCurrent: checked })}
                                    />
                                </div>
                            </div>

                        </div>
                    )}

                    {/* ── Vanning: Innstillinger ───────────────────── */}
                    {activeTab === 'config' && effectiveType === 'irrigation' && (
                        <div>
                            <div className="form-group">
                                <label>Navn på sonene</label>
                                <p className="hint">Vises på knappene for hver ventil, f.eks. «Plen» og «Bed».</p>
                                {[1, 2].map(n => (
                                    <div key={n} style={{ marginTop: '8px' }}>
                                        <label style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Sone {n}</label>
                                        <input
                                            type="text"
                                            value={widgetSettings[`zone${n}Name`] || ''}
                                            onChange={(e) => setWidgetSettings({ ...widgetSettings, [`zone${n}Name`]: e.target.value })}
                                            placeholder={`Sone ${n}`}
                                            style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)', color: 'white' }}
                                        />
                                    </div>
                                ))}
                            </div>
                            <p className="hint">
                                Start kjører ventilen i standardvarigheten som er satt på enheten
                                ({device?.capabilitiesObj?.manual_duration?.value ?? '?'} min) og lukker deretter selv.
                                Tidsplaner styres ikke fra dashbordet.
                            </p>
                        </div>
                    )}

                    {/* ── Solskjerm: Innstillinger ─────────────────── */}
                    {activeTab === 'config' && effectiveType === 'sunshade' && (
                        <div>
                            <div className="form-group">
                                <label>Posisjon</label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
                                    <CheckboxRow
                                        label="Inverter posisjon (0% = oppe, 100% = nede)"
                                        checked={!!widgetSettings.invertPosition}
                                        onChange={(checked) => setWidgetSettings({ ...widgetSettings, invertPosition: checked })}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── Vaskemaskin: Innstillinger ───────────────── */}
                    {activeTab === 'config' && effectiveType === 'cleaning' && (
                        <div>
                            {/* Strømmåler (ekstern) */}
                            {!device?.capabilities?.includes('measure_power') && (
                                <div className="form-group">
                                    <label>Strømmåler (ekstern)</label>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                                        Koble til en smartplugg for å vise strømforbruk på flisen.
                                    </p>
                                    <label style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Enhet</label>
                                    <select
                                        value={widgetSettings.externalPowerDeviceId || ''}
                                        onChange={(e) => setWidgetSettings({ ...widgetSettings, externalPowerDeviceId: e.target.value })}
                                        className="select-input"
                                        style={{ marginBottom: '0.5rem' }}
                                    >
                                        <option value="">-- Ingen --</option>
                                        {devices
                                            .filter(d => d.capabilities.includes('measure_power'))
                                            .map(d => ({
                                                ...d,
                                                displayLabel: `${d.zoneName ? `[${d.zoneName}] ` : ''}${d.name}${d.entityId ? ` (${d.entityId})` : ''}`
                                            }))
                                            .sort((a, b) => a.displayLabel.localeCompare(b.displayLabel))
                                            .map(d => (
                                                <option key={d.id} value={d.id}>{d.displayLabel}</option>
                                            ))
                                        }
                                    </select>
                                    {widgetSettings.externalPowerDeviceId && (
                                        <>
                                            <label style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Egenskap</label>
                                            <select
                                                value={widgetSettings.externalPowerCapability || 'measure_power'}
                                                onChange={(e) => setWidgetSettings({ ...widgetSettings, externalPowerCapability: e.target.value })}
                                                className="select-input"
                                            >
                                                {(() => {
                                                    const extDevice = devices.find(d => d.id === widgetSettings.externalPowerDeviceId);
                                                    if (!extDevice) return null;
                                                    return extDevice.capabilities
                                                        .filter(c => c.includes('measure_') || c.includes('meter_'))
                                                        .map(c => (
                                                            <option key={c} value={c}>{extDevice.capabilitiesObj?.[c]?.title || c}</option>
                                                        ));
                                                })()}
                                            </select>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Tidsenhet */}
                            <div className="form-group">
                                <label>Tidsenhet for gjenværende tid</label>
                                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                                    Velg hvilken enhet maskinen rapporterer tid i.
                                </p>
                                <select
                                    value={widgetSettings.timeUnit || 'auto'}
                                    onChange={(e) => setWidgetSettings({ ...widgetSettings, timeUnit: e.target.value })}
                                    className="select-input"
                                >
                                    <option value="auto">Auto (gjett ut fra verdi)</option>
                                    <option value="seconds">Sekunder</option>
                                    <option value="minutes">Minutter</option>
                                    <option value="hours">Timer</option>
                                </select>
                            </div>

                            {/* Skjul program-navn */}
                            <div className="form-group">
                                <CheckboxRow
                                    label="Skjul program-navn på flisen"
                                    checked={!!widgetSettings.hideProgram}
                                    onChange={(checked) => setWidgetSettings({ ...widgetSettings, hideProgram: checked })}
                                />
                            </div>

                            <p className="hint">
                                Ferdig-popupen («Er maskinen tømt?»), slumretid og egendefinerte
                                inaktiv-tilstander stilles inn under Innstillinger → Popups → Vaskemaskin
                                (gjelder hele profilen, også skjermer uten denne flisen).
                                Nåværende tilstand: <strong style={{ color: 'var(--color-text-primary)' }}>{device?.capabilitiesObj?.operational_state?.value ?? '–'}</strong>
                            </p>
                        </div>
                    )}

                    {/* ── Apparat på smartplugg: Innstillinger ─────── */}
                    {activeTab === 'config' && effectiveType === 'appliance' && (
                        <div>
                            <div className="form-group">
                                <label>Type apparat</label>
                                <select
                                    value={widgetSettings.applianceKind || device?.settings?.applianceKind || 'dishwasher'}
                                    onChange={(e) => setWidgetSettings({ ...widgetSettings, applianceKind: e.target.value })}
                                    className="select-input"
                                >
                                    <option value="dishwasher">Oppvaskmaskin</option>
                                    <option value="dryer">Tørketrommel</option>
                                </select>
                            </div>

                            <div className="form-group">
                                <label>Syklusdata (maskinens integrasjon)</label>
                                <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                                    Status, gjenstående tid og syklusteller fra maskinens egen integrasjon i Home Assistant.
                                </p>
                                <select
                                    value={widgetSettings.washDataDeviceId || ''}
                                    onChange={(e) => setWidgetSettings({ ...widgetSettings, washDataDeviceId: e.target.value })}
                                    className="select-input"
                                >
                                    <option value="">Automatisk</option>
                                    <option value="none">Av</option>
                                    {devices.filter(d => d.capabilities?.includes('washdata_state')).map(d => (
                                        <option key={d.id} value={d.id}>
                                            {d.zoneName ? `[${d.zoneName}] ` : ''}{d.name}
                                        </option>
                                    ))}
                                </select>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
                                    <CheckboxRow
                                        label="Vis tid igjen på flisen"
                                        checked={widgetSettings.showTimeRemaining !== false}
                                        onChange={(checked) => setWidgetSettings({ ...widgetSettings, showTimeRemaining: checked })}
                                    />
                                </div>
                            </div>

                            <p className="hint">
                                Ferdig-popupen («Er den tømt?»), slumretid og tersklene for
                                tilstandsdeteksjon (Standby / Kjører / Ferdig) stilles inn under
                                Innstillinger → Popups → {(widgetSettings.applianceKind || device?.settings?.applianceKind) === 'dryer' ? 'Tørketrommel' : 'Oppvaskmaskin'}
                                (gjelder hele profilen, også skjermer uten denne flisen).
                            </p>
                        </div>
                    )}

                    {/* ── Intercom: Innstillinger ───────────────────── */}
                    {activeTab === 'config' && effectiveType === 'intercom' && (
                        <div>
                            <div className="form-group">
                                <label>Enhet som ringes (standard)</label>
                                <select
                                    value={widgetSettings.targetDeviceId || ''}
                                    onChange={(e) => {
                                        const id = e.target.value;
                                        const dev = intercomDevices.find(d => d.device_id === id);
                                        setWidgetSettings({
                                            ...widgetSettings,
                                            targetDeviceId: id,
                                            targetName: dev?.name || '',
                                        });
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '8px',
                                        background: 'var(--color-bg-secondary)',
                                        border: '1px solid var(--color-border)',
                                        borderRadius: 'var(--radius-md)',
                                        color: 'var(--color-text-primary)',
                                    }}
                                >
                                    <option value="">Automatisk (første tilgjengelige)</option>
                                    {intercomDevices.map(d => (
                                        <option key={d.device_id} value={d.device_id}>{d.name}</option>
                                    ))}
                                </select>
                                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                                    Ring-knappen på flisen ringer denne enheten. Trykk på flisen for å
                                    åpne utvidet visning og velge blant alle enhetene.
                                </p>
                                {intercomDevices.length === 0 && (
                                    <p style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: '4px' }}>
                                        Ingen intercom-enheter funnet ennå — sjekk at intercom_native er
                                        lastet i Home Assistant.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'config' && effectiveType === 'presence' && (
                        <div>
                            <div className="form-group">
                                <CheckboxRow
                                    label="Vis alle personer på én flis"
                                    checked={widgetSettings.showAllPersons !== false}
                                    onChange={(checked) => setWidgetSettings({ ...widgetSettings, showAllPersons: checked })}
                                />
                                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                                    Skru av for å vise kun personen flisen er knyttet til.
                                </p>
                            </div>
                        </div>
                    )}

                        </>
                    )}

                    {activeTab === 'layout' && isMultiLight && (
                        <div className="form-group">
                            <label>Orientering (kompakt visning)</label>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button
                                    className={`btn btn-secondary ${orientation === 'horizontal' ? 'active' : ''}`}
                                    onClick={() => setOrientation('horizontal')}
                                    style={{ flex: 1, borderColor: orientation === 'horizontal' ? 'var(--color-accent-primary)' : '' }}
                                >
                                    Horisontal (Rader)
                                </button>
                                <button
                                    className={`btn btn-secondary ${orientation === 'vertical' ? 'active' : ''}`}
                                    onClick={() => setOrientation('vertical')}
                                    style={{ flex: 1, borderColor: orientation === 'vertical' ? 'var(--color-accent-primary)' : '' }}
                                >
                                    Vertikal (Kolonner)
                                </button>
                            </div>

                            <label style={{ marginTop: '15px', display: 'block' }}>Orientering (når flisen åpnes)</label>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button
                                    className={`btn btn-secondary ${expandedOrientation === 'horizontal' ? 'active' : ''}`}
                                    onClick={() => setExpandedOrientation('horizontal')}
                                    style={{ flex: 1, borderColor: expandedOrientation === 'horizontal' ? 'var(--color-accent-primary)' : '' }}
                                >
                                    Horisontal
                                </button>
                                <button
                                    className={`btn btn-secondary ${expandedOrientation === 'vertical' ? 'active' : ''}`}
                                    onClick={() => setExpandedOrientation('vertical')}
                                    style={{ flex: 1, borderColor: expandedOrientation === 'vertical' ? 'var(--color-accent-primary)' : '' }}
                                >
                                    Vertikal
                                </button>
                            </div>

                            <div style={{ marginTop: '15px' }}>
                                <CheckboxRow
                                    label="Kompakt visning (kun ikoner på flis)"
                                    checked={!!widgetSettings.compact}
                                    onChange={(checked) => setWidgetSettings(prev => ({ ...prev, compact: checked }))}
                                />
                                <div style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '4px', marginLeft: '24px' }}>
                                    Viser kun av/på ikoner. Klikk på flisen for å åpne slidere.
                                </div>
                            </div>

                            {widgetSettings.compact && (
                                <div style={{ marginTop: '10px', marginLeft: '24px' }}>
                                    <label>Antall kolonner</label>
                                    <select
                                        value={widgetSettings.columns || 'auto'}
                                        onChange={e => setWidgetSettings(prev => ({ ...prev, columns: e.target.value }))}
                                        style={{
                                            width: '100%',
                                            padding: '8px',
                                            background: 'var(--color-bg-secondary)',
                                            border: '1px solid var(--color-border)',
                                            borderRadius: 'var(--radius-md)',
                                            color: 'var(--color-text-primary)',
                                        }}
                                    >
                                        <option value="auto">Automatisk</option>
                                        <option value="1">1</option>
                                        <option value="2">2</option>
                                        <option value="3">3</option>
                                        <option value="4">4</option>
                                        <option value="5">5</option>
                                        <option value="6">6</option>
                                    </select>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'layout' && isMultiThermostat && (
                        <div className="form-group">
                            <label>Orientering (kompakt visning)</label>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button
                                    className={`btn btn-secondary ${orientation === 'horizontal' ? 'active' : ''}`}
                                    onClick={() => setOrientation('horizontal')}
                                    style={{ flex: 1, borderColor: orientation === 'horizontal' ? 'var(--color-accent-primary)' : '' }}
                                >
                                    Horisontal (Rader)
                                </button>
                                <button
                                    className={`btn btn-secondary ${orientation === 'vertical' ? 'active' : ''}`}
                                    onClick={() => setOrientation('vertical')}
                                    style={{ flex: 1, borderColor: orientation === 'vertical' ? 'var(--color-accent-primary)' : '' }}
                                >
                                    Vertikal (Kolonner)
                                </button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'expanded' && (
                        <>
                            {/* Multi-Light: Info about layout settings */}
                            {isMultiLight && (
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '10px',
                                    padding: '12px 14px',
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.09)',
                                    borderRadius: '10px',
                                }}>
                                    <span style={{ fontSize: '1rem', flexShrink: 0 }}>💡</span>
                                    <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', lineHeight: 1.5, margin: 0 }}>
                                        Layoutinnstillinger for utvidet visning – som orientering og kompakt modus – finner du under <strong style={{ color: 'var(--color-text-primary)' }}>Layout</strong>-fanen.
                                    </p>
                                </div>
                            )}

                            {/* Multi-Thermostat: Per-device expanded capability settings */}
                            {isMultiThermostat && (() => {
                                const multiExpandedConfig = widgetSettings.multiExpandedCapabilities || {};
                                const activeDeviceId = expandedConfigDeviceId || multiDevices[0] || null;
                                const activeDevice = activeDeviceId ? devices.find(d => d.id === activeDeviceId) : null;

                                const deviceCaps = activeDevice
                                    ? Object.entries(activeDevice.capabilitiesObj || {})
                                        .map(([id, obj]) => ({ id, title: getCapTitle(id, obj) }))
                                        .filter(cap => !['target_temperature', 'alarm_battery', 'alarm_temperature'].includes(cap.id))
                                    : [];

                                const selectedCaps = multiExpandedConfig[activeDeviceId] || [];

                                const toggleCap = (capId) => {
                                    const current = multiExpandedConfig[activeDeviceId] || [];
                                    const next = current.some(c => c.id === capId)
                                        ? current.filter(c => c.id !== capId)
                                        : [...current, { id: capId, title: '' }];
                                    setWidgetSettings(prev => ({
                                        ...prev,
                                        multiExpandedCapabilities: { ...multiExpandedConfig, [activeDeviceId]: next }
                                    }));
                                };

                                const moveCap = (index, dir) => {
                                    const current = [...(multiExpandedConfig[activeDeviceId] || [])];
                                    const target = index + dir;
                                    if (target < 0 || target >= current.length) return;
                                    [current[index], current[target]] = [current[target], current[index]];
                                    setWidgetSettings(prev => ({
                                        ...prev,
                                        multiExpandedCapabilities: { ...multiExpandedConfig, [activeDeviceId]: current }
                                    }));
                                };

                                const renameCap = (index, title) => {
                                    const current = [...(multiExpandedConfig[activeDeviceId] || [])];
                                    current[index] = { ...current[index], title };
                                    setWidgetSettings(prev => ({
                                        ...prev,
                                        multiExpandedCapabilities: { ...multiExpandedConfig, [activeDeviceId]: current }
                                    }));
                                };

                                return (
                                    <div className="form-group">
                                        {multiDevices.length === 0 ? (
                                            <p style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>
                                                Ingen termostater lagt til. Gå til «Enheter»-fanen for å legge til.
                                            </p>
                                        ) : (
                                            <>
                                                <label>Velg termostat</label>
                                                <select
                                                    value={activeDeviceId || ''}
                                                    onChange={e => setExpandedConfigDeviceId(e.target.value)}
                                                    style={{
                                                        width: '100%',
                                                        padding: '8px',
                                                        background: 'var(--color-bg-secondary)',
                                                        border: '1px solid var(--color-border)',
                                                        borderRadius: 'var(--radius-md)',
                                                        color: 'var(--color-text-primary)',
                                                        marginBottom: '16px',
                                                    }}
                                                >
                                                    {multiDevices.map(deviceId => {
                                                        const d = devices.find(dev => dev.id === deviceId);
                                                        const label = widgetSettings.customNames?.[deviceId] || d?.name || deviceId;
                                                        return <option key={deviceId} value={deviceId}>{label}</option>;
                                                    })}
                                                </select>

                                                {activeDevice && (
                                                    <>
                                                        <label>Egenskaper i utvidet visning</label>
                                                        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                                                            Velg hvilke verdier som skal vises når denne termostaten åpnes.
                                                        </p>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--color-border)', padding: '0.5rem', borderRadius: 'var(--radius-md)', marginBottom: '12px' }}>
                                                            {deviceCaps.length === 0
                                                                ? <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Ingen konfigurerbare egenskaper</span>
                                                                : deviceCaps.map(cap => (
                                                                    <label key={cap.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={selectedCaps.some(c => c.id === cap.id)}
                                                                            onChange={() => toggleCap(cap.id)}
                                                                        />
                                                                        <span>{cap.title}</span>
                                                                    </label>
                                                                ))
                                                            }
                                                        </div>

                                                        {selectedCaps.length > 0 && (
                                                            <>
                                                                <label style={{ fontSize: '0.9rem', marginBottom: '0.5rem', display: 'block' }}>Rekkefølge og navn</label>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                                    {selectedCaps.map((capConfig, index) => {
                                                                        const cap = deviceCaps.find(c => c.id === capConfig.id);
                                                                        return (
                                                                            <div key={capConfig.id} style={{
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                padding: '8px',
                                                                                background: 'var(--color-bg-secondary)',
                                                                                borderRadius: '6px',
                                                                                gap: '10px'
                                                                            }}>
                                                                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                                    <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                                                                                        {cap?.title ?? capConfig.id}
                                                                                    </span>
                                                                                    <input
                                                                                        type="text"
                                                                                        placeholder="Eget navn (valgfritt)"
                                                                                        value={capConfig.title || ''}
                                                                                        onChange={e => renameCap(index, e.target.value)}
                                                                                        style={{
                                                                                            padding: '4px 8px',
                                                                                            fontSize: '0.9rem',
                                                                                            background: 'rgba(255,255,255,0.05)',
                                                                                            border: '1px solid rgba(255,255,255,0.1)',
                                                                                            borderRadius: '4px',
                                                                                            width: '100%',
                                                                                            color: 'var(--color-text-primary)',
                                                                                        }}
                                                                                    />
                                                                                </div>
                                                                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                                                    <button className="icon-btn" disabled={index === 0} onClick={() => moveCap(index, -1)} style={{ opacity: index === 0 ? 0.3 : 1 }}>↑</button>
                                                                                    <button className="icon-btn" disabled={index === selectedCaps.length - 1} onClick={() => moveCap(index, 1)} style={{ opacity: index === selectedCaps.length - 1 ? 0.3 : 1 }}>↓</button>
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </>
                                                        )}
                                                    </>
                                                )}
                                            </>
                                        )}
                                    </div>
                                );
                            })()}

                            {/* Washing Machine: Time Remaining */}


                            {/* Thermostat, Light, Switch & Socket: External Power Source */}
                            {(['thermostat', 'light', 'switch', 'socket'].includes(effectiveType)) && !device?.capabilities?.includes('measure_power') && (
                                <div className="form-group" style={{ marginTop: '1.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
                                    <label>Velg Strømmåler for enheten</label>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                                        Hvis enheten ikke måler strøm selv, kan du koble til en smartplugg her.
                                    </p>

                                    <label style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: '0.5rem' }}>Enhet</label>
                                    <select
                                        value={widgetSettings.externalPowerDeviceId || ''}
                                        onChange={(e) => setWidgetSettings({ ...widgetSettings, externalPowerDeviceId: e.target.value })}
                                        className="select-input"
                                        style={{ marginBottom: '0.5rem' }}
                                    >
                                        <option value="">-- Ingen --</option>
                                        {devices
                                            .filter(d => d.capabilities.includes('measure_power'))
                                            .map(d => ({
                                                ...d,
                                                displayLabel: `${d.zoneName ? `[${d.zoneName}] ` : ''}${d.name}${d.id ? ` (${d.id})` : ''}`
                                            }))
                                            .sort((a, b) => a.displayLabel.localeCompare(b.displayLabel))
                                            .map(d => (
                                                <option key={d.id} value={d.id}>
                                                    {d.displayLabel}
                                                </option>
                                            ))
                                        }
                                    </select>

                                    {widgetSettings.externalPowerDeviceId && (
                                        <>
                                            <label style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Egenskap</label>
                                            <select
                                                value={widgetSettings.externalPowerCapability || 'measure_power'}
                                                onChange={(e) => setWidgetSettings({ ...widgetSettings, externalPowerCapability: e.target.value })}
                                                className="select-input"
                                            >
                                                {(() => {
                                                    const extDevice = devices.find(d => d.id === widgetSettings.externalPowerDeviceId);
                                                    if (!extDevice) return null;
                                                    return extDevice.capabilities
                                                        .filter(c => c.includes('measure_') || c.includes('meter_'))
                                                        .map(c => (
                                                            <option key={c} value={c}>{extDevice.capabilitiesObj?.[c]?.title || c}</option>
                                                        ));
                                                })()}
                                            </select>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* Expanded View Settings for Thermostat, Light, Switch, Socket and Washing Machine */}
                            {(['thermostat', 'light', 'switch', 'socket', 'cleaning'].includes(effectiveType)) && (
                                <div className="form-group" style={{ marginTop: '1.5rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
                                    <label>Egenskaper i utvidet visning (stor)</label>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '0.5rem' }}>
                                        Velg hvilke kontroller/verdier som skal vises i den store visningen.
                                    </p>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto', border: '1px solid var(--color-border)', padding: '0.5rem', borderRadius: 'var(--radius-md)' }}>
                                        {availableCapabilities.map(cap => (
                                            <label key={cap.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={expandedCapabilities.some(c => c.id === cap.id)}
                                                    onChange={() => toggleExpandedCapability(cap.id)}
                                                />
                                                <span>{cap.title}</span>
                                            </label>
                                        ))}
                                    </div>

                                    {expandedCapabilities.length > 0 && (
                                        <div style={{ marginTop: '1rem' }}>
                                            <label style={{ fontSize: '0.9rem', marginBottom: '0.5rem', display: 'block' }}>Rekkefølge og navn (Utvidet)</label>
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                {expandedCapabilities.map((capConfig, index) => {
                                                    const cap = availableCapabilities.find(c => c.id === capConfig.id);
                                                    return (
                                                        <div key={capConfig.id} style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            padding: '8px',
                                                            background: 'var(--color-bg-secondary)',
                                                            borderRadius: '6px',
                                                            gap: '10px'
                                                        }}>
                                                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                                                                    {cap ? cap.title : capConfig.id}
                                                                </span>
                                                                <input
                                                                    type="text"
                                                                    placeholder="Eget navn (valgfritt)"
                                                                    value={capConfig.title || ''}
                                                                    onChange={(e) => {
                                                                        const newCaps = [...expandedCapabilities];
                                                                        newCaps[index] = { ...newCaps[index], title: e.target.value };
                                                                        setExpandedCapabilities(newCaps);
                                                                    }}
                                                                    style={{
                                                                        padding: '4px 8px',
                                                                        fontSize: '0.9rem',
                                                                        background: 'rgba(255,255,255,0.05)',
                                                                        border: '1px solid rgba(255,255,255,0.1)',
                                                                        borderRadius: '4px',
                                                                        width: '100%'
                                                                    }}
                                                                />
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                                <button
                                                                    className="icon-btn"
                                                                    disabled={index === 0}
                                                                    onClick={() => {
                                                                        const newCaps = [...expandedCapabilities];
                                                                        [newCaps[index - 1], newCaps[index]] = [newCaps[index], newCaps[index - 1]];
                                                                        setExpandedCapabilities(newCaps);
                                                                    }}
                                                                    style={{ opacity: index === 0 ? 0.3 : 1 }}
                                                                >
                                                                    ↑
                                                                </button>
                                                                <button
                                                                    className="icon-btn"
                                                                    disabled={index === expandedCapabilities.length - 1}
                                                                    onClick={() => {
                                                                        const newCaps = [...expandedCapabilities];
                                                                        [newCaps[index + 1], newCaps[index]] = [newCaps[index], newCaps[index + 1]];
                                                                        setExpandedCapabilities(newCaps);
                                                                    }}
                                                                    style={{ opacity: index === expandedCapabilities.length - 1 ? 0.3 : 1 }}
                                                                >
                                                                    ↓
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                </div>
                            )}

                            {/* ── Støvsuger: Utvidet visning (info) ──────── */}
                            {effectiveType === 'vacuum' && (
                                <ShowOptionsGroup
                                    title="Velg hva som vises i stor visning"
                                    description="Seksjoner som vises når flisen åpnes."
                                    options={[
                                        { key: 'showMapSelect',   label: 'Kartvalg / etasje',         def: true  },
                                        { key: 'showFanSpeed',    label: 'Sugestyrke',                def: true  },
                                        { key: 'showMopControls', label: 'Moppekontroller',           def: true  },
                                        { key: 'showLastClean',   label: 'Siste rens og statistikk',  def: true  },
                                        { key: 'showMaintenance', label: 'Levetid (børster, filter)', def: true  },
                                        { key: 'showVolumeDnd',   label: 'Volum og ikke-forstyrr',    def: false },
                                    ]}
                                    values={widgetSettings}
                                    onChange={(key, checked) => setWidgetSettings(prev => ({ ...prev, [key]: checked }))}
                                />
                            )}

                            {/* ── Billader: Utvidet visning ─────────────── */}
                            {effectiveType === 'ev-charger' && (
                                <ShowOptionsGroup
                                    title="Velg hva som vises i stor visning"
                                    description="Statistikk og informasjon som vises når flisen åpnes."
                                    options={[
                                        { key: 'showEnergyDaily',      label: 'Energi i dag (kWh)',         def: true  },
                                        { key: 'showEnergyMonthly',    label: 'Energi denne måneden (kWh)', def: false },
                                        { key: 'showCostDaily',        label: 'Kostnad i dag (kr)',         def: true  },
                                        { key: 'showCostMonthly',      label: 'Kostnad denne måneden (kr)', def: false },
                                        { key: 'showAllocatedCurrent', label: 'Tildelt strøm (A)',          def: false },
                                    ]}
                                    values={widgetSettings}
                                    onChange={(key, checked) => setWidgetSettings(prev => ({ ...prev, [key]: checked }))}
                                />
                            )}

                            {/* ── Vanning: Utvidet visning ──────────────── */}
                            {effectiveType === 'irrigation' && (
                                <ShowOptionsGroup
                                    title="Velg hva som vises i stor visning"
                                    description="Sone-knappene, varsler og batteri vises alltid."
                                    options={[
                                        { key: 'showRunStats',  label: 'Kjøretid per sone (nå / siste kjøring)', def: true },
                                        { key: 'showHourStats', label: 'Siste time (tid og vannmengde)',        def: true },
                                        { key: 'showChildLock', label: 'Barnesikring-status',                   def: true },
                                    ]}
                                    values={widgetSettings}
                                    onChange={(key, checked) => setWidgetSettings(prev => ({ ...prev, [key]: checked }))}
                                />
                            )}

                            {/* ── Robotklipper: Utvidet visning ─────────── */}
                            {effectiveType === 'lawn-mower' && (
                                <ShowOptionsGroup
                                    title="Velg hva som vises i stor visning"
                                    description="Seksjoner som vises når flisen åpnes. Varsler og kontrollknapper vises alltid."
                                    options={[
                                        { key: 'showProgress',      label: 'Klipt i dag (fremdrift)',         def: true },
                                        { key: 'showCuttingHeight', label: 'Klippehøyde',                     def: true },
                                        { key: 'showStats',         label: 'Statistikk (tider, neste start)', def: true },
                                        { key: 'showMap',           label: 'Kart',                            def: true },
                                    ]}
                                    values={widgetSettings}
                                    onChange={(key, checked) => setWidgetSettings(prev => ({ ...prev, [key]: checked }))}
                                />
                            )}

                            {/* ── Vær: Utvidet visning ──────────────────── */}
                            {effectiveType === 'weather' && (
                                <ShowOptionsGroup
                                    title="Velg hva som vises i stor visning"
                                    description="Seksjoner som vises når flisen åpnes."
                                    options={[
                                        { key: 'showStats',  label: 'Vind, fuktighet og nedbør', def: true },
                                        { key: 'showHourly', label: 'Neste 24 timer',            def: true },
                                        { key: 'showDaily',  label: '7-dagers varsel',           def: true },
                                    ]}
                                    values={widgetSettings}
                                    onChange={(key, checked) => setWidgetSettings(prev => ({ ...prev, [key]: checked }))}
                                />
                            )}

                            {/* ── Renovasjon: Utvidet visning ───────────── */}
                            {effectiveType === 'trash' && (
                                <ShowOptionsGroup
                                    title="Velg hva som vises i stor visning"
                                    description="Listen over alle fraksjoner vises alltid."
                                    options={[
                                        { key: 'showSummary', label: 'Sammendragsbanner (neste henting)', def: true },
                                    ]}
                                    values={widgetSettings}
                                    onChange={(key, checked) => setWidgetSettings(prev => ({ ...prev, [key]: checked }))}
                                />
                            )}

                            {/* ── Post: Utvidet visning ─────────────────── */}
                            {effectiveType === 'postal' && (
                                <ShowOptionsGroup
                                    title="Velg hva som vises i stor visning"
                                    description="Nedtellingen til neste levering vises alltid."
                                    options={[
                                        { key: 'showNextDate', label: 'Nøyaktig dato for neste levering', def: true },
                                        { key: 'showUpcoming', label: 'Kommende leveringer',              def: true },
                                    ]}
                                    values={widgetSettings}
                                    onChange={(key, checked) => setWidgetSettings(prev => ({ ...prev, [key]: checked }))}
                                />
                            )}

                            {/* ── Vifte: Utvidet visning ────────────────── */}
                            {effectiveType === 'fan' && (
                                <ShowOptionsGroup
                                    title="Velg hva som vises i stor visning"
                                    description="Hastighetskontrollen vises alltid."
                                    options={[
                                        { key: 'showLight', label: 'Lysstyring (hvis viften har lys)', def: true },
                                    ]}
                                    values={widgetSettings}
                                    onChange={(key, checked) => setWidgetSettings(prev => ({ ...prev, [key]: checked }))}
                                />
                            )}

                            {/* ── Apparat: Utvidet visning ──────────────── */}
                            {effectiveType === 'appliance' && (
                                <ShowOptionsGroup
                                    title="Velg hva som vises i stor visning"
                                    description="Statistikk og informasjon som vises når flisen åpnes."
                                    options={[
                                        { key: 'showEnergyMonthly', label: 'Energi denne måneden',  def: true  },
                                        { key: 'showCostMonthly',   label: 'Kostnad denne måneden', def: true  },
                                        { key: 'showPrevMonth',     label: 'Forrige måned',         def: false },
                                        { key: 'showYtd',           label: 'Hittil i år',           def: false },
                                        { key: 'showCycleCount',    label: 'Antall sykluser',       def: true  },
                                    ]}
                                    values={widgetSettings}
                                    onChange={(key, checked) => setWidgetSettings(prev => ({ ...prev, [key]: checked }))}
                                />
                            )}

                            {/* ── Varmtvannsbereder: Utvidet visning ────── */}
                            {effectiveType === 'water-heater' && (
                                <ShowOptionsGroup
                                    title="Velg hva som vises i stor visning"
                                    description="Statistikk og informasjon som vises når flisen åpnes."
                                    options={[
                                        { key: 'expandedShowEnergyDaily',     label: 'Energi i dag',           def: true  },
                                        { key: 'expandedShowEnergyTotal',     label: 'Energi totalt',          def: true  },
                                        { key: 'expandedShowElements',        label: 'Varmeelementer (1 & 2)', def: true  },
                                        { key: 'expandedShowProgram',         label: 'Program',                def: true  },
                                        { key: 'expandedShowPowerMode',       label: 'Strømmodus',             def: true  },
                                        { key: 'expandedShowEnergyYesterday', label: 'Energi i går',           def: false },
                                        { key: 'expandedShowEnergyMonthly',   label: 'Energi per måned',       def: false },
                                    ]}
                                    values={widgetSettings}
                                    onChange={(key, checked) => setWidgetSettings(prev => ({ ...prev, [key]: checked }))}
                                />
                            )}


                        </>
                    )}
                </div>
                <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
                    <button
                        className="btn btn-secondary"
                        onClick={() => {
                            if (window.confirm('Slette denne flisen?')) {
                                onDelete(tile.id);
                                onClose();
                            }
                        }}
                        style={{ color: 'var(--color-error)', borderColor: 'rgba(239, 68, 68, 0.3)' }}
                    >
                        <Trash2 size={18} style={{ marginRight: '0.5rem' }} />
                        Slett
                    </button>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button className="btn btn-secondary" onClick={onClose}>Avbryt</button>
                        <button className="btn btn-primary" onClick={handleSave}>
                            <Save size={18} style={{ marginRight: '0.5rem' }} />
                            Lagre
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

// ─── Strøm & kostnad: hjelpefunksjoner ───────────────────────────────────────

// Finn eksakt entity-ID for en kostnadsentitet ved å filtrere på "Kostnad" i friendly name.
// Dette løser navnekonflikter der HA auto-renamer (f.eks. _energy_monthly_2) fordi
// en annen sensor med samme navn allerede eksisterer.
function findCostEntity(entities, prefix, partialSuffix) {
    const base = `sensor.${prefix}_${partialSuffix}`;
    // Alle entiteter for dette prefikset der friendly name inneholder "Kostnad"
    const candidates = Object.keys(entities).filter(eid =>
        eid.startsWith(`sensor.${prefix}_`) &&
        eid.includes(partialSuffix) &&
        entities[eid]?.attributes?.friendly_name?.includes('Kostnad')
    );
    if (candidates.length === 1) return candidates[0];
    // Foretrekk eksakt match hvis den finnes blant kandidatene
    if (candidates.includes(base)) return base;
    // Fallback: eksakt navn selv om den ikke ble funnet (kan gi feil verdi, men unngår null)
    return base;
}

// Utleder et lesbart stedsnavn fra entity-prefix som fallback når HA-sone ikke finnes.
// Eks: "tech_outlet_basement_heat_pump" → "Kjeller", "bathroom_floor_heating" → "Bad"
function locationFromPrefix(prefix) {
    const STRIP_SUFFIXES = ['_floor_heating','_heat_pump','_washing_machine','_dishwasher','_water_heater','_car_charger','_multisplit'];
    const TRANSLATIONS = {
        bathroom: 'Bad', laundry_room: 'Vaskerom', guest_room: 'Gjesterom',
        toilet: 'Toalett', basement: 'Kjeller', living_room: 'Stue',
        kitchen: 'Kjøkken', bedroom: 'Soverom', hallway: 'Gang', garage: 'Garasje',
        outdoor: 'Utendørs', office: 'Kontor', attic: 'Loft',
    };
    let loc = prefix.replace(/^tech_outlet_/, '');
    for (const s of STRIP_SUFFIXES) loc = loc.replace(s, '');
    loc = loc.replace(/_+$/, '').replace(/_+/g, '_');
    return TRANSLATIONS[loc] || loc.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || null;
}

function discoverEnergyCostDevices() {
    const entities = hassAPI.entities || {};
    const result = [];
    Object.keys(entities).forEach(eid => {
        if (!eid.startsWith('sensor.') || !eid.endsWith('_total_cost_monthly')) return;
        const prefix = eid.replace(/^sensor\./, '').replace(/_total_cost_monthly$/, '');
        const friendlyName = entities[eid]?.attributes?.friendly_name || '';
        const name = friendlyName.replace(/\s*Total\s*\(mnd\)\s*$/i, '').trim() || prefix;
        const area = hassAPI.entityToArea?.[eid] || locationFromPrefix(prefix) || '';
        const p = (suffix) => `sensor.${prefix}_${suffix}`;
        const e = (partialSuffix) => findCostEntity(entities, prefix, partialSuffix);
        result.push({
            prefix,
            name,
            area,
            entities: {
                monthly: {
                    energy:   e('energy_monthly'),
                    power:    p('power_cost_monthly'),
                    grid:     p('grid_tariff_monthly'),
                    capacity: p('capacity_cost_monthly'),
                    total:    eid,
                },
                ytd: {
                    energy:   e('energy_ytd'),
                    power:    p('power_cost_ytd'),
                    grid:     p('grid_tariff_ytd'),
                    capacity: p('capacity_cost_ytd'),
                    total:    p('total_cost_ytd'),
                },
                prev_month: {
                    energy:   e('energy_prev_month'),
                    power:    p('power_cost_prev_month'),
                    grid:     p('grid_tariff_prev_month'),
                    capacity: p('capacity_cost_prev_month'),
                    total:    p('total_cost_prev_month'),
                },
                prev_year: {
                    energy:   e('energy_prev_year'),
                    power:    p('power_cost_prev_year'),
                    grid:     p('grid_tariff_prev_year'),
                    capacity: p('capacity_cost_prev_year'),
                    total:    p('total_cost_prev_year'),
                },
            },
        });
    });
    return result.sort((a, b) => a.name.localeCompare(b.name, 'nb'));
}

function EnergyDashboardGeneralSettings({ settings, onChange }) {
    const tog = (key, def = true) => settings?.[key] !== undefined ? settings[key] : def;

    return (
        <div>
            <div className="form-group">
                <label>Vis øverste infokort</label>
                <div style={{ marginTop: 6 }}>
                    <CheckboxRow label="Effektiv pris" checked={tog('showPriceCard')} onChange={v => onChange({ showPriceCard: v })} />
                    <CheckboxRow label="Kapasitetstrinn" checked={tog('showCapacityCard')} onChange={v => onChange({ showCapacityCard: v })} />
                    <CheckboxRow label="Snitt toppforbruk" checked={tog('showPeakCard')} onChange={v => onChange({ showPeakCard: v })} />
                    <CheckboxRow label="Sporet kostnad" checked={tog('showTrackedCard')} onChange={v => onChange({ showTrackedCard: v })} />
                </div>
            </div>
            <div className="form-group">
                <label>Seksjoner</label>
                <div style={{ marginTop: 6 }}>
                    <CheckboxRow label="Toppforbruk-rad (topp 1/2/3)" checked={tog('showPeaksRow')} onChange={v => onChange({ showPeaksRow: v })} />
                    <CheckboxRow label="Søylediagram" checked={tog('showBarChart')} onChange={v => onChange({ showBarChart: v })} />
                    <CheckboxRow label="Detailtabell" checked={tog('showTable')} onChange={v => onChange({ showTable: v })} />
                </div>
            </div>
            {(settings?.showTable !== false) && (
                <div className="form-group">
                    <label>Kolonner i tabell</label>
                    <div style={{ marginTop: 6 }}>
                        <CheckboxRow label="kWh (energiforbruk)" checked={tog('showColEnergy')} onChange={v => onChange({ showColEnergy: v })} />
                        <CheckboxRow label="Strøm (kr)" checked={tog('showColPower')} onChange={v => onChange({ showColPower: v })} />
                        <CheckboxRow label="Energiledd (kr)" checked={tog('showColGrid')} onChange={v => onChange({ showColGrid: v })} />
                        <CheckboxRow label="Kapasitetsledd (kr)" checked={tog('showColCapacity')} onChange={v => onChange({ showColCapacity: v })} />
                    </div>
                </div>
            )}
        </div>
    );
}

function EnergyDashboardDeviceConfig({ settings, onChange }) {
    const devices = settings?.devices || [];
    const [editingIdx, setEditingIdx] = useState(null);
    const [editName, setEditName] = useState('');
    const [selectedPrefix, setSelectedPrefix] = useState('');

    const available = discoverEnergyCostDevices();
    const addedPrefixes = new Set(devices.map(d => d.prefix));
    const notAdded = available.filter(d => !addedPrefixes.has(d.prefix));

    const addDevice = () => {
        if (!selectedPrefix) return;
        const found = available.find(d => d.prefix === selectedPrefix);
        if (!found) return;
        onChange({ devices: [...devices, { prefix: found.prefix, name: found.name }] });
        setSelectedPrefix('');
    };

    const removeDevice = (idx) => {
        const next = devices.filter((_, i) => i !== idx);
        onChange({ devices: next });
    };

    const startEdit = (idx) => {
        setEditingIdx(idx);
        setEditName(devices[idx].name);
    };

    const commitEdit = () => {
        if (editingIdx === null) return;
        const next = devices.map((d, i) => i === editingIdx ? { ...d, name: editName.trim() || d.name } : d);
        onChange({ devices: next });
        setEditingIdx(null);
    };

    const moveUp = (idx) => {
        if (idx === 0) return;
        const next = [...devices];
        [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
        onChange({ devices: next });
    };

    const moveDown = (idx) => {
        if (idx === devices.length - 1) return;
        const next = [...devices];
        [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
        onChange({ devices: next });
    };

    const BAR_COLORS = ['#f97316','#3b82f6','#22c55e','#a855f7','#ec4899','#06b6d4','#eab308','#ef4444','#84cc16','#f59e0b','#6366f1','#0ea5e9','#d946ef','#10b981','#fb923c'];

    return (
        <div>
            {/* Add device */}
            <div className="form-group">
                <label>Legg til enhet</label>
                {notAdded.length === 0 ? (
                    <p style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: 6 }}>
                        {available.length === 0
                            ? 'Ingen kostnadssensorer funnet i Home Assistant. Sjekk at HA er tilkoblet.'
                            : 'Alle tilgjengelige enheter er allerede lagt til.'}
                    </p>
                ) : (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <select
                            value={selectedPrefix}
                            onChange={e => setSelectedPrefix(e.target.value)}
                            style={{
                                flex: 1, padding: '7px 8px',
                                background: 'var(--color-bg-secondary)',
                                border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-md)',
                                color: 'var(--color-text-primary)',
                                fontSize: '0.8rem',
                            }}
                        >
                            <option value="">– Velg enhet –</option>
                            {notAdded.map(d => (
                                <option key={d.prefix} value={d.prefix}>{d.area ? `${d.name} (${d.area})` : d.name}</option>
                            ))}
                        </select>
                        <button
                            onClick={addDevice}
                            disabled={!selectedPrefix}
                            style={{
                                padding: '7px 14px',
                                background: selectedPrefix ? 'var(--color-accent, #3b82f6)' : 'var(--color-bg-secondary)',
                                border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-md)',
                                color: 'var(--color-text-primary)',
                                cursor: selectedPrefix ? 'pointer' : 'default',
                                fontSize: '0.8rem',
                                opacity: selectedPrefix ? 1 : 0.5,
                            }}
                        >
                            Legg til
                        </button>
                    </div>
                )}
            </div>

            {/* Current devices */}
            {devices.length > 0 && (
                <div className="form-group">
                    <label>Konfigurerte enheter ({devices.length})</label>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                        {devices.map((dev, idx) => (
                            <div key={dev.prefix} style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                background: 'var(--color-bg-secondary)',
                                border: '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-md)',
                                padding: '6px 10px',
                            }}>
                                <span style={{
                                    width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                                    background: BAR_COLORS[idx % BAR_COLORS.length],
                                }} />
                                {editingIdx === idx ? (
                                    <input
                                        autoFocus
                                        value={editName}
                                        onChange={e => setEditName(e.target.value)}
                                        onBlur={commitEdit}
                                        onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingIdx(null); }}
                                        style={{
                                            flex: 1, padding: '2px 6px',
                                            background: 'var(--color-bg-primary)',
                                            border: '1px solid var(--color-accent, #3b82f6)',
                                            borderRadius: 4,
                                            color: 'var(--color-text-primary)',
                                            fontSize: '0.8rem',
                                        }}
                                    />
                                ) : (
                                    <span
                                        style={{ flex: 1, cursor: 'pointer', minWidth: 0 }}
                                        onClick={() => startEdit(idx)}
                                        title="Klikk for å endre navn"
                                    >
                                        <div style={{ fontSize: '0.8rem' }}>{dev.name}</div>
                                        {dev.area && <div style={{ fontSize: '0.68rem', opacity: 0.45, marginTop: 1 }}>{dev.area}</div>}
                                    </span>
                                )}
                                <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                                    <button onClick={() => moveUp(idx)} disabled={idx === 0}
                                        style={iconBtnStyle(idx === 0)} title="Flytt opp">↑</button>
                                    <button onClick={() => moveDown(idx)} disabled={idx === devices.length - 1}
                                        style={iconBtnStyle(idx === devices.length - 1)} title="Flytt ned">↓</button>
                                    <button onClick={() => removeDevice(idx)}
                                        style={{ ...iconBtnStyle(false), color: '#ef4444' }} title="Fjern">×</button>
                                </div>
                            </div>
                        ))}
                    </div>
                    <p style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: 6 }}>
                        Klikk på enhetsnavn for å endre det.
                    </p>
                </div>
            )}
        </div>
    );
}


const iconBtnStyle = (disabled) => ({
    padding: '2px 7px',
    background: 'transparent',
    border: '1px solid var(--color-border)',
    borderRadius: 4,
    color: disabled ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
    cursor: disabled ? 'default' : 'pointer',
    fontSize: '0.85rem',
    opacity: disabled ? 0.3 : 0.8,
    lineHeight: 1.4,
});

export default TileSettingsModal;
