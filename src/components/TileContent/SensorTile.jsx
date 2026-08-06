import React from 'react';
import { useHomey } from '../../context/HomeyContext';
import TileCapabilities from '../TileCapabilities';
import { Zap, Thermometer, Droplets, Battery, Gauge, Wind, Activity, Sun } from 'lucide-react';

const getCapabilityIcon = (capId) => {
    if (!capId) return null;
    if (capId.includes('power') || capId.includes('voltage') || capId.includes('current')) return <Zap size={24} />;
    if (capId.includes('temperature')) return <Thermometer size={24} />;
    if (capId.includes('humidity')) return <Droplets size={24} />;
    if (capId.includes('battery')) return <Battery size={24} />;
    if (capId.includes('pressure')) return <Gauge size={24} />;
    if (capId.includes('wind')) return <Wind size={24} />;
    if (capId.includes('motion') || capId.includes('vibration')) return <Activity size={24} />;
    if (capId.includes('luminance')) return <Sun size={24} />;
    return null;
};

const SensorTile = ({ tile, device }) => {
    const { api } = useHomey();

    // Determine primary capability
    // 1. User selected primary capability
    // 2. First capability in device.capabilities (naive fallback)
    let primaryCapId = tile.primaryCapability;
    if (!primaryCapId && device.capabilities && device.capabilities.length > 0) {
        // Try to find a "sensible" default if not specified (e.g. measure_power over meter_power)
        // For now, just take the first one that starts with 'measure_'
        primaryCapId = device.capabilities.find(c => c.startsWith('measure_')) || device.capabilities[0];
    }

    const primaryCapObj = device.capabilitiesObj?.[primaryCapId];
    const primaryVal = primaryCapObj?.value;
    const units = primaryCapObj?.units || '';

    // Icon logic:
    // 1. Use mapped icon for the capability
    // 2. Fallback to device icon (which is already in the header in Tile.jsx? No, Tile.jsx puts it in header)
    // The user wants an icon *on the tile*. Tile.jsx renders the header with icon.
    // If we want a specific icon for the *value*, we can render it here.
    // The screenshot shows a big icon in top left. Tile.jsx handles the standard icon.
    // If we want to override or add to it, we can.
    // But maybe the user just wants the standard icon to be relevant?
    // "Er det mulig å hente ikonene homey bruker for hver enkelt verdi?"
    // If I render an icon here, it might duplicate the header icon.
    // Let's render the capability icon *above* the value if it exists, similar to LightTile?
    // Or just rely on the header icon?
    // The user screenshot shows: Icon (top left), Name, Value.
    // This matches the standard Tile layout (Header with Icon/Name, Content).
    // So if I want the *Header Icon* to change based on capability, I would need to change Tile.jsx or pass it up.
    // But Tile.jsx uses `api.getIconUrl(device)`.
    // If the user wants a *different* icon (e.g. lightning for power), maybe I should render it in the content area?
    // The screenshot shows the icon in the top left, which IS the header icon position.
    // So the user probably wants the *Tile Icon* to reflect the *Capability*.
    // But `Tile.jsx` controls the header.
    // I can't easily change the header icon from here without lifting state or changing Tile.jsx.
    // HOWEVER, I can render a *large* icon in the center if I want, or just next to the value.
    // Let's look at the screenshot again.
    // It looks like a standard tile. Icon top left. Name below it? No, Name is centered?
    // Wait, the screenshot shows:
    // [Icon] (top left)
    // [Strømmåler] (Centered Title)
    // [1132] (Centered Value)
    // This looks like the standard layout.
    // So the user wants the *Icon in the top left* to be "passende" (fitting).
    // Currently it uses the device icon.
    // If the device is a "Sensor", it might have a generic sensor icon.
    // If it's a "Power Meter", it might have a plug icon.
    // If the user wants to *change* it to a specific icon for "Watt", they might want the "Lightning" icon.
    // I can't easily change the top-left icon from `SensorTile`.
    // BUT, I can hide the default header icon (via CSS or prop) and render my own?
    // No, that's messy.
    // Maybe I can just render the icon *next to the value*?
    // "jeg vil ha mulighet til å velge enhet... og også legge på et passende ikon".
    // Maybe they mean an icon *for the value*.
    // Let's try rendering the icon *above* the value in the content area.
    // And let's make sure the value + unit is displayed.

    const CapIcon = getCapabilityIcon(primaryCapId);

    return (
        <div className="tile-content" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', padding: '10px', position: 'relative', gap: '16px' }}>
            {/* If we want to show the capability icon, we can put it here. 
                If it duplicates the device icon, the user might not like it. 
                But since they asked for it, I'll add it. 
                Maybe as a background watermark? Or just above the value.
            */}



            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', width: '100%', flexDirection: 'column', gap: '5px' }}>
                <div style={{ color: 'var(--color-accent-primary)', opacity: 0.8, marginBottom: '5px' }}>
                    {device.LucideIcon ? (
                        <device.LucideIcon size={24} strokeWidth={1.5} />
                    ) : (
                        CapIcon || null
                    )}
                </div>
                {primaryVal !== undefined && (
                    <div style={{ fontSize: '1.8rem', fontWeight: 700, lineHeight: 1 }}>
                        {primaryVal}
                        {units && <span style={{ fontSize: '0.9rem', fontWeight: 400, marginLeft: '4px', color: 'var(--color-text-secondary)' }}>{units}</span>}
                    </div>
                )}
                {/* Show title of capability if it's not the device name? 
                     Often useful to know WHAT the value is (e.g. "Effekt", "Temperatur").
                     If the user named the tile "Stue", seeing "22" is ambiguous. "22 °C" is better.
                     "1132 W" is clear.
                 */}
                {primaryCapObj?.title && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                        {primaryCapObj.title}
                    </div>
                )}
            </div>

            {/* Render selected capabilities */}
            {tile.capabilities && tile.capabilities.length > 0 && (
                <TileCapabilities device={device} capabilities={tile.capabilities} />
            )}
        </div>
    );
};

export default SensorTile;
