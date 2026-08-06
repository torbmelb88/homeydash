import React from 'react';
import { useFullyKiosk } from '../../hooks/useFullyKiosk';
import { proxiedServiceUrl } from '../../services/utils';

const VideoWidget = ({ settings, isVisible = true, tile }) => {
    const { streamUrl, sourceType, frigateHost, cameraName, frigateProtocol = 'webrtc' } = settings || {};

    let finalUrl = streamUrl;

    if (sourceType === 'frigate' && frigateHost && cameraName) {
        // Strip trailing slash from host
        const cleanHost = frigateHost.replace(/\/$/, '');

        switch (frigateProtocol) {
            case 'mse':
                finalUrl = `${cleanHost}/live/mse/stream.html?src=${cameraName}`;
                break;
            case 'mjpeg':
                // Frigate API for MJPEG stream
                finalUrl = `${cleanHost}/api/${cameraName}/mjpeg`;
                break;
            case 'go2rtc':
                // Minimal Go2RTC player
                finalUrl = `${cleanHost}/webrtc?src=${cameraName}`;
                break;
            case 'go2rtc_mse':
                // Standard Go2RTC player with MSE
                finalUrl = `${cleanHost}/stream.html?src=${cameraName}&mode=mse`;
                break;
            case 'webrtc':
            default:
                finalUrl = `${cleanHost}/live/webrtc/stream.html?src=${cameraName}`;
                break;
        }
    }

    // Route local Frigate/go2rtc through the same-origin proxy when on HTTPS
    // so the iframe isn't blocked as mixed content.
    finalUrl = proxiedServiceUrl(finalUrl);

    // Prevent screensaver if we have a valid URL AND we are visible
    useFullyKiosk(!!finalUrl && isVisible);

    if (!finalUrl) {
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
                    Legg til strøm-URL i innstillinger
                </div>
            </div>
        );
    }

    // Calculate aspect ratio style if needed, though for an iframe filling the tile
    // we usually just want it to cover the available space.
    // We can use object-fit equivalent for iframe by setting width/height to 100%

    return (
        <div style={{
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            position: 'relative',
            borderRadius: 'var(--radius-md)',
            background: '#000',
            display: 'flex',
            flexDirection: 'column'
        }}>
            {tile && tile.name && (
                <div style={{
                    padding: '8px 10px 4px 10px',
                    fontWeight: '500',
                    fontSize: '0.9rem',
                    zIndex: 10,
                    color: 'white',
                    background: 'rgba(0,0,0,0.5)'
                }}>
                    {tile.name}
                </div>
            )}
            <div style={{ flex: 1, position: 'relative' }}>
                <iframe
                    src={finalUrl}
                    style={{
                        width: '100%',
                        height: '100%',
                        border: 'none',
                        pointerEvents: 'auto' // Allow interaction with controls inside iframe
                    }}
                    allow="autoplay; fullscreen"
                    title="Live Video"
                />
            </div>
            {/* Overlay to prevent interaction in edit mode is handled globally by base.css */}
        </div>
    );
};

export default VideoWidget;
