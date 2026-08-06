import React from 'react';
import * as Icons from 'lucide-react';

const AppLauncherTile = ({ tile, expanded = false }) => {
    const settings = tile.settings || {};
    const url = settings.url || '#';
    const iconName = settings.icon || 'AppWindow';
    const customColor = settings.color || 'var(--color-primary)';

    // Dynamic icon extraction
    const Icon = Icons[iconName] || Icons.AppWindow;
    const iconImage = settings.iconImage;

    const nav = () => {
        if (url && url !== '#') {
            window.location.href = url;
        }
    };

    return (
        <div
            className="tile-content"
            onClick={nav}
            style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                height: '100%',
                padding: iconImage ? '0' : '12px',
                cursor: 'pointer',
                position: 'relative'
            }}
        >
            <div style={{
                color: customColor,
                marginBottom: expanded ? '16px' : '4px',
                transition: 'transform 0.2s',
                filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                width: expanded ? '80%' : '100%',
                height: expanded ? '80%' : '100%',
                flex: 1, // Let it take available space
                minHeight: 0 // Allow shrinking
            }}>
                {iconImage ? (
                    <img
                        src={iconImage}
                        alt=""
                        style={{
                            width: '100%',
                            height: '100%',
                            // Let's us 'contain' but make wrapper huge
                            objectFit: 'contain',
                            borderRadius: '16px'
                        }}
                    />
                ) : (
                    <Icon size={expanded ? 128 : 64} style={{ width: '100%', height: '100%' }} />
                )}
            </div>

        </div>
    );
};

export default AppLauncherTile;
