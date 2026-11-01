// Kobling mot Strømstyring-integrasjonen i HA (custom_components/stromstyring).
// Integrasjonen styrer bl.a. billaderen etter tariff og reduserer enheter når huset nærmer seg
// kapasitetsmålet. Billaderen (nov 2026): dag-tariff = dagnivå 6 A (laveste strøm bilene lader
// på), natt-tariff = smartlading – strømmen regnes ut fra bilens behov og fordeles jevnt fram til
// klar-tiden 05:00 (6–25 A, på nytt maks hvert 5. min); uten kjent bil fast nattstrøm 25 A;
// helg/helligdag PÅ DAGTID (tariffsensorens «helgetariff») full nattstrøm til behovet er dekket.
// Per enhet finnes:
//   sensor.global_load_manager_<navn>_state     (boost = nattnivå | normal = dagnivå | redusert_N; attr entity_id = enheten den styrer)
//   select.global_load_manager_<navn>_override  (auto | override | override_unless_critical | override_til_tariffendring)
// «override_unless_critical» = integrasjonen hopper over tariff-grunnivå og vanlige reduksjoner
// for enheten, men reduserer den likevel når alle auto-enheter er uttømt. NB: smartladingen
// kjører OGSÅ i denne modusen (koordinatoren hopper bare over «override»/«…til_tariffendring»),
// så om natten kan den overskrive et manuelt valg når målet endres. Å sette overstyring endrer
// IKKE strømmen – flisen må selv sette 25 A. Tilbake til «auto» re-appliserer tariff-grunnivået.

export const OVERRIDE_UNLESS_CRITICAL = 'override_unless_critical';

export const OVERRIDE_LABEL = {
    auto: 'Automatisk',
    override: 'Overstyrt (alltid)',
    override_unless_critical: 'Lader nå – overstyrt',
    override_til_tariffendring: 'Overstyrt til tariffendring',
};

// Per-enhet-tilstand. «boost» = enheten står på nattnivået sitt (for laderen: smartladingens
// mål eller fast nattstrøm), «normal» = dagnivå. Ikke «full strøm» – det avgjør smartladingen.
export function loadManagerStateText(state) {
    if (!state || state === 'unknown' || state === 'unavailable') return '';
    if (state === 'boost') return 'Nattnivå';
    if (state === 'normal') return 'Dagnivå';
    const m = /^redusert_(\d+)$/.exec(state);
    if (m) return `Redusert ${m[1]} steg`;
    return state;
}

// Husets modus (sensor.global_load_manager_mode) i klartekst
const HOUSE_MODE_TEXT = {
    normal: 'dagnivå, ingen reduksjoner',
    boost: 'nattnivå, ingen reduksjoner',
    reduserer: 'reduserer enheter mot kapasitetsmålet',
    kritisk: 'kritisk kapasitet – også fredede enheter reduseres',
};
export const houseModeText = (mode) => (!mode || mode === 'unknown' || mode === 'unavailable') ? '' : (HOUSE_MODE_TEXT[mode] || mode);

// Smartlading (sensor.global_load_manager_<navn>_smart_charging): kun aktiv om natten. State =
// mål-ampere, attributter = regnestykket: bil, identifisert, batteri_start_pct, batteri_sist_pct,
// ladegrense_pct, kwh_per_pct, ampere_avvik, behov_kwh, levert_kwh (fra laderens økt-energi –
// presis), gjenstaar_kwh, ferdig_tid (HH:MM = konfigurert klar-tid = planens FRIST),
// timer_til_frist, timer_til_ferdig + estimert_ferdig (HH:MM; null når behovet er dekket) =
// integrasjonens eget ANSLAG ved den strømmen som faktisk er valgt (gjenstående kWh /
// (mål − ampere_avvik) / (V × faser)), fridag, natt_tariff_til («Mon 06:00», strftime %a),
// maal_ampere, status («beregnet» | «etter ferdig-tid — tar igjen i bufferen» | «behov dekket —
// minimumsstrøm» | «helg/helligdag på dagtid — full nattstrøm» | «ikke natt» | «ingen bil
// tilkoblet» | «…— fast nattstrøm»).
//
// To regimer (okt/nov 2026):
// • Natt (22–06, også i helgen): ladingen fordeles jevnt fram til fristen ferdig_tid. Lite behov
//   klemmes opp til minimumsstrømmen (6 A) og blir ferdig lenge før fristen – derfor viser
//   dashbordet anslaget («≈ Ferdig 00:20») og nevner fristen ved siden av.
// • Fridag = natt-tariff i dagvinduet 06–22 (helg/helligdag, tariffsensorens «helgetariff»):
//   full nattstrøm til behovet er dekket, fristen gjelder IKKE.
// Anslaget regnes ved sensorens siste oppdatering (maks hvert 5. min) → forankres i `updatedAt`.
// Før 1/11-2026 var timer_til_ferdig tiden til fristen på vanlige netter; nå er det et anslag i
// begge regimer (1/11-2026, brukerens endring i integrasjonen).
// NB: krever kWh per % satt per bil i Strømstyring – ellers «fast nattstrøm» uten attributter.
export function smartChargingOf(dev) {
    if (!dev) return null;
    const a = dev.attributes || {};
    const num = (v) => (v == null || v === '' || isNaN(Number(v)) ? null : Number(v));
    const status = a.status || '';
    const active = a.bil != null && a.ferdig_tid != null;
    return {
        status,
        active,
        car: a.bil || null,
        socStart: num(a.batteri_start_pct),
        socLast: num(a.batteri_sist_pct),
        limit: num(a.ladegrense_pct),
        kwhPerPct: num(a.kwh_per_pct),
        ampOffset: num(a.ampere_avvik),
        needKwh: num(a.behov_kwh),
        deliveredKwh: num(a.levert_kwh),
        remainingKwh: num(a.gjenstaar_kwh),
        readyTime: a.ferdig_tid || null,
        deadlineHours: num(a.timer_til_frist),
        hoursLeft: num(a.timer_til_ferdig),
        estimatedClock: a.estimert_ferdig || null,
        freeDay: a.fridag === true,
        cheapUntil: a.natt_tariff_til || null,
        catchingUp: status.startsWith('etter ferdig-tid'),
        needCovered: status.startsWith('behov dekket'),
        targetAmps: num(a.maal_ampere) ?? num(dev.state),
        updatedAt: dev.lastUpdated ? new Date(dev.lastUpdated) : null,
    };
}

// «Mon 06:00» (HA kjører med engelsk C-locale) → «man. 06:00»
const DAY_NB = { mon: 'man.', tue: 'tir.', wed: 'ons.', thu: 'tor.', fri: 'fre.', sat: 'lør.', sun: 'søn.' };
export function cheapUntilText(s) {
    if (!s) return '';
    const m = /^([A-Za-zæøåÆØÅ]+)\.?\s+(\d{1,2}:\d{2})$/.exec(String(s).trim());
    if (!m) return String(s);
    const day = DAY_NB[m[1].slice(0, 3).toLowerCase()];
    return day ? `${day} ${m[2]}` : String(s);
}

const ampsText = (smart) => (smart?.targetAmps != null ? `${Math.round(smart.targetAmps)} A` : '');
const prettyStatus = (status) => {
    const t = String(status).replace(/\s+—\s+/g, ' – ');
    return t.charAt(0).toUpperCase() + t.slice(1);
};

// Én linje om hva smartladingen gjør akkurat nå (utvidet visning). '' når den ikke er i spill.
export function smartStatusText(smart) {
    if (!smart?.status || smart.status === 'ikke natt' || smart.status === 'av') return '';
    const a = ampsText(smart);
    if (smart.active) {
        if (smart.needCovered) return `Behovet er dekket – holder minimumsstrøm${a ? ` (${a})` : ''} til bilen sier seg ferdig`;
        if (smart.freeDay) return `Helg/helligdag på dagtid – full nattstrøm${a ? ` (${a})` : ''} til behovet er dekket${smart.cheapUntil ? `, natt-tariff til ${cheapUntilText(smart.cheapUntil)}` : ''}`;
        const est = smart.estimatedClock ? ` – anslått ferdig ${smart.estimatedClock}` : '';
        if (smart.catchingUp) return `Etter fristen ${smart.readyTime} – tar igjen i bufferen${a ? ` (${a})` : ''}${est}`;
        return `Fordeler ladingen fram til fristen ${smart.readyTime}${a ? ` (${a} nå)` : ''}${est}`;
    }
    return prettyStatus(smart.status);
}

// Kort undertekst til Strømstyring-raden (kort og flis) når laderen er i automatikk: hva
// integrasjonen gjør med laderen akkurat nå. Må få plass på én linje i kortet på 390 px (~34 tegn),
// så tariffen nevnes bare når smartladingen ikke er aktiv (aktiv smartlading = natt-tariff).
export function loadManagerRowText(lm) {
    if (!lm) return '';
    const smart = lm.smart;
    const a = ampsText(smart);
    if (smart?.active) {
        if (smart.needCovered) return `Behovet dekket${a ? ` · holder ${a}` : ''}`;
        if (smart.freeDay) return `Fridag · full nattstrøm${a ? ` ${a}` : ''}`;
        if (smart.catchingUp) return `Tar igjen etter ${smart.readyTime}${a ? ` · ${a}` : ''}`;
        return `Smartlading${a ? ` ${a}` : ''} · ${smart.estimatedClock ? `klar ≈ ${smart.estimatedClock}` : `ferdig ${smart.readyTime}`}`;
    }
    const main = smart?.status && smart.status !== 'ikke natt' && smart.status !== 'av' ? prettyStatus(smart.status) : lm.stateText;
    return [main, lm.tariff ? `tariff ${lm.tariff}` : ''].filter(Boolean).join(' · ') || 'Lader etter tariffplanen';
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
