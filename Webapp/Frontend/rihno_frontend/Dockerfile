# RIHNO Frontend — Vite + React (dev container)
# Build: docker build -t rihno-frontend .
# Run:   docker run -p 5173:5173 --env-file .env rihno-frontend

FROM node:20-slim

LABEL authors="sakibdalal"

WORKDIR /app

# Cache deps layer
COPY package*.json ./
RUN npm install --legacy-peer-deps && npm cache clean --force

# App source
COPY . .

EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget -qO- http://localhost:5173 || exit 1

# Bind to 0.0.0.0 so the dev server is reachable from outside the container
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
