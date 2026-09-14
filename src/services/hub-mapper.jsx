import {
    Lightbulb,
    Thermometer,
    Power,
    ToggleLeft,
    Activity,
    HelpCircle,
    Flame,
    Snowflake,
    Wind,
    Droplets,
    Zap,
    MousePointer2,
    Lock,
    Unlock,
    Home,
    Eye,
    EyeOff,
    Battery,
    Sun,
    Cloud,
    CloudRain,
    CloudLightning,
    Wind as FanIcon,
    Volume2,
    AirVent,
    Shovel,
    Waves,
    ShieldCheck,
    Layout,
    Disc2,
    Scissors,
    WashingMachine,
    Trash2,
    Mail,
    Utensils,
    UserRound
} from 'lucide-react';

// Keywords identifying a "smart plug appliance" (dishwasher, dryer, ...) —
// devices that are just a power-measuring plug in HA but deserve their own tile.
// Checked BEFORE washer detection since 'dishwasher' contains 'washer' and
// 'oppvaskmaskin' contains 'vaskemaskin'.
export const isApplianceEntity = (entityId, friendlyName) => {
    const id = (entityId || '').toLowerCase();
    const fn = (friendlyName || '').toLowerCase();
    return id.includes('dishwasher') || fn.includes('oppvask') ||
           id.includes('tumble_dryer') || fn.includes('tørketrommel') || fn.includes('torketrommel');
};

const iconMap = {
    light: Lightbulb,
    climate: Thermometer,
    water_heater: Droplets,
    switch: Power,
    binary_sensor: ToggleLeft,
    sensor: Activity,
    fan: FanIcon,
    media_player: Volume2,
    input_boolean: ToggleLeft,
    remote: MousePointer2,
    lock: Lock,
    alarm_control_panel: ShieldCheck,
    cover: Layout,
    vacuum: Disc2,
    lawn_mower: Scissors,
    humidifier: Droplets,
    air_quality: AirVent,
    button: Activity,
    number: Activity,
    select: Activity,
    text: Activity,
    person: UserRound,
    sun: Sun,
    weather: Cloud
};

/**
 * Priority of a domain when picking the "primary" entity for a composite device.
 * Higher = more likely to be the main control entity.
 */
const DOMAIN_PRIORITY = {
    climate: 10,
    water_heater: 10,
    light: 9,
    switch: 8,
    input_boolean: 8,
    cover: 7,
    fan: 7,
    lock: 7,
    media_player: 6,
    vacuum: 6,
    lawn_mower: 6,
    humidifier: 5,
    alarm_control_panel: 5,
    number: 4,
    input_number: 4,
    select: 4,
    input_select: 4,
    sensor: 2,
    binary_sensor: 2,
    button: 1,
    text: 1,
};

/** Map a primary domain to the Homey-style device class used in tile detection. */
const DOMAIN_TO_CLASS = {
    climate: 'thermostat',
    water_heater: 'thermostat',
    light: 'light',
    switch: 'socket',
    input_boolean: 'socket',
    cover: 'sunshade',
    fan: 'fan',
    lock: 'lock',
    media_player: 'speaker',
    vacuum: 'vacuum',
    lawn_mower: 'lawn_mower',
    humidifier: 'sensor',
    sensor: 'sensor',
    binary_sensor: 'sensor',
};

// Add missing icons mapping via imports above

export const mapHassToHomey = (entity, areaMapping = {}) => {
    try {
        if (!entity || !entity.entity_id) {
            console.warn('⚠️ HA Mapper: Received invalid entity:', entity);
            return null;
        }

        const { entity_id, attributes = {}, state: value } = entity;
        const [domain, object_id] = entity_id.split('.');

        // Base object
        const device = {
            id: entity_id,
            entityId: entity_id,
            name: attributes.friendly_name || object_id || entity_id,
            zoneName: areaMapping[entity_id] || '',
            class: domain === 'light' ? 'light' :
                   domain === 'climate' ? 'thermostat' :
                   domain === 'switch' ? 'socket' :
                   domain === 'sensor' ? 'sensor' :
                   domain === 'binary_sensor' ? 'sensor' :
                   domain === 'cover' ? 'sunshade' :
                   domain === 'vacuum' ? 'vacuum' :
                   domain === 'lawn_mower' ? 'lawn_mower' :
                   domain === 'lock' ? 'lock' :
                   domain === 'fan' ? 'fan' :
                   domain === 'person' ? 'presence' :
                   domain === 'media_player' ? 'speaker' : domain,
            capabilities: [],
            capabilitiesObj: {},
            capabilitiesOptions: {},
            hubType: 'hass',
            isHA: true,
            attributes: attributes,
            state: value
        };

        // Washer/Laundry detection
        // NOTE: Do NOT match on 'laundry' alone — room names like 'laundry_room' would cause false positives
        // NOTE: Exclude appliances (dishwasher etc.) — 'dishwasher' contains 'washer'
        //       and 'oppvaskmaskin' contains 'vaskemaskin'.
        const isWasher = domain !== 'water_heater' &&
            !isApplianceEntity(entity_id, attributes.friendly_name) && (
            entity_id.includes('washer') ||
            (attributes.friendly_name && (
                attributes.friendly_name.toLowerCase().includes('washer') ||
                attributes.friendly_name.toLowerCase().includes('vaskemaskin')
            ))
        );

        if (isWasher) {
            device.class = 'vacuum'; // Fallback class that often maps to cleaning
        }

        // Helper to add capability
        const addCap = (id, val, units = null, type = 'number') => {
            if (!device.capabilities.includes(id)) device.capabilities.push(id);
            device.capabilitiesObj[id] = {
                id,
                value: val,
                units: units,
                type: type
            };
        };

        // Generic state mapping
        if (domain === 'light' || domain === 'switch' || domain === 'binary_sensor' || domain === 'input_boolean') {
            addCap('onoff', value === 'on', null, 'boolean');
        }

        // Domain specific mapping
        if (domain === 'light') {
            if (attributes.brightness !== undefined) {
                addCap('dim', attributes.brightness / 255);
            }
            if (attributes.color_temp_kelvin) {
                addCap('light_temperature', (attributes.color_temp_kelvin - 2000) / 4500);
            }
            if (attributes.rgb_color) {
                addCap('light_hue', 0);
                addCap('light_saturation', 1);
            }
        }

        if (domain === 'climate') {
            addCap('target_temperature', attributes.temperature || attributes.target_temp_high || 21);
            addCap('measure_temperature', attributes.current_temperature || 21);

            const mode = value; // In HA, state represents the current HVAC mode (heat, cool, off, etc.)
            addCap('thermostat_mode', mode, null, 'string');

            // Still track the action as an attribute for display if needed
            if (attributes.hvac_action) {
                addCap('thermostat_state', attributes.hvac_action, null, 'string');
            }

            if (attributes.hvac_modes) {
                device.capabilitiesOptions['thermostat_mode'] = {
                    values: attributes.hvac_modes.map(m => ({
                        id: m,
                        title: m.charAt(0).toUpperCase() + m.slice(1)
                    }))
                };
            }

            // Map Climate Attributes to Capabilities for Selection in Dashboard
            if (attributes.fan_mode) {
                addCap('fan_mode', attributes.fan_mode, null, 'string');
                if (attributes.fan_modes) {
                    device.capabilitiesOptions['fan_mode'] = {
                        values: attributes.fan_modes.map(m => ({
                            id: m,
                            title: m.charAt(0).toUpperCase() + m.slice(1)
                        }))
                    };
                }
            }

            if (attributes.swing_mode) {
                addCap('swing_mode', attributes.swing_mode, null, 'string');
                if (attributes.swing_modes) {
                    device.capabilitiesOptions['swing_mode'] = {
                        values: attributes.swing_modes.map(m => ({
                            id: m,
                            title: m.charAt(0).toUpperCase() + m.slice(1)
                        }))
                    };
                }
            }

            // preset_mode kan være null når pumpa er av – capability skal likevel finnes
            if (attributes.preset_mode != null || attributes.preset_modes?.length) {
                addCap('preset_mode', attributes.preset_mode ?? 'none', null, 'string');
                if (attributes.preset_modes) {
                    device.capabilitiesOptions['preset_mode'] = {
                        values: attributes.preset_modes.map(m => ({
                            id: m,
                            title: m.charAt(0).toUpperCase() + m.slice(1)
                        }))
                    };
                }
            }
        }

        // Water heater – same capability structure as climate
        if (domain === 'water_heater') {
            device.class = 'thermostat';
            // Marker capability so Tile.jsx can detect water heater regardless of composite/standalone
            addCap('homey_water_heater', true, null, 'boolean');
            addCap('target_temperature', attributes.temperature ?? attributes.target_temp_high ?? 60);
            if (attributes.current_temperature !== undefined) {
                addCap('measure_temperature', attributes.current_temperature);
            }
            addCap('thermostat_mode', value, null, 'string'); // state = operation mode
            if (attributes.operation_list) {
                device.capabilitiesOptions['thermostat_mode'] = {
                    values: attributes.operation_list.map(m => ({
                        id: m,
                        title: m.charAt(0).toUpperCase() + m.slice(1)
                    }))
                };
            }
        }

        else if (domain === 'select' || domain === 'input_select' || domain === 'number' || domain === 'input_number') {
            // Support for HASS select/input_select or controllable numbers
            const capId = (domain.includes('select')) ? 'select' : 'number';
            addCap(capId, value, attributes.unit_of_measurement, 'string');
            
            if (attributes.options) {
                device.capabilitiesObj[capId].values = attributes.options.map(opt => ({
                    id: opt,
                    title: opt
                }));
            } else if (attributes.min !== undefined && attributes.max !== undefined) {
                // For numbers with small range, create options for a dropdown
                const range = attributes.max - attributes.min;
                const step = attributes.step || 1;
                if (range <= 10 && step >= 0.1) {
                    const vals = [];
                    for (let n = attributes.min; n <= attributes.max; n += step) {
                        const v = Math.round(n * 10) / 10;
                        vals.push({ id: String(v), title: String(v) });
                    }
                    device.capabilitiesObj[capId].values = vals;
                }
            }
        } else if (domain === 'sensor' || domain === 'binary_sensor') {
            const deviceClass = attributes.device_class;
            const unit = attributes.unit_of_measurement;
            const lowerId = entity_id.toLowerCase();
            
            // Standard sensors
            if (deviceClass === 'temperature' || unit?.includes('°C') || unit?.includes('°F')) {
                addCap('measure_temperature', parseFloat(value), unit || '°C');
            } else if (deviceClass === 'humidity' || unit === '%') {
                addCap('measure_humidity', parseFloat(value), '%');
            } else if (deviceClass === 'battery' || unit === '%' || unit === '%_battery') {
                addCap('measure_battery', parseInt(value), '%');
            } else if (deviceClass === 'power' || unit === 'W' || unit === 'kW') {
                const val = unit === 'kW' ? parseFloat(value) * 1000 : parseFloat(value);
                addCap('measure_power', val, 'W');
            } else if (deviceClass === 'energy' || unit === 'kWh') {
                addCap('measure_cumulative_energy', parseFloat(value), 'kWh');
            } else if (deviceClass === 'motion') {
                addCap('alarm_motion', value === 'on', null, 'boolean');
            } else if (deviceClass === 'door' || deviceClass === 'window' || deviceClass === 'opening' || deviceClass === 'garage_door') {
                addCap('alarm_contact', value === 'on', null, 'boolean');
            } else if (deviceClass === 'moisture') {
                addCap('alarm_water', value === 'on', null, 'boolean');
            } else if (deviceClass === 'smoke') {
                addCap('alarm_smoke', value === 'on', null, 'boolean');
            } else if (deviceClass === 'duration' || lowerId.includes('remaining_time') || lowerId.includes('countdown')) {
                // Map duration/remaining time sensors to Homey's meter_remaining_time
                addCap('meter_remaining_time', parseFloat(value) || 0, unit || 'min');
            } else if (unit) {
                // Fallback for any sensor with a unit
                addCap('measure_generic', parseFloat(value), unit);
            } else {
                // Fallback for binary sensors without class
                if (domain === 'binary_sensor') {
                    addCap('alarm_generic', value === 'on', null, 'boolean');
                } else {
                    // Just show the raw value as a generic measure
                    addCap('measure_generic', value);
                }
            }
        }

        // Lock support
        if (domain === 'lock') {
            addCap('locked', value === 'locked', null, 'boolean');
        }

        // Fan support
        if (domain === 'fan') {
            addCap('onoff', value === 'on', null, 'boolean');
            if (attributes.percentage !== undefined) {
                addCap('dim', attributes.percentage / 100);
            }
        }

        if (domain === 'cover') {
            addCap('windowcoverings_set', attributes.current_position ? attributes.current_position / 100 : (value === 'open' ? 1 : 0));
        }

        if (domain === 'vacuum') {
            addCap('homey_vacuum', true, null, 'boolean'); // marker for type detection
            addCap('vacuum_state', value, null, 'string');
            if (attributes.fan_speed !== undefined) {
                addCap('vacuum_fan_speed', attributes.fan_speed, null, 'string');
                if (attributes.fan_speed_list) {
                    device.capabilitiesOptions['vacuum_fan_speed'] = {
                        values: attributes.fan_speed_list.map(s => ({
                            id: s,
                            title: s.charAt(0).toUpperCase() + s.slice(1)
                        }))
                    };
                }
            }
        }

        if (domain === 'lawn_mower') {
            addCap('homey_lawn_mower', true, null, 'boolean'); // marker
            addCap('lawn_mower_state', value, null, 'string');
            if (attributes.activity !== undefined) {
                addCap('lawn_mower_activity', attributes.activity, null, 'string');
            }
        }

        // Person / presence support (state = 'home', 'not_home' or a zone name like 'Jobb')
        if (domain === 'person') {
            addCap('person_presence', value, null, 'string');
            if (attributes.entity_picture) device.entityPicture = attributes.entity_picture;
        }

        // Add laundry capability for detection in Tile.jsx
        if (isWasher) {
            addCap('laundry', true, null, 'boolean');
        }

        // Lucide Icon Component
        const LucideIcon = isWasher ? WashingMachine : (iconMap[domain] || HelpCircle);
        device.lucideIconName = domain;
        device.LucideIcon = LucideIcon; 

        return device;
    } catch (err) {
        console.error('❌ HA Mapper Error for entity:', entity?.entity_id, err);
        return null;
    }
};

/**
 * Apply a state update to an existing device (either standalone or composite).
 * Returns a new device object if changed, or the same object if unrelated.
 */
export const applyEntityUpdateToDevice = (device, entityState) => {
    if (!device || !entityState) return device;

    const eid = entityState.entity_id;
    const lowerId = eid.toLowerCase();
    const value = entityState.state;
    const attr = entityState.attributes;
    const [domain] = eid.split('.');

    // 1. standalone device update
    if (device.entityId === eid) {
        // Full remap for standalone to ensure all logic in mapHassToHomey is used
        const refreshed = mapHassToHomey(entityState, { [eid]: device.zoneName });
        if (!refreshed) return device;
        // Merge with existing to preserve any UI-side decorations if any
        return { ...device, ...refreshed };
    }

    // 2. composite device update
    if (device.settings?.isComposite) {
        const updatedDevice = {
            ...device,
            capabilitiesObj: { ...device.capabilitiesObj },
            capabilities: [...device.capabilities],
            capabilitiesOptions: { ...(device.capabilitiesOptions || {}) }
        };

        const obj = eid.split('.')[1] || ''; // object_id of the incoming entity

        const addCap = (id, val, units = null, type = 'number') => {
            if (!updatedDevice.capabilities.includes(id)) updatedDevice.capabilities.push(id);
            updatedDevice.capabilitiesObj[id] = { id, value: val, units, type, entity_id: eid };
        };

        // --- Water heater-specific mapping ---
        if (device.settings.compositeType === 'water_heater' ||
            device.capabilities.includes('homey_water_heater')) {

            if (domain === 'sensor') {
                const val = parseFloat(value);
                if (obj.endsWith('_temperature') && !obj.includes('target') && !obj.includes('setpoint') && !obj.includes('hysteresis') && !obj.includes('offset')) {
                    addCap('measure_temperature', val, '°C');
                } else if (obj.endsWith('_fill_level')) {
                    addCap('fill_level', isNaN(val) ? 0 : val, '%');
                } else if (obj.endsWith('_energy_stored')) {
                    addCap('energy_in_tank', isNaN(val) ? 0 : val, 'kWh');
                } else if (obj.endsWith('_power') && !obj.includes('element') && !obj.includes('estimated')) {
                    addCap('measure_power', isNaN(val) ? 0 : val, 'W');
                } else if (obj.endsWith('_power_estimated')) {
                    addCap('power_estimated', isNaN(val) ? 0 : val, 'W');
                } else if (obj.endsWith('_energy_total')) {
                    addCap('meter_power', isNaN(val) ? 0 : val, 'kWh');
                } else if (obj.endsWith('_energy_daily')) {
                    addCap('energy_daily', isNaN(val) ? 0 : val, 'kWh');
                } else if (obj.endsWith('_energy_monthly')) {
                    addCap('energy_monthly', isNaN(val) ? 0 : val, 'kWh');
                } else if (obj.endsWith('_energy_yesterday')) {
                    addCap('energy_yesterday', isNaN(val) ? 0 : val, 'kWh');
                }
            } else if (domain === 'binary_sensor') {
                if (obj.endsWith('_element_1_status')) addCap('element_1_active', value === 'on', null, 'boolean');
                else if (obj.endsWith('_element_2_status')) addCap('element_2_active', value === 'on', null, 'boolean');
            } else if (domain === 'switch') {
                if (obj.endsWith('_boost')) addCap('boost', value === 'on', null, 'boolean');
                // skip beta_status and other non-essential switches
            } else if (domain === 'number') {
                const val = parseFloat(value);
                if (obj.endsWith('_setpoint')) addCap('target_temperature', isNaN(val) ? 0 : val, '°C');
            } else if (domain === 'select') {
                if (obj.endsWith('_program_selection')) {
                    addCap('program_selection', value, null, 'string');
                    if (attr.options) {
                        updatedDevice.capabilitiesOptions['program_selection'] = {
                            values: attr.options.map(o => ({ id: o, title: o }))
                        };
                    }
                } else if (obj.endsWith('_power_mode')) {
                    addCap('power_mode', value, null, 'string');
                    if (attr.options) {
                        updatedDevice.capabilitiesOptions['power_mode'] = {
                            values: attr.options.map(o => ({ id: o, title: o }))
                        };
                    }
                } else if (obj.endsWith('_zone_mode')) {
                    addCap('zone_mode', value, null, 'string');
                }
            }
            return updatedDevice;
        }

        // --- EV charger-specific mapping ---
        if (device.settings.compositeType === 'ev_charger' ||
            device.capabilities.includes('homey_ev_charger')) {
            if (domain === 'sensor') {
                const val = parseFloat(value);
                if (obj.endsWith('_mode')) {
                    addCap('charge_mode', value, null, 'string');
                } else if (obj.endsWith('_power') && !obj.includes('allocated')) {
                    addCap('measure_power', isNaN(val) ? 0 : val, 'W');
                } else if (obj.endsWith('_session_energy')) {
                    addCap('meter_power.current_session', isNaN(val) ? 0 : val, 'kWh');
                } else if (obj.endsWith('_energy_meter')) {
                    addCap('meter_power', isNaN(val) ? 0 : val, 'kWh');
                } else if (obj.endsWith('_completed_session_energy')) {
                    addCap('meter_power.last_session', isNaN(val) ? 0 : val, 'kWh');
                } else if (obj.endsWith('_current_phase1')) {
                    addCap('measure_current.phase1', isNaN(val) ? 0 : val, 'A');
                } else if (obj.endsWith('_current_phase2')) {
                    addCap('measure_current.phase2', isNaN(val) ? 0 : val, 'A');
                } else if (obj.endsWith('_current_phase3')) {
                    addCap('measure_current.phase3', isNaN(val) ? 0 : val, 'A');
                } else if (obj.endsWith('_internal_temp')) {
                    addCap('measure_temperature', isNaN(val) ? 0 : val, '°C');
                } else if (obj.endsWith('_energy_daily')) {
                    addCap('energy_daily', isNaN(val) ? 0 : val, 'kWh');
                } else if (obj.endsWith('_energy_monthly')) {
                    addCap('energy_monthly', isNaN(val) ? 0 : val, 'kWh');
                } else if (obj.endsWith('_cost_current')) {
                    addCap('cost_current', isNaN(val) ? 0 : val, 'kr/h');
                } else if (obj.endsWith('_cost_daily')) {
                    addCap('cost_daily', isNaN(val) ? 0 : val, 'kr');
                } else if (obj.endsWith('_cost_monthly')) {
                    addCap('cost_monthly', isNaN(val) ? 0 : val, 'kr');
                } else if (obj.endsWith('_allocated_current')) {
                    addCap('allocated_current', isNaN(val) ? 0 : val, 'A');
                }
            } else if (domain === 'binary_sensor') {
                if (obj.endsWith('_status') && attr.device_class === 'connectivity') {
                    addCap('alarm_generic.car_connected', value === 'on', null, 'boolean');
                } else if (obj.endsWith('_online')) {
                    addCap('online', value === 'on', null, 'boolean');
                }
            } else if (domain === 'switch') {
                if (obj.endsWith('_cable_lock')) {
                    addCap('cable_permanent_lock', value === 'on', null, 'boolean');
                } else if (obj === 'outdoor_car_charger' || obj === 'ev_charger') {
                    addCap('charging_button', value === 'on', null, 'boolean');
                }
            } else if (domain === 'number') {
                const val = parseFloat(value);
                if (obj.endsWith('_circuit_available_current')) {
                    addCap('available_current_limit', isNaN(val) ? 0 : val, 'A');
                    // Store entity_id directly so HomeyContext can always find it
                    updatedDevice.settings = { ...updatedDevice.settings, availableCurrentEntityId: eid };
                }
            }
            return updatedDevice;
        }

        // --- Postal (Posten) specific mapping ---
        if (device.settings.compositeType === 'postal') {
            const obj = eid.split('.')[1] || '';

            if (domain === 'binary_sensor') {
                // binary_sensor.global_posten → delivery today
                addCap('posten_today', value === 'on', null, 'boolean');
                // Ensure marker capability is present
                if (!updatedDevice.capabilities.includes('posten_sensor'))
                    updatedDevice.capabilities.push('posten_sensor');
            } else if (domain === 'sensor') {
                if (obj.endsWith('_next_relative')) {
                    // "I dag", "I morgen", "Om 3 dager", etc. — marker + display text
                    addCap('posten_sensor', value, null, 'string');
                } else if (obj.endsWith('_next')) {
                    // ISO date of next delivery: "2026-04-17"
                    addCap('posten_next_date', value, null, 'string');
                } else if (obj.endsWith('_calendar')) {
                    // Python list string: "['2026-04-17', '2026-04-21', ...]"
                    addCap('posten_calendar', value, null, 'string');
                }
            }
            return updatedDevice;
        }

        // --- Waste collection-specific mapping ---
        if (device.settings.compositeType === 'waste_collection') {
            // Fraction sensor: has fraction_name attribute
            if (attr?.fraction_name) {
                const capId = 'waste_' + attr.fraction_name
                    .toLowerCase()
                    .replace(/[^a-z0-9æøå]/g, '_')
                    .replace(/_+/g, '_')
                    .replace(/^_|_$/g, '');
                if (!updatedDevice.capabilities.includes(capId)) updatedDevice.capabilities.push(capId);
                updatedDevice.capabilitiesObj[capId] = {
                    id: capId,
                    value,
                    title: attr.fraction_name,
                    days_until: attr.days_until,
                    next_collection: attr.next_collection,
                    entity_picture: attr.entity_picture,
                    entity_id: eid,
                    type: 'string',
                };
            }
            // Summary sensor: has days_until + next_collection_date but no fraction_name
            else if (attr?.days_until !== undefined && attr?.next_collection_date) {
                if (!updatedDevice.capabilities.includes('waste_next_pickup_days'))
                    updatedDevice.capabilities.push('waste_next_pickup_days');
                updatedDevice.capabilitiesObj['waste_next_pickup_days'] = {
                    id: 'waste_next_pickup_days',
                    value: String(attr.days_until),
                    fractions: value,             // e.g. "Matavfall og Papir"
                    collection_date: attr.next_collection_date,
                    entity_id: eid,
                    type: 'string',
                };
            }
            return updatedDevice;
        }

        // --- Smart plug appliance mapping (dishwasher, tumble dryer, ...) ---
        // The appliance is just a power-measuring plug in HA; the tile derives
        // run state from the power curve. Suffixes match the Z-wave outlet's
        // sensors (power/energy) plus the cost package sensors.
        if (device.settings.compositeType === 'appliance' ||
            device.capabilities.includes('smart_plug_appliance')) {
            if (domain === 'sensor') {
                const val = parseFloat(value);
                if (obj.endsWith('_power') && !obj.includes('cost')) {
                    addCap('measure_power', isNaN(val) ? 0 : val, 'W');
                } else if (obj.endsWith('_voltage')) {
                    addCap('measure_voltage', isNaN(val) ? 0 : val, 'V');
                } else if (obj.endsWith('_current')) {
                    addCap('measure_current', isNaN(val) ? 0 : val, 'A');
                } else if (obj.endsWith('_energy_monthly')) {
                    addCap('energy_monthly', isNaN(val) ? 0 : val, 'kWh');
                } else if (obj.endsWith('_energy_prev_month')) {
                    addCap('energy_prev_month', isNaN(val) ? 0 : val, 'kWh');
                } else if (obj.endsWith('_energy_ytd')) {
                    addCap('energy_ytd', isNaN(val) ? 0 : val, 'kWh');
                } else if (obj.endsWith('_total_cost_monthly')) {
                    addCap('cost_monthly', isNaN(val) ? 0 : val, 'kr');
                } else if (obj.endsWith('_total_cost_prev_month')) {
                    addCap('cost_prev_month', isNaN(val) ? 0 : val, 'kr');
                } else if (obj.endsWith('_total_cost_ytd')) {
                    addCap('cost_ytd', isNaN(val) ? 0 : val, 'kr');
                // Electrolux-integrasjonen (maskinens egen sky-API) — native syklusdata.
                // washdata_*-navnene er historiske (fra den fjernede ha_washdata-
                // integrasjonen) og brukes videre som internt capability-vokabular.
                } else if (obj.endsWith('_appliance_state')) {
                    // "Running"/"Paused"/"Delayed Start"/"End Of Cycle"/... → washdata-vokabular.
                    // Ukjente/inaktive stater passerer lowercaset gjennom — de står ikke i
                    // WASH_STATE_LABELS og flisen faller da tilbake til effektbasert status.
                    const norm = String(value).toLowerCase().replace(/[^a-z]/g, '');
                    const stateMap = { running: 'running', paused: 'paused', delayedstart: 'delay_wait' };
                    addCap('appliance_native', true, null, 'boolean');
                    addCap('washdata_state', stateMap[norm] || norm, null, 'string');
                } else if (obj.endsWith('_cycle_phase')) {
                    addCap('washdata_phase', value, null, 'string');
                } else if (obj.endsWith('_time_to_end')) {
                    // Sekunder i HA → minutter i flisen
                    addCap('washdata_time_remaining', isNaN(val) ? null : Math.round(val / 60), 'min');
                } else if (obj.endsWith('_total_cycle_counter')) {
                    addCap('washdata_cycle_count', isNaN(val) ? null : val, null);
                } else if (obj.endsWith('_alerts')) {
                    // Salt/glansemiddel-varsler ligger som attributter på alerts-sensoren
                    const alertOn = (v) => typeof v === 'string' && v !== 'OFF' && !v.includes('NOT_NEEDED');
                    addCap('alarm_rinse_aid', alertOn(attr.DISH_ALARM_RINSE_AID_LOW), null, 'boolean');
                    addCap('alarm_salt', alertOn(attr.DISH_ALARM_SALT_MISSING), null, 'boolean');
                }
            } else if (domain === 'switch') {
                // Electrolux-programvalg-brytere (extra_dry, glass_care, ...) er IKKE
                // stikkontakten — de skal ikke overskrive onoff.
                const optionSwitches = ['_auto_door_opener', '_extra_dry', '_extra_power', '_extra_silent',
                    '_glass_care', '_key_tone', '_one_rack', '_sanitize', '_spray_zone', '_zone_clean'];
                if (!optionSwitches.some(s => obj.endsWith(s))) {
                    addCap('onoff', value === 'on', null, 'boolean');
                }
            } else if (domain === 'select') {
                if (obj.endsWith('_program_uid')) addCap('appliance_program', value, null, 'string');
            } else if (domain === 'binary_sensor') {
                if (obj.endsWith('_overload')) addCap('alarm_generic', value === 'on', null, 'boolean');
                else if (obj.endsWith('_door_state')) addCap('appliance_door', value === 'on', null, 'boolean');
                else if (obj.endsWith('_connectivity_state')) addCap('online', value === 'on', null, 'boolean');
            }
            return updatedDevice;
        }

        // --- Washer-specific mapping (keyword-based) ---
        if (device.settings.compositeType === 'washer' ||
            device.lucideIconName === 'washing-machine' ||
            device.capabilities.includes('laundry')) {
            const isRelated = lowerId.includes('washer') || lowerId.includes('laundry') ||
                (attr.friendly_name && (
                    attr.friendly_name.toLowerCase().includes('washer') ||
                    attr.friendly_name.toLowerCase().includes('vaskemaskin')
                ));
            if (isRelated) {
                if (domain === 'binary_sensor') {
                    // Tomt-varsler: binary_sensor.*_detergent / *_softener ("Vaskemiddel tomt"/"Tøymykner tomt")
                    if (lowerId.includes('detergent')) {
                        addCap('alarm_detergent', value === 'on', null, 'boolean');
                        updatedDevice.capabilitiesObj['alarm_detergent'].title = 'Vaskemiddel';
                    } else if (lowerId.includes('softener')) {
                        addCap('alarm_softener', value === 'on', null, 'boolean');
                        updatedDevice.capabilitiesObj['alarm_softener'].title = 'Tøymykner';
                    }
                    return updatedDevice;
                }
                if (lowerId.includes('status') || lowerId.includes('state')) addCap('operational_state', value, null, 'string');
                if (lowerId.includes('program')) addCap('laundry_washer_program', value, null, 'string');
                // Countdown (phase timer) and remaining_time (total program time) are different sensors –
                // map to separate capabilities so they don't overwrite each other.
                if (lowerId.includes('countdown'))
                    addCap('meter_countdown', parseFloat(value) || 0, attr.unit_of_measurement || 'min');
                else if (lowerId.includes('remaining') || attr.device_class === 'duration')
                    addCap('meter_remaining_time', parseFloat(value) || 0, attr.unit_of_measurement || 'min');
                if (lowerId.includes('power')) addCap('measure_power', parseFloat(value) || 0, 'W');
                if (lowerId.includes('temp')) addCap('laundry_washer_temperature', value, null, 'string');
                if (lowerId.includes('spin') || lowerId.includes('speed')) addCap('laundry_washer_speed', value, null, 'string');
                if (lowerId.includes('mode')) addCap('laundry_washer_mode', value, null, 'string');
            }
            return updatedDevice;
        }

        // --- Vacuum-specific mapping ---
        if (device.settings.compositeType === 'vacuum' ||
            device.capabilities.includes('homey_vacuum')) {
            if (domain === 'vacuum') {
                addCap('homey_vacuum', true, null, 'boolean');
                addCap('vacuum_state', value, null, 'string');
                if (attr.fan_speed !== undefined) {
                    addCap('vacuum_fan_speed', attr.fan_speed, null, 'string');
                    if (attr.fan_speed_list) {
                        updatedDevice.capabilitiesOptions['vacuum_fan_speed'] = {
                            values: attr.fan_speed_list.map(s => ({
                                id: s,
                                title: s.charAt(0).toUpperCase() + s.slice(1)
                            }))
                        };
                    }
                }
                updatedDevice.settings = { ...updatedDevice.settings, vacuumEntityId: eid };
            } else if (domain === 'sensor') {
                const val = parseFloat(value);
                if (obj.endsWith('_operational_status')) {
                    addCap('vacuum_state', value, null, 'string');
                } else if (obj.endsWith('_battery') && attr.device_class === 'battery') {
                    addCap('measure_battery', isNaN(val) ? 0 : val, '%');
                } else if (obj.endsWith('_cleaning_area_sqm') && !obj.includes('total')) {
                    addCap('cleaning_area', isNaN(val) ? 0 : val, 'm²');
                } else if (obj.endsWith('_cleaning_time_minutes') && !obj.includes('total')) {
                    addCap('cleaning_time', isNaN(val) ? 0 : val, 'min');
                } else if (obj.endsWith('_current_room_location')) {
                    addCap('current_room', value, null, 'string');
                } else if (obj.endsWith('_last_error_code')) {
                    addCap('vacuum_error', value, null, 'string');
                } else if (obj.endsWith('_main_brush_remaining_hours')) {
                    addCap('brush_life_main', isNaN(val) ? 0 : Math.round(val), 'h');
                } else if (obj.endsWith('_side_brush_remaining_hours')) {
                    addCap('brush_life_side', isNaN(val) ? 0 : Math.round(val), 'h');
                } else if (obj.endsWith('_filter_remaining_hours')) {
                    addCap('filter_life', isNaN(val) ? 0 : Math.round(val), 'h');
                } else if (obj.endsWith('_sensors_remaining_hours')) {
                    addCap('sensor_life', isNaN(val) ? 0 : Math.round(val), 'h');
                } else if (obj.includes('_total_cleaning_time_hours')) {
                    addCap('total_cleaning_time', isNaN(val) ? 0 : Math.round(val), 'h');
                } else if (obj.includes('_total_cleans_count')) {
                    addCap('total_cleans_count', isNaN(val) ? 0 : Math.round(val), '');
                } else if (obj.includes('_total_cleaning_area')) {
                    addCap('total_cleaning_area', isNaN(val) ? 0 : Math.round(val), 'm²');
                } else if (obj.endsWith('_last_clean_start_timestamp_utc') || obj.endsWith('_last_clean_start_timestamp')) {
                    addCap('last_clean_start', value, null, 'string');
                } else if (obj.endsWith('_last_clean_end_timestamp_utc') || obj.endsWith('_last_clean_end_timestamp')) {
                    addCap('last_clean_end', value, null, 'string');
                }
            } else if (domain === 'binary_sensor') {
                if (obj.endsWith('_mop_attached')) addCap('mop_attached', value === 'on', null, 'boolean');
                else if (obj.endsWith('_water_box_attached')) addCap('water_tank_attached', value === 'on', null, 'boolean');
                else if (obj.endsWith('_water_shortage')) addCap('alarm_water', value === 'on', null, 'boolean');
            } else if (domain === 'select') {
                if (obj.endsWith('_mop_intensity_level')) {
                    addCap('mop_intensity', value, null, 'string');
                    if (attr.options) {
                        updatedDevice.capabilitiesOptions['mop_intensity'] = {
                            values: attr.options.map(o => ({ id: o, title: o }))
                        };
                    }
                } else if (obj.endsWith('_mop_mode_type')) {
                    addCap('mop_mode', value, null, 'string');
                    if (attr.options) {
                        updatedDevice.capabilitiesOptions['mop_mode'] = {
                            values: attr.options.map(o => ({ id: o, title: o }))
                        };
                    }
                } else if (obj.endsWith('_selected_map_name')) {
                    addCap('selected_map', value, null, 'string');
                    if (attr.options) {
                        updatedDevice.capabilitiesOptions['selected_map'] = {
                            values: attr.options.map(o => ({ id: o, title: o }))
                        };
                    }
                }
            } else if (domain === 'number') {
                const val = parseFloat(value);
                if (obj.endsWith('_volume_level')) {
                    addCap('vacuum_volume', isNaN(val) ? 0 : val, '%');
                }
            } else if (domain === 'switch') {
                if (obj.endsWith('_dnd_toggle')) {
                    addCap('vacuum_dnd', value === 'on', null, 'boolean');
                }
            } else if (domain === 'image') {
                // Room/floor map images: store as {friendlyName: entityPicture} dict
                const friendlyName = attr?.friendly_name || obj;
                const entityPicture = attr?.entity_picture;
                if (entityPicture) {
                    const existing = { ...(updatedDevice.capabilitiesObj['map_image_urls']?.value || {}) };
                    existing[friendlyName] = entityPicture;
                    if (!updatedDevice.capabilities.includes('map_image_urls'))
                        updatedDevice.capabilities.push('map_image_urls');
                    updatedDevice.capabilitiesObj['map_image_urls'] = {
                        id: 'map_image_urls', value: existing, units: null, type: 'object', entity_id: eid
                    };
                }
            }
            return updatedDevice;
        }

        // --- Lawn mower-specific mapping ---
        if (device.settings.compositeType === 'lawn_mower' ||
            device.capabilities.includes('homey_lawn_mower')) {
            // Talls-sensorer lagrer null (ikke 0) ved unknown/unavailable så flisen kan skjule dem
            const numOrNull = (v) => {
                if (v === 'unknown' || v === 'unavailable') return null;
                const n = parseFloat(v);
                return isNaN(n) ? null : n;
            };
            if (domain === 'lawn_mower') {
                addCap('homey_lawn_mower', true, null, 'boolean');
                addCap('lawn_mower_state', value, null, 'string');
                updatedDevice.settings = { ...updatedDevice.settings, lawnMowerEntityId: eid };
            } else if (domain === 'sensor') {
                const val = parseFloat(value);
                if (obj.endsWith('_battery') && attr.device_class === 'battery') {
                    addCap('measure_battery', isNaN(val) ? 0 : val, '%');
                    // Worx: lade-status ligger som attributt på batterisensoren
                    if (attr.charging !== undefined) addCap('lawn_mower_charging', attr.charging === true, null, 'boolean');
                } else if (obj.endsWith('_status') && Array.isArray(attr.options) && attr.options.includes('mowing')) {
                    // Worx: detaljert status-enum (mowing/edge_cutting/charging/going_home/...)
                    // options-sjekken skiller den fra f.eks. *_maintenance_status
                    addCap('lawn_mower_status', value, null, 'string');
                } else if (obj.endsWith('_maintenance_status')) {
                    // Worx: ok / blade_service_due / battery_service_due. Terskelen for
                    // knivbytte (satt i integrasjonen) ligger som attributt i minutter.
                    addCap('lawn_mower_maintenance', value, null, 'string');
                    if (attr.blade_service_threshold_minutes != null) {
                        addCap('lawn_mower_blade_threshold', numOrNull(attr.blade_service_threshold_minutes), 'min');
                    }
                } else if (obj.endsWith('_blade_runtime_current')) {
                    // Knivtid siden siste nullstilling (button.*_reset_blade_runtime)
                    addCap('lawn_mower_blade_current', numOrNull(value), attr.unit_of_measurement || 'min');
                } else if (obj.endsWith('_blade_runtime_reset_time')) {
                    addCap('lawn_mower_blade_reset_time', value, null, 'string');
                } else if (obj.endsWith('_error') || obj.endsWith('_error_code')) {
                    addCap('lawn_mower_error', value, null, 'string');
                } else if (obj.endsWith('_total_worktime') || obj.endsWith('_mower_runtime_total')) {
                    addCap('lawn_mower_total_time', numOrNull(value), attr.unit_of_measurement || 'h');
                } else if (obj.endsWith('_next_start') || obj.endsWith('_next_schedule')) {
                    addCap('lawn_mower_next_start', value, null, 'string');
                } else if (obj.endsWith('_blades_total_time') || obj.endsWith('_blade_runtime_total')) {
                    addCap('lawn_mower_blade_time', numOrNull(value), attr.unit_of_measurement || 'h');
                } else if (obj.endsWith('_distance_driven')) {
                    addCap('lawn_mower_distance', isNaN(val) ? 0 : Math.round(val), 'm');
                } else if (obj.endsWith('_rain_remaining')) {
                    addCap('lawn_mower_rain_remaining', numOrNull(value), 'min');
                } else if (obj.endsWith('_estimated_daily_progress')) {
                    // NB: sjekkes FØR _daily_progress (endsWith matcher begge)
                    addCap('lawn_mower_progress_est', numOrNull(value), '%');
                } else if (obj.endsWith('_daily_progress')) {
                    addCap('lawn_mower_progress', numOrNull(value), '%');
                } else if (obj.endsWith('_estimated_area_mowed_today')) {
                    addCap('lawn_mower_area_today_est', numOrNull(value), 'm²');
                } else if (obj.endsWith('_area_mowed_today')) {
                    addCap('lawn_mower_area_today', numOrNull(value), 'm²');
                } else if (obj.endsWith('_mowing_time_today')) {
                    addCap('lawn_mower_time_today', numOrNull(value), 'min');
                } else if (obj.endsWith('_lawn_area')) {
                    addCap('lawn_mower_lawn_area', numOrNull(value), 'm²');
                }
            } else if (domain === 'binary_sensor') {
                if (obj.endsWith('_charging')) addCap('lawn_mower_charging', value === 'on', null, 'boolean');
                else if (obj.endsWith('_online')) addCap('online', value === 'on', null, 'boolean');
                else if (obj.endsWith('_rain_sensor') || obj.endsWith('_rain_triggered')) addCap('lawn_mower_rain', value === 'on', null, 'boolean');
                else if (obj.endsWith('_robot_lifted')) addCap('lawn_mower_lifted', value === 'on', null, 'boolean');
            } else if (domain === 'number') {
                const val = parseFloat(value);
                if (obj.endsWith('_rain_delay')) {
                    addCap('rain_delay', isNaN(val) ? 0 : val, attr.unit_of_measurement || 'h');
                    updatedDevice.settings = { ...updatedDevice.settings, rainDelayEntityId: eid };
                } else if (obj.endsWith('_cutting_height')) {
                    addCap('cutting_height', numOrNull(value), attr.unit_of_measurement || 'mm');
                    if (attr.min != null) {
                        updatedDevice.capabilitiesOptions['cutting_height'] = {
                            min: attr.min, max: attr.max, step: attr.step || 1
                        };
                    }
                    updatedDevice.settings = { ...updatedDevice.settings, cuttingHeightEntityId: eid };
                }
            } else if (domain === 'button') {
                if (obj.endsWith('_start_edge_cutting')) {
                    addCap('lawn_mower_edge_cut', true, null, 'boolean');
                    updatedDevice.settings = { ...updatedDevice.settings, edgeCutEntityId: eid };
                } else if (obj.endsWith('_reset_blade_runtime')) {
                    // Nullstill knivteller etter knivbytte (brukes av knivbytte-popupen)
                    addCap('lawn_mower_reset_blades', true, null, 'boolean');
                    updatedDevice.settings = { ...updatedDevice.settings, resetBladesEntityId: eid };
                }
            } else if (domain === 'camera') {
                // Worx RTK-kart: entity_picture er en camera_proxy-URL med access token
                if (obj.endsWith('_map') && attr.entity_picture) {
                    addCap('lawn_mower_map_url', attr.entity_picture, null, 'string');
                }
            }
            return updatedDevice;
        }

        // --- Irrigation valve mapping (SONOFF SWV-ZF2, Zigbee2MQTT) ---
        // To kanaler: switch.*_1 / switch.*_2 → valve_1 / valve_2. Objekt-sensorene
        // (manual_default_settings, irrigation_schedule_status_N) lagres av HA som
        // Python-dict-streng kuttet ved 255 tegn (alfabetisk nøkkelrekkefølge) —
        // feltene vi trenger ligger tidlig nok til å overleve kuttet.
        if (device.settings.compositeType === 'irrigation' ||
            device.capabilities.includes('homey_irrigation')) {
            const numOrNull = (v) => {
                if (v === 'unknown' || v === 'unavailable' || v == null || v === '') return null;
                const n = parseFloat(v);
                return isNaN(n) ? null : n;
            };
            const dictField = (str, key) => {
                const m = String(str ?? '').match(new RegExp(`'${key}': '?([^',}]*)'?`));
                return m ? m[1] : null;
            };
            const chan = (re) => { const m = obj.match(re); return m ? m[1] : null; };
            let n;
            if (domain === 'switch') {
                if (obj.endsWith('_child_lock')) {
                    addCap('child_lock', value === 'on', null, 'boolean');
                } else if ((n = chan(/_(\d)$/))) {
                    addCap(`valve_${n}`, value === 'on', null, 'boolean');
                }
            } else if (domain === 'sensor') {
                if (obj.endsWith('_battery')) {
                    addCap('measure_battery', numOrNull(value) ?? 0, '%');
                } else if ((n = chan(/_real_time_irrigation_duration_(\d)$/))) {
                    addCap(`valve_${n}_duration`, numOrNull(value), 'min');
                } else if (obj.endsWith('_real_time_irrigation_volume')) {
                    addCap('irrigation_volume', numOrNull(value), attr.unit_of_measurement || 'L');
                } else if ((n = chan(/_hour_irrigation_duration_(\d)$/))) {
                    addCap(`valve_${n}_hour_duration`, numOrNull(value), 'min');
                } else if (obj.endsWith('_hour_irrigation_volume')) {
                    addCap('irrigation_hour_volume', numOrNull(value), attr.unit_of_measurement || 'L');
                } else if (obj.endsWith('_valve_abnormal_state')) {
                    addCap('valve_alarm', value, null, 'string');
                } else if (obj.endsWith('_manual_default_settings')) {
                    addCap('manual_duration', numOrNull(dictField(value, 'irrigation_duration')), 'min');
                    addCap('manual_mode', dictField(value, 'irrigation_mode') || 'duration', null, 'string');
                    addCap('manual_amount', numOrNull(dictField(value, 'irrigation_amount')), 'L');
                } else if ((n = chan(/_irrigation_schedule_status_(\d)$/))) {
                    addCap(`valve_${n}_expected_end`, dictField(value, 'expected_end_time') || '', null, 'string');
                    addCap(`valve_${n}_actual_end`, dictField(value, 'actual_end_time') || '', null, 'string');
                } else if (obj.endsWith('_rain_delay_end_datetime')) {
                    addCap('rain_delay_end', value, null, 'string');
                }
            }
            // Øvrige entiteter (planer, historikk, sesongjustering, oppdatering) ignoreres
            return updatedDevice;
        }

        // --- Climate composite-specific mapping ---
        // Handles climate entities and their associated sensors/switches.
        // Critical: outdoor temperature sensors must NOT overwrite measure_temperature (indoor).
        if (device.settings.compositeType === 'climate') {
            if (domain === 'climate') {
                if (attr.current_temperature != null)
                    addCap('measure_temperature', attr.current_temperature, '°C');
                addCap('target_temperature', attr.temperature ?? 21, '°C');
                addCap('thermostat_mode', value, null, 'string');
                if (attr.hvac_action) addCap('thermostat_state', attr.hvac_action, null, 'string');
                if (attr.hvac_modes) {
                    updatedDevice.capabilitiesOptions['thermostat_mode'] = {
                        values: attr.hvac_modes.map(m => ({ id: m, title: m.charAt(0).toUpperCase() + m.slice(1) }))
                    };
                }
                if (attr.fan_mode) {
                    addCap('fan_mode', attr.fan_mode, null, 'string');
                    if (attr.fan_modes) updatedDevice.capabilitiesOptions['fan_mode'] = { values: attr.fan_modes.map(m => ({ id: m, title: m.charAt(0).toUpperCase() + m.slice(1) })) };
                }
                if (attr.swing_mode) {
                    addCap('swing_mode', attr.swing_mode, null, 'string');
                    if (attr.swing_modes) updatedDevice.capabilitiesOptions['swing_mode'] = { values: attr.swing_modes.map(m => ({ id: m, title: m.charAt(0).toUpperCase() + m.slice(1) })) };
                }
                if (attr.preset_mode != null || attr.preset_modes?.length) {
                    addCap('preset_mode', attr.preset_mode ?? 'none', null, 'string');
                    if (attr.preset_modes) updatedDevice.capabilitiesOptions['preset_mode'] = { values: attr.preset_modes.map(m => ({ id: m, title: m.charAt(0).toUpperCase() + m.slice(1) })) };
                }
            } else if (domain === 'switch') {
                addCap('onoff', value === 'on', null, 'boolean');
            } else if (domain === 'button' && obj.endsWith('_display_toggle')) {
                // Puls-knapp (IR-sending) for å slå displayet på pumpa av/på.
                // HA vet ikke om displayet faktisk er på — verdien er kun sist-trykket-tidspunkt.
                addCap('display_toggle', value, null, 'button');
            } else if (domain === 'sensor') {
                const val = parseFloat(value);
                if (obj.includes('outdoor_temp') || obj.endsWith('_outdoor_temperature')) {
                    addCap('measure_temperature.outdoor', isNaN(val) ? 0 : val, '°C');
                } else if (obj.includes('indoor_temp') || obj.endsWith('_indoor_temperature')) {
                    addCap('measure_temperature', isNaN(val) ? 0 : val, '°C');
                } else if (attr.device_class === 'power' || attr.unit_of_measurement === 'W') {
                    addCap('measure_power', isNaN(val) ? 0 : val, 'W');
                } else if (obj.endsWith('_energy_daily')) {
                    addCap('energy_daily', isNaN(val) ? 0 : val, 'kWh');
                } else if (obj.endsWith('_energy_monthly')) {
                    addCap('energy_monthly', isNaN(val) ? 0 : val, 'kWh');
                } else if (obj.endsWith('_energy_total') || obj.endsWith('_total_energy')) {
                    addCap('meter_power', isNaN(val) ? 0 : val, 'kWh');
                } else if (attr.device_class === 'humidity') {
                    addCap('measure_humidity', isNaN(val) ? 0 : val, '%');
                } else if (attr.device_class === 'monetary') {
                    if (obj.endsWith('_cost_current')) addCap('cost_current', isNaN(val) ? 0 : val, 'kr/h');
                    else if (obj.endsWith('_cost_daily')) addCap('cost_daily', isNaN(val) ? 0 : val, 'kr');
                    else if (obj.endsWith('_cost_monthly')) addCap('cost_monthly', isNaN(val) ? 0 : val, 'kr');
                    else if (obj.endsWith('_cost_total')) addCap('cost_total', isNaN(val) ? 0 : val, 'kr');
                }
            }
            return updatedDevice;
        }

        // --- Generic composite: re-map the entity using the standard mapper,
        //     then merge all its capabilities into the composite. ---
        const mappedEntity = mapHassToHomey(entityState, { [eid]: device.zoneName });
        if (mappedEntity) {
            mappedEntity.capabilities.forEach(capId => {
                const capObj = mappedEntity.capabilitiesObj[capId];
                if (!updatedDevice.capabilities.includes(capId)) updatedDevice.capabilities.push(capId);
                updatedDevice.capabilitiesObj[capId] = { ...capObj, entity_id: eid };
            });
            // Merge capabilitiesOptions (enum values etc.)
            Object.keys(mappedEntity.capabilitiesOptions || {}).forEach(capId => {
                updatedDevice.capabilitiesOptions[capId] = mappedEntity.capabilitiesOptions[capId];
            });
        }

        return updatedDevice;
    }

    return device;
};

/**
 * Advanced Mapper: Groups entities by physical device to create composite Homey-like devices.
 *
 * For every HA physical device that has more than one entity AND at least one
 * "control-domain" entity (priority >= 4), a composite device is created that
 * merges all entity capabilities.  Individual entity devices are still added to
 * the list so that existing tiles continue to work.
 */
export const groupEntitiesByDevice = (entities, apiData = {}) => {
    const { entityToDevice = {}, deviceRegistry = [], entityToArea = {} } = apiData;

    // 1. Bucket entities by HA physical device ID
    const deviceGroups = {};
    const standaloneEntities = [];

    Object.values(entities).forEach(entity => {
        const deviceId = entityToDevice[entity.entity_id];
        if (deviceId) {
            if (!deviceGroups[deviceId]) deviceGroups[deviceId] = [];
            deviceGroups[deviceId].push(entity);
        } else {
            standaloneEntities.push(entity);
        }
    });

    // 1b. Move standalone vacuum/lawn_mower entities into the matching device group
    // by prefix-matching their object_id against entities already in device groups.
    // This handles cases where entityToDevice is missing the main vacuum/lawn_mower entity.
    const remainingStandalone = [];
    standaloneEntities.forEach(entity => {
        const domain = entity.entity_id.split('.')[0];
        if (domain !== 'vacuum' && domain !== 'lawn_mower') {
            remainingStandalone.push(entity);
            return;
        }
        const obj = entity.entity_id.split('.')[1] || ''; // e.g. 'living_room_vacuum'
        const prefix = obj + '_'; // e.g. 'living_room_vacuum_'
        const matchingDeviceId = Object.keys(deviceGroups).find(deviceId =>
            deviceGroups[deviceId].some(e => (e.entity_id.split('.')[1] || '').startsWith(prefix))
        );
        if (matchingDeviceId) {
            deviceGroups[matchingDeviceId].push(entity);
        } else {
            remainingStandalone.push(entity);
        }
    });
    standaloneEntities.length = 0;
    remainingStandalone.forEach(e => standaloneEntities.push(e));

    const resultDevices = [];

    // 2. Process each physical device group
    Object.keys(deviceGroups).forEach(deviceId => {
        const deviceEntities = deviceGroups[deviceId];
        const haDevice = deviceRegistry.find(d => d.id === deviceId);

        // Single-entity groups — add as standalone only, no composite needed
        if (deviceEntities.length < 2) {
            const mapped = mapHassToHomey(deviceEntities[0], entityToArea[deviceEntities[0].entity_id]);
            if (mapped) resultDevices.push(mapped);
            return;
        }

        // --- Determine the "primary" entity (highest-priority domain) ---
        const sorted = [...deviceEntities].sort((a, b) => {
            const da = a.entity_id.split('.')[0];
            const db = b.entity_id.split('.')[0];
            return (DOMAIN_PRIORITY[db] ?? 0) - (DOMAIN_PRIORITY[da] ?? 0);
        });
        const primaryEntity = sorted[0];
        const primaryDomain = primaryEntity.entity_id.split('.')[0];
        const primaryPriority = DOMAIN_PRIORITY[primaryDomain] ?? 0;

        // --- Postal (Posten) detection ---
        // Must run BEFORE the priority guard since all posten entities are sensors (priority 2)
        const isPostal = deviceEntities.some(e =>
            e.attributes?.integration === 'posten' &&
            ['sensor', 'binary_sensor'].includes(e.entity_id.split('.')[0])
        );

        // Determine whether a composite will be created for this group
        const willCreateComposite = primaryPriority >= 4 || isPostal;

        // Always expose individual entities so existing tiles still work.
        // Mark them as part of a composite so the "Add Tile" picker can hide duplicates.
        deviceEntities.forEach(entity => {
            const mapped = mapHassToHomey(entity, entityToArea[entity.entity_id]);
            if (mapped) {
                if (willCreateComposite) mapped._inComposite = true;
                resultDevices.push(mapped);
            }
        });

        // Skip if the highest-priority entity is purely auxiliary (sensor-only devices),
        // unless it's a known sensor-only composite type like postal.
        if (!willCreateComposite) return;

        // --- Smart plug appliance detection (dishwasher, tumble dryer, ...) ---
        // Must run BEFORE washer detection: 'dishwasher' contains 'washer' and
        // 'oppvaskmaskin' contains 'vaskemaskin', so these would otherwise be
        // misdetected as washing machines.
        const isAppliance = deviceEntities.some(e =>
            isApplianceEntity(e.entity_id, e.attributes.friendly_name)
        );

        // --- Washer detection (special composite type) ---
        // NOTE: Do NOT match on 'laundry' alone — room names like 'laundry_room' cause false positives
        const isWasher = !isAppliance && primaryDomain !== 'water_heater' && deviceEntities.some(e =>
            e.entity_id.includes('washer') ||
            (e.attributes.friendly_name && (
                e.attributes.friendly_name.toLowerCase().includes('washer') ||
                e.attributes.friendly_name.toLowerCase().includes('vaskemaskin')
            ))
        );

        // --- Water heater detection ---
        // Matches devices whose entities all contain 'water_heater' in the object_id,
        // even when no formal water_heater domain entity exists (e.g. NIBE, Ariston integrations)
        const isWaterHeater = !isWasher && (
            primaryDomain === 'water_heater' ||
            deviceEntities.every(e => e.entity_id.split('.')[1]?.includes('water_heater'))
        );

        // --- EV charger detection ---
        // Matches devices where at least one entity contains 'car_charger' or 'ev_charger' in the object_id
        const isEVCharger = !isWasher && !isWaterHeater && deviceEntities.some(e => {
            const obj = e.entity_id.split('.')[1] || '';
            return obj.includes('car_charger') || obj.includes('ev_charger');
        });

        // --- Irrigation valve detection (SONOFF SWV-ZF2 via Zigbee2MQTT) ---
        // Kjennetegn: sensor.*_irrigation_schedule_status_N (per kanal)
        const isIrrigation = !isWasher && !isWaterHeater && !isEVCharger && deviceEntities.some(e =>
            (e.entity_id.split('.')[1] || '').includes('irrigation_schedule_status')
        );

        // --- Build the composite ---
        const compositeId = `composite:${deviceId}`;
        const areaKey = entityToArea[primaryEntity.entity_id];
        const deviceName = haDevice
            ? (haDevice.name_by_user || haDevice.name)
            : (primaryEntity.attributes.friendly_name || primaryDomain);

        // Also match if any entity in the group has vacuum/lawn_mower domain
        // (handles cases where the main entity wasn't in entityToDevice but was merged by prefix-matching)
        const isVacuum = !isAppliance && !isWasher && !isWaterHeater && !isEVCharger && !isPostal &&
            (primaryDomain === 'vacuum' || deviceEntities.some(e => e.entity_id.split('.')[0] === 'vacuum'));
        const isLawnMower = !isAppliance && !isWasher && !isWaterHeater && !isEVCharger && !isPostal && !isVacuum &&
            (primaryDomain === 'lawn_mower' || deviceEntities.some(e => e.entity_id.split('.')[0] === 'lawn_mower'));

        // Appliance kind (drives default name/icon in the tile)
        const applianceKind = !isAppliance ? null :
            deviceEntities.some(e => (e.entity_id.split('.')[1] || '').includes('dishwasher') ||
                (e.attributes.friendly_name || '').toLowerCase().includes('oppvask')) ? 'dishwasher' : 'dryer';

        let composite = {
            id: compositeId,
            name: isPostal ? 'Post' : isAppliance ? (applianceKind === 'dishwasher' ? 'Oppvaskmaskin' : 'Tørketrommel') : deviceName,
            class: isAppliance ? 'socket' : isWasher ? 'vacuum' : isEVCharger ? 'socket' : isPostal ? 'sensor' : isIrrigation ? 'irrigation' : isVacuum ? 'vacuum' : isLawnMower ? 'lawn_mower' : (DOMAIN_TO_CLASS[primaryDomain] ?? primaryDomain),
            capabilities: isAppliance ? ['smart_plug_appliance'] : isWasher ? ['laundry'] : isWaterHeater ? ['homey_water_heater'] : isEVCharger ? ['homey_ev_charger'] : isPostal ? ['posten_sensor'] : isIrrigation ? ['homey_irrigation'] : isVacuum ? ['homey_vacuum'] : isLawnMower ? ['homey_lawn_mower'] : [],
            capabilitiesObj: {},
            capabilitiesOptions: {},
            ui: { components: [] },
            lucideIconName: isAppliance ? 'utensils' : isWasher ? 'washing-machine' : isEVCharger ? 'zap' : isPostal ? 'mail' : isIrrigation ? 'droplets' : isVacuum ? 'disc-2' : isLawnMower ? 'scissors' : primaryDomain,
            LucideIcon: isAppliance ? Utensils : isWasher ? WashingMachine : isEVCharger ? Zap : isPostal ? Mail : isIrrigation ? Droplets : isVacuum ? Disc2 : isLawnMower ? Scissors : (iconMap[primaryDomain] ?? HelpCircle),
            zoneName: areaKey || '',
            hubType: 'hass',
            isHA: true,
            // Stabile nøkler for selvhelbredende oppslag (resolveTileDevice):
            // entity-ID-er overlever at HA gir enheten ny device registry-UUID.
            entityIds: deviceEntities.map(e => e.entity_id),
            primaryEntityId: primaryEntity.entity_id,
            settings: {
                isComposite: true,
                haDeviceId: deviceId,
                compositeType: isAppliance ? 'appliance' : isWasher ? 'washer' : isWaterHeater ? 'water_heater' : isEVCharger ? 'ev_charger' : isPostal ? 'postal' : isIrrigation ? 'irrigation' : isVacuum ? 'vacuum' : isLawnMower ? 'lawn_mower' : primaryDomain,
                ...(isAppliance ? { applianceKind } : {}),
            }
        };

        // Merge all entity capabilities into the composite
        deviceEntities.forEach(e => {
            composite = applyEntityUpdateToDevice(composite, e);

            // Track interactive entities as UI components
            const domain = e.entity_id.split('.')[0];
            if (['button', 'switch', 'input_boolean', 'select', 'input_select', 'number', 'input_number'].includes(domain)) {
                composite.ui.components.push({
                    id: `cap:${e.entity_id}`,
                    capability: domain === 'button' ? 'button' : domain,
                    entity_id: e.entity_id,
                    title: e.attributes.friendly_name || e.entity_id
                });
            }
        });

        resultDevices.push(composite);
    });

    // 3. Add standalone entities (not linked to any HA physical device)

    // Detect postal (Posten) entities — integration='posten', sensor/binary_sensor domains only
    const postalEntities = standaloneEntities.filter(e =>
        e.attributes?.integration === 'posten' &&
        ['sensor', 'binary_sensor'].includes(e.entity_id.split('.')[0])
    );
    const postalEntityIds = new Set(postalEntities.map(e => e.entity_id));

    // First, detect waste collection fraction sensors and group them into virtual composites.
    const wasteEntities = standaloneEntities.filter(e =>
        e.attributes?.fraction_name != null && !postalEntityIds.has(e.entity_id)
    );
    const summaryEntities = standaloneEntities.filter(e =>
        e.attributes?.days_until !== undefined &&
        e.attributes?.next_collection_date !== undefined &&
        e.attributes?.fraction_name == null &&
        !postalEntityIds.has(e.entity_id)
    );
    const otherStandalone = standaloneEntities.filter(e =>
        e.attributes?.fraction_name == null &&
        !(e.attributes?.days_until !== undefined && e.attributes?.next_collection_date !== undefined) &&
        !postalEntityIds.has(e.entity_id)
    );

    if (wasteEntities.length > 0) {
        // Group fraction sensors by common entity_id prefix
        // e.g. sensor.global_waste_collection_food → prefix "global_waste_collection"
        // Strategy: find longest prefix shared by all waste entities in this batch.
        // Simple approach: strip the last underscore-segment from each entity's object_id,
        // then group by that key. Works even for multi-segment suffixes like "glass_metal"
        // by using fraction_name uniqueness instead of suffix stripping.
        const prefixGroups = {};
        wasteEntities.forEach(e => {
            const obj = e.entity_id.split('.')[1] || '';
            // Build prefix key: object_id without the last segment (after last underscore)
            // This gives "global_waste_collection" for "global_waste_collection_food"
            // and "global_waste_collection_glass" for "global_waste_collection_glass_metal"
            // – not ideal; instead, we match fraction entities to summary sensors by prefix.
            // Use a broader key: everything up to the 3rd underscore segment as a stable prefix.
            const parts = obj.split('_');
            // Find the last segment where prefix still appears across all entities:
            // fallback to everything before the last 2 parts if entity has 4+ parts,
            // otherwise use everything before the last part.
            const prefixParts = parts.length >= 4 ? parts.slice(0, -1) : parts.slice(0, -1);
            // We need a stable key even for "glass_metal". Since all fraction sensors
            // share the same integration prefix, find the best common prefix by checking
            // which summary entity_id starts with each candidate prefix.
            // Simple heuristic: use all parts except the last one as groupKey.
            // This gives "global_waste_collection_glass" for "glass_metal" – still unique enough.
            const groupKey = prefixParts.join('_');
            if (!prefixGroups[groupKey]) prefixGroups[groupKey] = [];
            prefixGroups[groupKey].push(e);
        });

        // Consolidate: if multiple prefix groups exist, merge them into one per "root prefix".
        // The root prefix is everything before the last waste-type segment.
        // For simplicity, just merge all waste entities into one composite unless they
        // clearly belong to different integrations (different first 3 segments).
        const rootGroups = {};
        Object.entries(prefixGroups).forEach(([key, ents]) => {
            // Root = first three underscore-segments (e.g. "global_waste_collection")
            const rootKey = key.split('_').slice(0, 3).join('_');
            if (!rootGroups[rootKey]) rootGroups[rootKey] = [];
            rootGroups[rootKey].push(...ents);
        });

        Object.entries(rootGroups).forEach(([rootPrefix, fractionEntities]) => {
            // Find matching summary sensor (has days_until + next_collection_date)
            const matchingSummary = summaryEntities.find(e =>
                e.entity_id.split('.')[1]?.startsWith(rootPrefix)
            );

            const firstEntity = fractionEntities[0];
            const areaKey = entityToArea[firstEntity.entity_id] || '';

            let wasteComposite = {
                id: `composite:waste:${rootPrefix}`,
                name: 'Renovasjon',
                class: 'sensor',
                capabilities: ['waste_collection'],
                capabilitiesObj: {},
                capabilitiesOptions: {},
                ui: { components: [] },
                lucideIconName: 'trash',
                LucideIcon: Trash2,
                zoneName: areaKey,
                hubType: 'hass',
                isHA: true,
                settings: {
                    isComposite: true,
                    compositeType: 'waste_collection',
                    haPrefix: rootPrefix,
                }
            };

            // Apply each fraction entity
            fractionEntities.forEach(e => {
                wasteComposite = applyEntityUpdateToDevice(wasteComposite, e);
            });

            // Apply summary sensor if found
            if (matchingSummary) {
                wasteComposite = applyEntityUpdateToDevice(wasteComposite, matchingSummary);
            }

            resultDevices.push(wasteComposite);

            // Also add individual fraction entities as standalone sensors
            fractionEntities.forEach(e => {
                const mapped = mapHassToHomey(e, entityToArea[e.entity_id]);
                if (mapped) resultDevices.push(mapped);
            });
            if (matchingSummary) {
                const mapped = mapHassToHomey(matchingSummary, entityToArea[matchingSummary.entity_id]);
                if (mapped) resultDevices.push(mapped);
            }
        });

        // Summary entities not matched to any fraction group → add as standalone
        summaryEntities.forEach(e => {
            const alreadyHandled = Object.keys(rootGroups).some(rp =>
                e.entity_id.split('.')[1]?.startsWith(rp)
            );
            if (!alreadyHandled) {
                const mapped = mapHassToHomey(e, entityToArea[e.entity_id]);
                if (mapped) resultDevices.push(mapped);
            }
        });
    } else {
        // No waste entities – add summary sensors as regular standalone
        summaryEntities.forEach(e => {
            const mapped = mapHassToHomey(e, entityToArea[e.entity_id]);
            if (mapped) resultDevices.push(mapped);
        });
    }

    // 3b. Group postal entities into one virtual composite per integration prefix
    if (postalEntities.length > 0) {
        // Group by the shared prefix of the object_id.
        // For "global_posten_next" and "global_posten_calendar" the prefix is "global_posten".
        // Strategy: find the shortest object_id among all postal entities – that is the prefix.
        const prefixGroups = {};
        postalEntities.forEach(e => {
            const obj = e.entity_id.split('.')[1] || '';
            // Use first two underscore-segments as the stable prefix key ("global_posten")
            const prefixKey = obj.split('_').slice(0, 2).join('_');
            if (!prefixGroups[prefixKey]) prefixGroups[prefixKey] = [];
            prefixGroups[prefixKey].push(e);
        });

        Object.entries(prefixGroups).forEach(([prefix, entities]) => {
            const firstEntity = entities[0];
            const areaKey = entityToArea[firstEntity.entity_id] || '';

            let postalComposite = {
                id: `composite:postal:${prefix}`,
                name: 'Post',
                class: 'sensor',
                capabilities: ['posten_sensor'],
                capabilitiesObj: {},
                capabilitiesOptions: {},
                ui: { components: [] },
                lucideIconName: 'mail',
                LucideIcon: Mail,
                zoneName: areaKey,
                hubType: 'hass',
                isHA: true,
                settings: {
                    isComposite: true,
                    compositeType: 'postal',
                    haPrefix: prefix,
                }
            };

            entities.forEach(e => {
                postalComposite = applyEntityUpdateToDevice(postalComposite, e);
            });

            resultDevices.push(postalComposite);

            // Also add individual entities as standalone (for existing tiles)
            entities.forEach(e => {
                const mapped = mapHassToHomey(e, entityToArea[e.entity_id]);
                if (mapped) resultDevices.push(mapped);
            });
        });
    }

    otherStandalone.forEach(entity => {
        const mapped = mapHassToHomey(entity, entityToArea[entity.entity_id]);
        if (mapped) resultDevices.push(mapped);
    });

    return resultDevices;
};
