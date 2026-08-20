import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptsDir, '..');
const defaultsPath = path.join(scriptsDir, 'siteConfig.defaults.json');
const templatesDir = path.join(scriptsDir, 'templates');
const dataPath = path.join(root, 'my-blog-manager', 'data', 'site_config.json');
const managerPath = path.join(root, 'my-blog-manager', 'siteConfig.ts');
const blogPath = path.join(root, 'myBlogs', 'siteConfig.ts');
const privateKeys = new Set(['picBedName', 'picBedUrl', 'picBedToken']);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function mergeMissing(defaults, current) {
  const merged = { ...current };
  for (const [key, value] of Object.entries(defaults)) {
    if (!(key in merged)) merged[key] = value;
  }
  return merged;
}

function render(config) {
  return [
    '// Generated from data/site_config.json by scripts/checkConfig.mjs.',
    '// This runtime file is intentionally ignored by Git.',
    `export const siteConfig = ${JSON.stringify(config, null, 2)};`,
    '',
  ].join('\n');
}

function copyTemplateIfMissing(templateName, destinations) {
  const content = fs.readFileSync(path.join(templatesDir, templateName), 'utf8');
  for (const destination of destinations) {
    if (fs.existsSync(destination)) continue;
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, content, 'utf8');
  }
}

const defaults = readJson(defaultsPath);
const current = fs.existsSync(dataPath) ? readJson(dataPath) : {};
const merged = mergeMissing(defaults, current);
fs.mkdirSync(path.dirname(dataPath), { recursive: true });
fs.writeFileSync(dataPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
fs.writeFileSync(managerPath, render(merged), 'utf8');

const publicConfig = Object.fromEntries(
  Object.entries(merged).filter(([key]) => !privateKeys.has(key)),
);
if (publicConfig.gitalkConfig) {
  const { clientSecret: _secret, ...safeGitalkConfig } = publicConfig.gitalkConfig;
  publicConfig.gitalkConfig = safeGitalkConfig;
}
fs.writeFileSync(blogPath, render(publicConfig), 'utf8');

for (const dataFile of ['friends.ts', 'albums.ts', 'projects.ts']) {
  copyTemplateIfMissing(dataFile, [
    path.join(root, 'my-blog-manager', 'data', dataFile),
    path.join(root, 'myBlogs', 'data', dataFile),
  ]);
}
copyTemplateIfMissing('about.md', [
  path.join(root, 'my-blog-manager', 'app', 'about', 'about.md'),
  path.join(root, 'myBlogs', 'app', 'about', 'about.md'),
]);

for (const contentDir of [
  path.join(root, 'my-blog-manager', 'posts'),
  path.join(root, 'my-blog-manager', 'chatters'),
  path.join(root, 'my-blog-manager', 'drafts'),
  path.join(root, 'myBlogs', 'posts'),
  path.join(root, 'myBlogs', 'chatters'),
]) {
  fs.mkdirSync(contentDir, { recursive: true });
}

console.log('✅ 运行时配置与空白内容数据已就绪（这些文件不会被 Git 跟踪）。');
