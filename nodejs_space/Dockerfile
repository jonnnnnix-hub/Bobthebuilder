# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn .yarn

RUN corepack enable && yarn install --immutable

COPY prisma/ prisma/
COPY src/ src/
COPY tsconfig.json tsconfig.build.json nest-cli.json ./

RUN npx prisma generate && yarn build

# Stage 2: Production
FROM node:22-alpine

WORKDIR /app

COPY --from=builder /app/dist dist/
COPY --from=builder /app/prisma prisma/
COPY --from=builder /app/node_modules node_modules/
COPY --from=builder /app/.yarnrc.yml .yarnrc.yml
COPY --from=builder /app/package.json package.json
COPY --from=builder /app/yarn.lock yarn.lock

COPY start.sh start.sh
RUN chmod +x start.sh

EXPOSE 3000

CMD ["./start.sh"]
