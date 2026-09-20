import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    hmr: { overlay: false },
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
      '/media': { target: 'http://127.0.0.1:8787', changeOrigin: true },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/tests/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/tests/**', 'src/**/*.d.ts'],
      reporter: ['text', 'html'],
      // گیت ratchet — بالاتر از این، CI قرمز می‌شود. کف واقع‌بینانه بر پایه پوشش فعلی؛
      // با هر فیچر جدید باید این اعداد «بالا» برود (منطق هسته: store 93%، utils 82%+ پوشش دارد)
      thresholds: { statements: 65, branches: 72, functions: 55, lines: 65 },
    },
  },
})
