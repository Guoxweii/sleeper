# 睡眠记录网站（Sleeper）

一个面向家庭场景的睡眠记录系统，支持多个 Board（例如胖虎、爸爸），并提供按周与按月分析。

## 技术栈

- 前端：Vue 3 + Vite + Pinia + Vue Router + Tailwind CSS
- 后端：Node.js + Fastify
- 数据库：SQLite
- 部署：Docker

## 本地开发（不走 Docker）

```bash
npm install
cp .env.example .env
npm run db:init
npm run dev
```

默认地址：

- 前端：`http://localhost:5173`
- API：`http://localhost:3000`

## 常用命令

```bash
# 只启动后端
npm run dev:api

# 只启动前端
npm run dev:web

# 初始化数据库与默认账号/Board
npm run db:init

# 构建前端
npm run build

# 生产启动（由 Fastify 提供前端静态资源）
npm run start
```

## 默认初始化数据

执行 `npm run db:init` 后，若数据库为空会自动创建：

- 管理员账号：`admin`（密码来自 `.env` 的 `ADMIN_PASSWORD`）
- 默认 Board：`胖虎的睡眠记录`、`爸爸的睡眠记录`

## Docker 部署

在本地开发机执行一条命令（使用 `scp -O` 同步）并发布：

```bash
npm run deploy
```

脚本会自动完成：

- 打包当前项目并通过 `scp -O` 上传到服务器
- 解压到 `DEPLOY_PATH`（默认 `/volume1/docker/sleeper`）
- 自动创建 `DEPLOY_PATH/data` 目录用于数据库持久化
- 在服务器执行容器重建发布（`docker compose up -d --build --remove-orphans`）

可选参数：

```bash
# 指定服务器地址（默认 root@local-nas）
DEPLOY_HOST=root@local-nas npm run deploy

# 指定服务器项目目录（默认 /volume1/docker/sleeper）
DEPLOY_PATH=/volume1/docker/sleeper npm run deploy

# 指定 SSH 端口（默认使用 22）
DEPLOY_PORT=22 npm run deploy

# 快速发布：同步代码并重启容器，不重建镜像
npm run deploy:quick

# 等价于快速发布
DEPLOY_WITH_BUILD=0 npm run deploy
```

仅在服务器项目目录手动重建并发布：

```bash
docker compose up -d --build --remove-orphans
```

当前不做宿主机 `ports` 映射（不会暴露 `22` 或 `3000`），通过 Traefik 的 `sleeper` 入口转发到容器 `3000` 端口。

生产环境建议：

- 修改 `.env` 中 `APP_SECRET` 和 `ADMIN_PASSWORD`
- 挂载 `./data` 持久化 `sleep.db`
- 增加数据库文件定期备份
- 确保 Docker 已存在外部网络 `traefik`（示例：`docker network create traefik`）

## 文档

- 项目方案文档：`docs/project-plan.md`
