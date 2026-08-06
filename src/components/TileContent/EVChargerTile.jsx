import React from 'react';
import { Zap, Plug, Lock, Unlock, BatteryCharging, Thermometer, WifiOff } from 'lucide-react';
import { useHomey } from '../../context/HomeyContext';
import useIsMobile from '../../hooks/useIsMobile';

// Zaptec mode values → norsk statustekst + stil
const CHARGE_MODE_MAP = {
    // Zaptec HA-integrasjon
    disconnected:          { text: 'Frakoblet',   color: 'var(--color-text-secondary)', Icon: Plug,           charging: false },
    connected_requesting:  { text: 'Tilkoblet',   color: 'var(--color-info)',           Icon: Plug,           charging: false },
    connected_charging:    { text: 'Lader',        color: 'var(--color-success)',        Icon: Zap,            charging: true  },
    connected_finished:    { text: 'Ferdigladet', color: 'var(--color-success)',        Icon: BatteryCharging, charging: false },
    waiting:               { text: 'Venter',       color: 'var(--color-info)',           Icon: Plug,           charging: false },
    charging:              { text: 'Lader',        color: 'var(--color-success)',        Icon: Zap,            charging: true  },
    charge_done:           { text: 'Ferdigladet', color: 'var(--color-success)',        Icon: BatteryCharging, charging: false },
    completed:             { text: 'Ferdigladet', color: 'var(--color-success)',        Icon: BatteryCharging, charging: false },
    // Homey-native legacy
    Charging:              { text: 'Lader',        color: 'var(--color-success)',        Icon: Zap,            charging: true  },
    'Charging finished':   { text: 'Ferdigladet', color: 'var(--color-success)',        Icon: BatteryCharging, charging: false },
    charging_finished:     { text: 'Ferdigladet', color: 'var(--color-success)',        Icon: BatteryCharging, charging: false },
    finished:              { text: 'Ferdigladet', color: 'var(--color-success)',        Icon: BatteryCharging, charging: false },
    Disconnected:          { text: 'Frakoblet',   color: 'var(--color-text-secondary)', Icon: Plug,           charging: false },
    Connected:             { text: 'Tilkoblet',   color: 'var(--color-info)',           Icon: Plug,           charging: false },
};

// Hurtigvalg for ladestrøm (A)
const CURRENT_PRESETS = [0, 6, 10, 16, 25];

const EVChargerTile = ({ tile, device, expanded }) => {
    const { api } = useHomey();
    const isMobile = useIsMobile();
    const settings = tile.settings || {};
    const isHA = device?.isHA || device?.hubType === 'hass';

    // Capabilities
    const power               = device?.capabilitiesObj?.measure_power?.value ?? 0;
    const sessionEnergy       = device?.capabilitiesObj?.['meter_power.current_session']?.value ?? 0;
    const lastSession         = device?.capabilitiesObj?.['meter_power.last_session']?.value ?? 0;
    const totalEnergy         = device?.capabilitiesObj?.meter_power?.value ?? 0;
    const isOnline            = device?.capabilitiesObj?.online?.value ?? true;
    const cableLocked         = device?.capabilitiesObj?.cable_permanent_lock?.value ?? false;
    const temperature         = device?.capabilitiesObj?.measure_temperature?.value;
    const chargeMode          = device?.capabilitiesObj?.charge_mode?.value || '';
    const phase1              = device?.capabilitiesObj?.['measure_current.phase1']?.value ?? 0;
    const phase2              = device?.capabilitiesObj?.['measure_current.phase2']?.value ?? 0;
    const phase3              = device?.capabilitiesObj?.['measure_current.phase3']?.value ?? 0;
    const energyDaily         = device?.capabilitiesObj?.energy_daily?.value ?? 0;
    const energyMonthly       = device?.capabilitiesObj?.energy_monthly?.value ?? 0;
    const costCurrent         = device?.capabilitiesObj?.cost_current?.value ?? 0;
    const costDaily           = device?.capabilitiesObj?.cost_daily?.value ?? 0;
    const costMonthly         = device?.capabilitiesObj?.cost_monthly?.value ?? 0;
    const allocatedCurrent    = device?.capabilitiesObj?.allocated_current?.value ?? 0;
    const availableCurrentLimit = device?.capabilitiesObj?.available_current_limit?.value ?? 0;

    const chargingButton = device?.capabilitiesObj?.charging_button?.value ?? false;
    const modeCharging = CHARGE_MODE_MAP[chargeMode]?.charging ?? false;
    // Fallback: effekt > 10W er det mest pålitelige ladetegnet
    const powerCharging = power > 10;
    const isCharging = modeCharging || powerCharging || (!isHA && chargingButton);

    // Status – mode-map slår inn, ellers fallback basert på isCharging
    const modeInfo = CHARGE_MODE_MAP[chargeMode] || null;
    let statusColor, statusText, StatusIcon;
    if (modeInfo) {
        ({ color: statusColor, text: statusText, Icon: StatusIcon } = modeInfo);
    } else if (isCharging) {
        statusColor = 'var(--color-success)'; statusText = 'Lader'; StatusIcon = Zap;
    } else {
        statusColor = 'var(--color-text-secondary)'; statusText = 'Frakoblet'; StatusIcon = Plug;
    }

    // Handlers
    const setCurrentLimit = async (amps, e) => {
        e?.stopPropagation();
        try {
            await api.setCapability(device.id, 'available_current_limit', amps);
        } catch (err) {
            console.error('Failed to set current limit', err);
        }
    };

    const handleStart = async (e) => {
        e?.stopPropagation();
        if (isHA) {
            await setCurrentLimit(25, e);
        } else {
            if (settings.startChargingFlowId) {
                try { await api.triggerFlow(settings.startChargingFlowId); } catch (err) { console.error(err); }
            } else {
                try { await api.setCapability(device.id, 'charging_button', true); } catch (err) { console.error(err); }
            }
        }
    };

    const handleStop = async (e) => {
        e?.stopPropagation();
        if (isHA) {
            await setCurrentLimit(0, e);
        } else {
            try { await api.setCapability(device.id, 'charging_button', false); } catch (err) { console.error(err); }
        }
    };

    const toggleLock = async (e) => {
        e?.stopPropagation();
        try { await api.setCapability(device.id, 'cable_permanent_lock', !cableLocked); } catch (err) { console.error(err); }
    };

    // ── EXPANDED VIEW ─────────────────────────────────────────────────────────
    if (expanded) {
        return (
            <div className="tile-content expanded-charger" style={{ padding: '0', width: '100%', display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '1.5rem', alignItems: isMobile ? 'stretch' : 'flex-start' }}>

                {/* Status + knapper */}
                <div style={{ flex: isMobile ? '0 0 auto' : '0 0 220px', width: isMobile ? '100%' : undefined, display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '0.5rem' }}>
                        <div style={{
                            width: '64px', height: '64px', borderRadius: '50%',
                            background: `color-mix(in srgb, ${statusColor} 20%, transparent)`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: statusColor
                        }}>
                            <StatusIcon size={32} />
                        </div>
                        <div style={{ fontSize: '1.5rem', fontWeight: 600 }}>{Math.round(power)} W</div>
                        <div style={{ color: statusColor, fontWeight: 500 }}>{statusText}</div>
                    </div>

                    {/* Start/Stopp + Lås */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', width: '100%' }}>
                        {!isHA && (
                            <button
                                className="btn"
                                onClick={isCharging ? handleStop : handleStart}
                                style={{
                                    background: isCharging ? 'var(--color-error)' : 'var(--color-success)',
                                    color: 'white', height: '50px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                                }}
                            >
                                <Zap size={20} />
                                {isCharging ? 'Stopp' : 'Start'}
                            </button>
                        )}
                        <button
                            className="btn btn-secondary"
                            onClick={toggleLock}
                            style={{
                                height: '50px',
                                gridColumn: isHA ? 'span 2' : undefined,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                            }}
                        >
                            {cableLocked ? <Lock size={20} /> : <Unlock size={20} />}
                            {cableLocked ? 'Lås opp kabel' : 'Lås kabel'}
                        </button>
                    </div>
                </div>

                {/* Høyre: strømvelger + statistikk */}
                <div style={{ flex: 1, width: isMobile ? '100%' : undefined, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Strømvelger (kun HA) */}
                    {isHA && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                                Ladestrøm — tildelt: {Number(allocatedCurrent).toFixed(0)} A
                            </span>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                {CURRENT_PRESETS.map(amps => {
                                    const displayLimit = availableCurrentLimit > 0
                                        ? Math.round(availableCurrentLimit)
                                        : (isCharging ? Math.round(allocatedCurrent) : 0);
                                    const isActive = displayLimit === amps;
                                    return (
                                        <button
                                            key={amps}
                                            type="button"
                                            onClick={(e) => setCurrentLimit(amps, e)}
                                            style={{
                                                flex: 1,
                                                height: '40px',
                                                borderRadius: '8px',
                                                border: isActive ? `2px solid ${amps === 0 ? 'var(--color-error)' : 'var(--color-success)'}` : '2px solid rgba(255,255,255,0.15)',
                                                background: isActive
                                                    ? `color-mix(in srgb, ${amps === 0 ? 'var(--color-error)' : 'var(--color-success)'} 20%, transparent)`
                                                    : 'rgba(255,255,255,0.05)',
                                                color: isActive
                                                    ? (amps === 0 ? 'var(--color-error)' : 'var(--color-success)')
                                                    : 'var(--color-text-secondary)',
                                                fontWeight: isActive ? 600 : 400,
                                                fontSize: '0.85rem',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            {amps === 0 ? 'Stopp' : `${amps}A`}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Statistikk */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', width: '100%', background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Økt</span>
                            <span style={{ fontSize: '1.1rem', fontWeight: 500 }}>
                                {isCharging ? sessionEnergy.toFixed(2) : lastSession.toFixed(2)} kWh
                            </span>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Totalt</span>
                            <span style={{ fontSize: '1.1rem', fontWeight: 500 }}>{Math.round(totalEnergy)} kWh</span>
                        </div>
                        {settings.showEnergyDaily !== false && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>I dag</span>
                                <span style={{ fontSize: '1.1rem', fontWeight: 500 }}>{Number(energyDaily).toFixed(2)} kWh</span>
                            </div>
                        )}
                        {settings.showEnergyMonthly && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Denne måneden</span>
                                <span style={{ fontSize: '1.1rem', fontWeight: 500 }}>{Number(energyMonthly).toFixed(2)} kWh</span>
                            </div>
                        )}
                        {settings.showCostDaily !== false && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Kostnad i dag</span>
                                <span style={{ fontSize: '1.1rem', fontWeight: 500 }}>{Number(costDaily).toFixed(2)} kr</span>
                            </div>
                        )}
                        {settings.showCostMonthly && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Kostnad måned</span>
                                <span style={{ fontSize: '1.1rem', fontWeight: 500 }}>{Number(costMonthly).toFixed(2)} kr</span>
                            </div>
                        )}
                        {/* Fasestrømmer */}
                        <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '1rem', marginTop: '0.5rem' }}>
                            {[['Fase 1', phase1], ['Fase 2', phase2], ['Fase 3', phase3]].map(([label, val]) => (
                                <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{label}</span>
                                    <span>{Number(val).toFixed(1)} A</span>
                                </div>
                            ))}
                        </div>
                        {/* Bunnrad: temperatur, tildelt strøm, offline */}
                        <div style={{ gridColumn: 'span 2', display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                            {temperature != null && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Thermometer size={14} />
                                    {Number(temperature).toFixed(1)}°C
                                </div>
                            )}
                            {settings.showAllocatedCurrent && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Zap size={14} />
                                    {Number(allocatedCurrent).toFixed(0)} A tildelt
                                </div>
                            )}
                            {!isOnline && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-error)' }}>
                                    <WifiOff size={14} />
                                    Offline
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ── COMPACT VIEW ──────────────────────────────────────────────────────────
    return (
        <div className="tile-content" style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%', justifyContent: 'space-between', padding: '4px' }}>

            {/* Topp: ikon + lås/offline */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
                <div style={{
                    color: statusColor,
                    background: `color-mix(in srgb, ${statusColor} 15%, transparent)`,
                    padding: '8px', borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <StatusIcon size={24} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    {cableLocked && <Lock size={16} color="var(--color-text-secondary)" />}
                    {!isOnline && <WifiOff size={16} color="var(--color-error)" />}
                    {/* Vis strømgrense for HA når lading pågår */}
                    {isHA && isCharging && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                            {Math.round(availableCurrentLimit > 0 ? availableCurrentLimit : allocatedCurrent)} A
                        </span>
                    )}
                </div>
            </div>

            {/* Midten: effekt */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', margin: 'auto 0' }}>
                <span style={{ fontSize: '1.5rem', fontWeight: 600, lineHeight: 1 }}>
                    {Math.round(power)}
                </span>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>W</span>
            </div>

            {/* Bunn: økt-energi eller statustekst */}
            <div style={{ width: '100%', textAlign: 'center' }}>
                {isCharging ? (
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-success)', fontWeight: 500 }}>
                        +{sessionEnergy.toFixed(2)} kWh
                        {settings.showCostCurrent && costCurrent > 0 && (
                            <span style={{ marginLeft: '6px', opacity: 0.8 }}>· {costCurrent.toFixed(1)} kr/h</span>
                        )}
                    </div>
                ) : (
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                        {statusText}
                    </div>
                )}
            </div>
        </div>
    );
};

export default EVChargerTile;
