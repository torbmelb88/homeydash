import React from 'react';
import { useHomey } from '../../context/HomeyContext';
import { resolveTileDevice } from '../../services/utils';
import { Thermometer, Droplets, Activity, Zap, Wind, Gauge, Battery, Sun, Eye, Volume2,
    BatteryCharging, Plug, Power, Lightbulb, Flame, Snowflake, Cloud, CloudRain, CloudSnow,
    Cloudy, Sunrise, Sunset, Home, Building2, DoorOpen, Lock, Unlock, Bell, BellOff,
    Waves, Droplet, GlassWater, Sprout, Leaf, TreePine, Cpu, Wifi, Signal, Radio, Bluetooth,
    Monitor, TrendingUp, TrendingDown, BarChart2, BarChart, Car, Bike, Truck, Footprints,
    Clock, Timer, AlarmClock, Lamp, LampDesk, Flashlight, AirVent, Fan, Refrigerator,
    WashingMachine, Microwave, ShieldCheck, AlertTriangle, Info, CheckCircle, Coins,
    CreditCard, DollarSign, Compass, Navigation, MapPin, PersonStanding, Users, Baby,
    SunMedium, CloudSun, Umbrella, Tornado,
} from 'lucide-react';

const MultiSensorTile = ({ tile }) => {
    const { devices } = useHomey();
    const items = tile.items || [];

    // Determine columns: default to 1 for vertical stacking like the screenshot if few items, 
    // or use the setting. The screenshot shows a single column of bubbles.
    // However, sticking to the flexible grid logic is safer for different sizes.
    // We will attempt to use the tile columns setting or auto-calculate.
    const columns = tile.columns && tile.columns !== 'auto' ? parseInt(tile.columns) : (items.length > 4 ? 2 : 1);

    const gridStyle = {
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: '16px', // Generous gap like screenshot
        padding: '12px',
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        alignContent: 'center', // Center vertically
        justifyItems: 'center', // Center horizontally
        flex: 1,
        minHeight: 0
    };

    if (items.length === 0) {
        return (
            <div className="tile-content" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-secondary)', fontSize: '0.8rem', textAlign: 'center', padding: '10px' }}>
                <Activity size={24} style={{ marginBottom: '8px', opacity: 0.5 }} />
                <span>Ingen sensorer</span>
                <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>Trykk for å konfigurere</span>
            </div>
        );
    }

    const getIcon = (iconName, size = 20) => {
        const icons = {
            'thermometer': Thermometer, 'droplets': Droplets, 'zap': Zap, 'gauge': Gauge,
            'wind': Wind, 'battery': Battery, 'sun': Sun, 'eye': Eye, 'volume-2': Volume2,
            'battery-charging': BatteryCharging, 'plug': Plug, 'power': Power,
            'lightbulb': Lightbulb, 'flame': Flame, 'snowflake': Snowflake,
            'cloud': Cloud, 'cloud-rain': CloudRain, 'cloud-snow': CloudSnow,
            'cloudy': Cloudy, 'sunrise': Sunrise, 'sunset': Sunset,
            'home': Home, 'building-2': Building2, 'door-open': DoorOpen,
            'lock': Lock, 'unlock': Unlock, 'bell': Bell, 'bell-off': BellOff,
            'waves': Waves, 'droplet': Droplet, 'glass-water': GlassWater,
            'sprout': Sprout, 'leaf': Leaf, 'tree-pine': TreePine,
            'cpu': Cpu, 'wifi': Wifi, 'signal': Signal, 'radio': Radio,
            'bluetooth': Bluetooth, 'monitor': Monitor,
            'trending-up': TrendingUp, 'trending-down': TrendingDown,
            'bar-chart': BarChart, 'bar-chart-2': BarChart2,
            'car': Car, 'bike': Bike, 'truck': Truck, 'footprints': Footprints,
            'clock': Clock, 'timer': Timer, 'alarm-clock': AlarmClock,
            'lamp': Lamp, 'lamp-desk': LampDesk, 'flashlight': Flashlight,
            'air-vent': AirVent, 'fan': Fan, 'refrigerator': Refrigerator,
            'washing-machine': WashingMachine, 'microwave': Microwave,
            'shield-check': ShieldCheck, 'alert-triangle': AlertTriangle,
            'info': Info, 'check-circle': CheckCircle,
            'coins': Coins, 'credit-card': CreditCard, 'dollar-sign': DollarSign,
            'compass': Compass, 'navigation': Navigation, 'map-pin': MapPin,
            'person-standing': PersonStanding, 'users': Users, 'baby': Baby,
            'sun-medium': SunMedium, 'cloud-sun': CloudSun, 'umbrella': Umbrella,
            'tornado': Tornado,
        };
        const IconComp = icons[iconName] || Activity;
        return <IconComp size={size} />;
    };

    const formatValue = (value, capability) => {
        if (value === undefined || value === null) return '-';
        if (typeof value === 'number') {
            if (capability.includes('temperature')) return `${value.toFixed(1)}°`;
            if (capability.includes('humidity')) return `${Math.round(value)}%`;
            if (capability.includes('power')) return `${Math.round(value)}W`;
            if (capability.includes('pressure')) return `${Math.round(value)}hPa`;
        }
        return value.toString();
    };

    const getBubbleColor = (item, value) => {
        const mode = item.colorMode || 'auto';

        if (mode === 'static') {
            return item.staticColor || '#6b8cba';
        }

        if (mode === 'threshold' && item.thresholds && item.thresholds.length > 0) {
            const numVal = typeof value === 'number' ? value : parseFloat(value);
            if (!isNaN(numVal)) {
                for (const t of item.thresholds) {
                    if (t.upTo === undefined || t.upTo === null || t.upTo === '') return t.color;
                    if (numVal <= parseFloat(t.upTo)) return t.color;
                }
            }
            // fallback: last entry (default)
            return item.thresholds[item.thresholds.length - 1]?.color || '#6b7280';
        }

        // auto – based on capability type
        const cap = item.capability;
        if (cap.includes('temperature')) {
            if (value < 0) return '#0ea5e9';
            if (value < 15) return '#0d9488';
            return '#ca8a04';
        }
        if (cap.includes('humidity')) return '#0284c7';
        if (cap.includes('battery')) return value < 20 ? '#ef4444' : value < 50 ? '#eab308' : '#22c55e';
        if (cap.includes('power')) {
            if (value < 500) return '#22c55e';
            if (value <= 1000) return '#f97316';
            return '#ef4444';
        }
        return '#4b5e8a';
    };

    return (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
            {tile.name && <div style={{ width: '100%', fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-secondary)', textAlign: 'left', padding: '4px 8px', marginBottom: '4px', flexShrink: 0 }}>{tile.name}</div>}

            <div className="tile-content multi-sensor-container" style={gridStyle}>
                {items.map((item, index) => {
                    const device = resolveTileDevice(devices, item.deviceId, item.entityId);
                    if (!device) return null;

                    const value = device.capabilitiesObj?.[item.capability]?.value;
                    const icon = item.icon || 'activity';
                    const bg = getBubbleColor(item, value);

                    return (
                        <div key={index} style={{
                            width: '100%',
                            aspectRatio: '1',
                            maxWidth: '110px',
                            minWidth: '80px',
                            background: bg,
                            borderRadius: '50%',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.15)', // Tailwind shadow-lg-ish
                            padding: '8px',
                            position: 'relative',
                            transition: 'transform 0.2s',
                        }}>
                            <div style={{ opacity: 0.9, marginBottom: '2px' }}>
                                {getIcon(icon, 18)}
                            </div>

                            <div style={{
                                fontSize: '1.4rem',
                                fontWeight: 800,
                                lineHeight: 1,
                                textShadow: '0 2px 4px rgba(0,0,0,0.2)',
                                marginBottom: '2px',
                                display: 'flex',
                                alignItems: 'flex-start'
                            }}>
                                {formatValue(value, item.capability).replace(/[^0-9.,-]/g, '')}
                                <span style={{ fontSize: '0.8rem', fontWeight: 600, opacity: 0.9, marginLeft: '1px', marginTop: '2px' }}>
                                    {item.capability.includes('degree') || item.capability.includes('temperature') ? '°' :
                                        item.capability.includes('humidity') ? '%' :
                                            item.capability.includes('power') ? ' W' : ''}
                                </span>
                            </div>

                            <div style={{
                                fontSize: '0.7rem',
                                fontWeight: 600,
                                opacity: 1,
                                textAlign: 'center',
                                maxWidth: '90%',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                textShadow: '0 1px 2px rgba(0,0,0,0.3)'
                            }}>
                                {item.label || device.name}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default MultiSensorTile;
