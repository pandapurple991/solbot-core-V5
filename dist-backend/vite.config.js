import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    server: {
        port: 12000,
        host: '0.0.0.0',
        strictPort: false,
        cors: true,
        allowedHosts: ['work-1-necibljsbhoactmh.prod-runtime.all-hands.dev', 'work-2-necibljsbhoactmh.prod-runtime.all-hands.dev'],
        headers: {
            'X-Frame-Options': 'ALLOWALL',
            'Access-Control-Allow-Origin': '*',
        },
        proxy: {
            '/api': {
                target: 'http://localhost:12001',
                changeOrigin: true,
                secure: false
            }
        }
    },
    define: {
        // Ensure proper Node.js globals are available
        global: 'globalThis',
    },
    build: {
        target: 'esnext',
        outDir: 'dist',
        assetsDir: 'assets',
        minify: true,
        sourcemap: false,
        rollupOptions: {
            output: {
                manualChunks: {
                    react: ['react', 'react-dom', 'react-router-dom'],
                    redux: ['@reduxjs/toolkit', 'react-redux'],
                    ui: ['lucide-react', 'react-hot-toast', 'framer-motion'],
                    charts: ['recharts'],
                    utils: ['date-fns', 'date-fns-tz', 'clsx', 'tailwind-merge']
                }
            }
        }
    }
});
//# sourceMappingURL=vite.config.js.map