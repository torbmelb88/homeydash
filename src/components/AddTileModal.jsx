import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useHomey } from '../context/HomeyContext';
import { storage } from '../services/storage';
import { getDeviceType } from '../services/utils';
import { X, Search, Zap, Thermometer, ToggleLeft, Activity, Trash2, Mail, Blinds, Clock, CloudSun, Video, Globe, Square, Layers, Lock, WashingMachine, Droplets, Disc2, Scissors, BarChart2, Phone, Utensils, UserRound } from 'lucide-react';

const AddTileModal = ({ onClose, onAdd }) => {
    const { devices, api } = useHomey();
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedType, setSelectedType] = useState('all');
    const [activeTab, setActiveTab] = useState('devices'); // 'devices' | 'widgets'

    const filteredDevices = devices.filter(device => {
        // Hide individual entities that are part of a composite — the composite itself is shown instead
        if (device._inComposite) return false;
        const normalizedSearch = searchTerm.toLowerCase();
        const matchesSearch = device.name.toLowerCase().includes(normalizedSearch) ||
                             (normalizedSearch === 'vaskemaskin' && (device.name.toLowerCase().includes('washer') || device.id.toLowerCase().includes('washer')));
        const type = getDeviceType(device);
        const matchesType = selectedType === 'all' || type === selectedType;
        return matchesSearch && matchesType;
    }).sort((a, b) => a.name.localeCompare(b.name));

    const getTypeLabel = (type) => {
        switch (type) {
            case 'light': return 'Lampe';
            case 'thermostat': return 'Termostat';
            case 'ev-charger': return 'Billader';
            case 'switch': return 'Bryter';
            case 'sensor': return 'Sensor';
            case 'trash': return 'Renovasjon';
            case 'postal': return 'Post';
            case 'sunshade': return 'Persienne';
            case 'cleaning': return 'Vaskemaskin';
            case 'water-heater': return 'Varmtvannsbereder';
            case 'vacuum': return 'Støvsuger';
            case 'lawn-mower': return 'Robotklipper';
            case 'appliance': return 'Apparat (smartplugg)';
            case 'presence': return 'Tilstedeværelse';
            default: return 'Ukjent enhet';
        }
    };

    const handleAddDevice = (device) => {
        const type = getDeviceType(device);
        const newTile = {
            id: Date.now().toString(),
            deviceId: device.id,
            type: type,
            size: '1x1', // Default size
            pageId: null, // Will be set by parent
            // Entity-hint så flisen overlever at HA gir composite-enheten ny device-ID
            ...(device.primaryEntityId ? { settings: { fallbackEntityId: device.primaryEntityId } } : {})
        };
        onAdd(newTile);
    };

    const getTypeIcon = (type) => {
        switch (type) {
            case 'light': return <Zap size={16} />;
            case 'thermostat': return <Thermometer size={16} />;
            case 'ev-charger': return <Zap size={16} />;
            case 'switch': return <ToggleLeft size={16} />;
            case 'sensor': return <Activity size={16} />;
            case 'trash': return <Trash2 size={16} />;
            case 'postal': return <Mail size={16} />;
            case 'sunshade': return <Blinds size={16} />;
            case 'cleaning': return <WashingMachine size={16} />;
            case 'water-heater': return <Droplets size={16} />;
            case 'vacuum': return <Disc2 size={16} />;
            case 'lawn-mower': return <Scissors size={16} />;
            case 'appliance': return <Utensils size={16} />;
            case 'presence': return <UserRound size={16} />;
            default: return <Zap size={16} />;
        }
    };

    const handleAddWidget = (type) => {
        const newTile = {
            id: Date.now().toString(),
            type: type,
            size: '2x1', // Default size for widgets
            settings: {}, // Empty settings initially
            pageId: null
        };

        // Default settings per type
        if (type === 'clock') {
            newTile.settings = { design: 'digital', showSeconds: false };
            newTile.size = '2x1';
        } else if (type === 'weather') {
            newTile.settings = { location: '' };
            newTile.size = '2x1';
        } else if (type === 'video') {
            newTile.settings = { streamUrl: '', aspectRatio: '16:9' };
            newTile.size = '2x2';
        } else if (type === 'web') {
            newTile.settings = { url: '', refreshInterval: 0 };
            newTile.size = '2x2';
        } else if (type === 'app-launcher') {
            newTile.settings = { url: '' };
            newTile.size = '1x1';
        } else if (type === 'flow') {
            newTile.size = '2x1';
            newTile.settings = {
                label: '',
                icon: 'Play',
                color: 'blue',
                flowId: ''
            };
        } else if (type === 'ev-charger') {
            newTile.size = '2x2';
            newTile.settings = {
                deviceId: ''
            };
        } else if (type === 'door-control') {
            newTile.size = '2x2';
            newTile.settings = {
                deviceId: '', // Lock device
                doorbellDeviceId: '' // Virtual sensor
            };
        } else if (type === 'header') {
            newTile.size = '2x1';
            newTile.settings = {
                title: 'Overskrift',
                theme: 'general'
            };
        } else if (type === 'energy-dashboard') {
            newTile.size = '4x4';
            newTile.settings = {};
        } else if (type === 'hierarchy') {
            newTile.size = '2x2';
            newTile.settings = {
                hierarchy: { name: 'Hus', children: [] },
                unit: 'W'
            };
        } else if (type === 'keypad') {
            newTile.size = '1x1'; // Sleek tile size
            newTile.settings = {
                deviceId: '',
                capabilityId: '',
                pinCode: '0000',
                successValue: 'true'
            };
        } else if (type === 'intercom') {
            newTile.size = '1x1';
            newTile.settings = {
                targetDeviceId: '', // auto-discovered from intercom_native/list_devices when empty
            };
        }

        onAdd(newTile);
    };

    const renderDevices = () => (
        <>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', overflowX: 'auto', paddingBottom: '4px' }}>
                <button
                    className="btn btn-secondary"
                    onClick={() => {
                        onAdd({
                            id: Date.now().toString(),
                            type: 'multi-light',
                            size: '2x2',
                            devices: [],
                            name: 'Multi Lys'
                        });
                    }}
                    style={{ whiteSpace: 'nowrap', padding: '6px 12px', fontSize: '0.85rem' }}
                >
                    <Zap size={14} style={{ marginRight: '6px' }} />
                    Multi Lys
                </button>
                <button
                    className="btn btn-secondary"
                    onClick={() => {
                        onAdd({
                            id: Date.now().toString(),
                            type: 'multi-thermostat',
                            size: '2x2',
                            devices: [],
                            name: 'Multi Termostat'
                        });
                    }}
                    style={{ whiteSpace: 'nowrap', padding: '6px 12px', fontSize: '0.85rem' }}
                >
                    <Thermometer size={14} style={{ marginRight: '6px' }} />
                    Multi Termostat
                </button>
                <button
                    className="btn btn-secondary"
                    onClick={() => {
                        onAdd({
                            id: Date.now().toString(),
                            type: 'multi-sensor',
                            size: '2x2',
                            items: [],
                            name: 'Multi Sensor'
                        });
                    }}
                    style={{ whiteSpace: 'nowrap', padding: '6px 12px', fontSize: '0.85rem' }}
                >
                    <Activity size={14} style={{ marginRight: '6px' }} />
                    Multi Sensor
                </button>
            </div>

            <div className="search-bar" style={{ display: 'flex', gap: '0.5rem', marginBottom: '10px' }}>
                <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                    <input
                        type="text"
                        placeholder="Søk..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        autoFocus
                        style={{ padding: '8px' }}
                    />
                </div>
                <select
                    value={selectedType}
                    onChange={e => setSelectedType(e.target.value)}
                    style={{ width: '130px', padding: '8px' }}
                >
                    <option value="all">Alle</option>
                    <option value="light">Lys</option>
                    <option value="thermostat">Klima</option>
                    <option value="switch">Bryter</option>
                    <option value="sensor">Sensor</option>
                    <option value="trash">Søppel</option>
                    <option value="postal">Post</option>
                    <option value="sunshade">Persienne</option>
                    <option value="cleaning">Vask</option>
                </select>
            </div>

            <div className="device-list" style={{
                overflowY: 'auto',
                flex: 1,
                WebkitOverflowScrolling: 'touch',
                touchAction: 'pan-y',
                overscrollBehavior: 'contain'
            }}>
                {filteredDevices.length === 0 ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                        Ingen enheter funnet
                    </div>
                ) : (
                    filteredDevices.map(device => (
                        <div
                            key={device.id}
                            className="device-item"
                            onClick={() => handleAddDevice(device)}
                            style={{ padding: '8px 12px' }}
                        >
                            <div className="device-icon" style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {device.LucideIcon ? (
                                    <device.LucideIcon size={20} strokeWidth={1.5} />
                                ) : device.iconObj ? (
                                    <img src={api.getIconUrl(device)} alt="" className="device-icon-img" />
                                ) : (
                                    getTypeIcon(getDeviceType(device))
                                )}
                            </div>
                            <div className="device-info">
                                <div className="device-name" style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
                                    {device.name}
                                    <span style={{ fontSize: '0.65rem', opacity: 0.4, fontStyle: 'italic', fontWeight: 400 }}>({device.entityId})</span>
                                </div>
                                <div className="device-zone" style={{ textTransform: 'capitalize', color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>
                                    {getTypeLabel(getDeviceType(device))} {device.zoneName ? ` • ${device.zoneName}` : ''}
                                </div>
                            </div>
                            <button className="btn btn-secondary" style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>
                                +
                            </button>
                        </div>
                    ))
                )}
            </div>
        </>
    );

    const renderWidgets = () => (
        <div className="device-list" style={{
            overflowY: 'auto',
            flex: 1,
            WebkitOverflowScrolling: 'touch',
            touchAction: 'pan-y',
            overscrollBehavior: 'contain'
        }}>
            {/* Same list improvement for widgets can be applied if needed, keeping simple for now */}
            {[
                { type: 'header', icon: <Square size={24} />, name: 'Header / Navigasjon', desc: 'Seksjonsoverskrift med link' },
                { type: 'clock', icon: <Clock size={24} />, name: 'Klokke', desc: 'Viser tid' },
                { type: 'weather', icon: <CloudSun size={24} />, name: 'Vær', desc: 'Værmelding' },
                { type: 'video', icon: <Video size={24} />, name: 'Video', desc: 'Kamera' },

                { type: 'web', icon: <Globe size={24} />, name: 'Nettside', desc: 'Iframe' },
                { type: 'app-launcher', icon: <Zap size={24} />, name: 'App Snarvei', desc: 'Åpne app' },
                { type: 'flow', icon: <Zap size={24} />, name: 'Flow', desc: 'Kjør flow' },
                { type: 'graph', icon: <Activity size={24} />, name: 'Graf', desc: 'Insights' },
                { type: 'hierarchy', icon: <Layers size={24} />, name: 'Hierarki', desc: 'Gruppert visning' },
                { type: 'energy-dashboard', icon: <BarChart2 size={24} />, name: 'Strøm & kostnad', desc: 'Forbruk og kostnad per enhet' },
                { type: 'door-control', icon: <ToggleLeft size={24} />, name: 'Dørkontroll', desc: 'Lås/Klokke' },
                { type: 'keypad', icon: <Lock size={24} />, name: 'PIN-tastatur', desc: 'Kodelås for enheter' },
                { type: 'intercom', icon: <Phone size={24} />, name: 'Intercom', desc: 'Toveis tale til intercom-enheter' },
            ].map(w => (
                <div
                    key={w.type}
                    className="device-item"
                    onClick={() => handleAddWidget(w.type)}
                    style={{ padding: '8px 12px' }}
                >
                    <div className="device-icon" style={{ width: '32px', height: '32px' }}>
                        {w.icon}
                    </div>
                    <div className="device-info">
                        <div className="device-name" style={{ fontSize: '0.9rem' }}>{w.name}</div>
                        <div className="device-zone" style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>
                            {w.desc}
                        </div>
                    </div>
                    <button className="btn btn-secondary" style={{ padding: '0.2rem 0.6rem', fontSize: '0.75rem' }}>
                        +
                    </button>
                </div>
            ))}
        </div>
    );

    return createPortal(
        <div className="modal">
            <div className="modal-content" style={{ maxWidth: '600px', height: '90vh', display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header" style={{ padding: '12px 16px', marginBottom: 0 }}>
                    <h2 style={{ fontSize: '1.2rem', margin: 0 }}>Legg til flis</h2>
                    <button className="icon-btn close-modal" onClick={onClose}>
                        <X size={24} />
                    </button>
                </div>

                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', flex: 1, padding: '0 16px 16px 16px', overflow: 'hidden' }}>
                    {/* Tabs */}
                    <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '0.5rem', flexShrink: 0 }}>
                        <button
                            onClick={() => setActiveTab('devices')}
                            style={{
                                flex: 1,
                                padding: '0.75rem',
                                borderBottom: activeTab === 'devices' ? '2px solid var(--color-accent-primary)' : 'none',
                                color: activeTab === 'devices' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                                fontWeight: activeTab === 'devices' ? 600 : 400,
                                fontSize: '0.9rem'
                            }}
                        >
                            Enheter
                        </button>
                        <button
                            onClick={() => setActiveTab('widgets')}
                            style={{
                                flex: 1,
                                padding: '0.75rem',
                                borderBottom: activeTab === 'widgets' ? '2px solid var(--color-accent-primary)' : 'none',
                                color: activeTab === 'widgets' ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                                fontWeight: activeTab === 'widgets' ? 600 : 400,
                                fontSize: '0.9rem'
                            }}
                        >
                            Widgets
                        </button>
                    </div>

                    {activeTab === 'devices' ? renderDevices() : renderWidgets()}
                </div>
            </div>
        </div>,
        document.body
    );
};

export default AddTileModal;
