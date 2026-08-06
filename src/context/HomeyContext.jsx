import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { homeyAPI } from '../services/homey-api';
import { hassAPI } from '../services/hass-api';
import { mapHassToHomey, groupEntitiesByDevice, applyEntityUpdateToDevice } from '../services/hub-mapper.jsx';
import { storage } from '../services/storage';
import { INTERACTION_TIMEOUT_MS, MAX_TOAST_COUNT } from '../constants';

const HomeyContext = createContext(null);

export const HomeyProvider = ({ children }) => {
    const [devices, setDevices] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [settings, setSettings] = useState({});
    const [pages, setPages] = useState([]);
    const [flows, setFlows] = useState([]);
    const [currentPage, setCurrentPageState] = useState(null);
    const [history, setHistory] = useState([]);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isEditMode, setIsEditMode] = useState(false);
    const [isInteracting, setIsInteracting] = useState(false);
    // Ref mirrors isInteracting so callbacks registered in useEffect([]) see the current value
    const isInteractingRef = useRef(false);
    const [error, setError] = useState(null);
    const [toasts, setToasts] = useState([]);
    const hasInitialized = useRef(false);

    const showToast = (message, type = 'error', duration = 4000) => {
        const id = Date.now() + Math.random();
        setToasts(prev => [...prev.slice(-MAX_TOAST_COUNT), { id, message, type, duration }]);
    };

    const dismissToast = (id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    // Navigation Wrapper (unchanged)
    const setCurrentPage = (pageId) => {
        if (pageId === currentPage) return;
        if (currentPage) setHistory(prev => [...prev, currentPage]);
        setCurrentPageState(pageId);
    };



    const goBack = () => {
        if (history.length === 0) return;
        const previousPageId = history[history.length - 1];
        setHistory(history.slice(0, -1));
        setCurrentPageState(previousPageId);
    };

    // Keep ref in sync with state so WebSocket callbacks always see current value
    useEffect(() => {
        isInteractingRef.current = isInteracting;
    }, [isInteracting]);

    // Safety mechanism: auto-release the interaction lock after a timeout
    useEffect(() => {
        if (!isInteracting) return;
        const safetyTimer = setTimeout(() => {
            setIsInteracting(false);
        }, INTERACTION_TIMEOUT_MS);
        return () => clearTimeout(safetyTimer);
    }, [isInteracting]);

    const loadDashboardData = async () => {
        setIsLoading(true);
        try {
            const [storedSettings, storedPages] = await Promise.all([
                storage.get('settings', 'config'),
                storage.get('pages')
            ]);

            const activeSettings = storedSettings || {};
            setSettings(activeSettings);
            setPages(storedPages || []);

            if (storedPages?.length > 0) {
                setCurrentPageState(storedPages[0].id);
            }
            setIsLoading(false);
            return activeSettings;
        } catch (e) {
            console.warn('loadDashboardData failed:', e);
            setIsLoading(false);
            return {};
        }
    };

    // Initial load effect
    useEffect(() => {
        if (hasInitialized.current) return;
        hasInitialized.current = true;

        const init = async () => {
            try {
                // Load settings & pages
                const [storedSettings, storedPages] = await Promise.all([
                    storage.get('settings', 'config'),
                    storage.get('pages')
                ]);

                const activeSettings = storedSettings || {};
                setSettings(activeSettings);
                setPages(storedPages || []);

                if (storedPages?.length > 0) {
                    setCurrentPageState(storedPages[0].id);
                }

                // Initialize Hub
                const hubType = activeSettings.hubType || 'homey';

                if (hubType === 'hass' && activeSettings.hassUrl && activeSettings.hassToken) {
                    try {
                        await hassAPI.connect(activeSettings.hassUrl, activeSettings.hassToken);
                        const entities = hassAPI.entities;
                        const hassDevices = groupEntitiesByDevice(entities, {
                            entityToDevice: hassAPI.entityToDevice,
                            deviceRegistry: hassAPI.deviceRegistry,
                            entityToArea: hassAPI.entityToArea
                        });
                        setDevices(hassDevices);
                        setIsAuthenticated(true);
                        setError(null);
                        
                        // Handle HA updates — use ref to avoid stale closure on isInteracting
                        hassAPI.onStateChanged = (newState) => {
                            if (isInteractingRef.current) return;
                            setDevices(prev => {
                                const entityId = newState.entity_id;
                                const deviceId = hassAPI.entityToDevice?.[entityId];
                                
                                let anyChanged = false;
                                const nextDevices = prev.map(d => {
                                    // 1. Standalone device update
                                    if (d.id === entityId) {
                                        anyChanged = true;
                                        return applyEntityUpdateToDevice(d, newState);
                                    }
                                    // 2. Composite device update (match by haDeviceId)
                                    if (deviceId && d.settings?.haDeviceId === deviceId) {
                                        anyChanged = true;
                                        return applyEntityUpdateToDevice(d, newState);
                                    }
                                    // 3. Waste composite update (standalone entities matched by prefix)
                                    if (d.settings?.compositeType === 'waste_collection' &&
                                        d.settings?.haPrefix &&
                                        entityId.split('.')[1]?.startsWith(d.settings.haPrefix)) {
                                        anyChanged = true;
                                        return applyEntityUpdateToDevice(d, newState);
                                    }
                                    // 4. Postal composite update (standalone entities matched by prefix)
                                    if (d.settings?.compositeType === 'postal' &&
                                        d.settings?.haPrefix &&
                                        entityId.split('.')[1]?.startsWith(d.settings.haPrefix)) {
                                        anyChanged = true;
                                        return applyEntityUpdateToDevice(d, newState);
                                    }
                                    return d;
                                });
                                
                                if (anyChanged) return nextDevices;

                                // Fallback: if it's a new entity not yet in our device list
                                const mapped = mapHassToHomey(newState, hassAPI.entityToArea);
                                if (!mapped) return prev;
                                
                                // Check if we already have it (safety)
                                const index = prev.findIndex(d => d.id === mapped.id);
                                if (index === -1) return [...prev, mapped];
                                
                                const newDevs = [...prev];
                                newDevs[index] = mapped;
                                return newDevs;
                            });
                        };

                        // Signal ready and handle bulk load
                        hassAPI.onReady = (entities) => {
                            const hassDevices = groupEntitiesByDevice(entities, {
                                entityToDevice: hassAPI.entityToDevice,
                                deviceRegistry: hassAPI.deviceRegistry,
                                entityToArea: hassAPI.entityToArea
                            });
                            setDevices(hassDevices);
                            setIsAuthenticated(true);
                        };

                        // If already loaded by the time we attach listener
                        if (hassAPI.initialDataLoaded) {
                            const entities = hassAPI.entities;
                            if (Object.keys(entities).length > 0) {
                                const hassDevices = groupEntitiesByDevice(entities, {
                                    entityToDevice: hassAPI.entityToDevice,
                                    deviceRegistry: hassAPI.deviceRegistry,
                                    entityToArea: hassAPI.entityToArea
                                });
                                setDevices(hassDevices);
                            }
                        }
                    } catch (e) {
                        console.error("Failed to connect to HA", e);
                        setError(e.message);
                        showToast(`Tilkobling til Home Assistant feilet: ${e.message}`, 'error', 8000);
                    }
                } else if (hubType === 'homey' && activeSettings.homeyIp && activeSettings.homeyToken) {
                    homeyAPI.configure(activeSettings.homeyIp, activeSettings.homeyToken);
                    homeyAPI.connectWebSocket();
                    homeyAPI.startPolling(3000);
                    try {
                        const devs = await homeyAPI.getDevices();
                        setDevices(devs);
                        const flws = await homeyAPI.getFlows();
                        setFlows(flws);
                        setError(null);
                    } catch (e) {
                        console.error("Failed to fetch Homey devices", e);
                        setError(e.message);
                    }
                }
            } catch (e) {
                console.error("Initialization error:", e);
                setError(e.message);
            } finally {
                setIsLoading(false);
            }
        };

        init();

        return () => {
            homeyAPI.disconnectWebSocket();
            homeyAPI.stopPolling();
            hassAPI.disconnect();
        };
    }, []);

    // Homey Event listeners
    useEffect(() => {
        if (settings.hubType !== 'homey') return;

        const handleUpdate = () => {
            if (!isInteracting) {
                setDevices(Array.from(homeyAPI.devices.values()));
            }
        };

        window.addEventListener('homey:devices:refreshed', handleUpdate);
        window.addEventListener('homey:device:update', handleUpdate);

        return () => {
            window.removeEventListener('homey:devices:refreshed', handleUpdate);
            window.removeEventListener('homey:device:update', handleUpdate);
        };
    }, [isInteracting, settings.hubType]);

    // Sync Homey devices when interaction ends (cheap in-memory read)
    // For HA, WebSocket onStateChanged handles updates as they arrive
    useEffect(() => {
        if (!isInteracting && settings.hubType !== 'hass') {
            setDevices(Array.from(homeyAPI.devices.values()));
        }
    }, [isInteracting, settings.hubType]);

    // Provide generic API interface
    const activeApi = settings.hubType === 'hass' ? {
        getDeviceType: (device) => {
            if (!device) return 'unknown';
            // Use the mapped class as the type
            return device.class || 'unknown';
        },
        getIconUrl: (device) => {
            if (!device) return null;
            // For HASS, icons are often Lucide components or handled by mapping
            return null; 
        },
        getDevice: async (id) => {
            return devices.find(d => d.id === id);
        },
        setCapability: async (deviceId, capabilityId, value) => {
            let targetEntityId = deviceId;

            // Handle composite devices
            if (deviceId.startsWith('composite:')) {
                const dev = devices.find(d => d.id === deviceId);
                if (dev && dev.capabilitiesObj[capabilityId]?.entity_id) {
                    targetEntityId = dev.capabilitiesObj[capabilityId].entity_id;
                } else if (dev && capabilityId === 'available_current_limit') {
                    // Bruk lagret entity_id fra composite-settings (satt av hub-mapper)
                    if (dev.settings?.availableCurrentEntityId) {
                        targetEntityId = dev.settings.availableCurrentEntityId;
                    } else {
                        // Fallback: finn number-entiteten direkte fra HA-enhetsregisteret
                        const match = Object.keys(hassAPI.entities).find(eid =>
                            eid.startsWith('number.') && eid.includes('circuit_available_current')
                        );
                        if (match) targetEntityId = match;
                    }
                } else if (dev && capabilityId.startsWith('vacuum_') && dev.settings?.vacuumEntityId) {
                    targetEntityId = dev.settings.vacuumEntityId;
                } else if (dev && capabilityId === 'lawn_mower_edge_cut' && dev.settings?.edgeCutEntityId) {
                    targetEntityId = dev.settings.edgeCutEntityId;
                } else if (dev && capabilityId === 'cutting_height' && dev.settings?.cuttingHeightEntityId) {
                    targetEntityId = dev.settings.cuttingHeightEntityId;
                } else if (dev && capabilityId.startsWith('lawn_mower_') && dev.settings?.lawnMowerEntityId) {
                    targetEntityId = dev.settings.lawnMowerEntityId;
                } else if (dev && capabilityId === 'rain_delay' && dev.settings?.rainDelayEntityId) {
                    targetEntityId = dev.settings.rainDelayEntityId;
                } else if (dev && capabilityId === 'button' && dev.ui?.components?.length > 0) {
                    const firstBtn = dev.ui.components.find(c => c.capability === 'button');
                    if (firstBtn) targetEntityId = firstBtn.entity_id;
                }
            }

            const entity = hassAPI.entities[targetEntityId];
            // Tillat vakuum- og gressklipper-kommandoer selv om entity ikke er i lokal cache
            const isVacuumCmd = capabilityId.startsWith('vacuum_') || capabilityId.startsWith('lawn_mower_');
            if (!entity && capabilityId !== 'available_current_limit' && capabilityId !== 'cutting_height' && !isVacuumCmd) return;
            const [domain] = targetEntityId.split('.');
            
            try {
                if (capabilityId === 'onoff' || domain === 'switch') {
                    await hassAPI.callService(domain, value ? 'turn_on' : 'turn_off', targetEntityId);
                } else if (capabilityId === 'button' || domain === 'button') {
                    await hassAPI.callService(domain, 'press', targetEntityId);
                } else if (capabilityId === 'dim') {
                    await hassAPI.callService(domain, 'turn_on', targetEntityId, { brightness: Math.round(value * 255) });
                } else if (capabilityId === 'light_temperature') {
                    const kelvin = 2000 + Math.round(value * 4500);
                    await hassAPI.callService('light', 'turn_on', targetEntityId, { color_temp_kelvin: kelvin });
                } else if (capabilityId === 'target_temperature') {
                    await hassAPI.callService('climate', 'set_temperature', targetEntityId, { temperature: value });
                } else if (capabilityId === 'thermostat_mode') {
                    await hassAPI.callService('climate', 'set_hvac_mode', targetEntityId, { hvac_mode: value });
                } else if (capabilityId === 'fan_mode') {
                    await hassAPI.callService('climate', 'set_fan_mode', targetEntityId, { fan_mode: value });
                } else if (capabilityId === 'swing_mode') {
                    await hassAPI.callService('climate', 'set_swing_mode', targetEntityId, { swing_mode: value });
                } else if (capabilityId === 'preset_mode') {
                    await hassAPI.callService('climate', 'set_preset_mode', targetEntityId, { preset_mode: value });
                } else if (capabilityId === 'windowcoverings_set') {
                    await hassAPI.callService('cover', 'set_cover_position', targetEntityId, { position: Math.round(value * 100) });
                } else if (capabilityId === 'available_current_limit' || domain === 'number') {
                    await hassAPI.callService('number', 'set_value', targetEntityId, { value: String(value) });
                } else if (domain === 'select') {
                    await hassAPI.callService('select', 'select_option', targetEntityId, { option: value });
                } else if (capabilityId === 'vacuum_start') {
                    await hassAPI.callService('vacuum', 'start', targetEntityId);
                } else if (capabilityId === 'vacuum_pause') {
                    await hassAPI.callService('vacuum', 'pause', targetEntityId);
                } else if (capabilityId === 'vacuum_stop') {
                    await hassAPI.callService('vacuum', 'stop', targetEntityId);
                } else if (capabilityId === 'vacuum_return_home') {
                    await hassAPI.callService('vacuum', 'return_to_base', targetEntityId);
                } else if (capabilityId === 'vacuum_fan_speed') {
                    await hassAPI.callService('vacuum', 'set_fan_speed', targetEntityId, { fan_speed: value });
                } else if (capabilityId === 'lawn_mower_start') {
                    await hassAPI.callService('lawn_mower', 'start_mowing', targetEntityId);
                } else if (capabilityId === 'lawn_mower_pause') {
                    await hassAPI.callService('lawn_mower', 'pause', targetEntityId);
                } else if (capabilityId === 'lawn_mower_dock') {
                    await hassAPI.callService('lawn_mower', 'dock', targetEntityId);
                }
            } catch (err) {
                console.error(`Failed to set HA capability ${capabilityId} for ${deviceId}`, err);
                showToast(`Kunne ikke sende kommando (${capabilityId})`, 'error');
            }
        },
        getInsightLogs: async () => {
            // Only include entities with a numeric state – these are meaningful in a graph
            const EXCLUDED_DOMAINS = new Set([
                'binary_sensor', 'switch', 'button', 'scene', 'automation', 'script',
                'light', 'media_player', 'camera', 'cover', 'fan', 'climate',
                'person', 'zone', 'sun', 'input_boolean', 'group', 'remote',
                'select', 'input_select', 'weather', 'alarm_control_panel',
                'device_tracker', 'input_text', 'text', 'todo', 'timer', 'counter'
            ]);

            const logs = [];
            for (const [entityId, entity] of Object.entries(hassAPI.entities)) {
                const domain = entityId.split('.')[0];
                if (EXCLUDED_DOMAINS.has(domain)) continue;
                const numericState = parseFloat(entity.state);
                if (isNaN(numericState)) continue;

                const area = hassAPI.entityToArea?.[entityId] || null;
                logs.push({
                    id: entityId,
                    name: entity.attributes?.friendly_name || entityId,
                    uri: 'hass',
                    area,
                    unit: entity.attributes?.unit_of_measurement || ''
                });
            }

            // Sort: area ascending (no area last), then name
            logs.sort((a, b) => {
                const aArea = a.area || 'Ø';
                const bArea = b.area || 'Ø';
                if (aArea !== bArea) return aArea.localeCompare(bArea, 'nb');
                return a.name.localeCompare(b.name, 'nb');
            });

            return logs;
        },
        getInsightLogEntries: async (uri, logId, start, end) => {
            // Check authentication before trying to fetch history to avoid race condition errors
            if (!hassAPI.isAuthenticated) {
                return [];
            }
            try {
                const historyData = await hassAPI.getHistory(logId, start, end);
                // historyData is { "entity_id": [ { "s": "val", "lu": timestamp }, ... ] }
                const entries = historyData[logId] || [];
                // Map HASS entries to Homey format { t: timestamp_ms, v: value }
                return entries.map(e => ({
                    t: e.lu * 1000, // HASS lu is in seconds
                    v: parseFloat(e.s)
                })).filter(e => !isNaN(e.v));
            } catch (err) {
                console.error(`Failed to fetch HASS history for ${logId}`, err);
                return [];
            }
        },
        formatLogLabel: (log) => {
            if (!log) return '';
            if (log.name) return log.name;
            // Fallback: use friendly_name from live entity cache
            const entity = hassAPI.entities[log.id];
            return entity?.attributes?.friendly_name || log.id || '';
        },
        // Convenience wrappers same as HomeyAPI for component compatibility
        setOnOff: async (deviceId, value) => {
            return activeApi.setCapability(deviceId, 'onoff', value);
        },
        setDim: async (deviceId, value) => {
            return activeApi.setCapability(deviceId, 'dim', value);
        },
        setTargetTemperature: async (deviceId, value) => {
            return activeApi.setCapability(deviceId, 'target_temperature', value);
        }
    } : homeyAPI;


    return (
        <HomeyContext.Provider value={{
            devices,
            flows,
            api: activeApi,
            isAuthenticated,
            isLoading,
            reloadData: loadDashboardData,
            settings,
            setSettings,
            pages,
            currentPage,
            setPages,
            setCurrentPage,
            isEditMode,
            setIsEditMode,
            isInteracting,
            setIsInteracting,
            toasts,
            showToast,
            dismissToast,
            addPage: async (name, icon, iframeUrl = '', pageType = 'tile') => {
                const newPage = { id: Date.now().toString(), name, icon, iframeUrl, pageType, tiles: [] };
                const newPages = [...pages, newPage];
                setPages(newPages);
                await storage.set('pages', newPages);
                setCurrentPage(newPage.id);
                return newPage;
            },
            deletePage: async (pageId) => {
                const newPages = pages.filter(p => p.id !== pageId);
                setPages(newPages);
                await storage.set('pages', newPages);
                await storage.delete('pages', pageId);
                if (currentPage === pageId && newPages.length > 0) {
                    setCurrentPage(newPages[0].id);
                } else if (newPages.length === 0) {
                    setCurrentPage(null);
                }
            },
            goBack,
            canGoBack: history.length > 0,
            updatePage: async (page) => {
                const newPages = pages.map(p => p.id === page.id ? { ...p, ...page } : p);
                setPages(newPages);
                await storage.set('pages', newPages);
            },
            reorderPages: async (newOrder) => {
                setPages(newOrder);
                await storage.set('pages', newOrder);
            }
        }}>
            {children}
        </HomeyContext.Provider>
    );
};

export const useHomey = () => useContext(HomeyContext);
