import { getRuntimeGeminiConfig } from '../../../lib/server/runtimeConfig';

export const runtime = 'nodejs';

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;
const MAX_MESSAGE_LENGTH = 500;
const requestWindows = new Map<string, number[]>();

function clientKey(req: Request) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'anonymous';
}

function isRateLimited(key: string, now = Date.now()) {
  const recent = (requestWindows.get(key) || []).filter(time => now - time < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    requestWindows.set(key, recent);
    return true;
  }
  recent.push(now);
  requestWindows.set(key, recent);
  return false;
}

export async function POST(req: Request) {
  const key = clientKey(req);
  if (isRateLimited(key)) {
    return Response.json(
      { error: '请求过于频繁，请稍后再试' },
      { status: 429, headers: { 'Retry-After': '60' } },
    );
  }

  try {
    const body = await req.json() as { message?: unknown };
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!message || message.length > MAX_MESSAGE_LENGTH) {
      return Response.json(
        { error: `message 必须为 1-${MAX_MESSAGE_LENGTH} 个字符` },
        { status: 400 },
      );
    }

    const apiKey = (process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || '').trim();
    if (!apiKey) {
      return Response.json({ error: 'AI service is not configured' }, { status: 503 });
    }

    const geminiConfig = getRuntimeGeminiConfig();
    const modelId = geminiConfig.modelId;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: geminiConfig.systemPrompt }] },
        contents: [{ parts: [{ text: message }] }],
        generationConfig: {
          maxOutputTokens: geminiConfig.maxOutputTokens,
          temperature: geminiConfig.temperature,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    });

    const data = await response.json();
    if (!response.ok) {
      const details = typeof data === 'object' && data !== null && 'error' in data
        ? String((data as { error?: { message?: string } }).error?.message || '')
        : '';
      return Response.json({ error: '模型请求失败', details }, { status: response.status });
    }

    const reply = (data as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
      .candidates?.[0]?.content?.parts?.[0]?.text || '本喵现在不想理你喵...';
    return Response.json({ reply });
  } catch (error) {
    console.error('AI route failed:', error);
    return Response.json({ error: 'AI service request failed' }, { status: 500 });
  }
}

export async function GET() {
  return Response.json({ status: 'Ready', model: getRuntimeGeminiConfig().modelId });
}
