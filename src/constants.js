// Shared constants used across multiple components

// Tile types that are pure widgets (no device backing)
// NOTE: 'ev-charger' is intentionally NOT here — it has a real device in Tile.jsx
// but TileSettingsModal treats it as widget (no device lookup). Keep them separate.
export const WIDGET_TYPES = new Set([
    'clock', 'weather', 'video', 'web', 'app-launcher', 'graph',
    'flow', 'hierarchy', 'door-control', 'header', 'keypad', 'energy-dashboard',
    'intercom', 'light-panel', 'outdoor-temp',
]);

// Widget types that also skip device lookup in TileSettingsModal
export const SETTINGS_WIDGET_TYPES = new Set([
    ...WIDGET_TYPES,
    'ev-charger', // settings modal has no device but Tile.jsx does
]);

// Safety timeout to auto-release the interaction lock (ms)
export const INTERACTION_TIMEOUT_MS = 5000;

// Maximum number of toasts shown at once
export const MAX_TOAST_COUNT = 4;

// Maximum WebSocket reconnect delay for Homey (ms)
export const MAX_RECONNECT_DELAY_MS = 30000;
