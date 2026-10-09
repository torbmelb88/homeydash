import React, { useState } from 'react';
import { useHomey } from '../../context/HomeyContext';
import { Wifi } from 'lucide-react';
import DiffuserIcon from '../icons/DiffuserIcon';

// Duftspreder (Rituals Perfume Genie 2.0 via rituals_perfume_genie). I praksis en
// av/på-enhet: bryter, duftstyrke (1–3) og duftnavn. Ingen utvidet visning.
// Fyllingsgrad vises bare hvis sensoren faktisk gir tall (den står normalt «unavailable»).

const DiffuserTile = ({ device }) => {
    const { api, setIsInteracting } = useHomey();

    const getCap = (id) => device?.capabilitiesObj?.[id]?.value;

    // Optimistisk tilstand knyttet til capabilitiesObj-referansen: nullstilles
    // automatisk når nye HA-data kommer inn (samme mønster som IrrigationTile).
    const [override, setOverride] = useState({ src: null, values: {} });
    const ov = override.src === device.capabilitiesObj ? override.values : {};
    const setOv = (patch) => setOverride({ src: device.capabilitiesObj, values: { ...ov, ...patch } });

    const isOn = ov.onoff ?? (getCap('onoff') === true);
    const amount = ov.amount ?? getCap('perfume_amount');
    const perfume = getCap('perfume_name');
    const fill = getCap('fill_level');
    const opts = device?.capabilitiesOptions?.perfume_amount || {};
    const min = opts.min ?? 1;
    const max = opts.max ?? 3;
    const step = opts.step ?? 1;
    const levels = [];
    for (let v = min; v <= max; v += step) levels.push(v);
    const hasAmount = device?.capabilities?.includes('perfume_amount') && levels.length > 1;

    const toggle = (e) => {
        e.stopPropagation();
        const next = !isOn;
        setOv({ onoff: next });
        setIsInteracting?.(true);
        api.setCapability(device.id, 'onoff', next);
    };

    const setAmount = (v) => (e) => {
        e.stopPropagation();
        if (v === amount) return;
        setOv({ amount: v });
        setIsInteracting?.(true);
        api.setCapability(device.id, 'perfume_amount', v);
    };

    const perfumeText = perfume && perfume !== 'unknown' && perfume !== 'unavailable'
        ? perfume.replace(/^The Ritual of\s+/i, '')
        : null;

    return (
        <div className={`tile-content diff-tile ${isOn ? 'is-on' : ''}`}>
            {fill != null && (
                <span className="diff-fill" title="Fyllingsgrad">{Math.round(fill)} %</span>
            )}

            <button
                type="button"
                className="diff-toggle"
                onMouseDown={e => e.stopPropagation()}
                onClick={toggle}
                aria-pressed={isOn}
                title={isOn ? 'Slå av' : 'Slå på'}
            >
                <DiffuserIcon size={38} strokeWidth={1.5} />
            </button>

            <div className="diff-status">{isOn ? 'På' : 'Av'}</div>
            <div className="diff-perfume" title={perfume || ''}>{perfumeText || 'Ingen duft'}</div>

            {hasAmount && (
                <div className="diff-levels" onMouseDown={e => e.stopPropagation()}>
                    <span className="diff-levels-label">Styrke</span>
                    <div className="diff-levels-seg" role="group" aria-label="Duftstyrke">
                        {levels.map(v => (
                            <button
                                key={v}
                                type="button"
                                className={`diff-level ${amount === v ? 'is-active' : ''}`}
                                onClick={setAmount(v)}
                                aria-pressed={amount === v}
                            >
                                {v}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default DiffuserTile;
