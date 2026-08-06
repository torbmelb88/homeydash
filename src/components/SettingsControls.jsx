import React from 'react';

// Felles byggeklosser for innstillingsmodaler (fliser og sider).
// Bruk disse i stedet for inline-markup slik at alle innstillinger ser like ut.

// Standard sjekkboksrad: boks til venstre, tekst til høyre.
// Valgfri description vises som dempet linje under teksten.
export const CheckboxRow = ({ label, description, checked, onChange, disabled = false }) => (
    <label className="checkbox-row" style={disabled ? { opacity: 0.5 } : undefined}>
        <input
            type="checkbox"
            checked={!!checked}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
        />
        {description ? (
            <span>
                <span style={{ display: 'block' }}>{label}</span>
                <span className="hint" style={{ display: 'block', marginTop: 2 }}>{description}</span>
            </span>
        ) : label}
    </label>
);

// Gruppe med av/på-valg for hva en flis skal vise (typisk «Utvidet (Stor)»-fanen).
// options: [{ key, label, def }] – def er standardverdien når nøkkelen ikke er satt.
// values: settings-objektet, onChange(key, checked) skriver tilbake.
export const ShowOptionsGroup = ({ title, description, options, values, onChange }) => (
    <div className="form-group">
        {title && <label>{title}</label>}
        {description && (
            <p className="hint" style={{ marginTop: 0, marginBottom: '0.75rem' }}>{description}</p>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {options.map(({ key, label, def }) => (
                <CheckboxRow
                    key={key}
                    label={label}
                    checked={values?.[key] !== undefined ? values[key] : def}
                    onChange={(checked) => onChange(key, checked)}
                />
            ))}
        </div>
    </div>
);
