import { NextResponse } from 'next/server';
import { getGitHubOAuthSecret, getRuntimeGitalkConfig } from '../../../lib/server/runtimeConfig';

const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';

export async function POST(req: Request) {
  const clientSecret = getGitHubOAuthSecret();
  if (!clientSecret) {
    return NextResponse.json({ error: 'OAuth client secret is not configured' }, { status: 500 });
  }

  try {
    const contentType = req.headers.get('content-type') || '';
    let payload: Record<string, string>;
    if (contentType.includes('application/json')) {
      const input = await req.json() as Record<string, unknown>;
      payload = Object.fromEntries(
        Object.entries(input).map(([key, value]) => [key, String(value ?? '')]),
      );
    } else {
      payload = Object.fromEntries(new URLSearchParams(await req.text()));
    }

    payload.client_secret = clientSecret;
    const githubRes = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    const data = await githubRes.json();
    return NextResponse.json(data, { status: githubRes.status });
  } catch (error) {
    console.error('GitHub OAuth proxy failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function GET() {
  const config = getRuntimeGitalkConfig();
  const missing = [
    !config.clientID && 'Client ID',
    !getGitHubOAuthSecret() && 'Client Secret',
    !config.repo && 'Repo',
    !config.owner && 'Owner',
  ].filter(Boolean);
  return NextResponse.json({ configured: missing.length === 0, missing });
}
