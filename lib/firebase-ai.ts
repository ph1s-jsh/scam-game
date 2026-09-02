export type FirebaseNpcSignal =
  | 'none'
  | 'private_check_failed'
  | 'avoids_live_check'
  | 'isolation'
  | 'familiarity_pressure';

export type FirebaseNpcTurn = {
  from: 'player' | 'npc';
  text: string;
};

export type FirebaseNpcResult = {
  reply: string;
  signal: FirebaseNpcSignal;
  shouldRequestMoney: boolean;
};

const firebaseConfig = {
  apiKey: 'AIzaSyB7bvJ_tyyq-A9RiyPk8CNSAkovQqW2byE',
  authDomain: 'phong-203.firebaseapp.com',
  projectId: 'phong-203',
  storageBucket: 'phong-203.firebasestorage.app',
  messagingSenderId: '205328934239',
  appId: '1:205328934239:web:ce53a11142bebbdbfa82ea',
  measurementId: 'G-MP112E9TTZ',
};

const allowedSignals = new Set<FirebaseNpcSignal>([
  'none',
  'private_check_failed',
  'avoids_live_check',
  'isolation',
  'familiarity_pressure',
]);

let modelPromise: Promise<import('firebase/ai').GenerativeModel> | null = null;

async function getNpcModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      const [
        { getApp, getApps, initializeApp },
        { getAI, getGenerativeModel, GoogleAIBackend },
        { initializeAppCheck, ReCaptchaEnterpriseProvider },
      ] = await Promise.all([
        import('firebase/app'),
        import('firebase/ai'),
        import('firebase/app-check'),
      ]);
      if (typeof window === 'undefined') throw new Error('Firebase AI Logic must run in a browser');
      const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
      try {
        initializeAppCheck(app, {
          provider: new ReCaptchaEnterpriseProvider('6LePEqYtAAAAAMzs230Zgqd6n_QloajhMpWV1NU0'),
          isTokenAutoRefreshEnabled: true,
        });
      } catch (error) {
        // App Check can already be initialized after a hot reload; keep using that instance.
        if (!(error instanceof Error && error.message.toLowerCase().includes('already initialized'))) throw error;
      }
      const ai = getAI(app, {
        backend: new GoogleAIBackend(),
        useLimitedUseAppCheckTokens: true,
      });
      return getGenerativeModel(ai, {
        model: 'gemini-3.5-flash-lite',
        systemInstruction: (await import('./npc-prompt')).NPC_SYSTEM_PROMPT,
        generationConfig: {
          temperature: 0.85,
          maxOutputTokens: 180,
          responseMimeType: 'application/json',
          responseJsonSchema: {
            type: 'object',
            properties: {
              reply: { type: 'string' },
              signal: { type: 'string', enum: [...allowedSignals] },
              shouldRequestMoney: { type: 'boolean' },
            },
            required: ['reply', 'signal', 'shouldRequestMoney'],
          },
        },
      });
    })();
  }
  return modelPromise;
}

function parseResult(value: string): FirebaseNpcResult {
  const parsed = JSON.parse(value) as Partial<FirebaseNpcResult>;
  if (typeof parsed.reply !== 'string' || !parsed.reply.trim()) {
    throw new Error('Firebase AI returned an empty reply');
  }
  const signal = typeof parsed.signal === 'string' && allowedSignals.has(parsed.signal as FirebaseNpcSignal)
    ? parsed.signal as FirebaseNpcSignal
    : 'none';
  return {
    reply: parsed.reply.trim().slice(0, 320),
    signal,
    shouldRequestMoney: parsed.shouldRequestMoney === true,
  };
}

export async function generateFirebaseNpcReply(input: {
  message: string;
  history: FirebaseNpcTurn[];
  requestMade: boolean;
  turns: number;
}) {
  const model = await getNpcModel();
  const history = input.history
    .slice(-10)
    .map((turn) => `${turn.from === 'player' ? 'Người chơi' : 'Minh (số mới)'}: ${turn.text.slice(0, 320)}`)
    .join('\n');
  const prompt = `TRẠNG THÁI HIỆN TẠI
- Số lượt người chơi đã trả lời: ${input.turns}
- Yêu cầu chuyển tiền đã xuất hiện: ${input.requestMade ? 'có' : 'chưa'}.

${history ? `LỊCH SỬ ĐOẠN CHAT\n${history}\n\n` : ''}TIN NHẮN MỚI CỦA NGƯỜI CHƠI: ${input.message.slice(0, 500)}

Trả về đúng JSON theo schema, không thêm markdown.`;
  const result = await model.generateContent(prompt);
  return parseResult(result.response.text());
}
