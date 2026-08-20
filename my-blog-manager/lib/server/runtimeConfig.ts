import 'server-only';

import fs from 'fs';
import path from 'path';
import { siteConfig } from '../../siteConfig';

export type GitalkRuntimeConfig = {
  clientID: string;
  clientSecret?: string;
  repo: string;
  owner: string;
  admin: string[];
};

export type RuntimeFooterBadge = {
  name: string;
  color: string;
  svg: string;
};

export type RuntimeGeminiConfig = {
  modelId: string;
  systemPrompt: string;
  maxOutputTokens: number;
  temperature: number;
};

type RuntimeSiteConfig = {
  [key: string]: unknown;
  buildDate?: string;
  footerBadges?: RuntimeFooterBadge[];
  friendLinkApplyFormat?: string;
  gitalkConfig?: Partial<GitalkRuntimeConfig>;
};

const PRIVATE_CONFIG_KEYS = new Set(['picBedName', 'picBedUrl', 'picBedToken']);

export function readRuntimeSiteConfig(): RuntimeSiteConfig {
  const contentRoot = process.env.YUKIBLOGS_CONTENT_ROOT;
  if (contentRoot) {
    const configPath = path.join(contentRoot, 'data', 'site_config.json');
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf8')) as RuntimeSiteConfig;
    } catch (error) {
      console.error('Failed to read runtime site configuration:', error);
    }
  }
  return siteConfig as RuntimeSiteConfig;
}

export function getRuntimeGitalkConfig(): GitalkRuntimeConfig {
  const config = readRuntimeSiteConfig().gitalkConfig || {};
  return {
    clientID: String(config.clientID || ''),
    clientSecret: String(config.clientSecret || ''),
    repo: String(config.repo || ''),
    owner: String(config.owner || ''),
    admin: Array.isArray(config.admin) ? config.admin.map(String) : [],
  };
}

export function getRuntimeBuildDate() {
  const runtimeValue = readRuntimeSiteConfig().buildDate;
  if (typeof runtimeValue === 'string' && Number.isFinite(Date.parse(runtimeValue))) {
    return runtimeValue;
  }
  return String(siteConfig.buildDate || '2026-03-23T00:00:00');
}

export function getRuntimeFooterBadges(): RuntimeFooterBadge[] {
  const runtimeBadges = readRuntimeSiteConfig().footerBadges;
  const source = Array.isArray(runtimeBadges) ? runtimeBadges : siteConfig.footerBadges;
  if (!Array.isArray(source)) return [];
  return source
    .filter((badge): badge is RuntimeFooterBadge => Boolean(
      badge
      && typeof badge.name === 'string'
      && typeof badge.color === 'string'
      && typeof badge.svg === 'string',
    ))
    .map(({ name, color, svg }) => ({ name, color, svg }));
}

export function getRuntimeFriendLinkApplyFormat() {
  const runtimeValue = readRuntimeSiteConfig().friendLinkApplyFormat;
  return typeof runtimeValue === 'string'
    ? runtimeValue
    : String(siteConfig.friendLinkApplyFormat || '');
}

export function getPublicRuntimeSiteConfig() {
  const runtimeConfig = readRuntimeSiteConfig();
  const publicConfig = Object.fromEntries(
    Object.entries(runtimeConfig).filter(([key]) => !PRIVATE_CONFIG_KEYS.has(key)),
  ) as Record<string, unknown>;
  const gitalkConfig = publicConfig.gitalkConfig;
  if (gitalkConfig && typeof gitalkConfig === 'object' && !Array.isArray(gitalkConfig)) {
    const { clientSecret: _secret, ...safeGitalkConfig } = gitalkConfig as Record<string, unknown>;
    publicConfig.gitalkConfig = safeGitalkConfig;
  }
  return publicConfig;
}

export function getRuntimeGeminiConfig(): RuntimeGeminiConfig {
  const runtimeValue = readRuntimeSiteConfig().geminiConfig;
  const fallback = siteConfig.geminiConfig;
  const config = runtimeValue && typeof runtimeValue === 'object' && !Array.isArray(runtimeValue)
    ? runtimeValue as Record<string, unknown>
    : {};
  return {
    modelId: String(config.modelId || fallback.modelId),
    systemPrompt: String(config.systemPrompt || fallback.systemPrompt),
    maxOutputTokens: Number(config.maxOutputTokens || fallback.maxOutputTokens),
    temperature: Number(config.temperature ?? fallback.temperature),
  };
}

export function getGitHubOAuthSecret() {
  return process.env.GITHUB_OAUTH_CLIENT_SECRET?.trim()
    || getRuntimeGitalkConfig().clientSecret?.trim()
    || '';
}
