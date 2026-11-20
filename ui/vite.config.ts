import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.NOMAD_UI_PORT ?? '18543'),
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: Number(process.env.NOMAD_PREVIEW_PORT ?? '18544'),
    strictPort: true,
  },
})
