import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { validateProductionApiUrl } from './api-url.js';

export default defineConfig(({ command, mode }) => {
    if (command === 'build') {
      const environment = loadEnv(mode, __dirname, '');
      validateProductionApiUrl(process.env.VITE_API_URL || environment.VITE_API_URL);
    }

    return {
      server: {
        port: 5173,
        host: '0.0.0.0',
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        chunkSizeWarningLimit: 700,
        rollupOptions: {
          output: {
            manualChunks(id) {
              const normalizedId = id.replace(/\\/g, '/');
              if (normalizedId.includes('/node_modules/')) {
                if (normalizedId.includes('/framer-motion/')) return 'motion-vendor';
                if (normalizedId.includes('/recharts/')) return 'charts-vendor';
                if (normalizedId.includes('/socket.io-client/')) return 'socket-vendor';
                if (normalizedId.includes('/lucide-react/')) return 'icons-vendor';
                return 'vendor';
              }
              if (normalizedId.includes('/pages/owner/') || normalizedId.includes('/pages/superadmin/') || normalizedId.includes('/pages/staff/')) {
                return 'admin-pages';
              }
              if (normalizedId.includes('/pages/customer/')) {
                return 'customer-pages';
              }
              if (normalizedId.includes('/pages/Support/')) {
                return 'support-pages';
              }
            },
          },
        },
      },
    };
});
