import { defineConfig } from 'vite'
export default defineConfig({
  root: 'game-runtime', server: { port: 5174, strictPort: true, host: '127.0.0.1', fs: { allow: ['..'] } },
  build: { outDir: '../dist-game', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
})
