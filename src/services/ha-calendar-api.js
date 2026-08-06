/**
 * Kalender-API via Home Assistant.
 * HA holder selv Google-tilkoblingen ved like (refresh token server-side),
 * så dashbordet trenger aldri egne Google-tokens.
 *
 * - Lesing:    REST  GET /api/calendars/<entity_id>?start=...&end=...
 * - Oppretting: tjeneste calendar.create_event
 * - Sletting:  WebSocket calendar/event/delete
 */
import { hassAPI } from './hass-api';

export function isConnected() {
    return hassAPI.isConnected;
}

/** Alle calendar.*-entiteter i HA, sortert på visningsnavn. */
export function listCalendars() {
    return Object.values(hassAPI.entities)
        .filter(e => e.entity_id.startsWith('calendar.'))
        .map(e => ({
            id: e.entity_id,
            summary: e.attributes?.friendly_name || e.entity_id,
        }))
        .sort((a, b) => a.summary.localeCompare(b.summary, 'nb'));
}

export function getCalendarName(entityId) {
    return hassAPI.entities[entityId]?.attributes?.friendly_name || entityId;
}

/**
 * Henter hendelser for flere kalendere de neste `days` dagene.
 * HA returnerer samme form som Google API: { summary, description, location,
 * uid, recurrence_id, start: {date|dateTime}, end: {date|dateTime} }.
 */
export async function getEvents(calendarIds, days = 7) {
    const base = (hassAPI.httpBase || hassAPI.url || '').replace(/\/$/, '');
    if (!base || !hassAPI.token) throw new Error('HA_NOT_CONNECTED');

    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + days);
    const params = `?start=${encodeURIComponent(now.toISOString())}&end=${encodeURIComponent(end.toISOString())}`;

    const allEvents = [];
    for (const calendarId of calendarIds) {
        try {
            const res = await fetch(`${base}/api/calendars/${calendarId}${params}`, {
                headers: { Authorization: `Bearer ${hassAPI.token}` },
            });
            if (!res.ok) throw new Error(`API_ERROR:${res.status}`);
            const items = await res.json();
            allEvents.push(...items.map(ev => ({
                ...ev,
                calendarId,
                // HA har ingen enkelt-ID per forekomst – bygg en stabil nøkkel
                id: `${calendarId}|${ev.uid || ''}|${ev.recurrence_id || ev.start?.dateTime || ev.start?.date || ''}`,
            })));
        } catch (e) {
            console.error(`Kunne ikke hente hendelser for ${calendarId}:`, e);
        }
    }

    allEvents.sort((a, b) => {
        const aTime = a.start?.dateTime || a.start?.date || '';
        const bTime = b.start?.dateTime || b.start?.date || '';
        return aTime.localeCompare(bTime);
    });

    return allEvents;
}

/**
 * Oppretter hendelse via calendar.create_event.
 * Tidspunkt-strenger tolkes i HA sin lokale tidssone.
 */
export async function createEvent(calendarId, { summary, description, start, end, allDay }) {
    const data = { summary };
    if (description) data.description = description;
    if (allDay) {
        data.start_date = start;   // 'YYYY-MM-DD'
        data.end_date = end;       // eksklusiv sluttdato
    } else {
        data.start_date_time = start; // 'YYYY-MM-DDTHH:mm:ss'
        data.end_date_time = end;
    }
    return hassAPI.callService('calendar', 'create_event', calendarId, data);
}

/** Sletter hendelse. For gjentakende hendelser slettes kun gitt forekomst. */
export async function deleteEvent(calendarId, uid, recurrenceId) {
    const cmd = { type: 'calendar/event/delete', entity_id: calendarId, uid };
    if (recurrenceId) cmd.recurrence_id = recurrenceId;
    return hassAPI.sendCommand(cmd);
}
