// Produktbilder: små bilder av de faktiske produktene i stedet for Lucide-ikoner.
//
// Biblioteket ligger i public/products/ (gitignored – produsentenes bilder skal ikke i det
// offentlige repoet) og beskrives av public/products/manifest.json, generert av
// scripts/fetch_product_images.py. Mangler manifestet (demo på GitHub Pages, fersk klone)
// faller alt stille tilbake til Lucide.
//
// Manifest-oppføring:
//   { id, file, label, kind: 'product' | 'logo', keys: ['aqara|wsdcgq11lm', ...],
//     match?: '<regex mot enhetsnavn>', wide?: true }
//
// Oppslag (findProductImage): flisens eget valg → customIcon (Lucide vinner) → produsent|modell
// → navneregel → merkelogo for integrasjonen → null.
import { useSyncExternalStore } from 'react';

const baseUrl = import.meta.env.BASE_URL || '/';
const PRODUCTS_URL = `${baseUrl}products/`;

let state = { loaded: false, entries: [], byKey: new Map(), byId: new Map(), rules: [] };
const listeners = new Set();
let loadPromise = null;

export const normKey = (s) => String(s ?? '').toLowerCase().trim().replace(/\s+/g, ' ');

const index = (entries) => {
    const byKey = new Map();
    const byId = new Map();
    const rules = [];
    entries.forEach(e => {
        if (!e || !e.file) return;
        byId.set(e.id, e);
        (e.keys || []).forEach(k => { const nk = normKey(k); if (nk && !byKey.has(nk)) byKey.set(nk, e); });
        if (e.match) {
            try { rules.push({ entry: e, re: new RegExp(e.match, 'i') }); }
            catch { /* ugyldig regex i manifestet – hopp over */ }
        }
    });
    return { loaded: true, entries, byKey, byId, rules };
};

const emit = () => listeners.forEach(fn => fn());

export const loadProductImages = () => {
    if (loadPromise) return loadPromise;
    loadPromise = fetch(`${PRODUCTS_URL}manifest.json`, { cache: 'no-cache' })
        .then(r => (r.ok ? r.json() : null))
        .then(json => {
            state = index(Array.isArray(json?.entries) ? json.entries : []);
            emit();
        })
        .catch(() => {
            state = { ...state, loaded: true };
            emit();
        });
    return loadPromise;
};

const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const getSnapshot = () => state;

/** Hook: re-rendrer når manifestet er lastet. Returnerer manifest-tilstanden. */
export const useProductImages = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

export const productImageUrl = (entry) => {
    if (!entry?.file) return null;
    if (/^(https?:|data:|blob:)/.test(entry.file)) return entry.file;
    return PRODUCTS_URL + entry.file;
};

/** Nøkler i prioritert rekkefølge for en enhet med `product` fra device registry. */
export const productKeysOf = (product) => {
    if (!product) return [];
    const m = normKey(product.manufacturer);
    const model = normKey(product.model);
    const modelId = normKey(product.modelId);
    const keys = [];
    if (m && modelId) keys.push(`${m}|${modelId}`);
    if (m && model) keys.push(`${m}|${model}`);
    if (modelId) keys.push(modelId);
    if (model) keys.push(model);
    return keys;
};

const toResult = (entry) => entry ? ({
    id: entry.id,
    url: productImageUrl(entry),
    label: entry.label || entry.id,
    kind: entry.kind === 'logo' ? 'logo' : 'product',
    wide: !!entry.wide,
}) : null;

export const isImageUrl = (v) => /^(https?:|data:|blob:|\/)/.test(v || '');

/** Beste produktbilde (kind 'product') for enheten: nøkler → navneregel. */
const productEntryOf = (device, manifest) => {
    const product = device.product;
    for (const k of productKeysOf(product)) {
        const hit = manifest.byKey.get(k);
        if (hit && hit.kind !== 'logo') return hit;
    }
    const names = [device.name, product?.haName].filter(Boolean);
    for (const { entry, re } of manifest.rules) {
        if (entry.kind !== 'logo' && names.some(n => re.test(n))) return entry;
    }
    return null;
};

/** Merkelogo for enhetens integrasjon (kind 'logo'). */
const logoEntryOf = (device, manifest) => {
    const integration = device.product?.integration;
    if (!integration) return null;
    const hit = manifest.byKey.get(`brand:${normKey(integration)}`);
    return hit && hit.kind === 'logo' ? hit : null;
};

/**
 * Automatisk treff for en enhet (uten eget valg), per slot:
 * - 'corner' (flishodet): logo når enheten har BÅDE logo og produktbilde (produktbildet går
 *   da til midten), ellers det som finnes.
 * - 'hero' (midten av flisen): produktbildet, men bare når hjørnet viser logoen – ellers
 *   ville samme bilde stått to ganger på flisen.
 * - 'best' (helsider, utvidet visning uten hjørnebrikke): produktbilde, ellers logo.
 */
export const autoProductImage = (device, manifest = state, slot = 'corner') => {
    if (!device || !manifest.loaded) return null;
    const product = productEntryOf(device, manifest);
    const logo = logoEntryOf(device, manifest);
    if (slot === 'hero') return toResult(product && logo ? product : null);
    if (slot === 'best') return toResult(product || logo);
    return toResult(product && logo ? logo : (product || logo));
};

/**
 * Bildet som skal vises for en flis/enhet i gitt slot, eller null (→ Lucide som før).
 * - settings.productImagesEnabled === false slår alt av for profilen
 * - eget valg: tileSettings.productImage (corner) / tileSettings.heroImage (hero, best):
 *   '' = auto, 'none' = av, URL = egen, ellers manifest-id
 * - corner: tileSettings.customIcon (Lucide-hurtigvalg) vinner over automatisk bilde
 * - lys får ikke automatisk bilde (bildet ville vist dimmeren bak bryteren, ikke lampen)
 */
export const findProductImage = (device, tileSettings, settings, manifest = state, slot = 'corner') => {
    if (settings?.productImagesEnabled === false) return null;
    const choice = (slot === 'corner' ? tileSettings?.productImage : tileSettings?.heroImage) || '';
    if (choice === 'none') return null;
    if (choice) {
        if (isImageUrl(choice)) return { id: choice, url: choice, label: 'Egen URL', kind: 'product', wide: false };
        const entry = manifest.byId.get(choice);
        if (entry) return toResult(entry);
        // Ukjent id (manifestet endret) → fall tilbake til automatikk
    }
    if (slot === 'corner' && tileSettings?.customIcon) return null;
    if (device?.class === 'light') return null;
    return autoProductImage(device, manifest, slot);
};
