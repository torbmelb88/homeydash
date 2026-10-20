import { useEffect, useState } from 'react';
import { hassAPI } from '../services/hass-api';

// Laderens økt-energi (kWh) på et gitt tidspunkt – typisk da bilen sist rapporterte batteri-%.
// Brukes til å anslå nåværende batteri-% mellom bilens rapporter (Kona melder bare for hver
// hele 10 %). Hentes fra HA-historikk én gang per (entitet, tidspunkt); null = ukjent.
export default function useSessionEnergyAt(entityId, at) {
    const atMs = at instanceof Date && !isNaN(at.getTime()) ? at.getTime() : null;
    const key = entityId && atMs ? `${entityId}|${atMs}` : null;
    const [result, setResult] = useState({ key: null, value: null });

    useEffect(() => {
        if (!key) return;
        let cancelled = false;
        (async () => {
            try {
                const start = new Date(atMs - 30 * 60 * 1000);
                const end = new Date(atMs + 2 * 60 * 1000);
                const res = await hassAPI.getHistory(entityId, start, end);
                const raw = res?.[entityId] || [];
                const samples = raw.map(p => ({
                    time: Math.round((p.lu ?? p.last_updated_ts ?? 0) * 1000) || new Date(p.last_updated || 0).getTime(),
                    value: parseFloat(p.s ?? p.state),
                })).filter(p => p.time > 0 && !isNaN(p.value)).sort((a, b) => a.time - b.time);
                // siste måling før/ved rapporten, ellers første etter
                const before = samples.filter(s => s.time <= atMs);
                const pick = before.length ? before[before.length - 1] : samples[0];
                if (!cancelled) setResult({ key, value: pick ? pick.value : null });
            } catch (err) {
                console.warn('Kunne ikke hente økt-energi fra historikk', err);
                if (!cancelled) setResult({ key, value: null });
            }
        })();
        return () => { cancelled = true; };
    }, [key, entityId, atMs]);

    return result.key === key ? result.value : null;
}
