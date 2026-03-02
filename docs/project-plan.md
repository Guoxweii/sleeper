# 睡眠记录网站项目文档（MVP）

## 1. 项目目标

构建一个家庭睡眠记录网站，支持多个 Board（如“胖虎的睡眠记录”“爸爸的睡眠记录”），按“单次睡眠”记录数据，并可按周/月进行睡眠分析。
产品以移动端优先，保证夜间快速、低干扰录入。

## 2. 技术选型（已确定）

- 前端：Vue 3 + Vite + Pinia + Vue Router + Tailwind CSS（纯 JS）
- 后端：Node.js + Fastify
- 数据库：SQLite（单文件 `sleep.db`）
- 部署：Docker（单容器全栈部署）
- 登录：应用内登录（账号密码 + HttpOnly Cookie）
- 权限：不做角色隔离，登录后可访问全部 Board

## 3. 核心功能范围（MVP）

### 3.1 登录

- 登录页 `/login`
- 支持登录、退出、登录态检测

### 3.2 Board 管理

- Board 列表页 `/boards`
- 支持新增、编辑、删除 Board

### 3.3 睡眠记录

- Board 记录页 `/boards/:id/records`
- 支持新增、编辑、删除、列表展示
- 睡眠类型：
  - 夜间睡眠（`night`）
  - 午睡（`nap`）
  - 零星睡眠（`fragmented`）

### 3.4 周分析

- 分析页 `/boards/:id/analysis`
- 支持按周选择（ISO 周，周一到周日）
- 输出指标：
  - 周总睡眠时长
  - 日均睡眠时长
  - 夜间/午睡/零星睡眠时长与占比
  - 按天时长分布（柱状图）
  - 平均入睡时间、平均醒来时间（周维度）

### 3.5 月分析

- 分析页 `/boards/:id/analysis/monthly`
- 支持按月选择（自然月）
- 输出指标：
  - 月总睡眠时长
  - 日均睡眠时长
  - 夜间/午睡/零星睡眠时长与占比
  - 按天时长分布（柱状图）
  - 平均入睡时间、平均醒来时间（月维度）

## 4. 数据规则

- 按“一次睡眠”记录，天然支持跨天（如 21:50 -> 次日 08:00）
- `end_at` 可为空（表示进行中）
- 若 `end_at` 不为空，则必须 `end_at > start_at`
- 同一 Board 内记录区间不能重叠
- 数据库存 UTC，前端按本地时区显示
- 默认口径：零星睡眠计入总睡眠时长
- 分析口径：整段睡眠按“苏醒日”归属到对应周/月；进行中记录不参与分析

## 5. 数据库设计（SQLite）

### 5.1 users

- `id` INTEGER PK
- `username` TEXT UNIQUE NOT NULL
- `password_hash` TEXT NOT NULL
- `created_at` TEXT NOT NULL

### 5.2 sessions

- `token` TEXT PK
- `user_id` INTEGER NOT NULL
- `expires_at` TEXT NOT NULL
- `created_at` TEXT NOT NULL

### 5.3 boards

- `id` INTEGER PK
- `name` TEXT NOT NULL
- `description` TEXT NULL
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

### 5.4 sleep_sessions

- `id` INTEGER PK
- `board_id` INTEGER NOT NULL（FK -> boards.id）
- `type` TEXT NOT NULL（`night`/`nap`/`fragmented`）
- `start_at` TEXT NOT NULL
- `end_at` TEXT NULL
- `note` TEXT NULL
- `created_at` TEXT NOT NULL
- `updated_at` TEXT NOT NULL

## 6. API 草案

### 6.1 认证

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`

### 6.2 Board

- `GET /api/boards`
- `GET /api/boards/:id`
- `POST /api/boards`
- `PATCH /api/boards/:id`
- `DELETE /api/boards/:id`

### 6.3 睡眠记录

- `GET /api/boards/:id/sessions`
- `POST /api/boards/:id/sessions`
- `PATCH /api/sessions/:id`
- `DELETE /api/sessions/:id`

### 6.4 周分析

- `GET /api/boards/:id/analysis/weekly?week=2026-W10&tz=Asia/Shanghai`

### 6.5 月分析

- `GET /api/boards/:id/analysis/monthly?month=2026-03&tz=Asia/Shanghai`

## 7. 前端设计原则（现代化 + 移动优先）

- 视觉：清爽渐变背景 + 玻璃卡片层次，避免传统后台白底表格
- 交互：核心按钮大尺寸（触控目标 >= 44px，主按钮高 >= 56px）
- 结构：Board 列表 + Board 内记录/周分析双页签
- 表单：减少输入负担，优先快捷选择
- 可访问性：对比度达标、焦点可见、支持 `prefers-reduced-motion`

## 8. 开发与部署策略

### 8.1 本地开发（命令方式）

```bash
npm install
cp .env.example .env
npm run db:init
npm run dev
```

### 8.2 Docker 部署（生产）

- 单容器运行 Fastify（同时提供 API 与前端静态资源）
- 挂载数据卷持久化数据库（如 `/app/data/sleep.db`）
- 建议环境变量：
  - `TZ=Asia/Shanghai`
  - `APP_PORT`
  - `APP_SECRET`
  - `ADMIN_USER`
  - `ADMIN_PASSWORD`
- 每日备份 `sleep.db` 到备份目录

## 9. 里程碑计划

1. 项目骨架：Vue + Tailwind + Fastify + SQLite
2. 登录与 Board 列表/CRUD
3. 睡眠记录 CRUD（三种类型）
4. 周分析（周选择 + 指标 + 图表）
5. 月分析（月选择 + 指标 + 图表）
6. Docker 化部署与备份脚本
