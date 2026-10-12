import React, { useState } from 'react';
import * as LucideIcons from 'lucide-react';
import DeviceImage from './DeviceImage';
import { useProductImages, autoProductImage, isImageUrl } from '../services/product-images';

/**
 * Velger for ett bildevalg (hjørne eller midten) på en enhet. Verdi: '' = automatisk,
 * 'none' = av, URL = egen, ellers manifest-id. Brukes i flisinnstillingene (begge slots) og
 * per enhet i innstillingene på bil- og klimasiden (ett valg per enhet, slot 'best').
 */
export default function ProductImagePicker({ device, value = '', onChange, slot = 'corner', customIcon = '', label, id, hint, compact = false }) {
    const manifest = useProductImages();
    const [mode, setMode] = useState(() => (isImageUrl(value) ? 'url' : value));
    const autoHit = device ? autoProductImage(device, manifest, slot) : null;
    const byLabel = (a, b) => (a.label || a.id).localeCompare(b.label || b.id, 'nb');
    const libraryEntries = manifest.entries.filter(e => e.kind !== 'logo').sort(byLabel);
    const logoEntries = manifest.entries.filter(e => e.kind === 'logo').sort(byLabel);
    const pick = (next) => {
        setMode(next);
        onChange(next === 'url' ? '' : next);
    };
    const tileSettings = slot === 'corner' ? { productImage: value, customIcon } : { heroImage: value };
    const Fallback = customIcon && LucideIcons[customIcon] ? LucideIcons[customIcon] : device?.LucideIcon;

    const autoText = autoHit ? `Automatisk (${autoHit.label})` : 'Automatisk (ingen treff)';
    return (
        <div className="form-group" style={{ marginBottom: compact ? 0 : '16px' }}>
            {label && <label htmlFor={id}>{label}</label>}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <DeviceImage
                    device={device}
                    tileSettings={tileSettings}
                    slot={slot}
                    size={compact ? 36 : 44}
                    fallback={
                        <div style={{ width: compact ? 36 : 44, height: compact ? 36 : 44, borderRadius: '25%', background: 'rgba(255,255,255,0.05)', border: '1px dashed rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-tertiary)', flexShrink: 0 }}>
                            {Fallback ? <Fallback size={compact ? 16 : 20} strokeWidth={1.5} /> : null}
                        </div>
                    }
                />
                <select
                    id={id}
                    className="select-input"
                    value={mode}
                    onChange={e => pick(e.target.value)}
                    style={{ flex: 1, minWidth: 0 }}
                >
                    <option value="">{autoText}</option>
                    <option value="none">Ingen – bruk ikon</option>
                    <option value="url">Egen bilde-URL…</option>
                    {libraryEntries.length > 0 && (
                        <optgroup label="Produktbibliotek">
                            {libraryEntries.map(e => <option key={e.id} value={e.id}>{e.label || e.id}</option>)}
                        </optgroup>
                    )}
                    {logoEntries.length > 0 && (
                        <optgroup label="Merkelogoer">
                            {logoEntries.map(e => <option key={e.id} value={e.id}>{e.label || e.id}</option>)}
                        </optgroup>
                    )}
                </select>
            </div>
            {mode === 'url' && (
                <input
                    type="text"
                    placeholder="https://…/bilde.png"
                    value={isImageUrl(value) ? value : ''}
                    onChange={e => onChange(e.target.value)}
                    style={{ width: '100%', marginTop: '8px', padding: '8px', background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', borderRadius: '4px', color: 'var(--color-text-primary)' }}
                />
            )}
            {hint && <p className="hint" style={{ marginTop: '6px' }}>{hint}</p>}
        </div>
    );
}
