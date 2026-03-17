# OmniClip - 你的个人信息锚点

OmniClip 是一个专为**个人**打造的多平台内容聚合器。

在这个充满算法推荐、无限下拉和深度信息茧房的时代，OmniClip 致力于成为你的个人信息锚点。它剥离了噪音、令人上瘾的交互设计以及算法的操纵。你来决定连接哪些平台（GitHub、YouTube、Twitter/X、小红书），OmniClip 会安静地收集、去重，并利用 AI 将你真正关心的内容合成为一个按时间顺序排列的摘要流。

**不追热点，突破信息茧房。**

---

## 架构概览

OmniClip 是基于 Turborepo 的 Monorepo 仓库，包含以下核心模块：

- **Backend (后端)**: NestJS, PostgreSQL（使用行级安全性 RLS 实现多租户隔离）, Redis, BullMQ
- **Frontend (前端)**: Next.js 15 (React 19), Tailwind CSS v4, React Query
- **Extension (浏览器扩展)**: Chrome 扩展程序 (MV3)，无需密码即可安全拦截并桥接网页端的已登录会话数据（如 Twitter/X、小红书）。
- **Shared (共享库)**: 共享的 TypeScript 类型与工具库。

---

## 🤖 快速安装指令 (写给 AI Agent)

如果你是一个 AI Agent 并且正在配置该项目，可以使用以下单行命令来一键引导整个开发环境（前提是系统已安装 Docker, Node.js 20+ 和 pnpm）：

```bash
pnpm install && cp packages/backend/.env.example packages/backend/.env && cp packages/frontend/.env.example packages/frontend/.env && docker-compose up -d && sleep 5 && pnpm --filter backend db:migrate && pnpm dev
```

_注意：要使 AI 摘要功能生效，在初始设置完成后，你需要手动在 `packages/backend/.env` 中配置 `OPENAI_API_KEY`。_

---

## 手动安装指南

### 前置要求

- Node.js 20 LTS
- pnpm 9.x
- Docker & Docker Compose

### 1. 克隆与依赖安装

```bash
git clone https://github.com/MomoP32/omniclip.git
cd omniclip
pnpm install
```

### 2. 启动基础设施

```bash
# 启动 PostgreSQL (5432) 与 Redis (6379)
docker-compose up -d
```

### 3. 环境变量配置

```bash
cp packages/backend/.env.example packages/backend/.env
cp packages/frontend/.env.example packages/frontend/.env
```

请确保在 `packages/backend/.env` 中添加你的 `OPENAI_API_KEY`。

### 4. 数据库初始化

```bash
pnpm --filter backend db:migrate
```

### 5. 启动开发服务器

```bash
# 启动后端 (3001) 与前端 (3000)
pnpm dev
```

---

## 扩展性设计

OmniClip 在设计之初就采用了可插拔的架构。如果要添加一个新平台：

1. 在 `packages/shared` 中定义平台 ID。
2. 在后端实现 `PlatformConnector` 接口。
3. 在后端的 `ConnectorsModule` 中注册该连接器。
4. (如果是基于扩展的集成) 在 `packages/extension` 中添加内容脚本拦截器。
   前端将会自动通过接口动态获取并渲染这个新的连接选项。

---

## 许可证

MIT License
