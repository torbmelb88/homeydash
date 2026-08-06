import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/main.css'
import './styles/sidebar.css'
import './styles/topbar.css'
import './styles/tiles/index.css'
import './styles/tiles/flow-tile.css'
import App from './App.jsx'
import { HomeyProvider } from './context/HomeyContext'
import { bootstrapDemo } from './services/demo-mode'

// Demo-modus (?demo=1): seeder demo-dashboard og patcher hassAPI FØR appen
// rendres, slik at HomeyContext ser en «ferdig tilkoblet» hub.
bootstrapDemo()

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#111', color: '#eee', fontFamily: 'sans-serif', gap: 16, padding: 24, textAlign: 'center' }}>
          <p style={{ fontSize: '1.1rem', opacity: 0.8 }}>Appen krasjet</p>
          <p style={{ fontSize: '0.85rem', opacity: 0.5, maxWidth: 320 }}>{this.state.error.message}</p>
          <button onClick={() => location.reload()} style={{ padding: '10px 24px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 8, fontSize: '1rem', cursor: 'pointer' }}>Last inn på nytt</button>
        </div>
      );
    }
    return this.props.children;
  }
}

window.__appLoaded = true;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <HomeyProvider>
        <App />
      </HomeyProvider>
    </ErrorBoundary>
  </StrictMode>,
)
