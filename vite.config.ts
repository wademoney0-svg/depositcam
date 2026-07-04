import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // GH_PAGES is set when building for GitHub Pages, which serves from /deposit-proof/
  base: process.env.GH_PAGES ? '/deposit-proof/' : '/',
  plugins: [react()],
  server: { host: true },
})
