# OmniClip - 你的个人信息锚点

OmniClip 是一个专为**个人**打造的多平台内容聚合器。

在这个充满算法推荐、无限下拉和深度信息茧房的时代，OmniClip 致力于成为你的个人信息锚点。它剥离了噪音、令人上瘾的交互设计以及算法的操纵。你来决定连接哪些平台，OmniClip 会安静地收集、去重，并利用 AI 将你真正关心的内容合成为一个按时间顺序排列的摘要流。

**不追热点，突破信息茧房。**

---

## 支持的平台

目前，OmniClip 支持从以下平台收集和聚合内容：

- **GitHub** (Star 的仓库 / 最新 Release)
- **YouTube** (频道订阅 / 最新视频)
- **Twitter / X** (书签 / 时间线，通过浏览器扩展同步)
- **小红书 / Xiaohongshu** (收藏的图文/视频，通过浏览器扩展同步)

---

## 🤖 快速安装指令 (写给 AI Agent)

如果你是一个 AI Agent 并且正在配置该项目，可以使用以下单行命令来一键引导整个开发环境：

```bash
pnpm install && cp packages/backend/.env.example packages/backend/.env && cp packages/frontend/.env.example packages/frontend/.env && docker-compose up -d && sleep 5 && pnpm --filter backend db:migrate && pnpm dev
```

_注意：要使 AI 摘要功能生效，在初始设置完成后，需要手动在 `packages/backend/.env` 中配置 `OPENAI_API_KEY`。_

---

## 详细配置与使用教程 (写给人类用户)

请按照以下步骤在本地环境中配置并运行 OmniClip。

### 前置要求

- **Node.js 20 LTS** (`node -v` 检查版本)
- **pnpm 9.x** (`npm install -g pnpm` 安装)
- **Docker & Docker Compose** (用于运行 PostgreSQL 和 Redis)
- **Chrome / Chromium 浏览器** (用于安装 OmniClip 数据同步扩展)

### 第一步：克隆项目与安装依赖

```bash
git clone https://github.com/MomoP32/omniclip.git
cd omniclip
pnpm install
```

### 第二步：启动数据库和 Redis

OmniClip 需要 PostgreSQL 作为主数据库，Redis 作为队列和限流缓存。

```bash
# 在后台启动 PostgreSQL (端口 5432) 和 Redis (端口 6379)
docker-compose up -d
```

### 第三步：配置环境变量

复制示例环境变量文件，生成你本地的配置。

```bash
cp packages/backend/.env.example packages/backend/.env
cp packages/frontend/.env.example packages/frontend/.env
```

**必须修改的配置：**
用文本编辑器打开 `packages/backend/.env`，添加你的 OpenAI API Key，以便启用 AI 智能摘要功能：

```env
OPENAI_API_KEY=sk-your-openai-api-key-here
```

_(如果你使用的是默认的 docker-compose.yml，`DATABASE_URL` 和 `REDIS_URL` 保持默认即可。)_

### 第四步：初始化数据库

运行数据库迁移脚本，创建所有必需的数据表和安全策略 (RLS)。

```bash
pnpm --filter backend db:migrate
```

### 第五步：启动应用服务

同时启动后端接口与前端界面。

```bash
pnpm dev
```

- **前端页面** 运行在：`http://localhost:3000`
- **后端 API** 运行在：`http://localhost:3001`

### 第六步：安装 Chrome 浏览器扩展

为了在无需 API Key 的情况下无缝同步 Twitter/X 和小红书的数据，你需要安装 OmniClip 专属扩展。

1. 打开 Chrome 浏览器，访问 `chrome://extensions/` 页面。
2. 开启右上角的 **“开发者模式” (Developer mode)**。
3. 点击左上角的 **“加载已解压的扩展程序” (Load unpacked)**。
4. 选择 OmniClip 项目目录下的 `packages/extension/dist/` 文件夹。

### 第七步：连接你的平台开始使用

1. 在浏览器中打开 `http://localhost:3000`。
2. 注册一个本地账号并登录。
3. 导航至左侧的 **“账号连接” (Connections)** 页面。
4. 添加你想要同步的平台（例如：提供 GitHub 的个人访问令牌 Personal Access Token，或者通过 OAuth 授权 YouTube）。
5. 对于依赖扩展的平台（如 Twitter、小红书），你只需在浏览器中正常登录这些网站，扩展程序会在后台自动拦截你收藏的内容，并静默同步到你的 OmniClip 信息流中！

---

## 许可证

MIT License
