import { useEffect, useRef, useState } from 'react';
import { keyOf, limitsOf, modesOf } from '../services/climate';

const SEND_DELAY_MS = 800;      // samler raske −/+-trykk til én kommando (IR-pumpene piper per kommando)
const EXPIRE_MS = 10000;        // ubekreftet optimistisk verdi faller tilbake til faktisk verdi

// Optimistisk styring for klimasiden: måltemperatur med samlet sending + øvrige capabilities
// (modus, vifte, sving, brytere). Optimistiske verdier fjernes når hub-en bekrefter.
export default function useClimateControl(api, devices, settings = {}) {
    // deviceId → { target?, sent?, caps?: { capId: value } }
    const [optimistic, setOptimistic] = useState({});
    const sendTimers = useRef({});
    const expireTimers = useRef({});

    useEffect(() => () => {
        Object.values(sendTimers.current).forEach(clearTimeout);
        Object.values(expireTimers.current).forEach(clearTimeout);
    }, []);

    useEffect(() => {
        setOptimistic(prev => {
            let changed = false;
            const next = {};
            for (const [id, o] of Object.entries(prev)) {
                const d = devices.find(x => x.id === id);
                if (!d) { changed = true; continue; }
                const rest = { ...o, caps: { ...(o.caps || {}) } };
                // Måltemperatur regnes som bekreftet først etter at kommandoen er sendt
                if (rest.target !== undefined && rest.sent &&
                    Math.abs((d.capabilitiesObj?.target_temperature?.value ?? NaN) - rest.target) < 0.05) {
                    delete rest.target; delete rest.sent; changed = true;
                }
                for (const [capId, v] of Object.entries(rest.caps)) {
                    if (d.capabilitiesObj?.[capId]?.value === v) { delete rest.caps[capId]; changed = true; }
                }
                if (rest.target !== undefined || Object.keys(rest.caps).length > 0) next[id] = rest;
            }
            return changed ? next : prev;
        });
    }, [devices]);

    const patch = (id, fn) => setOptimistic(prev => ({ ...prev, [id]: fn(prev[id] || {}) }));

    const expire = (id, field, capId) => {
        const tKey = `${id}:${capId || field}`;
        clearTimeout(expireTimers.current[tKey]);
        expireTimers.current[tKey] = setTimeout(() => {
            patch(id, o => {
                const rest = { ...o, caps: { ...(o.caps || {}) } };
                if (capId) delete rest.caps[capId]; else { delete rest.target; delete rest.sent; }
                return rest;
            });
        }, EXPIRE_MS);
    };

    const targetOf = (d) => optimistic[d.id]?.target ?? d.capabilitiesObj?.target_temperature?.value;
    const isPending = (d) => optimistic[d.id]?.target !== undefined;
    const capOf = (d, capId) => optimistic[d.id]?.caps?.[capId] ?? d.capabilitiesObj?.[capId]?.value;

    const stepTarget = (d, dir) => {
        const { min, max, step } = limitsOf(d, settings);
        const cur = targetOf(d) ?? 21;
        const raw = Math.round((cur + dir * step) / step) * step;
        const next = Number(Math.min(max, Math.max(min, raw)).toFixed(1));
        if (next === cur) return;
        patch(d.id, o => ({ ...o, target: next, sent: false }));
        clearTimeout(sendTimers.current[d.id]);
        sendTimers.current[d.id] = setTimeout(() => {
            patch(d.id, o => (o.target === undefined ? o : { ...o, sent: true }));
            api.setTargetTemperature(d.id, next).catch(err => console.error('Måltemperatur feilet', err));
            expire(d.id, 'target');
        }, SEND_DELAY_MS);
    };

    const setCap = (d, capId, value) => {
        patch(d.id, o => ({ ...o, caps: { ...(o.caps || {}), [capId]: value } }));
        api.setCapability(d.id, capId, value).catch(err => console.error(`Kunne ikke sette ${capId}`, err));
        expire(d.id, 'caps', capId);
    };

    // Modus huskes når enheten slås av, så «Slå på» kan gjenoppta den
    const lastModeKey = (d) => `climateLastMode:${keyOf(d)}`;
    const setMode = (d, mode) => {
        const current = capOf(d, 'thermostat_mode');
        if (mode === 'off' && current && current !== 'off') {
            try { localStorage.setItem(lastModeKey(d), current); } catch { /* ignorér */ }
        }
        setCap(d, 'thermostat_mode', mode);
    };

    const turnOn = (d) => {
        let last = null;
        try { last = localStorage.getItem(lastModeKey(d)); } catch { /* ignorér */ }
        const modes = modesOf(d).filter(m => m !== 'off');
        const mode = modes.includes(last) ? last : modes.includes('heat') ? 'heat' : modes[0];
        if (d.capabilities?.includes('onoff')) {
            // Hovedbryteren gjenopptar pumpas forrige modus; modusen settes bare optimistisk
            setCap(d, 'onoff', true);
            if (mode) {
                patch(d.id, o => ({ ...o, caps: { ...(o.caps || {}), thermostat_mode: mode } }));
                expire(d.id, 'caps', 'thermostat_mode');
            }
        } else if (mode) {
            setCap(d, 'thermostat_mode', mode);
        }
    };

    // Puls-knapper (f.eks. display på Midea-pumpene): ingen tilstand å holde på
    const press = (d, capId) =>
        api.setCapability(d.id, capId, true).catch(err => console.error(`Kunne ikke trykke ${capId}`, err));

    return { targetOf, isPending, capOf, stepTarget, setCap, setMode, turnOn, press };
}
