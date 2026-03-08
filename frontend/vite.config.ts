import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [preact(), tailwindcss()],
  worker: {
    format: 'es',       // 'es' | 'iife' (default: 'iife')
    plugins: () => [],  // plugins to apply to worker bundle
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      'lucide-react': 'lucide-preact',
      react: 'preact/compat',
      'react-dom': 'preact/compat',
      'react/jsx-runtime': 'preact/jsx-runtime' // Important for JSX transformations
    },
    
  },
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://localhost:6060',
    },
    headers: {
      'cache-control': 'no-store',
    }
  }
})
