# yukiBlogs

A personal blog frontend built with Next.js and a glassmorphism visual style. It supports Markdown articles, chatter posts, albums, projects, friend links, GitHub Issues comments, music, and an AI cat assistant.

[中文](README.md) · [Changelog](UpdateLog.md)

## Current Stack

- Next.js 16
- React 19
- Tailwind CSS 4
- TypeScript
- Upstash Redis
- Tencent Cloud EdgeOne Pages

## 2026-08-20 Update Summary

- The primary site can use a custom domain and be deployed and accelerated by Tencent Cloud EdgeOne Pages.
- GitHub OAuth now returns to the custom domain; comment sign-in and posting have been verified.
- Added configurable `siteUrl` metadata for the site base URL, home canonical URL, and Open Graph URL.
- Replaced the old deployment address in the friend-link application template.
- Removed the home weather widget and server-side weather route to avoid repeated browser location permission prompts for visitors.

## 2026-08-19 Update Summary

- Redis Lua scripts now update statistics atomically, avoiding lost increments during concurrent initialization or partial failures.
- Legacy article-view keys are migrated automatically, and all content statistics use `/api/stats/view/[kind]/[slug]`.
- Visitors and content views are deduplicated per browser per Shanghai calendar day.
- Fixed missing counts for chatter without a cover, dropped fast-click events, and clipped dashboard content at tablet widths.
- Added `/stats-owner` to exclude the owner's browser and filter common bots.
- Existing totals recorded before owner exclusion are intentionally preserved.

## Local Development

```powershell
npm ci
npm run dev
```

Open <http://localhost:3000>.

Recommended checks before committing:

```powershell
npm run lint
npm run typecheck
npm run build
npm run test:stats
```

## Environment Variables

Copy `.env.example` to `.env.local` and configure the variables you use:

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | AI cat assistant |
| `GITHUB_OAUTH_CLIENT_SECRET` | Server-side GitHub comment OAuth exchange |
| `KV_REST_API_URL` | Upstash Redis REST endpoint |
| `KV_REST_API_TOKEN` | Upstash Redis server token |
| `STATS_OWNER_KEY` | Secret for owner-traffic exclusion |

Keep secrets in local environment files or deployment-platform environment variables. Never commit them to Git.

## Traffic Statistics

1. Create or connect an Upstash Redis database.
2. Confirm that Production has `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
3. Set a random long `STATS_OWNER_KEY` and redeploy.
4. Open `https://your-blog-domain/stats-owner`, enter the same key, and exclude the current browser.

Visitors and content views are deduplicated by browser and Shanghai calendar day. Legacy article-view totals are migrated on first read. Owner traffic and common bots do not create new records; totals recorded before owner exclusion are preserved.

## Deployment

The production site can run on Tencent Cloud EdgeOne Pages with your own custom domain. Select **Next.js**, use `npm ci` as the install command, `npm run build` as the build command, `.next` as the output directory, and configure all production environment variables. The application uses server routes and is not intended for direct static GitHub Pages hosting.

## Complete Project Structure

This repository contains the EdgeOne Pages deployment frontend. The complete local project also includes the separate `my-blog-manager` console used to edit settings and content and synchronize deployment source.

## License

[CC BY-NC 4.0](../LICENSE)
