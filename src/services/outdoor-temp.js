import { hassAPI } from './hass-api';
import { getSunPosition, angleDiff } from './sun-position';

// Logikk for utetemperatur-widgeten (OutdoorTempTile): hvilke utedeler har sol på veggen
// akkurat nå, og hva er beste anslag for ekte utetemperatur. Holdes utenfor komponentfilen
// så innstillinger og AddTileModal kan importere den uten å bryte fast refresh.
//
// Utedeler i sol viser typisk flere grader for høyt (bekreftet mot HA-historikk 13/9-2026:
// hver utedel toppet nøyaktig i timene da veggen dens hadde sol). Utedeler i skyggen teller;
// en utedel som nettopp mistet sola regnes som «avkjøles» i graceMinutes og holdes utenfor.
//
// Veggene navngis relativt til tegningen (langsiden ligger vannrett):
//   right  = gavlen som peker i retning houseBearing
//   bottom = langsiden 90° med klokka fra den (houseBearing + 90)
//   left   = houseBearing + 180,  top = houseBearing + 270
// Kompassnavnet («mot SØ») regnes ut fra houseBearing, så innstillingene gir mening
// uansett hvordan huset ligger.

export const WALL_OFFSET = { right: 0, bottom: 90, left: 180, top: 270 };
export const WALL_LABEL = {
    top: 'Langside øverst',
    bottom: 'Langside nederst',
    right: 'Gavl til høyre',
    left: 'Gavl til venstre',
};

export const DEFAULT_OUTDOOR_TEMP_SETTINGS = {
    units: [],            // [{ id, name, entityId, wall, pos (0–100), blockFromAz, blockToAz }]
    houseBearing: 90,     // retningen (grader) langsiden peker mot høyre i tegningen
    houseRatio: 2.15,     // langside / kortside
    orientation: 'house', // 'house' = langsiden vannrett, 'north' = nord opp
    graceMinutes: 45,     // så lenge regnes en utedel som «avkjøles» etter at sola forlot veggen
    showShadow: true,
    showCompass: true,
    showEstimate: true,
};

export const STATUS_TXT = {
    sun: 'I sola', cooling: 'Avkjøles', shade: 'I skyggen', night: 'Natt',
    unknown: 'Ukjent sol', nodata: 'Ingen data',
};

const rad = Math.PI / 180;
const GRAZE_COS = Math.cos(85 * rad); // sol mer enn 85° fra veggens retning = streifer bare
const COMPASS = ['N', 'NØ', 'Ø', 'SØ', 'S', 'SV', 'V', 'NV'];

export const compassName = (bearing) =>
    COMPASS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8];

export const wallBearing = (wall, houseBearing) =>
    ((((Number(houseBearing) || 0) + (WALL_OFFSET[wall] ?? 90)) % 360) + 360) % 360;

export const fmtTemp = (v) => (v == null ? '–' : `${v.toFixed(1).replace('.', ',')}°`);

// Finner sensorer som ser ut som utetemperatur fra varmepumper (ESPHome/Midea: *_outdoor_temperature).
export const detectOutdoorTempSensors = (entities = {}, entityToArea = {}) => {
    const found = Object.values(entities).filter(e => {
        const [domain, objectId] = (e.entity_id || '').split('.');
        if (domain !== 'sensor') return false;
        if (!/outdoor_temp|utetemp/.test(objectId)) return false;
        return Number.isFinite(parseFloat(e.state)) || e.state === 'unavailable' || e.state === 'unknown';
    });
    const n = Math.max(found.length, 1);
    return found.map((e, i) => ({
        id: e.entity_id,
        name: entityToArea?.[e.entity_id] || e.attributes?.friendly_name || e.entity_id,
        entityId: e.entity_id,
        wall: 'bottom',
        pos: Math.round(((i + 1) / (n + 1)) * 100),
        blockFromAz: '',
        blockToAz: '',
    }));
};

// --- Sol ---------------------------------------------------------------------

const homeCoords = (cfg) => {
    const z = hassAPI.entities?.['zone.home']?.attributes;
    const lat = Number(cfg.latitude ?? z?.latitude);
    const lon = Number(cfg.longitude ?? z?.longitude);
    return Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0) ? { lat, lon } : null;
};

const sunAt = (date, coords) => (coords ? getSunPosition(date, coords.lat, coords.lon) : null);

// Sola nå: HA sin sun.sun først (oppdateres hvert minutt), ellers lokal utregning.
const readSunNow = (now, coords) => {
    const attrs = hassAPI.entities?.['sun.sun']?.attributes;
    const az = Number(attrs?.azimuth);
    const el = Number(attrs?.elevation);
    if (Number.isFinite(az) && Number.isFinite(el)) return { azimuth: az, elevation: el };
    return sunAt(now, coords);
};

const inAzRange = (az, from, to) => {
    if (from === '' || to === '' || from == null || to == null) return false;
    const f = Number(from), t = Number(to);
    if (!Number.isFinite(f) || !Number.isFinite(t)) return false;
    return f <= t ? (az >= f && az <= t) : (az >= f || az <= t);
};

// > 0 når veggen har sol (cos av vinkelen mellom sol og veggretning), ellers 0.
export const wallSun = (sun, unit, cfg) => {
    if (!sun || sun.elevation <= 0) return 0;
    const c = Math.cos(angleDiff(sun.azimuth, wallBearing(unit.wall, cfg.houseBearing)) * rad);
    if (c <= GRAZE_COS) return 0;
    // Hindring (platting, paviljong, nabohus): sola regnes borte i dette asimut-intervallet.
    if (inAzRange(sun.azimuth, unit.blockFromAz, unit.blockToAz)) return 0;
    return c;
};

const unitStatus = (unit, cfg, now, coords, sunNow) => {
    if (!sunNow) return 'unknown';
    if (sunNow.elevation <= 0) return 'night';
    if (wallSun(sunNow, unit, cfg) > 0) return 'sun';
    const grace = Number(cfg.graceMinutes ?? 45);
    if (coords && grace > 0) {
        for (let back = 15; back <= grace; back += 15) {
            const s = sunAt(new Date(now.getTime() - back * 60000), coords);
            if (wallSun(s, unit, cfg) > 0) return 'cooling';
        }
    }
    return 'shade';
};

const readTemp = (entityId) => {
    const v = parseFloat(hassAPI.entities?.[entityId]?.state);
    return Number.isFinite(v) ? v : null;
};

const mean = (rows) => rows.reduce((s, r) => s + r.temp, 0) / rows.length;

const estimate = (rows) => {
    const valid = rows.filter(r => r.temp != null);
    if (!valid.length) return { value: null, basis: [], mode: 'ingen data' };
    const trusted = valid.filter(r => r.status === 'shade' || r.status === 'night' || r.status === 'unknown');
    if (trusted.length) {
        const allNight = valid.every(r => r.status === 'night');
        const allUnknown = valid.every(r => r.status === 'unknown');
        return {
            value: mean(trusted),
            basis: trusted,
            mode: allNight ? 'natt, alle teller' : allUnknown ? 'snitt av alle' : 'skyggesiden',
        };
    }
    const cooling = valid.filter(r => r.status === 'cooling');
    if (cooling.length) return { value: mean(cooling), basis: cooling, mode: 'nylig i skygge' };
    const min = valid.reduce((a, b) => (a.temp < b.temp ? a : b));
    return { value: min.temp, basis: [min], mode: 'laveste måling' };
};

export const evaluateOutdoorTemp = (cfg, units, now = new Date()) => {
    const coords = homeCoords(cfg);
    const sun = readSunNow(now, coords);
    const rows = units.map(unit => {
        const temp = readTemp(unit.entityId);
        const status = temp == null ? 'nodata' : unitStatus(unit, cfg, now, coords, sun);
        return { unit, temp, status };
    });
    return { coords, sun, rows, est: estimate(rows) };
};

const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

// «Neste: Stue kommer i skyggen ca. kl. 16:20» — finnes ved å gå fram 5 og 5 minutter.
export const nextChangeText = (cfg, units, coords, rows, now) => {
    if (!coords || !units.length) return '';
    const simple = (st) => (st === 'sun' ? 'sun' : st === 'night' ? 'night' : 'shade');
    const current = Object.fromEntries(rows.map(r => [r.unit.id, simple(r.status)]));
    for (let step = 5; step <= 24 * 60; step += 5) {
        const t = new Date(now.getTime() + step * 60000);
        const sun = sunAt(t, coords);
        for (const u of units) {
            const st = !sun || sun.elevation <= 0 ? 'night' : wallSun(sun, u, cfg) > 0 ? 'sun' : 'shade';
            if (st !== current[u.id]) {
                if (st === 'night') return `Sola går ned ca. kl. ${hhmm(t)}`;
                return `Neste: ${u.name} ${st === 'sun' ? 'får sol' : 'kommer i skyggen'} ca. kl. ${hhmm(t)}`;
            }
        }
    }
    return '';
};
