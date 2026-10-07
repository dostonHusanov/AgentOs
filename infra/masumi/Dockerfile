FROM node:22-slim
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@10.30.2
WORKDIR /usr/src/app
COPY . .
RUN pnpm install --frozen-lockfile
RUN node agentos-refund-patch.cjs
RUN NODE_OPTIONS=--max-old-space-size=4096 pnpm run build
ENV NODE_ENV=production
EXPOSE 3001
CMD ["sh", "-c", "pnpm run prisma:migrate && pnpm run prisma:seed && pnpm run start"]
