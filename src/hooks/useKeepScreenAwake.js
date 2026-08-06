import { useEffect } from 'react';

/**
 * Holder skjermen våken mens en oppmerksomhetskrevende popup er synlig,
 * via Fully Kiosk sitt JavaScript-grensesnitt (window.fully — krever at
 * «Enable Website Integration (PLUS)» er på i Fully Kiosk).
 *
 * Uten dette sluker Fully Kiosk det FØRSTE trykket for å avslutte
 * skjermsparer/dimming — brukeren må da trykke to ganger for å treffe
 * knappene i popupen. I tillegg kan popupen stå usynlig bak skjermsparer-
 * bildene til den vekkes.
 *
 * VIKTIG: stopScreensaver() nullstiller IKKE Fully Kiosk sin idle-timer,
 * så skjermspareren starter på nytt hvert minutt (60 s-timer) — verifisert
 * i FK-switch-historikken 26/7-2026 (av/på-blinking hvert ~60/30 s). Derfor
 * bindes også `onScreensaverStart` slik at FK dreper skjermspareren i det
 * øyeblikket den prøver å starte — samme velprøvde grep som useFullyKiosk
 * (helside-iframe). Bindingen re-asserteres hvert tick fordi den er en
 * global FK-slot som andre hooks kan overskrive/nullstille.
 *
 * I vanlige nettlesere finnes ikke window.fully — da gjør hooken ingenting.
 */
const wake = () => {
    const f = window.fully;
    if (!f) return;
    try {
        if (typeof f.turnScreenOn === 'function') f.turnScreenOn();
        if (typeof f.stopScreensaver === 'function') f.stopScreensaver();
        if (typeof f.bind === 'function') {
            f.bind('onScreensaverStart', 'window.fully.stopScreensaver(); window.fully.turnScreenOn();');
        }
    } catch { /* eldre Fully Kiosk uten disse metodene */ }
};

const unbindScreensaverStart = () => {
    const f = window.fully;
    if (!f || typeof f.bind !== 'function') return;
    try {
        // Tom binding (semikolon) frigjør slotten — ellers blokkeres
        // skjermspareren for alltid, også etter at popupen er kvittert ut.
        f.bind('onScreensaverStart', ';');
    } catch { /* ignore */ }
};

const useKeepScreenAwake = (active) => {
    useEffect(() => {
        if (!active) return;
        wake();
        const timer = setInterval(wake, 5 * 1000);
        return () => {
            clearInterval(timer);
            unbindScreensaverStart();
        };
    }, [active]);
};

export default useKeepScreenAwake;
