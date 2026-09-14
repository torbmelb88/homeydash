import React, { useState } from 'react';
import * as LucideIcons from 'lucide-react';

// ─────────────────────────────────────────────
//  Tile-type info lookup table
// ─────────────────────────────────────────────
const TILE_TYPE_INFO = {
    // ── Widgets ──
    'keypad': {
        icon: 'Keyboard',
        name: 'Tastatur (PIN-kode)',
        desc: 'Viser et numerisk panel der brukeren kan taste inn en PIN-kode for å utføre handlinger.',
        hint: 'Gå til fanen «Handlinger» for å legge til knapper, og «PIN Kode» for å sette opp kode.',
    },
    'clock': {
        icon: 'Clock',
        name: 'Klokke',
        desc: 'Viser gjeldende klokkeslett i digital eller analog stil.',
        hint: 'Velg design helt til høyre i innstillingene.',
    },
    'weather': {
        icon: 'Cloud',
        name: 'Vær',
        desc: 'Henter og viser værmeldingen fra en tilkoblet værtjeneste.',
        hint: null,
    },
    'video': {
        icon: 'Video',
        name: 'Videoflis',
        desc: 'Viser en livestream fra et kamera eller en videokilde.',
        hint: 'Lim inn streaming-URL-en i innstillingene.',
    },
    'web': {
        icon: 'Globe',
        name: 'Nettsideflis',
        desc: 'Viser en nettside innebygd i dashbordet.',
        hint: 'Lim inn URL-en til nettsiden du vil vise.',
    },
    'app-launcher': {
        icon: 'AppWindow',
        name: 'App-startflis',
        desc: 'Åpner en app eller URL ved klikk.',
        hint: null,
    },
    'graph': {
        icon: 'LineChart',
        name: 'Grafflís',
        desc: 'Tegner en historikkgraf for en sensor eller måling.',
        hint: 'Velg enhet og tidsperiode i innstillingene.',
    },
    'flow': {
        icon: 'Workflow',
        name: 'Flyt-flis',
        desc: 'Kjører en Homey-flyt ved klikk.',
        hint: 'Velg flyten du vil utløse.',
    },
    'ev-charger': {
        icon: 'Zap',
        name: 'El-bil lader',
        desc: 'Viser status og styrer en elbillader.',
        hint: 'Koble til lader-enheten i innstillingene.',
    },
    'door-control': {
        icon: 'DoorOpen',
        name: 'Dørpanel',
        desc: 'Samler kamera, ringeklokke og låsstyring i én flis.',
        hint: 'Velg kamera og låsenhet i innstillingene.',
    },
    'hierarchy': {
        icon: 'LayoutList',
        name: 'Hierarki (Gruppe)',
        desc: 'Viser en liste over enheter i ett rom eller én gruppe.',
        hint: null,
    },
    'header': {
        icon: 'Heading',
        name: 'Overskrift',
        desc: 'En dekorativ tittelblokk uten funksjonalitet.',
        hint: null,
    },

    // ── Multi-tiles ──
    'multi-sensor': {
        icon: 'Activity',
        name: 'Multi-sensor',
        desc: 'Viser sanntidsverdier fra flere sensorer samlet i én flis.',
        hint: 'Legg til sensorer i fanen «Sensorer».',
    },
    'multi-light': {
        icon: 'Lightbulb',
        name: 'Multi-lys',
        desc: 'Grupperer og styrer flere lyskilder som én enhet.',
        hint: 'Legg til lysenheter og velg visningsretning i innstillingene.',
    },
    'multi-thermostat': {
        icon: 'Thermometer',
        name: 'Multi-termostat',
        desc: 'Grupperer flere termostater og lar deg styre dem samlet.',
        hint: 'Legg til termostater og konfigurer hva som vises i «Utvidet (Stor)».',
    },

    // ── Single-device tiles (auto-detected, shown as reference) ──
    'light': {
        icon: 'Lightbulb',
        name: 'Lysflis',
        desc: 'Styrer én lysenhet med av/på, lysstyrke og eventuelt farge.',
        hint: null,
    },
    'switch': {
        icon: 'ToggleRight',
        name: 'Bryter',
        desc: 'Enkel av/på-bryter for en tilkoblet enhet.',
        hint: null,
    },
    'socket': {
        icon: 'Plug',
        name: 'Stikkontakt',
        desc: 'Styrer en smart stikkontakt med av/på og eventuelt strømmåling.',
        hint: null,
    },
    'fan': {
        icon: 'Wind',
        name: 'Ventilator',
        desc: 'Styrer en ventilator med hastighet og retning.',
        hint: null,
    },
    'sensor': {
        icon: 'Gauge',
        name: 'Sensor',
        desc: 'Viser sanntidsdata fra en måleinstrument-enhet.',
        hint: null,
    },
    'thermostat': {
        icon: 'Thermometer',
        name: 'Termostat',
        desc: 'Styrer en klimaenhet med innstilt og faktisk temperatur.',
        hint: 'Konfigurer hva som vises i utvidet modus under «Utvidet (Stor)».',
    },
    'cleaning': {
        icon: 'WashingMachine',
        name: 'Vaskemaskin',
        desc: 'Viser status, program og gjenværende tid for en vaskemaskin.',
        hint: null,
    },
    'trash': {
        icon: 'Trash2',
        name: 'Renovasjon',
        desc: 'Viser neste hentedag for søppel og kildesortering.',
        hint: null,
    },
    'postal': {
        icon: 'Mail',
        name: 'Post',
        desc: 'Varsler om innlevert post i postkassen.',
        hint: null,
    },
    'sunshade': {
        icon: 'Blinds',
        name: 'Solskjerming',
        desc: 'Styrer persienner, markiser eller rullegardiner.',
        hint: null,
    },
    'media': {
        icon: 'MonitorSpeaker',
        name: 'Mediaspiller',
        desc: 'Styrer avspilling, volum og kilde for en medieenhet.',
        hint: null,
    },
    'water-heater': {
        icon: 'Droplets',
        name: 'Varmtvannsbereder',
        desc: 'Styrer og viser status for varmtvannsberederen.',
        hint: null,
    },
    'airfryer': {
        icon: 'ChefHat',
        name: 'AirFryer',
        desc: 'Viser status og styrer en smart air fryer.',
        hint: null,
    },
};

// Tile types that are fixed — no type-override dropdown
const FIXED_TYPE_TILES = new Set([
    'keypad', 'clock', 'weather', 'video', 'web', 'app-launcher',
    'graph', 'flow', 'ev-charger', 'door-control', 'hierarchy', 'header',
    'multi-sensor', 'multi-light', 'multi-thermostat',
]);

// ─────────────────────────────────────────────
//  Component
// ─────────────────────────────────────────────
const UniversalTileSettings = ({ device, originalTile, values, onChange, stretchCandidates = [] }) => {
    const {
        size, customName, forcedType, mainIcon, customIcon, stretchToTileId = '',
    } = values;

    const [iconSearch, setIconSearch] = useState('');

    const tileType = originalTile?.type ?? 'auto';
    const isFixedType = FIXED_TYPE_TILES.has(tileType);

    // ── Size options ──
    const sizes = [];
    for (let rows = 1; rows <= 6; rows++) {
        for (let cols = 1; cols <= 6; cols++) {
            sizes.push({ id: `${cols}x${rows}`, name: `${cols}x${rows}` });
        }
    }

    // ── Icon picker ──
    const filteredIcons = Object.keys(LucideIcons).filter(name =>
        name.toLowerCase().includes(iconSearch.toLowerCase()) &&
        typeof LucideIcons[name] === 'function' &&
        name !== 'createLucideIcon'
    ).slice(0, 20);

    const quickIcons = ['Activity', 'Zap', 'Lightbulb', 'Power', 'Home', 'Settings', 'Bell', 'Camera', 'Lock', 'Fan'];

    // ── Placeholder for name field ──
    const getPlaceholder = () => {
        if (device?.name) return device.name;
        const info = TILE_TYPE_INFO[tileType];
        return info?.name ?? 'Flistitel';
    };

    // ── Type info box data ──
    const typeInfo = TILE_TYPE_INFO[forcedType !== 'auto' && forcedType ? forcedType : tileType] ?? null;
    const TypeIcon = typeInfo?.icon && LucideIcons[typeInfo.icon] ? LucideIcons[typeInfo.icon] : LucideIcons['LayoutGrid'];

    return (
        <div className="universal-settings">

            {/* ── Section: Grunnleggende ── */}
            <div className="settings-section">

                <div className="form-group">
                    <label>Navn (valgfritt)</label>
                    <input
                        type="text"
                        value={customName}
                        onChange={e => onChange('customName', e.target.value)}
                        placeholder={getPlaceholder()}
                    />
                </div>

                <div className="form-group">
                    <label>Størrelse</label>
                    <select
                        value={size}
                        onChange={e => onChange('size', e.target.value)}
                        style={{
                            width: '100%',
                            padding: '8px',
                            background: 'var(--color-bg-secondary)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-md)',
                            color: 'var(--color-text-primary)',
                        }}
                    >
                        {sizes.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label>Fyll ned til bunnen av flis</label>
                    <select
                        className="select-input"
                        value={stretchToTileId}
                        onChange={e => onChange('stretchToTileId', e.target.value)}
                        style={{
                            width: '100%',
                            padding: '8px',
                            background: 'var(--color-bg-secondary)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-md)',
                            color: 'var(--color-text-primary)',
                        }}
                    >
                        <option value="">– Ingen (naturlig høyde) –</option>
                        {stretchCandidates.map(c => (
                            <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                    </select>
                    <div className="hint">
                        Flisen forlenges så bunnkanten møter den valgte flisen når de ligger side om side.
                        Ligger de ikke ved siden av hverandre (f.eks. på mobil), beholdes naturlig høyde.
                    </div>
                </div>

                {/* Type override — only for non-fixed types */}
                {!isFixedType && (
                    <div className="form-group">
                        <label>Flistype (Overstyring)</label>
                        <select
                            value={forcedType || 'auto'}
                            onChange={e => onChange('forcedType', e.target.value)}
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
                            <option value="light">Lys</option>
                            <option value="switch">Bryter</option>
                            <option value="socket">Stikkontakt</option>
                            <option value="fan">Ventilator</option>
                            <option value="sensor">Sensor</option>
                            <option value="thermostat">Termostat</option>
                            <option value="cleaning">Vaskemaskin</option>
                            <option value="trash">Renovasjon</option>
                            <option value="postal">Post</option>
                            <option value="sunshade">Solskjerming</option>
                            <option value="media">Media</option>
                            <option value="water-heater">Varmtvannsbereder</option>
                            <option value="airfryer">AirFryer</option>
                        </select>
                    </div>
                )}
            </div>

            {/* ── Section: Flistype info-boks ── */}
            {typeInfo && (
                <div style={{
                    marginTop: '20px',
                    borderTop: '1px solid rgba(255,255,255,0.08)',
                    paddingTop: '20px',
                }}>
                    <h3 style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px', color: 'var(--color-text-secondary)' }}>
                        Flistype
                    </h3>
                    <div style={{
                        display: 'flex',
                        gap: '14px',
                        alignItems: 'flex-start',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.09)',
                        borderRadius: '10px',
                        padding: '14px',
                    }}>
                        <div style={{
                            flexShrink: 0,
                            width: '40px',
                            height: '40px',
                            borderRadius: '8px',
                            background: 'linear-gradient(135deg, var(--color-accent-primary), var(--color-accent-secondary, var(--color-accent-primary)))',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#fff',
                            opacity: 0.9,
                        }}>
                            <TypeIcon size={20} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '4px', color: 'var(--color-text-primary)' }}>
                                {typeInfo.name}
                            </div>
                            <div style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                                {typeInfo.desc}
                            </div>
                            {typeInfo.hint && (
                                <div style={{
                                    marginTop: '8px',
                                    fontSize: '0.8rem',
                                    color: 'var(--color-accent-primary)',
                                    background: 'rgba(var(--color-accent-rgb, 100,100,255), 0.08)',
                                    borderRadius: '6px',
                                    padding: '6px 10px',
                                    lineHeight: 1.4,
                                }}>
                                    💡 {typeInfo.hint}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Section: Ikon ── */}
            <div className="settings-section" style={{ marginTop: '20px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '20px' }}>
                <h3 style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '14px', color: 'var(--color-text-secondary)' }}>
                    Ikon
                </h3>

                <div className="form-group">
                    <label>Søk etter Lucide-ikon</label>
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                        <div style={{ flex: 1 }}>
                            <input
                                type="text"
                                placeholder="Søk (eks. 'home', 'bolt')…"
                                value={iconSearch}
                                onChange={e => setIconSearch(e.target.value)}
                                style={{ width: '100%', padding: '8px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--color-text-primary)' }}
                            />
                        </div>
                        {mainIcon && LucideIcons[mainIcon] ? (
                            <div style={{ padding: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', display: 'flex', alignItems: 'center' }}>
                                {React.createElement(LucideIcons[mainIcon], { size: 24 })}
                            </div>
                        ) : (
                            <div style={{ padding: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', width: '40px', height: '40px' }} />
                        )}
                    </div>
                    {iconSearch && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', maxHeight: '150px', overflowY: 'auto', padding: '4px' }}>
                            {filteredIcons.map(name => (
                                <button
                                    key={name}
                                    className={`icon-picker-btn ${mainIcon === name ? 'active' : ''}`}
                                    onClick={() => onChange('mainIcon', name)}
                                    title={name}
                                    style={{
                                        padding: '8px',
                                        background: mainIcon === name ? 'var(--color-accent-primary)' : 'rgba(255,255,255,0.05)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '4px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        color: mainIcon === name ? '#fff' : 'inherit',
                                    }}
                                >
                                    {React.createElement(LucideIcons[name], { size: 20 })}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="form-group" style={{ marginTop: '12px' }}>
                    <label>Hurtigvalg</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                        {quickIcons.map(name => {
                            const IconCmp = LucideIcons[name];
                            if (!IconCmp) return null;
                            return (
                                <button
                                    key={name}
                                    className={`icon-picker-btn ${customIcon === name ? 'active' : ''}`}
                                    onClick={() => onChange('customIcon', customIcon === name ? '' : name)}
                                    title={name}
                                    style={{
                                        padding: '8px',
                                        background: customIcon === name ? 'var(--color-accent-primary)' : 'rgba(255,255,255,0.05)',
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: '4px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        color: customIcon === name ? '#fff' : 'inherit',
                                    }}
                                >
                                    <IconCmp size={20} />
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

        </div>
    );
};

export default UniversalTileSettings;
