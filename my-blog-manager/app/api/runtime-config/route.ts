import { NextResponse } from 'next/server';
import {
  getRuntimeBuildDate,
  getRuntimeFooterBadges,
  getRuntimeFriendLinkApplyFormat,
  getRuntimeGitalkConfig,
  getPublicRuntimeSiteConfig,
} from '../../../lib/server/runtimeConfig';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { clientSecret: _secret, ...gitalkConfig } = getRuntimeGitalkConfig();
  return NextResponse.json(
    {
      buildDate: getRuntimeBuildDate(),
      footerBadges: getRuntimeFooterBadges(),
      friendLinkApplyFormat: getRuntimeFriendLinkApplyFormat(),
      gitalkConfig,
      siteConfig: getPublicRuntimeSiteConfig(),
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
