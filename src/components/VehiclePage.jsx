import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Car, Settings, X, Zap, Moon, Sun, ChevronUp, ChevronDown } from 'lucide-react';
import { useHomey } from '../context/HomeyContext';
import { useLayout } from './music/musicUtils';
import { CheckboxRow, ShowOptionsGroup } from './SettingsControls';
import ChargerCard from './vehicles/ChargerCard';
import ChargerDetail from './vehicles/ChargerDetail';
import VehicleCard from './vehicles/VehicleCard';
import VehicleDetail from './vehicles/VehicleDetail';
import { useLoadManagerAction } from './vehicles/shared';
import useVehicleControl from '../hooks/useVehicleControl';
import {
    allChargers, buildVehicleList, chargerKey, chargerSummary, findChargingVehicle, findPageCharger, formatClock, vehicleKey, vehicleName, vehicleSummary,
} from '../services/vehicle';
import { findLoadManager, allOverrideSelects } from '../services/load-manager';
import { formatPower } from '../services/climate';
import '../styles/vehicle-page.css';

// Helside for bilene (pageType 'vehicles'): laderen øverst (én felles ressurs), ett kort per bil
// under, utvidet visning som sidepanel (nettbrett) eller bunnark (mobil) – samme skall som
// Klimasiden (gjenbruker .climate-*-klassene for layout/utvidet visning).
// Innstillinger lagres på siden som page.vehicleSettings, nøklet på entity-id (vehicleKey/chargerKey).
export default function VehiclePage({ page }) {
    const { api, devices, isEditMode, updatePage, currentPage } = useHomey();
    const rootRef = useRef(null);
    const layout = useLayout(rootRef);
    const [showSettings, setShowSettings] = useState(false);
    // undefined = automatisk valg (bilen som lader) på bred skjerm, null = lukket av bruker
    const [openKey, setOpenKey] = useState(undefined);

    const settings = page.vehicleSettings || {};
    const ctl = useVehicleControl(api, devices);

    const charger = useMemo(() => findPageCharger(devices, settings), [devices, settings]);
    const ch = useMemo(() => chargerSummary(charger, devices), [charger, devices]);
    const lm = useMemo(() => (charger && settings.showLoadManager !== false ? findLoadManager(devices, charger, settings) : null), [devices, charger, settings]);
    const lmAction = useLoadManagerAction(api, charger, lm);

    const vehicles = useMemo(() => buildVehicleList(devices, settings), [devices, settings]);
    const chargingVehicle = useMemo(() => (charger ? findChargingVehicle(devices, charger, settings) : null), [devices, charger, settings]);
    const chargingKey = chargingVehicle ? vehicleKey(chargingVehicle) : null;
    const cars = useMemo(() => Object.fromEntries(vehicles.map(v => [vehicleKey(v), vehicleSummary(v)])), [vehicles]);
    const nameOf = (v) => vehicleName(v, settings);

    // Nedtelling («om 1 t 20 min») og ferdig-tid må tikke selv om ingen sensor endres
    const [, setTick] = useState(0);
    useEffect(() => {
        const t = setInterval(() => setTick(n => n + 1), 60000);
        return () => clearInterval(t);
    }, []);

    // Utvidet visning portaleres til <body> på små skjermer — lukk den når siden ikke vises,
    // og gå tilbake til automatisk valg (bilen som lader) hver gang siden åpnes igjen
    useEffect(() => {
        setOpenKey(isEditMode || currentPage !== page.id ? null : undefined);
    }, [isEditMode, currentPage, page.id]);

    // Bred skjerm: vis bilen som lader (ellers første bil) til brukeren velger selv
    const effectiveKey = openKey !== undefined ? openKey
        : layout === 'wide' ? (chargingKey || (vehicles[0] ? vehicleKey(vehicles[0]) : null)) : null;
    const openVehicle = effectiveKey && effectiveKey !== 'charger' ? vehicles.find(v => vehicleKey(v) === effectiveKey) : null;
    const openCharger = effectiveKey === 'charger' && charger ? charger : null;
    const close = () => setOpenKey(null);

    // Header: «Tesla lader · 61 % → 80 % · ferdig 06:30» / «Ingen lader · Tesla 61 %»
    let summary = '';
    const chargingCar = chargingVehicle ? cars[chargingKey] : null;
    if (chargingCar && (chargingCar.isCharging || ch?.charging)) {
        summary = `${nameOf(chargingVehicle)} lader`;
        if (chargingCar.battery != null) summary += ` · ${Math.round(chargingCar.battery)} %${chargingCar.limit != null ? ` → ${Math.round(chargingCar.limit)} %` : ''}`;
        if (chargingCar.timeToFull) summary += ` · ferdig ${formatClock(chargingCar.timeToFull)}`;
    } else if (chargingCar) {
        summary = `${nameOf(chargingVehicle)} står på laderen · ${chargingCar.stateInfo?.text || ch?.statusText || ''}`;
    } else if (ch?.connected) {
        summary = `Laderen: ${ch.statusText}`;
    } else {
        const parts = vehicles.map(v => `${nameOf(v)} ${cars[vehicleKey(v)].battery != null ? `${Math.round(cars[vehicleKey(v)].battery)} %` : '–'}`);
        summary = ['Ingen lader', ...parts].join(' · ');
    }

    const totalPower = ch?.charging ? ch.power : 0;
    const tariff = settings.showTariff !== false ? lm?.tariff : null;

    const detail = openCharger ? (
        <ChargerDetail
            charger={charger} summary={ch} car={chargingCar} carName={chargingVehicle ? nameOf(chargingVehicle) : ''}
            lm={lm} lmAction={lmAction} ctl={ctl} devices={devices} settings={settings}
            onClose={close} onOpenVehicle={() => chargingKey && setOpenKey(chargingKey)}
        />
    ) : openVehicle ? (
        <VehicleDetail
            vehicle={openVehicle} car={cars[vehicleKey(openVehicle)]} name={nameOf(openVehicle)}
            onCharger={vehicleKey(openVehicle) === chargingKey} chargerSummary={ch} lm={lm}
            ctl={ctl} settings={settings} onClose={close}
        />
    ) : null;

    return (
        <div ref={rootRef} className={`climate-page climate-page--${layout} vehicle-page ${isEditMode ? 'climate-page--edit' : ''}`}>
            {isEditMode && (
                <div className="light-page-editbar">
                    <Car size={16} style={{ opacity: 0.6 }} />
                    <span style={{ fontSize: '0.9rem', fontWeight: 600, opacity: 0.85, flex: 1 }}>{page?.name || 'Biler'}</span>
                    <button className="light-page-editbtn" onClick={() => setShowSettings(true)} title="Innstillinger">
                        <Settings size={16} />
                    </button>
                </div>
            )}

            <div className="climate-shell">
                <div className="climate-main">
                    <div className="light-page-header">
                        <Car size={22} style={{ color: ch?.charging ? 'var(--color-success)' : 'var(--color-text-secondary)', flexShrink: 0 }} />
                        <div className="light-page-title">
                            <strong>{page?.name || 'Biler'}</strong>
                            <span>{summary}</span>
                        </div>
                        {tariff && (
                            <div className={`climate-pill vp-tariff is-${tariff}`}>
                                {tariff === 'natt' ? <Moon size={13} /> : <Sun size={13} />} {tariff === 'natt' ? 'Natt-tariff' : tariff === 'dag' ? 'Dag-tariff' : tariff}
                            </div>
                        )}
                        {settings.showPower !== false && totalPower > 0 && layout !== 'mobile' && (
                            <div className="climate-pill"><Zap size={13} /> {formatPower(totalPower)}</div>
                        )}
                    </div>

                    <div className="climate-scroll">
                        {!charger && vehicles.length === 0 ? (
                            <div className="light-panel-empty" style={{ minHeight: 200 }}>
                                <Car size={28} style={{ opacity: 0.5 }} />
                                <span>Fant ingen billader eller bil</span>
                            </div>
                        ) : (
                            <>
                                {charger && (
                                    <section className="climate-section">
                                        <h3><span>Lader</span><span>{ch.zoneName || ch.name}</span></h3>
                                        <ChargerCard
                                            charger={charger} summary={ch} car={chargingCar} carName={chargingVehicle ? nameOf(chargingVehicle) : ''}
                                            lm={lm} lmAction={lmAction} ctl={ctl} settings={settings}
                                            selected={layout === 'wide' && effectiveKey === 'charger'}
                                            onOpen={() => setOpenKey('charger')}
                                        />
                                    </section>
                                )}
                                <section className="climate-section">
                                    <h3><span>Biler</span><span>{vehicles.length}</span></h3>
                                    {vehicles.length === 0 ? (
                                        <div className="climate-tiny" style={{ padding: '0 8px' }}>Ingen biler funnet i Home Assistant.</div>
                                    ) : (
                                        <div className="vp-cars">
                                            {vehicles.map(v => {
                                                const key = vehicleKey(v);
                                                return (
                                                    <VehicleCard
                                                        key={v.id}
                                                        vehicle={v}
                                                        car={cars[key]}
                                                        name={nameOf(v)}
                                                        onCharger={key === chargingKey}
                                                        ctl={ctl}
                                                        selected={layout === 'wide' && effectiveKey === key}
                                                        onOpen={() => setOpenKey(key)}
                                                    />
                                                );
                                            })}
                                        </div>
                                    )}
                                </section>
                            </>
                        )}
                    </div>
                </div>

                {detail && layout === 'wide' && <aside className="climate-detail climate-detail--panel">{detail}</aside>}
            </div>

            {detail && layout !== 'wide' && createPortal(
                <div className={`climate-layer climate-layer--${layout}`} onClick={close}>
                    <div className="climate-detail vehicle-page" onClick={(e) => e.stopPropagation()}>{detail}</div>
                </div>,
                document.body
            )}

            {showSettings && (
                <VehiclePageSettingsModal
                    settings={settings}
                    devices={devices}
                    onClose={() => setShowSettings(false)}
                    onSave={(next) => updatePage({ ...page, vehicleSettings: next })}
                />
            )}
        </div>
    );
}

// ── Innstillinger: biler (vis/skjul, navn, rekkefølge), lader (bil på laderen, Strømstyring) ──
function VehicleListSettings({ settings, devices, onChange }) {
    const vehicles = useMemo(() => buildVehicleList(devices, settings, { includeExcluded: true }), [devices, settings]);
    const excluded = settings.excludedVehicleIds || [];
    const setExcluded = (key, hide) =>
        onChange({ excludedVehicleIds: hide ? [...excluded, key] : excluded.filter(k => k !== key) });
    const setName = (key, value) => {
        const next = { ...(settings.customNames || {}) };
        if (value) next[key] = value; else delete next[key];
        onChange({ customNames: next });
    };
    const move = (idx, dir) => {
        const j = idx + dir;
        if (j < 0 || j >= vehicles.length) return;
        const keys = vehicles.map(vehicleKey);
        [keys[idx], keys[j]] = [keys[j], keys[idx]];
        onChange({ order: keys });
    };
    if (vehicles.length === 0) return <p className="hint">Fant ingen biler i Home Assistant.</p>;
    return (
        <div className="form-group">
            <label>Biler</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {vehicles.map((v, idx) => {
                    const key = vehicleKey(v);
                    const shown = !excluded.includes(key);
                    return (
                        <div key={key} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 10 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <CheckboxRow
                                        label={v.name || 'Bil'}
                                        description={[v.settings?.vehicleMake, v.settings?.vehicleModel, key].filter(Boolean).join(' · ')}
                                        checked={shown}
                                        onChange={(checked) => setExcluded(key, !checked)}
                                    />
                                </div>
                                <button className="icon-btn" disabled={idx === 0} onClick={() => move(idx, -1)} title="Flytt opp"><ChevronUp size={16} /></button>
                                <button className="icon-btn" disabled={idx === vehicles.length - 1} onClick={() => move(idx, 1)} title="Flytt ned"><ChevronDown size={16} /></button>
                            </div>
                            {shown && (
                                <input
                                    type="text"
                                    value={settings.customNames?.[key] || ''}
                                    onChange={(e) => setName(key, e.target.value)}
                                    placeholder={`Eget navn (${v.name || 'Bil'})`}
                                    style={{ width: '100%', marginTop: 8, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' }}
                                />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function ChargerSettings({ settings, devices, onChange }) {
    // (React Compiler memoiserer – ingen manuell useMemo)
    const chargers = allChargers(devices);
    const charger = findPageCharger(devices, settings);
    const vehicles = buildVehicleList(devices, {}, { includeExcluded: true });
    const overrides = allOverrideSelects(devices);
    if (!charger) return <p className="hint">Fant ingen billader.</p>;
    const auto = findLoadManager(devices, charger, {});
    const autoCharger = findPageCharger(devices, {});
    return (
        <div className="form-group">
            <label>Lader</label>
            {chargers.length > 1 && (
                <select
                    className="select-input"
                    value={settings.chargerDeviceId || ''}
                    onChange={(e) => onChange({ chargerDeviceId: e.target.value })}
                    title="Hvilken enhet som er selve laderen (Zaptec gir også installasjon og krets som egne enheter)"
                >
                    <option value="">Lader: auto ({autoCharger?.name})</option>
                    {chargers.map(c => <option key={c.id} value={chargerKey(c)}>Lader: {c.name} ({chargerKey(c)})</option>)}
                </select>
            )}
            <select
                className="select-input"
                value={settings.vehicleDeviceId || ''}
                onChange={(e) => onChange({ vehicleDeviceId: e.target.value })}
                title="Hvilken bil som regnes som tilkoblet laderen"
            >
                <option value="">Bil på laderen: finn automatisk</option>
                <option value="none">Bil på laderen: ingen</option>
                {vehicles.map(v => <option key={vehicleKey(v)} value={vehicleKey(v)}>Bil på laderen: {v.name}</option>)}
            </select>
            <select
                className="select-input"
                value={settings.loadManagerOverrideEntityId || ''}
                onChange={(e) => onChange({ loadManagerOverrideEntityId: e.target.value })}
                title="Strømstyring-enheten som styrer laderen"
            >
                <option value="">Strømstyring: {auto ? `auto (${auto.overrideEntityId})` : 'ingen funnet automatisk'}</option>
                <option value="none">Strømstyring: av</option>
                {overrides.map(o => <option key={o.id} value={o.id}>{o.name || o.id} ({o.id})</option>)}
            </select>
            <p className="hint">Automatisk valg finner bilen ut fra kabel, posisjon og ladestatus. Velg fast bare hvis den gjetter feil.</p>
        </div>
    );
}

function VehiclePageSettingsModal({ settings, devices, onClose, onSave }) {
    const [tab, setTab] = useState('vehicles');
    const [local, setLocal] = useState(settings || {});
    const handleChange = (patch) => setLocal(prev => ({ ...prev, ...patch }));

    return createPortal(
        <div className="modal">
            <div className="modal-content" style={{ maxWidth: 560, display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header">
                    <h2>Bilside – innstillinger</h2>
                    <button className="icon-btn close-modal" onClick={onClose}><X size={24} /></button>
                </div>

                <div className="fp-settings-tabs">
                    <button className={tab === 'vehicles' ? 'active' : ''} onClick={() => setTab('vehicles')}>Biler</button>
                    <button className={tab === 'charger' ? 'active' : ''} onClick={() => setTab('charger')}>Lader</button>
                    <button className={tab === 'display' ? 'active' : ''} onClick={() => setTab('display')}>Visning</button>
                </div>

                <div className="modal-body" style={{ flex: 1, overflowY: 'auto' }}>
                    {tab === 'vehicles' && (
                        <>
                            <p className="hint" style={{ marginTop: 0 }}>Siden finner selv alle biler. Fjern haken for å skjule en bil.</p>
                            <VehicleListSettings devices={devices} settings={local} onChange={handleChange} />
                        </>
                    )}
                    {tab === 'charger' && <ChargerSettings devices={devices} settings={local} onChange={handleChange} />}
                    {tab === 'display' && (
                        <>
                            <ShowOptionsGroup
                                title="Øverst på siden"
                                options={[
                                    { key: 'showTariff', label: 'Vis tariff fra Strømstyring', def: true },
                                    { key: 'showPower', label: 'Vis ladeeffekt (nettbrett)', def: true },
                                ]}
                                values={local}
                                onChange={(key, checked) => handleChange({ [key]: checked })}
                            />
                            <ShowOptionsGroup
                                title="Lader"
                                options={[
                                    { key: 'showLoadManager', label: 'Vis Strømstyring og «Lad nå»', def: true },
                                    { key: 'showAllocatedCurrent', label: 'Vis strøm tildelt av Zaptec (utvidet)', def: false },
                                ]}
                                values={local}
                                onChange={(key, checked) => handleChange({ [key]: checked })}
                            />
                            <ShowOptionsGroup
                                title="Bil (utvidet visning)"
                                options={[
                                    { key: 'showPresets', label: 'Klimamodus (Behold/Hund/Camp)', def: true },
                                    { key: 'showSeats', label: 'Setevarme og rattvarme', def: true },
                                    { key: 'showStatus', label: 'Status (lås, vinduer, vaktmodus)', def: true },
                                ]}
                                values={local}
                                onChange={(key, checked) => handleChange({ [key]: checked })}
                            />
                        </>
                    )}
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>Avbryt</button>
                    <button className="btn btn-primary" onClick={() => { onSave(local); onClose(); }}>Lagre</button>
                </div>
            </div>
        </div>,
        document.body
    );
}
