import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // El front habla siempre con /api: en desarrollo se redirige al API local,
    // en produccion lo sirve el mismo dominio detras del proxy inverso.
    proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: true } },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Recharts pesa mas que el resto de la aplicacion junta: en su propio
        // chunk se cachea aparte y no se reinvalida con cada despliegue.
        manualChunks: {
          graficos: ['recharts'],
          proveedores: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'],
        },
      },
    },
  },
});
