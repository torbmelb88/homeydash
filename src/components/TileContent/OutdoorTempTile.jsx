import React, { useEffect, useState } from 'react';
import { Sun, Moon, ThermometerSun } from 'lucide-react';
import { useHomey } from '../../context/HomeyContext';
import {
    DEFAULT_OUTDOOR_TEMP_SETTINGS, STATUS_TXT, compassName, wallBearing, wallSun,
    evaluateOutdoorTemp, nextChangeText, fmtTemp,
} from '../../services/outdoor-temp';

// Utetemperatur fra varmepumpenes utedeler, tegnet på huset med sola der den står.
// Utedeler i skyggen fremheves (blått) og gir «beste anslag» midt i huset; utedeler i sol
// dempes (oransje). All logikk ligger i services/outdoor-temp.js — her er bare tegningen.

const rad = Math.PI / 180;
const VB_W = 320, VB_H = 224, CX = 160, CY = 116, RING = 98;

const hull = (pts) => {
    const sorted = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [], upper = [];
    for (const p of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
        lower.push(p);
    }
    for (const p of sorted.reverse()) {
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
        upper.push(p);
    }
    return lower.slice(0, -1).concat(upper.slice(0, -1));
};

const SunGlyph = ({ x, y, r = 6, rays = 10, width = 1.4, halo = false }) => (
    <g transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`}>
        {halo && <circle r={r + 5} fill="var(--ot-sun)" fillOpacity=".18" />}
        <circle r={r} fill="var(--ot-sun)" />
        {[0, 45, 90, 135].map(a => (
            <line key={a} x1={-rays} x2={rays} stroke="var(--ot-sun)" strokeWidth={width} transform={`rotate(${a})`} />
        ))}
    </g>
);

// Husskissen. Alt regnes i husets eget koordinatsystem (langsiden vannrett) og roteres
// med phi på skjermen: 0 i «house»-modus, houseBearing − 90 i «north»-modus (nord opp).
export const HouseScene = ({ cfg, rows, est, sun }) => {
    const bearing = Number(cfg.houseBearing) || 0;
    const rot = cfg.orientation === 'north' ? 90 : bearing;
    const phi = (bearing - rot) * rad;
    const cosP = Math.cos(phi), sinP = Math.sin(phi);
    const dirOf = (b) => { const t = (b - rot) * rad; return [Math.cos(t), Math.sin(t)]; };
    const local = (lx, ly) => [CX + lx * cosP - ly * sinP, CY + lx * sinP + ly * cosP];

    // Husets størrelse: sideforhold fra innstillingene, skalert så det (også rotert) får plass.
    const ratio = Math.min(4, Math.max(1, Number(cfg.houseRatio) || 2.15));
    let W = 150, H = W / ratio;
    if (H > 80) { H = 80; W = H * ratio; }
    const bw = W * Math.abs(cosP) + H * Math.abs(sinP);
    const bh = W * Math.abs(sinP) + H * Math.abs(cosP);
    const s = Math.min(1, 165 / bw, 100 / bh);
    W *= s; H *= s;

    const cornersLocal = [[-W / 2, -H / 2], [W / 2, -H / 2], [W / 2, H / 2], [-W / 2, H / 2]];
    const corners = cornersLocal.map(([x, y]) => local(x, y));
    const edges = { top: [corners[0], corners[1]], right: [corners[1], corners[2]], bottom: [corners[3], corners[2]], left: [corners[0], corners[3]] };
    const unitPoint = (u) => {
        const p = Math.min(1, Math.max(0, (Number(u.pos) || 0) / 100));
        if (u.wall === 'top') return local(-W / 2 + p * W, -H / 2);
        if (u.wall === 'right') return local(W / 2, -H / 2 + p * H);
        if (u.wall === 'left') return local(-W / 2, -H / 2 + p * H);
        return local(-W / 2 + p * W, H / 2);
    };

    const night = !sun || sun.elevation <= 0;
    const [nx, ny] = dirOf(0);
    const northAngle = Math.atan2(ny, nx) / rad + 90;

    let shadow = null;
    if (!night && cfg.showShadow !== false) {
        const len = Math.min(120, 26 / Math.tan(Math.max(sun.elevation, 1.5) * rad));
        const [sx, sy] = dirOf(sun.azimuth + 180);
        shadow = hull(corners.concat(corners.map(([x, y]) => [x + sx * len, y + sy * len])));
    }

    return (
        <svg className="otemp-svg" viewBox={`0 0 ${VB_W} ${VB_H}`} role="img" aria-label="Husskisse med utedelene og sola">
            {cfg.showCompass !== false && (
                <g>
                    <circle cx={CX} cy={CY} r={RING} fill="none" stroke="var(--ot-edge)" strokeDasharray="2 4" />
                    {[['N', 0], ['Ø', 90], ['S', 180], ['V', 270]].map(([ltr, b]) => {
                        const [dx, dy] = dirOf(b);
                        return (
                            <text key={ltr} x={CX + dx * (RING + 9)} y={CY + dy * (RING + 9) + 3.5} fontSize="9" textAnchor="middle"
                                fill="var(--ot-ink-3)" fontWeight={b === 0 ? 700 : 400}>{ltr}</text>
                        );
                    })}
                    <g transform={`translate(24 26) rotate(${northAngle.toFixed(1)})`}>
                        <polygon points="0,-11 4,4 0,1 -4,4" fill="var(--ot-ink-2)" />
                        <text y="-13" fontSize="8" textAnchor="middle" fill="var(--ot-ink-2)" transform={`rotate(${(-northAngle).toFixed(1)} 0 -15)`}>N</text>
                    </g>
                </g>
            )}

            {shadow && <polygon points={shadow.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')} fill="var(--ot-shadow)" />}

            <polygon points={corners.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')} fill="var(--ot-house)" stroke="var(--ot-edge)" strokeLinejoin="round" />
            {Object.entries(edges).map(([wall, [a, b]]) => {
                const lit = night ? 0 : wallSun(sun, { wall }, cfg);
                const stroke = night ? 'var(--ot-ink-3)' : lit > 0 ? 'var(--ot-sun)' : 'var(--ot-shade)';
                const opacity = night ? 0.35 : lit > 0 ? 0.55 + 0.45 * lit : 0.55;
                return <line key={wall} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={stroke} strokeOpacity={opacity.toFixed(2)} strokeWidth="3" strokeLinecap="round" />;
            })}

            {cfg.showEstimate !== false && (
                <>
                    <text x={CX} y={CY + 5} fontSize="23" fontWeight="600" textAnchor="middle" fill="var(--ot-ink)">{fmtTemp(est.value)}</text>
                    <text x={CX} y={CY + 19} fontSize="8" textAnchor="middle" fill="var(--ot-ink-3)">beste anslag · {est.mode}</text>
                </>
            )}

            {rows.map(r => {
                const [px, py] = unitPoint(r.unit);
                const [dx, dy] = dirOf(wallBearing(r.unit.wall, bearing));
                const isSun = r.status === 'sun', isCool = r.status === 'cooling';
                const dim = isSun || isCool || r.status === 'nodata';
                const col = isSun || isCool ? 'var(--ot-sun)' : r.status === 'shade' ? 'var(--ot-shade)' : 'var(--ot-ink-3)';
                const pw = 72, ph = 30;
                const off = 10 + Math.abs(dx) * pw / 2 + Math.abs(dy) * ph / 2;
                const cx = px + dx * off, cy = py + dy * off;
                const x = cx - pw / 2, y = cy - ph / 2;
                return (
                    <g key={r.unit.id}>
                        <circle cx={px + dx * 3} cy={py + dy * 3} r="4.5" fill={isSun ? 'var(--ot-sun)' : 'var(--ot-house)'} stroke={col} strokeWidth="2" />
                        <rect x={x} y={y} width={pw} height={ph} rx="7" fill="var(--ot-pill)" stroke={col}
                            strokeOpacity={isSun ? 0.9 : isCool ? 0.6 : 0.8} strokeWidth="1.2" strokeDasharray={isCool ? '3 2' : undefined} />
                        <text x={cx} y={y + 11} fontSize="8.5" textAnchor="middle" fill="var(--ot-ink-3)">{r.unit.name}</text>
                        <text x={cx} y={y + 24} fontSize="12.5" fontWeight={dim ? 500 : 700} textAnchor="middle" fill={dim ? 'var(--ot-ink-3)' : 'var(--ot-ink)'}>{fmtTemp(r.temp)}</text>
                        {(isSun || isCool) && <SunGlyph x={x + pw - 8} y={y + 8} r={2.6} rays={5} width={1} />}
                    </g>
                );
            })}

            {!night && (() => {
                const [sx, sy] = dirOf(sun.azimuth);
                return <SunGlyph x={CX + sx * RING} y={CY + sy * RING} halo />;
            })()}
        </svg>
    );
};

const SunChip = ({ sun }) => {
    if (!sun) return <span className="otemp-chip">Sol ukjent</span>;
    if (sun.elevation <= 0) return <span className="otemp-chip night"><Moon size={11} /> Natt</span>;
    return <span className="otemp-chip sun"><Sun size={11} /> {Math.round(sun.elevation)}° · {Math.round(sun.azimuth)}°</span>;
};

const OutdoorTempTile = ({ tile, expanded = false }) => {
    const { devices } = useHomey(); // ny referanse ved hver HA-oppdatering → re-render
    const [, setTick] = useState(0);
    useEffect(() => {
        const timer = setInterval(() => setTick(t => t + 1), 60000); // sola flytter seg selv om ingen sensor endres
        return () => clearInterval(timer);
    }, []);
    void devices;

    const cfg = { ...DEFAULT_OUTDOOR_TEMP_SETTINGS, ...(tile.settings || {}) };
    const units = (cfg.units || []).filter(u => u && u.entityId);
    const now = new Date();
    const { coords, sun, rows, est } = evaluateOutdoorTemp(cfg, units, now);
    const title = tile.name || 'Utetemperatur';

    if (!units.length) {
        return (
            <div className={`otemp ${expanded ? 'expanded' : ''}`}>
                <div className="otemp-header"><span className="otemp-title">{title}</span></div>
                <div className="otemp-empty">
                    <ThermometerSun size={28} />
                    <span>Ingen utedeler valgt. Åpne innstillingene og legg til temperatursensorene.</span>
                </div>
            </div>
        );
    }

    if (!expanded) {
        return (
            <div className="otemp">
                <div className="otemp-header">
                    <span className="otemp-title">{title}</span>
                    <SunChip sun={sun} />
                </div>
                <HouseScene cfg={cfg} rows={rows} est={est} sun={sun} />
            </div>
        );
    }

    const next = nextChangeText(cfg, units, coords, rows, now);
    return (
        <div className="otemp expanded">
            <div className="otemp-header">
                <span className="otemp-title">{title} · utedelene</span>
                <SunChip sun={sun} />
            </div>
            <div className="otemp-body">
                <div className="otemp-scene">
                    <HouseScene cfg={cfg} rows={rows} est={est} sun={sun} />
                </div>
                <div className="otemp-side">
                    <div className="otemp-hero">
                        <div className="otemp-hero-val">{est.value == null ? '–' : est.value.toFixed(1).replace('.', ',')}<small>°C</small></div>
                        <div className="otemp-hero-cap">
                            Beste anslag · {est.mode}{est.basis.length ? `: ${est.basis.map(r => r.unit.name).join(', ')}` : ''}
                        </div>
                    </div>
                    <div className="otemp-list">
                        {rows.map(r => (
                            <div key={r.unit.id} className={`otemp-row ${r.status}`}>
                                <span className="otemp-dot" />
                                <span className="otemp-row-name">
                                    <div>{r.unit.name}</div>
                                    <div className="otemp-row-sub">vegg mot {compassName(wallBearing(r.unit.wall, cfg.houseBearing)).toLowerCase()}</div>
                                </span>
                                <span className="otemp-row-temp">{fmtTemp(r.temp)}</span>
                                <span className="otemp-row-status">{STATUS_TXT[r.status]}</span>
                            </div>
                        ))}
                    </div>
                    {next && <div className="otemp-next">{next}</div>}
                </div>
            </div>
        </div>
    );
};

export default OutdoorTempTile;
