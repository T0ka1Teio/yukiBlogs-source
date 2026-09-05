import { siteConfig } from "../../siteConfig";
import PhotoWallClient from "./PhotoWallClient";
import fs from 'node:fs/promises';
import path from 'node:path';

export const metadata = {
  title: "照片墙 | " + siteConfig.title,
};

export default async function PhotoWallPage() {
  let previews = {};
  try {
    previews = JSON.parse(await fs.readFile(path.join(process.cwd(), '.cache/gallery-previews.json'), 'utf8'));
  } catch {
    // Direct next dev/start invocations can run without the optional preview cache.
  }
  return <PhotoWallClient previews={previews} />;
}
