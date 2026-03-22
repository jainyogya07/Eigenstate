import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite' // 1. Add this import

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(), // 2. Add this to your plugins
  ],
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/repos': { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/healthz': { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/webhook': { target: 'http://127.0.0.1:8080', changeOrigin: true },
      '/metrics': { target: 'http://127.0.0.1:8080', changeOrigin: true },
    },
  },
})