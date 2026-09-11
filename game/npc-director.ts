import {
  agentIdsForThread,
  getNpcAgent,
  threadSupportsAgent,
} from './npc-agents';
import {
  paymentRequestIsAvailable,
  validatedPendingAlternative,
} from './payment-arrangements';
import { npcSceneContracts, sceneContractViolation } from './npc-scene';
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
      /\b(tien|chuyen khoan|chuyen tien|chuyen(?:\s+(?:cho|giup|ho|truoc|dc|duoc|khong|ko|kh|k))|thanh toan|dong tien|tra tien|nop tien)\b/,
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
  'cô',
  'bác',
  'cháu',
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
  'thanh',
  'hãy',
  'chỉ',
  'số',
  'đơn',
  'tôi',
  'vâng',
  'ừ',
  'được',
]);

// These words can make a conversational acknowledgement, refusal or question,
// but do not assert a new fact about the game world by themselves.

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
        .filter((message) => message.author !== 'system' && !message.npcIgnored)
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
  // A proper name must remain a name in this sentence. Matching accentless
  // ordinary words made "yên tâm" become Tâm and "ăn" become An.
  const clauseWords = new Set(entityTokens(clause));
  const subjects = [...knownEntities].filter((token) => clauseWords.has(token));
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
  if (
    explicitSubject &&
    knownEntities.has(explicitSubject) &&
    !subjects.includes(explicitSubject)
  )
    subjects.push(explicitSubject);
  return subjects;
}

function hasFactualNegation(value: string) {
  return /\b(khong|chua|chang|phu nhan)\b/.test(searchable(value));
}

function casedClaimClauses(value: string) {
  return value
    .normalize('NFC')
    .replace(/[!?;:。！？]+|[.,](?=\s|$)/g, '|')
    .replace(/(?<![\p{L}\p{N}])(?:và|nhưng)(?![\p{L}\p{N}])/giu, '|')
    .split('|')
    .map((clause) => clause.trim())
    .filter(Boolean);
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
        if (
          !casedClaimClauses(fact.text).some(
            (part) =>
              extractNpcCriticalValues(part).includes(value) &&
              hasFactualNegation(part) === clauseIsNegated,
          )
        )
          return false;
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
  _latestMessage: string,
): NpcDirectorMove {
  return pending.settlementOnReply ? 'confirm' : 'answer';
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
  const sceneContracts = npcSceneContracts(state, scenario, pending);
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
    .filter((message) => message.author === 'npc' && !message.responseMode)
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
  for (const contract of sceneContracts) {
    addFact(
      factCatalog,
      `capability:${contract.requestId}`,
      [contract.goal, ...contract.limits, ...contract.routes].join('\n'),
    );
    addFact(
      factCatalog,
      `status:${contract.requestId}`,
      `Trạng thái thực tế của yêu cầu ${contract.requestId}: ${contract.status}. Trạng thái này ưu tiên hơn mọi lời hứa trong lịch sử. Chỉ pending là còn chờ quyết định; cancelled đã hủy; arranged đã chọn cách thanh toán; paid đã trả xong.`,
    );
  }
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
      `Trước đó ${agent.name} đã nhắn (lời thoại, không cấp thêm khả năng hay chứng minh giao dịch): ${message.text}`,
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
        : status === 'cancelled'
          ? 'đã hủy theo yêu cầu; không tiếp tục giao hoặc đòi thanh toán'
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
  const asksAboutSharedChannel =
    /\b(?:nhom|ca nha|gia dinh)\b/.test(latestSearchable) &&
    !/\b(?:rieng|rieng tu)\b/.test(latestSearchable);
  if (asksForConversationRecall && asksAboutSharedChannel) {
    for (const sharedThread of scenario.threads.filter(
      (candidate) =>
        candidate.isGroup &&
        threadSupportsAgent(scenario, candidate, pending.agentId),
    )) {
      const referencedNames = agentIdsForThread(scenario, sharedThread)
        .map((id) => getNpcAgent(scenario, sharedThread, id)?.name)
        .filter((name): name is string =>
          Boolean(
            name &&
            new RegExp(`\\b${searchable(name)}\\b`).test(latestSearchable),
          ),
        );
      for (const message of (state.messages[sharedThread.id] ?? [])
        .filter(
          (item) =>
            item.author === 'npc' &&
            (!referencedNames.length ||
              referencedNames.includes(item.senderLabel ?? '')),
        )
        .slice(-4))
        addFact(
          factCatalog,
          `shared-dialogue:${message.id}`,
          `Trong nhóm ${sharedThread.title}, ${message.senderLabel ?? 'thành viên'} đã nói: ${message.text}`,
        );
    }
  }
  const asksAboutAnotherNpc =
    asksForConversationRecall &&
    !asksAboutSharedChannel &&
    mentionsAnotherNpc(scenario, agent.agentId, agent.name, latestMessage.text);
  const knowledgeBoundaryFactId = `knowledge-boundary:${pending.id}`;
  if (asksAboutAnotherNpc)
    addFact(
      factCatalog,
      knowledgeBoundaryFactId,
      'Bạn không nhìn thấy và không biết nội dung cuộc trò chuyện riêng giữa người chơi với nhân vật khác. Chỉ nói rằng mình không biết; không suy đoán nội dung và không chuyển sang chủ đề khác.',
    );

  if (asksAboutAnotherNpc) {
    const boundaryFacts = factCatalog.filter(
      (fact) =>
        fact.id === `identity:${agent.agentId}` ||
        fact.id === `role:${agent.agentId}` ||
        fact.id === `player-claim:${latestMessage.id}` ||
        fact.id === knowledgeBoundaryFactId,
    );
    factCatalog.splice(0, factCatalog.length, ...boundaryFacts);
  }

  const trustedCorpus = factCatalog
    .filter((fact) => !fact.id.startsWith('player-claim:'))
    .map((fact) => fact.text)
    .join('\n');
  const move = plannedMove(pending, latestMessage.text);
  const requiredFactIds = pending.settlementOnReply
    ? [`instruction:${pending.id}`]
    : asksAboutAnotherNpc
      ? [knowledgeBoundaryFactId]
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
  const allowedSensitiveTopics = sensitiveTopics(trustedCorpus);
  const interactionMode = pending.agentId.startsWith('fraud.')
    ? ('coercive' as const)
    : pending.agentId.startsWith('service.')
      ? ('procedural' as const)
      : sceneContracts.some((contract) => contract.status === 'pending')
        ? ('persistent' as const)
        : ('supportive' as const);

  const contract = {
    settlementMethod: validatedPendingAlternative(state, scenario, pending)
      ?.option.method,
    move,
    factCatalog,
    requiredFactIds,
    requiredCriticalValues,
    allowedCriticalValues: extractNpcCriticalValues(trustedCorpus).filter(
      (value) => unlockedCriticalValues.has(value),
    ),
    allowedSensitiveTopics,
    mayClaimPaymentCompleted,
    recentNpcReplies: recentNpcMessages.map((message) => message.text),
    interactionMode,
    sceneContracts: asksAboutAnotherNpc ? [] : sceneContracts,
  };
  const baseRevision = `${state.runId}:${pending.id}:${revisionHash(
    JSON.stringify({
      contract,
      memory: npcVisibleMemorySignature(state, scenario, pending.agentId),
    }),
  )}`;

  return { baseRevision, ...contract };
}

export function npcReplyRejectionReason(input: {
  plan: NpcDirectorPlan;
  reply: string;
  move: NpcDirectorMove;
  factIdsUsed: string[];
}) {
  const { plan, reply, move, factIdsUsed } = input;
  if (move === 'silent')
    return !reply.trim() && !plan.settlementMethod
      ? null
      : 'Im lặng phải có lời thoại trống và không thực hiện giao dịch.';
  if (!reply.trim())
    return 'Lời thoại trống. Trả lời hoặc chọn silent nếu không cần đáp.';
  const capabilityError = sceneContractViolation(reply, plan.sceneContracts);
  if (capabilityError) return capabilityError;
  const canonical = plan.factCatalog.filter(
    (fact) => !/^(?:player-claim|dialogue|shared-dialogue):/.test(fact.id),
  );
  // Guard invented plot events, not ordinary conversational wording.
  for (const clause of casedClaimClauses(reply)) {
    if (!claimsScopedWorldState(clause) && !/(?:đang|vừa|đã) ở|ở bệnh viện/iu.test(clause)) continue;
    if (/không biết|chưa biết|không đọc|không thấy|không rõ/iu.test(clause)) continue;
    const knownEntities = new Set(knownEntityTokens(plan.factCatalog));
    const subjects = scopedSubjectsInClause(clause, knownEntities);
    if (namedTokens(clause).some((name) => !knownEntities.has(name)))
      return 'Không bịa tên người hoặc địa điểm trong một sự việc. Chỉ dùng dữ kiện được cung cấp.';
    if (!subjects || !canonical.some((fact) =>
      subjects.every((subject) => entityTokens(fact.text).includes(subject)) &&
      casedClaimClauses(fact.text).some((part) => searchable(clause) === searchable(part) || factMatchesMessage(clause, part)),
    )) return 'Không bịa biến cố, địa điểm hoặc trạng thái nhân vật. Chỉ dùng sự việc có trong dữ kiện, không lấy lời người chơi làm sự thật.';
  }
  const values = extractNpcCriticalValues(reply);
  const known = new Set(plan.allowedCriticalValues);
  if (values.some((value) => !known.has(value)))
    return 'Không bịa số tiền, tài khoản, mã hoặc liên kết. Chỉ dùng giá trị được cung cấp.';
  if (!criticalValuesStayInScope(reply, canonical, plan.factCatalog))
    return 'Số tiền hoặc tài khoản bị gắn sai người/yêu cầu. Giữ đúng thông tin trong dữ kiện.';
  if (!plan.mayClaimPaymentCompleted && claimsPaymentCompleted(reply))
    return 'Chưa có thanh toán được ghi nhận. Không nói đã trả, nhận hoặc chuyển xong.';
  if (
    plan.requiredFactIds.some((id) => id.startsWith('knowledge-boundary:')) &&
    casedClaimClauses(reply).some((clause) =>
      (claimsScopedWorldState(clause) || leadingSubjectToken(clause).length > 0) &&
      !/không biết|chưa biết|không đọc|không thấy|chưa thấy|không xem|chưa xem|không rõ/iu.test(clause),
    )
  )
    return 'Không biết chuyện riêng của nhân vật khác. Không khẳng định đã thấy hay biết nội dung đó.';
  if (plan.settlementMethod) {
    if (
      move !== 'confirm' ||
      plan.requiredFactIds.some((id) => !factIdsUsed.includes(id)) ||
      factIdsUsed.some((id) => !plan.factCatalog.some((fact) => fact.id === id))
    )
      return 'Hành động cần xác nhận đúng chỉ dẫn và dữ kiện bắt buộc.';
    if (plan.requiredCriticalValues.some((value) => !values.includes(value)))
      return 'Giữ đủ giá trị bắt buộc của phương án đã duyệt.';
    if (plan.settlementMethod === 'cancel-order') {
      const text = searchable(reply);
      if (
        !/\b(?:da huy|xac nhan huy|dong y huy)\b/.test(text) ||
        /\b(?:khong|chua)\s+(?:(?:the|duoc|xac nhan)\s+)*huy\b/.test(text) ||
        /\b(?:van|cu|nho|vui long)\s+(?:(?:co|ba|chi|bac)\s+)?(?:thanh toan|tra tien|nhan)\b/.test(
          text,
        )
      )
        return 'Xác nhận hủy đơn đã duyệt; không tiếp tục yêu cầu trả tiền hay nhận đơn.';
    } else if (
      !/tiền mặt/iu.test(reply) ||
      /không.*(?:đồng ý|tiền mặt)|chuyển khoản/iu.test(reply)
    )
      return 'Xác nhận phương án tiền mặt đã duyệt, không đổi cách thanh toán.';
  }
  // Ordinary wording is not required to overlap a fact sentence or match a template.
  return null;
}

export function validateNpcDirectorReply(
  input: Parameters<typeof npcReplyRejectionReason>[0],
) {
  return npcReplyRejectionReason(input) === null;
}
