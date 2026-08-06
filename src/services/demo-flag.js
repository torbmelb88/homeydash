// Avgjør om demo-modus er aktiv. Egen minimal modul uten avhengigheter så både
// storage.js og demo-mode.js kan lese flagget uten sirkulære importer.
//
// Aktivering:
//   ?demo=1  → skru på (huskes i localStorage til ?demo=0)
//   ?demo=0  → skru av
//   VITE_DEMO_DEFAULT=1 (byggetid) → demo som standard (brukes av GitHub Pages-bygget)

const resolve = () => {
    if (typeof window === 'undefined') return false;
    try {
        const param = new URLSearchParams(window.location.search).get('demo');
        if (param !== null) {
            const on = param !== '0' && param !== 'false';
            if (on) localStorage.setItem('demoMode', '1');
            else localStorage.removeItem('demoMode');
            return on;
        }
        if (localStorage.getItem('demoMode') === '1') return true;
        return import.meta.env.VITE_DEMO_DEFAULT === '1';
    } catch {
        return false;
    }
};

export const isDemoActive = resolve();
