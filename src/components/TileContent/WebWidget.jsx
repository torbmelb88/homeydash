import React, { useEffect, useState, useRef } from 'react';
import { proxiedServiceUrl } from '../../services/utils';

const WebWidget = ({ settings, tile }) => {
    const { url, refreshInterval, mode, embedCode, desktopMode, viewportWidth } = settings || {};
    const [key, setKey] = useState(0); // Used to force refresh
    const containerRef = useRef(null);
    const [scale, setScale] = useState(1);

    useEffect(() => {
        if (!refreshInterval || refreshInterval <= 0) return;

        const interval = setInterval(() => {
            setKey(prev => prev + 1);
        }, refreshInterval * 60 * 1000); // Convert minutes to ms

        return () => clearInterval(interval);
    }, [refreshInterval]);

    // Calculate scale for Desktop Mode
    useEffect(() => {
        if (!desktopMode || !containerRef.current) {
            setScale(1);
            return;
        }

        const updateScale = () => {
            if (containerRef.current) {
                const availableWidth = containerRef.current.offsetWidth;
                const targetWidth = viewportWidth || 1280;
                // Scale DOWN to fit targetWidth into availableWidth
                // e.g. 300 / 1280 = 0.23
                const newScale = availableWidth / targetWidth;
                setScale(newScale);
            }
        };

        const resizeObserver = new ResizeObserver(() => {
            updateScale();
        });

        resizeObserver.observe(containerRef.current);
        updateScale(); // Initial calculation

        return () => resizeObserver.disconnect();
    }, [desktopMode, viewportWidth]);


    // Mode: Custom Embed Code
    if (mode === 'embed') {
        if (!embedCode) {
            return (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '100%',
                    color: 'var(--color-text-secondary)',
                    textAlign: 'center',
                    padding: 'var(--spacing-md)'
                }}>
                    <div style={{ marginBottom: '8px' }}>Ingen kode</div>
                    <div style={{ fontSize: '0.8em', opacity: 0.7 }}>
                        Legg inn HTML i innstillinger
                    </div>
                </div>
            );
        }

        return (
            <div style={{
                width: '100%',
                height: '100%',
                overflow: 'hidden',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-bg-secondary)',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column'
            }}>
                {tile && tile.name && (
                    <div style={{
                        padding: '8px 10px 4px 10px',
                        fontWeight: '500',
                        fontSize: '0.9rem',
                        zIndex: 10
                    }}>
                        {tile.name}
                    </div>
                )}
                <div style={{ flex: 1, position: 'relative' }}>
                    <div
                        dangerouslySetInnerHTML={{ __html: embedCode }}
                        style={{ width: '100%', height: '100%' }}
                    />
                </div>
            </div>
        );
    }

    // Mode: URL (Default)
    if (!url) {
        return (
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'var(--color-text-secondary)',
                textAlign: 'center',
                padding: 'var(--spacing-md)'
            }}>
                <div style={{ marginBottom: '8px' }}>Ingen URL</div>
                <div style={{ fontSize: '0.8em', opacity: 0.7 }}>
                    Legg til nettadresse i innstillinger
                </div>
            </div>
        );
    }

    return (
        <div ref={containerRef} style={{
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column'
        }}>
            {tile && tile.name && (
                <div style={{
                    padding: '8px 10px 4px 10px',
                    fontWeight: '500',
                    fontSize: '0.9rem',
                    zIndex: 10
                }}>
                    {tile.name}
                </div>
            )}
            <div style={{ flex: 1, position: 'relative' }}>
                <iframe
                    key={key}
                    src={proxiedServiceUrl(url)}
                    style={{
                        // If desktop mode: Width = Virtual Width (e.g. 1280px)
                        // If normal: Width = 100%
                        width: desktopMode ? `${viewportWidth || 1280}px` : '100%',

                        // If desktop mode: Height must be scaled up so when scaled down it fills container
                        // Height = ContainerHeight / Scale
                        height: desktopMode ? `${(100 / scale)}%` : '100%',

                        border: 'none',
                        pointerEvents: 'auto',

                        transform: desktopMode ? `scale(${scale})` : 'none',
                        transformOrigin: '0 0'
                    }}
                    title="Web Widget"
                    sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                />
            </div>
        </div>
    );
};

export default WebWidget;
