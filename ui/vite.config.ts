import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const proxy = {
  '/api': `http://127.0.0.1:${process.env.NOMAD_API_PORT ?? '18542'}`,
}

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: Number(process.env.NOMAD_UI_PORT ?? '18543'),
    strictPort: true,
    proxy,
  },
  preview: {
    host: '127.0.0.1',
    port: Number(process.env.NOMAD_PREVIEW_PORT ?? '18544'),
    strictPort: true,
    proxy,
  },
})
