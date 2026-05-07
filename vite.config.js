import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Post-build plugin: rewrites the inline module script as a plain script tag
// so the single-file output works when opened directly via file:// in Chrome
// (browsers refuse to execute `type="module"` from the file scheme).
const dropModuleType = () => ({
  name: 'sheen-drop-module-type',
  apply: 'build',
  closeBundle() {
    const out = resolve('dist/index.html')
    try {
      const html = readFileSync(out, 'utf8')
      const patched = html
        .replace(/<script\s+type="module"\s+crossorigin/g, '<script')
        .replace(/<script\s+type="module"/g, '<script')
        .replace(/<script\s+crossorigin/g, '<script')
      writeFileSync(out, patched)
    } catch (e) {
      console.warn('[dropModuleType] could not patch dist/index.html:', e.message)
    }
  },
})

export default defineConfig({
  plugins: [
    react(),
    viteSingleFile({ removeViteModuleLoader: true }),
    dropModuleType(),
  ],
  build: {
    // ES2018 keeps the bundle compatible with module-less <script> execution.
    target: 'es2018',
    assetsInlineLimit: 100_000_000, // inline all assets (logo.png) as base64
    cssCodeSplit: false,
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
})
