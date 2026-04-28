# OmniClip

### 你的 AI 私人早报——从你关心的每个角落，只为你一个人编辑。

[English](README.md) | 中文

> **早期开发阶段** — OmniClip 当前版本 v0.1.0，功能和接口可能会变动。

![OmniClip — 你的 AI 私人早报](docs/images/hero-banner.jpeg)

---

每天早上，无数人打开 Twitter、YouTube、GitHub 和十几个 App——不是为了找到重要的东西，而是为了在算法洪流中求生。你划过从没订阅过的推广推文，划过永远不会看的推荐视频，划过专门为劫持你注意力而设计的热搜话题。

**如果你有一个私人编辑呢？** 一个帮你读完所有你真正关注的内容、过滤掉噪声、然后递上一份干净简报的人——就像一份只为你定制的报纸。

这就是 OmniClip。

---

## 问题

![传统信息流 vs OmniClip](docs/images/problem-comparison.png)

| | 传统信息流 | OmniClip |
|---|---|---|
| **你看到什么** | 算法替你决定 | 你自己决定 |
| **信噪比** | 约 10% 有用 | 100% 来自你关注的账号 |
| **消耗时间** | 无尽滑屏 | 5 分钟早间简报 |
| **推广内容** | 无处不在 | 零 |
| **跨平台** | 疯狂切换标签页 | 一份统一的摘要 |

---

## 它如何工作

![连接 → 过滤 → 生成摘要](docs/images/how-it-works-flow.png)

**1. 连接** 你的平台——GitHub、YouTube、Twitter/X。粘贴你的凭证，30 秒搞定。

**2. OmniClip 过滤** ——只抓取你真正关注的账号的内容。算法推荐、推广帖子、热搜注入，全部剥离干净。

**3. AI 编辑你的报纸** ——头条新闻配深度分析，按主题分类的摘要，跨平台趋势洞察。以一份干净、可读的简报交付给你。

---

## 你的报纸长什么样

![摘要页面预览](docs/images/digest-showcase.png)

每份摘要包含：

- **头条** —— 3–5 条最重要的内容，配有记者风格的深度分析
- **分类摘要** —— 其余内容按主题归类，每条配一句话摘要
- **趋势洞察** —— AI 生成的跨平台分析，帮你看清全局脉络

你可以自由控制头条数量、摘要数量，以及哪些话题对你最重要。

---

## 平台覆盖

OmniClip 坚守一条简单的规则：**只读取你主动关注的账号的内容。** 没有例外。

| 平台 | OmniClip 读取 | OmniClip 忽略 |
|------|---------------|---------------|
| **GitHub** | 你 ⭐ Star 的仓库的 Release | Commit、Issue、Explore 页、Trending |
| **YouTube** | 你订阅频道的视频 | Shorts、推荐视频、热门 |
| **Twitter / X** | 你关注列表的推文 | "为你推荐"、推广推文、热搜话题 |

---

## 定制你的报纸

![设置页面](docs/images/settings-showcase.png)

- **选择你的话题** —— 从预设中选（AI、Crypto、开源、游戏……），或创建自定义话题
- **控制信息量** —— 设置你想要多少条头条（1–10）和分类摘要（5–50）
- **高级模式** —— 直接写你自己的 AI Prompt，完全控制摘要的风格和内容

---

## 开始使用

前置条件：Node.js 22+、pnpm、Docker。

详细部署说明：**[部署指南](docs/setup.md)** | **[平台密钥配置](docs/platform-keys-setup.md)**

---

## 架构

OmniClip 是一个 TypeScript Monorepo，由 [Turborepo](https://turbo.build) + pnpm 管理。

| 包 | 技术栈 | 职责 |
|----|--------|------|
| `packages/backend` | NestJS · Drizzle ORM · BullMQ | API、内容聚合、定时任务 |
| `packages/frontend` | Next.js 15 · React 19 · Tailwind CSS 4 | Web 界面，支持 i18n (next-intl) |
| `packages/shared` | TypeScript | 共享类型和工具函数 |

**AI** — 支持 OpenAI + Google Gemini（自带 API Key）。
**数据库** — PostgreSQL 16 (Drizzle ORM) + Redis 7（任务队列和缓存）。
**基础设施** — Docker Compose 本地开发环境。

---

## 隐私与安全

OmniClip 完全自托管，你的凭证不会离开你自己的服务器。

- 平台 API Key / Token 存储在你本地的 PostgreSQL 实例中
- 零遥测 —— 不向 OmniClip 或任何第三方发送数据
- AI API 调用从你的服务器直连 OpenAI / Google —— 无代理、无中间人

---

## 常见问题

**摘要多久生成一次？**
通过 BullMQ 任务队列按可配置的周期抓取内容，也可以手动触发刷新。

**支持哪些 AI 模型？**
OpenAI 和 Google Gemini。你提供自己的 API Key —— OmniClip 不内置账号，不收取使用费。

**能添加更多平台吗？**
聚合层设计上支持扩展。欢迎社区贡献新平台（Huggingface、Hacker News、Reddit 等）。

**可以用于生产环境吗？**
目前还不行。OmniClip 处于早期开发阶段 (v0.1.0)，预期会有破坏性变更。

---

## 参与贡献

欢迎贡献。

1. Fork 仓库，创建功能分支
2. 遵循现有规范 —— TypeScript 严格模式，Prettier 格式化
3. 为新功能编写测试（Vitest 单元测试，Playwright E2E 测试）
4. 提交 PR，清晰描述做了什么、为什么

Bug 反馈或功能建议，请[提交 Issue](../../issues)。

---

## License

[MIT](LICENSE)。
