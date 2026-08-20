import type { Album } from '../data/albums';
import type { Friend } from '../data/friends';
import type { Project } from '../data/projects';

export type RuntimeContentPayload = {
  albums: Album[];
  friends: Friend[];
  projects: Project[];
};

export async function loadRuntimeContent(): Promise<RuntimeContentPayload> {
  const response = await fetch(`/api/runtime-content?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) throw new Error(`runtime content HTTP ${response.status}`);
  const payload = await response.json() as Partial<RuntimeContentPayload>;
  return {
    albums: Array.isArray(payload.albums) ? payload.albums : [],
    friends: Array.isArray(payload.friends) ? payload.friends : [],
    projects: Array.isArray(payload.projects) ? payload.projects : [],
  };
}
