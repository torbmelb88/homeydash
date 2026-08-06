// Demodata for demo-modus: et syntetisk «hjem» uttrykt som Home Assistant-entiteter.
// Entitetene kjøres gjennom den ordinære hub-mapper-pipelinen (groupEntitiesByDevice),
// så demoen tester nøyaktig samme kode som en ekte HA-tilkobling.
//
// Datoavhengige verdier (renovasjon, post, robotklipperens neste start) beregnes
// relativt til dagens dato slik at demoen aldri «råtner».

const pad = (n) => String(n).padStart(2, '0');

const isoDate = (daysAhead) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const isoTomorrowAt = (hour) => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
};

const E = (entity_id, state, attributes = {}) => ({
    entity_id,
    state: String(state),
    attributes,
    last_updated: new Date().toISOString(),
});

const baseUrl = import.meta.env.BASE_URL || '/';

export const buildDemoWorld = () => {
    const list = [
        // ── Lys (standalone) ─────────────────────────────────────────────
        E('light.stue_taklys', 'on', { friendly_name: 'Taklys stue', brightness: 200, color_temp_kelvin: 3200 }),
        E('light.stue_gulvlampe', 'off', { friendly_name: 'Gulvlampe', brightness: null }),
        E('light.kjokken_benkelys', 'on', { friendly_name: 'Benkelys', brightness: 255 }),

        // ── Klima (standalone) ───────────────────────────────────────────
        E('climate.stue_varmepumpe', 'heat', {
            friendly_name: 'Varmepumpe',
            temperature: 22, current_temperature: 21.6,
            hvac_modes: ['heat', 'cool', 'fan_only', 'off'], hvac_action: 'heating',
            fan_mode: 'auto', fan_modes: ['auto', 'low', 'medium', 'high'],
        }),
        E('climate.soverom_panelovn', 'heat', {
            friendly_name: 'Panelovn soverom',
            temperature: 17, current_temperature: 17.4,
            hvac_modes: ['heat', 'off'], hvac_action: 'idle',
        }),

        // ── Sensorer (standalone) ────────────────────────────────────────
        E('sensor.ute_temperatur', '13.4', { friendly_name: 'Ute', device_class: 'temperature', unit_of_measurement: '°C' }),
        E('sensor.stue_fuktighet', '42', { friendly_name: 'Luftfuktighet stue', device_class: 'humidity', unit_of_measurement: '%' }),
        E('sensor.strommaler_effekt', '2450', { friendly_name: 'Strømmåler', device_class: 'power', unit_of_measurement: 'W' }),
        E('binary_sensor.entre_bevegelse', 'off', { friendly_name: 'Bevegelse entré', device_class: 'motion' }),

        // ── Markise (standalone) ─────────────────────────────────────────
        E('cover.stue_markise', 'open', { friendly_name: 'Markise', current_position: 65 }),

        // ── Personer (standalone) ────────────────────────────────────────
        E('person.emma', 'home', { friendly_name: 'Emma', entity_picture: `${baseUrl}demo/avatar-emma.svg` }),
        E('person.jonas', 'not_home', { friendly_name: 'Jonas', entity_picture: `${baseUrl}demo/avatar-jonas.svg` }),

        // ── Vaskemaskin (composite: demo-washer) ─────────────────────────
        // NB: switch-entiteten trengs for at groupEntitiesByDevice skal lage en
        // composite (sensor-only-grupper med prioritet < 4 hoppes over).
        E('switch.washer_remote_start', 'off', { friendly_name: 'Vaskemaskin fjernstart' }),
        E('sensor.washer_status', 'washing', { friendly_name: 'Vaskemaskin status' }),
        E('sensor.washer_program', 'Bomull 60°', { friendly_name: 'Vaskemaskin program' }),
        E('sensor.washer_remaining_time', '42', { friendly_name: 'Vaskemaskin tid igjen', device_class: 'duration', unit_of_measurement: 'min' }),
        E('sensor.washer_power', '1840', { friendly_name: 'Vaskemaskin effekt', device_class: 'power', unit_of_measurement: 'W' }),
        E('sensor.washer_temperature_setting', '60°', { friendly_name: 'Vaskemaskin temperatur' }),
        E('sensor.washer_spin_speed', '1400 o/min', { friendly_name: 'Vaskemaskin sentrifugering' }),
        E('binary_sensor.washer_detergent', 'off', { friendly_name: 'Vaskemiddel' }),
        E('binary_sensor.washer_softener', 'on', { friendly_name: 'Tøymykner' }),

        // ── Varmtvannsbereder (composite: demo-vvb) ──────────────────────
        E('sensor.water_heater_temperature', '72.5', { friendly_name: 'Bereder temperatur', device_class: 'temperature', unit_of_measurement: '°C' }),
        E('sensor.water_heater_fill_level', '84', { friendly_name: 'Bereder fyllingsgrad', unit_of_measurement: '%' }),
        E('sensor.water_heater_energy_stored', '9.6', { friendly_name: 'Bereder lagret energi', device_class: 'energy', unit_of_measurement: 'kWh' }),
        E('sensor.water_heater_power', '0', { friendly_name: 'Bereder effekt', device_class: 'power', unit_of_measurement: 'W' }),
        E('sensor.water_heater_energy_daily', '4.2', { friendly_name: 'Bereder energi i dag', device_class: 'energy', unit_of_measurement: 'kWh' }),
        E('sensor.water_heater_energy_total', '3120', { friendly_name: 'Bereder energi totalt', device_class: 'energy', unit_of_measurement: 'kWh' }),
        E('binary_sensor.water_heater_element_1_status', 'off', { friendly_name: 'Element 1' }),
        E('binary_sensor.water_heater_element_2_status', 'off', { friendly_name: 'Element 2' }),
        E('number.water_heater_setpoint', '75', { friendly_name: 'Bereder ønsket temperatur', min: 30, max: 85, step: 1, unit_of_measurement: '°C' }),
        E('select.water_heater_program_selection', 'Normal', { friendly_name: 'Bereder program', options: ['Eco', 'Normal', 'Boost'] }),

        // ── Elbillader (composite: demo-charger) ─────────────────────────
        E('sensor.car_charger_mode', 'connected_charging', { friendly_name: 'Lader modus' }),
        E('sensor.car_charger_power', '7400', { friendly_name: 'Lader effekt', device_class: 'power', unit_of_measurement: 'W' }),
        E('sensor.car_charger_session_energy', '12.4', { friendly_name: 'Lader energi (økt)', device_class: 'energy', unit_of_measurement: 'kWh' }),
        E('sensor.car_charger_energy_meter', '2480', { friendly_name: 'Lader energi totalt', device_class: 'energy', unit_of_measurement: 'kWh' }),
        E('sensor.car_charger_energy_daily', '12.4', { friendly_name: 'Lader energi i dag', device_class: 'energy', unit_of_measurement: 'kWh' }),
        E('sensor.car_charger_current_phase1', '10.8', { friendly_name: 'Lader fase 1', unit_of_measurement: 'A' }),
        E('sensor.car_charger_current_phase2', '10.6', { friendly_name: 'Lader fase 2', unit_of_measurement: 'A' }),
        E('sensor.car_charger_current_phase3', '10.7', { friendly_name: 'Lader fase 3', unit_of_measurement: 'A' }),
        E('sensor.car_charger_cost_current', '9.2', { friendly_name: 'Lader kostnad nå', unit_of_measurement: 'kr/h' }),
        E('sensor.car_charger_cost_daily', '18.6', { friendly_name: 'Lader kostnad i dag', unit_of_measurement: 'kr' }),
        E('sensor.car_charger_cost_monthly', '312', { friendly_name: 'Lader kostnad måned', unit_of_measurement: 'kr' }),
        E('number.car_charger_circuit_available_current', '16', { friendly_name: 'Tilgjengelig strøm', min: 0, max: 25, step: 1, unit_of_measurement: 'A' }),
        E('binary_sensor.car_charger_status', 'on', { friendly_name: 'Bil tilkoblet', device_class: 'connectivity' }),
        E('binary_sensor.car_charger_online', 'on', { friendly_name: 'Lader online' }),
        E('switch.car_charger_cable_lock', 'off', { friendly_name: 'Kabellås' }),

        // ── Robotklipper (composite: demo-mower) ─────────────────────────
        E('lawn_mower.robotklipper', 'mowing', { friendly_name: 'Robotklipper' }),
        E('sensor.robotklipper_status', 'mowing', {
            friendly_name: 'Robotklipper status',
            options: ['home', 'leaving_home', 'going_home', 'mowing', 'edge_cutting', 'charging', 'paused', 'idle', 'rain_delay', 'error', 'offline'],
        }),
        E('sensor.robotklipper_battery', '76', { friendly_name: 'Robotklipper batteri', device_class: 'battery', unit_of_measurement: '%', charging: false }),
        E('sensor.robotklipper_error', 'no_error', { friendly_name: 'Robotklipper feil' }),
        E('sensor.robotklipper_mower_runtime_total', '5460', { friendly_name: 'Total driftstid', unit_of_measurement: 'min' }),
        E('sensor.robotklipper_blade_runtime_total', '2310', { friendly_name: 'Knivtid', unit_of_measurement: 'min' }),
        E('sensor.robotklipper_next_schedule', isoTomorrowAt(10), { friendly_name: 'Neste start' }),
        E('sensor.robotklipper_estimated_daily_progress', '38', { friendly_name: 'Estimert fremdrift', unit_of_measurement: '%' }),
        E('sensor.robotklipper_daily_progress', '34', { friendly_name: 'Fremdrift i dag', unit_of_measurement: '%' }),
        E('sensor.robotklipper_estimated_area_mowed_today', '91', { friendly_name: 'Estimert klipt i dag', unit_of_measurement: 'm²' }),
        E('sensor.robotklipper_area_mowed_today', '84', { friendly_name: 'Klipt i dag', unit_of_measurement: 'm²' }),
        E('sensor.robotklipper_mowing_time_today', '47', { friendly_name: 'Klippetid i dag', unit_of_measurement: 'min' }),
        E('sensor.robotklipper_lawn_area', '240', { friendly_name: 'Plenareal', unit_of_measurement: 'm²' }),
        E('binary_sensor.robotklipper_online', 'on', { friendly_name: 'Robotklipper online' }),
        E('binary_sensor.robotklipper_rain_triggered', 'off', { friendly_name: 'Regnsensor' }),
        E('binary_sensor.robotklipper_robot_lifted', 'off', { friendly_name: 'Løftet' }),
        E('number.robotklipper_cutting_height', '45', { friendly_name: 'Klippehøyde', min: 30, max: 60, step: 5, unit_of_measurement: 'mm' }),
        E('number.robotklipper_rain_delay', '120', { friendly_name: 'Regnforsinkelse', min: 0, max: 720, step: 30, unit_of_measurement: 'min' }),
        E('button.robotklipper_start_edge_cutting', 'unknown', { friendly_name: 'Kantklipping' }),
        E('camera.robotklipper_map', 'idle', { friendly_name: 'Robotklipper kart', entity_picture: `${baseUrl}demo/mower-map.svg` }),

        // ── Renovasjon (standalone, virtuell composite via prefix) ───────
        E('sensor.demo_min_renovasjon_food', isoDate(2), { friendly_name: 'Matavfall', fraction_name: 'Matavfall', days_until: 2, next_collection: isoDate(2) }),
        E('sensor.demo_min_renovasjon_paper', isoDate(2), { friendly_name: 'Papir', fraction_name: 'Papir', days_until: 2, next_collection: isoDate(2) }),
        E('sensor.demo_min_renovasjon_general', isoDate(6), { friendly_name: 'Restavfall', fraction_name: 'Restavfall', days_until: 6, next_collection: isoDate(6) }),
        E('sensor.demo_min_renovasjon_plastic', isoDate(9), { friendly_name: 'Plast', fraction_name: 'Plast', days_until: 9, next_collection: isoDate(9) }),
        E('sensor.demo_min_renovasjon_glass_metal', isoDate(16), { friendly_name: 'Glass/Metall', fraction_name: 'Glass/Metallemballasje', days_until: 16, next_collection: isoDate(16) }),
        E('sensor.demo_min_renovasjon_next', 'Matavfall og Papir', { friendly_name: 'Neste tømming', days_until: 2, next_collection_date: isoDate(2) }),

        // ── Post (standalone, virtuell composite via prefix) ─────────────
        E('binary_sensor.demo_posten', 'off', { friendly_name: 'Post i dag', integration: 'posten' }),
        E('sensor.demo_posten_next_relative', 'Om 2 dager', { friendly_name: 'Neste levering', integration: 'posten' }),
        E('sensor.demo_posten_next', isoDate(2), { friendly_name: 'Neste leveringsdato', integration: 'posten' }),
        E('sensor.demo_posten_calendar', `['${isoDate(2)}', '${isoDate(4)}', '${isoDate(7)}', '${isoDate(9)}']`, { friendly_name: 'Leveringskalender', integration: 'posten' }),
    ];

    const entities = {};
    list.forEach((e) => { entities[e.entity_id] = e; });

    // Device registry: fire «fysiske» enheter som gir composite-fliser
    const deviceRegistry = [
        { id: 'demo-washer', name: 'Vaskemaskin' },
        { id: 'demo-vvb', name: 'Varmtvannsbereder' },
        { id: 'demo-charger', name: 'Elbillader' },
        { id: 'demo-mower', name: 'Robotklipper' },
    ];

    const entityToDevice = {};
    Object.keys(entities).forEach((eid) => {
        const obj = eid.split('.')[1] || '';
        if (obj.startsWith('washer_')) entityToDevice[eid] = 'demo-washer';
        else if (obj.startsWith('water_heater_')) entityToDevice[eid] = 'demo-vvb';
        else if (obj.startsWith('car_charger_')) entityToDevice[eid] = 'demo-charger';
        else if (obj === 'robotklipper' || obj.startsWith('robotklipper_')) entityToDevice[eid] = 'demo-mower';
    });

    const AREA = {
        'light.stue_taklys': 'Stue', 'light.stue_gulvlampe': 'Stue', 'climate.stue_varmepumpe': 'Stue',
        'sensor.stue_fuktighet': 'Stue', 'cover.stue_markise': 'Stue',
        'light.kjokken_benkelys': 'Kjøkken',
        'climate.soverom_panelovn': 'Soverom',
        'binary_sensor.entre_bevegelse': 'Entré',
        'sensor.ute_temperatur': 'Ute',
    };
    const entityToArea = { ...AREA };
    Object.keys(entityToDevice).forEach((eid) => {
        const dev = entityToDevice[eid];
        entityToArea[eid] = dev === 'demo-charger' || dev === 'demo-mower' ? 'Ute' : 'Vaskerom';
    });

    return { entities, entityToDevice, deviceRegistry, entityToArea };
};

// ── Ferdig oppsatt demo-dashboard ────────────────────────────────────────

export const DEMO_SETTINGS = {
    id: 'config',
    hubType: 'hass',
    hassUrl: 'demo',
    hassToken: 'demo',
};

export const DEMO_PAGES = [
    { id: 'demo-hjem', name: 'Hjem', icon: 'Home', pageType: 'tile', tiles: [] },
    { id: 'demo-maskiner', name: 'Maskiner', icon: 'WashingMachine', pageType: 'tile', tiles: [] },
];

export const DEMO_TILES = [
    // Hjem
    { id: 'dt-clock', pageId: 'demo-hjem', type: 'clock', size: '2x1', settings: { design: 'digital', showSeconds: false } },
    { id: 'dt-weather', pageId: 'demo-hjem', type: 'weather', size: '2x1', settings: { location: 'Oslo' } },
    { id: 'dt-presence', pageId: 'demo-hjem', type: 'presence', size: '2x1', deviceId: 'person.emma', settings: {} },
    { id: 'dt-taklys', pageId: 'demo-hjem', type: 'light', size: '1x1', deviceId: 'light.stue_taklys' },
    { id: 'dt-gulvlampe', pageId: 'demo-hjem', type: 'light', size: '1x1', deviceId: 'light.stue_gulvlampe' },
    { id: 'dt-benkelys', pageId: 'demo-hjem', type: 'light', size: '1x1', deviceId: 'light.kjokken_benkelys' },
    { id: 'dt-markise', pageId: 'demo-hjem', type: 'sunshade', size: '1x1', deviceId: 'cover.stue_markise' },
    { id: 'dt-varmepumpe', pageId: 'demo-hjem', type: 'thermostat', size: '1x1', deviceId: 'climate.stue_varmepumpe' },
    { id: 'dt-panelovn', pageId: 'demo-hjem', type: 'thermostat', size: '1x1', deviceId: 'climate.soverom_panelovn' },
    { id: 'dt-utetemp', pageId: 'demo-hjem', type: 'sensor', size: '1x1', deviceId: 'sensor.ute_temperatur' },
    { id: 'dt-fukt', pageId: 'demo-hjem', type: 'sensor', size: '1x1', deviceId: 'sensor.stue_fuktighet' },
    {
        id: 'dt-hierarki', pageId: 'demo-hjem', type: 'hierarchy', size: '2x2',
        settings: {
            unit: 'W', theme: 'power', autoPrefix: true, showPercentage: true,
            hierarchy: {
                name: 'Huset', icon: 'Home',
                children: [
                    { name: 'Elbillader', icon: 'Zap', deviceId: 'sensor.car_charger_power', capability: 'measure_power' },
                    { name: 'Vaskemaskin', icon: 'WashingMachine', deviceId: 'sensor.washer_power', capability: 'measure_power' },
                    { name: 'Varmtvannsbereder', icon: 'Droplets', deviceId: 'sensor.water_heater_power', capability: 'measure_power' },
                ],
            },
        },
    },

    // Maskiner
    {
        id: 'dt-vaskemaskin', pageId: 'demo-maskiner', type: 'cleaning', size: '2x1', deviceId: 'composite:demo-washer',
        expandedCapabilities: ['laundry_washer_temperature', 'laundry_washer_speed', 'alarm_detergent', 'alarm_softener'],
    },
    { id: 'dt-vvb', pageId: 'demo-maskiner', type: 'water-heater', size: '2x1', deviceId: 'composite:demo-vvb', settings: {} },
    { id: 'dt-lader', pageId: 'demo-maskiner', type: 'ev-charger', size: '2x2', settings: { deviceId: 'composite:demo-charger' } },
    { id: 'dt-klipper', pageId: 'demo-maskiner', type: 'lawn-mower', size: '2x2', deviceId: 'composite:demo-mower', settings: {} },
    { id: 'dt-renovasjon', pageId: 'demo-maskiner', type: 'trash', size: '2x1', deviceId: 'composite:waste:demo_min_renovasjon' },
    { id: 'dt-post', pageId: 'demo-maskiner', type: 'postal', size: '1x1', deviceId: 'composite:postal:demo_posten' },
];
