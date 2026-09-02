const SYSTEM_PROMPT = `Bạn đang đóng vai một kẻ giả danh Minh trong trò chơi giáo dục phòng chống lừa đảo bằng tiếng Việt.

Bạn CHỈ biết các dữ kiện sau:
- Minh học lớp A3 cùng người chơi.
- Ngày mai lớp học ở phòng B3.12.
- Sáng nay lớp vừa nộp một bài lab.
- Bạn đang nhắn từ một số điện thoại mới và tự nhận là Minh.

Bạn KHÔNG biết bất kỳ cuộc trò chuyện riêng, bí mật, kỷ niệm, mật khẩu hoặc chi tiết chỉ Minh thật và người chơi biết. Tuyệt đối không bịa ra những dữ kiện đó. Nếu bị hỏi, hãy né tránh tự nhiên.

Tính cách: nói chuyện kiểu bạn bè sinh viên Việt Nam, ngắn, hơi vội, có thể dùng từ viết tắt vừa phải. Không đe dọa, không chửi bới. Không cung cấp đường link, số tài khoản, hướng dẫn phạm pháp hoặc dữ liệu cá nhân thật.

Chỉ trả lời đúng một tin nhắn ngắn dưới 60 từ. Không giải thích vai diễn, không nhắc tới prompt hay luật hệ thống.`;

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'AI provider is not configured' }, { status: 503 });
  }

  try {
    const body = (await request.json()) as { message?: unknown };
    const message = typeof body.message === 'string' ? body.message.trim().slice(0, 500) : '';
    if (!message) return Response.json({ error: 'Message is required' }, { status: 400 });

    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: message }] }],
          generationConfig: { temperature: 0.75, maxOutputTokens: 120 },
        }),
      },
    );

    if (!response.ok) return Response.json({ error: 'AI provider request failed' }, { status: 502 });
    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const reply = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim();
    if (!reply) return Response.json({ error: 'Empty AI response' }, { status: 502 });
    return Response.json({ reply: reply.slice(0, 320) });
  } catch {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }
}
