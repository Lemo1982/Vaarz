import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'


/**
 * Vite's dev server injects an inline React-refresh preamble, so development
 * needs `unsafe-inline` for scripts. The packaged app keeps a strict policy.
 */
const BASE_CSP = [
  "default-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' vaarz-media: data: blob:",
  "media-src 'self' vaarz-media: blob:",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "worker-src 'self'",
].join('; ')

const PROD_CSP = `${BASE_CSP}; script-src 'self'; connect-src 'self';`
const DEV_CSP = `${BASE_CSP}; script-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:5273 http://localhost:5273;`

export default defineConfig(({ command }) => ({
  root: 'src/renderer',
  base: './',
  plugins: [
    react(),
    {
      name: 'vaarz-csp',
      transformIndexHtml(html) {
        return html.replace('%VAARZ_CSP%', command === 'serve' ? DEV_CSP : PROD_CSP)
      },
    },
  ],
  server: { port: 5273, strictPort: true },
  build: {
    outDir: resolve(process.cwd(), 'dist'),
    emptyOutDir: true,
  },
}))
