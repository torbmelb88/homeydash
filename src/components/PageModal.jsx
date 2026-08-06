import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import '../styles/family-page.css';
import {
    // General & UI
    X, Home, Settings, LayoutDashboard, Grid, List, Menu, User, Users, Star, Heart, Music, Film,
    // Rooms & Living
    Sofa, BedDouble, Armchair, Bath, ChefHat, Utensils, Coffee, Tv, Monitor, Speaker, Gamepad2, Dumbbell,
    // Climate & Sensors
    Sun, Moon, Cloud, CloudRain, Wind, Thermometer, Droplets, Flame, Snowflake, Activity,
    // Devices & Energy
    Zap, Power, Battery, Plug2, Lightbulb, Fan, Refrigerator, Haze, Radio,
    // Security & Connectivity
    Lock, Unlock, Shield, Key, Bell, Eye, Video, Camera, Wifi, Signal, Router, Server,
    // Transport & Misc
    Car, Bike, Briefcase, ShoppingBag, Wrench, Hammer, MapPin, Flag,
    // Reorder
    ChevronLeft, ChevronRight
} from 'lucide-react';

const ICONS = {
    // Basics
    Home, Settings, LayoutDashboard, Grid, List, Star, Heart,
    // Living areas
    Sofa, BedDouble, Armchair, Tv, Speaker, Gamepad2, Monitor,
    // Kitchen & Bath
    ChefHat, Utensils, Coffee, Refrigerator, Bath,
    // Climate
    Thermometer, Droplets, Wind, Sun, Moon, Cloud, Snowflake, Flame,
    // Energy & Light
    Zap, Power, Battery, Plug2, Lightbulb, Fan,
    // Security
    Lock, Unlock, Shield, Key, Bell, Video, Camera, Eye,
    // Tech Details
    Wifi, Router, Server, Activity,
    // Lifestyle
    Car, Bike, Dumbbell, ShoppingBag, Briefcase, MapPin
};

const PAGE_TYPES = [
    { key: 'tile',   label: 'Fliser',         Icon: Grid },
    { key: 'iframe', label: 'Fullskjerm',      Icon: Monitor },
    { key: 'family', label: 'Familie',         Icon: Users },
    { key: 'energy', label: 'Energi',          Icon: Zap },
    { key: 'music',  label: 'Musikk',          Icon: Music },
    { key: 'media',  label: 'Mediebibliotek',  Icon: Film },
    { key: 'smoke',  label: 'Røykvarslere',    Icon: Flame },
    { key: 'keypad', label: 'Kodepanel',       Icon: Lock },
];

const PageModal = ({ isOpen, onClose, onSave, onDelete, initialName = '', initialIcon = 'FileText', initialIframeUrl = '', initialPageType = 'tile', title = 'Ny side', pageIndex = -1, pageCount = 0, onMove }) => {
    const [name, setName] = useState(initialName);
    const [selectedIcon, setSelectedIcon] = useState(initialIcon);
    const [iframeUrl, setIframeUrl] = useState(initialIframeUrl);
    const [pageType, setPageType] = useState(initialPageType);

    useEffect(() => {
        if (isOpen) {
            setName(initialName);
            setSelectedIcon(initialIcon || 'FileText');
            setIframeUrl(initialIframeUrl || '');
            setPageType(initialPageType || 'tile');
        }
    }, [isOpen, initialName, initialIcon, initialIframeUrl, initialPageType]);

    const handleSubmit = (e) => {
        e.preventDefault();
        if (name.trim()) {
            onSave(name.trim(), selectedIcon, pageType === 'iframe' ? iframeUrl.trim() : '', pageType);
            onClose();
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="modal">
            <div className="modal-content" style={{ maxWidth: '500px', display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header">
                    <h2>{title}</h2>
                    <button className="icon-btn close-modal" onClick={onClose}>
                        <X size={24} />
                    </button>
                </div>
                {/* form must be flex to allow footer to always be visible */}
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                    <div className="modal-body" style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
                        <div className="form-group">
                            <label>Sidetype</label>
                            <div className="page-type-selector">
                                {PAGE_TYPES.map(({ key, label, Icon }) => (
                                    <button
                                        key={key}
                                        type="button"
                                        className={`page-type-btn ${pageType === key ? 'active' : ''}`}
                                        onClick={() => setPageType(key)}
                                    >
                                        <Icon size={20} />
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Navn på side</label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="F.eks. Stue, Kjøkken..."
                                autoFocus
                            />
                        </div>
                        {onMove && pageIndex >= 0 && pageCount > 1 && (
                        <div className="form-group">
                            <label>Rekkefølge</label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px' }}>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    disabled={pageIndex <= 0}
                                    onClick={() => onMove(-1)}
                                    style={{ padding: '8px 14px', opacity: pageIndex <= 0 ? 0.4 : 1 }}
                                    aria-label="Flytt til venstre"
                                >
                                    <ChevronLeft size={20} />
                                </button>
                                <span style={{ fontSize: '0.9rem', minWidth: '90px', textAlign: 'center' }}>
                                    Side {pageIndex + 1} av {pageCount}
                                </span>
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    disabled={pageIndex >= pageCount - 1}
                                    onClick={() => onMove(1)}
                                    style={{ padding: '8px 14px', opacity: pageIndex >= pageCount - 1 ? 0.4 : 1 }}
                                    aria-label="Flytt til høyre"
                                >
                                    <ChevronRight size={20} />
                                </button>
                            </div>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                Endringen lagres med en gang.
                            </p>
                        </div>
                        )}
                        {pageType === 'iframe' && (
                        <div className="form-group">
                            <label>Fullskjerm URL</label>
                            <input
                                type="url"
                                value={iframeUrl}
                                onChange={e => setIframeUrl(e.target.value)}
                                placeholder="https://example.com/dashboard"
                                style={{ fontFamily: 'monospace', fontSize: '0.9em' }}
                            />
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                Siden viser nettsiden i fullskjerm i stedet for fliser.
                            </p>
                        </div>
                        )}
                        <div className="form-group">
                            <label>Velg ikon</label>
                            <div className="icon-grid" style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(40px, 1fr))',
                                gap: '8px',
                                maxHeight: '160px',
                                overflowY: 'auto',
                                padding: '8px',
                                border: '1px solid rgba(255,255,255,0.1)',
                                borderRadius: '8px',
                                marginTop: '8px'
                            }}>
                                {Object.entries(ICONS).map(([iconName, IconComponent]) => (
                                    <button
                                        key={iconName}
                                        type="button"
                                        className={`icon-select-btn ${selectedIcon === iconName ? 'active' : ''}`}
                                        onClick={() => setSelectedIcon(iconName)}
                                        style={{
                                            padding: '8px',
                                            border: selectedIcon === iconName ? '2px solid var(--color-accent-primary)' : '1px solid rgba(255,255,255,0.1)',
                                            borderRadius: '6px',
                                            background: selectedIcon === iconName ? 'rgba(245,158,11,0.2)' : 'transparent',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: 'var(--color-text-primary)'
                                        }}
                                        title={iconName}
                                    >
                                        <IconComponent size={20} />
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="modal-footer" style={{ flexShrink: 0 }}>
                        {onDelete && (
                            <button
                                type="button"
                                className="btn btn-danger"
                                onClick={onDelete}
                                style={{ marginRight: 'auto' }}
                            >
                                Slett
                            </button>
                        )}
                        <button type="button" className="btn btn-secondary" onClick={onClose}>Avbryt</button>
                        <button type="submit" className="btn btn-primary">Lagre</button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
};

export default PageModal;
