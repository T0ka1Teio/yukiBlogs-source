# yukiBlogs

yukiBlogs 是一个基于 Next.js 16、React 19 和 Tailwind CSS 4 的个人博客系统，包含公开展示前端 `myBlogs` 与本地内容管理器 `my-blog-manager`。支持 Markdown 文章、杂谈、相册、友链、项目、音乐、GitHub Issues 评论、AI 猫猫助理和持久化访问统计。

本项目基于 [XinghuisamaBlogs](https://github.com/heiehiehi/XinghuisamaBlogs) 二次开发。

[English](README_en.md) · [中文](README.md) · [更新日志](UpdateLog.md)

## 2026-08-21 更新摘要

- 将公开源码整理为不包含个人文章、站点配置、部署路径和密钥的可复用版本，并增加发布前隐私检查。
- 完善首次初始化、增量更新和 EdgeOne Pages 部署说明，更新时保留本地个人内容与配置。
- 修复 Markdown 文章表格在阅读页面缺少边框的问题，补充明暗主题、斑马纹和移动端横向滚动。

## 架构与部署

- `my-blog-manager`：仅在本机运行，用于编辑配置和内容。
- `myBlogs`：Next.js 生产前端，包含服务端 API 路由。
- GitHub：托管源码并触发构建。
- 腾讯云 EdgeOne Pages：推荐的生产部署平台；也可使用其他支持 Next.js 服务端运行时的平台。
- Cloudflare R2 或其他对象存储：保存头像、封面和相册图片。
- Upstash Redis：保存访客数和内容浏览次数。

本项目不是纯静态站点，不能直接作为 GitHub Pages 静态页面发布。

## 隐私与仓库安全

公开仓库只跟踪可复用源码。下列文件由本地管理器生成，并已被 Git 忽略：

- 站点配置、部署路径和生成的 `siteConfig.ts`
- 文章、杂谈、草稿和关于页正文
- 相册、友链和项目数据
- 上传图片与自定义域名文件
- `.env`、密钥、令牌和本地运行状态

首次运行或构建时会自动执行：

```powershell
node scripts/checkConfig.mjs
```

该命令从通用模板生成本地运行文件，不会覆盖已有个人配置。发布公开源码前请执行：

```powershell
node scripts/checkPublicRepo.mjs
```

GitHub Actions 也会在每次推送和 Pull Request 时运行同一安全检查。详细说明见 [SECURITY.md](SECURITY.md)。

> API Key、OAuth Client Secret、Redis Token 和 `STATS_OWNER_KEY` 必须保存在本地或部署平台环境变量中。若密钥曾进入 Git 历史，必须先撤销并轮换，删除最新文件并不能消除泄露。

## 快速开始

### 环境要求

- Node.js 20.9 或更高版本
- npm
- Python 3.10 或更高版本，推荐 Python 3.12
- [uv](https://docs.astral.sh/uv/)
- Git

### 克隆与初始化

```powershell
git clone https://github.com/T0ka1Teio/yukiBlogs-source.git
cd yukiBlogs-source
node scripts/checkConfig.mjs
```

### 启动本地管理器

```powershell
cd my-blog-manager
uv sync --python 3.12
npm ci
uv run python run_me.py
```

Windows 用户也可以在依赖初始化后运行 `Start.bat`。管理器只接受来自 `localhost` 或 `127.0.0.1` 的浏览器请求。

### 单独运行博客前端

```powershell
cd myBlogs
npm ci
npm run dev
```

`npm run dev`、`npm run typecheck` 和 `npm run build` 都会自动补齐缺失的本地配置文件。

## 内容发布流程

在本地管理器中修改内容后，依次执行：

1. 暂存到操作队列。
2. 点击“更新本地”。
3. 点击“同步 Blog”，生成前端内容。
4. 在部署页面确认前端物理路径、源码仓库和分支。
5. 点击源码同步，将前端仓库推送到 GitHub 并触发 EdgeOne Pages 构建。

建议将包含个人文章和配置的前端部署仓库设置为 **Private**；此公开仓库只用于发布通用源码。

## EdgeOne Pages 部署

1. 为个性化后的 `myBlogs` 创建一个独立 GitHub 仓库，建议设为 Private。
2. 在本地管理器的部署设置中填写：
   - 前端物理路径：本机 `myBlogs` 目录
   - 源码仓库：部署仓库的 HTTPS 或 SSH 地址
   - 分支：通常为 `main`
3. 在 EdgeOne Pages 中导入该仓库，框架选择 **Next.js**。
4. 使用以下构建配置：
   - 安装命令：`npm ci`
   - 构建命令：`npm run build`
   - 输出目录：`.next`
5. 配置生产环境变量并重新部署。

如果使用 SSH 同步，可通过管理器生成专用 Deploy Key，并在目标仓库中授予写权限。Deploy Key 只能用于个性化部署仓库，不要提交私钥文件。

## 生产环境变量

| 变量 | 用途 |
| --- | --- |
| `GEMINI_API_KEY` | AI 猫猫助理 |
| `GITHUB_OAUTH_CLIENT_SECRET` | GitHub 评论 OAuth 服务端交换 |
| `KV_REST_API_URL` | Upstash Redis REST 地址 |
| `KV_REST_API_TOKEN` | Upstash Redis 服务端令牌 |
| `STATS_OWNER_KEY` | 排除站长浏览器统计的随机长字符串 |

兼容的 Redis 变量名为 `UPSTASH_REDIS_REST_URL` 和 `UPSTASH_REDIS_REST_TOKEN`。

OAuth Client ID、评论仓库名和管理员账号可以公开；Client Secret 只能存在于本地私有配置或部署环境变量中。

## 访问统计

访客按浏览器和上海自然日去重；文章、杂谈和说说浏览次数按内容、浏览器和日期去重。常见爬虫不会计数。

配置 `STATS_OWNER_KEY` 并重新部署后，访问：

```text
https://你的博客域名/stats-owner
```

输入同一密钥即可排除当前浏览器。密钥只在服务端校验，不应写入仓库。

## 更新现有安装

双击根目录的 `update.bat`，或运行：

```powershell
python update.py
```

更新器只替换通用代码和模板，并保留被 Git 忽略的个人内容及配置。可通过 `YUKIBLOGS_UPDATE_REMOTE` 环境变量临时指定其他更新源。

## 开发者验证

```powershell
node scripts/checkPublicRepo.mjs

cd myBlogs
npm ci
npm run lint
npm run typecheck
npm run test:stats
npm run build

cd ..\my-blog-manager
npm ci
npm run lint
npm run typecheck
uv run python -m unittest discover -s tests -v
npm run build
```

## 许可证

本项目采用 [CC BY-NC 4.0](LICENSE) 许可。允许学习、分享和二次修改，但禁止商业使用；二次发布请保留原作者署名。
