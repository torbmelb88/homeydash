import React, { useState } from 'react';
import { useHomey } from '../context/HomeyContext';
import { findProductImage, useProductImages } from '../services/product-images';

/**
 * Produktbilde-brikke for en enhet. Rendrer `fallback` (typisk Lucide-ikonet) når det ikke
 * finnes noe bilde, når profilen har slått produktbilder av, eller når bildet ikke lastet.
 * CSS: styles/tiles/device-image.css (.device-image). `size` = brikkens kant i px.
 * `slot`: 'corner' (flishodet, tile.settings.productImage) | 'hero' (midten, tile.settings.heroImage)
 * | 'best' (helsider/utvidet: produktbilde, ellers logo). `plain` = bare bildet, uten brikke-bakgrunn
 * (når det ligger i en allerede stylet rund knapp/sirkel).
 */
export default function DeviceImage({ device, tileSettings, size = 40, fallback = null, className = '', badge = false, style, slot = 'corner', plain = false }) {
    const { settings } = useHomey();
    const manifest = useProductImages();
    const [failedUrl, setFailedUrl] = useState(null);

    const img = findProductImage(device, tileSettings, settings, manifest, slot);
    // badge=true: wrapperen (className = statusmerke som .vp-badge/.climate-badge med tone-klasser)
    // rendres alltid, med bildet eller fallback-ikonet inni – merket beholder farge/glød for status.
    if (!img || img.url === failedUrl) return badge ? <div className={className} style={style}>{fallback}</div> : fallback;

    return (
        <div
            className={`device-image${badge ? ' is-badge' : ''}${plain ? ' is-plain' : ''}${img.kind === 'logo' ? ' is-logo' : ''}${img.wide ? ' is-wide' : ''} ${className}`.trim()}
            style={{ ...style, '--di-size': `${size}px` }}
            title={img.label}
        >
            <img src={img.url} alt="" draggable={false} onError={() => setFailedUrl(img.url)} />
        </div>
    );
}
