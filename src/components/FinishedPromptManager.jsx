import React, { useEffect, useRef, useState } from 'react';
import { useHomey } from '../context/HomeyContext';
import { storage } from '../services/storage';
import { hassAPI } from '../services/hass-api';
import { Utensils, Shirt, WashingMachine, Trash2, Scissors } from 'lucide-react';
import FinishedPromptOverlay, { useFinishedPrompt } from './FinishedPromptOverlay';
import { useApplianceState, applianceCfgFromSettings, findCycleDevice, nativeStateOf } from '../hooks/useApplianceState';
import useLedAlert from '../hooks/useLedAlert';

/**
 * Global overvåker for «dynamiske fliser»: ferdig-popupen («Er den tømt?»)
 * vises uansett hvilken side som er aktiv (også FamilyPage/iframe-sider),
 * fordi manageren er montert på App-nivå — ikke inne i flisene.
 *
 * Overvåker ALLE enheter med relevante capabilities, uavhengig av om
 * profilen har en flis for dem (viktig for f.eks. kjøkkenpanelet som står
 * på familie-siden). Finnes en flis, brukes dens innstillinger (terskler,
 * finishedPrompt av/på); ellers brukes standardverdier.
 */

// ── Apparat på smartplugg (effektbasert tilstandsmaskin) ───────────────
// Native maskintilstand (Electrolux-integrasjonen) gir umiddelbar Ferdig ved
// «End Of Cycle» og undertrykker falsk Ferdig i laveffekt-faser — samme
// hybrid som i ApplianceTile.
const ApplianceWatcher = ({ device, settings }) => {
    const { devices } = useHomey();
    const cfg = applianceCfgFromSettings(settings);
    const cycleDevice = findCycleDevice(devices, device, settings);
    const { machineState, finishedExpired } = useApplianceState(device, cfg, nativeStateOf(cycleDevice));

    const kind = settings.applianceKind || device.settings?.applianceKind || 'dishwasher';

    const { visible, acknowledge, snooze } = useFinishedPrompt({
        deviceId: device.id,
        finishedAt: (machineState.phase === 'finished' && !finishedExpired) ? machineState.finishedAt : null,
        enabled: settings.finishedPrompt !== false,
    });
    useLedAlert(visible);

    const KindIcon = kind === 'dryer' ? Shirt : Utensils;
    const label = device.name || (kind === 'dishwasher' ? 'Oppvaskmaskin' : 'Tørketrommel');
    const snoozeMinutes = Math.max(1, Number(settings.snoozeMinutes) || 5);

    return (
        <FinishedPromptOverlay
            visible={visible}
            icon={<KindIcon size={44} strokeWidth={1.8} />}
            title={`${label}en er ferdig`}
            question="Er den tømt?"
            onYes={acknowledge}
            onSnooze={(min) => snooze(min)}
            snoozeMinutes={snoozeMinutes}
        />
    );
};

// ── Vaskemaskin (operational_state-basert) ─────────────────────────────
// 'unavailable'/'unknown' regnes som inaktive så et sensor-dropout ikke
// tolkes som at maskinen jobber (ville nullstilt ferdig-tilstand).
const WASHER_INACTIVE_KEYWORDS = [
    'idle', 'off', 'standby', 'inactive', 'end', 'done', 'finished',
    'ferdig', 'completed', 'stopped', 'pause', 'paused', '0',
    'unavailable', 'unknown',
];

// Kun disse slutt-tilstandene regnes som «ferdig» — en overgang til
// pause/standby/av (avbrutt program) skal IKKE spørre om tømming.
const WASHER_FINISHED_KEYWORDS = [
    'done', 'finished', 'finish', 'end', 'ended', 'ferdig',
    'complete', 'completed', 'cycle_complete',
];

const WasherWatcher = ({ device, settings }) => {
    const opStateCap = device.capabilitiesObj?.operational_state;
    const rawOpState = opStateCap?.value;
    const customKeywords = (settings.customInactiveKeywords || '')
        .split(',')
        .map(k => k.trim().toLowerCase())
        .filter(Boolean);
    const inactive = [...WASHER_INACTIVE_KEYWORDS, ...customKeywords];
    const isActiveState = (v) => Boolean(v) && !inactive.includes(String(v).toLowerCase());
    const isFinishedState = (v) => WASHER_FINISHED_KEYWORDS.includes(String(v || '').toLowerCase());
    const isActive = isActiveState(rawOpState);

    // Ferdig = overgang aktiv → ferdig-tilstand. Persistert så det
    // overlever reload; utløper etter 12 timer.
    const finishedKey = `washerFinishedAt:${device.id}`;
    const [finishedAt, setFinishedAt] = useState(() => {
        const v = parseInt(localStorage.getItem(finishedKey), 10);
        return (!isNaN(v) && Date.now() - v < 12 * 60 * 60 * 1000) ? v : null;
    });
    const prevActiveRef = useRef(null);
    useEffect(() => {
        const prev = prevActiveRef.current;
        prevActiveRef.current = isActive;
        if (prev === true && !isActive && isFinishedState(rawOpState)) {
            const t = Date.now();
            setFinishedAt(t);
            try { localStorage.setItem(finishedKey, String(t)); } catch { /* ignore */ }
        } else if (isActive && finishedAt) {
            setFinishedAt(null);
            try { localStorage.removeItem(finishedKey); } catch { /* ignore */ }
        }
    }, [isActive]); // eslint-disable-line react-hooks/exhaustive-deps

    // Rekonstruksjon fra HA-historikk — samme grep som for oppvaskmaskinen.
    // Uten dette vises popupen kun hvis et dashbord var våkent i akkurat det
    // øyeblikket maskinen ble ferdig. Kjøres ved mount, prøves på nytt etter
    // 60 s ved feil (typisk: siden lastes mens HA fortsatt starter), og
    // resjekkes hvert 15. min — fanger overganger som gikk tapt mens
    // WebSocket-tilkoblingen var nede (f.eks. HA-restart midt i en vask).
    // Trygt å gjenta: ferdig-tidspunktet beregnes fra historikken og er
    // stabilt, så kvitteringsmatchingen (±10 min) forblir gyldig.
    useEffect(() => {
        const entityId = opStateCap?.entity_id;
        if (!device.isHA || !entityId) return;
        let cancelled = false;
        let retryTimer = null;

        const reconstruct = async () => {
            try {
                const start = new Date(Date.now() - 12 * 60 * 60 * 1000);
                const result = await hassAPI.getHistory(entityId, start);
                const raw = result?.[entityId] || [];
                const samples = raw.map(p => ({
                    time: Math.round((p.lu ?? p.last_updated_ts ?? 0) * 1000) ||
                          new Date(p.last_updated || 0).getTime(),
                    value: String(p.s ?? p.state ?? ''),
                })).filter(p => p.time > 0 && p.value)
                  .sort((a, b) => a.time - b.time);

                let lastFinished = null;
                let prevActive = false;
                for (const s of samples) {
                    const active = isActiveState(s.value);
                    if (active) lastFinished = null; // ny kjøring nullstiller
                    else if (prevActive && isFinishedState(s.value)) lastFinished = s.time;
                    prevActive = active;
                }

                if (cancelled) return;
                if (lastFinished && Date.now() - lastFinished < 12 * 60 * 60 * 1000) {
                    setFinishedAt(lastFinished);
                    try { localStorage.setItem(finishedKey, String(lastFinished)); } catch { /* ignore */ }
                }
            } catch (err) {
                console.warn('WasherWatcher: klarte ikke hente statushistorikk', err);
                if (!cancelled && !retryTimer) {
                    retryTimer = setTimeout(() => { retryTimer = null; reconstruct(); }, 60 * 1000);
                }
            }
        };

        reconstruct();
        const timer = setInterval(reconstruct, 15 * 60 * 1000);
        return () => {
            cancelled = true;
            clearInterval(timer);
            if (retryTimer) clearTimeout(retryTimer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [device.id, opStateCap?.entity_id]);

    const { visible, acknowledge, snooze } = useFinishedPrompt({
        deviceId: device.id,
        finishedAt,
        enabled: settings.finishedPrompt !== false,
    });
    useLedAlert(visible);

    const snoozeMinutes = Math.max(1, Number(settings.snoozeMinutes) || 5);

    return (
        <FinishedPromptOverlay
            visible={visible}
            icon={<WashingMachine size={44} strokeWidth={1.8} />}
            title="Vaskemaskinen er ferdig"
            question="Er den tømt?"
            onYes={acknowledge}
            onSnooze={(min) => snooze(min)}
            snoozeMinutes={snoozeMinutes}
        />
    );
};

// ── Søppeltømming (dato-basert) ────────────────────────────────────────
// Spør «er søpla båret ut?» på selve hentedagen. Kvittering nøkles på
// dagens midnatt-timestamp så samme dag ikke spør på nytt etter reload.

// DD/MM/YYYY MÅ tolkes før native parsing – new Date('07/08/2026') ville
// ellers blitt tolket som amerikansk MM/DD (8. juli)
const parseWasteDate = (dateStr) => {
    if (!dateStr) return null;
    const p = String(dateStr).trim().split(/[/.]/);
    const d = (p.length === 3 && p[2].length === 4)
        ? new Date(`${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}T00:00:00`)
        : new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
};

// Popupen vises først fra dette klokkeslettet på hentedagen — unngår at
// skjermen vekkes ved midnatt når datoen tikker over til «i dag».
const WASTE_PROMPT_START_HOUR = 6;

const WasteWatcher = ({ device }) => {
    // Jevnlig re-render så popupen dukker opp ved midnatt/starttime uten
    // at det trengs ny data fra HA (dagene beregnes klient-side).
    const [, setTick] = useState(0);
    useEffect(() => {
        const iv = setInterval(() => setTick(t => t + 1), 60 * 1000);
        return () => clearInterval(iv);
    }, []);

    const todayMidnight = new Date();
    todayMidnight.setHours(0, 0, 0, 0);

    const todaysFractions = Object.entries(device.capabilitiesObj || {})
        .filter(([id]) => id.startsWith('waste_') && id !== 'waste_next_pickup_days')
        .map(([id, obj]) => ({ id, title: obj.title || id, date: parseWasteDate(obj.value) }))
        .filter(f => f.date && f.date.getTime() === todayMidnight.getTime());

    const active = todaysFractions.length > 0 &&
        new Date().getHours() >= WASTE_PROMPT_START_HOUR;

    const { visible, acknowledge, snooze } = useFinishedPrompt({
        deviceId: `waste:${device.id}`,
        finishedAt: active ? todayMidnight.getTime() : null,
        enabled: true,
    });

    const names = todaysFractions.map(f => f.title);
    const list = names.length > 1
        ? names.slice(0, -1).join(', ') + ' og ' + names[names.length - 1]
        : names[0];

    return (
        <FinishedPromptOverlay
            visible={visible}
            icon={<Trash2 size={44} strokeWidth={1.8} />}
            title="Søppeltømming i dag"
            question={`Er ${list} båret ut?`}
            onYes={acknowledge}
            onSnooze={(min) => snooze(min)}
            snoozeMinutes={5}
        />
    );
};

// ── Robotklipper: knivbytte (vedlikeholdsterskel) ──────────────────────
// Worx-integrasjonen setter sensor.*_maintenance_status = 'blade_service_due'
// når knivtiden siden siste nullstilling passerer terskelen (satt i
// integrasjonen, f.eks. 100 t). Popupen står til knivene er byttet og
// telleren nullstilt (button.*_reset_blade_runtime) — «Ja» gjør begge deler.
// Vises kun på dagtid; en vedlikeholdsvarsel skal ikke vekke skjermen om natta.
const BLADE_PROMPT_START_HOUR = 8;
const BLADE_PROMPT_END_HOUR = 22;
const BLADE_SNOOZE_OPTIONS = [60, 360, 1440, 4320]; // 1 t, 6 t, 1 d, 3 d
const BLADE_SNOOZE_DEFAULT = 1440;

const formatHours = (min) => {
    if (min == null) return null;
    const h = min / 60;
    return h >= 10 ? `${Math.round(h)} t` : `${h.toFixed(1).replace('.', ',')} t`;
};

const BladeWatcher = ({ device }) => {
    const { showToast } = useHomey();

    // Jevnlig re-render så tidsvinduet (08–22) slår inn/ut uten ny HA-data
    const [, setTick] = useState(0);
    useEffect(() => {
        const iv = setInterval(() => setTick(t => t + 1), 60 * 1000);
        return () => clearInterval(iv);
    }, []);

    const cap = (id) => device.capabilitiesObj?.[id]?.value;
    const maintenance = cap('lawn_mower_maintenance');
    const bladeMin = cap('lawn_mower_blade_current');
    const thresholdMin = cap('lawn_mower_blade_threshold');
    const due = maintenance === 'blade_service_due' ||
        (bladeMin != null && thresholdMin != null && thresholdMin > 0 && bladeMin >= thresholdMin);

    // Stabilt «siden»-tidspunkt som kvitteringsnøkkel: første gang vi så
    // terskelen passert. Nullstilles når status går tilbake til ok.
    const dueKey = `bladeDueSince:${device.id}`;
    const [dueSince, setDueSince] = useState(() => {
        const v = parseInt(localStorage.getItem(dueKey), 10);
        return isNaN(v) ? null : v;
    });
    useEffect(() => {
        if (due && !dueSince) {
            const t = Date.now();
            setDueSince(t);
            try { localStorage.setItem(dueKey, String(t)); } catch { /* ignore */ }
        } else if (!due && dueSince) {
            setDueSince(null);
            try { localStorage.removeItem(dueKey); } catch { /* ignore */ }
        }
    }, [due]); // eslint-disable-line react-hooks/exhaustive-deps

    const hour = new Date().getHours();
    const inWindow = hour >= BLADE_PROMPT_START_HOUR && hour < BLADE_PROMPT_END_HOUR;

    const { visible, acknowledge, snooze } = useFinishedPrompt({
        deviceId: `blades:${device.id}`,
        finishedAt: (due && dueSince && inWindow) ? dueSince : null,
        enabled: true,
    });

    // «Ja» = knivene er byttet: nullstill telleren i HA (så status går til ok
    // og popupen forsvinner av seg selv) og kvitter lokalt. Feiler
    // nullstillingen, blir popupen stående så brukeren ser at det ikke gikk.
    const handleYes = async () => {
        const resetEntity = device.settings?.resetBladesEntityId;
        if (resetEntity) {
            try {
                await hassAPI.callService('button', 'press', resetEntity);
            } catch (err) {
                console.warn('BladeWatcher: nullstilling av knivteller feilet', err);
                showToast?.('Kunne ikke nullstille knivtelleren i Home Assistant', 'error');
                return;
            }
        }
        acknowledge();
    };

    const name = device.name || 'Robotklipperen';
    const used = formatHours(bladeMin);
    const limit = formatHours(thresholdMin);
    const detail = used
        ? ` Knivene har gått ${used}${limit ? ` (grense ${limit})` : ''}.`
        : '';

    return (
        <FinishedPromptOverlay
            visible={visible}
            icon={<Scissors size={44} strokeWidth={1.8} />}
            title={`${name}: på tide å bytte kniver`}
            question={`${detail} Er knivene byttet?`.trim()}
            yesLabel="Ja, byttet"
            onYes={handleYes}
            onSnooze={(min) => snooze(min)}
            snoozeMinutes={BLADE_SNOOZE_DEFAULT}
            snoozeOptions={BLADE_SNOOZE_OPTIONS}
        />
    );
};

const FinishedPromptManager = () => {
    const { devices, settings } = useHomey();

    // Profil-innstilling (synkes til Firestore): skru av hele funksjonen på
    // profiler der popupen ikke er ønsket. Gates ved å tømme enhetslistene
    // (ikke betinget return — manageren har egne hooks som alltid må kjøre).
    const promptsEnabled = settings?.finishedPromptsEnabled !== false;

    // Flis-innstillinger per enhet (terskler, finishedPrompt av/på) fra
    // hvilken som helst side i profilen. Lastes én gang ved oppstart.
    const [tileSettingsByDevice, setTileSettingsByDevice] = useState({});
    useEffect(() => {
        let cancelled = false;
        storage.get('tiles').then(tiles => {
            if (cancelled || !Array.isArray(tiles)) return;
            const map = {};
            tiles.forEach(t => {
                const devId = t.settings?.deviceId || t.deviceId;
                if (devId && t.settings && !map[devId]) map[devId] = t.settings;
            });
            setTileSettingsByDevice(map);
        }).catch(() => { /* ingen fliser lagret enda */ });
        return () => { cancelled = true; };
    }, []);

    const applianceCandidates = promptsEnabled ? devices.filter(d =>
        !d._inComposite &&
        (d.capabilities?.includes('smart_plug_appliance') || d.settings?.compositeType === 'appliance')
    ) : [];
    const applianceIds = new Set(applianceCandidates.map(d => d.id));

    // Én overvåker per maskintype: HA kan ha FLERE enheter for samme fysiske
    // maskin (f.eks. smartpluggen tech_outlet_dishwasher + Electrolux-
    // compositen oppvaskmaskin). To overvåkere gir to identiske popups oppå
    // hverandre → «må trykke to ganger». Velg én
    // per applianceKind — helst den som har en flis (brukerens konfigurasjon),
    // deretter en med effektmåling (tilstandsmaskinen er effektbasert), ellers
    // laveste id.
    const byKind = new Map();
    for (const d of [...applianceCandidates].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
        const kind = tileSettingsByDevice[d.id]?.applianceKind || d.settings?.applianceKind || 'dishwasher';
        const hasTile = Boolean(tileSettingsByDevice[d.id]);
        const hasPower = Boolean(d.capabilitiesObj?.measure_power);
        const existing = byKind.get(kind);
        if (!existing ||
            (hasTile && !existing.hasTile) ||
            (hasTile === existing.hasTile && hasPower && !existing.hasPower)) {
            byKind.set(kind, { d, hasTile, hasPower });
        }
    }
    const appliances = [...byKind.values()].map(x => x.d);

    // Vaskemaskiner: kun composites med operational_state (uten den finnes
    // det ingen tilstand å utlede ferdig fra — f.eks. vaskemaskin-outleten).
    const washers = promptsEnabled ? devices.filter(d =>
        !d._inComposite &&
        !applianceIds.has(d.id) &&
        d.capabilities?.includes('laundry') &&
        d.capabilitiesObj?.operational_state
    ) : [];

    // Søppeltømming-påminnelse: egen profil-bryter (wastePromptEnabled)
    const wasteDevices = settings?.wastePromptEnabled !== false ? devices.filter(d =>
        d.settings?.compositeType === 'waste_collection'
    ) : [];

    // Knivbytte-påminnelse for robotklipper: egen profil-bryter (bladePromptEnabled)
    const mowers = settings?.bladePromptEnabled !== false ? devices.filter(d =>
        !d._inComposite &&
        d.capabilities?.includes('homey_lawn_mower') &&
        (d.capabilitiesObj?.lawn_mower_maintenance || d.capabilitiesObj?.lawn_mower_blade_threshold)
    ) : [];

    return (
        <>
            {appliances.map(d => (
                <ApplianceWatcher key={d.id} device={d} settings={tileSettingsByDevice[d.id] || {}} />
            ))}
            {washers.map(d => (
                <WasherWatcher key={d.id} device={d} settings={tileSettingsByDevice[d.id] || {}} />
            ))}
            {wasteDevices.map(d => (
                <WasteWatcher key={d.id} device={d} />
            ))}
            {mowers.map(d => (
                <BladeWatcher key={d.id} device={d} />
            ))}
        </>
    );
};

export default FinishedPromptManager;
