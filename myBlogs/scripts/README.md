# 照片墙预览

`npm run dev` 和 `npm run build` 会先运行 `gallery:previews`，根据 `data/albums.ts` 中的封面和照片生成 16px 模糊 WebP 预览。预览以 Data URL 随页面发送，不需要访客额外请求原图来生成占位图；Next.js Image 在原图下载和解码完成后移除占位，并使用浏览器原有 HTTP 缓存。

首次生成会下载相册原图，因此首次启动或构建需要额外时间。后续构建复用七天内的远程预览缓存；本地 `public/` 图片每次重新生成。添加照片后重新启动开发服务或重新构建发布即可。可单独运行 `npm run gallery:previews` 更新预览。

脚本限制四个并发下载，每次请求超时 15 秒，下载失败重试一次；最大原图 30 MB / 一亿像素。不可用或不支持的图片跳过预览，原图仍按原地址加载。预览生成失败不会单独阻止发布。原图 URL 和内容不做修改，实际下载速度仍取决于图床。

生成结果位于 `.cache/gallery-previews.json`，包含个人图片预览，不应提交到干净源码仓库。删除缓存后下次运行会重新生成。直接执行 `next build` 会跳过 npm 的预览生成钩子，请使用 `npm run build`。

验证：`npm run test:gallery`。
