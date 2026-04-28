# OmniClip

### Your morning newspaper, assembled by AI, from every corner of the internet you care about.

English | [中文](README_zh.md)

<!-- IMAGE: hero-banner.png
宽幅横图 (1200×400)。
画面左侧：一张铺开的报纸，报头写着 "OmniClip Daily"，版面上有几个新闻板块，每个板块的左上角带有小图标分别代表 GitHub (代码图标)、YouTube (播放按钮)、Twitter/X (鸟/X logo)。报纸的排版风格是经典报刊样式（分栏、标题加粗、正文小字）。
画面右侧：一只手拿着咖啡杯，旁边是笔记本电脑屏幕，屏幕上隐约显示 OmniClip 的 UI 界面。
整体色调：温暖的晨光氛围，浅米色/暖白底色，传达"从容阅读早报"的感觉。
风格：扁平插画 / 等距风格，简洁现代。
-->

---

Every morning, millions of people open Twitter, YouTube, GitHub, and a dozen other apps — not to find what matters, but to survive the algorithmic firehose. You scroll past promoted tweets you never asked for, recommended videos you'll never watch, and trending topics designed to hijack your attention.

**What if you had a personal editor?** Someone who reads everything you actually subscribed to, throws out the noise, and delivers a clean briefing — like a newspaper made just for you.

That's OmniClip.

---

## The Problem

<!-- IMAGE: problem-comparison.png
左右对比图 (1000×500)。
左半边 (标题: "Your feeds today")：混乱的社交媒体界面拼贴，包含：
- 一个充满推荐广告的 Twitter 时间线
- YouTube 首页满是 clickbait 缩略图
- GitHub 通知铃铛显示 99+
- 多个浏览器标签密密麻麻
- 整体色调偏红/橙色，暗示焦虑和信息过载
- 散落的 "For You"、"Trending"、"Recommended" 标签

右半边 (标题: "Your OmniClip morning briefing")：
- 一份干净的报纸风格界面
- 3 个 Headline 卡片，每个带有平台图标和简短标题
- 下方按主题分类的摘要列表
- 底部一段 "Trend Analysis" 文字
- 整体色调偏蓝/白色，传达平静和掌控感
- 右上角显示 "47 sources → 1 digest"
-->

| | Traditional Feeds | OmniClip |
|---|---|---|
| **What you see** | Algorithm decides | You decide |
| **Signal-to-noise** | ~10% relevant | 100% from accounts you follow |
| **Time to consume** | Endless scrolling | 5-minute morning briefing |
| **Promoted content** | Everywhere | Zero |
| **Cross-platform view** | Tab-switching chaos | Single unified digest |

---

## How It Works

<!-- IMAGE: how-it-works-flow.png
水平流程图 (1000×300)，从左到右三个步骤，用箭头连接：

Step 1 "Connect" (图标: 插头/链接):
三个平台 logo (GitHub, YouTube, Twitter/X) 向中间汇聚，
下方小字: "30 seconds. Paste your credentials."

Step 2 "Collect & Filter" (图标: 漏斗):
漏斗上方是大量杂乱的内容碎片（推文、视频缩略图、Release标签），
漏斗下方是少量整齐排列的内容卡片。
漏斗上标注: "Algorithm injections stripped"
下方小字: "Only content from accounts you actually follow."

Step 3 "AI Digest" (图标: 报纸):
一份精美的报纸样式文档，有 Headlines、Categories、Trend Analysis 三个区块。
下方小字: "Your personalized daily newspaper."

底色：浅灰/白色，线条简洁，风格与 hero banner 一致。
-->

**1. Connect** your platforms — GitHub, YouTube, Twitter/X. Just paste your credentials. 30 seconds.

**2. OmniClip filters** — It fetches only content from accounts you actually follow. Algorithmic recommendations, promoted posts, and trending injections are stripped out entirely.

**3. AI assembles your newspaper** — Headlines with deep-dive analysis. Category summaries. Cross-platform trend insights. Delivered as a clean, readable digest.

---

## What Your Newspaper Looks Like

<!-- IMAGE: digest-showcase.png
产品界面截图/模拟图 (1000×600)。展示 OmniClip 的 Digest 页面：

顶部区域：
- 标题: "Daily Digest — April 28, 2026"
- 副标题: "47 items from 3 platforms"

Headlines 区 (2-3 个大卡片，报纸头条风格)：
- 卡片1: GitHub 图标 + "Anthropic releases Claude Code v2.0 — local-first AI coding with full filesystem access" + 3行分析文字
- 卡片2: Twitter/X 图标 + "OpenAI announces GPT-5 turbo with 1M context window" + 3行分析文字
- 卡片3: YouTube 图标 + "Andrej Karpathy: 'Why transformers will be replaced'" + 3行分析文字

Categories 区 (分栏列表)：
- "AI / Machine Learning" — 5 条一行摘要
- "Open Source" — 3 条一行摘要
- "Crypto / Web3" — 2 条一行摘要

底部 Trend Analysis 区：
- 一段跨平台趋势分析文字

整体风格：白底，卡片有轻微阴影，排版类似高端新闻 app (如 Artifact/Feedly)。
-->

Each digest features:

- **Headlines** — The 3–5 most important items, with journalist-style deep-dive analysis
- **Category Summaries** — Everything else, organized by topic with one-liner summaries
- **Trend Analysis** — AI-generated cross-platform insights connecting the dots

You control how many headlines, how many summaries, and which topics matter to you.

---

## Platform Coverage

OmniClip enforces a simple rule: **only content from accounts you consciously chose to follow.** No exceptions.

| Platform | What OmniClip Reads | What OmniClip Ignores |
|----------|---------------------|----------------------|
| **GitHub** | Releases from your ⭐ Starred repos | Commits, issues, Explore page, trending |
| **YouTube** | Videos from your Subscriptions | Shorts, recommendations, trending |
| **Twitter / X** | Tweets from your Following list | For You, promoted tweets, trending topics |

---

## Customize Your Newspaper

<!-- IMAGE: settings-showcase.png
设置页面的模拟图 (800×500)：

左侧：Topic 选择区
- 复选框列表: ☑ AI/Machine Learning, ☑ Open Source, ☐ Crypto/Web3, ☐ Gaming...
- 自定义 Topic 标签: "Rust lang", "LLM Agents" (蓝色圆角标签，带 × 删除按钮)

右侧：两个滑块控件
- "Headline Count: 5" (滑块范围 1-10)
- "Summary Count: 20" (滑块范围 5-50)

底部：模式切换
- [Structured] / [Advanced] 按钮组，Structured 高亮
- 说明文字: "Structured mode: pick topics and counts. Advanced mode: write your own AI prompt."

风格：与 digest 截图一致的白底简约 UI。
-->

- **Pick your topics** — Choose from presets (AI, Crypto, Open Source, Gaming...) or create your own
- **Control the volume** — Set how many headlines (1–10) and category summaries (5–50) you want
- **Advanced mode** — Write your own AI prompt for complete control over digest style and content

---

## Getting Started

Prerequisites: Node.js 22+, pnpm, Docker.

Detailed setup instructions: **[Setup Guide](docs/setup.md)** | **[Platform Keys Guide](docs/platform-keys-setup.md)**

---

## License

MIT — Use it, fork it, make it yours.
