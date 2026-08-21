import fs from 'fs';
import { execFileSync } from 'child_process';

const tracked = execFileSync('git', ['ls-files', '-z'])
  .toString('utf8')
  .split('\0')
  .filter(Boolean);

const forbiddenPaths = new Set([
  'my-blog-manager/data/site_config.json',
  'my-blog-manager/data/deploy_config.json',
  'my-blog-manager/siteConfig.ts',
  'myBlogs/siteConfig.ts',
  'my-blog-manager/data/albums.ts',
  'my-blog-manager/data/friends.ts',
  'my-blog-manager/data/projects.ts',
  'myBlogs/data/albums.ts',
  'myBlogs/data/friends.ts',
  'myBlogs/data/projects.ts',
  'my-blog-manager/app/about/about.md',
  'myBlogs/app/about/about.md',
  'myBlogs/public/CNAME',
]);

const forbiddenPrefixes = [
  'picture/',
  'my-blog-manager/posts/',
  'my-blog-manager/chatters/',
  'my-blog-manager/drafts/',
  'myBlogs/posts/',
  'myBlogs/chatters/',
  'my-blog-manager/public/uploads/',
  'myBlogs/public/uploads/',
];

const secretPatterns = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['GitHub token', /(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,})/],
  ['Google API key', /AIza[0-9A-Za-z_-]{30,}/],
  ['AWS access key', /(?:AKIA|ASIA)[0-9A-Z]{16}/],
  ['Slack token', /xox[baprs]-[0-9A-Za-z-]{10,}/],
  ['OAuth client secret', /["']clientSecret["']\s*:\s*["'][0-9a-fA-F]{40,}["']/],
  ['non-empty secret environment value', /^(?:GEMINI_API_KEY|QWEATHER_KEY|GITHUB_OAUTH_CLIENT_SECRET|KV_REST_API_TOKEN|UPSTASH_REDIS_REST_TOKEN|STATS_OWNER_KEY)[\t ]*=[\t ]*[^\s#]+/m],
  ['credential URL', /(?:redis|rediss|postgres|postgresql|mongodb(?:\+srv)?):\/\/[^\s"']+:[^\s"']+@/],
  ['student email', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]*\.edu\.cn/i],
];

const findings = [];
for (const file of tracked) {
  if (forbiddenPaths.has(file) || forbiddenPrefixes.some((prefix) => file.startsWith(prefix))) {
    findings.push(`${file}: personal runtime/content path must not be tracked`);
    continue;
  }
  if ((/(^|\/)\.env(?:\.|$)/).test(file) && !file.endsWith('.env.example')) {
    findings.push(`${file}: environment file must not be tracked`);
    continue;
  }
  if (/\.(?:pem|key|p12|pfx)$/i.test(file)) {
    findings.push(`${file}: credential file must not be tracked`);
    continue;
  }

  let content;
  try {
    const buffer = fs.readFileSync(file);
    if (buffer.includes(0)) continue;
    content = buffer.toString('utf8');
  } catch {
    continue;
  }
  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(content)) findings.push(`${file}: ${label}`);
  }
}

if (findings.length > 0) {
  console.error('Public repository safety check failed:');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(`✅ Public repository safety check passed (${tracked.length} tracked files).`);
