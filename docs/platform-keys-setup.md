# OmniClip 平台密钥配置指南

本文档详细说明如何为 OmniClip 的每个平台获取并配置 API 密钥/凭证，包括有效期说明。

> **配置位置分两类**：
> - **服务端环境变量**：写入 `packages/backend/.env` 文件（YouTube OAuth、AI API Key）
> - **应用内连接配置**：在 OmniClip 前端 **Connections** 页面填写（GitHub PAT、Twitter Cookies）

---

## 目录

1. [GitHub — Personal Access Token (PAT)](#1-github--personal-access-token-pat)
2. [Twitter / X — 浏览器 Cookies](#2-twitter--x--浏览器-cookies)
3. [YouTube — Google Cloud OAuth 2.0](#3-youtube--google-cloud-oauth-20)
4. [Gemini — API Key（AI Digest 用）](#4-gemini--api-keyai-digest-用)
5. [OpenAI — API Key（AI Digest 备选）](#5-openai--api-keyai-digest-备选)
6. [密钥有效期总览](#6-密钥有效期总览)

---

## 1. GitHub — Personal Access Token (PAT)

### 用途

OmniClip 通过 GitHub PAT 调用 GitHub REST API，获取你 Star 的仓库的 Release、你关注的开发者的动态（开源新项目、Star 行为等）。

### 有效期

| 类型 | 有效期 | 建议 |
|------|--------|------|
| Classic Token | 可选：30 天 / 60 天 / 90 天 / 自定义 / **永不过期** | 选择 **90 天**，到期前 GitHub 会邮件提醒续期 |
| Fine-grained Token | 必须设置过期时间，最长 1 年 | 推荐 Classic Token，配置更简单 |

> **过期后的行为**：OmniClip 同步时会返回 `401`，前端会显示连接状态为 `unhealthy`，提示你更新 Token。

### 获取步骤

#### Step 1：进入 Token 设置页面

登录 GitHub → 点击右上角头像 → **Settings** → 左侧栏最下方 **Developer settings** → **Personal access tokens** → **Tokens (classic)**

或直接访问：https://github.com/settings/tokens

<!-- SCREENSHOT_PLACEHOLDER: github-settings-tokens
说明：GitHub Settings → Developer settings → Personal access tokens 页面截图
-->

#### Step 2：生成新 Token

点击 **Generate new token** → 选择 **Generate new token (classic)**

<!-- SCREENSHOT_PLACEHOLDER: github-generate-token-button
说明：点击 Generate new token 按钮的截图
-->

#### Step 3：配置 Token

| 字段 | 填写内容 |
|------|---------|
| **Note** | `OmniClip` （备注名，随意填写） |
| **Expiration** | 选择 `90 days`（推荐），或 `No expiration` |
| **Scopes** | **不勾选任何 scope** 即可。仅跟踪公开数据不需要任何权限，PAT 本身就能提升 API 速率限制（从 60 次/小时 → 5000 次/小时） |

> 如果你需要跟踪**私有仓库**的 Release，则额外勾选 `repo` scope。

<!-- SCREENSHOT_PLACEHOLDER: github-token-scopes
说明：Token 配置页面，展示 Note、Expiration、Scopes 的填写，Scopes 全部不勾选
-->

#### Step 4：复制 Token

生成后会显示一个以 `ghp_` 开头的字符串，**这是唯一一次显示机会**，请立即复制。

<!-- SCREENSHOT_PLACEHOLDER: github-token-created
说明：Token 生成成功后的页面，显示 ghp_xxxx 字符串，提示复制
-->

#### Step 5：在 OmniClip 中填写

1. 打开 OmniClip 前端（`http://localhost:3000`）
2. 进入 **Connections** 页面
3. 点击添加 **GitHub** 连接
4. 粘贴刚才复制的 PAT
5. 保存

<!-- SCREENSHOT_PLACEHOLDER: omniclip-github-connection
说明：OmniClip Connections 页面，添加 GitHub 连接的表单截图
-->

---

## 2. Twitter / X — 浏览器 Cookies

### 用途

OmniClip 使用你的 Twitter/X 会话 Cookie 通过服务端调用 Twitter 内部 GraphQL API，获取你的 "Following" 时间线内容。需要两个 Cookie 值：`auth_token` 和 `ct0`。

### 有效期

| Cookie | 有效期 | 失效条件 |
|--------|--------|---------|
| `auth_token` | **无固定过期时间** | 主动登出、修改密码、长期不活跃（约 30 天）、账号安全事件 |
| `ct0` | **随 auth_token 同步** | 与 auth_token 绑定，auth_token 失效则 ct0 也失效 |

> **实际寿命**：只要你的浏览器保持登录状态且不主动登出，通常可用 **数周到数月**。  
> **过期后的行为**：OmniClip 同步时会返回 `401/403`，前端会提示连接 `unhealthy`，此时需要重新提取 Cookie。

### 获取步骤

#### Step 1：登录 Twitter/X

在浏览器中访问 https://x.com 并确保已登录。

#### Step 2：打开浏览器开发者工具

- **Mac**：`Cmd + Option + I`
- **Windows/Linux**：`F12` 或 `Ctrl + Shift + I`

#### Step 3：导航到 Cookies

在开发者工具中：**Application** 标签 → 左侧 **Storage** → **Cookies** → 点击 `https://x.com`

<!-- SCREENSHOT_PLACEHOLDER: twitter-devtools-cookies
说明：Chrome DevTools → Application → Cookies → x.com 页面截图，展示 cookie 列表
-->

#### Step 4：找到并复制两个 Cookie

在 Cookie 列表中搜索（顶部搜索框输入关键字）：

| Cookie 名称 | 示例值 | 长度 |
|-------------|--------|------|
| `auth_token` | `a1b2c3d4e5f6...` | 约 40 个字符 |
| `ct0` | `x7y8z9a0b1c2...` | 约 160 个字符 |

双击 Cookie 的 **Value** 列即可选中复制。

<!-- SCREENSHOT_PLACEHOLDER: twitter-cookie-auth-token
说明：在 Cookie 列表中选中 auth_token 的截图，高亮显示 Value 列
-->

<!-- SCREENSHOT_PLACEHOLDER: twitter-cookie-ct0
说明：在 Cookie 列表中选中 ct0 的截图，高亮显示 Value 列
-->

#### Step 5：在 OmniClip 中填写

1. 打开 OmniClip 前端 → **Connections** 页面
2. 点击添加 **Twitter** 连接
3. 选择 **Manual Cookies** 标签
4. 分别粘贴 `auth_token` 和 `ct0`
5. 保存

<!-- SCREENSHOT_PLACEHOLDER: omniclip-twitter-connection
说明：OmniClip Connections 页面，添加 Twitter 连接的 Manual Cookies 表单截图
-->

> **安全提示**：  
> - `auth_token` 和 `ct0` 等同于你的 Twitter 登录凭证，**不要分享给任何人**  
> - OmniClip 会使用 AES-256 加密存储这些凭证  
> - 提取 Cookie 后**不要**在浏览器中登出 Twitter，否则 Cookie 会立即失效

---

## 3. YouTube — Google Cloud OAuth 2.0

### 用途

OmniClip 通过 YouTube Data API v3 获取你的订阅频道最新视频。YouTube 使用 OAuth 2.0 授权流程，用户在浏览器中授权后，OmniClip 获得 Access Token 和 Refresh Token。

### 有效期

| Token 类型 | 有效期 | 说明 |
|-----------|--------|------|
| Access Token | **约 1 小时** | OmniClip 会自动使用 Refresh Token 刷新，无需手动操作 |
| Refresh Token | **长期有效** | 除非：用户主动撤销授权、Google Cloud 项目被删除、超过 6 个月未使用 |
| Client ID / Secret | **永不过期** | 直到你在 Google Cloud Console 中删除 |

> **注意**：如果你的 Google Cloud 项目处于 "Testing" 状态（未发布），Refresh Token **7 天后过期**。发布项目后不受此限制。

### 配置步骤

YouTube 是唯一需要配置**服务端环境变量**的平台连接（因为 OAuth 需要 Client ID/Secret）。

#### Step 1：创建 Google Cloud 项目

1. 访问 [Google Cloud Console](https://console.cloud.google.com/)
2. 点击顶部项目选择器 → **新建项目**
3. 项目名称填 `OmniClip`（随意），点击**创建**

<!-- SCREENSHOT_PLACEHOLDER: gcloud-new-project
说明：Google Cloud Console 新建项目的对话框截图
-->

#### Step 2：启用 YouTube Data API v3

1. 在左侧菜单中选择 **API 和服务** → **库**
2. 搜索 `YouTube Data API v3`
3. 点击进入 → 点击 **启用**

<!-- SCREENSHOT_PLACEHOLDER: gcloud-enable-youtube-api
说明：YouTube Data API v3 的启用页面截图
-->

#### Step 3：配置 OAuth 同意屏幕

1. 左侧菜单 → **API 和服务** → **OAuth 同意屏幕**
2. 选择 **External**（外部）用户类型 → 点击**创建**
3. 填写：
   - **应用名称**：`OmniClip`
   - **用户支持邮箱**：你的 Gmail
   - **开发者联系邮箱**：你的 Gmail
4. 点击**保存并继续**
5. **Scopes** 页面：点击 **Add or Remove Scopes**，搜索并勾选：
   - `https://www.googleapis.com/auth/youtube.readonly`
6. 点击**更新** → **保存并继续**
7. **Test users** 页面：点击 **Add Users**，添加你自己的 Gmail 地址
8. 点击**保存并继续**

<!-- SCREENSHOT_PLACEHOLDER: gcloud-oauth-consent-screen
说明：OAuth 同意屏幕配置页面，展示应用名称和用户类型设置
-->

<!-- SCREENSHOT_PLACEHOLDER: gcloud-oauth-scopes
说明：OAuth Scopes 选择页面，勾选 youtube.readonly 的截图
-->

> **关于发布状态**：  
> 新建的项目默认处于 **Testing** 状态，此时只有你添加的 Test Users 可以授权，且 Refresh Token **7 天后过期**。  
> 如果你要长期使用，建议点击 **Publish App** 发布应用。个人使用不需要 Google 审核（只要你只用自己的账号），发布后 Refresh Token 将长期有效。

#### Step 4：创建 OAuth 2.0 凭证

1. 左侧菜单 → **API 和服务** → **凭证**
2. 点击顶部 **+ 创建凭证** → **OAuth 客户端 ID**
3. 填写：
   - **应用类型**：Web 应用
   - **名称**：`OmniClip Local`
   - **已获授权的重定向 URI**：点击 **+ 添加 URI**，填入：
     ```
     http://localhost:3001/api/v1/auth/youtube/callback
     ```
4. 点击**创建**

<!-- SCREENSHOT_PLACEHOLDER: gcloud-create-oauth-client
说明：创建 OAuth 客户端 ID 的页面，展示应用类型、名称和重定向 URI 的填写
-->

#### Step 5：复制 Client ID 和 Client Secret

创建完成后会弹出对话框，显示：
- **Client ID**：类似 `123456789-abcdef.apps.googleusercontent.com`
- **Client Secret**：类似 `GOCSPX-xxxxxxxxxxxxxxxxxx`

<!-- SCREENSHOT_PLACEHOLDER: gcloud-oauth-credentials-created
说明：OAuth 凭证创建成功后的弹窗，显示 Client ID 和 Client Secret
-->

#### Step 6：写入 .env 文件

打开 `packages/backend/.env`，填入刚复制的值：

```env
YOUTUBE_CLIENT_ID=123456789-abcdef.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxxxx
YOUTUBE_REDIRECT_URI=http://localhost:3001/api/v1/auth/youtube/callback
```

> `YOUTUBE_REDIRECT_URI` 保持默认值即可，除非你修改了后端端口。

#### Step 7：在 OmniClip 中授权

1. 重启后端服务（`pnpm dev`）使新 .env 生效
2. 打开 OmniClip 前端 → **Connections** 页面
3. 点击添加 **YouTube** 连接
4. 浏览器会跳转到 Google 登录页面，选择你的账号并授权
5. 授权完成后自动回到 OmniClip

<!-- SCREENSHOT_PLACEHOLDER: omniclip-youtube-oauth-flow
说明：Google OAuth 授权弹窗截图，展示授权确认页面
-->

---

## 4. Gemini — API Key（AI Digest 用）

### 用途

OmniClip 的 AI Digest 功能使用 Gemini（或 OpenAI）来总结你聚合的内容。Gemini API 有免费额度，适合个人使用。

### 有效期

| 项目 | 有效期 |
|------|--------|
| Gemini API Key | **永不过期**，除非你手动删除或 Google 禁用项目 |
| 免费额度 | 15 RPM（请求/分钟），1500 RPD（请求/天），对 OmniClip 日报场景绰绰有余 |

### 获取步骤

#### Step 1：进入 Google AI Studio

访问 https://aistudio.google.com/apikey

如果是第一次使用，需要同意服务条款。

<!-- SCREENSHOT_PLACEHOLDER: gemini-aistudio-homepage
说明：Google AI Studio API Key 管理页面截图
-->

#### Step 2：创建 API Key

1. 点击 **Create API Key**
2. 选择一个 Google Cloud 项目（可以选已有的，也可以新建）
3. 点击 **Create API key in existing project**

<!-- SCREENSHOT_PLACEHOLDER: gemini-create-api-key
说明：创建 Gemini API Key 的对话框截图
-->

#### Step 3：复制 API Key

生成后会显示一个以 `AIzaSy` 开头的字符串，点击复制图标。

<!-- SCREENSHOT_PLACEHOLDER: gemini-api-key-created
说明：API Key 创建成功后的页面，显示 AIzaSy... 字符串
-->

#### Step 4：写入 .env 文件

打开 `packages/backend/.env`，填入：

```env
GEMINI_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

重启后端服务即可生效。

---

## 5. OpenAI — API Key（AI Digest 备选）

### 用途

与 Gemini 二选一。如果你更习惯使用 OpenAI（GPT-4o 等），可以配置 OpenAI API Key 代替 Gemini。

### 有效期

| 项目 | 有效期 |
|------|--------|
| OpenAI API Key | **永不过期**，除非你手动撤销 |
| 费用 | **按量付费**，需要绑定信用卡。GPT-4o 约 $2.50/1M input tokens |

> 如果同时配置了 `GEMINI_API_KEY` 和 `OPENAI_API_KEY`，系统会优先使用 OpenAI。

### 获取步骤

#### Step 1：进入 OpenAI API 平台

访问 https://platform.openai.com/api-keys

使用你的 OpenAI 账号登录。

<!-- SCREENSHOT_PLACEHOLDER: openai-api-keys-page
说明：OpenAI API Keys 管理页面截图
-->

#### Step 2：创建 API Key

1. 点击 **+ Create new secret key**
2. **Name**：填 `OmniClip`（备注用）
3. **Permissions**：选择 **Restricted**，只需勾选 **Model capabilities** 中的 `Write`
4. 点击 **Create secret key**

<!-- SCREENSHOT_PLACEHOLDER: openai-create-key-dialog
说明：创建 OpenAI API Key 的对话框，展示 Name 和 Permissions 设置
-->

#### Step 3：复制 API Key

生成后会显示以 `sk-` 开头的字符串，**仅显示一次**，请立即复制。

<!-- SCREENSHOT_PLACEHOLDER: openai-key-created
说明：API Key 创建成功后的弹窗，显示 sk-xxxx 字符串
-->

#### Step 4：写入 .env 文件

打开 `packages/backend/.env`，填入：

```env
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

重启后端服务即可生效。

---

## 6. 密钥有效期总览

| 平台 | 凭证类型 | 有效期 | 过期提醒 | 续期方式 |
|------|---------|--------|---------|---------|
| **GitHub** | Personal Access Token | 可配置（推荐 90 天） | GitHub 邮件提醒（过期前 2 周） | 生成新 Token → 在 OmniClip 更新 |
| **Twitter/X** | Cookies (auth_token + ct0) | 数周~数月（取决于会话活跃度） | OmniClip 显示连接 `unhealthy` | 重新从浏览器提取 Cookie |
| **YouTube** | OAuth Refresh Token | 长期有效（需发布 App，否则 7 天） | OmniClip 显示连接 `unhealthy` | 在 Connections 页面重新授权 |
| **YouTube** | Client ID / Secret (.env) | 永不过期 | 无 | 无需续期 |
| **Gemini** | API Key (.env) | 永不过期 | 无 | 无需续期 |
| **OpenAI** | API Key (.env) | 永不过期 | 无 | 无需续期（注意账户余额） |

### 推荐的维护节奏

- **每 90 天**：检查 GitHub PAT 是否需要续期（留意 GitHub 邮件提醒）
- **每月**：检查 Twitter Cookie 是否仍然有效（OmniClip 会自动标记 unhealthy）
- **首次配置后无需维护**：YouTube OAuth、Gemini Key、OpenAI Key

---

## 附：.env 文件完整模板

```env
# ============================================
# OmniClip Backend Environment Configuration
# File: packages/backend/.env
# ============================================

# ─── Database (保持默认，使用 docker-compose) ───
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/aggregator_dev
REDIS_URL=redis://localhost:6379

# ─── JWT (保持默认) ───
JWT_SECRET=dev-secret-change-in-production
JWT_EXPIRATION=15m
JWT_REFRESH_EXPIRATION=7d

# ─── Server (保持默认) ───
PORT=3001
FRONTEND_URL=http://localhost:3000

# ─── AI Digest（二选一，优先 OpenAI）───
OPENAI_API_KEY=sk-your-key-here
GEMINI_API_KEY=your-gemini-key-here

# ─── YouTube OAuth（可选，连接 YouTube 时必填）───
YOUTUBE_CLIENT_ID=your-client-id.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=GOCSPX-your-secret
YOUTUBE_REDIRECT_URI=http://localhost:3001/api/v1/auth/youtube/callback

# ─── Credential Encryption（自动生成，勿手动修改）───
ENCRYPTION_KEY=97786b9af0fb727ab64b5a3db2f57b52
```

> **GitHub PAT** 和 **Twitter Cookies** 不在 .env 中配置，而是在 OmniClip 应用的 Connections 页面中填写，由后端加密存储到数据库中。
