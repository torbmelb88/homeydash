// Elbiler (vehicle-composites fra hub-mapper) og koblingen til billader-flisen.
// Laderen (Zaptec) er hoveddelen av flisen; bilen som faktisk lader finnes her.

export const isVehicle = (d) =>
    !!d && !d._inComposite &&
    (d.capabilities?.includes('homey_vehicle') || d.settings?.compositeType === 'vehicle');

// Stabil nøkkel for innstillinger: posisjons-entiteten overlever at HA gir
// enheten ny device registry-UUID (samme mønster som klimasiden).
export const vehicleKey = (v) =>
    v.entityIds?.find(e => e.startsWith('device_tracker.')) || v.primaryEntityId || v.id;

export const findVehicleByKey = (devices, key) =>
    devices.find(d => isVehicle(d) && (vehicleKey(d) === key || d.id === key)) || null;

export const VEHICLE_STATE_MAP = {
    starting:     { text: 'Starter lading', charging: true  },
    charging:     { text: 'Lader',          charging: true  },
    stopped:      { text: 'Lading stoppet', charging: false },
    complete:     { text: 'Fulladet',       charging: false },
    disconnected: { text: 'Frakoblet',      charging: false },
    no_power:     { text: 'Ingen strøm',    charging: false },
};

const capVal = (d, id) => d?.capabilitiesObj?.[id]?.value;

// Flat oppsummering av bilen til visning
export function vehicleSummary(v) {
    if (!v) return null;
    const state = capVal(v, 'vehicle_charging_state') || '';
    const limit = capVal(v, 'vehicle_charge_limit');
    const battery = capVal(v, 'measure_battery');
    const timeToFullRaw = capVal(v, 'vehicle_time_to_full');
    const timeToFull = timeToFullRaw ? new Date(timeToFullRaw) : null;
    return {
        id: v.id,
        key: vehicleKey(v),
        name: v.name || 'Bil',
        make: v.settings?.vehicleMake || '',
        model: v.settings?.vehicleModel || '',
        battery: battery == null ? null : Number(battery),
        batteryUsable: capVal(v, 'vehicle_battery_usable'),
        limit: limit == null ? null : Number(limit),
        limitOptions: v.capabilitiesOptions?.vehicle_charge_limit || { min: 50, max: 100, step: 1 },
        range: capVal(v, 'vehicle_range') ?? capVal(v, 'vehicle_range_estimate') ?? capVal(v, 'vehicle_range_ideal') ?? null,
        rangeUnit: v.capabilitiesObj?.vehicle_range?.units || 'km',
        state,
        stateInfo: VEHICLE_STATE_MAP[state] || null,
        isCharging: VEHICLE_STATE_MAP[state]?.charging ?? false,
        chargeRate: capVal(v, 'vehicle_charge_rate'),
        chargeRateUnit: v.capabilitiesObj?.vehicle_charge_rate?.units || 'km/h',
        chargerPower: capVal(v, 'vehicle_charger_power'),
        chargerCurrent: capVal(v, 'vehicle_charger_current'),
        energyAdded: capVal(v, 'vehicle_energy_added'),
        timeToFull: timeToFull && !isNaN(timeToFull.getTime()) ? timeToFull : null,
        cableConnected: capVal(v, 'vehicle_cable_connected'),
        chargeSwitch: capVal(v, 'vehicle_charge_switch'),
        hasChargeSwitch: v.capabilities?.includes('vehicle_charge_switch'),
        hasChargeLimit: v.capabilities?.includes('vehicle_charge_limit'),
        location: capVal(v, 'vehicle_location'),
        atHome: capVal(v, 'vehicle_location') === 'home',
        awake: capVal(v, 'vehicle_awake'),
        locked: capVal(v, 'vehicle_locked'),
        portOpen: capVal(v, 'vehicle_charge_port_open'),
        insideTemp: capVal(v, 'measure_temperature.inside'),
        scheduledCharging: capVal(v, 'vehicle_scheduled_charging'),
    };
}

// Er laderen i bruk (bil tilkoblet)?
export function chargerConnected(charger) {
    const mode = capVal(charger, 'charge_mode');
    if (mode) return mode !== 'disconnected' && mode !== 'unknown';
    if (capVal(charger, 'alarm_generic.car_connected') != null) return !!capVal(charger, 'alarm_generic.car_connected');
    return (capVal(charger, 'measure_power') ?? 0) > 10;
}

const chargerIsCharging = (charger) =>
    capVal(charger, 'charge_mode') === 'connected_charging' || (capVal(charger, 'measure_power') ?? 0) > 10;

// Poengsum per bil: hvor sannsynlig er det at denne bilen henger på laderen?
// Negative poeng = utelukket (kabel ikke tilkoblet / bilen er ikke hjemme).
export function scoreVehicle(charger, v) {
    const s = vehicleSummary(v);
    let score = 0;
    const reasons = [];

    if (s.cableConnected === true) { score += 3; reasons.push('kabel tilkoblet'); }
    else if (s.cableConnected === false) { score -= 10; reasons.push('kabel ikke tilkoblet'); }

    if (s.location === 'home') { score += 2; reasons.push('hjemme'); }
    else if (s.location && s.location !== 'unknown' && s.location !== 'unavailable') { score -= 10; reasons.push('ikke hjemme'); }

    const chCharging = chargerIsCharging(charger);
    if (chCharging && s.isCharging) { score += 3; reasons.push('lader samtidig'); }
    else if (chCharging && (s.state === 'disconnected' || s.state === 'no_power')) { score -= 5; }
    else if (!chCharging && (s.state === 'complete' || s.state === 'stopped')) { score += 1; }

    const chW = capVal(charger, 'measure_power') ?? 0;
    const carW = s.chargerPower;
    if (chW > 500 && carW != null && carW > 500) {
        const diff = Math.abs(chW - carW) / chW;
        if (diff < 0.3) { score += 2; reasons.push('effekt stemmer'); }
        else if (diff > 0.6) { score -= 3; }
    }
    return { vehicle: v, summary: s, score, reasons };
}

// Finn bilen som lader på denne laderen.
// settings.vehicleDeviceId: '' / undefined = auto, 'none' = av, ellers vehicleKey
// settings.excludedVehicleIds: biler som ikke skal vurderes i auto-modus
export function findChargingVehicle(devices, charger, settings = {}) {
    if (settings.vehicleDeviceId === 'none') return null;
    if (settings.vehicleDeviceId) return findVehicleByKey(devices, settings.vehicleDeviceId);
    if (!charger || !chargerConnected(charger)) return null;

    const excluded = new Set(settings.excludedVehicleIds || []);
    const candidates = devices.filter(v => isVehicle(v) && !excluded.has(vehicleKey(v)));
    if (candidates.length === 0) return null;

    const scored = candidates.map(v => scoreVehicle(charger, v)).filter(r => r.score >= 0);
    if (scored.length === 0) return null;
    // Én gjenstående kandidat (f.eks. bil uten kabel-/posisjonsdata) godtas når laderen er i bruk
    if (scored.length === 1) return scored[0].vehicle;
    scored.sort((a, b) => b.score - a.score);
    if (scored[0].score <= 0 || scored[0].score === scored[1].score) return null;
    return scored[0].vehicle;
}

// Alle biler (til lista «Biler» når ingen lader, og til innstillingsvelgeren)
export const allVehicles = (devices) => devices.filter(isVehicle);

// «kl. 18:06» i dag, «i morgen 07:30», ellers dato
export function formatClock(date) {
    if (!date) return '';
    const now = new Date();
    const hhmm = date.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
    const sameDay = date.toDateString() === now.toDateString();
    if (sameDay) return hhmm;
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    if (date.toDateString() === tomorrow.toDateString()) return `i morgen ${hhmm}`;
    return `${date.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' })} ${hhmm}`;
}

// «om 1 t 20 min» / «om 12 min» / '' når passert
export function formatUntil(date) {
    if (!date) return '';
    const min = Math.round((date.getTime() - Date.now()) / 60000);
    if (min <= 0) return '';
    if (min < 60) return `om ${min} min`;
    const h = Math.floor(min / 60), m = min % 60;
    return m ? `om ${h} t ${m} min` : `om ${h} t`;
}

export const locationText = (loc) => {
    if (!loc || loc === 'unknown' || loc === 'unavailable') return 'Ukjent sted';
    if (loc === 'home') return 'Hjemme';
    if (loc === 'not_home') return 'Borte';
    return loc;
};
