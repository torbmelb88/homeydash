import { useState, useEffect } from 'react';
import { storage } from '../services/storage';

export default function ProfileSelector({ onProfileSelected }) {
    const [profiles, setProfiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newName, setNewName] = useState('');
    const [creating, setCreating] = useState(false);
    const [copyFrom, setCopyFrom] = useState(''); // '' = tom profil, ellers profil-id å kopiere fra
    const [error, setError] = useState('');

    useEffect(() => {
        const timeout = setTimeout(() => setLoading(false), 6000);
        storage.listProfiles()
            .then(p => { setProfiles(p); setLoading(false); clearTimeout(timeout); })
            .catch(() => { setLoading(false); clearTimeout(timeout); });
        return () => clearTimeout(timeout);
    }, []);

    async function selectProfile(profile) {
        storage.setActiveProfile(profile.id);
        onProfileSelected(profile);
    }

    async function createAndSelect() {
        const name = newName.trim();
        if (!name || creating) return;
        setCreating(true);
        setError('');
        let profile = null;
        try {
            profile = await storage.createProfile(name);
            if (copyFrom) await storage.copyProfileData(copyFrom, profile.id);
        } catch (e) {
            console.warn('Failed to create profile:', e);
            // Ikke la en halvkopiert profil bli liggende i listen
            if (profile) await storage.deleteProfile(profile.id).catch(() => {});
            setError('Kunne ikke opprette profilen. Sjekk nettforbindelsen og prøv igjen.');
            setCreating(false);
            return;
        }
        storage.setActiveProfile(profile.id);
        onProfileSelected(profile);
    }

    return (
        <div style={{
            position: 'fixed', inset: 0, background: '#0f1117',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, fontFamily: 'system-ui, sans-serif',
        }}>
            <div style={{
                background: '#1a1d27', borderRadius: 16, padding: '2rem',
                width: 340, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                color: '#fff',
            }}>
                <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.3rem' }}>Velg profil</h2>
                <p style={{ margin: '0 0 1.5rem', color: '#888', fontSize: '0.9rem' }}>
                    Hver enhet bruker sin egen profil med separat konfigurasjon.
                </p>

                {loading ? (
                    <p style={{ color: '#888', textAlign: 'center' }}>Laster...</p>
                ) : (
                    <>
                        {profiles.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: '1.5rem' }}>
                                {profiles.sort((a, b) => a.name.localeCompare(b.name)).map(p => (
                                    <button key={p.id} onClick={() => selectProfile(p)} style={{
                                        background: '#2a2d3a', border: '1px solid #3a3d4a',
                                        borderRadius: 10, padding: '0.75rem 1rem',
                                        color: '#fff', fontSize: '1rem', cursor: 'pointer',
                                        textAlign: 'left', transition: 'background 0.15s',
                                    }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#353849'}
                                        onMouseLeave={e => e.currentTarget.style.background = '#2a2d3a'}
                                    >
                                        {p.name}
                                    </button>
                                ))}
                            </div>
                        )}

                        <div style={{ borderTop: profiles.length ? '1px solid #2a2d3a' : 'none', paddingTop: profiles.length ? '1.5rem' : 0 }}>
                            <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: '#aaa' }}>
                                {profiles.length ? 'Eller opprett ny profil:' : 'Gi profilen et navn for å komme i gang:'}
                            </p>
                            <div style={{ display: 'flex', gap: 8 }}>
                                <input
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && createAndSelect()}
                                    placeholder='f.eks. Nettbrett'
                                    autoFocus
                                    style={{
                                        flex: 1, background: '#2a2d3a', border: '1px solid #3a3d4a',
                                        borderRadius: 8, padding: '0.6rem 0.75rem',
                                        color: '#fff', fontSize: '0.95rem', outline: 'none',
                                    }}
                                />
                                <button
                                    onClick={createAndSelect}
                                    disabled={!newName.trim() || creating}
                                    style={{
                                        background: '#4f8ef7', border: 'none', borderRadius: 8,
                                        padding: '0.6rem 1rem', color: '#fff', fontSize: '0.95rem',
                                        cursor: newName.trim() ? 'pointer' : 'not-allowed',
                                        opacity: newName.trim() ? 1 : 0.5,
                                    }}
                                >
                                    {creating ? (copyFrom ? 'Kopierer…' : 'Opprettes…') : 'Opprett'}
                                </button>
                            </div>

                            {profiles.length > 0 && (
                                <>
                                    <label style={{ display: 'block', margin: '0.9rem 0 0.4rem', fontSize: '0.85rem', color: '#aaa' }}>
                                        Start med:
                                    </label>
                                    <select
                                        value={copyFrom}
                                        onChange={e => setCopyFrom(e.target.value)}
                                        disabled={creating}
                                        style={{
                                            width: '100%', background: '#2a2d3a', border: '1px solid #3a3d4a',
                                            borderRadius: 8, padding: '0.6rem 0.75rem',
                                            color: '#fff', fontSize: '0.95rem', outline: 'none',
                                        }}
                                    >
                                        <option value=''>Tom profil</option>
                                        {[...profiles].sort((a, b) => a.name.localeCompare(b.name)).map(p => (
                                            <option key={p.id} value={p.id}>Kopi av «{p.name}»</option>
                                        ))}
                                    </select>
                                    {copyFrom && (
                                        <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: '#888' }}>
                                            Sider, fliser og innstillinger kopieres. Kopien er uavhengig –
                                            endringer påvirker ikke originalen.
                                        </p>
                                    )}
                                </>
                            )}

                            {error && (
                                <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: '#f87171' }}>{error}</p>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
