import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import Navbar from '../../components/Navbar';
import PageTransition from '../../components/PageTransition';
import { siteConfig } from '../../siteConfig';
import TimelineClient from '../../components/TimelineClient';

// 🌟 核心修复：强制每次请求实时读取文件系统，避免构建期静态预渲染导致
// 新发布文章永远不进入归档；同时用 YUKIBLOGS_CONTENT_ROOT 定位真实内容目录
// （打包运行时 process.cwd() 指向 .next/standalone，那里没有 posts/）。
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const contentRoot = process.env.YUKIBLOGS_CONTENT_ROOT || process.cwd();

export default function Timeline() {
  const postsDirectory = path.join(contentRoot, 'posts');
  let posts: any[] = [];
  let tagCounts: Record<string, number> = {};

  try {
    if (fs.existsSync(postsDirectory)) {
      const fileNames = fs.readdirSync(postsDirectory).filter(f => f.endsWith('.md'));

      fileNames.forEach(fileName => {
        const slug = fileName.replace(/\.md$/, '');
        const fullPath = path.join(postsDirectory, fileName);

        // 🌟 核心清理：不再读取物理状态 (stats)，彻底抛弃 mtime
        const fileContents = fs.readFileSync(fullPath, 'utf8');
        const { data } = matter(fileContents);

        const postTags = data.tags && Array.isArray(data.tags) ? data.tags : ['未分类'];

        postTags.forEach(tag => {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        });

        posts.push({
          slug,
          title: data.title || '无标题',
          date: data.date || '1970-01-01',
          description: data.description || '',
          tags: postTags,
          cover: data.cover || siteConfig.defaultPostCover,
          // 删除了坑人的 mtime
        });
      });

      // 🌟 核心修复：权重排序 -> YAML 精确日期第一，slug 字母表第二
      posts.sort((a, b) => {
        const dateDiff = new Date(b.date).getTime() - new Date(a.date).getTime();
        // 如果两篇文章的日期和时分秒完全一样，按文件名排序兜底，确保在任何服务器上顺序一致
        return dateDiff !== 0 ? dateDiff : b.slug.localeCompare(a.slug);
      });
    }
  } catch(e) {
    console.error("读取文章列表失败", e);
  }

  const tagsArray = Object.keys(tagCounts)
    .map(name => ({ name, count: tagCounts[name] }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="min-h-screen relative pb-32">
      <Navbar />
      <PageTransition>
        <TimelineClient posts={posts} tags={tagsArray} />
      </PageTransition>
    </div>
  );
}