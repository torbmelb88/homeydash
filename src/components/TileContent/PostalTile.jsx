import React from 'react';
import { CalendarDays } from 'lucide-react';

// Approksimering av Posten-logoen som SVG
const PostenLogo = ({ size = 38 }) => (
    <svg width={size} height={size} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        {/* Rød bakgrunnssirkel */}
        <circle cx="50" cy="50" r="50" fill="#E8002D" />
        {/* Hvit overlay-sirkel – skaper bue-åpningen */}
        <circle cx="68" cy="32" r="43" fill="white" />
        {/* Rød indre sirkel – skaper ringformen */}
        <circle cx="50" cy="50" r="22" fill="#E8002D" />
    </svg>
);

const POSTEN_RED = '#E8002D';
const POSTEN_RED_DARK = '#c0001f';
const POSTEN_RED_BG = 'rgba(232,0,45,0.10)';
const POSTEN_RED_BORDER = 'rgba(232,0,45,0.28)';
const POSTEN_GLOW = 'rgba(232,0,45,0.30)';

const PostalTile = ({ tile, device, expanded }) => {
    const capObj = device?.capabilitiesObj || {};
    const status = capObj.posten_sensor?.value;

    const isToday =
        capObj.posten_today?.value === true ||
        (status && status.toLowerCase().includes('i dag'));

    const isTomorrow = !isToday && (
        status && status.toLowerCase().includes('i morgen')
    );

    let daysLeft;
    if (capObj.posten_next_date?.value) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        daysLeft = Math.round((new Date(capObj.posten_next_date.value) - today) / 86400000);
    }

    let upcomingDates = [];
    try {
        const raw = capObj.posten_calendar?.value;
        if (raw) {
            upcomingDates = JSON.parse(raw.replace(/'/g, '"'));
            if (!Array.isArray(upcomingDates)) upcomingDates = [];
        }
    } catch (_) {}

    const formatDate = (iso) => {
        try {
            return new Date(iso).toLocaleDateString('nb-NO', { day: 'numeric', month: 'short' });
        } catch (_) { return iso; }
    };

    const daysUntilFull = (iso) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diff = Math.round((new Date(iso) - today) / 86400000);
        if (diff === 0) return 'I dag';
        if (diff === 1) return 'I morgen';
        return `Om ${diff} dager`;
    };

    const daysUntilShort = (iso) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const diff = Math.round((new Date(iso) - today) / 86400000);
        if (diff === 0) return 'I dag';
        if (diff === 1) return 'I morgen';
        return `${diff} dager`;
    };

    const countdownLabel = isToday
        ? 'I dag'
        : isTomorrow
        ? 'I morgen'
        : daysLeft !== undefined
        ? `Om ${daysLeft} dager`
        : status || '—';

    const futureDates = upcomingDates.slice(1, 6);

    // ── EXPANDED VIEW ─────────────────────────────────────────────────────
    if (expanded) {
        const showNextDate = tile?.settings?.showNextDate !== false;
        const showUpcoming = tile?.settings?.showUpcoming !== false;
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                padding: '20px 20px 16px',
                gap: '16px',
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                }}>
                    <div style={{
                        width: 58, height: 58,
                        borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: `0 6px 20px ${POSTEN_GLOW}`,
                        flexShrink: 0,
                        overflow: 'hidden',
                    }}>
                        <PostenLogo size={58} />
                    </div>
                    <div>
                        <div style={{
                            fontSize: '1.5rem',
                            fontWeight: 800,
                            color: POSTEN_RED,
                            lineHeight: 1.1,
                            letterSpacing: '-0.01em',
                        }}>
                            {countdownLabel}
                        </div>
                        {showNextDate && capObj.posten_next_date?.value && (
                            <div style={{
                                fontSize: '0.88rem',
                                color: 'var(--color-text-secondary)',
                                marginTop: '5px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                            }}>
                                <CalendarDays size={13} style={{ opacity: 0.7 }} />
                                {formatDate(capObj.posten_next_date.value)}
                            </div>
                        )}
                    </div>
                </div>

                {/* Upcoming list */}
                {showUpcoming && futureDates.length > 0 && (
                    <>
                        <div style={{ borderTop: '1px solid var(--color-border)' }} />
                        <div style={{
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: 'var(--color-text-secondary)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.08em',
                            marginBottom: '2px',
                        }}>
                            Kommende leveringer
                        </div>
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '2px',
                            overflowY: 'auto',
                            flex: 1,
                        }}>
                            {futureDates.map((iso, i) => (
                                <div key={i} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '9px 12px',
                                    borderRadius: '8px',
                                    background: i === 0 ? POSTEN_RED_BG : 'transparent',
                                    border: i === 0 ? `1px solid ${POSTEN_RED_BORDER}` : '1px solid transparent',
                                }}>
                                    <span style={{
                                        fontSize: '0.92rem',
                                        fontWeight: 600,
                                        color: i === 0 ? POSTEN_RED : 'var(--color-text-primary)',
                                    }}>
                                        {formatDate(iso)}
                                    </span>
                                    <span style={{
                                        fontSize: '0.85rem',
                                        color: i === 0 ? POSTEN_RED : 'var(--color-text-secondary)',
                                    }}>
                                        {daysUntilFull(iso)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        );
    }

    // ── COMPACT VIEW ──────────────────────────────────────────────────────
    return (
        <div className="tile-content" style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'stretch',
            height: '100%',
            padding: '10px 12px',
            overflow: 'hidden',
        }}>
            {/* Left: Posten-logo + countdown */}
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '7px',
                flexShrink: 0,
                width: '74px',
                paddingRight: '10px',
            }}>
                <div style={{
                    width: 40, height: 40,
                    borderRadius: '50%',
                    overflow: 'hidden',
                    boxShadow: `0 3px 10px ${POSTEN_GLOW}`,
                }}>
                    <PostenLogo size={40} />
                </div>
                <span style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    color: POSTEN_RED,
                    textAlign: 'center',
                    lineHeight: 1.25,
                    whiteSpace: 'nowrap',
                }}>
                    {countdownLabel}
                </span>
            </div>

            {/* Divider */}
            <div style={{
                width: '1px',
                alignSelf: 'stretch',
                margin: '4px 0',
                background: 'var(--color-border)',
                flexShrink: 0,
            }} />

            {/* Right: upcoming dates */}
            <div style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                gap: '5px',
                paddingLeft: '12px',
                minWidth: 0,
                overflow: 'hidden',
            }}>
                {futureDates.length > 0 ? (
                    futureDates.slice(0, 4).map((iso, i) => (
                        <div key={i} style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '8px',
                        }}>
                            <span style={{
                                fontSize: '0.8rem',
                                fontWeight: i === 0 ? 700 : 600,
                                color: i === 0 ? POSTEN_RED : 'var(--color-text-primary)',
                                whiteSpace: 'nowrap',
                            }}>
                                {formatDate(iso)}
                            </span>
                            <span style={{
                                fontSize: '0.75rem',
                                color: i === 0 ? POSTEN_RED : 'var(--color-text-secondary)',
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                            }}>
                                {daysUntilShort(iso)}
                            </span>
                        </div>
                    ))
                ) : (
                    <div style={{
                        fontSize: '0.82rem',
                        color: 'var(--color-text-secondary)',
                        textAlign: 'center',
                        padding: '0 8px',
                    }}>
                        Ingen kommende
                    </div>
                )}
            </div>
        </div>
    );
};

export default PostalTile;
