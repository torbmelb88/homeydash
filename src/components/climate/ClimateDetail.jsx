import React, { useEffect, useMemo, useState } from 'react';
import { X, Flame, MonitorOff, Check } from 'lucide-react';
import TempStepper from '../TempStepper';
import MiniPowerGraph from '../TileContent/MiniPowerGraph';
import { ClimateBadge } from './ClimateCard';
import { modeIcon } from './climateIcons';
import {
    CLIMATE_KINDS, MODE_LABELS, climateStatus, formatPower, formatTemp, kindOf, limitsOf, meterReadings, modesOf, optionLabel, optionsOf, powerCapOf,
} from '../../services/climate';

const num = (v, decimals = 1) => (v == null || isNaN(v) ? '–' : Number(v).toFixed(decimals).replace('.', ','));

const Group = ({ label, children }) => (
    <div className="climate-group">
        <label>{label}</label>
        {children}
    </div>
);

// Statistikk-rutenett; hele gruppen utelates når enheten ikke har noen av verdiene
const Stats = ({ label, items }) => {
    const shown = items.filter(i => i.value != null);
    if (shown.length === 0) return null;
    return (
        <Group label={label}>
            <div className="climate-stats">
                {shown.map(i => (
                    <div key={i.label}><span>{i.label}</span><b>{i.value}</b></div>
                ))}
            </div>
        </Group>
    );
};

// Valg-chips for vifte / sving / program
function OptionChips({ device, capId, ctl }) {
    const options = optionsOf(device, capId);
    if (options.length === 0) return null;
    const current = ctl.capOf(device, capId);
    return (
        <div className="climate-chips">
            {options.map(o => (
                <button key={o} type="button" className={o === current ? 'is-on' : ''} onClick={() => ctl.setCap(device, capId, o)}>
                    {optionLabel(o)}
                </button>
            ))}
        </div>
    );
}

// Utvidet visning for én enhet på klimasiden. Innholdet bygges av det enheten faktisk har.
export default function ClimateDetail({ device, devices, meter, name, ctl, settings, onClose }) {
    const kind = kindOf(device);
    const caps = device.capabilitiesObj || {};
    const mode = ctl.capOf(device, 'thermostat_mode');
    const target = ctl.targetOf(device);
    const status = climateStatus(device, { mode, target, meter });
    const { min, max, step } = limitsOf(device, settings);
    const powerCap = powerCapOf(device, meter);
    const power = powerCap?.value;
    // Energi/kostnad fra tilknyttet strømmåler, enheten selv eller kostnadssensorene med samme prefiks
    const readings = useMemo(() => meterReadings(devices, device, meter), [devices, device, meter]);
    const kwhKr = (kwhId, krId) => {
        const parts = [
            readings[kwhId] != null ? `${num(readings[kwhId], 0)} kWh` : null,
            readings[krId] != null ? `${num(readings[krId], 0)} kr` : null,
        ].filter(Boolean);
        return parts.length ? parts.join(' · ') : null;
    };
    const kindLabel = CLIMATE_KINDS.find(k => k.kind === kind)?.single;

    // Puls-knapp for display på pumpa: kort «Sendt», aldri på/av-status (HA vet ikke)
    const [pulseSent, setPulseSent] = useState(false);
    useEffect(() => {
        if (!pulseSent) return;
        const t = setTimeout(() => setPulseSent(false), 1200);
        return () => clearTimeout(t);
    }, [pulseSent]);

    const stepper = (
        <TempStepper
            size="xl"
            value={target}
            step={step}
            min={min}
            max={max}
            pending={ctl.isPending(device)}
            disabled={status.na}
            onStep={(dir) => ctl.stepTarget(device, dir)}
        />
    );

    const header = (
        <div className="climate-detail-head">
            <ClimateBadge device={device} status={status} mode={mode} large />
            <div className="climate-detail-title">
                <strong>{name}</strong>
                <span>{[kindLabel, device.zoneName !== name ? device.zoneName : null].filter(Boolean).join(' · ')}</span>
            </div>
            <button type="button" className="climate-close" onClick={onClose} aria-label="Lukk"><X size={20} /></button>
        </div>
    );

    if (kind === 'wh') {
        const fill = caps.fill_level?.value;
        const boost = !!ctl.capOf(device, 'boost');
        const elements = [caps.element_1_active?.value, caps.element_2_active?.value].filter(v => v !== undefined);
        return (
            <>
                {header}
                <div className="climate-detail-body">
                    <div className="climate-tank">
                        <i style={{ height: `${Math.min(100, Math.max(0, fill ?? 0))}%` }} />
                        <b>{fill != null ? `${Math.round(fill)} % fullt` : ''}</b>
                        <span>{caps.energy_in_tank?.value != null ? `${num(caps.energy_in_tank.value)} kWh lagret` : ''}</span>
                    </div>
                    <div className="climate-hero-now">
                        <span>I tanken <b>{formatTemp(caps.measure_temperature?.value)}°</b></span>
                        <span className={status.active ? 'tone-heat' : ''}>
                            {status.label}{status.active && power > 10 ? ` · ${formatPower(power)}` : ''}
                        </span>
                    </div>

                    {device.capabilities?.includes('boost') && (
                        <Group label="Boost">
                            <button type="button" className={`climate-wide-btn ${boost ? 'is-danger' : ''}`} onClick={() => ctl.setCap(device, 'boost', !boost)}>
                                <Flame size={18} /> {boost ? 'Boost er på – trykk for å slå av' : 'Start boost'}
                            </button>
                            <div className="climate-tiny">
                                Varmer tanken helt opp (standard 80 °C) med en gang, uavhengig av strømprisstyringen.
                                Nyttig før mye dusjing. Slår seg av selv når boost-tiden er ute.
                            </div>
                        </Group>
                    )}

                    <Stats label="Forbruk" items={[
                        { label: 'Effekt nå', value: power != null ? formatPower(power) : null },
                        { label: 'I dag', value: caps.energy_daily ? `${num(caps.energy_daily.value)} kWh` : null },
                        { label: 'I går', value: caps.energy_yesterday ? `${num(caps.energy_yesterday.value)} kWh` : null },
                        { label: 'Denne måneden', value: kwhKr('energy_monthly', 'cost_monthly') },
                        { label: 'Forrige måned', value: kwhKr('energy_prev_month', 'cost_prev_month') },
                        { label: 'Elementer', value: elements.length ? (elements.filter(Boolean).length ? `${elements.filter(Boolean).length} aktiv` : 'Av') : null },
                        { label: 'Program', value: caps.program_selection?.value || null },
                    ]} />

                    {caps.target_temperature && (
                        <Group label="Måltemperatur">
                            {stepper}
                            <div className="climate-tiny" style={{ textAlign: 'center' }}>Styres normalt av strømprisen – endres sjelden manuelt.</div>
                        </Group>
                    )}
                </div>
            </>
        );
    }

    const modes = modesOf(device);
    const current = caps.measure_temperature?.value;
    const humidity = caps.measure_humidity?.value;
    const floorTemp = caps['measure_temperature.floor']?.value;
    const extraSwitches = (device.capabilities || []).filter(c => c.startsWith('climate_switch.'));

    return (
        <>
            {header}
            <div className="climate-detail-body">
                <div className="climate-hero">
                    <div className="climate-hero-label">Ønsket temperatur</div>
                    {stepper}
                    <div className="climate-hero-now">
                        {current != null && <span>Nå <b>{formatTemp(current)}°</b></span>}
                        {floorTemp != null && <span>Gulv <b>{formatTemp(floorTemp)}°</b></span>}
                        {humidity != null && <span>Fukt <b>{Math.round(humidity)} %</b></span>}
                        <span className={status.active ? `tone-${status.tone}` : ''}>
                            {status.label}{status.active && power > 10 ? ` · ${formatPower(power)}` : ''}
                        </span>
                    </div>
                </div>

                {modes.length > 0 && (
                    <Group label="Modus">
                        <div className="climate-modes">
                            {modes.map(m => {
                                const Icon = modeIcon(m);
                                return (
                                    <button key={m} type="button" className={`${m === mode ? 'is-on' : ''} mode-${m}`} onClick={() => ctl.setMode(device, m)}>
                                        <Icon size={18} />{MODE_LABELS[m] || optionLabel(m)}
                                    </button>
                                );
                            })}
                        </div>
                    </Group>
                )}

                {device.capabilities?.includes('fan_mode') && <Group label="Vifte"><OptionChips device={device} capId="fan_mode" ctl={ctl} /></Group>}
                {device.capabilities?.includes('swing_mode') && <Group label="Sving"><OptionChips device={device} capId="swing_mode" ctl={ctl} /></Group>}
                {optionsOf(device, 'preset_mode').length > 0 && <Group label="Program"><OptionChips device={device} capId="preset_mode" ctl={ctl} /></Group>}

                {extraSwitches.length > 0 && (
                    <Group label="Ekstra">
                        <div className="climate-toggles">
                            {extraSwitches.map(capId => {
                                const on = !!ctl.capOf(device, capId);
                                return (
                                    <button key={capId} type="button" className={on ? 'is-on' : ''} onClick={() => ctl.setCap(device, capId, !on)}>
                                        {caps[capId]?.title || capId.split('.')[1]}
                                        <span className="climate-switch" />
                                    </button>
                                );
                            })}
                        </div>
                    </Group>
                )}

                {device.capabilities?.includes('display_toggle') && (
                    <Group label="Skjerm på pumpa">
                        <button type="button" className="climate-wide-btn" onClick={() => { setPulseSent(true); ctl.press(device, 'display_toggle'); }}>
                            {pulseSent ? <><Check size={18} /> Sendt</> : <><MonitorOff size={18} /> Skjerm av/på</>}
                        </button>
                        <div className="climate-tiny">Sender IR-signal. Trykk igjen hvis skjermen ikke reagerte.</div>
                    </Group>
                )}

                <Stats label={meter ? `Forbruk · ${meter.name}` : 'Forbruk og målinger'} items={[
                    { label: 'Effekt nå', value: power != null ? formatPower(power) : null },
                    { label: 'Utedel', value: caps['measure_temperature.outdoor'] ? `${formatTemp(caps['measure_temperature.outdoor'].value)}°` : null },
                    { label: 'I dag', value: readings.energy_daily != null ? `${num(readings.energy_daily)} kWh` : null },
                    { label: 'Denne måneden', value: kwhKr('energy_monthly', 'cost_monthly') },
                    { label: 'Forrige måned', value: kwhKr('energy_prev_month', 'cost_prev_month') },
                    { label: 'Hittil i år', value: kwhKr('energy_ytd', 'cost_ytd') },
                ]} />

                {/* Effektgraf siste 6 t (HA: grafen slår opp på entity-id, ikke composite-id) */}
                {power != null && powerCap?.entity_id && (
                    <MiniPowerGraph stacked deviceId={powerCap.entity_id} currentValue={power} unit="W" title="Effekt siste 6 timer" />
                )}
            </div>
        </>
    );
}
