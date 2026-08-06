import React, { useState, useEffect } from 'react';
import { useHomey } from '../context/HomeyContext';
import { Settings, Maximize, Minimize, Edit, Menu, Home, ArrowLeft, RefreshCw } from 'lucide-react';
import SettingsModal from './SettingsModal';
import BatteryIcon from './BatteryIcon';

const Topbar = ({ onToggleSidebar }) => {
    const { settings, api, isEditMode, setIsEditMode, pages, currentPage, setCurrentPage, goBack, canGoBack } = useHomey();
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [batteryLevel, setBatteryLevel] = useState(null);

    const activePage = pages.find(p => p.id === currentPage);
    const pageTitle = activePage ? activePage.name : 'Hjem';
    const isIframePage = !!activePage?.iframeUrl;

    // Battery logic
    useEffect(() => {
        if (!settings.batteryDeviceId) return;

        const updateBattery = async () => {
            try {
                const device = await api.getDevice(settings.batteryDeviceId);
                const level = device?.capabilitiesObj?.measure_battery?.value;
                setBatteryLevel(level);
            } catch (e) {
                console.error("Failed to get battery", e);
            }
        };

        updateBattery();
        const interval = setInterval(updateBattery, 300000); // 5 min
        return () => clearInterval(interval);
    }, [settings.batteryDeviceId, api]);

    const toggleFullscreen = () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(e => console.error(e));
            setIsFullscreen(true);
        } else {
            document.exitFullscreen().catch(e => console.error(e));
            setIsFullscreen(false);
        }
    };

    const toggleEditMode = () => {
        const newMode = !isEditMode;
        setIsEditMode(newMode);
        document.body.classList.toggle('edit-mode', newMode);
    };

    const handleRefreshIframe = () => {
        if (window.refreshCurrentIframe) {
            window.refreshCurrentIframe();
        }
    };

    return (
        <div className="topbar">
            <div className="topbar-left">
                {(isEditMode || (settings.showSidebar !== false && !settings.panelMode)) ? (
                    <button className="icon-btn hamburger" onClick={onToggleSidebar}>
                        <Menu size={24} />
                    </button>
                ) : (
                    <>
                        {canGoBack && (
                            <button className="icon-btn" onClick={goBack} title="Gå tilbake">
                                <ArrowLeft size={24} />
                            </button>
                        )}
                        <button className="icon-btn" onClick={() => {
                            if (pages.length > 0) {
                                setCurrentPage(pages[0].id);
                            }
                        }}>
                            <Home size={24} />
                        </button>
                    </>
                )}
                {!settings.panelMode && <h1 id="pageTitle">{pageTitle}</h1>}
            </div>

            <div className="topbar-right">
                {/* Iframe Refresh Button */}
                {isIframePage && (
                    <button className="icon-btn" onClick={handleRefreshIframe} title="Last iframe på nytt">
                        <RefreshCw size={20} />
                    </button>
                )}

                {/* Battery */}
                {batteryLevel !== null && (
                    <button className="icon-btn battery-status">
                        <BatteryIcon percentage={batteryLevel} size={20} />
                        <span className="battery-percentage">{Math.round(batteryLevel)}%</span>
                    </button>
                )}

                {/* Edit Mode */}
                <button
                    className={`icon-btn ${isEditMode ? 'active' : ''}`}
                    onClick={toggleEditMode}
                    title="Rediger"
                >
                    <Edit size={20} />
                </button>

                {/* Fullscreen */}
                {settings.showFullscreenBtn !== false && (
                    <button className="icon-btn" onClick={toggleFullscreen}>
                        {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                    </button>
                )}

                {/* Settings */}
                <button className="icon-btn" onClick={() => setShowSettings(true)}>
                    <Settings size={20} />
                </button>
            </div>

            {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
        </div>
    );
};

export default Topbar;
