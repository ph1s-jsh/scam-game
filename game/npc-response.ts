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

function normalized(text: string) {
  return text
    .toLocaleLowerCase('vi')
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// Scheduling only. Meaning, tone, acknowledgement and refusal belong to the AI,
// with conversation history and persona rules, not a short-message classifier.
export function planNpcResponse(input: {
  state: GameState;
  scenario: ScenarioDefinition;
  thread: ThreadDefinition;
  agentId: string;
  text: string;
  turnId: string;
}): NpcResponsePlan {
  const { state, thread, text, turnId, agentId } = input;
  const messages = state.messages[thread.id] ?? [];
  const normalizedText = normalized(text);
  const lastNpcIndex = messages.findLastIndex((item) => item.author === 'npc');
  const duplicate =
    !(state.failedNpcTurns ?? []).some((turn) => turn.threadId === thread.id) &&
    messages
      .slice(lastNpcIndex + 1)
      .filter((item) => item.author === 'player')
      .slice(-3)
      .some(
        (item) =>
          normalized(item.text) === normalizedText &&
          item.text.trim() === text.trim(),
      );
  const noise =
    /^(.)\1{7,}$/u.test(text.replace(/\s/g, '')) ||
    (!normalizedText && !/^[?？!！]+$/.test(text.trim()));
  if (duplicate || noise)
    return {
      disposition: 'ignore',
      deliveryStatus: 'delivered',
      delayMs: 0,
      advancesStory: false,
    };
  let hash = 0;
  for (const letter of turnId) hash = (hash * 31 + letter.charCodeAt(0)) >>> 0;
  const thinking =
    text.length > 80 ||
    /(?:https?:\/\/|kiểm tra|xác minh|chuyển khoản)/iu.test(text);
  return {
    disposition: thinking ? 'reply_later' : 'reply',
    deliveryStatus: 'delivered',
    delayMs:
      3000 +
      (hash % 2200) +
      Math.min(text.length * 18, 3200) +
      (agentId === 'family.hanh' ? 1400 : 500),
    advancesStory: thinking,
    responseKind: 'ai',
  };
}
