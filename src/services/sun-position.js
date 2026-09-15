// Solposisjon (asimut/høyde) uten avhengigheter — samme algoritme som SunCalc.
// Brukes av utetemperatur-flisen når sun.sun ikke finnes, og til «hvor sto sola for
// 45 min siden»-sjekken (avkjøling) som HA ikke kan svare på.
// Verifisert mot HA sin sun.sun (avvik < 0,5° i asimut og høyde).

const rad = Math.PI / 180;
const J1970 = 2440588;
const J2000 = 2451545;
const OBLIQUITY = rad * 23.4397;

const toDays = (date) => date.getTime() / 864e5 - 0.5 + J1970 - J2000;

/**
 * @param {Date} date
 * @param {number} lat  breddegrad i grader
 * @param {number} lng  lengdegrad i grader (øst positiv)
 * @returns {{ azimuth: number, elevation: number }}  asimut 0–360 (N=0, Ø=90), høyde i grader
 */
export function getSunPosition(date, lat, lng) {
    const lw = rad * -lng;
    const phi = rad * lat;
    const d = toDays(date);

    const M = rad * (357.5291 + 0.98560028 * d);
    const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    const L = M + C + rad * 102.9372 + Math.PI;

    const dec = Math.asin(Math.sin(OBLIQUITY) * Math.sin(L));
    const ra = Math.atan2(Math.sin(L) * Math.cos(OBLIQUITY), Math.cos(L));
    const H = rad * (280.16 + 360.9856235 * d) - lw - ra;

    const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi));
    const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));

    return {
        azimuth: (az / rad + 180 + 360) % 360,
        elevation: alt / rad,
    };
}

/** Minste vinkel mellom to retninger i grader (0–180). */
export const angleDiff = (a, b) => {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
};
