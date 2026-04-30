# RIHNO Backend — Express API
# Build: docker build -t rihno-backend .
# Run:   docker run -p 5050:5050 --env-file .env rihno-backend

FROM node:20-alpine

LABEL authors="sakibdalal"

ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=warn

WORKDIR /usr/src/app

# Cache deps layer
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# App source
COPY . .

# Drop privileges
RUN chown -R node:node /usr/src/app
USER node

EXPOSE 5050

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:5050/api/backend_check || exit 1

CMD ["node", "index.js"]
