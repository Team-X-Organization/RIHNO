FROM node:20-slim

LABEL authors="sakibdalal"

# wget needed for HEALTHCHECK
RUN apt-get update && apt-get install -y --no-install-recommends \
        wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps --include=optional \
    && npm rebuild esbuild \
    && npm cache clean --force

COPY . .

# Production build — Rollup handles all CJS/ESM interop correctly
# NODE_OPTIONS increases heap for large packages (three.js, AWS SDK)
RUN NODE_OPTIONS="--max-old-space-size=1400" npm run build

EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -qO- http://localhost:5173 || exit 1

CMD ["npx", "vite", "preview", "--host", "0.0.0.0", "--port", "5173"]
