import { siteConfig } from '../siteConfig';

export type PublicGitalkConfig = {
  clientID: string;
  repo: string;
  owner: string;
  admin: string[];
};

export async function loadGitalkRuntimeConfig(): Promise<PublicGitalkConfig> {
  try {
    const response = await fetch(`/api/runtime-config?t=${Date.now()}`, { cache: 'no-store' });
    if (response.ok) {
      const payload = await response.json() as { gitalkConfig?: Partial<PublicGitalkConfig> };
      const config = payload.gitalkConfig || {};
      return {
        clientID: String(config.clientID || ''),
        repo: String(config.repo || ''),
        owner: String(config.owner || ''),
        admin: Array.isArray(config.admin) ? config.admin.map(String) : [],
      };
    }
  } catch {
    // Fall through to the build-time configuration when the runtime route is unavailable.
  }

  return {
    clientID: siteConfig.gitalkConfig.clientID,
    repo: siteConfig.gitalkConfig.repo,
    owner: siteConfig.gitalkConfig.owner,
    admin: siteConfig.gitalkConfig.admin,
  };
}
