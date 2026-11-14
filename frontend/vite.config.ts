import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import posPwaPlugin from './posPwaPlugin.js';
import { validateProductionApiUrl, validatePublicEnvironment } from './api-url.js';

export default defineConfig(({ command, mode }) => {
    if (command === 'build') {
      const environment = loadEnv(mode, __dirname, '');
      validatePublicEnvironment({ ...environment, ...process.env });
      validateProductionApiUrl(process.env.VITE_API_URL || environment.VITE_API_URL);
    }

    return {
      server: {
        port: 5173,
        strictPort: true,
        host: '0.0.0.0',
      },
      plugins: [react(), posPwaPlugin()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        chunkSizeWarningLimit: 700,
        rollupOptions: {
          output: {
            // Keep shared auth/API modules out of manually grouped role pages.
            // Eager offline entry otherwise creates a production chunk cycle.
            onlyExplicitManualChunks: true,
            manualChunks(id) {
              const normalizedId = id.replace(/\\/g, '/');
              if (normalizedId.includes('/node_modules/')) {
                if (normalizedId.includes('/@zxing/')) return 'scanner-vendor';
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
