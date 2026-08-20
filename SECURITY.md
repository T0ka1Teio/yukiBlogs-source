# Security and privacy

This repository contains reusable source code only. Personal configuration, local deployment paths,
posts, chatter, albums, friend links, project data, uploads, and custom domains are generated locally
and intentionally ignored by Git.

Run the repository safety check before publishing:

```powershell
node scripts/checkPublicRepo.mjs
```

Keep API keys and OAuth client secrets in local or deployment environment variables. If a secret is
ever committed, revoke it first; deleting the latest file does not remove it from Git history.
