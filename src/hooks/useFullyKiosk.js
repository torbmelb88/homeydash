import { useEffect, useRef } from 'react';

export const useFullyKiosk = (shouldDisableScreensaver = false) => {
    // Keep track for cleanup
    const intervalRef = useRef(null);

    useEffect(() => {
        if (!shouldDisableScreensaver) return;

        if (window.fully) {
            console.log('Fully Kiosk detected: Starting screensaver prevention heartbeat');

            // Function to "poke" the screen
            const keepAwake = () => {
                // Try multiple methods to wake screen/reset timer
                if (typeof window.fully.stopScreensaver === 'function') {
                    window.fully.stopScreensaver();
                }
                if (typeof window.fully.turnScreenOn === 'function') {
                    window.fully.turnScreenOn();
                }
                // Re-assert per tick: bindingen er en global FK-slot som
                // andre hooks (useKeepScreenAwake) kan nullstille i sin
                // cleanup — f.eks. når en popup kvitteres ut på en
                // iframe-side som fortsatt skal holde skjermen våken.
                if (typeof window.fully.bind === 'function') {
                    try {
                        window.fully.bind('onScreensaverStart', 'window.fully.stopScreensaver(); window.fully.turnScreenOn();');
                    } catch (e) {
                        console.warn('Could not bind to onScreensaverStart', e);
                    }
                }
            };

            // Run immediately
            keepAwake();

            // Run repeatedly every 5 seconds to be safe
            intervalRef.current = setInterval(keepAwake, 5000);

        } else {
            console.log('Fully Kiosk API not found');
        }

        return () => {
            // Cleanup: Stop the heartbeat
            if (intervalRef.current) {
                console.log('Fully Kiosk: Stopping heartbeat');
                clearInterval(intervalRef.current);
                intervalRef.current = null;

                // Explicitly disable "Keep Screen On" if it was ever enabled
                if (window.fully && typeof window.fully.keepScreenOn === 'function') {
                    window.fully.keepScreenOn(false);
                }

                // IMPORTANT: Unbind the screensaver start event!
                // Otherwise it will persist and block screensaver on ALL pages.
                if (window.fully && typeof window.fully.bind === 'function') {
                    try {
                        // Binding to empty string or semicolon clears/overwrites the previous binding
                        window.fully.bind('onScreensaverStart', ';');
                        console.log('Fully Kiosk: Unbound onScreensaverStart');
                    } catch (e) {
                        console.warn('Could not unbind onScreensaverStart', e);
                    }
                }
            }
        };
    }, [shouldDisableScreensaver]);

    return {
        isAvailable: !!window.fully
    };
};
