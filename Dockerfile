FROM node:22-bookworm-slim

WORKDIR /app
RUN chown node:node /app && mkdir -p /data/storage && chown node:node /data/storage

# Everything below runs as the unprivileged node user — including the
# build, so no root-owned files exist to chown later (which would double
# the image size in an extra layer).
USER node

# Dev dependencies are installed on purpose: the worker (tsx), migrations
# (drizzle), and the seed script run from source in this image. The image
# is internal-only — the reverse proxy is the only public surface.
COPY --chown=node:node package.json package-lock.json ./
RUN npm ci

COPY --chown=node:node . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["npm", "run", "start"]
