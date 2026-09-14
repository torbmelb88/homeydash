import React, { useState } from 'react';
import { Menu } from 'lucide-react';
import Topbar from './components/Topbar';
import TileGrid from './components/TileGrid';
import Sidebar from './components/Sidebar';
import BottomNavBar from './components/BottomNavBar';
import ToastContainer from './components/ToastContainer';
import FinishedPromptManager from './components/FinishedPromptManager';
import IncomingCallOverlay from './components/IncomingCallOverlay';
import FamilyPage from './components/FamilyPage';
import EnergyPage from './components/EnergyPage';
import MusicPage from './components/MusicPage';
import MediaLibraryPage from './components/MediaLibraryPage';
import SmokeDetectorPage from './components/SmokeDetectorPage';
import KeypadPage from './components/KeypadPage';
import LightPage from './components/LightPage';
import ProfileSelector from './components/ProfileSelector';
import { useHomey } from './context/HomeyContext';
import { useFullyKiosk } from './hooks/useFullyKiosk';
import { storage } from './services/storage';
import { proxiedServiceUrl } from './services/utils';
import './styles/expanded-tile.css'; // Import styles for expanded overlay

function App() {
  const { isLoading, isInteracting, pages, currentPage, isEditMode, settings, reloadData } = useHomey();
  const [profileReady, setProfileReady] = useState(() => !!storage.getActiveProfile());
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [iframeRefreshKey, setIframeRefreshKey] = useState(0);

  const activePage = pages.find(p => p.id === currentPage);
  const isFamilyPage = activePage?.pageType === 'family';
  const isEnergyPage = activePage?.pageType === 'energy';
  const isMusicPage  = activePage?.pageType === 'music';
  const isMediaPage  = activePage?.pageType === 'media';
  const isSmokePage  = activePage?.pageType === 'smoke';
  const isKeypadPage = activePage?.pageType === 'keypad';
  const isLightsPage = activePage?.pageType === 'lights';
  const isIframePage = !isFamilyPage && !isEnergyPage && !isMusicPage && !isMediaPage && !isSmokePage && !isKeypadPage && !isLightsPage && !!activePage?.iframeUrl;

  // Fullskjerm kodepanel: siden kan be om at topbar + bunnmeny skjules (page.hideChrome).
  // En diskret hjørneknapp viser menyene igjen midlertidig; de skjules på nytt etter
  // 20 s uten sidebytte, eller når man kommer tilbake til kodepanel-siden.
  const [chromeRevealed, setChromeRevealed] = useState(false);
  const wantsHiddenChrome = isKeypadPage && !!activePage?.hideChrome && !isEditMode;
  const hideChrome = wantsHiddenChrome && !chromeRevealed;

  React.useEffect(() => {
    setChromeRevealed(false);
  }, [currentPage]);

  React.useEffect(() => {
    if (!chromeRevealed || !wantsHiddenChrome) return;
    const t = setTimeout(() => setChromeRevealed(false), 20000);
    return () => clearTimeout(t);
  }, [chromeRevealed, wantsHiddenChrome]);

  // Disable screensaver on full page iframes
  useFullyKiosk(isIframePage);

  // Expose refresh function globally for Topbar
  React.useEffect(() => {
    window.refreshCurrentIframe = () => {
      setIframeRefreshKey(prev => prev + 1);
    };
    return () => {
      delete window.refreshCurrentIframe;
    };
  }, []);

  if (!profileReady) {
    return <ProfileSelector onProfileSelected={() => { setProfileReady(true); reloadData(); }} />;
  }

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: 'var(--color-bg-main)',
        color: 'white'
      }}>
        Laster Homey Dashboard...
      </div>
    );
  }



  return (
    <div className={`app-container ${settings?.panelMode ? 'panel-mode' : ''}`}>
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      {!hideChrome && <Topbar onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)} />}
      {hideChrome && (
        <button
          onClick={() => setChromeRevealed(true)}
          aria-label="Vis meny"
          style={{
            position: 'fixed',
            top: 'max(6px, env(safe-area-inset-top))',
            right: '6px',
            zIndex: 1100,
            width: '38px',
            height: '38px',
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer'
          }}
        >
          <Menu size={18} />
        </button>
      )}
      <ToastContainer />
      {/* Globale popuper («dynamiske fliser») — vises uansett aktiv side */}
      <FinishedPromptManager />
      <IncomingCallOverlay />
      <main className="dashboard" style={{
        overflow: isLoading || isInteracting ? 'hidden' : 'auto',
        padding: (isIframePage || isFamilyPage || isEnergyPage || isMusicPage || isMediaPage || isSmokePage || isKeypadPage || isLightsPage) ? 0 : undefined
      }}>
        {/* Main Grid - Keep mounted but hide if showing an iframe, family, energy or music page */}
        <div style={{ display: (isIframePage || isFamilyPage || isEnergyPage || isMusicPage || isMediaPage || isSmokePage || isKeypadPage || isLightsPage) ? 'none' : 'block', height: '100%' }}>
          <TileGrid />
        </div>

        {/* Family pages */}
        {pages.filter(p => p.pageType === 'family').map(page => (
          <div
            key={page.id}
            style={{ display: currentPage === page.id ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}
          >
            <FamilyPage page={page} />
          </div>
        ))}

        {/* Energy pages */}
        {pages.filter(p => p.pageType === 'energy').map(page => (
          <div
            key={page.id}
            style={{ display: currentPage === page.id ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}
          >
            <EnergyPage page={page} />
          </div>
        ))}

        {/* Music pages */}
        {pages.filter(p => p.pageType === 'music').map(page => (
          <div
            key={page.id}
            style={{ display: currentPage === page.id ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}
          >
            <MusicPage page={page} />
          </div>
        ))}

        {/* Media library pages */}
        {pages.filter(p => p.pageType === 'media').map(page => (
          <div
            key={page.id}
            style={{ display: currentPage === page.id ? 'flex' : 'none', flexDirection: 'column', height: '100%', position: 'relative' }}
          >
            <MediaLibraryPage page={page} />
          </div>
        ))}

        {/* Smoke detector pages */}
        {pages.filter(p => p.pageType === 'smoke').map(page => (
          <div
            key={page.id}
            style={{ display: currentPage === page.id ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}
          >
            <SmokeDetectorPage page={page} />
          </div>
        ))}

        {/* Keypad pages */}
        {pages.filter(p => p.pageType === 'keypad').map(page => (
          <div
            key={page.id}
            style={{ display: currentPage === page.id ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}
          >
            <KeypadPage page={page} />
          </div>
        ))}

        {/* Light pages */}
        {pages.filter(p => p.pageType === 'lights').map(page => (
          <div
            key={page.id}
            style={{ display: currentPage === page.id ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}
          >
            <LightPage page={page} />
          </div>
        ))}

        {/* Persistent Iframes - Render all, toggle visibility */}
        {pages.filter(p => p.iframeUrl && p.pageType !== 'family').map(page => (
          <iframe
            key={`${page.id}-${iframeRefreshKey}`}
            src={proxiedServiceUrl(page.iframeUrl)}
            style={{
              display: currentPage === page.id ? 'block' : 'none',
              width: '100%',
              height: '100%',
              border: 'none',
              pointerEvents: isEditMode ? 'none' : 'auto',
              opacity: isEditMode ? 0.7 : 1
            }}
            title={`Full Page View - ${page.name}`}
          />
        ))}
      </main>

      {!hideChrome && <BottomNavBar />}
    </div>
  );
}

export default App;
