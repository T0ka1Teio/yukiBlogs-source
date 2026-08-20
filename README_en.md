# yukiBlogs

yukiBlogs is a personal blog system built with Next.js 16, React 19, and Tailwind CSS 4. It includes the public-facing `myBlogs` frontend and the local `my-blog-manager` content manager. Features include Markdown posts, chatter, albums, friend links, projects, music, GitHub Issues comments, an AI cat assistant, and persistent traffic statistics.

This project is derived from [XinghuisamaBlogs](https://github.com/heiehiehi/XinghuisamaBlogs).

[English](README_en.md) · [中文](README.md)

## Architecture and deployment

- `my-blog-manager`: runs locally to edit configuration and content.
- `myBlogs`: the production Next.js frontend with server-side API routes.
- GitHub: hosts source code and triggers builds.
- Tencent Cloud EdgeOne Pages: the recommended production platform; any compatible Next.js server runtime can also be used.
- Cloudflare R2 or another object store: stores avatars, covers, and album images.
- Upstash Redis: persists visitor and content-view counters.

This is not a fully static site and is not intended for direct GitHub Pages deployment.

## Privacy and repository safety

The public repository tracks reusable source code only. The following files are generated locally and ignored by Git:

- site configuration, deployment paths, and generated `siteConfig.ts` files
- posts, chatter, drafts, and About-page content
- albums, friend links, and project data
- uploaded media and custom-domain files
- `.env` files, credentials, tokens, and local runtime state

The first run or build automatically executes:

```powershell
node scripts/checkConfig.mjs
```

It creates runtime files from generic templates without overwriting existing personal configuration. Before publishing source code, run:

```powershell
node scripts/checkPublicRepo.mjs
```

GitHub Actions runs the same safety check on every push and pull request. See [SECURITY.md](SECURITY.md) for details.

> API keys, OAuth client secrets, Redis tokens, and `STATS_OWNER_KEY` must stay in local or deployment environment variables. If a secret ever enters Git history, revoke and rotate it first; deleting the latest file does not undo exposure.

## Quick start

### Requirements

- Node.js 20.9 or later
- npm
- Python 3.10 or later; Python 3.12 is recommended
- [uv](https://docs.astral.sh/uv/)
- Git

### Clone and initialize

```powershell
git clone https://github.com/T0ka1Teio/yukiBlogs-source.git
cd yukiBlogs-source
node scripts/checkConfig.mjs
```

### Start the local manager

```powershell
cd my-blog-manager
uv sync --python 3.12
npm ci
uv run python run_me.py
```

Windows users can also run `Start.bat` after initializing dependencies. The manager accepts browser requests only from `localhost` or `127.0.0.1`.

### Run the blog frontend separately

```powershell
cd myBlogs
npm ci
npm run dev
```

`npm run dev`, `npm run typecheck`, and `npm run build` automatically create any missing local configuration files.

## Publishing workflow

After editing content in the local manager:

1. Add the change to the operation queue.
2. Choose **Update Local**.
3. Choose **Sync Blog** to generate frontend content.
4. Confirm the frontend path, source repository, and branch in deployment settings.
5. Run source sync to push the frontend repository and trigger an EdgeOne Pages build.

Keep the personalized frontend deployment repository **Private** when possible. This public repository is for reusable source code only.

## EdgeOne Pages deployment

1. Create a separate GitHub repository for the personalized `myBlogs` frontend; Private is recommended.
2. In the manager deployment settings, configure:
   - frontend path: the local `myBlogs` directory
   - source repository: the HTTPS or SSH URL of the deployment repository
   - branch: usually `main`
3. Import that repository into EdgeOne Pages and select **Next.js**.
4. Use:
   - install command: `npm ci`
   - build command: `npm run build`
   - output directory: `.next`
5. Add production environment variables and redeploy.

For SSH synchronization, generate a dedicated Deploy Key through the manager and grant it write access only to the personalized deployment repository. Never commit its private key.

## Production environment variables

| Variable | Purpose |
| --- | --- |
| `GEMINI_API_KEY` | AI cat assistant |
| `GITHUB_OAUTH_CLIENT_SECRET` | Server-side GitHub comment OAuth exchange |
| `KV_REST_API_URL` | Upstash Redis REST endpoint |
| `KV_REST_API_TOKEN` | Upstash Redis server token |
| `STATS_OWNER_KEY` | Random secret used to exclude the owner's browser |

The compatible Redis aliases are `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.

The OAuth Client ID, comment repository name, and administrator account may be public. The Client Secret must remain in private local configuration or deployment environment variables.

## Traffic statistics

Visitors are deduplicated by browser and Shanghai calendar day. Post, chatter, and moment views are deduplicated by content, browser, and date. Common crawlers are excluded.

After setting `STATS_OWNER_KEY` and redeploying, open:

```text
https://your-blog-domain/stats-owner
```

Enter the same key to exclude the current browser. The key is validated server-side and must never be committed.

## Updating an existing installation

Double-click `update.bat` in the project root, or run:

```powershell
python update.py
```

The updater replaces reusable code and templates while preserving ignored personal content and configuration. Set `YUKIBLOGS_UPDATE_REMOTE` to temporarily use another update source.

## Developer verification

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

## License

This project uses the [CC BY-NC 4.0](LICENSE) license. Learning, sharing, and modification are allowed, but commercial use is prohibited. Preserve author attribution when redistributing modified versions.
