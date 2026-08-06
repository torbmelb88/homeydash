import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    // Settes til f.eks. '/homeydash/' av GitHub Pages-bygget
    base: env.VITE_BASE_PATH || '/',
    plugins: [react()],
    build: {
      target: ['chrome87', 'firefox78', 'safari14', 'edge88'],
    },
    server: {
      proxy: {
        '/homey-api': {
          target: env.VITE_HOMEY_PROXY_TARGET || 'http://192.168.1.100',
          changeOrigin: true,
          secure: false,
          ws: true,
          rewrite: (path) => path.replace(/^\/homey-api/, '')
        },
        '/music-assistant': {
          target: env.VITE_MA_PROXY_TARGET || 'http://192.168.1.100:8095',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/music-assistant/, '')
        },
        '/todoist-api': {
          target: 'https://api.todoist.com',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/todoist-api/, '/api/v1')
        },
        '/todoist-sync': {
          target: 'https://api.todoist.com',
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/todoist-sync/, '/api/v1')
        }
      }
    }
  }
})
