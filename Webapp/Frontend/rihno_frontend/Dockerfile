# 1. Base Image: We use the stable 'slim' version of Node 20. 
# It provides standard glibc (fixing esbuild native binary crashes) but is much smaller than the full node image.
FROM node:20-slim

LABEL authors="sakibdalal"

# 2. Set the working directory inside the container
WORKDIR /app

# 3. Cache Optimization: Copy package manifests FIRST.
# Docker caches this layer. It will only re-run 'npm install' if these files change.
COPY package*.json ./

# 4. Install dependencies
# We use legacy-peer-deps to avoid strict conflict resolution errors with React 19 / Three.js
RUN npm install --legacy-peer-deps

# 5. Copy the remaining application source code
COPY . .

# 6. Expose Vite's default dev server port
EXPOSE 5173

# 7. Start Command: Run Vite and bind to all network interfaces (so it's accessible from outside the container)
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]