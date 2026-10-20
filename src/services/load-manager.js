// Kobling mot Strømstyring-integrasjonen i HA (custom_components/stromstyring).
// Integrasjonen styrer bl.a. billaderen etter tariff (natt = 25 A, dag = 0 A) og
// reduserer enheter når huset nærmer seg kapasitetsmålet. Per enhet finnes:
//   sensor.global_load_manager_<navn>_state     (boost | normal | redusert_N; attr entity_id = enheten den styrer)
//   select.global_load_manager_<navn>_override  (auto | override | override_unless_critical | override_til_tariffendring)
// «override_unless_critical» = integrasjonen lar enheten være i fred (hopper over tariff-
// grunnivå og vanlige reduksjoner), men reduserer den likevel når alle auto-enheter er uttømt.
// NB: å sette overstyring endrer IKKE strømmen – flisen må selv sette 25 A. Tilbake til «auto»
// re-appliserer tariff-grunnivået (0 A på dagtid).

export const OVERRIDE_UNLESS_CRITICAL = 'override_unless_critical';

export const OVERRIDE_LABEL = {
    auto: 'Automatisk',
    override: 'Overstyrt (alltid)',
    override_unless_critical: 'Lader nå – overstyrt',
    override_til_tariffendring: 'Overstyrt til tariffendring',
};

export function loadManagerStateText(state) {
    if (!state || state === 'unknown' || state === 'unavailable') return '';
    if (state === 'boost') return 'Full strøm (natt)';
    if (state === 'normal') return 'Normal';
    const m = /^redusert_(\d+)$/.exec(state);
    if (m) return `Redusert ${m[1]} steg`;
    return state;
}

// Smartlading (sensor.global_load_manager_<navn>_smart_charging): kun aktiv om natten. State =
// mål-ampere, attributter = regnestykket: bil, batteri_start_pct, ladegrense_pct, behov_kwh,
// levert_kwh (fra laderens økt-energi – presis), gjenstaar_kwh, ferdig_tid (HH:MM = konfigurert
// klar-tid, IKKE et anslag), timer_til_ferdig (til fristen), status («beregnet» | «etter ferdig-tid
// — tar igjen i bufferen» | «behov dekket — minimumsstrøm» | «ikke natt» | «…— fast nattstrøm»).
// NB: krever kWh per % satt per bil i Strømstyring – ellers «fast nattstrøm» uten attributter.
export function smartChargingOf(dev) {
    if (!dev) return null;
    const a = dev.attributes || {};
    const num = (v) => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v));
    const active = a.bil != null && a.ferdig_tid != null;
    return {
        status: a.status || '',
        active,
        car: a.bil || null,
        socStart: num(a.batteri_start_pct),
        limit: num(a.ladegrense_pct),
        needKwh: num(a.behov_kwh),
        deliveredKwh: num(a.levert_kwh),
        remainingKwh: num(a.gjenstaar_kwh),
        readyTime: a.ferdig_tid || null,
        targetAmps: num(dev.state),
    };
}

// Estimert batteri-% for bilen på laderen (sensor.global_load_manager_<navn>_estimated_battery,
// okt 2026): integrasjonen følger bilens %-rapporter mot laderens økt-energi og framskriver
// imellom (bilens siste % + levert kWh siden / kWh per %), uavhengig av tariff. Attributter:
// bil, siste_rapport_pct, ladet_siden_rapport_kwh, kwh_per_pct, ladegrense_pct. Ukjent/unavailable
// når ingen kjent bil står på laderen. Foretrekkes over dashbordets egen historikk-baserte
// utregning (samme tall på alle skjermer, ingen historikk-oppslag).
export function socEstimateOf(dev) {
    if (!dev) return null;
    const pct = Number(dev.state);
    if (dev.state == null || dev.state === 'unknown' || dev.state === 'unavailable' || isNaN(pct)) return null;
    const a = dev.attributes || {};
    const num = (v) => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v));
    return {
        pct,
        car: a.bil || null,
        lastReportPct: num(a.siste_rapport_pct),
        chargedKwh: num(a.ladet_siden_rapport_kwh),
        kwhPerPct: num(a.kwh_per_pct),
        limit: num(a.ladegrense_pct),
    };
}

const isLmState = (id) => /^sensor\.global_load_manager_.+_state$/.test(id);
const isLmOverride = (id) => /^select\.global_load_manager_.+_override$/.test(id);

export const allOverrideSelects = (devices) =>
    devices.filter(d => !d.settings?.isComposite && isLmOverride(d.id));

// Finn Strømstyring-enheten som styrer denne laderen.
// settings.loadManagerOverrideEntityId: '' = auto (match på entity_id-attributtet), 'none' = av,
// ellers en konkret select.*_override.
export function findLoadManager(devices, charger, settings = {}) {
    const choice = settings.loadManagerOverrideEntityId;
    if (choice === 'none') return null;

    let overrideDev = null;
    let stateDev = null;

    if (choice) {
        overrideDev = devices.find(d => d.id === choice) || null;
        if (!overrideDev) return null;
        stateDev = devices.find(d => d.id === choice.replace(/^select\./, 'sensor.').replace(/_override$/, '_state')) || null;
    } else {
        // Auto: enhetssensoren har attributtet entity_id = det den styrer (laderens strømgrense).
        // Zaptec: number.*_circuit_available_current ligger på en EGEN HA-enhet (kretsen), ikke
        // laderens — den er derfor ikke i composite-ens entityIds. Match også på felles prefiks
        // («outdoor_car_charger» fra sensor.outdoor_car_charger_power / _mode).
        const targets = new Set([
            charger?.settings?.availableCurrentEntityId,
            ...(charger?.entityIds || []),
        ].filter(Boolean));
        const prefixes = [
            charger?.capabilitiesObj?.measure_power?.entity_id?.split('.')[1]?.replace(/_power$/, ''),
            charger?.capabilitiesObj?.charge_mode?.entity_id?.split('.')[1]?.replace(/_mode$/, ''),
        ].filter(Boolean);
        if (targets.size === 0 && prefixes.length === 0) return null;
        const controls = (d) => {
            const eid = d.attributes?.entity_id || '';
            if (targets.has(eid)) return true;
            const obj = eid.split('.')[1] || '';
            return prefixes.some(p => obj.startsWith(p + '_'));
        };
        stateDev = devices.find(d => isLmState(d.id) && controls(d)) || null;
        if (!stateDev) return null;
        overrideDev = devices.find(d => d.id === stateDev.id.replace(/^sensor\./, 'select.').replace(/_state$/, '_override')) || null;
        if (!overrideDev) return null;
    }

    const tariffDev = devices.find(d => d.id === 'sensor.global_load_manager_tariff');
    const modeDev = devices.find(d => d.id === 'sensor.global_load_manager_mode');
    const override = overrideDev.state || 'auto';
    return {
        overrideEntityId: overrideDev.id,
        override,
        overrideActive: override !== 'auto' && override !== 'unknown' && override !== 'unavailable',
        state: stateDev?.state || '',
        stateText: loadManagerStateText(stateDev?.state),
        stepsReduced: Number(stateDev?.attributes?.steg_redusert ?? 0) || 0,
        tariff: tariffDev?.state || '',
        mode: modeDev?.state || '',
        critical: modeDev?.state === 'kritisk',
        smart: smartChargingOf(stateDev ? devices.find(d => d.id === stateDev.id.replace(/_state$/, '_smart_charging')) : null),
        socEstimate: socEstimateOf(stateDev ? devices.find(d => d.id === stateDev.id.replace(/_state$/, '_estimated_battery')) : null),
    };
}
