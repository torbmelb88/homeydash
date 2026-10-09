import { useEffect, useRef, useState } from 'react';

const SEND_DELAY_MS = 800;        // samler raske −/+-trykk (Tesla-API-et er tregt og rate-begrenset)
const EXPIRE_MS = 15000;          // ubekreftet optimistisk verdi faller tilbake
const STEP_EXPIRE_MS = 20000;     // stepper-verdier (ladegrense/kupétemp) tar lengre tid å bekrefte

// Optimistisk styring for bilsiden: brytere/valg sendes straks, mens tall som steppes
// (kupétemperatur, ladegrense) sendes samlet 800 ms etter siste trykk. Ubekreftede verdier
// vises som «venter» til hub-en melder samme verdi, eller til de utløper.
export default function useVehicleControl(api, devices) {
    // `${deviceId}:${capId}` → { value, sent }
    const [optimistic, setOptimistic] = useState({});
    const sendTimers = useRef({});
    const expireTimers = useRef({});

    useEffect(() => () => {
        Object.values(sendTimers.current).forEach(clearTimeout);
        Object.values(expireTimers.current).forEach(clearTimeout);
    }, []);

    // Rydd optimistiske verdier som hub-en har bekreftet (stepper-verdier først etter sending)
    useEffect(() => {
        setOptimistic(prev => {
            let changed = false;
            const next = {};
            for (const [k, o] of Object.entries(prev)) {
                const i = k.indexOf(':');
                const id = k.slice(0, i), capId = k.slice(i + 1);
                const d = devices.find(x => x.id === id);
                if (!d) { changed = true; continue; }
                const actual = d.capabilitiesObj?.[capId]?.value;
                const same = typeof o.value === 'number' ? Math.abs(Number(actual) - o.value) < 0.05 : actual === o.value;
                if (same && o.sent) { changed = true; continue; }
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
    const isPending = (d, capId, actual = d?.capabilitiesObj?.[capId]?.value) => {
        const o = optimistic[key(d, capId)];
        return o !== undefined && o.value !== actual;
    };

    const setCap = (d, capId, value) => {
        const k = key(d, capId);
        setOptimistic(prev => ({ ...prev, [k]: { value, sent: true } }));
        expire(k, EXPIRE_MS);
        return api.setCapability(d.id, capId, value).catch(err => console.error(`Kunne ikke sette ${capId}`, err));
    };

    // Stepper/hurtigvalg: vis ny verdi straks, send samlet etter siste trykk
    const queueValue = (d, capId, value) => {
        const k = key(d, capId);
        setOptimistic(prev => ({ ...prev, [k]: { value, sent: false } }));
        clearTimeout(expireTimers.current[k]);
        clearTimeout(sendTimers.current[k]);
        sendTimers.current[k] = setTimeout(async () => {
            setOptimistic(prev => (prev[k] ? { ...prev, [k]: { ...prev[k], sent: true } } : prev));
            try { await api.setCapability(d.id, capId, value); }
            catch (err) { console.error(`Kunne ikke sette ${capId}`, err); }
            expire(k, STEP_EXPIRE_MS);
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
