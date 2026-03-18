# OmniClip - 你的个人信息锚点

OmniClip 是一个专为**个人**打造的多平台内容聚合器。

在这个充满算法推荐、无限下拉和深度信息茧房的时代，OmniClip 致力于成为你的个人信息锚点。它剥离了噪音、令人上瘾的交互设计以及算法的操纵。你来决定连接哪些平台，OmniClip 会安静地收集、去重，并利用 AI 将你真正关心的内容合成为一个按时间顺序排列的摘要流。

**不追热点，突破信息茧房。**

### 为什么叫 "OmniClip"？

- **Omni (全方位)**：意为“所有的”或“普遍的”。代表它能够跨越互联网的碎片化孤岛，从任何你关心的平台中全方位地聚合内容。
- **Clip (剪辑/修剪)**：就像旧时代的“剪报”一样。代表着大刀阔斧地剪除信息噪音、剥离诱导性算法，只为你提取和保留最高价值、最纯粹的信息片段。

---

## 支持的平台与深度过滤

目前，OmniClip 支持从以下平台收集和聚合内容。为了保证极高的信噪比，**OmniClip 会在所有平台上强制忽略算法推荐（如“为你推荐”、“发现”页）**。

- **GitHub**: 只追踪你关注的大佬的 `Release` (发新版本)、`CreateEvent` (开源新项目) 和 `WatchEvent` (点赞好项目)。此外，它还会主动抓取你 **Starred 仓库** 的最新 Release 发布说明。（过滤掉所有嘈杂的 Commit 和 Issue 动态）。
- **YouTube**: 只抓取你 **订阅频道 (Subscriptions)** 的长视频。（带有 `#shorts` 的短视频会被自动过滤）。
- **Twitter / X**: 通过扩展程序，严格只拦截你的 **“关注” (Following)** 时间线。
- **小红书 / Xiaohongshu**: 通过扩展程序，严格只拦截你的 **“关注” (Follow)** 信息流。

_注：你可以根据不同平台的信息流速，为每个平台单独配置自定义的同步频率（如：1小时、1天、1个月抓取一次）。_

---

## 🤖 给 AI Agent 的配置指令 (Instructions for AI Agents)

如果你是协助用户配置此项目的 AI Agent，请不要使用阻塞型的长命令。请严格按照以下步骤执行：

1. **克隆项目**：如果尚未克隆，请先 `git clone` 该仓库并 `cd` 进入项目目录。
2. **安装依赖**：执行 `pnpm install`。
3. **环境配置**：复制 `packages/backend` 和 `packages/frontend` 下的 `.env.example` 为 `.env`。
4. **询问密钥**：向用户询问其偏好的 AI 密钥（`OPENAI_API_KEY` 或 `GEMINI_API_KEY`），并将其写入 `packages/backend/.env` 文件中。
5. **启动基建**：执行 `docker-compose up -d` 启动数据库和 Redis，并通过轮询或其他机制确保数据库已经就绪（不要仅依赖死板的 sleep）。
6. **初始化数据库**：数据库就绪后，执行 `pnpm --filter backend db:migrate`。
7. **移交人类**：**不要**自己执行 `pnpm dev`，这会卡死你的终端。请指示用户自己在终端执行 `pnpm dev`，并引导用户查阅下方教程的**第六、七步**去安装浏览器扩展和绑定账号。

---

## 详细配置与使用教程 (写给人类用户)

请按照以下步骤在本地环境中配置并运行 OmniClip。

### 前置要求

- **Node.js 20 LTS** (`node -v` 检查版本)
- **pnpm 9.x** (`npm install -g pnpm` 安装)
- **Docker & Docker Compose** (用于运行 PostgreSQL 和 Redis)
- **Chrome / Chromium 浏览器** (用于安装 OmniClip 数据同步扩展)

### 第一步：克隆项目与安装依赖 (Agent 可代劳)

```bash
git clone https://github.com/MomoP32/omniclip.git
cd omniclip
pnpm install
```

### 第二步：启动数据库和 Redis (Agent 可代劳)

OmniClip 需要 PostgreSQL 作为主数据库，Redis 作为队列和限流缓存。

```bash
# 在后台启动 PostgreSQL (端口 5432) 和 Redis (端口 6379)
docker-compose up -d
```

### 第三步：配置环境变量 (需要人类参与)

复制示例环境变量文件，生成你本地的配置。

```bash
cp packages/backend/.env.example packages/backend/.env
cp packages/frontend/.env.example packages/frontend/.env
```

**必须修改的配置：**
用文本编辑器打开 `packages/backend/.env`，添加你的 OpenAI 或 Gemini API Key，以便启用 AI 智能摘要功能：

```env
OPENAI_API_KEY=sk-your-openai-api-key-here
# 或者
GEMINI_API_KEY=your-gemini-api-key-here
```

_(如果你使用的是默认的 docker-compose.yml，`DATABASE_URL` 和 `REDIS_URL` 保持默认即可。)_

### 第四步：初始化数据库 (Agent 可代劳)

运行数据库迁移脚本，创建所有必需的数据表和安全策略 (RLS)。

```bash
pnpm --filter backend db:migrate
```

### 第五步：启动应用服务 (需要人类操作)

同时启动后端接口与前端界面。**(Agent: 不要执行此命令，它会阻塞终端！)**

```bash
pnpm dev
```

- **前端页面** 运行在：`http://localhost:3000`
- **后端 API** 运行在：`http://localhost:3001`

### 第六步：安装 Chrome 浏览器扩展 (需要人类操作)

为了在无需 API Key 的情况下无缝同步 Twitter/X 和小红书的数据，你需要安装 OmniClip 专属扩展。

1. 打开 Chrome 浏览器，访问 `chrome://extensions/` 页面。
2. 开启右上角的 **“开发者模式” (Developer mode)**。
3. 点击左上角的 **“加载已解压的扩展程序” (Load unpacked)**。
4. 选择 OmniClip 项目目录下的 `packages/extension/dist/` 文件夹。

### 第七步：连接你的平台开始使用 (需要人类操作)

1. 在浏览器中打开 `http://localhost:3000`。
2. 注册一个本地账号并登录。
3. 导航至左侧的 **“账号连接” (Connections)** 页面。
4. 添加你想要同步的平台（例如：提供 GitHub 的个人访问令牌 Personal Access Token，或者通过 OAuth 授权 YouTube）。
   - **配置同步频率:** 在添加连接时，你可以在表单中通过“同步间隔”下拉菜单，自定义 OmniClip 抓取该平台内容的频率（例如：每 1 小时、每 1 天、每 1 个月）。
5. 对于依赖扩展的平台（如 Twitter、小红书），你只需在浏览器中正常登录这些网站，扩展程序会在后台自动拦截你收藏的内容，并静默同步到你的 OmniClip 信息流中！

---

## 许可证

MIT License
