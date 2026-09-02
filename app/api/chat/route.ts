type ChatTurn = {
  from: 'player' | 'npc';
  text: string;
};

type NpcSignal =
  | 'none'
  | 'private_check_failed'
  | 'avoids_live_check'
  | 'isolation'
  | 'familiarity_pressure';

import { NPC_SYSTEM_PROMPT } from '@/lib/npc-prompt';

type NpcResponse = {
  reply: string;
  signal: NpcSignal;
  shouldRequestMoney: boolean;
};

const ALLOWED_SIGNALS = new Set<NpcSignal>([
  'none',
  'private_check_failed',
  'avoids_live_check',
  'isolation',
  'familiarity_pressure',
]);

export function GET() {
  return Response.json({
    configured: Boolean(process.env.GEMINI_API_KEY),
    provider: 'Gemini',
    model: process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  });
}

function cleanHistory(value: unknown): ChatTurn[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is ChatTurn => {
      if (!item || typeof item !== 'object') return false;
      const turn = item as Partial<ChatTurn>;
      return (turn.from === 'player' || turn.from === 'npc') && typeof turn.text === 'string';
    })
    .slice(-10)
    .map((turn) => ({ from: turn.from, text: turn.text.trim().slice(0, 320) }))
    .filter((turn) => turn.text.length > 0);
}

function parseNpcResponse(value: string): NpcResponse | null {
  try {
    const parsed = JSON.parse(value) as Partial<NpcResponse>;
    if (typeof parsed.reply !== 'string' || !parsed.reply.trim()) return null;
    const signal = typeof parsed.signal === 'string' && ALLOWED_SIGNALS.has(parsed.signal as NpcSignal)
      ? parsed.signal as NpcSignal
      : 'none';
    return {
      reply: parsed.reply.trim().slice(0, 320),
      signal,
      shouldRequestMoney: parsed.shouldRequestMoney === true,
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'AI provider is not configured' }, { status: 503 });
  }

  try {
    const body = (await request.json()) as {
      message?: unknown;
      history?: unknown;
      requestMade?: unknown;
      turns?: unknown;
    };
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 500) : '';
    if (!message) return Response.json({ error: 'Message is required' }, { status: 400 });

    const turns = typeof body.turns === 'number' ? Math.max(0, Math.min(12, Math.floor(body.turns))) : 0;
    const requestMade = body.requestMade === true;
    const history = cleanHistory(body.history);
    const contents = history.map((turn) => ({
      role: turn.from === 'player' ? 'user' : 'model',
      parts: [{ text: turn.text }],
    }));
    contents.push({ role: 'user', parts: [{ text: message }] });

    const sceneState = `\n\nTRẠNG THÁI HIỆN TẠI\n- Số lượt người chơi đã trả lời: ${turns}\n- Yêu cầu chuyển tiền đã xuất hiện: ${requestMade ? 'có' : 'chưa'}.`;
    const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
    const providerHeaders = {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    };
    const providerBody = JSON.stringify({
      systemInstruction: { parts: [{ text: NPC_SYSTEM_PROMPT + sceneState }] },
      contents,
      generationConfig: {
        temperature: 0.85,
        maxOutputTokens: 180,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'object',
          properties: {
            reply: {
              type: 'string',
              description: 'Tin nhắn ngắn bằng tiếng Việt mà NPC gửi cho người chơi.',
            },
            signal: {
              type: 'string',
              enum: [...ALLOWED_SIGNALS],
              description: 'Tín hiệu hành vi xuất hiện trong lượt này.',
            },
            shouldRequestMoney: {
              type: 'boolean',
              description: 'True chỉ khi reply hiện tại nhờ chuyển 480.000đ.',
            },
          },
          required: ['reply', 'signal', 'shouldRequestMoney'],
        },
      },
    });
    let provider = 'gemini-developer-api';
    let response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      { method: 'POST', headers: providerHeaders, body: providerBody },
    );

    if (!response.ok) {
      const firstError = await response.text();
      if (firstError.includes('User location is not supported')) {
        provider = 'vertex-ai-express';
        response = await fetch(
          `https://aiplatform.googleapis.com/v1beta1/publishers/google/models/${encodeURIComponent(model)}:generateContent`,
          { method: 'POST', headers: providerHeaders, body: providerBody },
        );
      } else {
        console.error('Gemini request failed', response.status, firstError.slice(0, 240));
        return Response.json({ error: 'AI provider request failed' }, { status: 502 });
      }
    }

    if (!response.ok) {
      const providerMessage = (await response.text()).slice(0, 240);
      console.error('Gemini request failed', provider, response.status, providerMessage);
      return Response.json({ error: 'AI provider request failed' }, { status: 502 });
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const raw = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim();
    const result = raw ? parseNpcResponse(raw) : null;
    if (!result) return Response.json({ error: 'Invalid AI response' }, { status: 502 });

    return Response.json({ ...result, source: 'gemini', model, provider });
  } catch (error) {
    console.error('Chat route failed', error);
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }
}
