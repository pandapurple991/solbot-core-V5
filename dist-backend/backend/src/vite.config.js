"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vite_1 = require("vite");
const plugin_react_1 = __importDefault(require("@vitejs/plugin-react"));
// https://vitejs.dev/config/
exports.default = (0, vite_1.defineConfig)({
    plugins: [(0, plugin_react_1.default)()],
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