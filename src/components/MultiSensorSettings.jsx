import React, { useState, useRef, useEffect } from 'react';
import { Plus, Trash2, Search, X, Activity, Thermometer, Droplets, Zap, Gauge, Wind,
    Sun, Eye, Volume2, Battery, BatteryCharging, Plug, Power, Lightbulb, Flame,
    Snowflake, Cloud, CloudRain, CloudSnow, Cloudy, Sunrise, Sunset,
    Home, Building2, DoorOpen, Lock, Unlock, Bell, BellOff,
    Waves, Droplet, GlassWater, Sprout, Leaf, TreePine,
    Cpu, Wifi, Signal, Radio, Bluetooth, Monitor,
    TrendingUp, TrendingDown, BarChart2, BarChart,
    Car, Bike, Truck, Footprints,
    Clock, Timer, AlarmClock,
    Lamp, LampDesk, Flashlight,
    AirVent, Fan, Refrigerator, WashingMachine, Microwave,
    ShieldCheck, AlertTriangle, Info, CheckCircle,
    Coins, CreditCard, DollarSign,
    Compass, Navigation, MapPin,
    PersonStanding, Users, Baby,
    SunMedium, CloudSun, Umbrella, Tornado, Pencil,
} from 'lucide-react';

const ALL_ICONS = [
    { id: 'thermometer',     label: 'Termometer',      tags: 'temperatur varme kulde grader', Icon: Thermometer },
    { id: 'flame',           label: 'Flamme',           tags: 'varme ild brann oppvarming', Icon: Flame },
    { id: 'snowflake',       label: 'Snøfnugg',         tags: 'kulde is frost vinter', Icon: Snowflake },
    { id: 'sun',             label: 'Sol',              tags: 'sol varme lys sommer', Icon: Sun },
    { id: 'sun-medium',      label: 'Sol (medium)',     tags: 'sol varme lys', Icon: SunMedium },
    { id: 'sunrise',         label: 'Soloppgang',       tags: 'morgen soloppgang', Icon: Sunrise },
    { id: 'sunset',          label: 'Solnedgang',       tags: 'kveld solnedgang', Icon: Sunset },
    { id: 'droplets',        label: 'Vanndråper',       tags: 'fuktighet luftfuktighet regn vann', Icon: Droplets },
    { id: 'droplet',         label: 'Vanndråpe',        tags: 'fuktighet vann drypp', Icon: Droplet },
    { id: 'waves',           label: 'Bølger',           tags: 'vann hav sjø bølger', Icon: Waves },
    { id: 'glass-water',     label: 'Glass vann',       tags: 'vann drikke væske', Icon: GlassWater },
    { id: 'umbrella',        label: 'Paraply',          tags: 'regn vær paraply', Icon: Umbrella },
    { id: 'cloud',           label: 'Sky',              tags: 'sky vær skyet', Icon: Cloud },
    { id: 'cloud-rain',      label: 'Regn',             tags: 'regn vær nedbør', Icon: CloudRain },
    { id: 'cloud-snow',      label: 'Snø',              tags: 'snø vær nedbør vinter', Icon: CloudSnow },
    { id: 'cloudy',          label: 'Overskyet',        tags: 'skyet vær overskyet', Icon: Cloudy },
    { id: 'cloud-sun',       label: 'Delvis skyet',     tags: 'sol sky vær delvis', Icon: CloudSun },
    { id: 'wind',            label: 'Vind',             tags: 'vind storm blåst', Icon: Wind },
    { id: 'tornado',         label: 'Tornado',          tags: 'storm vind tornado', Icon: Tornado },
    { id: 'compass',         label: 'Kompass',          tags: 'retning kompass vær vindretning', Icon: Compass },
    { id: 'zap',             label: 'Lyn / Strøm',      tags: 'strøm elektrisitet energi kraft watt', Icon: Zap },
    { id: 'battery',         label: 'Batteri',          tags: 'batteri energi lading prosent', Icon: Battery },
    { id: 'battery-charging',label: 'Batteri lader',    tags: 'batteri lading energi', Icon: BatteryCharging },
    { id: 'plug',            label: 'Støpsel',          tags: 'støpsel strøm elektrisitet stikkontakt', Icon: Plug },
    { id: 'power',           label: 'Av/på',            tags: 'strøm av på power knapp', Icon: Power },
    { id: 'gauge',           label: 'Trykkmåler',       tags: 'trykk gauge måler bar pascal', Icon: Gauge },
    { id: 'activity',        label: 'Aktivitet',        tags: 'generell aktivitet signal standard', Icon: Activity },
    { id: 'bar-chart',       label: 'Søylediagram',     tags: 'diagram statistikk data', Icon: BarChart },
    { id: 'bar-chart-2',     label: 'Søylediagram 2',   tags: 'diagram statistikk data', Icon: BarChart2 },
    { id: 'trending-up',     label: 'Stigende',         tags: 'stigning økning trend opp', Icon: TrendingUp },
    { id: 'trending-down',   label: 'Synkende',         tags: 'nedgang synkende trend ned', Icon: TrendingDown },
    { id: 'lightbulb',       label: 'Lyspære',          tags: 'lys lampe lyspære belysning', Icon: Lightbulb },
    { id: 'lamp',            label: 'Lampe',            tags: 'lys lampe belysning', Icon: Lamp },
    { id: 'lamp-desk',       label: 'Bordlampe',        tags: 'lys lampe skrivebord belysning', Icon: LampDesk },
    { id: 'flashlight',      label: 'Lommelykt',        tags: 'lys lommelykt fakkel', Icon: Flashlight },
    { id: 'air-vent',        label: 'Ventilasjon',      tags: 'luft ventilasjon pust co2 vent', Icon: AirVent },
    { id: 'fan',             label: 'Vifte',            tags: 'vifte luft ventilasjon kjøling', Icon: Fan },
    { id: 'sprout',          label: 'Spire',            tags: 'plante luft co2 miljø', Icon: Sprout },
    { id: 'leaf',            label: 'Blad',             tags: 'miljø natur luft plant', Icon: Leaf },
    { id: 'tree-pine',       label: 'Tre',              tags: 'natur tre miljø skog', Icon: TreePine },
    { id: 'home',            label: 'Hjem',             tags: 'hjem hus rom inne', Icon: Home },
    { id: 'building-2',      label: 'Bygning',          tags: 'bygning hus bygg', Icon: Building2 },
    { id: 'door-open',       label: 'Dør',              tags: 'dør åpen lukket kontakt', Icon: DoorOpen },
    { id: 'refrigerator',    label: 'Kjøleskap',        tags: 'kjøleskap kjøkken mat', Icon: Refrigerator },
    { id: 'washing-machine', label: 'Vaskemaskin',      tags: 'vaskemaskin vask klesvask', Icon: WashingMachine },
    { id: 'microwave',       label: 'Mikrobølgeovn',    tags: 'mikrobølgeovn ovn kjøkken mat', Icon: Microwave },
    { id: 'lock',            label: 'Lås',              tags: 'lås sikkerhet låst', Icon: Lock },
    { id: 'unlock',          label: 'Ulåst',            tags: 'ulåst åpen sikkerhet', Icon: Unlock },
    { id: 'bell',            label: 'Klokke/Alarm',     tags: 'alarm klokke varsel lyd', Icon: Bell },
    { id: 'bell-off',        label: 'Stille',           tags: 'stille alarm av varsel', Icon: BellOff },
    { id: 'shield-check',    label: 'Skjold',           tags: 'sikkerhet skjold alarm', Icon: ShieldCheck },
    { id: 'alert-triangle',  label: 'Advarsel',         tags: 'advarsel alarm feil varsel', Icon: AlertTriangle },
    { id: 'check-circle',    label: 'OK',               tags: 'ok godkjent grønt status', Icon: CheckCircle },
    { id: 'volume-2',        label: 'Volum',            tags: 'lyd volum høyttaler støy', Icon: Volume2 },
    { id: 'eye',             label: 'Øye / Lux',        tags: 'synlig lys lux lumen bevegelse kamera', Icon: Eye },
    { id: 'wifi',            label: 'WiFi',             tags: 'wifi nett nettverk signal', Icon: Wifi },
    { id: 'signal',          label: 'Signal',           tags: 'signal styrke nett', Icon: Signal },
    { id: 'bluetooth',       label: 'Bluetooth',        tags: 'bluetooth trådløs', Icon: Bluetooth },
    { id: 'cpu',             label: 'Prosessor',        tags: 'cpu prosessor maskin data', Icon: Cpu },
    { id: 'monitor',         label: 'Skjerm',           tags: 'skjerm monitor display', Icon: Monitor },
    { id: 'radio',           label: 'Radio',            tags: 'radio signal sender', Icon: Radio },
    { id: 'clock',           label: 'Klokke',           tags: 'tid klokke time', Icon: Clock },
    { id: 'timer',           label: 'Tidtaker',         tags: 'tid timer countdown', Icon: Timer },
    { id: 'alarm-clock',     label: 'Vekkerklokke',     tags: 'alarm vekker tid', Icon: AlarmClock },
    { id: 'person-standing', label: 'Person',           tags: 'person bevegelse tilstede', Icon: PersonStanding },
    { id: 'users',           label: 'Brukere',          tags: 'brukere personer tilstede', Icon: Users },
    { id: 'baby',            label: 'Baby',             tags: 'baby barn rom', Icon: Baby },
    { id: 'footprints',      label: 'Fotspor',          tags: 'bevegelse fotspor tilstede', Icon: Footprints },
    { id: 'car',             label: 'Bil',              tags: 'bil kjøretøy garasje', Icon: Car },
    { id: 'bike',            label: 'Sykkel',           tags: 'sykkel transport', Icon: Bike },
    { id: 'truck',           label: 'Lastebil',         tags: 'lastebil transport kjøretøy', Icon: Truck },
    { id: 'navigation',      label: 'Navigasjon',       tags: 'navigasjon retning', Icon: Navigation },
    { id: 'map-pin',         label: 'Sted',             tags: 'sted posisjon lokasjon', Icon: MapPin },
    { id: 'coins',           label: 'Mynter',           tags: 'penger kostnad økonomi krone', Icon: Coins },
    { id: 'credit-card',     label: 'Betalingskort',    tags: 'penger kortbetaling økonomi', Icon: CreditCard },
    { id: 'dollar-sign',     label: 'Pris',             tags: 'pris kostnad økonomi', Icon: DollarSign },
    { id: 'info',            label: 'Info',             tags: 'informasjon status', Icon: Info },
];

export const ICON_MAP = Object.fromEntries(ALL_ICONS.map(i => [i.id, i.Icon]));

const DEFAULT_THRESHOLDS = [
    { upTo: '1', color: '#22c55e' },
    { upTo: '',  color: '#ef4444' },
];

// ─── IconPicker ────────────────────────────────────────────────────────────────

const IconPicker = ({ value, onChange }) => {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const ref = useRef(null);

    useEffect(() => {
        if (!open) return;
        const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    const current = ALL_ICONS.find(i => i.id === value) || ALL_ICONS[0];
    const q = query.toLowerCase();
    const filtered = q
        ? ALL_ICONS.filter(i => i.label.toLowerCase().includes(q) || i.tags.includes(q) || i.id.includes(q))
        : ALL_ICONS;

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <button
                type="button"
                onClick={() => { setOpen(o => !o); setQuery(''); }}
                style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '8px 10px', borderRadius: '6px', cursor: 'pointer',
                    background: 'var(--color-bg-secondary)', color: 'white',
                    border: '1px solid var(--color-border)', width: '100%', fontSize: '0.85rem',
                }}
            >
                <current.Icon size={16} />
                <span style={{ flex: 1, textAlign: 'left' }}>{current.label}</span>
                <span style={{ opacity: 0.5, fontSize: '0.75rem' }}>▾</span>
            </button>

            {open && (
                <div style={{
                    position: 'absolute', zIndex: 1000, bottom: 'calc(100% + 4px)', left: 0, right: 0,
                    background: '#1a2236', border: '1px solid var(--color-border)',
                    borderRadius: '8px', boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
                    display: 'flex', flexDirection: 'column',
                }}>
                    <div style={{ padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', gap: '6px', background: '#1a2236', borderRadius: '8px 8px 0 0' }}>
                        <Search size={14} style={{ opacity: 0.5, flexShrink: 0 }} />
                        <input
                            autoFocus
                            type="text"
                            placeholder="Søk ikon..."
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'white', fontSize: '0.85rem' }}
                        />
                        {query && <button onClick={() => setQuery('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'white', padding: 0 }}><X size={14} /></button>}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '2px', padding: '6px', maxHeight: '220px', overflowY: 'auto', background: '#1a2236', borderRadius: '0 0 8px 8px' }}>
                        {filtered.map(icon => (
                            <button
                                key={icon.id}
                                type="button"
                                title={icon.label}
                                onClick={() => { onChange(icon.id); setOpen(false); }}
                                style={{
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                    gap: '3px', padding: '7px 4px', borderRadius: '6px', cursor: 'pointer',
                                    background: icon.id === value ? 'var(--color-primary)' : 'transparent',
                                    border: 'none', color: 'white', transition: 'background 0.1s',
                                }}
                                onMouseEnter={e => { if (icon.id !== value) e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
                                onMouseLeave={e => { if (icon.id !== value) e.currentTarget.style.background = 'transparent'; }}
                            >
                                <icon.Icon size={18} />
                                <span style={{ fontSize: '0.6rem', opacity: 0.85, textAlign: 'center', lineHeight: 1.2, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{icon.label}</span>
                            </button>
                        ))}
                        {filtered.length === 0 && (
                            <div style={{ gridColumn: '1/-1', padding: '12px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>Ingen ikoner funnet</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── ThresholdEditor ───────────────────────────────────────────────────────────

const ThresholdEditor = ({ thresholds, onChange }) => {
    const rows = thresholds && thresholds.length > 0 ? thresholds : DEFAULT_THRESHOLDS;

    const update = (index, key, val) =>
        onChange(rows.map((t, i) => i === index ? { ...t, [key]: val } : t));

    const addRow = () =>
        onChange([...rows, { upTo: '', color: '#22c55e' }]);

    const removeRow = (index) => {
        if (rows.length <= 1) return;
        onChange(rows.filter((_, i) => i !== index));
    };

    const moveRow = (index, dir) => {
        const updated = [...rows];
        if (dir === 'up' && index > 0)
            [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
        if (dir === 'down' && index < updated.length - 1)
            [updated[index + 1], updated[index]] = [updated[index], updated[index + 1]];
        onChange(updated);
    };

    const inputNum = {
        flex: 1, padding: '4px 6px', borderRadius: '4px', fontSize: '0.85rem',
        background: 'var(--color-bg-secondary)', color: 'white', border: '1px solid var(--color-border)',
        textAlign: 'right', minWidth: 0,
    };

    return (
        <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginBottom: '2px' }}>
                Regler sjekkes fra topp til bunn. Tom verdi = standard (brukes sist).
            </div>
            {rows.map((t, i) => {
                const isEmpty = t.upTo === undefined || t.upTo === null || t.upTo === '';
                return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <input
                            type="color"
                            value={t.color || '#6b7280'}
                            onChange={e => update(i, 'color', e.target.value)}
                            title="Velg farge"
                            style={{ width: '30px', height: '28px', border: 'none', borderRadius: '4px', cursor: 'pointer', flexShrink: 0, padding: '1px' }}
                        />
                        <span style={{ fontSize: '0.8rem', opacity: 0.6, flexShrink: 0 }}>≤</span>
                        <input
                            type="number"
                            step="any"
                            value={t.upTo ?? ''}
                            onChange={e => update(i, 'upTo', e.target.value)}
                            placeholder="standard"
                            style={{ ...inputNum, fontStyle: isEmpty ? 'italic' : 'normal', opacity: isEmpty ? 0.6 : 1 }}
                        />
                        <button className="icon-btn" disabled={i === 0} onClick={() => moveRow(i, 'up')} title="Flytt opp">↑</button>
                        <button className="icon-btn" disabled={i === rows.length - 1} onClick={() => moveRow(i, 'down')} title="Flytt ned">↓</button>
                        <button
                            className="icon-btn"
                            onClick={() => removeRow(i)}
                            disabled={rows.length <= 1}
                            style={{ color: rows.length > 1 ? 'var(--color-error)' : undefined }}
                            title="Fjern regel"
                        >
                            <X size={14} />
                        </button>
                    </div>
                );
            })}
            <button
                className="btn btn-secondary"
                onClick={addRow}
                style={{ marginTop: '2px', fontSize: '0.8rem', padding: '4px 8px' }}
            >
                <Plus size={13} style={{ marginRight: '4px' }} />
                Legg til terskelregel
            </button>
        </div>
    );
};

// ─── ItemForm ─────────────────────────────────────────────────────────────────

const emptyForm = { device: '', capability: '', icon: 'activity', label: '', colorMode: 'auto', staticColor: '#6b8cba', thresholds: DEFAULT_THRESHOLDS };

const ItemForm = ({ devices, initial, onSave, onCancel, saveLabel }) => {
    const [form, setForm] = useState({ ...emptyForm, ...initial });
    const [showDeviceSearch, setShowDeviceSearch] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const set = (key, val) => {
        setForm(f => {
            const next = { ...f, [key]: val };
            // Auto-initialize thresholds when switching to threshold mode
            if (key === 'colorMode' && val === 'threshold' && (!next.thresholds || next.thresholds.length === 0)) {
                next.thresholds = DEFAULT_THRESHOLDS;
            }
            return next;
        });
    };

    const filteredDevices = devices.filter(d =>
        d.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getCapabilities = (deviceId) => {
        const d = devices.find(dev => dev.id === deviceId);
        if (!d) return [];
        return Object.entries(d.capabilitiesObj || {}).map(([id, obj]) => ({ id, title: obj.title || id }));
    };

    const inputStyle = {
        width: '100%', padding: '8px', borderRadius: '4px',
        background: 'var(--color-bg-secondary)', color: 'white',
        border: '1px solid var(--color-border)'
    };

    const colorMode = form.colorMode || 'auto';

    return (
        <div style={{
            background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)',
            borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px'
        }}>
            {/* Device picker */}
            {showDeviceSearch ? (
                <div style={{ background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)', borderRadius: '8px', padding: '10px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                        <Search size={16} />
                        <input
                            type="text"
                            placeholder="Søk etter enhet..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            autoFocus
                            style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'white' }}
                        />
                        <button className="icon-btn" onClick={() => setShowDeviceSearch(false)}><X size={16} /></button>
                    </div>
                    <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {filteredDevices.map(d => (
                            <button
                                key={d.id}
                                className="btn btn-ghost"
                                onClick={() => {
                                    set('device', d.id);
                                    // Entity-hint så elementet overlever at HA gir composite-enheten ny device-ID
                                    set('entityId', d.primaryEntityId || null);
                                    set('capability', '');
                                    setShowDeviceSearch(false);
                                    setSearchTerm('');
                                }}
                                style={{ justifyContent: 'flex-start', padding: '8px 6px', flexDirection: 'column', alignItems: 'flex-start', gap: '2px', textAlign: 'left' }}
                            >
                                <span style={{ fontSize: '0.9rem' }}>{d.name}</span>
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', display: 'flex', gap: '8px' }}>
                                    {d.zoneName && <span>{d.zoneName}</span>}
                                    {d.entityId && <span style={{ opacity: 0.6 }}>{d.entityId}</span>}
                                </span>
                            </button>
                        ))}
                        {filteredDevices.length === 0 && (
                            <div style={{ padding: '8px', color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>Ingen enheter funnet</div>
                        )}
                    </div>
                </div>
            ) : (
                <button
                    className="btn btn-secondary"
                    onClick={() => setShowDeviceSearch(true)}
                    style={{ justifyContent: 'space-between', width: '100%', marginBottom: '4px' }}
                >
                    <span>{form.device ? devices.find(d => d.id === form.device)?.name : 'Velg enhet...'}</span>
                    <Search size={16} />
                </button>
            )}

            {form.device && (
                <select value={form.capability} onChange={e => set('capability', e.target.value)} style={inputStyle}>
                    <option value="">Velg egenskap...</option>
                    {getCapabilities(form.device).map(cap => (
                        <option key={cap.id} value={cap.id}>{cap.title}</option>
                    ))}
                </select>
            )}

            <input
                type="text"
                placeholder="Navn (valgfritt)"
                value={form.label}
                onChange={e => set('label', e.target.value)}
                style={inputStyle}
            />

            <IconPicker value={form.icon} onChange={val => set('icon', val)} />

            {/* Color config */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '8px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', display: 'block', marginBottom: '6px' }}>Farge</label>
                <select value={colorMode} onChange={e => set('colorMode', e.target.value)} style={{ ...inputStyle }}>
                    <option value="auto">Automatisk (basert på type)</option>
                    <option value="static">Statisk farge</option>
                    <option value="threshold">Terskelbasert</option>
                </select>

                {colorMode === 'static' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
                        <input
                            type="color"
                            value={form.staticColor || '#6b8cba'}
                            onChange={e => set('staticColor', e.target.value)}
                            style={{ width: '40px', height: '34px', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: '2px' }}
                        />
                        <span style={{ fontSize: '0.85rem', opacity: 0.7, fontFamily: 'monospace' }}>{form.staticColor || '#6b8cba'}</span>
                    </div>
                )}

                {colorMode === 'threshold' && (
                    <ThresholdEditor
                        thresholds={form.thresholds}
                        onChange={t => set('thresholds', t)}
                    />
                )}
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                <button className="btn btn-secondary" onClick={onCancel} style={{ flex: 1 }}>Avbryt</button>
                <button
                    className="btn btn-primary"
                    onClick={() => onSave(form)}
                    disabled={!form.device || !form.capability}
                    style={{ flex: 1 }}
                >
                    {saveLabel || 'Lagre'}
                </button>
            </div>
        </div>
    );
};

// ─── MultiSensorSettings ──────────────────────────────────────────────────────

const MultiSensorSettings = ({ devices, items, columns, onChange }) => {
    const [localItems, setLocalItems] = useState(items || []);
    const [localColumns, setLocalColumns] = useState(columns || 'auto');
    const [showAddForm, setShowAddForm] = useState(false);
    const [editIndex, setEditIndex] = useState(null);

    const notify = (newItems, newCols) => onChange({ items: newItems, columns: newCols });

    const handleColumnsChange = (val) => {
        setLocalColumns(val);
        notify(localItems, val);
    };

    const addItem = (form) => {
        const updated = [...localItems, { deviceId: form.device, entityId: form.entityId || null, capability: form.capability, icon: form.icon, label: form.label, colorMode: form.colorMode, staticColor: form.staticColor, thresholds: form.thresholds }];
        setLocalItems(updated);
        notify(updated, localColumns);
        setShowAddForm(false);
    };

    const saveEdit = (form) => {
        const updated = localItems.map((item, i) =>
            i === editIndex
                ? { deviceId: form.device, entityId: form.entityId || null, capability: form.capability, icon: form.icon, label: form.label, colorMode: form.colorMode, staticColor: form.staticColor, thresholds: form.thresholds }
                : item
        );
        setLocalItems(updated);
        notify(updated, localColumns);
        setEditIndex(null);
    };

    const removeItem = (index) => {
        const updated = localItems.filter((_, i) => i !== index);
        setLocalItems(updated);
        notify(updated, localColumns);
    };

    const moveItem = (index, dir) => {
        const updated = [...localItems];
        if (dir === 'up' && index > 0)
            [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
        if (dir === 'down' && index < updated.length - 1)
            [updated[index + 1], updated[index]] = [updated[index], updated[index + 1]];
        setLocalItems(updated);
        notify(updated, localColumns);
    };

    const inputStyle = {
        width: '100%', padding: '8px', borderRadius: '4px',
        background: 'var(--color-bg-secondary)', color: 'white',
        border: '1px solid var(--color-border)'
    };

    return (
        <div className="form-group">
            <label>Kolonner</label>
            <select
                value={localColumns}
                onChange={e => handleColumnsChange(e.target.value)}
                style={{ ...inputStyle, marginBottom: '1rem' }}
            >
                <option value="auto">Automatisk</option>
                {[1, 2, 3, 4, 5, 6].map(n => (
                    <option key={n} value={String(n)}>{n} {n === 1 ? 'Kolonne' : 'Kolonner'}</option>
                ))}
            </select>

            <label>Sensorer</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                {localItems.map((item, index) => {
                    const d = devices.find(dev => dev.id === item.deviceId);
                    if (!d) return null;

                    if (editIndex === index) {
                        return (
                            <ItemForm
                                key={index}
                                devices={devices}
                                initial={{ device: item.deviceId, entityId: item.entityId || null, capability: item.capability, icon: item.icon || 'activity', label: item.label || '', colorMode: item.colorMode || 'auto', staticColor: item.staticColor || '#6b8cba', thresholds: item.thresholds || DEFAULT_THRESHOLDS }}
                                onSave={saveEdit}
                                onCancel={() => setEditIndex(null)}
                                saveLabel="Lagre"
                            />
                        );
                    }

                    const IconComp = ICON_MAP[item.icon] || Activity;
                    const colorMode = item.colorMode || 'auto';
                    const colorDot = colorMode === 'static' ? item.staticColor : colorMode === 'threshold' ? (item.thresholds?.[0]?.color || '#6b7280') : null;

                    return (
                        <div key={index} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            background: 'rgba(255,255,255,0.05)', padding: '8px 10px', borderRadius: '6px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                {colorDot && (
                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: colorDot, flexShrink: 0 }} />
                                )}
                                <IconComp size={16} style={{ opacity: 0.7, flexShrink: 0 }} />
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: '0.9rem' }}>{item.label || d.name}</span>
                                    <span style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)' }}>{item.capability}</span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '2px' }}>
                                <button className="icon-btn" disabled={index === 0} onClick={() => moveItem(index, 'up')}>↑</button>
                                <button className="icon-btn" disabled={index === localItems.length - 1} onClick={() => moveItem(index, 'down')}>↓</button>
                                <button className="icon-btn" onClick={() => { setEditIndex(index); setShowAddForm(false); }} title="Rediger">
                                    <Pencil size={14} />
                                </button>
                                <button className="icon-btn" onClick={() => removeItem(index)} style={{ color: 'var(--color-error)' }}>
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    );
                })}
                {localItems.length === 0 && (
                    <span style={{ color: 'var(--color-text-secondary)', fontStyle: 'italic' }}>Ingen sensorer lagt til</span>
                )}
            </div>

            {showAddForm ? (
                <ItemForm
                    devices={devices}
                    onSave={addItem}
                    onCancel={() => setShowAddForm(false)}
                    saveLabel="Legg til"
                />
            ) : (
                <button className="btn btn-secondary" onClick={() => { setShowAddForm(true); setEditIndex(null); }} style={{ width: '100%' }}>
                    <Plus size={16} style={{ marginRight: '6px' }} />
                    Legg til sensor
                </button>
            )}
        </div>
    );
};

export default MultiSensorSettings;
