import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Settings, Trash2 } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { WIDGET_TYPES } from '../constants';
import { useHomey } from '../context/HomeyContext';
import { resolveTileDevice } from '../services/utils';
import BatteryIcon from './BatteryIcon';
import LightTile from './TileContent/LightTile';
import ThermostatTile from './TileContent/ThermostatTile';
import UniversalTile from './TileContent/UniversalTile';
import SensorTile from './TileContent/SensorTile';
import MultiLightTile from './TileContent/MultiLightTile';
import MultiSensorTile from './TileContent/MultiSensorTile';
import MultiThermostatTile from './TileContent/MultiThermostatTile';
import TrashTile from './TileContent/TrashTile';
import PostalTile from './TileContent/PostalTile';
import SunshadeTile from './TileContent/SunshadeTile';
import ClockWidget from './TileContent/ClockWidget';
import WeatherWidget from './TileContent/WeatherWidget';
import MediaTile from './TileContent/MediaTile';
import VideoWidget from './TileContent/VideoWidget';

import WebWidget from './TileContent/WebWidget';
import WashingMachineTile from './TileContent/WashingMachineTile';
import FlagDayTile from './TileContent/FlagDayTile';
import AppLauncherTile from './TileContent/AppLauncherTile';
import GraphWidget from './TileContent/GraphWidget';
import FlowTile from './TileContent/FlowTile';
import EVChargerTile from './TileContent/EVChargerTile';
import HierarchyTile from './TileContent/HierarchyTile';

import FanTile from './TileContent/FanTile';
import WaterHeaterTile from './TileContent/WaterHeaterTile';
import DoorControlTile from './TileContent/DoorControlTile';
import AirFryerTile from './TileContent/AirFryerTile';
import KeypadTile from './TileContent/KeypadTile';
import VacuumTile from './TileContent/VacuumTile';
import LawnMowerTile from './TileContent/LawnMowerTile';
import IrrigationTile from './TileContent/IrrigationTile';

import HeaderTile from './TileContent/HeaderTile';
import EnergyDashboardWidget from './TileContent/EnergyDashboardWidget';
import IntercomTile from './TileContent/IntercomTile';
import ApplianceTile from './TileContent/ApplianceTile';
import PresenceTile from './TileContent/PresenceTile';
import LightPanelTile from './TileContent/LightPanelTile';

// ... (keep unused imports if needed, but standardizing)

const Tile = ({ tile, onEdit, onDelete, onResize, isVisible = true, ...props }) => {
    const { api, devices, isEditMode, settings, setCurrentPage } = useHomey();
    const [isExpanded, setIsExpanded] = useState(false);
    const contentRef = React.useRef(null);
    const [rowSpan, setRowSpan] = React.useState(null);

    // Resolve device: prioritize tile.settings.deviceId (manual override), fallback to tile.deviceId (initial)
    const deviceId = tile.settings?.deviceId || tile.deviceId;
    const device = resolveTileDevice(devices, deviceId, tile.settings?.fallbackEntityId);
    
    const isMultiLight = tile.type === 'multi-light';
    const isMultiThermostat = tile.type === 'multi-thermostat';
    const isMultiSensor = tile.type === 'multi-sensor';
    const isWidget = WIDGET_TYPES.has(tile.type);
    const isHierarchy = tile.type === 'hierarchy';
    const isHeader = tile.type === 'header';

    // Type detection logic
    let type = tile.type;
    if (tile.forcedType) {
        type = tile.forcedType;
    } else if (isWidget || isMultiLight || isMultiThermostat || isMultiSensor || isHierarchy) {
        type = tile.type;
    } else if (device && (device.settings?.compositeType === 'waste_collection' || device.capabilities.some(c => c.startsWith('waste_')))) {
        type = 'trash';
    } else if (device && device.capabilities.includes('posten_sensor')) {
        type = 'postal';
    } else if (device && device.capabilities.includes('windowcoverings_set')) {
        type = 'sunshade';
    } else if (device && (device.capabilities.includes('homey_water_heater') || device.settings?.compositeType === 'water_heater')) {
        type = 'water-heater';
    } else if (device && (device.capabilities.includes('smart_plug_appliance') || device.settings?.compositeType === 'appliance')) {
        type = 'appliance';
    } else if (device && device.capabilities.includes('person_presence')) {
        type = 'presence';
    } else if (device && device.capabilities.includes('laundry')) {
        type = 'cleaning';
    } else if (device && device.capabilities.includes('homey_ev_charger')) {
        type = 'ev-charger';
    } else if (device && device.capabilities.includes('homey_vacuum')) {
        type = 'vacuum';
    } else if (device && device.capabilities.includes('homey_lawn_mower')) {
        type = 'lawn-mower';
    } else if (device && (device.capabilities.includes('homey_irrigation') || device.settings?.compositeType === 'irrigation')) {
        type = 'irrigation';
    } else if (device && device.capabilities.includes('fan_speed')) {
        type = 'fan';
    } else if (device && device.capabilities.includes('sensor_flagg')) {
        type = 'flagday';
    } else if (device && (device.class === 'speaker' || device.class === 'tv' || device.capabilities.includes('speaker_playing'))) {
        type = 'media';
    } else if (!type || type === 'unknown') {
        type = device ? api.getDeviceType(device) : 'unknown';
    }

    const updateSize = React.useCallback((forceContentHeight) => {
        if (!contentRef.current) return;

        let contentHeight = typeof forceContentHeight === 'number'
            ? forceContentHeight
            : contentRef.current.scrollHeight;
        // Lyspanelet vokser OG krymper (rom åpnes/lukkes). scrollHeight kan aldri bli mindre
        // enn flisens nåværende høyde, så mål panelets egen høyde i stedet — ellers låser
        // flisen seg på største størrelse.
        if (type === 'light-panel') {
            const panel = contentRef.current.querySelector('.light-panel');
            if (panel) contentHeight = panel.offsetHeight;
        }
        const grid = contentRef.current.closest('.tile-grid');
        let rowHeight = 16;
        let gap = 24;

        if (grid) {
            const computedStyle = window.getComputedStyle(grid);
            const gridAutoRows = computedStyle.getPropertyValue('grid-auto-rows');
            const gridGap = computedStyle.getPropertyValue('gap');

            if (gridAutoRows && gridAutoRows !== 'auto' && gridAutoRows !== '') {
                rowHeight = parseFloat(gridAutoRows) || 16;
            }

            if (gridGap && gridGap !== 'normal' && gridGap !== '') {
                const parts = gridGap.split(' ');
                gap = parseFloat(parts[0]) || 24;
            }
        }

        const tilePadding = (
            type === 'weather' ||
            type === 'video' ||
            type === 'web' ||
            type === 'clock' ||
            type === 'app-launcher' ||
            type === 'flow' ||
            type === 'header' ||
            type === 'hierarchy'
        ) ? 0 : 32;

        const totalHeight = contentHeight + tilePadding;
        const requiredRows = Math.ceil((totalHeight + gap) / (rowHeight + gap));

        let minRows = 5;
        if (tile.size) {
            const parts = tile.size.split('x');
            if (parts.length === 2) {
                const rows = parseInt(parts[1], 10);
                minRows = rows * 5;
            }
        }

        const isFixedSizeWidget = type === 'hierarchy' || type === 'web' || type === 'video' || type === 'header' || type === 'clock';
        const finalRows = isFixedSizeWidget ? minRows : Math.max(requiredRows, minRows);

        if (onResize) {
            onResize(finalRows);
        } else {
            setRowSpan(finalRows);
        }
    }, [tile.size, type, onResize, settings?.gridDensity, isVisible, isEditMode, device]);

    React.useLayoutEffect(() => {
        if (!contentRef.current) return;

        // Debounce so rapid resize events don't flood recalculations
        let debounceTimer;
        const debouncedUpdate = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(updateSize, 50);
        };

        const observer = new ResizeObserver(debouncedUpdate);
        observer.observe(contentRef.current);
        updateSize();

        // Single late measurement to catch async content that settles after render
        const settlementTimer = setTimeout(updateSize, 300);

        return () => {
            observer.disconnect();
            clearTimeout(debounceTimer);
            clearTimeout(settlementTimer);
        };
    }, [updateSize, isVisible, isEditMode]);

    // Conditional return MUST be after hooks
    if (!device && !isMultiLight && !isMultiThermostat && !isMultiSensor && !isWidget && !isHierarchy) return null;

    const sizeClass = `size-${tile.size || '1x1'}`;
    const iconUrl = (isMultiLight || isMultiThermostat || isMultiSensor || isWidget || isHierarchy) ? null : api.getIconUrl(device);

    const handleTileClick = (e) => {
        if (isEditMode) return;

        if (type === 'header') {
            const targetPageId = tile.settings?.targetPageId;
            if (targetPageId) {
                setCurrentPage(targetPageId);
            }
            return;
        }

        if (type === 'thermostat' || type === 'light' || type === 'switch' || type === 'multi-light' || type === 'cleaning' || type === 'fan' || type === 'trash' || type === 'postal' || type === 'ev-charger' || type === 'hierarchy' || type === 'water-heater' || type === 'weather' || type === 'keypad' || type === 'vacuum' || type === 'lawn-mower' || type === 'irrigation' || type === 'appliance' || type === 'intercom' || type === 'light-panel') {
            setIsExpanded(true);
        }
    };

    const handleCloseExpanded = (e) => {
        e?.stopPropagation();
        setIsExpanded(false);
    };

    const renderContent = (expanded = false) => {
        const props = {
            tile,
            device,
            expanded
        };
        switch (type) {
            case 'light': return <LightTile {...props} />;
            case 'hierarchy': return <HierarchyTile tile={tile} expanded={expanded} onCloseExpanded={handleCloseExpanded} />;
            case 'thermostat': return <ThermostatTile {...props} />;
            case 'switch':
            case 'socket':
                return <UniversalTile {...props} />;
            case 'sensor': return <SensorTile {...props} />;
            case 'cleaning': return <WashingMachineTile {...props} />;
            case 'fan': return <FanTile {...props} />;
            case 'water-heater':
                return <WaterHeaterTile tile={tile} device={device} expanded={expanded} onCloseExpanded={handleCloseExpanded} />;
            case 'flagday': return <FlagDayTile {...props} />;
            case 'multi-light': return <MultiLightTile {...props} />;
            case 'multi-thermostat': return <MultiThermostatTile tile={tile} />;
            case 'multi-sensor': return <MultiSensorTile {...props} />;
            case 'trash': return <TrashTile {...props} />;
            case 'postal': return <PostalTile {...props} />;
            case 'sunshade': return <SunshadeTile {...props} />;
            case 'media': return <MediaTile {...props} />;
            case 'clock': return <ClockWidget {...props} />;
            case 'weather': return <WeatherWidget {...props} onContentUpdate={updateSize} />;
            case 'flow': return <FlowTile {...props} />;
            case 'ev-charger': return <EVChargerTile {...props} />;
            case 'video': return <VideoWidget {...props} settings={tile.settings} />;
            case 'web': return <WebWidget {...props} settings={tile.settings} />;
            case 'header': return <HeaderTile settings={tile.settings} />;
            case 'app-launcher': return <AppLauncherTile {...props} />;
            case 'graph': return <GraphWidget {...props} />;
            case 'energy-dashboard': return <EnergyDashboardWidget tile={tile} onContentUpdate={updateSize} />;
            case 'door-control': return <DoorControlTile tile={tile} />;
            case 'airfryer': return <AirFryerTile {...props} />;
            case 'keypad': return <KeypadTile {...props} settings={tile.settings} onCloseExpanded={handleCloseExpanded} />;
            case 'vacuum': return <VacuumTile {...props} />;
            case 'lawn-mower': return <LawnMowerTile {...props} />;
            case 'irrigation': return <IrrigationTile {...props} />;
            case 'intercom': return <IntercomTile {...props} />;
            case 'appliance': return <ApplianceTile {...props} />;
            case 'presence': return <PresenceTile {...props} />;
            case 'light-panel': return <LightPanelTile {...props} onContentUpdate={updateSize} />;
            default: return <div className="tile-content">Unknown type</div>;
        }
    };

    const computedStyle = (onResize || !rowSpan) ? { height: '100%' } : { gridRowEnd: `span ${rowSpan}` };
    const finalStyle = {
        ...computedStyle,
        ...tile.style,
        ...props.style,
        cursor: (['thermostat', 'light', 'switch', 'socket'].includes(type) && !isEditMode) ? 'pointer' : 'default',
        touchAction: 'manipulation'
    };

    return (
        <>
            <div
                className={`tile ${sizeClass} type-${type} ${props.className || ''}`}
                data-tile-id={tile.id}
                style={finalStyle}
                onClick={handleTileClick}
            >
                <div ref={contentRef} className="tile-inner-wrapper" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                    {(!isMultiLight && !isMultiThermostat && !isMultiSensor && !isWidget && !tile.settings?.isHorizontal) && (
                        <>
                            <div className="tile-header">
                                <div className="tile-icon">
                                    {tile.settings?.customIcon ? (() => {
                                        const Icon = LucideIcons[tile.settings.customIcon];
                                        return Icon ? <Icon size={32} strokeWidth={1.5} /> : null;
                                    })() : device?.LucideIcon ? (
                                        <device.LucideIcon size={32} strokeWidth={1.5} />
                                    ) : (
                                        <img src={iconUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                    )}
                                </div>
                                {device?.capabilitiesObj?.measure_battery && (
                                    <div className="battery-indicator" style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--color-text-secondary)', fontSize: '0.75rem' }}>
                                        <BatteryIcon percentage={device.capabilitiesObj?.measure_battery?.value} size={16} />
                                        <span>{device.capabilitiesObj?.measure_battery?.value}%</span>
                                    </div>
                                )}
                            </div>
                            <div className="tile-name">
                                {tile.name || device.name}
                            </div>
                        </>
                    )}

                    <div className="tile-content-wrapper" style={{ width: '100%', display: 'flex', flexDirection: 'column', flex: 1 }}>
                        {renderContent()}
                    </div>
                </div>

                {isEditMode && (
                    <div className="tile-edit-overlay">
                        <button
                            className="tile-edit-btn settings"
                            onClick={(e) => {
                                e.stopPropagation();
                                onEdit(tile);
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            onTouchStart={(e) => e.stopPropagation()}
                        >
                            <Settings size={16} />
                        </button>
                        <button
                            className="tile-edit-btn delete"
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(tile.id);
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            onTouchStart={(e) => e.stopPropagation()}
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                )}
            </div>

            {isExpanded && createPortal(
                <div className="tile-expanded-overlay" onClick={handleCloseExpanded}>
                    <div
                        className={`tile-expanded-content ${type === 'hierarchy' ? 'tile-expanded-full no-scrollbar' : ''}`}
                        onClick={e => e.stopPropagation()}
                        style={type === 'weather' ? {
                            padding: 0,
                            background: 'transparent',
                            border: 'none',
                            boxShadow: 'none',
                            width: 'min(480px, 95vw)',
                            borderRadius: '1.5rem',
                        } : type === 'hierarchy' ? {
                            padding: 0,
                            background: 'transparent',
                            border: 'none',
                            boxShadow: 'none',
                            overscrollBehavior: 'contain',
                            width: '80vw',
                            height: '80vh',
                            maxWidth: 'none',
                            maxHeight: 'none',
                            borderRadius: '1.5rem',
                        } : (type === 'thermostat' || type === 'ev-charger' || type === 'vacuum' || type === 'water-heater') ? {
                            minWidth: 'min(760px, 95vw)',
                        } : type === 'light-panel' ? {
                            minWidth: 'min(900px, 95vw)',
                        } : {}}
                    >
                        <button
                            className="tile-expanded-close"
                            onClick={handleCloseExpanded}
                            style={type === 'weather' ? { background: 'rgba(0,0,0,0.3)', color: 'white' }
                                 : type === 'hierarchy' ? { right: '2rem', top: '2rem', background: 'rgba(0,0,0,0.2)', color: 'white' }
                                 : {}}
                        >
                            <X size={32} />
                        </button>
                        <div className="tile-expanded-body">
                            {renderContent(true)}
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};

export default Tile;
