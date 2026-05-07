import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Post-build plugin: rewrites the inline module script as a plain script tag
// so the single-file output works when opened directly via file:// in Chrome
// (browsers refuse to execute `type="module"` from the file scheme).
//
// Only applied to the `standalone` build mode — Capacitor serves the web
// app over https://localhost, where ES modules work natively, and stripping
// the module attribute there breaks bundle execution (you get a
// completely blank WebView). Hence we keep two build outputs:
//   • default `vite build`      → normal dist/, used by Capacitor
//   • `vite build --mode standalone` → single-file dist/index.html for
//                                       sharing / file:// previews
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

export default defineConfig(({ mode }) => {
  // `standalone` mode → single-file HTML artifact (file:// friendly).
  // Default mode      → conventional dist/ that Capacitor consumes
  //                      (index.html + chunked JS/CSS).
  const standalone = mode === 'standalone'

  return {
    plugins: [
      react(),
      ...(standalone
        ? [viteSingleFile({ removeViteModuleLoader: true }), dropModuleType()]
        : []),
    ],
    build: {
      // ES2018 keeps the bundle compatible with module-less <script> execution
      // (used by the standalone single-file build).
      target: 'es2018',
      // Inline assets only when producing the standalone single-file output;
      // a normal Capacitor build benefits from chunked assets being cached
      // by the WebView between launches.
      assetsInlineLimit: standalone ? 100_000_000 : 4096,
      cssCodeSplit: !standalone,
      rollupOptions: standalone
        ? { output: { inlineDynamicImports: true } }
        : {},
    },
  }
})
