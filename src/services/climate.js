// Klimaside (pageType 'climate'): utvalg av enheter, typer, status og norske navn.
// Ren logikk uten React — brukes av ClimatePage, ClimateDetail og innstillingene.

export const CLIMATE_KINDS = [
    { kind: 'hp', label: 'Varmepumper', single: 'Varmepumpe' },
    { kind: 'floor', label: 'Varmegulv', single: 'Varmegulv' },
    { kind: 'wh', label: 'Varmtvann', single: 'Varmtvannsbereder' },
];

// Innstillinger nøkles på entity-id (stabil), ikke composite-uuid — HA device-id-er kan
// byttes ut ved omregistrering, og da ville navn/skjuling/rekkefølge gått tapt.
export const keyOf = (d) => d.primaryEntityId || d.entityId || d.id;

export const isWaterHeater = (d) =>
    d.capabilities?.includes('homey_water_heater') || d.settings?.compositeType === 'water_heater';

export const isClimateDevice = (d) =>
    !d._inComposite && (isWaterHeater(d) || !!d.capabilities?.includes('target_temperature'));

// Fast rekkefølge uansett hva integrasjonen oppgir (Daikin lister heat_cool først)
const MODE_ORDER = ['off', 'heat', 'cool', 'heat_cool', 'auto', 'dry', 'fan_only'];
const modeRank = (m) => { const i = MODE_ORDER.indexOf(m); return i === -1 ? 99 : i; };

export const modesOf = (d) =>
    (d.capabilitiesOptions?.thermostat_mode?.values || [])
        .map(m => (typeof m === 'object' ? m.id : m))
        .sort((a, b) => modeRank(a) - modeRank(b));

// Varmepumpe = kan kjøle eller har vifte; alt annet med termostat regnes som varmegulv
export const kindOf = (d) => {
    if (isWaterHeater(d)) return 'wh';
    const modes = modesOf(d);
    if (modes.includes('cool') || d.capabilities?.includes('fan_mode')) return 'hp';
    return 'floor';
};

export const defaultNameOf = (d) => (isWaterHeater(d) ? 'Bereder' : (d.zoneName || d.name));

// → [{ kind, label, devices[] }] (tomme seksjoner utelates). Rekkefølge: settings.order, deretter navn.
export function buildClimateSections(devices, settings = {}, { includeExcluded = false } = {}) {
    const excluded = new Set(settings.excludedDeviceIds || []);
    const order = settings.order || [];
    const rank = (d) => { const i = order.indexOf(keyOf(d)); return i === -1 ? 9999 : i; };
    const list = devices.filter(d => isClimateDevice(d) && (includeExcluded || !excluded.has(keyOf(d))));
    return CLIMATE_KINDS.map(({ kind, label }) => ({
        kind,
        label,
        devices: list
            .filter(d => kindOf(d) === kind)
            .sort((a, b) => rank(a) - rank(b) || defaultNameOf(a).localeCompare(defaultNameOf(b), 'nb')),
    })).filter(s => s.devices.length > 0);
}

// Grenser og trinn for −/+. Bereder: samme standard som WaterHeaterTile (30–90, trinn 1).
export function limitsOf(d, settings = {}) {
    const o = d.capabilitiesOptions?.target_temperature || {};
    const wh = isWaterHeater(d);
    const custom = Number(settings.steps?.[keyOf(d)]);
    return {
        min: o.min ?? (wh ? 30 : 5),
        max: o.max ?? (wh ? 90 : 35),
        step: custom > 0 ? custom : (o.step || (wh ? 1 : 0.5)),
    };
}

// ── Strømmåler (smartplugg) per enhet ────────────────────────────────────────
// settings.powerDevices[keyOf(enhet)]: '' / mangler = auto, 'none' = av, ellers keyOf(måler).
// Auto: en måler der primær-entiteten inneholder klimaenhetens object_id
// (climate.living_room_heat_pump ↔ switch.tech_outlet_living_room_heat_pump_on_off).
export const isPowerCandidate = (d) =>
    !d._inComposite && !isClimateDevice(d) && d.capabilitiesObj?.measure_power !== undefined;

export function findPowerDevice(devices, d, settings = {}) {
    const choice = settings.powerDevices?.[keyOf(d)];
    if (choice === 'none') return null;
    if (choice) {
        // Composite først: pluggens bryter finnes også som frittstående enhet (_inComposite) med
        // samme nøkkel, men uten effektmåling
        return devices.find(x => !x._inComposite && keyOf(x) === choice)
            || devices.find(x => !x._inComposite && x.entityIds?.includes(choice))
            || devices.find(x => x.id === choice)
            || null;
    }
    const objectId = keyOf(d).split('.')[1];
    if (!objectId) return null;
    return devices.find(x => isPowerCandidate(x) && (keyOf(x).split('.')[1] || '').includes(objectId)) || null;
}

// Effekt for en enhet: tilknyttet måler foretrekkes (den måler hele apparatet på stikkontakten)
export const powerCapOf = (d, meter) => meter?.capabilitiesObj?.measure_power || d.capabilitiesObj?.measure_power;

// Energi- og kostnadstall. «Energikostnad»-integrasjonen legger måneds-/årssensorene på en EGEN
// sensor-only HA-enhet («Outlet Kjellerstue Kostnad») som aldri blir composite, så de finnes
// bare som frittstående enheter. De deler prefiks med effektsensoren:
// sensor.<prefiks>_power ↔ sensor.<prefiks>_energy_monthly / _total_cost_monthly / ...
const METER_SENSORS = {
    energy_daily: '_energy_daily',
    energy_monthly: '_energy_monthly',
    energy_prev_month: '_energy_prev_month',
    energy_ytd: '_energy_ytd',
    cost_monthly: '_total_cost_monthly',
    cost_prev_month: '_total_cost_prev_month',
    cost_ytd: '_total_cost_ytd',
};

export function meterReadings(devices, d, meter) {
    const powerEntity = powerCapOf(d, meter)?.entity_id || '';
    const prefix = powerEntity.startsWith('sensor.') ? powerEntity.slice(7).replace(/_power$/, '') : null;
    const out = {};
    for (const [capId, suffix] of Object.entries(METER_SENSORS)) {
        let v = meter?.capabilitiesObj?.[capId]?.value ?? d.capabilitiesObj?.[capId]?.value;
        if (v == null && prefix) {
            const sensor = devices.find(x => x.id === `sensor.${prefix}${suffix}`);
            const n = parseFloat(sensor?.state);
            if (!isNaN(n)) v = n;
        }
        if (v != null) out[capId] = v;
    }
    return out;
}

export const isUnavailable = (d) =>
    d.state === 'unavailable' || d.capabilitiesObj?.thermostat_mode?.value === 'unavailable';

// Effekt over dette regnes som «jobber» når enheten ikke oppgir hvac_action (standby ≈ 10–35 W)
const ACTIVE_POWER_W = 60;
const ACTIVE_LABEL = { heat: 'Varmer', cool: 'Kjøler', dry: 'Tørker', fan: 'Vifte' };

// Status for merke og tekst. mode/target kan overstyres med optimistiske verdier;
// meter = tilknyttet strømmåler (se findPowerDevice).
// → { tone: 'heat'|'cool'|'fan'|'off', active, label, off, na }
export function climateStatus(d, { mode, target, meter } = {}) {
    if (isUnavailable(d)) return { tone: 'off', active: false, label: 'Utilgjengelig', off: false, na: true };
    const caps = d.capabilitiesObj || {};
    const power = powerCapOf(d, meter)?.value;

    if (isWaterHeater(d)) {
        const active = (power != null && power > 10) || !!caps.element_1_active?.value || !!caps.element_2_active?.value;
        return { tone: 'heat', active, label: active ? 'Varmer' : 'Standby', off: false, na: false };
    }

    const m = String(mode ?? caps.thermostat_mode?.value ?? (caps.onoff?.value === false ? 'off' : 'heat')).toLowerCase();
    if (m === 'off') return { tone: 'off', active: false, label: 'Av', off: true, na: false };

    const tone = (m === 'cool' || m === 'dry') ? 'cool' : m === 'fan_only' ? 'fan' : 'heat';
    const action = caps.thermostat_state?.value;
    const cur = caps.measure_temperature?.value;
    const tgt = target ?? caps.target_temperature?.value;

    let active;
    if (m === 'fan_only') active = true;
    else if (action) active = !['idle', 'off'].includes(action);
    else if (power != null) active = power > ACTIVE_POWER_W;
    else if (cur != null && tgt != null) active = m === 'cool' ? tgt < cur : m === 'dry' ? true : tgt > cur;
    else active = false;

    const key = m === 'dry' ? 'dry' : tone;
    return { tone, active, label: active ? ACTIVE_LABEL[key] : 'I ro', off: false, na: false };
}

export const MODE_LABELS = {
    off: 'Av', heat: 'Varme', cool: 'Kjøling', heat_cool: 'Auto', auto: 'Auto', dry: 'Tørk', fan_only: 'Vifte',
};

// Norske navn på vifte-/sving-/programvalg på tvers av integrasjoner (Midea, Daikin, Z-Wave)
const OPTION_LABELS = {
    automatic: 'Auto', auto: 'Auto', night: 'Natt', sleep: 'Natt', silent: 'Stille', quiet: 'Stille',
    low: 'Lav', lowmedium: 'Lav+', medium: 'Medium', mediumhigh: 'Medium+', high: 'Høy',
    off: 'Av', on: 'På', both: 'Begge', vertical: 'Vertikal', horizontal: 'Horisontal',
    h: 'Horisontal', v: 'Vertikal', 'h+v': 'Begge', c: 'Komfort',
    none: 'Ingen', normal: 'Normal', powerful: 'Kraftig', boost: 'Boost', eco: 'Øko', home: 'Hjemme',
    away: 'Borte', comfort: 'Komfort', 'freeze protection': 'Frostsikring', 'energy heat': 'Energisparing',
};

export const optionLabel = (v) => {
    const s = String(v ?? '');
    return OPTION_LABELS[s.toLowerCase()] || (s.charAt(0).toUpperCase() + s.slice(1));
};

export const optionsOf = (d, capId) =>
    (d.capabilitiesOptions?.[capId]?.values || []).map(m => (typeof m === 'object' ? m.id : m));

// 21.5 → «21,5», 22 → «22,0» (trinn < 1) eller «22» (hele grader)
export const formatTemp = (v, step = 0.5) => {
    if (v == null || isNaN(v)) return '–';
    const n = Number(v);
    return (step < 1 || n % 1 !== 0 ? n.toFixed(1) : n.toFixed(0)).replace('.', ',');
};

export const formatPower = (w) =>
    w >= 1000 ? `${(w / 1000).toFixed(1).replace('.', ',')} kW` : `${Math.round(w)} W`;
