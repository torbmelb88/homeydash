import { useEffect } from 'react';
import { hassAPI } from '../services/hass-api';

/**
 * Blinker kant-LED-ene på kjøkken-nettbrettet rødt mens en ferdig-popup er
 * synlig. Selve lysstyringen ligger i to HA-scripts (snapshot + blink /
 * gjenoppretting) som er vaktet mot doble kall — flere åpne dashbord kan
 * trygt kalle dem samtidig.
 *
 * Modul-global teller fordi flere popups kan være synlige samtidig i samme
 * nettleser (oppvaskmaskin + vaskemaskin): start ved 0→1, stopp ved 1→0.
 * Slumring/kvittering skjuler popupen → stopp; popupen tilbake etter
 * slumring → start igjen. Følger altså popup-livssyklusen direkte.
 */
const START_SCRIPT = 'script.nettbrett_led_varsel_start';
const STOP_SCRIPT = 'script.nettbrett_led_varsel_stopp';

let visibleCount = 0;

const callScript = (entityId) => {
    try {
        const p = hassAPI.callService('script', 'turn_on', entityId);
        if (p?.catch) p.catch(() => { /* HA utilgjengelig – popupen virker uansett */ });
    } catch { /* ikke tilkoblet enda */ }
};

export default function useLedAlert(visible) {
    useEffect(() => {
        if (!visible) return;
        visibleCount += 1;
        if (visibleCount === 1) callScript(START_SCRIPT);
        return () => {
            visibleCount -= 1;
            if (visibleCount === 0) callScript(STOP_SCRIPT);
        };
    }, [visible]);
}
