// Musikkside (Music Assistant) med Spotify-lignende oppbygning:
//  - nettbrett/PC: venstre navigasjon (Hjem/Søk/Bibliotek + spillelister),
//    hovedvisning i midten, valgfritt køpanel til høyre, spillerlinje nederst
//  - mobil: fullbredde visning, minispiller + bunnfaner; minispiller åpner
//    fullskjerm «spilles nå» med kø og høyttalervalg
// All tilstand/kommandoer ligger i useMusicEngine; visninger i ./music/.
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Home, Search, Library, ArrowLeft, Settings, WifiOff } from 'lucide-react';
import { useHomey } from '../context/HomeyContext';
import { maAPI } from '../services/ma-api';
import { useMusicEngine } from './music/useMusicEngine';
import { useLayout, useMaData } from './music/musicUtils';
import { HomeView, SearchView, LibraryView, DetailView, QueueView, ItemMenu, Art } from './music/MusicViews';
import { NowPlayingBar, MiniPlayer, NowPlayingSheet } from './music/NowPlaying';
import DevicePicker from './music/DevicePicker';
import MASettingsOverlay from './music/MASettingsOverlay';
import '../styles/music-page.css';

const ROOT_TABS = [
  { key: 'home', label: 'Hjem', Icon: Home },
  { key: 'search', label: 'Søk', Icon: Search },
  { key: 'library', label: 'Bibliotek', Icon: Library },
];

const viewKey = (v) => `${v.type}:${v.item?.uri || v.item?.item_id || v.libType || ''}`;
const viewTitle = (v) => ({ home: 'Hjem', search: 'Søk', library: 'Ditt bibliotek', queue: 'Kø' }[v.type] || v.item?.name || '');

export default function MusicPage({ page }) {
  const { isEditMode } = useHomey();
  const rootRef = useRef(null);
  const mainRef = useRef(null);
  const layout = useLayout(rootRef);
  const engine = useMusicEngine();

  const [stack, setStack] = useState([{ type: 'home' }]);
  const [queueOpen, setQueueOpen] = useState(() => localStorage.getItem('mp_queue_open') === '1');
  const [devices, setDevices] = useState(null);      // null | { rect }
  const [sheetOpen, setSheetOpen] = useState(false); // mobil: fullskjerm «spilles nå»
  const [menu, setMenu] = useState(null);            // { item, rect, context }
  const [showSettings, setShowSettings] = useState(false);

  // Åpne oppsett automatisk hvis MA-token mangler (etter at lagret konfig er lest)
  useEffect(() => {
    let cancelled = false;
    maAPI.loadConfig().finally(() => { if (!cancelled && !maAPI.token) setShowSettings(true); });
    return () => { cancelled = true; };
  }, []);

  const view = stack[stack.length - 1];
  const rootTab = stack[0].type;

  const navigate = useCallback((v) => setStack(s => {
    const top = s[s.length - 1];
    if (viewKey(top) === viewKey(v)) return s;
    return [...s, v];
  }), []);
  const goRoot = useCallback((type) => {
    setStack(s => (s.length === 1 && s[0].type === type ? s : [{ type }]));
    mainRef.current?.scrollTo?.({ top: 0 });
  }, []);
  const back = useCallback(() => setStack(s => (s.length > 1 ? s.slice(0, -1) : s)), []);

  const currentKey = viewKey(view);
  useEffect(() => { mainRef.current?.scrollTo?.({ top: 0 }); }, [currentKey]);
  useEffect(() => { try { localStorage.setItem('mp_queue_open', queueOpen ? '1' : '0'); } catch { /* ignore */ } }, [queueOpen]);

  const ui = useMemo(() => ({
    engine,
    layout,
    openItem: (item) => {
      if (!item?.media_type) return;
      setSheetOpen(false);
      navigate({ type: 'detail', item });
    },
    goToArtist: (artist) => {
      if (!artist?.item_id) return;
      setSheetOpen(false);
      navigate({ type: 'detail', item: { ...artist, media_type: 'artist' } });
    },
    openMenu: (item, e, context) => {
      const rect = e?.currentTarget?.getBoundingClientRect?.() || null;
      setMenu({ item, rect, context: context || null });
    },
    showAll: (libType) => navigate({ type: 'library', libType }),
    openSettings: () => setShowSettings(true),
  }), [engine, layout, navigate]);

  const toggleQueue = useCallback(() => {
    if (layout === 'wide') { setQueueOpen(v => !v); return; }
    if (view.type === 'queue') back(); else navigate({ type: 'queue' });
  }, [layout, view.type, back, navigate]);

  // Spillelister i venstremenyen (deler cache med biblioteksvisningen)
  const sidePlaylists = useMaData('lib:playlist:all', () =>
    maAPI.getLibraryItems('playlist', { limit: 500, orderBy: 'name' }), engine.maConnected && layout === 'wide');
  const sideList = useMemo(() => [...(sidePlaylists.data || [])]
    .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'nb')), [sidePlaylists.data]);

  const renderView = () => {
    switch (view.type) {
      case 'search':  return <SearchView ui={ui} />;
      case 'library': return <LibraryView ui={ui} type={view.libType || 'playlist'} />;
      case 'detail':  return <DetailView key={currentKey} item={view.item} ui={ui} />;
      case 'queue':   return <QueueView ui={ui} />;
      default:        return <HomeView ui={ui} />;
    }
  };

  const queueActive = layout === 'wide' ? queueOpen : view.type === 'queue';

  return (
    <div ref={rootRef} className={`music-page music-page--${layout}${isEditMode ? ' music-page--edit' : ''}`}>
      {showSettings && <MASettingsOverlay onClose={() => setShowSettings(false)} />}

      <div className="mp-body">
        {layout !== 'mobile' && (
          <nav className="mp-nav">
            <div className="mp-nav-tabs">
              {ROOT_TABS.map(t => (
                <button
                  key={t.key}
                  className={`mp-nav-item${rootTab === t.key && view.type !== 'queue' ? ' mp-nav-item--on' : ''}`}
                  onClick={() => goRoot(t.key)}
                  title={t.label}
                >
                  <t.Icon size={24} />
                  <span>{t.label}</span>
                </button>
              ))}
            </div>

            {layout === 'wide' && (
              <div className="mp-nav-lib">
                <div className="mp-nav-libhead">Spillelister</div>
                <div className="mp-nav-liblist">
                  {sideList.map(pl => (
                    <button
                      key={pl.uri}
                      className={`mp-nav-pl${view.item?.uri === pl.uri ? ' mp-nav-pl--on' : ''}`}
                      onClick={() => ui.openItem(pl)}
                    >
                      <Art item={pl} type="playlist" size={44} />
                      <span className="mp-nav-pl-meta">
                        <span className="mp-nav-pl-name">{pl.name}</span>
                        <span className="mp-nav-pl-sub">Spilleliste{pl.owner ? ` · ${pl.owner}` : ''}</span>
                      </span>
                    </button>
                  ))}
                  {engine.maConnected && sidePlaylists.data && !sideList.length && (
                    <div className="mp-empty">Ingen spillelister</div>
                  )}
                </div>
              </div>
            )}

            <div className="mp-nav-foot">
              <button className="mp-nav-item mp-nav-item--small" onClick={() => setShowSettings(true)} title="Music Assistant-tilkobling">
                {engine.maConnected ? <Settings size={20} /> : <WifiOff size={20} className="mp-danger" />}
                <span>{engine.maConnected ? 'Music Assistant' : 'Ikke tilkoblet'}</span>
              </button>
            </div>
          </nav>
        )}

        <main className="mp-main" ref={mainRef}>
          {!engine.maConnected && (
            <div className="mp-banner">
              <WifiOff size={16} />
              <span>Ikke tilkoblet Music Assistant – søk og bibliotek er utilgjengelig.</span>
              <button className="mp-linkbtn" onClick={() => setShowSettings(true)}>Innstillinger</button>
            </div>
          )}
          {stack.length > 1 && (
            <div className="mp-main-bar">
              <button className="mp-iconbtn mp-backbtn" onClick={back} title={`Tilbake fra ${viewTitle(view)}`}><ArrowLeft size={22} /></button>
            </div>
          )}
          {renderView()}
        </main>

        {layout === 'wide' && queueOpen && (
          <aside className="mp-queuepanel">
            <QueueView ui={ui} panel />
          </aside>
        )}
      </div>

      {layout !== 'mobile' ? (
        <NowPlayingBar
          engine={engine}
          ui={ui}
          queueOpen={queueActive}
          onToggleQueue={toggleQueue}
          onOpenDevices={(rect) => setDevices({ rect })}
          devicesOpen={!!devices}
        />
      ) : (
        <>
          {engine.players.length > 0 && (
            <MiniPlayer engine={engine} onExpand={() => setSheetOpen(true)} onOpenDevices={() => setDevices({ rect: null })} />
          )}
          <nav className="mp-tabs">
            {ROOT_TABS.map(t => (
              <button key={t.key} className={`mp-tab${rootTab === t.key ? ' mp-tab--on' : ''}`} onClick={() => goRoot(t.key)}>
                <t.Icon size={24} />
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
        </>
      )}

      {sheetOpen && layout === 'mobile' && (
        <NowPlayingSheet
          engine={engine}
          ui={ui}
          onClose={() => setSheetOpen(false)}
          onOpenDevices={() => setDevices({ rect: null })}
          renderQueue={() => <QueueView ui={ui} panel />}
        />
      )}
      {devices && (
        <DevicePicker engine={engine} layout={layout} anchorRect={devices.rect} onClose={() => setDevices(null)} />
      )}
      {menu && <ItemMenu menu={menu} ui={ui} onClose={() => setMenu(null)} />}

      {isEditMode && <div className="mp-edit-label">{page?.name || 'Musikk'}</div>}
    </div>
  );
}
