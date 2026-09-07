import type {
  GameState,
  MessageDeliveryStatus,
  ScenarioDefinition,
  ThreadDefinition,
} from './types';

export type NpcResponsePlan = {
  disposition: 'reply' | 'reply_later' | 'seen' | 'ignore';
  deliveryStatus: MessageDeliveryStatus;
  delayMs: number;
  advancesStory: boolean;
  responseKind?: 'ai' | 'local';
  localReply?: string;
  responseGuidance?: string;
};

function normalized(value: string) {
  return value
    .toLocaleLowerCase('vi')
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function stableNumber(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function delayBetween(key: string, minimum: number, maximum: number) {
  return minimum + (stableNumber(key) % (maximum - minimum + 1));
}

const quickAcknowledgement =
  /^(ok|okay|oke|oki|ừ|uh|ờ|à|dạ|vâng|rồi|biết rồi|hiểu rồi|cảm ơn|thanks|thank you|haha|hihi|kk+|:?[)d]+)$/iu;
const meaningfulDecision =
  /(được|đồng ý|tham gia|làm thử|nhận việc|chốt|làm luôn|không tham gia|từ chối|đừng|dừng lại|không chuyển|sẽ chuyển|gọi lại)/iu;
const verificationOrThought =
  /(kiểm tra|xác minh|gọi lại|hỏi lại|hóa đơn|hoá đơn|tài khoản|số điện thoại|tổng đài|hợp đồng|mã số thuế|địa chỉ)/iu;
const toxicLanguage =
  /(?:^|\s)(ngu|cút|địt|đụ|fuck|stupid|idiot)(?:\s|$)|(đồ ngu|óc chó|biến đi|khốn nạn|điên à|im mồm|mẹ mày)/iu;

function looksLikeNoise(value: string) {
  const compact = value.replace(/\s/g, '');
  if (!compact) return true;
  if (/^(.)\1{5,}$/u.test(compact)) return true;
  if (/^[^\p{L}\p{N}]{2,}$/u.test(compact)) return true;

  const words = normalized(value).split(/\s+/).filter(Boolean);
  if (words.length !== 1 || compact.length < 7) return false;
  const vowels = compact.match(
    /[aăâeêioôơuưyáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/giu,
  );
  return (vowels?.length ?? 0) === 0;
}

function boundaryReply(agentId: string) {
  if (agentId === 'family.hanh')
    return 'Bà không thích con nói vậy đâu. Bình tĩnh rồi mình nói chuyện tiếp nhé.';
  if (agentId === 'family.an')
    return 'Mình nói chuyện bình tĩnh thôi nha. Nếu cần gì thì nói rõ cho mình biết.';
  if (agentId === 'family.bao')
    return 'Nói chuyện đàng hoàng nha, không thì mình để lúc khác nói.';
  if (agentId.startsWith('service.'))
    return 'Kênh này chỉ hỗ trợ khi nội dung trao đổi phù hợp. Bạn vui lòng viết lại yêu cầu.';
  return 'Mình không tiếp tục nếu bạn nói chuyện như vậy. Khi bình tĩnh thì nhắn lại nhé.';
}

function timingAdjustment(agentId: string, thread: ThreadDefinition) {
  if (agentId === 'family.hanh') return 1_400;
  if (agentId === 'family.an') return 900;
  if (thread.isGroup) return 700;
  if (agentId.startsWith('service.')) return 1_000;
  return 0;
}

export function planNpcResponse(input: {
  state: GameState;
  scenario: ScenarioDefinition;
  thread: ThreadDefinition;
  agentId: string;
  text: string;
  turnId: string;
}): NpcResponsePlan {
  const { state, thread, agentId, text, turnId } = input;
  const value = normalized(text);
  const previousPlayerMessages = (state.messages[thread.id] ?? []).filter(
    (message) => message.author === 'player',
  );
  const lastNpcMessage = [...(state.messages[thread.id] ?? [])]
    .reverse()
    .find((message) => message.author === 'npc');
  const duplicate = previousPlayerMessages
    .slice(-3)
    .some((message) => normalized(message.text) === value);

  if (duplicate) {
    return {
      disposition: 'ignore',
      deliveryStatus: 'delivered',
      delayMs: 0,
      advancesStory: false,
    };
  }

  if (looksLikeNoise(text)) {
    return {
      disposition: previousPlayerMessages.some((message) =>
        looksLikeNoise(message.text),
      )
        ? 'ignore'
        : 'seen',
      deliveryStatus: previousPlayerMessages.some((message) =>
        looksLikeNoise(message.text),
      )
        ? 'delivered'
        : 'seen',
      delayMs: 0,
      advancesStory: false,
    };
  }

  if (quickAcknowledgement.test(value) && !/[?？]/u.test(text)) {
    const acknowledgesQuestion = Boolean(
      lastNpcMessage &&
      (/[?？]/u.test(lastNpcMessage.text) ||
        /(giúp|xác nhận|đồng ý|tham gia|muốn thử|được không|nhé\s*$)/iu.test(
          lastNpcMessage.text,
        )),
    );
    if (acknowledgesQuestion) {
      return {
        disposition: 'reply_later',
        deliveryStatus: 'delivered',
        delayMs:
          delayBetween(`${turnId}:acknowledged-request`, 3_800, 6_200) +
          timingAdjustment(agentId, thread),
        advancesStory: true,
        responseKind: 'ai',
        responseGuidance:
          'Người chơi vừa phản hồi ngắn cho một câu hỏi hoặc đề nghị đang chờ. Hiểu câu trả lời theo đúng ngữ cảnh ngay trước đó và xác nhận tự nhiên.',
      };
    }
    return {
      disposition: 'seen',
      deliveryStatus: 'seen',
      delayMs: 0,
      advancesStory: false,
    };
  }

  if (toxicLanguage.test(value)) {
    const previousToxic = previousPlayerMessages.some((message) =>
      toxicLanguage.test(normalized(message.text)),
    );
    if (previousToxic) {
      return {
        disposition: 'ignore',
        deliveryStatus: 'delivered',
        delayMs: 0,
        advancesStory: false,
      };
    }
    return {
      disposition: 'reply',
      deliveryStatus: 'delivered',
      delayMs: delayBetween(`${turnId}:boundary`, 2_600, 4_800),
      advancesStory: false,
      responseKind: 'local',
      localReply: boundaryReply(agentId),
    };
  }

  const adjustment = timingAdjustment(agentId, thread);
  const includesUrl = /(?:https?:\/\/|www\.)\S+/iu.test(text);
  const shouldThink =
    includesUrl ||
    meaningfulDecision.test(value) ||
    verificationOrThought.test(value);
  if (shouldThink) {
    return {
      disposition: 'reply_later',
      deliveryStatus: 'delivered',
      delayMs: delayBetween(`${turnId}:later`, 6_500, 10_500) + adjustment,
      advancesStory: true,
      responseKind: 'ai',
      responseGuidance:
        'Nhân vật đã đọc kỹ rồi mới trả lời. Phản hồi trực tiếp vào quyết định hoặc câu hỏi xác minh; không giục vô cớ.',
    };
  }

  const shortStatement = value.split(/\s+/).length <= 3 && !/[?？]/u.test(text);
  if (shortStatement && stableNumber(`${turnId}:short`) % 3 === 0) {
    return {
      disposition: 'seen',
      deliveryStatus: 'seen',
      delayMs: 0,
      advancesStory: false,
    };
  }

  return {
    disposition: 'reply',
    deliveryStatus: 'delivered',
    delayMs: delayBetween(`${turnId}:reply`, 3_000, 5_800) + adjustment,
    advancesStory: false,
    responseKind: 'ai',
    responseGuidance:
      'Trả lời đúng điều người chơi vừa nói; nếu câu quá mơ hồ thì hỏi lại một câu ngắn, không tự mở thêm tình tiết.',
  };
}
