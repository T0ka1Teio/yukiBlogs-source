# yukiBlogs

一个使用 Next.js 构建的毛玻璃风格个人博客前端，支持 Markdown 文章、杂谈、相册、项目、友链、GitHub Issues 评论、音乐和 AI 猫猫助理。

[English](README_en.md) · [更新日志](UpdateLog.md)

## 当前技术栈

- Next.js 16
- React 19
- Tailwind CSS 4
- TypeScript
- Upstash Redis
- 腾讯云 EdgeOne Pages

## 2026-08-20 更新摘要

- 主站可绑定自定义域名，并由腾讯云 EdgeOne Pages 部署和加速。
- GitHub OAuth 回调已迁移到新域名，评论登录与发布验证正常。
- 新增可配置的 `siteUrl`，用于站点元数据、首页 canonical 和 Open Graph 地址。
- 友链申请模板中的旧部署地址已替换为新域名。
- 移除首页天气组件与天气服务端路由，避免访客首次进入博客时反复触发定位权限弹窗。

## 2026-08-19 更新摘要

- 访问统计改为 Redis Lua 原子操作，避免并发初始化和中途失败造成漏计。
- 自动迁移旧版文章阅读数，并统一为 `/api/stats/view/[kind]/[slug]` 接口。
- 文章、杂谈和说说按浏览器每日去重；同一浏览器对同一内容每天最多增加一次。
- 修复无封面杂谈不计数、说说快速点击漏计和中等屏宽底部状态卡被裁切的问题。
- 站长浏览器和常见机器人不会产生新的统计记录；启用排除前已产生的累计数保持不变。

## 本地开发

```powershell
npm ci
npm run dev
```

打开 <http://localhost:3000>。

提交前建议运行：

```powershell
npm run test:stats
npm run lint
npm run typecheck
npm run build
```

## 环境变量

将 `.env.example` 复制为 `.env.local`，并按需配置：

| 环境变量 | 用途 |
| --- | --- |
| `GEMINI_API_KEY` | AI 猫猫助理 |
| `GITHUB_OAUTH_CLIENT_SECRET` | GitHub 评论 OAuth 服务端交换 |
| `KV_REST_API_URL` | Upstash Redis REST 地址 |
| `KV_REST_API_TOKEN` | Upstash Redis 服务端令牌 |
| `STATS_OWNER_KEY` | 站长浏览器排除密钥 |

密钥只应保存在本地环境文件或部署平台的 Environment Variables 中，不要提交到 Git。

## 访问统计

1. 创建或连接 Upstash Redis。
2. 确认 Production 环境包含 `KV_REST_API_URL` 和 `KV_REST_API_TOKEN`。
3. 设置一个随机长字符串作为 `STATS_OWNER_KEY` 并重新部署。
4. 打开 `https://你的博客域名/stats-owner`，输入同一个密钥并排除当前浏览器。

累计访客按浏览器每日去重；文章、杂谈和说说阅读数也按内容、浏览器和上海自然日去重。旧版文章阅读数会在首次读取时自动迁移。站长排除只阻止后续新增记录，不回退启用排除前的累计数。

## 部署

生产主站可部署在腾讯云 EdgeOne Pages 并绑定你自己的域名。构建框架选择 **Next.js**，安装命令使用 `npm ci`，构建命令使用 `npm run build`，输出目录为 `.next`，并配置完整的生产环境变量。本项目包含服务端路由，不适合直接作为 GitHub Pages 静态站点发布。

## 完整项目结构

本仓库是供 EdgeOne Pages 部署的前端。完整源码还包括独立的 `my-blog-manager` 本地控制台，用于编辑配置与内容并同步部署源码。

## 许可证

[CC BY-NC 4.0](../LICENSE)
