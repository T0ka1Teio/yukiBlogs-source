import 'server-only';

import fs from 'fs';
import path from 'path';

import { albums as bundledAlbums, type Album } from '../../data/albums';
import { friendsData as bundledFriends, type Friend } from '../../data/friends';
import { projectsData as bundledProjects, type Project } from '../../data/projects';

export type RuntimeContent = {
  albums: Album[];
  friends: Friend[];
  projects: Project[];
};

function contentRoot() {
  return process.env.YUKIBLOGS_CONTENT_ROOT || process.cwd();
}

function readGeneratedArray<T>(fileName: string, exportName: string, fallback: T[]): T[] {
  const sourcePath = path.join(contentRoot(), 'data', fileName);
  try {
    const source = fs.readFileSync(sourcePath, 'utf8');
    const marker = new RegExp(`export\\s+const\\s+${exportName}[^=]*=\\s*`);
    const match = marker.exec(source);
    if (!match) return fallback;
    const payload = source.slice(match.index + match[0].length).trim().replace(/;\s*$/, '');
    const parsed = JSON.parse(payload);
    return Array.isArray(parsed) ? parsed as T[] : fallback;
  } catch (error) {
    console.error(`Failed to read runtime collection ${fileName}:`, error);
    return fallback;
  }
}

export function getRuntimeContent(): RuntimeContent {
  return {
    albums: readGeneratedArray<Album>('albums.ts', 'albums', bundledAlbums),
    friends: readGeneratedArray<Friend>('friends.ts', 'friendsData', bundledFriends),
    projects: readGeneratedArray<Project>('projects.ts', 'projectsData', bundledProjects),
  };
}
