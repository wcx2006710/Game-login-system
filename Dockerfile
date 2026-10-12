# Game Login System - 本地后端 + 静态站点
#
# 构建：docker build -t game-login-system .
# 运行：docker run --rm --network host -v game-login-data:/app/data game-login-system
#
# 注意：server.js 监听 127.0.0.1，因此容器需使用 --network host
#      （或使用 docker run -p 3000:3000 且把监听地址改为 0.0.0.0）

FROM node:22.11-bookworm-slim

# better-sqlite3 为原生模块，需要编译工具链
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 先只复制依赖清单，充分利用 Docker 层缓存
COPY local/package.json local/package-lock.json ./local/
RUN cd local && npm ci --omit=dev && npm cache clean --force

COPY local ./local
COPY public ./public
COPY test-local.mjs test-edge-functions.mjs ./

# 数据库目录（挂载卷持久化）
RUN mkdir -p /app/data
VOLUME ["/app/data"]

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "local/server.js"]
