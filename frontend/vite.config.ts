import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Transpile to ES5 for old intranet browsers (Chrome 60+, Firefox 60+, Edge 18+)
    legacy({
      targets: ['chrome >= 60', 'firefox >= 60', 'safari >= 11', 'edge >= 18'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime'],
      modernPolyfills: true,
      renderLegacyChunks: true,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  assetsInclude: ['**/*.svg', '**/*.csv'],
  build: {
    minify: 'terser',
    terserOptions: {
      compress: { drop_debugger: true },
    },
    // Inline small assets (icons, tiny images) to avoid extra HTTP requests
    assetsInlineLimit: 8192,
    rollupOptions: {
      output: {
        manualChunks: {
          react:  ['react', 'react-dom', 'react-router'],
          ui:     ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu',
                   '@radix-ui/react-select', '@radix-ui/react-tabs',
                   '@radix-ui/react-tooltip', 'lucide-react'],
          motion: ['motion'],
          charts: ['recharts'],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/v1':  'http://localhost:8000',
    },
  },
})
