import React from 'react';
import * as Icons from 'lucide-react';

const HeaderTile = ({ settings }) => {
    const { title, subtitle, theme, icon: iconName, customColor } = settings || {};

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

    return (
        <div style={containerStyle}>
            {/* Decorative Background Icon */}
            <div style={decorStyle}>
                <Icon size={120} strokeWidth={1.5} />
            </div>

            <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{
                    background: 'rgba(255,255,255,0.2)',
                    borderRadius: '50%',
                    padding: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backdropFilter: 'blur(5px)'
                }}>
                    <Icon size={32} strokeWidth={2} />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <h2 style={{
                        margin: 0,
                        fontSize: '1.4rem',
                        fontWeight: 700,
                        letterSpacing: '0.5px',
                        textShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}>
                        {title || 'Overskrift'}
                    </h2>
                    {subtitle && (
                        <span style={{
                            fontSize: '0.9rem',
                            opacity: 0.9,
                            fontWeight: 500
                        }}>
                            {subtitle}
                        </span>
                    )}
                </div>
            </div>

            {/* Subtle "Go" indicator */}
            <div style={{
                position: 'absolute',
                top: '50%',
                right: '1.5rem',
                transform: 'translateY(-50%)',
                opacity: 0.6
            }}>
                <Icons.ChevronRight size={24} />
            </div>
        </div>
    );
};

export default HeaderTile;
