import React from 'react';
import { useHomey } from '../../context/HomeyContext';
import { hassAPI } from '../../services/hass-api';
import { UserRound } from 'lucide-react';

/**
 * Tilstedeværelse — viser hvem som er hjemme basert på person.*-entiteter fra HA.
 *
 * Flisen er knyttet til én person-enhet, men viser som standard ALLE personer
 * side om side (settings.showAllPersons !== false). person_presence-verdien er
 * 'home', 'not_home' eller et sonenavn (f.eks. 'Jobb').
 */

const statusInfo = (value) => {
    const v = String(value || '').toLowerCase();
    if (v === 'home') return { label: 'Hjemme', color: 'var(--color-success, #4ade80)', away: false };
    if (v === 'not_home' || v === 'unknown' || v === '') return { label: 'Borte', color: 'var(--color-text-tertiary, rgba(255,255,255,0.35))', away: true };
    // Navngitt sone (Jobb, Hytta, ...)
    return { label: value, color: 'var(--color-accent, #f59e0b)', away: true };
};

const avatarUrl = (device) => {
    const pic = device?.entityPicture;
    if (!pic) return null;
    if (pic.startsWith('http')) return pic;
    const base = hassAPI.httpBase || '';
    return base ? `${base}${pic}` : pic;
};

const PersonBadge = ({ device, size = 64 }) => {
    const presence = device?.capabilitiesObj?.person_presence?.value;
    const { label, color, away } = statusInfo(presence);
    const url = avatarUrl(device);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', minWidth: `${size + 12}px` }}>
            <div style={{
                width: `${size}px`, height: `${size}px`, borderRadius: '50%',
                border: `3px solid ${color}`,
                boxShadow: away ? 'none' : `0 0 10px ${color}55`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden',
                background: 'rgba(255,255,255,0.06)',
                opacity: away && String(presence).toLowerCase() === 'not_home' ? 0.55 : 1,
            }}>
                {url ? (
                    <img src={url} alt={device.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                    <UserRound size={size * 0.55} strokeWidth={1.5} color="var(--color-text-secondary)" />
                )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1.2 }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    {device.name}
                </span>
                <span style={{ fontSize: '0.72rem', fontWeight: 500, color }}>
                    {label}
                </span>
            </div>
        </div>
    );
};

const PresenceTile = ({ tile, device }) => {
    const { devices } = useHomey();
    const showAll = tile.settings?.showAllPersons !== false;

    const persons = showAll
        ? devices.filter(d => d.capabilitiesObj?.person_presence)
        : [device].filter(Boolean);

    if (persons.length === 0) {
        return (
            <div className="tile-content" style={{ color: 'var(--color-text-tertiary)', fontSize: '0.85rem' }}>
                Ingen personer funnet
            </div>
        );
    }

    return (
        <div className="tile-content" style={{
            display: 'flex',
            flex: 1,
            alignItems: 'center',
            justifyContent: 'space-evenly',
            flexWrap: 'wrap',
            gap: '10px',
            padding: '4px 0',
        }}>
            {persons.map(p => <PersonBadge key={p.id} device={p} size={persons.length > 3 ? 48 : 64} />)}
        </div>
    );
};

export default PresenceTile;
