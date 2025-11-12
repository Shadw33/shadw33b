import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

const API_PROXY_TARGET = process.env.VITE_PROXY_TARGET ?? 'https://wormgpt.ai'
const shouldVerifySsl = API_PROXY_TARGET.startsWith('https://')

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target: API_PROXY_TARGET,
        changeOrigin: true,
        secure: shouldVerifySsl,
      },
    }
  }
})

