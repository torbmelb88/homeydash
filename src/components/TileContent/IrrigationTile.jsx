import React, { useState, useEffect } from 'react';
import { useHomey } from '../../context/HomeyContext';
import { Droplets, Droplet, Battery, AlertTriangle, CloudRain, Lock, Timer, Play, Square, Clock } from 'lucide-react';

// Vanningsautomat (SONOFF SWV-ZF2 via Zigbee2MQTT) – to uavhengige ventiler/soner.
// Bryter PÅ = ventilen åpner og kjører «standardvarighet» (manual_default_settings,
// f.eks. 10 min) og lukker deretter selv. Bryter AV = stopp umiddelbart.

const ALARM_LABELS = {
    water_shortage:            'Vannmangel',
    water_shortage_channel_1:  'Vannmangel sone 1',
    water_shortage_channel_2:  'Vannmangel sone 2',
    water_leakage:             'Lekkasje oppdaget',
    fail_safe:                 'Feilsikring utløst',
    fail_safe_channel_1:       'Feilsikring sone 1',
    fail_safe_channel_2:       'Feilsikring sone 2',
};

const parseDate = (val) => {
    if (!val || val === 'unknown' || val === 'unavailable') return null;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
};

const formatClock = (date) => date.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });

const formatMinutes = (min) => {
    if (min == null || isNaN(min)) return null;
    if (min < 90) return `${Math.round(min)} min`;
    return `${(min / 60).toFixed(1).replace('.', ',')} t`;
};

const IrrigationTile = ({ tile, device, expanded = false }) => {
    const { api, setIsInteracting } = useHomey();

    const ts = tile?.settings || {};
    const zoneName = { 1: ts.zone1Name || 'Sone 1', 2: ts.zone2Name || 'Sone 2' };
    const showRunStats  = ts.showRunStats !== false;
    const showHourStats = ts.showHourStats !== false;
    const showChildLock = ts.showChildLock !== false;

    const getCap = (id) => device?.capabilitiesObj?.[id]?.value;
    const channels = [1, 2].filter(n => device?.capabilities?.includes(`valve_${n}`));

    // Optimistisk visning ved trykk – gjelder bare til nye HA-data kommer inn
    // (overstyringen er knyttet til capabilitiesObj-referansen den ble satt under)
    const [override, setOverride] = useState({ src: null, values: {} });
    const ov = override.src === device.capabilitiesObj ? override.values : {};
    const isOn = (n) => ov[n] ?? (getCap(`valve_${n}`) === true);
    const anyOn = channels.some(isOn);

    // «Nå»-tidspunkt for nedtelling: oppfriskes ved nye HA-data og hvert 5. sekund
    // mens en ventil er åpen (state, ikke Date.now() i render – ren render-funksjon)
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const refresh = () => setNow(Date.now());
        const id = setTimeout(refresh, 0);
        if (!anyOn) return () => clearTimeout(id);
        const iv = setInterval(refresh, 5000);
        return () => { clearTimeout(id); clearInterval(iv); };
    }, [anyOn, device.capabilitiesObj]);

    const manualDuration = getCap('manual_duration'); // min per manuell kjøring
    const battery = getCap('measure_battery');
    const childLock = getCap('child_lock');
    const volumeNow = getCap('irrigation_volume');
    const volumeHour = getCap('irrigation_hour_volume');
    const alarmRaw = getCap('valve_alarm');
    const alarms = (alarmRaw && alarmRaw !== 'normal' && alarmRaw !== 'unknown' && alarmRaw !== 'unavailable')
        ? alarmRaw.split(',').map(s => s.trim()).filter(Boolean)
        : [];
    const rainEnd = parseDate(getCap('rain_delay_end'));
    const rainActive = rainEnd && rainEnd.getTime() > now;

    // Gjenstående tid for en sone: forventet sluttid fra status-sensoren, ellers
    // standardvarighet minus medgått tid (real_time_irrigation_duration).
    const remainingMin = (n) => {
        if (!isOn(n)) return null;
        const end = parseDate(getCap(`valve_${n}_expected_end`));
        if (end && end.getTime() > now) return Math.max(0, Math.ceil((end.getTime() - now) / 60000));
        if (manualDuration != null) {
            const elapsed = getCap(`valve_${n}_duration`) ?? 0;
            return Math.max(0, manualDuration - elapsed);
        }
        return null;
    };
    const progressPct = (n) => {
        const rem = remainingMin(n);
        if (rem == null || !manualDuration) return null;
        return Math.max(0, Math.min(100, ((manualDuration - rem) / manualDuration) * 100));
    };

    const toggle = (n) => (e) => {
        e.stopPropagation();
        const next = !isOn(n);
        setOverride({ src: device.capabilitiesObj, values: { ...ov, [n]: next } });
        setIsInteracting(true);
        api.setCapability(device.id, `valve_${n}`, next);
    };

    const onColor = 'var(--color-info)';
    const iconColor = alarms.length ? 'var(--color-danger)' : anyOn ? onColor : 'var(--color-text-secondary)';

    const bannerStyle = (bg, color) => ({
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '6px 10px', borderRadius: '8px',
        background: bg, fontSize: '0.75rem', color,
    });

    const statChip = (Icon, text, color = 'var(--color-text-secondary)') => (
        <span style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.72rem', color }}>
            <Icon size={11} />{text}
        </span>
    );

    // ── Kompakt sone-knapp ──────────────────────────────────────────
    const compactButton = (n) => {
        const on = isOn(n);
        const rem = remainingMin(n);
        return (
            <button
                key={n}
                onMouseDown={e => e.stopPropagation()}
                onClick={toggle(n)}
                style={{
                    flex: 1, minWidth: 0,
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                    padding: '6px 4px', borderRadius: '10px', cursor: 'pointer',
                    border: `1px solid ${on ? onColor : 'rgba(255,255,255,0.12)'}`,
                    background: on ? 'rgba(59,130,246,0.18)' : 'var(--color-surface-raised)',
                    color: on ? onColor : 'var(--color-text-secondary)',
                    boxShadow: on ? '0 0 10px rgba(59,130,246,0.25)' : 'none',
                    transition: 'all 0.2s',
                }}
            >
                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: on ? 'var(--color-text-primary)' : 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                    {zoneName[n]}
                </span>
                <span style={{ fontSize: '0.62rem', whiteSpace: 'nowrap' }}>
                    {on ? (rem != null ? `${rem} min igjen` : 'Vanner') : 'Av'}
                </span>
            </button>
        );
    };

    // ── Utvidet sone-kort ───────────────────────────────────────────
    const zoneCard = (n) => {
        const on = isOn(n);
        const rem = remainingMin(n);
        const pct = progressPct(n);
        const runDuration = getCap(`valve_${n}_duration`);
        const hourDuration = getCap(`valve_${n}_hour_duration`);
        const expectedEnd = parseDate(getCap(`valve_${n}_expected_end`));
        return (
            <div key={n} style={{
                flex: 1, minWidth: 0,
                display: 'flex', flexDirection: 'column', gap: '8px',
                padding: '12px', borderRadius: '12px',
                background: on ? 'rgba(59,130,246,0.10)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${on ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.08)'}`,
                transition: 'all 0.2s',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '0.9rem' }}>
                        <Droplet size={16} color={on ? onColor : 'var(--color-text-secondary)'} fill={on ? onColor : 'none'} />
                        {zoneName[n]}
                    </span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: on ? onColor : 'var(--color-text-secondary)' }}>
                        {on ? 'Vanner' : 'Av'}
                    </span>
                </div>

                {on && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>
                            <span>{rem != null ? `${rem} min igjen` : 'Kjører'}</span>
                            {expectedEnd && expectedEnd.getTime() > now && <span>Ferdig {formatClock(expectedEnd)}</span>}
                        </div>
                        {pct != null && (
                            <div style={{ width: '100%', height: '5px', borderRadius: '3px', background: 'var(--color-surface-raised)', overflow: 'hidden' }}>
                                <div style={{ width: `${pct}%`, height: '100%', background: onColor, transition: 'width 0.5s' }} />
                            </div>
                        )}
                    </div>
                )}

                <button
                    onMouseDown={e => e.stopPropagation()}
                    onClick={toggle(n)}
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        padding: '9px 12px', borderRadius: '10px', cursor: 'pointer',
                        fontSize: '0.8rem', fontWeight: 600,
                        border: `1px solid ${on ? 'rgba(255,255,255,0.16)' : onColor}`,
                        background: on ? 'var(--color-surface-raised)' : onColor,
                        color: on ? 'var(--color-text-primary)' : 'white',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
                    }}
                >
                    {on ? <Square size={13} /> : <Play size={13} />}
                    {on ? 'Stopp' : `Start${manualDuration ? ` (${manualDuration} min)` : ''}`}
                </button>

                {showRunStats && (runDuration != null || hourDuration != null) && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>
                        {runDuration != null && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>{on ? 'Kjørt nå' : 'Siste kjøring'}</span>
                                <span style={{ color: 'var(--color-text-primary)' }}>{formatMinutes(runDuration)}</span>
                            </div>
                        )}
                        {showHourStats && hourDuration != null && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>Siste time</span>
                                <span style={{ color: 'var(--color-text-primary)' }}>{formatMinutes(hourDuration)}</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="tile-content" style={{
            display: 'flex', flexDirection: 'column', minHeight: '100%',
            padding: '10px', gap: '6px', position: 'relative',
        }}>
            {/* Batteri + varsel-ikon (hjørne) */}
            <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', alignItems: 'center', gap: '6px' }}>
                {alarms.length > 0 && <AlertTriangle size={13} color="var(--color-danger)" />}
                {rainActive && alarms.length === 0 && <CloudRain size={13} color="var(--color-info)" />}
                {battery != null && !isNaN(battery) && statChip(Battery, `${Math.round(battery)}%`,
                    battery < 20 ? 'var(--color-danger)' : 'var(--color-text-secondary)')}
            </div>

            {/* Kompakt visning / header */}
            <div style={{
                flex: expanded ? '0 0 auto' : 1,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px',
            }}>
                <Droplets
                    size={expanded ? 36 : 28}
                    color={iconColor}
                    style={{ filter: anyOn ? `drop-shadow(0 0 6px ${onColor})` : 'none', transition: 'all 0.3s' }}
                />
                {!expanded && (
                    <div style={{ display: 'flex', gap: '6px', width: '100%' }}>
                        {channels.map(compactButton)}
                    </div>
                )}
                {expanded && (
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: anyOn ? onColor : 'var(--color-text-secondary)' }}>
                        {anyOn
                            ? `Vanner ${channels.filter(isOn).map(n => zoneName[n]).join(' og ')}`
                            : 'Ingen vanning pågår'}
                    </span>
                )}
            </div>

            {/* Utvidet visning */}
            {expanded && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1, minHeight: 0, overflowY: 'auto', paddingTop: '4px' }}>

                    {alarms.length > 0 && (
                        <div style={bannerStyle('rgba(239,68,68,0.1)', 'var(--color-danger)')}>
                            <AlertTriangle size={14} />
                            {alarms.map(a => ALARM_LABELS[a] || a.replace(/_/g, ' ')).join(' · ')}
                        </div>
                    )}
                    {rainActive && (
                        <div style={bannerStyle('rgba(59,130,246,0.1)', 'var(--color-info)')}>
                            <CloudRain size={14} />
                            Regnpause – vanning utsatt til {formatClock(rainEnd)}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '10px', alignItems: 'stretch' }}>
                        {channels.map(zoneCard)}
                    </div>

                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', padding: '2px 4px' }}>
                        {volumeNow != null && statChip(Droplet, `${anyOn ? 'Vannet nå' : 'Siste kjøring'}: ${volumeNow} L`)}
                        {showHourStats && volumeHour != null && statChip(Clock, `Siste time: ${volumeHour} L`)}
                        {manualDuration != null && statChip(Timer, `Standardvarighet ${manualDuration} min`)}
                        {showChildLock && childLock === true && statChip(Lock, 'Barnesikring på')}
                    </div>
                </div>
            )}
        </div>
    );
};

export default IrrigationTile;
