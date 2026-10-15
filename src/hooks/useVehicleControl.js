import { useEffect, useRef, useState } from 'react';

const SEND_DELAY_MS = 800;        // samler raske −/+-trykk (Tesla-API-et er tregt og rate-begrenset)
const TOGGLE_HOLD_MS = 30000;     // brytere/valg (laderen): hold vår verdi så lenge etter sending
const STEP_HOLD_MS = 90000;       // steppede tall (laderen)
// Bilkommandoer (vehicle_*): kia_uvo har ingen optimistisk tilstand i HA – status kommer først når
// bilen har kvittert via Hyundais sky og integrasjonen har hentet ny status (20 s til godt over
// 1 min). Teslemetry bekrefter straks, men bilens data kan overskrive med gammel verdi lenge etterpå.
const VEHICLE_HOLD_MS = 180000;
const holdFor = (capId, stepped) => (capId.startsWith('vehicle_') ? VEHICLE_HOLD_MS : stepped ? STEP_HOLD_MS : TOGGLE_HOLD_MS);

// Optimistisk styring for bilsiden. Brytere/valg sendes straks, tall som steppes sendes samlet
// 800 ms etter siste trykk.
//
// Hvorfor «klebrig» etter sending (okt 2026): Teslemetry skriver den nye verdien til HA i samme
// sekund som kommandoen lykkes, men bilens egne data (streaming/polling) kan deretter overskrive
// den med den GAMLE verdien i sekunder til minutter før bilen har tatt endringen – særlig når
// bilen sover. Slippes vår verdi ved første bekreftelse, hopper tallet tilbake. Derfor holdes
// vår verdi i en fast periode etter sending uansett hva HA melder, med ett unntak: melder HA en
// TREDJE verdi (verken den gamle eller vår), har noen andre endret den, og den vinner.
export default function useVehicleControl(api, devices) {
    // `${deviceId}:${capId}` → { value, base, sent }   (base = verdien før vi begynte)
    const [optimistic, setOptimistic] = useState({});
    const sendTimers = useRef({});
    const expireTimers = useRef({});

    useEffect(() => () => {
        Object.values(sendTimers.current).forEach(clearTimeout);
        Object.values(expireTimers.current).forEach(clearTimeout);
    }, []);

    const same = (a, b) => (typeof b === 'number' ? Math.abs(Number(a) - b) < 0.05 : a === b);

    // Slipp bare når noen andre har satt en tredje verdi (eller enheten er borte)
    useEffect(() => {
        setOptimistic(prev => {
            let changed = false;
            const next = {};
            for (const [k, o] of Object.entries(prev)) {
                // Enhets-id-er inneholder selv kolon («composite:<uuid>»), cap-id-er gjør det aldri →
                // del på SISTE kolon. (indexOf ga id «composite» → enhet ikke funnet → alt ble sluppet
                // ved neste state_changed, dvs. umiddelbart mot ekte HA. Funnet 15/10 på Kona-en.)
                const i = k.lastIndexOf(':');
                const id = k.slice(0, i), capId = k.slice(i + 1);
                const d = devices.find(x => x.id === id);
                if (!d) { changed = true; continue; }
                const actual = d.capabilitiesObj?.[capId]?.value;
                const third = o.sent && actual != null && !same(actual, o.value) && !same(actual, o.base);
                if (third) { changed = true; continue; }
                next[k] = o;
            }
            return changed ? next : prev;
        });
    }, [devices]);

    const key = (d, capId) => `${d.id}:${capId}`;
    const drop = (k) => setOptimistic(prev => { if (!(k in prev)) return prev; const n = { ...prev }; delete n[k]; return n; });
    const expire = (k, ms) => {
        clearTimeout(expireTimers.current[k]);
        expireTimers.current[k] = setTimeout(() => drop(k), ms);
    };

    // `actual` kan overstyres når verdien leses fra en annen enhet (laderens strømgrense på kretsen)
    const capOf = (d, capId, actual = d?.capabilitiesObj?.[capId]?.value) => {
        const o = optimistic[key(d, capId)];
        return o !== undefined ? o.value : actual;
    };
    // «Venter» = vår verdi er ikke (lenger) det HA melder
    const isPending = (d, capId, actual = d?.capabilitiesObj?.[capId]?.value) => {
        const o = optimistic[key(d, capId)];
        return o !== undefined && !same(actual, o.value);
    };

    const setCap = (d, capId, value) => {
        const k = key(d, capId);
        const actual = d?.capabilitiesObj?.[capId]?.value;
        setOptimistic(prev => ({ ...prev, [k]: { value, base: prev[k]?.base ?? actual, sent: true } }));
        expire(k, holdFor(capId, false));
        return api.setCapability(d.id, capId, value).catch(err => console.error(`Kunne ikke sette ${capId}`, err));
    };

    // Stepper/hurtigvalg: vis ny verdi straks, send samlet etter siste trykk
    const queueValue = (d, capId, value) => {
        const k = key(d, capId);
        const actual = d?.capabilitiesObj?.[capId]?.value;
        setOptimistic(prev => ({ ...prev, [k]: { value, base: prev[k]?.base ?? actual, sent: false } }));
        clearTimeout(expireTimers.current[k]);
        clearTimeout(sendTimers.current[k]);
        sendTimers.current[k] = setTimeout(async () => {
            setOptimistic(prev => (prev[k] ? { ...prev, [k]: { ...prev[k], sent: true } } : prev));
            expire(k, holdFor(capId, true));
            try { await api.setCapability(d.id, capId, value); }
            catch (err) { console.error(`Kunne ikke sette ${capId}`, err); }
        }, SEND_DELAY_MS);
    };

    const stepValue = (d, capId, dir, { min, max, step = 1, fallback = 0 }) => {
        const cur = Number(capOf(d, capId) ?? fallback);
        const raw = Math.round((cur + dir * step) / step) * step;
        const next = Number(Math.min(max, Math.max(min, raw)).toFixed(2));
        if (next === cur) return;
        queueValue(d, capId, next);
    };

    return { capOf, isPending, setCap, queueValue, stepValue };
}
