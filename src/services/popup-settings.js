import { APPLIANCE_DEFAULTS } from '../hooks/useApplianceState';

/**
 * Globale (profil-scopede) innstillinger for maskin-popupene («Er den tømt?»).
 *
 * Lagres i settings.popups[kind] = { enabled, snoozeMinutes, ... } og redigeres i
 * Innstillinger → Popups. Popupen rendres av FinishedPromptManager uavhengig av
 * om profilen har en flis for maskinen — derfor må alt popupen trenger ligge
 * her, ikke i flis-innstillingene. Fliser laget før dette (aug 2026) kan ha
 * gamle verdier (standbyThreshold, snoozeMinutes, customInactiveKeywords) i
 * tile.settings; de brukes kun som fallback til profilen er lagret én gang.
 */

export const MACHINE_POPUP_KINDS = [
    { kind: 'dishwasher', label: 'Oppvaskmaskin' },
    { kind: 'dryer', label: 'Tørketrommel' },
    { kind: 'washer', label: 'Vaskemaskin' },
];

export const POPUP_DEFAULTS = {
    dishwasher: { enabled: true, snoozeMinutes: 5, ...APPLIANCE_DEFAULTS },
    dryer: { enabled: true, snoozeMinutes: 5, ...APPLIANCE_DEFAULTS },
    washer: { enabled: true, snoozeMinutes: 5, inactiveKeywords: '' },
};

const isSet = (v) => v !== undefined && v !== null && v !== '';

// Oppslag for én maskintype: global profilinnstilling → gammel flisverdi → standard.
// «enabled» faller tilbake til den gamle felles bryteren finishedPromptsEnabled
// (ikke til flisens finishedPrompt — popupen skal ikke styres av fliser).
export const getMachinePopupCfg = (settings, kind, tileSettings = {}) => {
    const def = POPUP_DEFAULTS[kind] || POPUP_DEFAULTS.dishwasher;
    const g = settings?.popups?.[kind] || {};
    const legacy = { ...tileSettings, inactiveKeywords: tileSettings.customInactiveKeywords };
    const pick = (key) => (isSet(g[key]) ? g[key] : isSet(legacy[key]) ? legacy[key] : def[key]);
    const num = (key) => {
        const n = Number(pick(key));
        return Number.isFinite(n) ? n : def[key];
    };

    const cfg = {
        enabled: (isSet(g.enabled) ? g.enabled : settings?.finishedPromptsEnabled) !== false,
        snoozeMinutes: Math.max(1, num('snoozeMinutes')),
    };
    if (kind === 'washer') {
        cfg.inactiveKeywords = String(pick('inactiveKeywords') || '');
    } else {
        cfg.standbyThreshold = num('standbyThreshold');
        cfg.runThreshold = num('runThreshold');
        cfg.finishedDelayMin = num('finishedDelayMin');
        cfg.autoDismissHours = num('autoDismissHours');
    }
    return cfg;
};

// Kommaseparert tekst → liste med små bokstaver (for vaskemaskinens inaktiv-ord)
export const parseKeywords = (text) => String(text || '')
    .split(',')
    .map(k => k.trim().toLowerCase())
    .filter(Boolean);
