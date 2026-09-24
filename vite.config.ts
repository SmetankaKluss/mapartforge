import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { staticPublicRoutes } from './scripts/staticRoutes'
import { classicPublicRoutes } from './scripts/classicRoutes'
import { fileURLToPath } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), staticPublicRoutes(), classicPublicRoutes()],
  server: {
    host: true,
    port: parseInt(process.env.PORT || '5173'),
  },
  worker: {
    format: 'es',
  },
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        classicCloud: fileURLToPath(new URL('./src/classicCloudBridge.ts', import.meta.url)),
      },
      output: {
        entryFileNames: (chunk) => chunk.name === 'classicCloud' ? 'classic-cloud-api.js' : 'assets/[name]-[hash]-v2.js',
        chunkFileNames: `assets/[name]-[hash]-v2.js`,
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'vendor-react';
          if (id.includes('node_modules/three')) return 'vendor-three';
          if (id.includes('node_modules/jszip')) return 'vendor-jszip';
          if (id.includes('node_modules/@supabase/supabase-js')) return 'vendor-supabase';
          if (id.includes('node_modules/driver.js')) return 'vendor-driver';
          if (id.includes('node_modules/gifuct-js')) return 'vendor-gif';
          if (id.includes('node_modules/@iconify')) return 'vendor-iconify';
          if (id.includes('node_modules/lz-string')) return 'vendor-lz';
          if (id.includes('node_modules/@reduxjs/toolkit')) return 'vendor-redux';
          if (id.includes('node_modules/nbt-ts')) return 'vendor-nbt';
        },
      },
    },
  },
})
