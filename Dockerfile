FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server.js ./
COPY server ./server
COPY public ./public
COPY scripts/host-link.js ./scripts/host-link.js
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV PORT=8443 BIND=0.0.0.0 RANGE_DATA_DIR=/app/data
EXPOSE 8443
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:8443/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
