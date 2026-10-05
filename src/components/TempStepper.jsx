import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { formatTemp } from '../services/climate';

// Felles −/+-stepper for måltemperatur (klimasiden). Ett trykk = ett trinn; selve
// sendingen (samlet/forsinket) ligger i useClimateControl. Stopper klikk-bobling slik at
// et trykk på stepperen aldri åpner utvidet visning.
// size: 'md' (kort) | 'xl' (utvidet visning). pending = endring sendt, ikke bekreftet.
export default function TempStepper({ value, step = 0.5, min, max, pending = false, disabled = false, size = 'md', onStep }) {
    const stop = (e) => e.stopPropagation();
    const iconSize = size === 'xl' ? 28 : 20;
    const atMin = value != null && min != null && value <= min;
    const atMax = value != null && max != null && value >= max;
    return (
        <div className={`temp-stepper temp-stepper--${size} ${pending ? 'is-pending' : ''}`} onClick={stop} onPointerDown={stop}>
            <button type="button" aria-label="Senk temperaturen" disabled={disabled || atMin} onClick={() => onStep(-1)}>
                <Minus size={iconSize} />
            </button>
            <div className="temp-stepper-value" aria-live="polite">
                {formatTemp(value, step)}<small>°</small>
            </div>
            <button type="button" aria-label="Øk temperaturen" disabled={disabled || atMax} onClick={() => onStep(1)}>
                <Plus size={iconSize} />
            </button>
        </div>
    );
}
