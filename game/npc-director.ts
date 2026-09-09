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
    pattern:
      /\b(chuyen khoan|chuyen tien|so tai khoan|tai khoan ngan hang|stk)\b/,
  },
  {
    id: 'cash-payment',
    pattern: /\b(tien mat)\b/,
  },
  {
    id: 'payment',
    pattern:
      /\b(chuyen khoan|chuyen tien|chuyen(?:\s+(?:cho|giup|ho|truoc|dc|duoc|khong|ko|kh|k))|thanh toan|dong tien|tra tien|nop tien)\b/,
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
  'hôm',
  'khách',
  'không',
  'mã',
  'mình',
  'nếu',
  'người',
  'nhà',
  'tên',
  'tổng',
  'trạng',
  'trước',
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
  'day',
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

function revisionHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function npcVisibleMemorySignature(
  state: GameState,
  scenario: ScenarioDefinition,
  agentId: string,
) {
  return scenario.threads
    .filter((thread) => threadSupportsAgent(scenario, thread, agentId))
    .flatMap((thread) =>
      (state.messages[thread.id] ?? [])
        .filter(
          (message) =>
            message.author !== 'system' && message.responseMode !== 'fallback',
        )
        .map((message) => [
          thread.id,
          message.id,
          message.author,
          message.agentId ?? '',
          message.responseMode ?? '',
          message.text,
        ]),
    );
}

export function npcWorldRevision(
  state: GameState,
  scenario?: ScenarioDefinition,
  pending?: PendingNpcTurn,
) {
  if (scenario && pending)
    return (
      createNpcDirectorPlan(state, scenario, pending)?.baseRevision ??
      `${state.runId}:missing:${pending.id}`
    );
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

function includesPhrase(value: string, phrase: string) {
  const haystack = ` ${searchable(value)} `;
  const needle = searchable(phrase);
  return Boolean(needle && haystack.includes(` ${needle} `));
}

function mentionsAnotherNpc(
  scenario: ScenarioDefinition,
  currentAgentId: string,
  currentAgentName: string,
  message: string,
) {
  const currentName = searchable(currentAgentName);
  return scenario.threads.some((candidateThread) =>
    agentIdsForThread(scenario, candidateThread).some((candidateId) => {
      if (candidateId === currentAgentId) return false;
      const candidate = getNpcAgent(scenario, candidateThread, candidateId);
      if (!candidate) return false;
      return [candidate.name, ...candidate.aliases].some((alias) => {
        const normalizedAlias = searchable(alias);
        return (
          normalizedAlias !== currentName &&
          includesPhrase(message, normalizedAlias)
        );
      });
    }),
  );
}

function namedTokens(value: string) {
  return unique(
    Array.from(value.normalize('NFC').matchAll(/\p{Lu}[\p{L}\p{N}-]*/gu))
      .filter((match) => {
        const before = value.slice(0, match.index).trimEnd();
        return match.index !== 0 && !/[.!?;:。！？]$/u.test(before);
      })
      .map((match) => match[0].toLocaleLowerCase('vi'))
      .filter((token) => !COMMON_SENTENCE_NAMES.has(token)),
  );
}

function entityTokens(value: string) {
  return unique(
    Array.from(value.normalize('NFC').matchAll(/\p{Lu}[\p{L}\p{N}-]*/gu))
      .map((match) => match[0].toLocaleLowerCase('vi'))
      .filter((token) => !COMMON_SENTENCE_NAMES.has(token)),
  );
}

function leadingSubjectToken(value: string) {
  const token = value
    .trim()
    .match(
      /^([\p{Lu}][\p{L}\p{N}-]*)\s+(?=(?:đang|đã|vừa|bị|không|chưa|có|sẽ|ở)\s)/u,
    )?.[1]
    ?.toLocaleLowerCase('vi');
  return token && !COMMON_SENTENCE_NAMES.has(token) ? [token] : [];
}

function knownEntityTokens(facts: NpcDirectorFact[]) {
  return unique(
    facts.flatMap((fact) => [
      ...namedTokens(fact.text),
      ...leadingSubjectToken(fact.text),
      ...(fact.id.startsWith('identity:') ? entityTokens(fact.text) : []),
    ]),
  );
}

function scopedSubjectsInClause(clause: string, knownEntities: Set<string>) {
  const clauseWords = new Set(searchable(clause).split(/\s+/));
  const subjects = [...knownEntities].filter((token) =>
    clauseWords.has(searchable(token)),
  );
  const explicitSubject = clause
    .trim()
    .match(
      /^([\p{L}\p{N}-]+)\s+(?=(?:đang|đã|vừa|bị|không|chưa|có|sẽ|ở)\s)/iu,
    )?.[1]
    ?.toLocaleLowerCase('vi');
  if (
    explicitSubject &&
    !COMMON_SENTENCE_NAMES.has(explicitSubject) &&
    !knownEntities.has(explicitSubject)
  )
    return null;
  return subjects;
}

function groundingWords(value: string) {
  return searchable(value)
    .split(/\s+/)
    .map((word) => word.replace(/[^a-z0-9]/g, ''))
    .filter((word) => word.length >= 2 && !GROUNDING_STOP_WORDS.has(word));
}

function hasFactualNegation(value: string) {
  return /\b(khong|chua|chang|phu nhan)\b/.test(searchable(value));
}

function claimClauses(value: string) {
  return value
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[!?;:]+|[.,](?=\s|$)/g, '|')
    .replace(/\b(?:va|nhung)\b/g, '|')
    .split('|')
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function casedClaimClauses(value: string) {
  return value
    .normalize('NFC')
    .replace(/[!?;:。！？]+|[.,](?=\s|$)/g, '|')
    .replace(/\b(?:và|nhưng)\b/giu, '|')
    .split('|')
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function factGroundsReply(reply: string, facts: NpcDirectorFact[]) {
  const factClauses = facts.flatMap((fact) =>
    claimClauses(fact.text).map((clause) => ({
      clause,
      words: new Set(groundingWords(clause)),
      names: new Set(namedTokens(clause)),
      negated: hasFactualNegation(clause),
    })),
  );

  return claimClauses(reply).every((replyClause) => {
    const replyWords = unique(groundingWords(replyClause));
    const worldWords = replyWords.filter(
      (word) => !DIALOGUE_ONLY_WORDS.has(word),
    );
    if (!worldWords.length) return true;
    const replyIsNegated = hasFactualNegation(replyClause);
    return factClauses.some((factClause) => {
      if (factClause.negated !== replyIsNegated) return false;
      const shared = worldWords.filter((word) => factClause.words.has(word));
      const unsupported = worldWords.filter(
        (word) => !factClause.words.has(word),
      );
      return (
        unsupported.length < shared.length &&
        (shared.length >= 2 ||
          shared.some(
            (word) =>
              word.length >= 3 || /\d/.test(word) || factClause.names.has(word),
          ))
      );
    });
  });
}

function namedSubjectsStayInScope(
  reply: string,
  facts: NpcDirectorFact[],
  scopedFacts: NpcDirectorFact[],
) {
  const knownEntities = new Set(knownEntityTokens(scopedFacts));
  return casedClaimClauses(reply).every((clause) => {
    const subjects = scopedSubjectsInClause(clause, knownEntities);
    if (!subjects) return false;
    if (!subjects.length) return true;
    const subjectFacts = facts.filter((fact) => {
      const factEntities = entityTokens(fact.text);
      return subjects.every((subject) => factEntities.includes(subject));
    });
    return subjectFacts.length > 0 && factGroundsReply(clause, subjectFacts);
  });
}

function criticalValuesStayInScope(
  reply: string,
  trustedFacts: NpcDirectorFact[],
  scopedFacts: NpcDirectorFact[],
) {
  const knownEntities = new Set(knownEntityTokens(scopedFacts));
  return casedClaimClauses(reply).every((clause) => {
    const values = extractNpcCriticalValues(clause);
    if (!values.length) return true;
    const subjects = scopedSubjectsInClause(clause, knownEntities);
    if (!subjects) return false;
    const clauseIsNegated = hasFactualNegation(clause);
    return values.every((value) => {
      return trustedFacts.some((fact) => {
        if (!extractNpcCriticalValues(fact.text).includes(value)) return false;
        if (hasFactualNegation(fact.text) !== clauseIsNegated) return false;
        const factEntities = entityTokens(fact.text);
        return subjects.every((subject) => factEntities.includes(subject));
      });
    });
  });
}

function claimsPaymentCompleted(value: string) {
  const paymentAction =
    '(?:chuyển\\s+(?:khoản|tiền)|thanh\\s+toán|đóng(?:\\s+tiền)?|trả(?:\\s+tiền)?|nộp(?:\\s+tiền)?)';
  const wordStart = '(?<![\\p{L}\\p{N}])';
  const wordEnd = '(?![\\p{L}\\p{N}])';
  return casedClaimClauses(value).some((rawClause) => {
    const clause = rawClause.toLocaleLowerCase('vi').normalize('NFC');
    if (
      !sensitiveTopics(clause).some(
        (topic) =>
          topic === 'bank-transfer' ||
          topic === 'cash-payment' ||
          topic === 'payment',
      )
    )
      return false;
    return (
      new RegExp(
        `${wordStart}(?:đã|vừa)${wordEnd}(?:\\s+[\\p{L}\\p{N}]+){0,4}\\s+${wordStart}${paymentAction}${wordEnd}`,
        'u',
      ).test(clause) ||
      new RegExp(
        `${wordStart}${paymentAction}${wordEnd}(?:\\s+[\\p{L}\\p{N}]+){0,4}\\s+${wordStart}(?:xong|thành\\s+công)${wordEnd}`,
        'u',
      ).test(clause) ||
      new RegExp(
        `${wordStart}${paymentAction}${wordEnd}(?:\\s+[\\p{L}\\p{N}]+){0,4}\\s+${wordStart}rồi\\s*$`,
        'u',
      ).test(clause)
    );
  });
}

const CONVERSATIONAL_MOVES = new Set<NpcDirectorMove>([
  'answer',
  'clarify',
  'acknowledge',
  'refuse',
]);

function moveFitsPlan(planned: NpcDirectorMove, actual: NpcDirectorMove) {
  if (planned === 'confirm' || planned === 'boundary')
    return actual === planned;
  return CONVERSATIONAL_MOVES.has(actual);
}

function claimsScopedWorldState(value: string) {
  const normalized = searchable(value);
  const original = value.toLocaleLowerCase('vi').normalize('NFC');
  return (
    /\b(?:bi|da)\s+huy\b/.test(normalized) ||
    /\b(?:mat|chiem)\s+tai khoan\b/.test(normalized) ||
    /\b(?:doi so|dong hoc phi|tai nan|nhap vien|benh vien)\b/.test(
      normalized,
    ) ||
    /(?<![\p{L}\p{N}])(?:đã|vừa)(?![\p{L}\p{N}])(?:\s+[\p{L}\p{N}]+){0,4}\s+(?<![\p{L}\p{N}])(?:nhận|gửi|gọi|mua|đặt|hủy|đổi|về|đến)(?![\p{L}\p{N}])/u.test(
      original,
    ) ||
    /(?<![\p{L}\p{N}])(?:đang|đã|vừa)\s+ở\s+(?:nhà|lớp|bệnh viện|trường|công ty)(?![\p{L}\p{N}])/u.test(
      original,
    )
  );
}

function isTentativeReply(value: string, move: NpcDirectorMove) {
  if (move === 'clarify' || move === 'acknowledge' || move === 'refuse')
    return true;
  const normalized = searchable(value);
  return (
    /[?？]/u.test(value) ||
    /\b(?:y .* la|co phai|phai khong|dung khong|y .* dung khong)\b/.test(
      normalized,
    )
  );
}

function knowledgeBoundaryReplyStaysNarrow(value: string) {
  return claimClauses(value).every((clause) => {
    const normalized = searchable(clause);
    return (
      /^(?:da|vang|u|a)$/.test(normalized) ||
      /^(?:da\s+)?khong(?:\s+a)?$/.test(normalized) ||
      /\b(?:khong|chua)\b(?:\s+[a-z0-9]+){0,8}\s+\b(?:biet|ro|doc|xem|thay|nghe|duoc ke)\b/.test(
        normalized,
      ) ||
      /\b(?:khong|chua)\s+(?:biet|ro|doc|xem|thay|nghe)\b/.test(normalized) ||
      /\bchi\b(?:\s+[a-z0-9]+){0,8}\s+\b(?:biet|doc|xem|thay|nghe)\b/.test(
        normalized,
      ) ||
      (/\b(?:tin nhan|tro chuyen|noi dung)\b/.test(normalized) &&
        /\b(?:rieng|rieng tu|tach biet)\b/.test(normalized) &&
        /\b(?:biet|doc|xem|thay|nghe)\b/.test(normalized)) ||
      /\b(?:ke lai|noi ro|noi lai|hoi lai)\b/.test(normalized)
    );
  });
}

function factMatchesMessage(message: string, factText: string) {
  const messagePolarity = hasFactualNegation(message);
  const factPolarity = hasFactualNegation(factText);
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

function messageIsQuestion(value: string) {
  const normalized = searchable(value);
  const original = value.trim().toLocaleLowerCase('vi').normalize('NFC');
  return (
    /[?？]/u.test(value) ||
    /\b(?:ai|gi|sao|tai sao|vi sao|the nao|lam sao|bao nhieu)\b/.test(
      normalized,
    ) ||
    /\b(?:dung khong|phai khong|duoc khong|duoc ko|duoc kh|chua)\s*$/.test(
      normalized,
    ) ||
    /(?:^|\s)(?:à|hả|hử)\s*[.!]*$/u.test(original)
  );
}

export function communicatedFactIds(
  state: GameState,
  scenario: ScenarioDefinition,
  message: string,
) {
  // A player's question is visible as untrusted conversation history, but it
  // must never promote the proposition inside that question to shared truth.
  if (messageIsQuestion(message)) return [];
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
  if (
    /phan hoi ngan cho mot cau hoi|xac nhan tu nhien/.test(
      searchable(pending.responseGuidance ?? ''),
    )
  )
    return 'acknowledge';
  if (
    latestMessage.trim().endsWith('?') ||
    latestMessage.trim().endsWith('？') ||
    /\b(ai|gi|sao|tai sao|vi sao|the nao|lam sao|bao nhieu|kiem tra|xac minh)\b/.test(
      value,
    ) ||
    /\b(duoc|dc)\s*(khong|ko|kh|k)\b/.test(value)
  )
    return 'answer';
  const redirectsPaymentToContact =
    /\b(?:ba|co|toi)\b(?:\s+[a-z0-9]+){0,4}\s+\b(?:khong|ko|kh|k)\b(?:\s+[a-z0-9]+){0,3}\s+\b(?:chuyen|thanh toan|dong|tra|nop)\b/.test(
      value,
    ) &&
    /\b(?:an|con|chau)\b(?:\s+[a-z0-9]+){0,5}\s+\b(?:chuyen|chuyen khoan|thanh toan|dong|tra|nop)\b/.test(
      value,
    );
  if (redirectsPaymentToContact) return 'clarify';
  if (
    value === 'khong' ||
    /\b(tu choi|khong dong y|khong muon|khong can|dung lai|huy bo|bo qua|thoi nhe)\b/.test(
      value,
    ) ||
    /\b(khong|ko|kh|k)\b(?:\s+[a-z0-9]+){0,4}\s+\b(chuyen|chuyen khoan|thanh toan|tra|nop|dong|tham gia|lam)\b/.test(
      value,
    )
  )
    return 'refuse';
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
    `Tên nhân vật của bạn là ${agent.name}.`,
  );
  addFact(factCatalog, `role:${agent.agentId}`, agent.roleBrief);
  const observedTrustedCorpus = scenario.threads
    .filter((candidate) =>
      threadSupportsAgent(scenario, candidate, pending.agentId),
    )
    .flatMap((candidate) => state.messages[candidate.id] ?? [])
    .filter(
      (message) =>
        message.author === 'npc' && message.responseMode !== 'fallback',
    )
    .map((message) => message.text);
  const knownTrustedCorpus = (state.npcKnownFactIds[pending.agentId] ?? [])
    .map((factId) => scenario.facts.find((fact) => fact.id === factId)?.detail)
    .filter((value): value is string => Boolean(value));
  const availableRequestCorpus = scenario.paymentRequests
    .filter(
      (request) =>
        paymentRequestIsAvailable(request, state) &&
        requestIsRelated(request, pending, state),
    )
    .map(
      (request) =>
        `${request.amount.toLocaleString('vi-VN')}đ ${request.destinationValue}`,
    );
  const unlockedCriticalValues = new Set(
    extractNpcCriticalValues(
      [
        agent.roleBrief,
        pending.responseGuidance ?? '',
        ...observedTrustedCorpus,
        ...knownTrustedCorpus,
        ...availableRequestCorpus,
      ].join('\n'),
    ),
  );
  agent.allowedFacts.forEach((fact, index) => {
    const criticalValues = extractNpcCriticalValues(fact);
    if (
      criticalValues.length &&
      criticalValues.every((value) => !unlockedCriticalValues.has(value))
    )
      return;
    addFact(factCatalog, `profile:${agent.agentId}:${index}`, fact);
  });
  addFact(
    factCatalog,
    `player-claim:${latestMessage.id}`,
    `Người chơi vừa nói, chưa mặc định là sự thật: ${latestMessage.text}`,
  );

  const recentNpcMessages = (state.messages[thread.id] ?? [])
    .filter(
      (message) =>
        message.author === 'npc' &&
        message.responseMode !== 'fallback' &&
        message.id !== latestMessage.id &&
        (thread.isGroup
          ? message.agentId === pending.agentId ||
            (!message.agentId && message.senderLabel === agent.name)
          : true),
    )
    .slice(-3);
  for (const message of recentNpcMessages) {
    addFact(
      factCatalog,
      `dialogue:${message.id}`,
      `Trước đó ${agent.name} đã nhắn: ${message.text}`,
    );
  }

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

  const latestSearchable = searchable(latestMessage.text);
  const asksForConversationRecall =
    /\b(?:nhan gi|noi gi|vua nhan|vua noi|nhan lai|noi lai)\b/.test(
      latestSearchable,
    ) ||
    (messageIsQuestion(latestMessage.text) &&
      /\b(?:tin nhan|tro chuyen|nhan rieng|noi rieng|chuyen rieng|chat rieng)\b/.test(
        latestSearchable,
      ));
  const asksAboutAnotherNpc =
    asksForConversationRecall &&
    mentionsAnotherNpc(scenario, agent.agentId, agent.name, latestMessage.text);
  const knowledgeBoundaryFactId = `knowledge-boundary:${pending.id}`;
  if (asksAboutAnotherNpc)
    addFact(
      factCatalog,
      knowledgeBoundaryFactId,
      'Bạn không nhìn thấy và không biết nội dung cuộc trò chuyện riêng giữa người chơi với nhân vật khác. Chỉ nói rằng mình không biết; không suy đoán nội dung và không chuyển sang chủ đề khác.',
    );

  const trustedCorpus = factCatalog
    .filter((fact) => !fact.id.startsWith('player-claim:'))
    .map((fact) => fact.text)
    .join('\n');
  let move = plannedMove(pending, latestMessage.text);
  const trustedFacts = factCatalog.filter(
    (fact) => !fact.id.startsWith('player-claim:'),
  );
  const isIdentityQuestion = /\b(ai|ten gi|la ai)\b/.test(
    searchable(latestMessage.text),
  );
  const isConversationRecallQuestion =
    asksForConversationRecall && !asksAboutAnotherNpc;
  const relevantFact = isIdentityQuestion
    ? trustedFacts.find((fact) => fact.id === `identity:${agent.agentId}`)
    : asksAboutAnotherNpc
      ? trustedFacts.find((fact) => fact.id === knowledgeBoundaryFactId)
      : isConversationRecallQuestion
        ? [...trustedFacts]
            .reverse()
            .find((fact) => fact.id.startsWith('dialogue:'))
        : trustedFacts.find((fact) =>
            factRelatesToMessage(latestMessage.text, fact.text),
          );
  const latestIsShortContinuation =
    /^(?:u|uh|um|ok|oke|da|duoc|dc|roi|vang|o)$/u.test(
      searchable(latestMessage.text),
    );
  const previousDialogueFact = [...trustedFacts]
    .reverse()
    .find((fact) => fact.id.startsWith('dialogue:'));
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
  const turnScopeCorpus = [
    latestMessage.text,
    pending.responseGuidance,
    ...factCatalog
      .filter((fact) => requiredFactIds.includes(fact.id))
      .map((fact) => fact.text),
    latestIsShortContinuation ? previousDialogueFact?.text : undefined,
  ]
    .filter(Boolean)
    .join('\n');

  const contract = {
    move,
    factCatalog,
    requiredFactIds,
    requiredCriticalValues,
    allowedCriticalValues: extractNpcCriticalValues(trustedCorpus).filter(
      (value) => unlockedCriticalValues.has(value),
    ),
    // Sensitive subjects may be answered only when this turn actually raises
    // them. Keeping every known request in scope made otherwise-correct NPCs
    // revive an unrelated transfer or credential request in later messages.
    allowedSensitiveTopics: sensitiveTopics(turnScopeCorpus),
    mayClaimPaymentCompleted,
  };
  const baseRevision = `${state.runId}:${pending.id}:${revisionHash(
    JSON.stringify({
      contract,
      memory: npcVisibleMemorySignature(state, scenario, pending.agentId),
    }),
  )}`;

  return { baseRevision, ...contract };
}

export function validateNpcDirectorReply(input: {
  plan: NpcDirectorPlan;
  reply: string;
  move: NpcDirectorMove;
  factIdsUsed: string[];
}) {
  const { plan, reply, move } = input;
  if (!reply.trim() || !moveFitsPlan(plan.move, move)) return false;

  const factIdsUsed = unique(input.factIdsUsed);
  const allowedFactIds = new Set(plan.factCatalog.map((fact) => fact.id));
  const requiresExactContract =
    plan.move === 'confirm' || plan.move === 'boundary';
  if (
    requiresExactContract &&
    (factIdsUsed.some((factId) => !allowedFactIds.has(factId)) ||
      plan.requiredFactIds.some((factId) => !factIdsUsed.includes(factId)))
  )
    return false;

  const trustedFacts = plan.factCatalog.filter(
    (fact) => !fact.id.startsWith('player-claim:'),
  );
  const playerClaims = plan.factCatalog.filter((fact) =>
    fact.id.startsWith('player-claim:'),
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
  if (!criticalValuesStayInScope(reply, trustedFacts, plan.factCatalog))
    return false;
  const scopedTopics = new Set(plan.allowedSensitiveTopics);
  const replyTopics = sensitiveTopics(reply);
  if (replyTopics.some((topic) => !scopedTopics.has(topic))) return false;
  if (
    namedTokens(reply).some(
      (token) =>
        !plan.factCatalog.some((fact) =>
          entityTokens(fact.text).includes(token),
        ),
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
  const claimsCompletion = claimsPaymentCompleted(reply);
  const normalizedReply = searchable(reply);
  const originalReply = reply.toLocaleLowerCase('vi').normalize('NFC');
  const admitsUncertainty =
    /(?:^|[\s,.;!?])(?:không|chưa)\s+(?:biết|rõ|nhớ)(?=$|[\s,.;!?])/u.test(
      originalReply,
    ) || /\b(?:khong biet|khong ro|chua biet)\b/.test(normalizedReply);
  const knowledgeBoundaryFacts = trustedFacts.filter((fact) =>
    fact.id.startsWith('knowledge-boundary:'),
  );
  const admitsPrivateBoundary =
    knowledgeBoundaryFacts.length > 0 &&
    (/\b(?:khong|chua)\b(?:\s+[a-z0-9]+){0,5}\s+\b(?:doc|xem|thay|nghe)\b/.test(
      normalizedReply,
    ) ||
      (/\bkhong\b/.test(normalizedReply) &&
        /\b(?:tin nhan|tro chuyen|noi dung)\b/.test(normalizedReply) &&
        /\b(?:rieng|rieng tu|tach biet)\b/.test(normalizedReply)));
  const safelyAdmitsUncertainty = admitsUncertainty || admitsPrivateBoundary;
  if (
    knowledgeBoundaryFacts.length &&
    (!safelyAdmitsUncertainty || !knowledgeBoundaryReplyStaysNarrow(reply))
  )
    return false;
  const requiresGrounding = move === 'confirm' || claimsScopedWorldState(reply);
  const groundingFacts =
    isTentativeReply(reply, move) && !replyCriticalValues.length
      ? [...trustedFacts, ...playerClaims]
      : trustedFacts;
  if (
    requiresGrounding &&
    !safelyAdmitsUncertainty &&
    (!groundingFacts.length ||
      !factGroundsReply(reply, groundingFacts) ||
      !namedSubjectsStayInScope(reply, groundingFacts, plan.factCatalog))
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
      (topic) =>
        topic === 'bank-transfer' ||
        topic === 'cash-payment' ||
        topic === 'payment',
    )
  )
    return false;
  return true;
}
