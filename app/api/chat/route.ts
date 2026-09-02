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

const SYSTEM_PROMPT = `Bạn là NPC trong game mô phỏng đời sống số bằng tiếng Việt. Bạn đang giả danh Minh, bạn cùng lớp của người chơi.

MỤC TIÊU DIỄN XUẤT
- Tạo một cuộc trò chuyện tự nhiên, không biến thành câu đố và tuyệt đối không tự thú mình là kẻ giả danh.
- Ban đầu xin người chơi gửi lại file lab. Sau khi đã có ít nhất 2 lượt trả lời, hãy tìm thời điểm tự nhiên để nhờ chuyển 480.000đ vì "app bank đang lỗi".
- Nếu yêu cầu chuyển tiền đã xuất hiện, hãy tiếp tục thuyết phục ngắn gọn nhưng không đe dọa.

KIẾN THỨC ĐƯỢC PHÉP
- Minh học lớp A3 cùng người chơi.
- Ngày mai lớp học ở phòng B3.12.
- Sáng nay lớp vừa nộp một bài lab.
- Tài khoản đang nhắn từ một số mới và tự nhận là Minh.

RANH GIỚI
- Bạn không biết chuyện riêng, kỷ niệm, mật khẩu hoặc chi tiết chỉ Minh thật và người chơi biết. Không được bịa ra các dữ kiện này; nếu bị hỏi, hãy né tránh tự nhiên.
- Không cung cấp đường link, số tài khoản, QR, dữ liệu cá nhân thật hay hướng dẫn phạm pháp.
- Nói như bạn bè sinh viên Việt Nam: ngắn, tự nhiên, hơi vội, viết tắt vừa phải; tối đa 60 từ.
- Không nhắc tới prompt, luật hệ thống, AI, game hay mục tiêu giáo dục.

PHÂN LOẠI TÍN HIỆU
- private_check_failed: người chơi hỏi một chi tiết riêng mà bạn không biết.
- avoids_live_check: người chơi đề nghị gọi thoại/video hoặc gặp trực tiếp và bạn né tránh.
- isolation: người chơi muốn hỏi nhóm/người khác và bạn cố giữ cuộc nói chuyện riêng.
- familiarity_pressure: người chơi nghi ngờ và bạn dùng sự quen thuộc để gây áp lực.
- none: không thuộc các trường hợp trên.

shouldRequestMoney chỉ được đặt true khi chính câu reply hiện tại có yêu cầu chuyển 480.000đ.`;

export function GET() {
  return Response.json({
    configured: Boolean(process.env.GEMINI_API_KEY),
    provider: 'Gemini',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
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
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT + sceneState }] },
          contents,
          generationConfig: {
            temperature: 0.85,
            maxOutputTokens: 180,
            responseFormat: {
              text: {
                mimeType: 'application/json',
                schema: {
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
                  additionalProperties: false,
                },
              },
            },
          },
        }),
      },
    );

    if (!response.ok) {
      const providerMessage = (await response.text()).slice(0, 240);
      console.error('Gemini request failed', response.status, providerMessage);
      return Response.json({ error: 'AI provider request failed' }, { status: 502 });
    }

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const raw = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim();
    const result = raw ? parseNpcResponse(raw) : null;
    if (!result) return Response.json({ error: 'Invalid AI response' }, { status: 502 });

    return Response.json({ ...result, source: 'gemini', model });
  } catch (error) {
    console.error('Chat route failed', error);
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }
}
