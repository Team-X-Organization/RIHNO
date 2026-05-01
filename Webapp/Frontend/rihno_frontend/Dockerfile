FROM node:20-slim

LABEL authors="sakibdalal"

# wget needed for HEALTHCHECK
RUN apt-get update && apt-get install -y --no-install-recommends \
        wget \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --include=optional installs platform-native binaries (rollup, tailwind oxide)
# npm rebuild esbuild fixes "service was stopped" on arm64/amd64 host→container mismatch
COPY package*.json ./
RUN npm install --legacy-peer-deps --include=optional \
    && npm rebuild esbuild \
    && npm cache clean --force

COPY . .

EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:5173 || exit 1

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
