import React, { useState, useEffect } from 'react';
import { Flame, Battery, BatteryLow, Wifi, WifiOff, ShieldCheck, ShieldAlert, AlertTriangle, Hourglass, Settings } from 'lucide-react';
import { useHomey } from '../context/HomeyContext';
import { hassAPI } from '../services/hass-api';
import '../styles/family-page.css';

// ── Oppdagelse av røykvarslere fra HA-entiteter ───────────────────────────────
// To navneskjemaer i bruk:
//   1. Omdøpte:  binary_sensor.<rom>_smoke_detector_{smoke|low_battery|end_of_life|online|hardware_failure}
//   2. Originale: binary_sensor.smoke_alarm_<serienr>_{smoke_status|battery_status|end_of_life|online_status|smoke_fault_status}

const RENAMED_SUFFIX = {
    smoke: 'smoke',
    low_battery: 'lowBattery',
    end_of_life: 'endOfLife',
    online: 'online',
    hardware_failure: 'fault',
};

const ORIGINAL_SUFFIX = {
    smoke_status: 'smoke',
    battery_status: 'lowBattery',
    end_of_life: 'endOfLife',
    online_status: 'online',
    smoke_fault_status: 'fault',
};

function discoverSmokeDetectors() {
    const entities = hassAPI.entities || {};
    const map = {};
    const get = (prefix) => map[prefix] || (map[prefix] = { id: prefix, entities: {} });

    Object.keys(entities).forEach(eid => {
        if (!eid.startsWith('binary_sensor.')) return;
        const oid = eid.slice('binary_sensor.'.length);

        let m = oid.match(/^(.+_smoke_detector)_(smoke|low_battery|end_of_life|online|hardware_failure)$/);
        if (m) {
            get(m[1]).entities[RENAMED_SUFFIX[m[2]]] = eid;
            return;
        }
        m = oid.match(/^(smoke_alarm_.+_[0-9a-f]+)_(smoke_status|battery_status|end_of_life|online_status|smoke_fault_status)$/);
        if (m) {
            get(m[1]).entities[ORIGINAL_SUFFIX[m[2]]] = eid;
        }
    });

    return Object.values(map).map(d => {
        const raw = (key) => {
            const e = entities[d.entities[key]];
            return e ? e.state : null;
        };
        const isOn = (key) => raw(key) === 'on';
        const unavailable = ['smoke', 'online'].some(k =>
            d.entities[k] && ['unavailable', 'unknown'].includes(raw(k)));

        let name = null;
        for (const eid of Object.values(d.entities)) {
            name = hassAPI.entityToArea?.[eid];
            if (name) break;
        }
        if (!name) {
            const serial = d.id.match(/([0-9a-f]{4})$/)?.[1];
            name = serial ? `Uplassert (…${serial})` : d.id;
        }

        const smokeEnt = entities[d.entities.smoke];
        return {
            id: d.id,
            name,
            smoke: isOn('smoke'),
            lowBattery: isOn('lowBattery'),
            endOfLife: isOn('endOfLife'),
            fault: isOn('fault'),
            online: d.entities.online ? raw('online') === 'on' : null,
            unavailable,
            smokeChanged: smokeEnt?.last_changed || null,
        };
    });
}

function hasProblem(d) {
    return d.smoke || d.lowBattery || d.endOfLife || d.fault || d.online === false || d.unavailable;
}

function relativeTime(iso) {
    if (!iso) return null;
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 0 || isNaN(diff)) return null;
    const min = Math.floor(diff / 60000);
    if (min < 1) return 'nå nettopp';
    if (min < 60) return `for ${min} min siden`;
    const hours = Math.floor(min / 60);
    if (hours < 24) return `for ${hours} t siden`;
    const days = Math.floor(hours / 24);
    return `for ${days} d siden`;
}

// ── Delkomponenter ────────────────────────────────────────────────────────────

function StatusRow({ icon, label, value, color }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem' }}>
            <span style={{ display: 'flex', alignItems: 'center', color: color || 'var(--color-text-secondary, #9aa3b2)' }}>{icon}</span>
            <span style={{ opacity: 0.55, flex: 1 }}>{label}</span>
            <span style={{ fontWeight: 600, color: color || 'inherit' }}>{value}</span>
        </div>
    );
}

function DetectorCard({ d }) {
    // Prioritert statusvurdering: alarm > utilgjengelig > frakoblet > feil > levetid > batteri > OK
    let status;
    if (d.smoke)               status = { label: 'RØYK OPPDAGET', color: '#ef4444', bg: 'rgba(239,68,68,0.16)', border: 'rgba(239,68,68,0.65)' };
    else if (d.unavailable)    status = { label: 'Utilgjengelig', color: '#9aa3b2', bg: 'rgba(154,163,178,0.12)', border: 'rgba(255,255,255,0.1)' };
    else if (d.online === false) status = { label: 'Frakoblet', color: '#f97316', bg: 'rgba(249,115,22,0.13)', border: 'rgba(249,115,22,0.5)' };
    else if (d.fault)          status = { label: 'Sensorfeil', color: '#f97316', bg: 'rgba(249,115,22,0.13)', border: 'rgba(249,115,22,0.5)' };
    else if (d.endOfLife)      status = { label: 'Levetid utløpt', color: '#f97316', bg: 'rgba(249,115,22,0.13)', border: 'rgba(249,115,22,0.5)' };
    else if (d.lowBattery)     status = { label: 'Lavt batteri', color: '#eab308', bg: 'rgba(234,179,8,0.13)', border: 'rgba(234,179,8,0.5)' };
    else                       status = { label: 'OK', color: '#22c55e', bg: 'rgba(34,197,94,0.1)', border: 'rgba(255,255,255,0.08)' };

    const lastSmoke = relativeTime(d.smokeChanged);

    return (
        <div style={{
            background: 'var(--color-bg-secondary, #171c28)',
            border: `1px solid ${status.border}`,
            borderRadius: 14,
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            animation: d.smoke ? 'smoke-pulse 1.2s ease-in-out infinite' : 'none',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                    width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: status.bg, color: status.color,
                }}>
                    <Flame size={22} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
                    <div style={{ fontSize: '0.72rem', fontWeight: 600, color: status.color }}>{status.label}</div>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <StatusRow
                    icon={d.lowBattery ? <BatteryLow size={15} /> : <Battery size={15} />}
                    label="Batteri"
                    value={d.lowBattery ? 'Lavt' : 'OK'}
                    color={d.lowBattery ? '#eab308' : '#22c55e'}
                />
                <StatusRow
                    icon={d.online === false ? <WifiOff size={15} /> : <Wifi size={15} />}
                    label="Tilkobling"
                    value={d.online === null ? '–' : d.online ? 'Online' : 'Frakoblet'}
                    color={d.online === false ? '#f97316' : d.online ? '#22c55e' : undefined}
                />
                <StatusRow
                    icon={<Hourglass size={15} />}
                    label="Levetid"
                    value={d.endOfLife ? 'Utløpt – bytt varsler' : 'OK'}
                    color={d.endOfLife ? '#f97316' : '#22c55e'}
                />
                {d.fault && (
                    <StatusRow icon={<AlertTriangle size={15} />} label="Sensorfeil" value="Ja" color="#f97316" />
                )}
                {lastSmoke && (
                    <div style={{ fontSize: '0.68rem', opacity: 0.4, marginTop: 2 }}>
                        Røykstatus endret {lastSmoke}
                    </div>
                )}
            </div>
        </div>
    );
}

function SummaryBanner({ detectors }) {
    const alarms = detectors.filter(d => d.smoke);
    const problems = detectors.filter(d => !d.smoke && hasProblem(d));

    let icon, title, subtitle, color, bg, border;
    if (alarms.length > 0) {
        icon = <ShieldAlert size={30} />;
        title = 'RØYK OPPDAGET!';
        subtitle = alarms.map(d => d.name).join(', ');
        color = '#ef4444'; bg = 'rgba(239,68,68,0.14)'; border = 'rgba(239,68,68,0.6)';
    } else if (problems.length > 0) {
        icon = <AlertTriangle size={30} />;
        title = problems.length === 1 ? '1 varsler trenger tilsyn' : `${problems.length} varslere trenger tilsyn`;
        subtitle = problems.map(d => d.name).join(', ');
        color = '#f97316'; bg = 'rgba(249,115,22,0.12)'; border = 'rgba(249,115,22,0.5)';
    } else {
        icon = <ShieldCheck size={30} />;
        title = 'Alt i orden';
        subtitle = `${detectors.length} røykvarslere overvåket – ingen røyk, alle online`;
        color = '#22c55e'; bg = 'rgba(34,197,94,0.1)'; border = 'rgba(34,197,94,0.35)';
    }

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            background: bg, border: `1px solid ${border}`, borderRadius: 14,
            padding: '16px 18px', marginBottom: 16,
            animation: alarms.length > 0 ? 'smoke-pulse 1.2s ease-in-out infinite' : 'none',
        }}>
            <span style={{ color, display: 'flex' }}>{icon}</span>
            <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: '1.05rem', color }}>{title}</div>
                <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>{subtitle}</div>
            </div>
        </div>
    );
}

// ── Hovedkomponent ────────────────────────────────────────────────────────────

export default function SmokeDetectorPage({ page }) {
    const { isEditMode } = useHomey();
    const [, setTick] = useState(0);

    // hassAPI.entities holdes fersk via websocket; re-render på intervall (samme mønster som EnergyDashboardWidget)
    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 5000);
        return () => clearInterval(id);
    }, []);

    const detectors = discoverSmokeDetectors().sort((a, b) => {
        if (a.smoke !== b.smoke) return a.smoke ? -1 : 1;
        const ap = hasProblem(a), bp = hasProblem(b);
        if (ap !== bp) return ap ? -1 : 1;
        return a.name.localeCompare(b.name, 'nb');
    });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--color-bg-main, #0f1117)' }}>
            <style>{`@keyframes smoke-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.45); } 50% { box-shadow: 0 0 0 10px rgba(239,68,68,0); } }`}</style>

            {isEditMode && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
                    <Flame size={16} style={{ opacity: 0.6 }} />
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, opacity: 0.85, flex: 1 }}>{page?.name || 'Røykvarslere'}</span>
                    <Settings size={16} style={{ opacity: 0.3 }} title="Ingen innstillinger for denne siden" />
                </div>
            )}

            <div style={{ flex: 1, overflowY: 'auto' }}>
                <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px' }}>
                    {detectors.length === 0 ? (
                        <div style={{ textAlign: 'center', opacity: 0.5, padding: '48px 16px', fontSize: '0.9rem' }}>
                            Fant ingen røykvarslere i Home Assistant.
                        </div>
                    ) : (
                        <>
                            <SummaryBanner detectors={detectors} />
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
                                gap: 12,
                            }}>
                                {detectors.map(d => <DetectorCard key={d.id} d={d} />)}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
