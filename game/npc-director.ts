import {
  agentIdsForThread,
  getNpcAgent,
  threadSupportsAgent,
} from './npc-agents';
import { paymentRequestIsAvailable } from './payment-arrangements';
import type {
  GameState,
  NpcDirectorFact,
  NpcDirectorMove,
  NpcDirectorPlan,
  PendingNpcTurn,
  ScenarioDefinition,
  ThreadDefinition,
} from './types';

const STOP_WORDS = new Set([
  'anh',
  'ba',
  'ban',
  'biet',
  'cai',
  'cho',
  'con',
  'co',
  'cua',
  'da',
  'dang',
  'de',
  'di',
  'do',
  'duoc',
  'gi',
  'giup',
  'khong',
  'la',
  'lai',
  'lam',
  'minh',
  'mot',
  'nha',
  'nhe',
  'nhung',
  'noi',
  'nay',
  'chua',
  'nguoi',
  'oi',
  'roi',
  'se',
  'thi',
  'toi',
  'trong',
  'va',
  'voi',
]);

const SENSITIVE_TOPICS = [
  {
    id: 'bank-transfer',
    pattern: /\b(chuyen khoan|so tai khoan|tai khoan ngan hang|stk)\b/,
  },
  {
    id: 'cash-payment',
    pattern: /\b(tien mat|thanh toan|dong tien|tra tien|nop tien)\b/,
  },
  {
    id: 'credentials',
    pattern: /\b(mat khau|dang nhap|tai khoan game|tai khoan mang xa hoi)\b/,
  },
  {
    id: 'otp',
    pattern: /\b(otp|ma xac nhan|ma dang nhap|ma 6 so)\b/,
  },
  {
    id: 'link',
    pattern: /\b(link|duong dan|trang web|website)\b/,
  },
  {
    id: 'identity',
    pattern: /\b(gia mao|mat tai khoan|chiem tai khoan|so moi|danh tinh)\b/,
  },
] as const;

const COMMON_SENTENCE_NAMES = new Set([
  'bà',
  'bạn',
  'cảm',
  'chị',
  'con',
  'dạ',
  'em',
  'hóa',
  'không',
  'mã',
  'mình',
  'nếu',
  'người',
  'nhà',
  'tôi',
  'vâng',
  'ừ',
  'được',
]);

const GROUNDING_STOP_WORDS = new Set([
  'anh',
  'ba',
  'ban',
  'bao',
  'chi',
  'con',
  'co',
  'cua',
  'da',
  'de',
  'di',
  'do',
  'duoc',
  'em',
  'gi',
  'giup',
  'la',
  'lai',
  'minh',
  'mot',
  'nha',
  'nhe',
  'nhung',
  'noi',
  'nguoi',
  'oi',
  'ong',
  'roi',
  'thi',
  'toi',
  'va',
  'voi',
]);

// These words can make a conversational acknowledgement, refusal or question,
// but do not assert a new fact about the game world by themselves.
const DIALOGUE_ONLY_WORDS = new Set([
  'biet',
  'cam',
  'can',
  'chao',
  'chac',
  'chua',
  'dau',
  'dong',
  'dung',
  'giai',
  'goi',
  'hieu',
  'hoi',
  'hon',
  'kiem',
  'khong',
  'loi',
  'nghe',
  'nho',
  'noi',
  'oke',
  'phan',
  'ro',
  'sao',
  'that',
  'the',
  'thoi',
  'tra',
  'tra loi',
  'tu',
  'vang',
  'vay',
  'xac',
  'xin',
  'y',
]);

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function searchable(value: string) {
  return value
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9:/._-]+/g, ' ')
    .trim();
}

function words(value: string) {
  return searchable(value)
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9]/g, ''))
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word));
}

export function npcWorldRevision(state: GameState) {
  return `${state.runId}:${state.tick}:${state.sequence}`;
}

export function extractNpcCriticalValues(value: string) {
  const found: string[] = [];
  for (const match of value.matchAll(/https?:\/\/[^\s]+/giu))
    found.push(`url:${match[0].toLocaleLowerCase('vi')}`);
  for (const match of value.matchAll(
    /\d+(?:[.,]\d+)?\s*(?:triệu đồng|triệu|nghìn|ngàn|đồng|k|tr|đ)(?=\s|$|[.,!?;:])/giu,
  ))
    found.push(`money:${searchable(match[0]).replace(/\s+/g, '')}`);
  for (const match of value.matchAll(/\d(?:[\d.\s-]{1,}\d)?/g)) {
    const digits = match[0].replace(/\D/g, '');
    if (digits.length >= 3) found.push(`number:${digits}`);
  }
  return unique(found);
}

function sensitiveTopics(value: string) {
  const normalized = searchable(value);
  return SENSITIVE_TOPICS.filter((topic) => topic.pattern.test(normalized)).map(
    (topic) => topic.id,
  );
}

function namedTokens(value: string) {
  return unique(
    Array.from(value.normalize('NFC').matchAll(/\p{Lu}[\p{L}\p{N}-]*/gu))
      .filter((match) => {
        const before = value.slice(0, match.index).trimEnd();
        return match.index !== 0 && !/[.!?。！？]$/u.test(before);
      })
      .map((match) => match[0].toLocaleLowerCase('vi'))
      .filter((token) => !COMMON_SENTENCE_NAMES.has(token)),
  );
}

function groundingWords(value: string) {
  return searchable(value)
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9]/g, ''))
    .filter((word) => word.length >= 2 && !GROUNDING_STOP_WORDS.has(word));
}

function factGroundsReply(reply: string, facts: NpcDirectorFact[]) {
  const replyWords = unique(groundingWords(reply));
  if (!replyWords.length) return true;
  const factWords = new Set(facts.flatMap((fact) => groundingWords(fact.text)));
  const worldWords = replyWords.filter(
    (word) => !DIALOGUE_ONLY_WORDS.has(word),
  );
  if (!worldWords.length) return true;
  const shared = worldWords.filter((word) => factWords.has(word));
  const unsupported = worldWords.filter((word) => !factWords.has(word));
  return (
    unsupported.length === 0 &&
    (shared.length >= 2 ||
      shared.some((word) => word.length >= 7 || /\d/.test(word)))
  );
}

function isDialogueOnlyReply(reply: string) {
  return groundingWords(reply).every((word) => DIALOGUE_ONLY_WORDS.has(word));
}

function factMatchesMessage(message: string, factText: string) {
  const messagePolarity = /\b(khong|chua|chang|phu nhan)\b/.test(
    searchable(message),
  );
  const factPolarity = /\b(khong|chua|chang|phu nhan)\b/.test(
    searchable(factText),
  );
  if (messagePolarity !== factPolarity) return false;
  const messageWords = new Set(words(message));
  const factWords = unique(words(factText));
  const shared = factWords.filter((word) => messageWords.has(word));
  return (
    shared.length >= 2 ||
    shared.some((word) => word.length >= 7 || /\d/.test(word))
  );
}

function factRelatesToMessage(message: string, factText: string) {
  const messageWords = new Set(words(message));
  const shared = unique(words(factText)).filter((word) =>
    messageWords.has(word),
  );
  return (
    shared.length >= 2 ||
    shared.some((word) => word.length >= 3 || /\d/.test(word))
  );
}

export function communicatedFactIds(
  state: GameState,
  scenario: ScenarioDefinition,
  message: string,
) {
  return scenario.facts
    .filter(
      (fact) =>
        state.discoveredFactIds.includes(fact.id) &&
        factMatchesMessage(message, `${fact.title} ${fact.detail}`),
    )
    .map((fact) => fact.id);
}

export function teachMessageFactsToObservers(
  state: GameState,
  scenario: ScenarioDefinition,
  thread: ThreadDefinition,
  message: string,
) {
  const factIds = communicatedFactIds(state, scenario, message);
  if (!factIds.length) return state;
  const npcKnownFactIds = { ...state.npcKnownFactIds };
  let changed = false;
  for (const agentId of agentIdsForThread(scenario, thread)) {
    const current = npcKnownFactIds[agentId] ?? [];
    const next = unique([...current, ...factIds]);
    if (next.length === current.length) continue;
    npcKnownFactIds[agentId] = next;
    changed = true;
  }
  return changed ? { ...state, npcKnownFactIds } : state;
}

function addFact(
  catalog: NpcDirectorFact[],
  id: string,
  text: string | undefined,
) {
  const clean = text?.trim();
  if (!clean || catalog.some((fact) => fact.id === id)) return;
  catalog.push({ id, text: clean });
}

function plannedMove(
  pending: PendingNpcTurn,
  latestMessage: string,
): NpcDirectorMove {
  if (pending.responseKind === 'local') return 'boundary';
  if (pending.settlementOnReply) return 'confirm';
  const value = searchable(latestMessage);
  if (latestMessage.trim().endsWith('?') || latestMessage.trim().endsWith('？'))
    return 'answer';
  if (
    value === 'khong' ||
    /\b(tu choi|khong dong y|khong muon|khong can|dung lai|huy bo|bo qua|thoi nhe)\b/.test(
      value,
    )
  )
    return 'refuse';
  if (
    /\b(ai|tai sao|vi sao|the nao|lam sao|bao nhieu|kiem tra|xac minh)\b/.test(
      value,
    )
  )
    return 'answer';
  if (value.split(/\s+/).filter(Boolean).length <= 2) return 'clarify';
  return 'acknowledge';
}

function requestIsRelated(
  request: ScenarioDefinition['paymentRequests'][number],
  pending: PendingNpcTurn,
  state: GameState,
) {
  if (request.sourceThreadId === pending.threadId) return true;
  if (
    request.onPaidThreadId === pending.threadId &&
    state.requestStatus[request.id] === 'paid'
  )
    return true;
  if (pending.settlementOnReply?.requestId === request.id) return true;
  if (state.requestStatus[request.id] !== 'arranged') return false;
  const optionId = state.requestArrangementOptionIds[request.id];
  return Boolean(
    request.alternatives?.some(
      (option) =>
        option.id === optionId &&
        option.threadIds.includes(pending.threadId) &&
        option.agentIds.includes(pending.agentId),
    ),
  );
}

export function createNpcDirectorPlan(
  state: GameState,
  scenario: ScenarioDefinition,
  pending: PendingNpcTurn,
): NpcDirectorPlan | null {
  const thread = scenario.threads.find((item) => item.id === pending.threadId);
  const agent = thread ? getNpcAgent(scenario, thread, pending.agentId) : null;
  const latestMessage = (state.messages[pending.threadId] ?? []).find(
    (message) => message.id === pending.playerMessageId,
  );
  if (!thread || !agent || !latestMessage) return null;

  const factCatalog: NpcDirectorFact[] = [];
  addFact(
    factCatalog,
    `identity:${agent.agentId}`,
    `Bạn là ${agent.name}. ${agent.roleBrief}`,
  );
  agent.allowedFacts.forEach((fact, index) =>
    addFact(factCatalog, `profile:${agent.agentId}:${index}`, fact),
  );
  addFact(
    factCatalog,
    `player-claim:${latestMessage.id}`,
    `Người chơi vừa nói, chưa mặc định là sự thật: ${latestMessage.text}`,
  );

  for (const event of scenario.scheduledEvents) {
    const eventThread = event.threadId
      ? scenario.threads.find((item) => item.id === event.threadId)
      : null;
    const deliveredMessage = eventThread
      ? (state.messages[eventThread.id] ?? []).find(
          (message) => message.id === `${event.id}-message`,
        )
      : null;
    if (
      !eventThread ||
      !event.message ||
      !deliveredMessage ||
      !state.triggeredEventIds.includes(event.id) ||
      !threadSupportsAgent(scenario, eventThread, pending.agentId)
    )
      continue;
    addFact(factCatalog, `event:${event.id}`, deliveredMessage.text);
  }

  for (const factId of state.npcKnownFactIds[pending.agentId] ?? []) {
    const fact = scenario.facts.find((item) => item.id === factId);
    if (fact) addFact(factCatalog, `known:${fact.id}`, fact.detail);
  }

  for (const request of scenario.paymentRequests.filter(
    (item) =>
      paymentRequestIsAvailable(item, state) &&
      requestIsRelated(item, pending, state),
  )) {
    const status = state.requestStatus[request.id] ?? 'pending';
    const optionId = state.requestArrangementOptionIds[request.id];
    const option = request.alternatives?.find((item) => item.id === optionId);
    const statusText =
      status === 'paid'
        ? 'đã thanh toán trong ứng dụng'
        : status === 'arranged' && option
          ? option.label
          : status === 'declined'
            ? 'người chơi đã từ chối'
            : 'vẫn đang chờ quyết định';
    addFact(
      factCatalog,
      `request:${request.id}`,
      `Hóa đơn hoặc yêu cầu thanh toán ${request.title}; người nhận ${request.recipient}; ${request.destinationLabel} ${request.destinationValue}; ${request.institutionLabel}; số tiền ${request.amount.toLocaleString('vi-VN')}đ; nội dung ${request.note}; trạng thái ${statusText}.`,
    );
  }

  if (pending.responseGuidance)
    addFact(factCatalog, `instruction:${pending.id}`, pending.responseGuidance);

  const trustedCorpus = factCatalog
    .filter((fact) => !fact.id.startsWith('player-claim:'))
    .map((fact) => fact.text)
    .join('\n');
  const contractCorpus = `${trustedCorpus}\n${pending.responseGuidance ?? ''}`;
  let move = plannedMove(pending, latestMessage.text);
  const trustedFacts = factCatalog.filter(
    (fact) => !fact.id.startsWith('player-claim:'),
  );
  const isIdentityQuestion = /\b(ai|ten gi|la ai)\b/.test(
    searchable(latestMessage.text),
  );
  const relevantFact = isIdentityQuestion
    ? trustedFacts.find((fact) => fact.id === `identity:${agent.agentId}`)
    : trustedFacts.find((fact) =>
        factRelatesToMessage(latestMessage.text, fact.text),
      );
  if (move === 'answer' && !relevantFact) move = 'clarify';
  const requiredFactIds = pending.settlementOnReply
    ? [`instruction:${pending.id}`]
    : move === 'answer' && relevantFact
      ? [relevantFact.id]
      : [];
  const requiredCriticalValues = pending.settlementOnReply
    ? extractNpcCriticalValues(pending.responseGuidance ?? '').filter((value) =>
        value.startsWith('money:'),
      )
    : [];
  const mayClaimPaymentCompleted = scenario.paymentRequests
    .filter(
      (request) =>
        paymentRequestIsAvailable(request, state) &&
        requestIsRelated(request, pending, state),
    )
    .some((request) => state.requestStatus[request.id] === 'paid');

  return {
    baseRevision: npcWorldRevision(state),
    move,
    factCatalog,
    requiredFactIds,
    requiredCriticalValues,
    allowedCriticalValues: extractNpcCriticalValues(trustedCorpus),
    allowedSensitiveTopics: sensitiveTopics(contractCorpus),
    mayClaimPaymentCompleted,
  };
}

export function validateNpcDirectorReply(input: {
  plan: NpcDirectorPlan;
  reply: string;
  move: NpcDirectorMove;
  factIdsUsed: string[];
}) {
  const { plan, reply, move } = input;
  const factIdsUsed = unique(input.factIdsUsed);
  const allowedFactIds = new Set(plan.factCatalog.map((fact) => fact.id));
  if (move !== plan.move) return false;
  if (factIdsUsed.some((factId) => !allowedFactIds.has(factId))) return false;
  if (move !== 'clarify' && factIdsUsed.length === 0) return false;
  if (plan.requiredFactIds.some((factId) => !factIdsUsed.includes(factId)))
    return false;

  const usedFacts = plan.factCatalog.filter((fact) =>
    factIdsUsed.includes(fact.id),
  );
  const trustedUsedFacts = usedFacts.filter(
    (fact) => !fact.id.startsWith('player-claim:'),
  );
  const replyCriticalValues = extractNpcCriticalValues(reply);
  if (
    plan.requiredCriticalValues.some(
      (value) => !replyCriticalValues.includes(value),
    )
  )
    return false;
  const allowedValues = new Set(plan.allowedCriticalValues);
  if (replyCriticalValues.some((value) => !allowedValues.has(value)))
    return false;
  if (
    replyCriticalValues.some(
      (value) =>
        !trustedUsedFacts.some((fact) =>
          extractNpcCriticalValues(fact.text).includes(value),
        ),
    )
  )
    return false;
  const allowedTopics = new Set(plan.allowedSensitiveTopics);
  const replyTopics = sensitiveTopics(reply);
  if (replyTopics.some((topic) => !allowedTopics.has(topic))) return false;
  if (
    replyTopics.some(
      (topic) =>
        !trustedUsedFacts.some((fact) =>
          sensitiveTopics(fact.text).includes(topic),
        ),
    )
  )
    return false;
  if (
    namedTokens(reply).some(
      (token) =>
        !usedFacts.some((fact) => namedTokens(fact.text).includes(token)),
    )
  )
    return false;
  const replyWords = Array.from(
    reply
      .toLocaleLowerCase('vi')
      .normalize('NFC')
      .matchAll(/\p{L}+/gu),
    (match) => match[0],
  );
  const claimsCompletion =
    replyWords.includes('đã') ||
    replyWords.includes('vừa') ||
    (replyWords.includes('xong') && !replyWords.includes('chưa'));
  const normalizedReply = searchable(reply);
  const admitsUncertainty =
    /\b(khong biet|khong ro|khong nho|chua biet)\b/.test(normalizedReply);
  const makesAssertion = !isDialogueOnlyReply(reply);
  if (
    !admitsUncertainty &&
    (move === 'answer' || move === 'confirm' || makesAssertion) &&
    (!trustedUsedFacts.length || !factGroundsReply(reply, trustedUsedFacts))
  )
    return false;
  if (
    move === 'confirm' &&
    (/\b(khong|chua|chang|tu choi|khong the|khong duoc)\b/.test(
      normalizedReply,
    ) ||
      !(
        replyWords.includes('ừ') ||
        replyWords.includes('vâng') ||
        /\b(dong y|duoc|se|xac nhan|ok|oke)\b/.test(normalizedReply)
      ))
  )
    return false;
  if (
    !plan.mayClaimPaymentCompleted &&
    claimsCompletion &&
    replyTopics.some(
      (topic) => topic === 'bank-transfer' || topic === 'cash-payment',
    )
  )
    return false;
  return Boolean(reply.trim());
}
