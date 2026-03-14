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
          // This executes in Node.js (Vite server process), so it can read ~/.aws/credentials
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
})
