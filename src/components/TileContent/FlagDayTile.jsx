import React from 'react';
import { Flag, Calendar } from 'lucide-react';

const FlagDayTile = ({ tile, device, expanded = false }) => {
    // Extract capabilities
    // Based on user screenshot:
    // sensor_flagg: "Fjerde søndag i advent" (String)
    // meter_flagg_sensor: 1 (Number, days remaining)
    // sensor_flagg_type: "Merkedag" (String)

    const eventName = device?.capabilitiesObj?.sensor_flagg?.value || 'Ingen hendelse';
    const daysRemaining = device?.capabilitiesObj?.meter_flagg_sensor?.value;
    const type = device?.capabilitiesObj?.sensor_flagg_type?.value;

    const isToday = daysRemaining === 0;
    const isTomorrow = daysRemaining === 1;

    let timeText = '';
    if (daysRemaining !== undefined && daysRemaining !== null) {
        if (isToday) timeText = 'I dag!';
        else if (isTomorrow) timeText = 'I morgen';
        else timeText = `Om ${daysRemaining} dager`;
    }

    // Determine color based on urgency
    const urgencyColor = isToday ? 'var(--color-accent-red, #ff5252)' :
        isTomorrow ? 'var(--color-accent-orange, #ffab40)' :
            'var(--color-primary)';

    return (
        <div className="tile-content" style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center', // Center vertically properly
            alignItems: 'center',
            height: '100%',
            padding: '12px',
            position: 'relative',
            textAlign: 'center'
        }}>
            {/* Background Icon Opacity */}
            <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                opacity: 0.1,
                zIndex: 0,
                color: urgencyColor
            }}>
                <Flag size={expanded ? 120 : 64} />
            </div>

            {/* Content */}
            <div style={{ zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <span style={{
                    fontSize: expanded ? '2.5rem' : '1.5rem',
                    fontWeight: '900',
                    color: urgencyColor,
                    lineHeight: 1
                }}>
                    {daysRemaining !== undefined ? daysRemaining : '-'}
                </span>

                <span style={{
                    fontSize: expanded ? '1rem' : '0.8rem',
                    color: 'var(--color-text-secondary)',
                    fontWeight: '500',
                    opacity: 0.9
                }}>
                    {timeText}
                </span>

                <span style={{
                    fontSize: expanded ? '1.2rem' : '0.9rem',
                    fontWeight: 'bold',
                    color: 'var(--color-text-primary)',
                    marginTop: '4px',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    lineHeight: 1.2
                }}>
                    {eventName}
                </span>
            </div>
        </div>
    );
};

export default FlagDayTile;
