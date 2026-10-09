import React from 'react';
import * as Icons from 'lucide-react';

const HeaderTile = ({ settings, size }) => {
    const { title, subtitle, theme, icon: iconName, customColor } = settings || {};
    // 1 kolonne bred: stablet oppsett (ikon over tekst) så tittelen får hele flisbredden
    const cols = parseInt((size || '1x1').split('x')[0], 10) || 1;
    const compact = cols === 1;

    // Theme Presets (Gradients & Colors)
    const themes = {
        climate: {
            gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
            textColor: '#fff',
            defaultIcon: 'Thermometer',
            shadow: '0 8px 32px 0 rgba(79, 172, 254, 0.3)'
        },
        lights: {
            gradient: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)',
            textColor: '#fff',
            defaultIcon: 'Lightbulb',
            shadow: '0 8px 32px 0 rgba(246, 211, 101, 0.3)'
        },
        energy: {
            gradient: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
            textColor: '#fff',
            defaultIcon: 'Zap',
            shadow: '0 8px 32px 0 rgba(67, 233, 123, 0.3)'
        },
        security: {
            gradient: 'linear-gradient(135deg, #ff0844 0%, #ffb199 100%)',
            textColor: '#fff',
            defaultIcon: 'Shield',
            shadow: '0 8px 32px 0 rgba(255, 8, 68, 0.3)'
        },
        media: {
            gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            textColor: '#fff',
            defaultIcon: 'Music',
            shadow: '0 8px 32px 0 rgba(118, 75, 162, 0.3)'
        },
        general: {
            gradient: 'linear-gradient(135deg, #6B73FF 0%, #000DFF 100%)', // Default deep blue
            textColor: '#fff',
            defaultIcon: 'LayoutGrid',
            shadow: '0 8px 32px 0 rgba(107, 115, 255, 0.3)'
        }
    };

    const activeTheme = themes[theme] || themes.general;
    const finalIconName = iconName || activeTheme.defaultIcon;
    const Icon = Icons[finalIconName] || Icons.HelpCircle;

    const containerStyle = {
        width: '100%',
        height: '100%',
        background: activeTheme.gradient,
        color: activeTheme.textColor,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: 0,
        borderRadius: 'var(--radius-md)',
        boxShadow: activeTheme.shadow,
        position: 'relative',
        overflow: 'hidden',
        userSelect: 'none',
        // Optional custom color override
        ...(customColor ? { background: customColor, boxShadow: 'none' } : {})
    };

    // Decorative background element (faint large icon)
    const decorStyle = {
        position: 'absolute',
        right: '-10%',
        bottom: '-20%',
        opacity: 0.15,
        transform: 'rotate(-15deg)',
        pointerEvents: 'none'
    };

    const contentStyle = compact
        ? { position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.4rem', minWidth: 0, padding: '0.65rem 0.9rem', maxHeight: '100%', overflow: 'hidden' }
        : { position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0, paddingRight: '3rem' };

    const titleStyle = {
        margin: 0,
        fontSize: compact ? '1.1rem' : '1.4rem',
        fontWeight: 700,
        letterSpacing: '0.5px',
        lineHeight: 1.15,
        textShadow: '0 2px 4px rgba(0,0,0,0.1)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        // Kompakt: inntil to linjer (flisen har fast høyde, så den vokser ikke).
        // Bred: én linje – lange titler kuttes i stedet for å gjøre flisen høyere.
        ...(compact
            ? { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2, overflowWrap: 'anywhere' }
            : { whiteSpace: 'nowrap' })
    };

    const chevronStyle = compact
        ? { position: 'absolute', top: '0.7rem', right: '0.7rem', opacity: 0.6, display: 'flex' }
        : { position: 'absolute', top: '50%', right: '1.5rem', transform: 'translateY(-50%)', opacity: 0.6 };

    return (
        <div style={containerStyle}>
            {/* Decorative Background Icon */}
            <div style={decorStyle}>
                <Icon size={120} strokeWidth={1.5} />
            </div>

            <div style={contentStyle}>
                <div style={{
                    background: 'rgba(255,255,255,0.2)',
                    borderRadius: '50%',
                    padding: compact ? '8px' : '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backdropFilter: 'blur(5px)'
                }}>
                    <Icon size={compact ? 20 : 32} strokeWidth={2} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, width: compact ? '100%' : undefined }}>
                    <h2 style={titleStyle}>
                        {title || 'Overskrift'}
                    </h2>
                    {subtitle && (
                        <span style={{
                            fontSize: compact ? '0.78rem' : '0.9rem',
                            lineHeight: compact ? 1.25 : undefined,
                            opacity: 0.9,
                            fontWeight: 500,
                            marginTop: compact ? '2px' : 0,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                        }}>
                            {subtitle}
                        </span>
                    )}
                </div>
            </div>

            {/* Subtle "Go" indicator */}
            <div style={chevronStyle}>
                <Icons.ChevronRight size={compact ? 18 : 24} />
            </div>
        </div>
    );
};

export default HeaderTile;
