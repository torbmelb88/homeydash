import { useEffect, useMemo, useState } from 'react';

// Delt lysstyring for LightPanelTile og LightPage: optimistisk av/på + dim per lampe
// (fjernes når hub-en bekrefter), rom-toggle, hurtignivåer og «alle av».
// groups: [{ id, name, devices[] }] fra buildLightGroups().
export default function useLightControl(api, groups, customNames = {}) {
    const allDevices = useMemo(() => groups.flatMap(g => g.devices), [groups]);

    const [optimistic, setOptimistic] = useState({});
    useEffect(() => {
        setOptimistic(prev => {
            let changed = false;
            const next = { ...prev };
            for (const [id, o] of Object.entries(prev)) {
                const d = allDevices.find(x => x.id === id);
                if (!d) { delete next[id]; changed = true; continue; }
                const rest = { ...o };
                if (o.onoff !== undefined && d.capabilitiesObj?.onoff?.value === o.onoff) delete rest.onoff;
                if (o.dim !== undefined && Math.abs((d.capabilitiesObj?.dim?.value || 0) - o.dim) < 0.03) delete rest.dim;
                if (Object.keys(rest).length === 0) { delete next[id]; changed = true; }
                else if (Object.keys(rest).length !== Object.keys(o).length) { next[id] = rest; changed = true; }
            }
            return changed ? next : prev;
        });
    }, [allDevices]);

    const isOn = (d) => optimistic[d.id]?.onoff ?? !!d.capabilitiesObj?.onoff?.value;
    const dimOf = (d) => optimistic[d.id]?.dim ?? (d.capabilitiesObj?.dim?.value || 0);
    const hasDim = (d) => d.capabilities?.includes('dim');
    const nameOf = (d) => customNames[d.id] || d.name;

    const setOpt = (id, patch) => setOptimistic(prev => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }));

    const setOnOff = (d, on) => {
        setOpt(d.id, { onoff: on });
        api.setCapability(d.id, 'onoff', on).catch(err => console.error('Lys av/på feilet', err));
    };

    const setDim = (d, v) => {
        setOpt(d.id, { dim: v, onoff: v > 0 });
        api.setDim(d.id, v).catch(err => console.error('Dimming feilet', err));
    };

    const toggleGroup = (g) => {
        const anyOn = g.devices.some(isOn);
        g.devices.forEach(d => setOnOff(d, !anyOn));
    };

    const applyPreset = (list, pct) => {
        list.forEach(d => hasDim(d) ? setDim(d, pct / 100) : setOnOff(d, true));
    };

    const allOff = () => allDevices.filter(isOn).forEach(d => setOnOff(d, false));

    const onCount = allDevices.filter(isOn).length;

    return { allDevices, isOn, dimOf, hasDim, nameOf, setOnOff, setDim, toggleGroup, applyPreset, allOff, onCount };
}

export const normalizePresets = (presets, fallback) =>
    (presets && presets.length ? presets : fallback).map(Number).filter(n => n > 0 && n <= 100);
