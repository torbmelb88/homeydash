import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useHomey } from '../../context/HomeyContext';
import { resolveTileDevice } from '../../services/utils';
import { Lightbulb, Power, ChevronDown, Maximize2 } from 'lucide-react';
import LightSlider from '../LightSlider';
import useLightControl, { normalizePresets } from '../../hooks/useLightControl';

export const DEFAULT_LIGHT_PRESETS = [10, 40, 100];
export const NO_ROOM_LABEL = 'Uten rom';

// Alle lys som kan inngå i panelet (samme filter som lysfliser bruker).
export const isLightDevice = (d) =>
    !d._inComposite && (d.class === 'light' || d.virtualClass === 'light');

// Bygger gruppelisten [{ id, name, devices[] }] ut fra innstillingene.
// mode 'areas': grupper etter HA-område (zoneName), unntatt excludedDeviceIds.
// mode 'custom': settings.groups med manuelt valgte lys (selvhelbredende via entity-hint).
export const buildLightGroups = (devices, settings = {}) => {
    if (settings.mode === 'custom') {
        const hints = settings.deviceEntityHints || {};
        return (settings.groups || []).map(g => ({
            id: g.id,
            name: g.name || 'Gruppe',
            devices: (g.deviceIds || [])
                .map(id => resolveTileDevice(devices, id, hints[id]))
                .filter(Boolean),
        })).filter(g => g.devices.length > 0);
    }

    const excluded = new Set(settings.excludedDeviceIds || []);
    const byZone = new Map();
    devices.filter(isLightDevice).forEach(d => {
        if (excluded.has(d.id)) return;
        const zone = d.zoneName || NO_ROOM_LABEL;
        if (!byZone.has(zone)) byZone.set(zone, []);
        byZone.get(zone).push(d);
    });
    return [...byZone.entries()]
        .sort(([a], [b]) => {
            if (a === NO_ROOM_LABEL) return 1;
            if (b === NO_ROOM_LABEL) return -1;
            return a.localeCompare(b, 'nb');
        })
        .map(([zone, list]) => ({
            id: `zone:${zone}`,
            name: zone,
            devices: list.sort((a, b) => a.name.localeCompare(b.name, 'nb')),
        }));
};

const LightPanelTile = ({ tile, expanded = false, onContentUpdate }) => {
    const { api, devices, setIsInteracting } = useHomey();
    const rootRef = useRef(null);
    const settings = tile.settings || {};
    const presets = normalizePresets(settings.presets, DEFAULT_LIGHT_PRESETS);
    const showPresets = settings.showPresets !== false;
    const showAllOff = settings.showAllOff !== false;

    const groups = useMemo(() => buildLightGroups(devices, settings), [devices, settings]);
    const { isOn, dimOf, hasDim, nameOf, setOnOff, setDim, toggleGroup, applyPreset, allOff, onCount } =
        useLightControl(api, groups, settings.customNames || {});

    // Flisen vokser/krymper med innholdet (rom åpnes/lukkes): meld fra til Tile.jsx
    // hver gang panelets egen høyde endrer seg. hasGroups er med i deps fordi panelet
    // rendrer tom-tilstand (uten ref) til enhetene er lastet — uten den ble observeren
    // aldri koblet på i produksjon (sett på mobil sep 2026).
    const hasGroups = groups.length > 0;
    useEffect(() => {
        if (expanded || !hasGroups || !rootRef.current || !onContentUpdate) return;
        const ro = new ResizeObserver(() => onContentUpdate());
        ro.observe(rootRef.current);
        return () => ro.disconnect();
    }, [expanded, onContentUpdate, hasGroups]);

    // Rom åpnet i kompakt visning (utvidet viser alle)
    const [openGroups, setOpenGroups] = useState(() => new Set());

    if (groups.length === 0) {
        return (
            <div className="light-panel-empty">
                <Lightbulb size={24} style={{ opacity: 0.5 }} />
                <span>{settings.mode === 'custom' ? 'Ingen lys valgt' : 'Fant ingen lys'}</span>
                <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>Trykk for å konfigurere i redigeringsmodus</span>
            </div>
        );
    }

    const renderLamp = (d) => {
        const on = isOn(d);
        const Icon = d.LucideIcon || Lightbulb;
        return (
            <div key={d.id} className="light-lamp" onClick={e => e.stopPropagation()}>
                <div className={`light-lamp-name ${on ? '' : 'off'}`}>
                    <Icon size={14} strokeWidth={1.5} style={{ flexShrink: 0, color: on ? 'var(--color-accent-primary)' : 'inherit' }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{nameOf(d)}</span>
                </div>
                {hasDim(d) ? (
                    <LightSlider
                        value={dimOf(d)}
                        off={!on}
                        onInteractionStart={() => setIsInteracting(true)}
                        onInteractionEnd={() => setIsInteracting(false)}
                        onChangeEnd={(v) => setDim(d, v)}
                    />
                ) : (
                    <div className="light-lamp-onoff">{on ? 'På' : 'Av'}</div>
                )}
                <button
                    className={`light-toggle ${on ? 'on' : ''}`}
                    onClick={(e) => { e.stopPropagation(); setOnOff(d, !on); }}
                    title={on ? 'Slå av' : 'Slå på'}
                >
                    <Power size={18} />
                </button>
            </div>
        );
    };

    const renderGroup = (g) => {
        const on = g.devices.filter(isOn).length;
        const open = expanded || openGroups.has(g.id);
        const dimmable = g.devices.some(hasDim);
        return (
            <div key={g.id} className={`light-room ${on > 0 ? 'any-on' : ''} ${open ? 'open' : ''}`}>
                <div
                    className="light-room-row"
                    onClick={(e) => {
                        e.stopPropagation();
                        if (expanded) return;
                        setOpenGroups(prev => {
                            const next = new Set(prev);
                            next.has(g.id) ? next.delete(g.id) : next.add(g.id);
                            return next;
                        });
                    }}
                >
                    <div className="light-room-name">
                        <strong>{g.name}</strong>
                        <span>{on === 0 ? 'Alle av' : `${on} av ${g.devices.length} på`}</span>
                    </div>
                    {!expanded && <ChevronDown size={16} className="chevron" />}
                    <button
                        className={`light-toggle ${on > 0 ? 'on' : ''}`}
                        onClick={(e) => { e.stopPropagation(); toggleGroup(g); }}
                        title={on > 0 ? 'Slå av alle i rommet' : 'Slå på alle i rommet'}
                    >
                        <Power size={18} />
                    </button>
                </div>
                {open && (
                    <div className="light-room-body" onClick={e => e.stopPropagation()}>
                        {g.devices.map(renderLamp)}
                        {showPresets && dimmable && presets.length > 0 && (
                            <div className="light-presets">
                                {presets.map(p => (
                                    <button key={p} className="light-preset-chip" onClick={(e) => { e.stopPropagation(); applyPreset(g.devices, p); }}>
                                        {p} %
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div ref={rootRef} className={`light-panel ${expanded ? 'expanded' : ''}`}>
            <div className="light-panel-header">
                <div className="light-panel-title">
                    <Lightbulb size={expanded ? 22 : 16} style={{ color: onCount > 0 ? 'var(--color-accent-primary)' : 'var(--color-text-secondary)', flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tile.name || 'Lys'}</span>
                    <span className="light-panel-count">{onCount === 0 ? 'alle av' : `${onCount} på`}</span>
                </div>
                {showAllOff && (
                    <button
                        className="light-panel-alloff"
                        disabled={onCount === 0}
                        onClick={(e) => { e.stopPropagation(); allOff(); }}
                    >
                        Alle av
                    </button>
                )}
                {!expanded && <Maximize2 size={14} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />}
            </div>
            <div className="light-panel-rooms">
                {groups.map(renderGroup)}
            </div>
        </div>
    );
};

export default LightPanelTile;
