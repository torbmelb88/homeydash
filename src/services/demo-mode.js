// Demo-modus: seeder et ferdig dashboard i localStorage og patcher hassAPI-
// singletonen med syntetiske entiteter + simulerte live-oppdateringer.
//
// Strategien er å la ALT annet være uendret: HomeyContext, hub-mapper, fliser og
// komponenter som importerer hassAPI direkte ser et «ekte» HA-API. connect() er
// patchet til å lykkes umiddelbart, callService muterer demoverdenen lokalt, og
// getHistory genererer plausible kurver.

import { hassAPI } from './hass-api';
import { isDemoActive } from './demo-flag';
import { buildDemoWorld, DEMO_SETTINGS, DEMO_PAGES, DEMO_TILES } from './demo-data';

const SEED_KEYS = ['settings_config', 'pages', 'tiles'];

const seedLocalStorage = () => {
    localStorage.setItem('dashboardProfile', 'demo');
    localStorage.setItem('settings_config', JSON.stringify(DEMO_SETTINGS));
    localStorage.setItem('pages', JSON.stringify(DEMO_PAGES));
    localStorage.setItem('tiles', JSON.stringify(DEMO_TILES));
    localStorage.setItem('demoSeeded', '1');
};

// Forlater man demo-modus skal demo-dataene ikke bli liggende som «cache» og
// skygge for ekte data (storage.get leser localStorage før Firestore).
const cleanupSeed = () => {
    if (localStorage.getItem('demoSeeded') !== '1') return;
    SEED_KEYS.forEach((k) => localStorage.removeItem(k));
    if (localStorage.getItem('dashboardProfile') === 'demo') localStorage.removeItem('dashboardProfile');
    localStorage.removeItem('demoSeeded');
};

// ── Simulering ──────────────────────────────────────────────────────────

const TICK_MS = 6000;
let simTimer = null;

const rnd = (spread) => (Math.random() - 0.5) * 2 * spread;

export function bootstrapDemo() {
    if (!isDemoActive) {
        cleanupSeed();
        return;
    }

    seedLocalStorage();

    const world = buildDemoWorld();
    hassAPI.entities = world.entities;
    hassAPI.entityToDevice = world.entityToDevice;
    hassAPI.deviceRegistry = world.deviceRegistry;
    hassAPI.entityToArea = world.entityToArea;
    hassAPI.initialDataLoaded = true;
    hassAPI.httpBase = window.location.origin;

    const setState = (eid, newState, attrPatch) => {
        const e = hassAPI.entities[eid];
        if (!e) return;
        const next = {
            ...e,
            state: newState == null ? e.state : String(newState),
            attributes: attrPatch ? { ...e.attributes, ...attrPatch } : e.attributes,
            last_updated: new Date().toISOString(),
        };
        hassAPI.entities[eid] = next;
        hassAPI.onStateChanged?.(next);
    };

    const num = (eid) => parseFloat(hassAPI.entities[eid]?.state) || 0;

    // Vedvarende sim-tilstand mellom ticks
    const sim = {
        washer: { remaining: 42, idleTicks: 0 },
        vvb: { heating: false, ticksInPhase: 0 },
        mower: { returning: 0, edgeTicks: 0, timeToday: 47, progress: 38 },
        motionCountdown: 45,
        personCountdown: 40,
    };

    const tick = () => {
        // Vaskemaskin: fullt program i «komprimert» tid (1 min ≈ 10 sim-min)
        const w = sim.washer;
        const status = hassAPI.entities['sensor.washer_status']?.state;
        if (['washing', 'rinsing', 'spinning'].includes(status)) {
            w.remaining = Math.max(0, w.remaining - 1);
            const phase = w.remaining > 20 ? 'washing' : w.remaining > 10 ? 'rinsing' : w.remaining > 0 ? 'spinning' : 'done';
            const power = phase === 'washing' ? 1800 + rnd(150) : phase === 'rinsing' ? 350 + rnd(60) : phase === 'spinning' ? 620 + rnd(90) : 1.5;
            setState('sensor.washer_status', phase);
            setState('sensor.washer_remaining_time', w.remaining);
            setState('sensor.washer_power', Math.round(power));
        } else if (status === 'done') {
            w.idleTicks += 1;
            if (w.idleTicks > 20) { setState('sensor.washer_status', 'standby'); w.idleTicks = 0; }
        } else { // standby
            w.idleTicks += 1;
            if (w.idleTicks > 40) {
                w.idleTicks = 0;
                w.remaining = 42;
                setState('sensor.washer_status', 'washing');
                setState('sensor.washer_remaining_time', w.remaining);
            }
        }

        // Varmtvannsbereder: elementet sykler av/på, temperatur følger
        const v = sim.vvb;
        v.ticksInPhase += 1;
        if (v.ticksInPhase > 20) { v.heating = !v.heating; v.ticksInPhase = 0; }
        const vvbTemp = num('sensor.water_heater_temperature') + (v.heating ? 0.08 : -0.03);
        setState('sensor.water_heater_temperature', vvbTemp.toFixed(1));
        setState('sensor.water_heater_power', v.heating ? Math.round(1950 + rnd(30)) : 0);
        setState('binary_sensor.water_heater_element_1_status', v.heating ? 'on' : 'off');

        // Elbillader: effekt styres av «Tilgjengelig strøm» (0 A = stopp)
        const limitA = num('number.car_charger_circuit_available_current');
        const maxPower = limitA * 230 * 3;
        const charging = limitA > 0;
        const evPower = charging ? Math.min(7400, maxPower) + rnd(220) : 0;
        setState('sensor.car_charger_mode', charging ? 'connected_charging' : 'connected_requesting');
        setState('sensor.car_charger_power', Math.round(Math.max(0, evPower)));
        if (charging) {
            setState('sensor.car_charger_session_energy', (num('sensor.car_charger_session_energy') + evPower * TICK_MS / 3600000000).toFixed(2));
            setState('sensor.car_charger_energy_daily', (num('sensor.car_charger_energy_daily') + evPower * TICK_MS / 3600000000).toFixed(2));
            const phaseA = evPower / (230 * 3);
            setState('sensor.car_charger_current_phase1', (phaseA + rnd(0.2)).toFixed(1));
            setState('sensor.car_charger_current_phase2', (phaseA + rnd(0.2)).toFixed(1));
            setState('sensor.car_charger_current_phase3', (phaseA + rnd(0.2)).toFixed(1));
        }
        setState('sensor.car_charger_cost_current', (Math.max(0, evPower) / 1000 * 1.25).toFixed(1));

        // Robotklipper
        const m = sim.mower;
        const mowerStatus = hassAPI.entities['sensor.robotklipper_status']?.state;
        if (m.edgeTicks > 0) {
            m.edgeTicks -= 1;
            if (m.edgeTicks === 0) setState('sensor.robotklipper_status', 'mowing');
        } else if (m.returning > 0) {
            m.returning -= 1;
            if (m.returning === 0) {
                setState('sensor.robotklipper_status', 'home');
                setState('lawn_mower.robotklipper', 'docked');
                setState('sensor.robotklipper_battery', num('sensor.robotklipper_battery'), { charging: true });
            }
        } else if (mowerStatus === 'mowing' || mowerStatus === 'edge_cutting') {
            m.timeToday += TICK_MS / 60000;
            m.progress = Math.min(100, m.progress + 0.15);
            const battery = Math.max(0, num('sensor.robotklipper_battery') - 0.06);
            setState('sensor.robotklipper_battery', battery.toFixed(0));
            setState('sensor.robotklipper_mowing_time_today', Math.round(m.timeToday));
            setState('sensor.robotklipper_estimated_daily_progress', m.progress.toFixed(0));
            setState('sensor.robotklipper_estimated_area_mowed_today', Math.round(m.progress * num('sensor.robotklipper_lawn_area') / 100));
            if (battery < 20 || m.progress >= 100) {
                setState('sensor.robotklipper_status', 'going_home');
                setState('lawn_mower.robotklipper', 'docked');
                m.returning = 5;
            }
        } else if (mowerStatus === 'home') {
            const battery = Math.min(95, num('sensor.robotklipper_battery') + 0.4);
            setState('sensor.robotklipper_battery', battery.toFixed(0), { charging: battery < 95 });
        }

        // Varmepumpe: romtemperatur driver mot måltemperatur
        const hp = hassAPI.entities['climate.stue_varmepumpe'];
        if (hp && hp.state !== 'off') {
            const cur = hp.attributes.current_temperature ?? 21;
            const target = hp.attributes.temperature ?? 22;
            const drift = cur < target ? 0.04 : -0.02;
            setState('climate.stue_varmepumpe', null, {
                current_temperature: Math.round((cur + drift + rnd(0.03)) * 10) / 10,
                hvac_action: cur < target - 0.2 ? 'heating' : 'idle',
            });
        }

        // Utetemperatur: sakte vandring
        setState('sensor.ute_temperatur', (num('sensor.ute_temperatur') + rnd(0.06)).toFixed(1));

        // Strømmåler: grunnlast + de store forbrukerne
        const total = 450 + rnd(120) + num('sensor.washer_power') + num('sensor.water_heater_power') + num('sensor.car_charger_power');
        setState('sensor.strommaler_effekt', Math.round(total));

        // Bevegelse i entreen i ny og ne
        sim.motionCountdown -= 1;
        if (sim.motionCountdown === 0) setState('binary_sensor.entre_bevegelse', 'on');
        if (sim.motionCountdown === -2) setState('binary_sensor.entre_bevegelse', 'off');
        if (sim.motionCountdown < -2) sim.motionCountdown = 40 + Math.floor(Math.random() * 30);

        // Jonas kommer og går
        sim.personCountdown -= 1;
        if (sim.personCountdown <= 0) {
            const jonas = hassAPI.entities['person.jonas'];
            setState('person.jonas', jonas?.state === 'home' ? 'not_home' : 'home');
            sim.personCountdown = 35 + Math.floor(Math.random() * 25);
        }
    };

    const startSimulation = () => {
        if (simTimer) return;
        simTimer = setInterval(tick, TICK_MS);
    };
    const stopSimulation = () => {
        if (simTimer) { clearInterval(simTimer); simTimer = null; }
    };

    // ── Patch hassAPI ───────────────────────────────────────────────────

    hassAPI.connect = async () => {
        hassAPI.isConnected = true;
        hassAPI.isConnecting = false;
        hassAPI.isAuthenticated = true;
        startSimulation();
        setTimeout(() => hassAPI.onReady?.(hassAPI.entities), 0);
        return true;
    };

    hassAPI.disconnect = () => { stopSimulation(); };

    hassAPI.callService = async (domain, service, entityId, data = {}) => {
        const e = hassAPI.entities[entityId];
        if (!e) return;

        if (domain === 'light') {
            if (service === 'turn_off') setState(entityId, 'off');
            else setState(entityId, 'on', {
                brightness: data.brightness ?? e.attributes.brightness ?? 200,
                ...(data.color_temp_kelvin ? { color_temp_kelvin: data.color_temp_kelvin } : {}),
            });
        } else if (domain === 'switch' || domain === 'input_boolean') {
            setState(entityId, service === 'turn_on' ? 'on' : 'off');
        } else if (domain === 'climate') {
            if (service === 'set_temperature') setState(entityId, null, { temperature: data.temperature });
            else if (service === 'set_hvac_mode') setState(entityId, data.hvac_mode);
            else if (service === 'set_fan_mode') setState(entityId, null, { fan_mode: data.fan_mode });
        } else if (domain === 'cover') {
            if (service === 'set_cover_position') {
                setState(entityId, data.position > 0 ? 'open' : 'closed', { current_position: data.position });
            }
        } else if (domain === 'number') {
            setState(entityId, data.value);
        } else if (domain === 'select' || domain === 'input_select') {
            setState(entityId, data.option);
        } else if (domain === 'water_heater') {
            if (service === 'set_temperature') setState(entityId, null, { temperature: data.temperature });
        } else if (domain === 'lawn_mower') {
            const statusEid = 'sensor.robotklipper_status';
            if (service === 'start_mowing') {
                setState(entityId, 'mowing');
                setState(statusEid, 'mowing');
                setState('sensor.robotklipper_battery', num('sensor.robotklipper_battery'), { charging: false });
                sim.mower.returning = 0;
            } else if (service === 'pause') {
                setState(entityId, 'paused');
                setState(statusEid, 'paused');
            } else if (service === 'dock') {
                setState(entityId, 'docked');
                setState(statusEid, 'going_home');
                sim.mower.returning = 4;
            }
        } else if (domain === 'button') {
            if (entityId === 'button.robotklipper_start_edge_cutting') {
                setState('sensor.robotklipper_status', 'edge_cutting');
                setState('lawn_mower.robotklipper', 'mowing');
                sim.mower.edgeTicks = 8;
            }
        }
    };

    // Syntetisk historikk: plausibel døgnkurve rundt nåverdien
    hassAPI.getHistory = async (entityId, startTime, endTime = new Date()) => {
        const e = hassAPI.entities[entityId];
        const start = new Date(startTime).getTime();
        const end = new Date(endTime).getTime();
        if (!e || isNaN(start) || isNaN(end) || end <= start) return { [entityId]: [] };

        const v = parseFloat(e.state);
        if (isNaN(v)) {
            return { [entityId]: [{ s: e.state, lu: start / 1000 }, { s: e.state, lu: end / 1000 }] };
        }
        const points = [];
        const step = Math.max(5 * 60 * 1000, (end - start) / 200);
        for (let t = start; t <= end; t += step) {
            const phase = t / 3600000;
            const val = Math.max(0, v * (0.75 + 0.25 * Math.sin(phase)) + rnd(0.05 * Math.abs(v) + 0.1));
            points.push({ s: String(Math.round(val * 100) / 100), lu: t / 1000 });
        }
        points.push({ s: e.state, lu: end / 1000 });
        return { [entityId]: points };
    };

    // Nøytrale stubber for API-er demoen ikke støtter (intercom m.m.)
    hassAPI.callServiceWithResponse = async () => ({});
    hassAPI.subscribeMessage = async () => () => {};
    hassAPI.subscribeEvents = async () => () => {};
}
