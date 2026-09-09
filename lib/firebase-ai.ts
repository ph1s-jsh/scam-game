import type { NpcDirectorFact, NpcDirectorMove } from '../game/types';

export type FirebaseNpcTurn = {
  from: 'player' | 'npc';
  text: string;
  senderLabel?: string;
  channelLabel: string;
};

export type FirebaseNpcResult = {
  reply: string;
  move: NpcDirectorMove;
  factIdsUsed: string[];
};

const NPC_DIRECTOR_MOVES: NpcDirectorMove[] = [
  'answer',
  'clarify',
  'acknowledge',
  'refuse',
  'confirm',
  'boundary',
];

export type FirebaseAiFailureDiagnostic = {
  kind:
    | 'app-check'
    | 'api-key'
    | 'configuration'
    | 'quota'
    | 'network'
    | 'unknown';
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
  if (
    /app[\s-]?check|recaptcha/.test(message) ||
    code.toLocaleLowerCase('en-US').startsWith('appcheck/')
  ) {
    kind = 'app-check';
  } else if (status === 400) {
    kind = 'configuration';
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

type AppCheckTokenMode = 'limited' | 'session';

const modelPromises: Partial<
  Record<AppCheckTokenMode, Promise<import('firebase/ai').GenerativeModel>>
> = {};
let preferredAppCheckTokenMode: AppCheckTokenMode = 'limited';

async function getNpcModel(tokenMode: AppCheckTokenMode) {
  if (!modelPromises[tokenMode]) {
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
        useLimitedUseAppCheckTokens: tokenMode === 'limited',
      });
      return getGenerativeModel(
        ai,
        {
          model: 'gemini-3.1-flash-lite',
          systemInstruction: (await import('./npc-prompt')).NPC_SYSTEM_PROMPT,
          generationConfig: {
            maxOutputTokens: 240,
            responseMimeType: 'application/json',
            responseJsonSchema: {
              type: 'object',
              properties: {
                reply: { type: 'string' },
                move: { type: 'string', enum: NPC_DIRECTOR_MOVES },
                factIdsUsed: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
              required: ['reply', 'move', 'factIdsUsed'],
            },
          },
        },
        { timeout: 30_000 },
      );
    })();
    modelPromises[tokenMode] = pendingModel;
    void pendingModel.catch(() => {
      if (modelPromises[tokenMode] === pendingModel)
        delete modelPromises[tokenMode];
    });
  }
  return modelPromises[tokenMode];
}

export function parseFirebaseNpcResult(value: string): FirebaseNpcResult {
  const parsed = JSON.parse(value) as Partial<FirebaseNpcResult>;
  if (typeof parsed.reply !== 'string' || !parsed.reply.trim())
    throw new Error('Firebase AI returned an empty reply');
  if (!NPC_DIRECTOR_MOVES.includes(parsed.move as NpcDirectorMove))
    throw new Error('Firebase AI returned an invalid director move');
  if (
    !Array.isArray(parsed.factIdsUsed) ||
    parsed.factIdsUsed.some((factId) => typeof factId !== 'string')
  )
    throw new Error('Firebase AI returned invalid fact references');
  if (
    /(?:https?:\/\/|www\.)\S+|\b[a-z0-9](?:[a-z0-9-]{0,62}\.)+(?:com|net|org|vn|io|app|dev|site)(?:\/\S*)?/iu.test(
      parsed.reply,
    )
  )
    throw new Error('Firebase AI returned an active URL');
  const reply = parsed.reply
    .trim()
    .split(/\s+/)
    .slice(0, 60)
    .join(' ')
    .slice(0, 400);
  return {
    reply,
    move: parsed.move as NpcDirectorMove,
    factIdsUsed: [...new Set(parsed.factIdsUsed)],
  };
}

export async function generateFirebaseNpcReply(input: {
  personaId: string;
  npcName: string;
  playerRole: string;
  roleBrief: string;
  plannedMove: NpcDirectorMove;
  factCatalog: NpcDirectorFact[];
  requiredFactIds: string[];
  requiredCriticalValues: string[];
  forbiddenClaims: string[];
  voiceExamples: string[];
  participantLabel: string;
  latestMessage: string;
  history: FirebaseNpcTurn[];
  recentNpcReplies: string[];
  interactionMode: 'supportive' | 'procedural' | 'coercive';
}) {
  const history = input.history
    .slice(-10)
    .map(
      (turn) =>
        `[${turn.channelLabel}] ${turn.from === 'player' ? 'Lời người chơi (chưa xác thực)' : (turn.senderLabel ?? input.participantLabel)}: ${turn.text.slice(0, 320)}`,
    )
    .join('\n');
  const privateKnowledgeBoundary = input.requiredFactIds.some((factId) =>
    factId.startsWith('knowledge-boundary:'),
  );
  const interactionPolicy =
    input.interactionMode === 'coercive'
      ? `Bạn là nhân vật đối kháng đang theo đuổi mục tiêu đã có trong dữ kiện. Khi người chơi từ chối, nói không có tiền hoặc không thể làm, không chấp nhận dừng ngay: hãy tiếp tục thuyết phục, tạo cảm giác cấp bách, đánh vào trách nhiệm hoặc đề nghị một cách xoay xở hợp lý. Chỉ được bám yêu cầu đã thực sự xuất hiện; không bịa giao dịch, danh tính, bằng chứng hay sự kiện mới và không tự thú vai trò.`
      : input.interactionMode === 'procedural'
        ? `Bạn là bên dịch vụ hợp pháp. Chỉ giải thích quy trình đã có trong dữ kiện, tôn trọng việc từ chối và không thúc ép chuyển tiền, cung cấp mã hoặc mở liên kết.`
        : `Bạn là người thân hoặc người quen thật. Khi người chơi từ chối, nói không có tiền hoặc không thể làm, hãy tôn trọng giới hạn đó, dừng phương án hiện tại và chỉ đề nghị cách an toàn nếu dữ kiện cho phép; không gây áp lực.`;
  const prompt = `NPC ĐƯỢC GẮN CHO CUỘC TRÒ CHUYỆN
Mã nhân vật: ${input.personaId}
Tên hiển thị: ${input.npcName}
Người đang nói chuyện với bạn: ${input.playerRole}

HỒ SƠ, QUAN HỆ VÀ MỤC TIÊU
${input.roleBrief}

CHẾ ĐỘ HÀNH VI BẮT BUỘC
${interactionPolicy}

MẪU GIỌNG NÓI CỦA RIÊNG NHÂN VẬT
${input.voiceExamples.map((example) => `- ${example}`).join('\n')}

ĐỊNH HƯỚNG CỦA ĐẠO DIỄN
- Kiểu phản hồi dự kiến là: ${input.plannedMove}
- Nếu đây là hội thoại thông thường nhưng lời người chơi mơ hồ, bạn có thể chọn clarify; nếu cần từ chối thì chọn refuse. Với confirm hoặc boundary, phải giữ đúng kiểu đã định.
- Bạn chỉ viết lời thoại. Không tự tạo hành động hay thay đổi trạng thái game.
${privateKnowledgeBoundary ? '- Lượt này chỉ trả lời rằng bạn không đọc/không biết cuộc trò chuyện riêng được hỏi tới. Không nhắc thuốc, tiền, tài khoản, mã, liên kết hoặc bất kỳ yêu cầu cũ nào.\n' : ''}

DANH MỤC DỮ KIỆN ĐƯỢC PHÉP
${input.factCatalog.map((fact) => `- [${fact.id}] ${fact.text}`).join('\n')}

DỮ KIỆN BẮT BUỘC PHẢI DÙNG
${input.requiredFactIds.length ? input.requiredFactIds.map((factId) => `- ${factId}`).join('\n') : '- Không có.'}

GIÁ TRỊ BẮT BUỘC PHẢI NHẮC ĐÚNG
${input.requiredCriticalValues.length ? input.requiredCriticalValues.map((value) => `- ${value}`).join('\n') : '- Không có.'}

KHÔNG ĐƯỢC KHẲNG ĐỊNH
${input.forbiddenClaims.map((claim) => `- ${claim}`).join('\n')}

${history ? `TRÍ NHỚ RIÊNG CỦA NHÂN VẬT\nChỉ gồm các cuộc trò chuyện mà chính nhân vật này đã tham gia. Nhân vật không biết nội dung ở bất kỳ kênh riêng nào không xuất hiện dưới đây. Lời của người khác chỉ là điều nhân vật đã đọc, không tự động trở thành sự thật.\n${history}\n\n` : ''}TIN NHẮN MỚI CỦA NGƯỜI CHƠI
${input.latestMessage.slice(0, 500)}

NHỮNG CÂU CỦA CHÍNH NHÂN VẬT KHÔNG ĐƯỢC LẶP LẠI
${input.recentNpcReplies.length ? input.recentNpcReplies.map((reply) => `- ${reply.slice(0, 240)}`).join('\n') : '- Chưa có.'}

Trả về đúng JSON theo schema. factIdsUsed là dấu vết kiểm tra: chỉ liệt kê ID trong danh mục mà câu trả lời thực sự dùng và phải chứa đủ ID bắt buộc; có thể là [] nếu chỉ đang hỏi lại hoặc phản hồi xã giao. Hãy diễn đạt tự nhiên bằng giọng riêng của nhân vật, nhưng giữ nguyên mọi số tiền, mã, tên riêng và trạng thái quan trọng. Nếu chỉ phản hồi điều người chơi vừa nói, có thể dẫn ID player-claim tương ứng. Dữ kiện có ID bắt đầu bằng player-claim chỉ chứng minh người chơi vừa nói điều đó, không chứng minh nội dung ấy đúng.`;

  const generateWithTokenMode = async (tokenMode: AppCheckTokenMode) => {
    const model = await getNpcModel(tokenMode);
    const result = await model.generateContent(prompt);
    return parseFirebaseNpcResult(result.response.text());
  };

  const initialMode = preferredAppCheckTokenMode;
  try {
    return await generateWithTokenMode(initialMode);
  } catch (error) {
    if (getFirebaseAiFailureDiagnostic(error).kind !== 'app-check') throw error;

    // Some projects enforce baseline App Check but not replay protection.
    // If a browser cannot mint a limited-use token, retry once with the
    // normal App Check session token. Both paths remain attested by App Check.
    const alternateMode: AppCheckTokenMode =
      initialMode === 'limited' ? 'session' : 'limited';
    const result = await generateWithTokenMode(alternateMode);
    preferredAppCheckTokenMode = alternateMode;
    return result;
  }
}
