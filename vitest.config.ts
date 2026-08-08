import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Configuración de Vitest (tests unitarios + de componentes).
// El alias '@' debe coincidir con el de vite.config.ts para que los imports
// de los tests resuelvan igual que en la app.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})