export type FirebaseNpcTurn = {
  from: 'player' | 'npc';
  text: string;
  senderLabel?: string;
  channelLabel: string;
};

export type FirebaseNpcResult = {
  reply: string;
};

export type FirebaseAiFailureDiagnostic = {
  kind: 'app-check' | 'api-key' | 'quota' | 'network' | 'unknown';
  code: string;
  status?: number;
  detail: string;
};

const firebaseConfig = {
  // Firebase web configuration is public by design. The key is restricted by
  // referrer and App Check in the Firebase/Google Cloud consoles.
  apiKey: 'AIzaSyB7vbJ_tyyq-A9RiyPk8CNSAkov0qW2byE',
  authDomain: 'phong-203.firebaseapp.com',
  projectId: 'phong-203',
  storageBucket: 'phong-203.firebasestorage.app',
  messagingSenderId: '205328934239',
  appId: '1:205328934239:web:ce53a11142bebbdbfa82ea',
  measurementId: 'G-MP112E9TTZ',
};

export const FIREBASE_APP_CHECK_CONSOLE_URL =
  'https://console.firebase.google.com/project/phong-203/appcheck/apps?selectedAppId=1%3A205328934239%3Aweb%3Ace53a11142bebbdbfa82ea';

const LOCAL_APP_CHECK_TOKEN_KEY = 'phong-203:firebase-app-check-debug-token';

let localAppCheckDebugToken: string | null = null;

function isLocalDevelopmentHost() {
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
}

export function getLocalAppCheckDebugToken() {
  if (!isLocalDevelopmentHost()) return null;
  if (localAppCheckDebugToken) return localAppCheckDebugToken;

  try {
    const saved = window.localStorage.getItem(LOCAL_APP_CHECK_TOKEN_KEY);
    if (saved) {
      localAppCheckDebugToken = saved;
      return saved;
    }
  } catch {
    // Some private browser modes disable persistent storage. The in-memory
    // token still lets the current tab finish local App Check setup.
  }

  const token = window.crypto.randomUUID();
  localAppCheckDebugToken = token;
  try {
    window.localStorage.setItem(LOCAL_APP_CHECK_TOKEN_KEY, token);
  } catch {
    // Keep the token in memory when localStorage is unavailable.
  }
  return token;
}

export function getFirebaseAiFailureDiagnostic(
  error: unknown,
): FirebaseAiFailureDiagnostic {
  const errorRecord =
    typeof error === 'object' && error !== null
      ? (error as Record<string, unknown>)
      : null;
  const customData =
    errorRecord &&
    typeof errorRecord.customErrorData === 'object' &&
    errorRecord.customErrorData !== null
      ? (errorRecord.customErrorData as Record<string, unknown>)
      : null;
  const code = typeof errorRecord?.code === 'string' ? errorRecord.code : '';
  const message =
    typeof errorRecord?.message === 'string'
      ? errorRecord.message.toLowerCase()
      : '';
  const statusFromMessage = message.match(
    /(?:http status:|\[)\s*(401|403|429)\b/,
  )?.[1];
  const status =
    typeof customData?.status === 'number'
      ? customData.status
      : statusFromMessage
        ? Number(statusFromMessage)
        : undefined;

  let kind: FirebaseAiFailureDiagnostic['kind'] = 'unknown';
  if ((status === 401 || status === 403) && /app[\s-]?check/.test(message)) {
    kind = 'app-check';
  } else if (status === 403 && /api key|blocked/.test(message)) {
    kind = 'api-key';
  } else if (status === 429) {
    kind = 'quota';
  } else if (!status && /network|fetch|timeout|abort/.test(message)) {
    kind = 'network';
  }

  const detail = message
    .replace(/https?:\/\/\S+/g, '[endpoint]')
    .replace(/AIza[\w-]+/g, '[api-key]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);

  return { kind, code, detail, ...(status === undefined ? {} : { status }) };
}

let modelPromise: Promise<import('firebase/ai').GenerativeModel> | null = null;

async function getNpcModel() {
  if (!modelPromise) {
    const pendingModel = (async () => {
      if (typeof window === 'undefined')
        throw new Error('Firebase AI Logic must run in a browser');

      const debugToken = getLocalAppCheckDebugToken();
      if (debugToken) {
        const debugGlobal = globalThis as typeof globalThis & {
          FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string;
        };
        debugGlobal.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
      }

      const [
        { getApp, getApps, initializeApp },
        { getAI, getGenerativeModel, GoogleAIBackend },
        { initializeAppCheck, ReCaptchaEnterpriseProvider },
      ] = await Promise.all([
        import('firebase/app'),
        import('firebase/ai'),
        import('firebase/app-check'),
      ]);
      const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
      try {
        initializeAppCheck(app, {
          provider: new ReCaptchaEnterpriseProvider(
            '6LePEqYtAAAAAMzs230Zgqd6n_QloajhMpWV1NU0',
          ),
          isTokenAutoRefreshEnabled: true,
        });
      } catch (error) {
        const code =
          typeof error === 'object' && error !== null && 'code' in error
            ? String(error.code)
            : '';
        if (code !== 'appCheck/already-initialized') throw error;
      }
      const ai = getAI(app, {
        backend: new GoogleAIBackend(),
        useLimitedUseAppCheckTokens: true,
      });
      return getGenerativeModel(
        ai,
        {
          model: 'gemini-3.1-flash-lite',
          systemInstruction: (await import('./npc-prompt')).NPC_SYSTEM_PROMPT,
          generationConfig: {
            temperature: 0.82,
            maxOutputTokens: 160,
            responseMimeType: 'application/json',
            responseJsonSchema: {
              type: 'object',
              properties: { reply: { type: 'string' } },
              required: ['reply'],
            },
          },
        },
        { timeout: 30_000 },
      );
    })();
    modelPromise = pendingModel;
    void pendingModel.catch(() => {
      if (modelPromise === pendingModel) modelPromise = null;
    });
  }
  return modelPromise;
}

function parseResult(value: string): FirebaseNpcResult {
  const parsed = JSON.parse(value) as Partial<FirebaseNpcResult>;
  if (typeof parsed.reply !== 'string' || !parsed.reply.trim())
    throw new Error('Firebase AI returned an empty reply');
  const reply = parsed.reply
    .trim()
    .replace(/https?:\/\/\S+/gi, '[đường dẫn đã ẩn]')
    .split(/\s+/)
    .slice(0, 60)
    .join(' ')
    .slice(0, 400);
  return { reply };
}

export async function generateFirebaseNpcReply(input: {
  personaId: string;
  npcName: string;
  playerRole: string;
  roleBrief: string;
  allowedFacts: string[];
  forbiddenClaims: string[];
  voiceExamples: string[];
  sceneState: string[];
  participantLabel: string;
  latestMessage: string;
  history: FirebaseNpcTurn[];
}) {
  const model = await getNpcModel();
  const history = input.history
    .slice(-10)
    .map(
      (turn) =>
        `[${turn.channelLabel}] ${turn.from === 'player' ? 'Người chơi' : (turn.senderLabel ?? input.participantLabel)}: ${turn.text.slice(0, 320)}`,
    )
    .join('\n');
  const prompt = `NPC ĐƯỢC GẮN CHO CUỘC TRÒ CHUYỆN
Mã nhân vật: ${input.personaId}
Tên hiển thị: ${input.npcName}
Người đang nói chuyện với bạn: ${input.playerRole}

HỒ SƠ, QUAN HỆ VÀ MỤC TIÊU
${input.roleBrief}

MẪU GIỌNG NÓI CỦA RIÊNG NHÂN VẬT
${input.voiceExamples.map((example) => `- ${example}`).join('\n')}

TRẠNG THÁI CẢNH HIỆN TẠI DO GAME XÁC NHẬN
${input.sceneState.length ? input.sceneState.map((item) => `- ${item}`).join('\n') : '- Chưa có thay đổi mới.'}

DỮ KIỆN ĐƯỢC PHÉP
${input.allowedFacts.map((fact) => `- ${fact}`).join('\n')}

KHÔNG ĐƯỢC KHẲNG ĐỊNH
${input.forbiddenClaims.map((claim) => `- ${claim}`).join('\n')}

${history ? `TRÍ NHỚ XUYÊN CÁC KÊNH MÀ NHÂN VẬT ĐÃ THAM GIA\n${history}\n\n` : ''}TIN NHẮN MỚI CỦA NGƯỜI CHƠI
${input.latestMessage.slice(0, 500)}

Trả về đúng JSON theo schema.`;
  const result = await model.generateContent(prompt);
  return parseResult(result.response.text());
}
