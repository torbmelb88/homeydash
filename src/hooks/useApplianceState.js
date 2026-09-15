import { useEffect, useRef, useState } from 'react';
import { hassAPI } from '../services/hass-api';

/**
 * Effektbasert tilstandsmaskin for apparater på smartplugg (oppvaskmaskin,
 * tørketrommel, ...). Brukes både av ApplianceTile (visning) og
 * FinishedPromptManager (global ferdig-popup) — begge kjører samme regler mot
 * samme localStorage-nøkkel og konvergerer derfor til samme tilstand.
 *
 *   Av      → stikkontakten er slått av
 *   Standby → på, effekt under standby-terskelen
 *   Kjører  → effekt over kjøre-terskelen. Forblir «Kjører» gjennom pauser i
 *             programmet (hysterese): går først til «Ferdig» når effekten har
 *             vært under standby-terskelen sammenhengende i finishedDelayMin.
 *   Ferdig  → til bruker kvitterer ut, ny kjøring starter, eller autoDismissHours.
 */

export const APPLIANCE_DEFAULTS = {
    standbyThreshold: 5,      // W – under dette regnes maskinen som inaktiv
    runThreshold: 10,         // W – over dette regnes maskinen som i gang
    finishedDelayMin: 4,      // min sammenhengende under standby før «Ferdig»
    autoDismissHours: 12,     // popupen forsvinner av seg selv etter så mange timer (0 = aldri)
};

// Tersklene slås opp med getMachinePopupCfg() i services/popup-settings.js
// (globale profilinnstillinger, Innstillinger → Popups) — samme oppslag i
// ApplianceTile og FinishedPromptManager, så begge kjører like regler.

const IDLE_STATE = { phase: 'idle', runStartedAt: null, belowSince: null, finishedAt: null };

// Maks effekt for at et native endofcycle-signal godtas. Skal kun avvise
// spøkelses-EoC mens elementet varmer (~1900 W) — IKKE tørkeviften (20–30 W).
// Kan ikke bruke runThreshold (10 W): pluggen rapporterer bare hvert ~5. min
// ved jevn last, så siste kjente måling i tørkefasen ligger typisk på 10–30 W
// og blokkerte det native signalet i begge kjøringene 2/8-2026.
const EOC_POWER_MAX = 100;

// Ny-kjøring-guard etter Ferdig: samme stale måling (20–30 W i opptil ~5 min
// etter slutt) ligger over runThreshold og ville ellers startet en «ny
// kjøring» som nullstiller Ferdig sekunder etter at den ble satt (observert
// 2/8-2026: Ferdig 20:27:09 via Ado-fasen, stale 28,56 W fra 20:24 flippet
// tilstanden tilbake til Kjører). Ekte ny kjøring innen 5 min etter forrige
// slutt detekteres først når guarden utløper — effekten er da fortsatt høy.
const RESTART_GUARD_MS = 5 * 60 * 1000;

// Native maskintilstander (fra maskinens egen integrasjon, mappet i hub-mapper)
// som betyr «programmet pågår» — effektbasert Ferdig undertrykkes da, slik at
// laveffekt-faser midt i programmet (bløtlegging, pause) ikke gir falsk Ferdig.
const NATIVE_ACTIVE_STATES = new Set(['running', 'paused', 'delay_wait']);

// Ren tilstandsovergangs-funksjon — brukes både for live-oppdateringer og
// ved avspilling av historikk (samme regler, deterministisk).
//
// nativeState (valgfri) er maskinens egen rapporterte tilstand (kun fra enheter
// med appliance_native-markøren — IKKE WashData, som selv er effekt-avledet):
//  - 'endofcycle' → Ferdig umiddelbart, uten å vente ut effekt-hysteresen
//  - aktiv tilstand → hold «Kjører» selv om effekten er under standby-terskelen
// Effekten er fortsatt ryggraden: skyen kan sende spøkelsesverdier (observert
// «Running» 8 s ETTER End Of Cycle, rett før frakobling) — derfor krever
// EoC-overgangen effekt under EOC_POWER_MAX, og en spøkelses-«Running» uten
// effekt kan aldri nullstille en Ferdig-tilstand.
export const advanceApplianceState = (st, powerW, tMs, cfg, nativeState = null) => {
    if (st.phase === 'running' && nativeState === 'endofcycle' && powerW < EOC_POWER_MAX) {
        return { phase: 'finished', runStartedAt: st.runStartedAt, belowSince: null, finishedAt: tMs };
    }
    if (powerW >= cfg.runThreshold) {
        if (st.phase !== 'running') {
            if (st.phase === 'finished' &&
                (nativeState === 'endofcycle' ||
                 (st.finishedAt && tMs - st.finishedAt < RESTART_GUARD_MS))) {
                return st;
            }
            return { phase: 'running', runStartedAt: tMs, belowSince: null, finishedAt: null };
        }
        return st.belowSince ? { ...st, belowSince: null } : st;
    }
    if (st.phase === 'running') {
        if (powerW >= cfg.standbyThreshold || NATIVE_ACTIVE_STATES.has(nativeState)) {
            // Mellom tersklene (pumpe/pause) eller maskinen sier selv at
            // programmet pågår – fortsatt aktiv
            return st.belowSince ? { ...st, belowSince: null } : st;
        }
        const since = st.belowSince ?? tMs;
        if (tMs - since >= cfg.finishedDelayMin * 60 * 1000) {
            return { phase: 'finished', runStartedAt: st.runStartedAt, belowSince: null, finishedAt: since };
        }
        return st.belowSince === since ? st : { ...st, belowSince: since };
    }
    return st;
};

// Finn syklusenheten (maskinens egen integrasjon, f.eks. Electrolux) for et
// apparat. Delt mellom ApplianceTile og FinishedPromptManager slik at begge
// kobler til samme enhet. Enheter med appliance_native foretrekkes.
export const findCycleDevice = (devices, device, settings = {}) => {
    const hasWash = (d) => d?.capabilities?.includes('washdata_state');
    const chosen = settings.washDataDeviceId;
    if (chosen === 'none') return null;
    if (chosen) return devices.find(d => d.id === chosen) || null;
    if (hasWash(device)) return device;
    const kind = settings.applianceKind || device?.settings?.applianceKind || 'dishwasher';
    const candidates = devices.filter(d => hasWash(d) && d.settings?.compositeType === 'appliance' &&
        (d.settings?.applianceKind || 'dishwasher') === kind);
    return candidates.find(d => d.capabilities?.includes('appliance_native')) || candidates[0] || null;
};

// Native tilstand for hybrid-logikken — kun fra maskinens egen integrasjon
// (appliance_native). Effekt-avledede syklustrackere gir null: deres state er
// avledet av samme effektkurve som tilstandsmaskinen selv.
//
// Primært ferdig-signal: døren åpner seg selv (auto door open) mens fasen er
// tørking — den fysiske hendelsen kommer ~20–40 s FØR fasen skifter til
// «Ado Drying» og er en push-hendelse (ikke 5-min-pollet som effekten).
// Ufarlig for falske positive: åpnes døren midt i vasken går maskinen til
// Paused, ikke Drying. Sekundært: fasen «Ado Drying» (står i ~100 s til
// maskinen kobler fra) — mot «End Of Cycle»-staten som bare varer ~4 s og
// etterfølges av en falsk «Running» (observert 28–29/7-2026). Begge
// overstyrer derfor staten.
export const nativeStateOf = (cycleDevice) => {
    if (!cycleDevice?.capabilities?.includes('appliance_native')) return null;
    const phase = String(cycleDevice.capabilitiesObj?.washdata_phase?.value || '')
        .toLowerCase().replace(/[^a-z]/g, '');
    if (phase.startsWith('ado')) return 'endofcycle';
    const doorOpen = cycleDevice.capabilitiesObj?.appliance_door?.value === true;
    if (doorOpen && phase.startsWith('drying')) return 'endofcycle';
    return String(cycleDevice.capabilitiesObj?.washdata_state?.value || '').toLowerCase();
};

const replayHistory = (samples, cfg) => {
    let st = IDLE_STATE;
    for (const s of samples) st = advanceApplianceState(st, s.value, s.time, cfg);
    if (samples.length > 0) {
        // Kjør en siste overgang med «nå» slik at tidsbaserte overganger slår inn
        st = advanceApplianceState(st, samples[samples.length - 1].value, Date.now(), cfg);
    }
    return st;
};

export const useApplianceState = (device, cfg, nativeState = null) => {
    const stateKey = `applianceState:${device?.id}`;
    const powerCap = device?.capabilitiesObj?.measure_power;
    const power = parseFloat(powerCap?.value) || 0;
    const powerEntityId = powerCap?.entity_id || null;

    const [machineState, setMachineState] = useState(IDLE_STATE);
    const [history, setHistory] = useState([]);
    const stateRef = useRef(machineState);
    stateRef.current = machineState;
    const nativeStateRef = useRef(nativeState);
    nativeStateRef.current = nativeState;
    const reconstructedRef = useRef(false);

    const persist = (st) => {
        try {
            localStorage.setItem(stateKey, JSON.stringify({ ...st, updatedAt: Date.now() }));
        } catch { /* storage full/unavailable – ignore */ }
    };

    // Rekonstruksjon ved mount: bruk fersk lagret tilstand hvis den finnes,
    // ellers spill av effekthistorikken fra HA.
    useEffect(() => {
        if (!device?.id || reconstructedRef.current) return;
        reconstructedRef.current = true;

        let stored = null;
        try { stored = JSON.parse(localStorage.getItem(stateKey)); } catch { /* ignore */ }
        const storedFresh = stored?.updatedAt && (Date.now() - stored.updatedAt) < 15 * 60 * 1000;
        if (storedFresh) {
            setMachineState({
                phase: stored.phase || 'idle',
                runStartedAt: stored.runStartedAt || null,
                belowSince: stored.belowSince || null,
                finishedAt: stored.finishedAt || null,
            });
        }

        if (!powerEntityId || !device?.isHA) return;

        let cancelled = false;
        let retryTimer = null;
        const fetchAndReplay = async () => {
            try {
                const start = new Date(Date.now() - 12 * 60 * 60 * 1000);
                const result = await hassAPI.getHistory(powerEntityId, start);
                const raw = result?.[powerEntityId] || [];
                const samples = raw.map(p => ({
                    time: Math.round((p.lu ?? p.last_updated_ts ?? 0) * 1000) ||
                          new Date(p.last_updated || 0).getTime(),
                    value: parseFloat(p.s ?? p.state),
                })).filter(p => p.time > 0 && !isNaN(p.value))
                  .sort((a, b) => a.time - b.time);

                if (cancelled || samples.length === 0) return;
                setHistory(samples);
                if (!storedFresh) {
                    const replayed = replayHistory(samples, cfg);
                    setMachineState(replayed);
                    persist(replayed);
                }
            } catch (err) {
                // Typisk: siden lastes mens HA fortsatt starter → prøv igjen
                // om 60 s i stedet for å gi opp for alltid.
                console.warn('useApplianceState: klarte ikke hente effekthistorikk', err);
                if (!cancelled && !retryTimer) {
                    retryTimer = setTimeout(() => { retryTimer = null; fetchAndReplay(); }, 60 * 1000);
                }
            }
        };
        fetchAndReplay();
        return () => {
            cancelled = true;
            if (retryTimer) clearTimeout(retryTimer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [device?.id, powerEntityId]);

    // Live-overganger: ved hver effektendring + jevn tikk for tidsbaserte
    // overganger (hysterese-utløp uten nye effekt-events).
    useEffect(() => {
        if (!device?.id) return;
        const step = () => {
            const next = advanceApplianceState(stateRef.current, power, Date.now(), cfg, nativeStateRef.current);
            if (next !== stateRef.current) {
                setMachineState(next);
                persist(next);
            }
        };
        step();
        const timer = setInterval(step, 30 * 1000);
        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [device?.id, power, nativeState, cfg.standbyThreshold, cfg.runThreshold, cfg.finishedDelayMin]);

    // Live-punkter inn i historikken (brukes av effektgrafen)
    useEffect(() => {
        if (isNaN(power)) return;
        setHistory(prev => {
            const cutoff = Date.now() - 12 * 60 * 60 * 1000;
            return [...prev.filter(p => p.time >= cutoff), { time: Date.now(), value: power }];
        });
    }, [power]);

    // Gjelder kun popupen (FinishedPromptManager) — flisen viser «Rent» til
    // kvittering uansett. 0 = popupen utløper aldri.
    const finishedExpired = Boolean(machineState.finishedAt && cfg.autoDismissHours > 0 &&
        (Date.now() - machineState.finishedAt) > cfg.autoDismissHours * 60 * 60 * 1000);

    return { machineState, history, finishedExpired };
};
