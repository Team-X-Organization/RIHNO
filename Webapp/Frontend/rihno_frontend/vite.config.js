import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fromNodeProviderChain } from '@aws-sdk/credential-providers'

const credentialsMiddleware = () => ({
  name: 'aws-credentials',
  configureServer(server) {
    server.middlewares.use('/api/credentials', async (req, res, next) => {
      if (req.url === '/') {
        try {
          const credentials = await fromNodeProviderChain()();
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            accessKeyId: credentials.accessKeyId,
            secretAccessKey: credentials.secretAccessKey,
            sessionToken: credentials.sessionToken || null,
            region: process.env.AWS_REGION || 'us-east-1'
          }));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err.message }));
        }
      } else {
        next();
      }
    });
  }
});

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), credentialsMiddleware()],
  optimizeDeps: {
    exclude: [
      '@aws-sdk/client-bedrock-runtime',
      '@aws-sdk/credential-providers',
    ],
  },
  build: {
    // skip esbuild minifier — crashes in Docker with <2GB RAM
    minify: false,
    rollupOptions: {
      // externalize react + 3D stack so Rollup skips parsing ~200MB of source
      // (drei transitively pulls three-stdlib/stats-gl/hls.js/mediapipe)
      // all resolved at runtime via importmap in index.html
      external: (id) => {
        const pkgs = ['react', 'react-dom', 'three', '@react-three/fiber', '@react-three/drei'];
        return pkgs.some(p => id === p || id.startsWith(p + '/'));
      },
      maxParallelFileOps: 3,
    },
  },
})
