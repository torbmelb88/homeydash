import React from 'react';
import { Trash2, FileText, Apple, Box, ShoppingBag, Calendar, Recycle } from 'lucide-react';

// Fallback Lucide-ikoner basert på fraksjonsnavn/cap-ID
const getWasteIcon = (titleOrId, size = 20) => {
    const s = (titleOrId || '').toLowerCase();
    if (s.includes('papir') || s.includes('paper')) return <FileText size={size} />;
    if (s.includes('mat') || s.includes('bio') || s.includes('food')) return <Apple size={size} />;
    if (s.includes('plast') || s.includes('plastic')) return <ShoppingBag size={size} />;
    if (s.includes('glass') || s.includes('metal')) return <Box size={size} />;
    if (s.includes('rest') || s.includes('general')) return <Trash2 size={size} />;
    if (s.includes('recycl') || s.includes('gjenvinning')) return <Recycle size={size} />;
    return <Calendar size={size} />;
};

// Farge basert på fraksjonsnavn/cap-ID
const getWasteColor = (titleOrId) => {
    const s = (titleOrId || '').toLowerCase();
    if (s.includes('papir') || s.includes('paper')) return '#3b82f6';
    if (s.includes('mat') || s.includes('bio') || s.includes('food')) return '#84cc16';
    if (s.includes('plast') || s.includes('plastic')) return '#a855f7';
    if (s.includes('glass') || s.includes('metal')) return '#f97316';
    if (s.includes('rest') || s.includes('general')) return '#9ca3af';
    if (s.includes('recycl') || s.includes('gjenvinning')) return '#22d3ee';
    return 'var(--color-text-primary)';
};

// Parse dato fra DD/MM/YYYY eller ISO. DD/MM MÅ tolkes før native parsing –
// new Date('07/08/2026') ville ellers blitt tolket som amerikansk MM/DD (8. juli)
const parseDate = (dateStr) => {
    if (!dateStr) return new Date(8640000000000000);
    const parts = String(dateStr).trim().split(/[/.]/);
    if (parts.length === 3 && parts[2].length === 4) {
        const d = new Date(`${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}T00:00:00`);
        if (!isNaN(d.getTime())) return d;
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d;
    return new Date(8640000000000000);
};

// Formater dager til norsk tekst
const formatDays = (days) => {
    const n = parseInt(days, 10);
    if (isNaN(n)) return null;
    if (n === 0) return 'I dag';
    if (n === 1) return 'I morgen';
    if (n < 0) return 'Passert';
    return `Om ${n} dager`;
};

// Beregn dager fra dato. HA-integrasjonens days_until-attributt oppdateres kun
// én gang i døgnet og kan være ett døgn bakpå – datoen er alltid korrekt.
const daysFromDate = (date) => {
    if (!date || isNaN(date.getTime()) || date.getTime() >= 8640000000000000) return undefined;
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((d - today) / 86400000);
};

const TrashTile = ({ tile, device, expanded }) => {
    // Hent alle waste_*-caps (unntatt next_pickup_days) og sorter etter dager/dato
    const wasteCaps = Object.entries(device.capabilitiesObj || {})
        .filter(([id]) => id.startsWith('waste_') && id !== 'waste_next_pickup_days')
        .map(([id, obj]) => {
            const date = parseDate(obj.value);
            return {
                id,
                title: obj.title || id,
                value: obj.value,
                date,
                daysUntil: daysFromDate(date) ?? obj.days_until,
                nextCollection: obj.next_collection,
                entityPicture: obj.entity_picture,
                color: getWasteColor(obj.title || id),
            };
        })
        .sort((a, b) => {
            // Sorter primært på days_until (hvis tilgjengelig), deretter på date
            if (a.daysUntil !== undefined && b.daysUntil !== undefined) {
                return a.daysUntil - b.daysUntil;
            }
            return a.date - b.date;
        });

    const nextPickupCap = device.capabilitiesObj?.waste_next_pickup_days;
    const nextPickupFractions = nextPickupCap?.fractions; // e.g. "Matavfall og Papir"
    const nextPickupDate = nextPickupCap?.collection_date; // e.g. "27/04/2026"
    const nextPickupDays = daysFromDate(parseDate(nextPickupDate)) ?? nextPickupCap?.value;

    // Ikon-komponent: bruker entity_picture fra HA om tilgjengelig, ellers Lucide-fallback
    const WasteIcon = ({ item, size = 20, style = {} }) => {
        if (item.entityPicture) {
            return (
                <img
                    src={item.entityPicture}
                    alt={item.title}
                    style={{ width: size, height: size, objectFit: 'contain', ...style }}
                    onError={e => { e.target.style.display = 'none'; }}
                />
            );
        }
        return <span style={{ color: item.color, display: 'flex', ...style }}>
            {getWasteIcon(item.title || item.id, size)}
        </span>;
    };

    // ---- EXPANDED VIEW ----
    if (expanded) {
        const showSummary = tile?.settings?.showSummary !== false;
        return (
            <div className="tile-content" style={{
                display: 'flex', flexDirection: 'column', height: '100%',
                padding: '10px', gap: '12px'
            }}>
                {/* Sammendrag øverst */}
                {showSummary && (nextPickupDays !== undefined || nextPickupDate) && (
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        background: 'rgba(var(--primary-rgb), 0.08)',
                        padding: '10px 14px', borderRadius: '8px',
                        border: '1px solid rgba(var(--primary-rgb), 0.2)'
                    }}>
                        <span style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
                            {nextPickupFractions || 'Neste henting'}
                        </span>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px' }}>
                            {nextPickupDays !== undefined && (
                                <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-accent-primary)' }}>
                                    {formatDays(nextPickupDays)}
                                </span>
                            )}
                            {nextPickupDate && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                                    {nextPickupDate}
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* Liste over alle fraksjoner */}
                <div style={{
                    display: 'flex', flexDirection: 'column', gap: '6px',
                    overflowY: 'auto', flex: 1
                }}>
                    {wasteCaps.map(waste => (
                        <div key={waste.id} style={{
                            display: 'flex', alignItems: 'center',
                            background: 'rgba(255,255,255,0.05)',
                            padding: '10px 14px', borderRadius: '8px', gap: '12px'
                        }}>
                            <WasteIcon item={waste} size={24} />
                            <span style={{
                                fontSize: '0.9rem', color: 'var(--color-text-primary)', flex: 1
                            }}>
                                {waste.title}
                            </span>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px' }}>
                                {waste.daysUntil !== undefined && (
                                    <span style={{
                                        fontSize: '0.85rem', fontWeight: 600,
                                        color: waste.daysUntil <= 1 ? '#ef4444'
                                            : waste.daysUntil <= 3 ? '#f97316'
                                            : 'var(--color-text-primary)'
                                    }}>
                                        {formatDays(waste.daysUntil)}
                                    </span>
                                )}
                                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                                    {waste.value}
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // ---- COMPACT VIEW ----
    // Finn neste henting: de som har minst days_until
    const minDays = wasteCaps.length > 0
        ? Math.min(...wasteCaps.map(w => w.daysUntil ?? Infinity))
        : Infinity;
    const nextItems = wasteCaps.filter(w => (w.daysUntil ?? Infinity) === minDays);
    // Fallback: bruk første element sortert på dato
    const displayItems = nextItems.length > 0 ? nextItems : wasteCaps.slice(0, 1);

    if (displayItems.length === 0) {
        return (
            <div className="tile-content" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '100%', opacity: 0.5
            }}>
                Ingen hentinger
            </div>
        );
    }

    // En fraksjon neste – vis ikon + navn + dager
    if (displayItems.length === 1) {
        const item = displayItems[0];
        return (
            <div className="tile-content" style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', height: '100%', padding: '10px', textAlign: 'center', gap: '6px'
            }}>
                <WasteIcon item={item} size={40} style={{ marginBottom: '4px' }} />
                <div style={{ fontSize: '1rem', fontWeight: 700, lineHeight: 1.2 }}>
                    {item.title}
                </div>
                {item.daysUntil !== undefined ? (
                    <div style={{
                        fontSize: '0.9rem', fontWeight: 600,
                        color: item.daysUntil <= 1 ? '#ef4444'
                            : item.daysUntil <= 3 ? '#f97316'
                            : 'var(--color-accent-primary)',
                        background: 'rgba(255,255,255,0.1)',
                        padding: '3px 10px', borderRadius: '10px'
                    }}>
                        {formatDays(item.daysUntil)}
                    </div>
                ) : (
                    <div style={{
                        fontSize: '0.85rem', color: 'var(--color-text-secondary)',
                        background: 'rgba(255,255,255,0.1)',
                        padding: '3px 10px', borderRadius: '10px'
                    }}>
                        {item.value}
                    </div>
                )}
            </div>
        );
    }

    // Flere fraksjoner på samme dato – vis ikoner side om side
    return (
        <div className="tile-content" style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', height: '100%', padding: '10px', textAlign: 'center', gap: '6px'
        }}>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '4px' }}>
                {displayItems.map(item => (
                    <WasteIcon key={item.id} item={item} size={34} />
                ))}
            </div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, lineHeight: 1.3 }}>
                {displayItems.map(i => i.title).join(' + ')}
            </div>
            {minDays !== Infinity && (
                <div style={{
                    fontSize: '0.9rem', fontWeight: 600,
                    color: minDays <= 1 ? '#ef4444' : minDays <= 3 ? '#f97316' : 'var(--color-accent-primary)',
                    background: 'rgba(255,255,255,0.1)',
                    padding: '3px 10px', borderRadius: '10px'
                }}>
                    {formatDays(minDays)}
                </div>
            )}
        </div>
    );
};

export default TrashTile;
