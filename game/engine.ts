import { selectNpcAgent } from './npc-agents';
import { getScenario } from './scenarios';
import type {
  Debrief,
  GameAction,
  GameMessage,
  GameState,
  MessageIntent,
  NpcFallbacks,
  PaymentChannel,
  PaymentRequest,
  PhoneNotification,
  RiskFlag,
  ScenarioDefinition,
  StoryCondition,
} from './types';

export const EMPTY_GAME_STATE: GameState = {
  saveVersion: 2,
  runId: '',
  characterId: null,
  screen: 'select',
  activeApp: 'home',
  activeThreadId: null,
  tick: 0,
  elapsedMinutes: 0,
  sequence: 0,
  messages: {},
  notifications: [],
  readNotificationIds: [],
  openedThreadIds: [],
  openedAppIds: [],
  openedBrowserCardIds: [],
  triggeredEventIds: [],
  queuedEventBeats: {},
  discoveredFactIds: [],
  callIds: [],
  attemptedCallIds: [],
  transactions: [],
  requestStatus: {},
  blockedThreadIds: [],
  reportedThreadIds: [],
  riskFlags: [],
  lastRiskAt: null,
  lastRiskThreadId: null,
  lastRecoveryAt: null,
  familyWarned: false,
  pendingNpcTurn: null,
  npcReplyModes: {},
  debrief: null,
};

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function nextSequence(state: GameState) {
  return state.sequence + 1;
}

function appendMessage(
  state: GameState,
  threadId: string,
  message: Omit<GameMessage, 'id'> & { id?: string },
) {
  const sequence = nextSequence(state);
  return {
    ...state,
    sequence,
    messages: {
      ...state.messages,
      [threadId]: [
        ...(state.messages[threadId] ?? []),
        { ...message, id: message.id ?? `${state.runId}-message-${sequence}` },
      ],
    },
  };
}

function appendNotification(state: GameState, notification: PhoneNotification) {
  if (state.notifications.some((item) => item.id === notification.id))
    return state;
  return { ...state, notifications: [notification, ...state.notifications] };
}

function addScheduledEvent(
  state: GameState,
  scenario: ScenarioDefinition,
  eventId: string,
) {
  const event = scenario.scheduledEvents.find((item) => item.id === eventId);
  if (!event || state.triggeredEventIds.includes(event.id)) return state;

  const queuedEventBeats = { ...state.queuedEventBeats };
  delete queuedEventBeats[event.id];
  const eventTime = gameTime(scenario, state.elapsedMinutes);

  let next: GameState = {
    ...state,
    triggeredEventIds: [...state.triggeredEventIds, event.id],
    queuedEventBeats,
  };

  const isSuppressed = event.threadId
    ? next.blockedThreadIds.includes(event.threadId) ||
      next.reportedThreadIds.includes(event.threadId)
    : false;
  if (!isSuppressed) {
    next = appendNotification(next, {
      ...event.notification,
      time: eventTime,
    });
    if (event.threadId && event.message) {
      next = appendMessage(next, event.threadId, {
        ...event.message,
        time: eventTime,
        id: `${event.id}-message`,
      });
    }
  }

  if (
    !isSuppressed &&
    event.bankCredit &&
    !next.transactions.some((item) => item.id === event.bankCredit?.id)
  ) {
    next = {
      ...next,
      transactions: [
        ...next.transactions,
        { ...event.bankCredit, time: eventTime },
      ],
    };
  }

  return next;
}

function acceptedOffer(state: GameState, threadId: string) {
  return (state.messages[threadId] ?? []).some((message) => {
    if (message.author !== 'player') return false;
    const value = message.text.toLocaleLowerCase('vi');
    const refuses =
      /không|ko\b|kh\b|chẳng|chưa|đừng|thôi|dừng|từ chối|lừa|giả/.test(value);
    const accepts =
      /ok\b|oke\b|được|đồng ý|tham gia|làm thử|thử việc|bắt đầu|hướng dẫn|nhận việc|chốt|làm luôn/.test(
        value,
      );
    return accepts && !refuses;
  });
}

function storyConditionMet(state: GameState, condition: StoryCondition) {
  switch (condition.type) {
    case 'event':
      return state.triggeredEventIds.includes(condition.eventId);
    case 'thread-opened':
      return state.openedThreadIds.includes(condition.threadId);
    case 'player-message':
      return (state.messages[condition.threadId] ?? []).some(
        (message) => message.author === 'player',
      );
    case 'offer-accepted':
      return acceptedOffer(state, condition.threadId);
    case 'browser-opened':
      return state.openedBrowserCardIds.includes(condition.cardId);
    case 'app-opened':
      return state.openedAppIds.includes(condition.appId);
    case 'risk':
      return state.riskFlags.includes(condition.risk);
    case 'thread-blocked':
      return state.blockedThreadIds.includes(condition.threadId);
    case 'thread-reported':
      return state.reportedThreadIds.includes(condition.threadId);
    case 'call':
      return state.callIds.includes(condition.callId);
    case 'request-status':
      return state.requestStatus[condition.requestId] === condition.status;
  }
}

function scheduledEventReady(
  state: GameState,
  event: ScenarioDefinition['scheduledEvents'][number],
) {
  if (event.requiresAll?.some((item) => !storyConditionMet(state, item)))
    return false;
  if (
    event.requiresAny?.length &&
    !event.requiresAny.some((item) => storyConditionMet(state, item))
  )
    return false;
  return true;
}

function queueReadyEvents(state: GameState, scenario: ScenarioDefinition) {
  const queuedEventBeats = { ...state.queuedEventBeats };
  let changed = false;
  for (const event of scenario.scheduledEvents) {
    if (
      state.triggeredEventIds.includes(event.id) ||
      queuedEventBeats[event.id] !== undefined ||
      !scheduledEventReady(state, event)
    )
      continue;
    queuedEventBeats[event.id] = state.tick + (event.delayActions ?? 1);
    changed = true;
  }
  return changed ? { ...state, queuedEventBeats } : state;
}

function syncStoryEvents(state: GameState, scenario: ScenarioDefinition) {
  let next = queueReadyEvents(state, scenario);
  for (let pass = 0; pass < scenario.scheduledEvents.length; pass += 1) {
    const due = scenario.scheduledEvents
      .filter(
        (event) =>
          !next.triggeredEventIds.includes(event.id) &&
          next.queuedEventBeats[event.id] !== undefined &&
          next.queuedEventBeats[event.id] <= next.tick,
      )
      .sort(
        (left, right) =>
          next.queuedEventBeats[left.id] - next.queuedEventBeats[right.id] ||
          left.id.localeCompare(right.id),
      );
    if (!due.length) break;
    for (const event of due) next = addScheduledEvent(next, scenario, event.id);
    next = queueReadyEvents(next, scenario);
  }
  return next;
}

export function advanceStory(
  state: GameState,
  scenario: ScenarioDefinition,
  elapsedMinutes = 2,
) {
  return syncStoryEvents(
    {
      ...state,
      tick: state.tick + 1,
      elapsedMinutes: state.elapsedMinutes + elapsedMinutes,
    },
    scenario,
  );
}

export function createScenarioState(
  characterId: NonNullable<GameState['characterId']>,
  runId: string,
): GameState {
  const scenario = getScenario(characterId);
  if (!scenario) return EMPTY_GAME_STATE;
  return {
    ...EMPTY_GAME_STATE,
    runId,
    characterId,
    screen: 'lock',
    messages: Object.fromEntries(
      scenario.threads.map((thread) => [
        thread.id,
        [...thread.initialMessages],
      ]),
    ),
    notifications: [...scenario.openingNotifications],
    requestStatus: Object.fromEntries(
      scenario.paymentRequests.map((request) => [request.id, 'pending']),
    ),
  };
}

export function gameTime(scenario: ScenarioDefinition, elapsedMinutes: number) {
  const total = scenario.startMinutes + elapsedMinutes;
  const hours = Math.floor(total / 60) % 24;
  const minutes = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function classifyIntent(message: string): MessageIntent {
  const value = message.toLocaleLowerCase('vi');
  if (/ai (đấy|đó|vậy)|là ai|tên gì|sinh nhật|chuyện riêng|kỷ niệm/.test(value))
    return 'identity';
  if (/gọi|video|gặp|xác minh|kiểm tra|hóa đơn|hoá đơn|tổng đài/.test(value))
    return 'verification';
  if (/đợi|chờ|mai|lát|từ từ|không vội/.test(value)) return 'delay';
  if (/tiền|chuyển|nạp|bao nhiêu|tài khoản|thanh toán|trả/.test(value))
    return 'money';
  if (/lừa|giả|hack|chiếm|không tin|đáng ngờ/.test(value)) return 'accusation';
  if (/giúp|làm sao|báo|khóa|khoá/.test(value)) return 'help';
  return 'ordinary';
}

export function pickFallback(
  fallbacks: NpcFallbacks,
  intent: MessageIntent,
  stableKey: string,
) {
  const options = fallbacks[intent] ?? fallbacks.ordinary;
  let hash = 0;
  for (let index = 0; index < stableKey.length; index += 1) {
    hash = (hash * 31 + stableKey.charCodeAt(index)) >>> 0;
  }
  return (
    options[hash % options.length] ??
    fallbacks.ordinary[0] ??
    'Ừ, để mình kiểm tra lại nhé.'
  );
}

function isRequestAvailable(request: PaymentRequest, state: GameState) {
  if (request.unlockAfter !== undefined && state.tick < request.unlockAfter)
    return false;
  if (
    request.unlockEventId &&
    !state.triggeredEventIds.includes(request.unlockEventId)
  )
    return false;
  if (request.unlockRisk && !state.riskFlags.includes(request.unlockRisk))
    return false;
  return true;
}

export function visiblePaymentRequests(
  state: GameState,
  scenario: ScenarioDefinition,
) {
  return scenario.paymentRequests.filter((request) =>
    isRequestAvailable(request, state),
  );
}

export function normalizePaymentDestination(value: string) {
  return value.toLocaleUpperCase('vi').replace(/[^A-Z0-9]/g, '');
}

export function amountPaidForRequest(state: GameState, requestId: string) {
  return state.transactions
    .filter(
      (transaction) =>
        transaction.direction === 'out' && transaction.requestId === requestId,
    )
    .reduce((total, transaction) => total + transaction.amount, 0);
}

export function matchingPaymentRequest(
  state: GameState,
  scenario: ScenarioDefinition,
  channel: PaymentChannel,
  destinationValue: string,
) {
  const normalized = normalizePaymentDestination(destinationValue);
  const matches = visiblePaymentRequests(state, scenario).filter(
    (request) =>
      request.channel === channel &&
      normalizePaymentDestination(request.destinationValue) === normalized,
  );
  return (
    matches.find((request) => state.requestStatus[request.id] === 'pending') ??
    matches[0] ??
    null
  );
}

export function visibleBrowserCards(
  state: GameState,
  scenario: ScenarioDefinition,
) {
  return scenario.browserCards.filter((card) => {
    if (card.unlockAfter !== undefined && state.tick < card.unlockAfter)
      return false;
    if (
      card.unlockEventId &&
      !state.triggeredEventIds.includes(card.unlockEventId)
    )
      return false;
    if (card.unlockRisk && !state.riskFlags.includes(card.unlockRisk))
      return false;
    return true;
  });
}

export function callIsAvailable(
  state: GameState,
  call: ScenarioDefinition['calls'][number],
) {
  return (
    !call.availableAfterEventId ||
    state.triggeredEventIds.includes(call.availableAfterEventId)
  );
}

export function storyCanEnd(state: GameState, scenario: ScenarioDefinition) {
  return (
    state.triggeredEventIds.includes(scenario.endingEventId) &&
    state.pendingNpcTurn === null
  );
}

export function currentBalance(state: GameState, scenario: ScenarioDefinition) {
  return state.transactions.reduce(
    (balance, item) =>
      balance + (item.direction === 'in' ? item.amount : -item.amount),
    scenario.balance,
  );
}

export function unreadCount(
  state: GameState,
  appId?: PhoneNotification['app'],
) {
  return state.notifications.filter(
    (item) =>
      (!appId || item.app === appId) &&
      !state.readNotificationIds.includes(item.id),
  ).length;
}

function threadResolved(
  state: GameState,
  scenario: ScenarioDefinition,
  threadId: string,
) {
  const thread = scenario.threads.find((item) => item.id === threadId);
  if (!thread || thread.truth === 'legit') return false;
  const relatedFacts = [
    ...(thread.verificationFactIds ?? []),
    ...scenario.paymentRequests
      .filter((request) => request.sourceThreadId === threadId)
      .flatMap((request) => request.verificationFactIds),
  ];
  const relatedRequests = scenario.paymentRequests.filter(
    (request) =>
      request.sourceThreadId === threadId && isRequestAvailable(request, state),
  );
  const hasIndependentEvidence = relatedFacts.some((factId) =>
    state.discoveredFactIds.includes(factId),
  );
  const hasResolution =
    state.blockedThreadIds.includes(threadId) ||
    state.reportedThreadIds.includes(threadId) ||
    (relatedRequests.length > 0
      ? relatedRequests.every(
          (request) => state.requestStatus[request.id] !== 'pending',
        )
      : state.familyWarned);
  return hasIndependentEvidence && hasResolution;
}

function threadIntroduced(
  state: GameState,
  scenario: ScenarioDefinition,
  threadId: string,
) {
  const thread = scenario.threads.find((item) => item.id === threadId);
  return Boolean(
    thread?.initialMessages.length ||
    scenario.scheduledEvents.some(
      (event) =>
        event.threadId === threadId &&
        state.triggeredEventIds.includes(event.id),
    ),
  );
}

function buildDebrief(state: GameState, scenario: ScenarioDefinition): Debrief {
  const riskSet = new Set(state.riskFlags);
  const hasSeriousRisk = riskSet.size > 0;
  const harmfulThreadIds = new Set(
    scenario.threads
      .filter(
        (thread) =>
          thread.truth !== 'legit' &&
          threadIntroduced(state, scenario, thread.id),
      )
      .map((thread) => thread.id),
  );
  const harmfulReports = state.reportedThreadIds.filter((threadId) =>
    harmfulThreadIds.has(threadId),
  );
  const hasRecoveryAction =
    state.lastRiskAt !== null &&
    state.lastRecoveryAt !== null &&
    state.lastRecoveryAt > state.lastRiskAt;
  const legitRequests = scenario.paymentRequests.filter(
    (request) => request.truth === 'legit',
  );
  const harmfulRequests = scenario.paymentRequests.filter(
    (request) =>
      request.truth !== 'legit' && isRequestAvailable(request, state),
  );
  const harmfulRequestIds = new Set(
    harmfulRequests.map((request) => request.id),
  );
  const harmfulTransactions = state.transactions.filter(
    (transaction) =>
      transaction.direction === 'out' &&
      transaction.requestId !== undefined &&
      harmfulRequestIds.has(transaction.requestId),
  );
  const harmfulPaidAmount = harmfulTransactions.reduce(
    (total, transaction) => total + transaction.amount,
    0,
  );
  const allLegitPaid = legitRequests.every(
    (request) => state.requestStatus[request.id] === 'paid',
  );
  const falsePositiveRequest = legitRequests.some(
    (request) => state.requestStatus[request.id] === 'declined',
  );
  const falsePositiveThread = scenario.threads.some(
    (thread) =>
      thread.truth === 'legit' &&
      (state.blockedThreadIds.includes(thread.id) ||
        state.reportedThreadIds.includes(thread.id)),
  );
  const falsePositive = falsePositiveRequest || falsePositiveThread;
  const strongFacts = scenario.facts.filter(
    (fact) =>
      fact.strength === 'strong' && state.discoveredFactIds.includes(fact.id),
  );
  const hasIndependentVerification = strongFacts.length > 0;
  const hasProtectiveAction = state.familyWarned || harmfulReports.length > 0;
  const harmfulHandled = scenario.threads
    .filter(
      (thread) =>
        thread.truth !== 'legit' &&
        threadIntroduced(state, scenario, thread.id),
    )
    .every((thread) => threadResolved(state, scenario, thread.id));
  const hasPendingLegit = legitRequests.some(
    (request) => state.requestStatus[request.id] === 'pending',
  );

  let ending: Debrief['ending'];
  const hasIrreversibleLoss =
    riskSet.has('otp_shared') ||
    harmfulTransactions.length > 1 ||
    harmfulPaidAmount > 500_000;
  if (hasSeriousRisk && !hasIrreversibleLoss && hasRecoveryAction)
    ending = 'recovered';
  else if (hasSeriousRisk) ending = 'trusted-wrong';
  else if (falsePositive) ending = 'false-positive';
  else if (
    !allLegitPaid ||
    hasPendingLegit ||
    !harmfulHandled ||
    !hasIndependentVerification ||
    !hasProtectiveAction
  )
    ending = 'unfinished';
  else ending = 'family-safe';

  const safety = Math.max(
    0,
    100 -
      (harmfulPaidAmount > 0
        ? Math.min(75, 20 + Math.round(harmfulPaidAmount / 50_000))
        : 0) -
      (riskSet.has('credentials_shared') ? 30 : 0) -
      (riskSet.has('otp_shared') ? 55 : 0),
  );
  const verification = Math.min(
    100,
    strongFacts.length * 28 + (state.callIds.length > 0 ? 12 : 0),
  );
  const dailyLife = allLegitPaid ? 100 : falsePositive ? 15 : 45;
  const family = Math.min(
    100,
    (state.familyWarned ? 55 : 0) +
      harmfulReports.length * 25 +
      (harmfulHandled ? 20 : 0),
  );
  const score = Math.round(
    safety * 0.35 + verification * 0.25 + dailyLife * 0.2 + family * 0.2,
  );

  const copy: Record<Debrief['ending'], { title: string; summary: string }> = {
    'family-safe': {
      title: 'Bạn không bị lừa',
      summary:
        'Bạn vẫn hoàn thành việc thật, kiểm tra bằng một kênh độc lập và không để sự gấp gáp quyết định thay mình.',
    },
    recovered: {
      title: 'Đã bị lừa, nhưng phản ứng kịp',
      summary:
        'Một bước rủi ro đã xảy ra, nhưng việc cảnh báo người thân và khóa đường tiếp cận giúp hạn chế hậu quả.',
    },
    unfinished: {
      title: 'Không bị lừa, nhưng còn việc dang dở',
      summary:
        'Bạn chưa mất dữ liệu hay tiền cho yêu cầu nguy hiểm, nhưng một việc đời thường hoặc một bước bảo vệ gia đình vẫn chưa xong.',
    },
    'false-positive': {
      title: 'Không bị lừa, nhưng đã nghi nhầm',
      summary:
        'Bạn tránh được rủi ro nhưng cũng từ chối hoặc chặn một yêu cầu hợp lệ. Xác minh giúp ta an toàn mà vẫn sống bình thường.',
    },
    'trusted-wrong': {
      title: 'Bạn đã bị lừa',
      summary:
        'Kẻ xấu dựa vào sự quen thuộc, áp lực thời gian hoặc một khoản thưởng nhỏ. Tất cả thiệt hại trong game chỉ là mô phỏng.',
    },
  };

  const timeline: string[] = [];
  if (strongFacts.length)
    timeline.push(
      `Bạn đã kiểm tra độc lập ${strongFacts.length} thông tin quan trọng.`,
    );
  if (allLegitPaid)
    timeline.push('Yêu cầu thanh toán hợp lệ đã được hoàn thành.');
  else if (hasPendingLegit)
    timeline.push('Một yêu cầu đời thường hợp lệ vẫn đang chờ xử lý.');
  if (
    harmfulRequests.some(
      (request) => state.requestStatus[request.id] === 'declined',
    )
  )
    timeline.push('Bạn đã từ chối một yêu cầu chuyển tiền có hại.');
  if (state.reportedThreadIds.length)
    timeline.push(
      `Bạn đã báo cáo ${state.reportedThreadIds.length} tài khoản trong mô phỏng.`,
    );
  if (state.familyWarned)
    timeline.push(
      'Cả nhà đã được cảnh báo để cùng kiểm tra tài khoản và tin nhắn.',
    );
  if (riskSet.has('credentials_shared'))
    timeline.push(
      'Thông tin đăng nhập mô phỏng đã được nhập vào một trang bên ngoài.',
    );
  if (riskSet.has('otp_shared'))
    timeline.push('Mã đăng nhập mô phỏng đã bị gửi cho một tài khoản khác.');
  if (
    riskSet.has('money_sent_to_scam') ||
    riskSet.has('money_sent_to_compromised')
  )
    timeline.push(
      'Một khoản tiền mô phỏng đã được chuyển cho yêu cầu không hợp lệ.',
    );
  if (!timeline.length)
    timeline.push(
      'Bạn kết thúc sớm trước khi có đủ thông tin để phân biệt các yêu cầu.',
    );

  return {
    outcome: hasSeriousRisk ? 'scammed' : 'safe',
    ending,
    title: copy[ending].title,
    summary: copy[ending].summary,
    score,
    dimensions: [
      { label: 'An toàn tài sản', value: safety },
      { label: 'Xác minh', value: verification },
      { label: 'Việc đời thường', value: dailyLife },
      { label: 'Bảo vệ gia đình', value: family },
    ],
    timeline,
  };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  if (action.type === 'RESET') return EMPTY_GAME_STATE;
  if (action.type === 'RESTORE') return action.state;
  if (action.type === 'START')
    return createScenarioState(action.characterId, action.runId);

  const scenario = getScenario(state.characterId);
  if (!scenario) return state;

  switch (action.type) {
    case 'UNLOCK':
      return state.screen === 'lock'
        ? { ...state, screen: 'phone', activeApp: 'home' }
        : state;

    case 'OPEN_APP': {
      const readIds =
        action.appId === 'messages'
          ? []
          : state.notifications
              .filter((item) => item.app === action.appId)
              .map((item) => item.id);
      return syncStoryEvents(
        {
          ...state,
          screen: 'phone',
          activeApp: action.appId,
          activeThreadId: null,
          openedAppIds: unique([...state.openedAppIds, action.appId]),
          readNotificationIds: unique([
            ...state.readNotificationIds,
            ...readIds,
          ]),
        },
        scenario,
      );
    }

    case 'OPEN_THREAD': {
      if (!scenario.threads.some((thread) => thread.id === action.threadId))
        return state;
      const readIds = state.notifications
        .filter((item) => item.threadId === action.threadId)
        .map((item) => item.id);
      return syncStoryEvents(
        {
          ...state,
          screen: 'phone',
          activeApp: 'messages',
          activeThreadId: action.threadId,
          openedThreadIds: unique([...state.openedThreadIds, action.threadId]),
          readNotificationIds: unique([
            ...state.readNotificationIds,
            ...readIds,
          ]),
        },
        scenario,
      );
    }

    case 'OPEN_BROWSER_CARD': {
      const card = visibleBrowserCards(state, scenario).find(
        (item) => item.id === action.cardId,
      );
      if (!card || state.openedBrowserCardIds.includes(card.id)) return state;
      return advanceStory(
        {
          ...state,
          openedBrowserCardIds: [...state.openedBrowserCardIds, card.id],
          discoveredFactIds: card.factId
            ? unique([...state.discoveredFactIds, card.factId])
            : state.discoveredFactIds,
        },
        scenario,
        3,
      );
    }

    case 'HOME':
      return { ...state, activeApp: 'home', activeThreadId: null };

    case 'SEND_MESSAGE': {
      const text = action.text.trim().slice(0, 500);
      const thread = scenario.threads.find(
        (item) => item.id === action.threadId,
      );
      if (
        !text ||
        !thread ||
        state.pendingNpcTurn ||
        state.blockedThreadIds.includes(action.threadId)
      )
        return state;
      const agent = selectNpcAgent(scenario, thread, text);
      let next = appendMessage(state, action.threadId, {
        author: 'player',
        text,
        time: action.time,
      });
      const warnsFamily = Boolean(
        thread.isGroup &&
        /lừa|giả|hack|chiếm|đừng bấm|đừng chuyển|cảnh giác|mất tài khoản/i.test(
          text,
        ),
      );
      next = {
        ...next,
        familyWarned: next.familyWarned || warnsFamily,
        pendingNpcTurn: {
          id: action.turnId,
          runId: state.runId,
          threadId: action.threadId,
          agentId: agent.agentId,
          memoryScopeId: `${state.runId}:${agent.memoryKey}`,
          senderLabel: agent.name,
        },
      };
      return advanceStory(next, scenario, 2);
    }

    case 'NPC_REPLY': {
      const pending = state.pendingNpcTurn;
      if (
        !pending ||
        pending.runId !== action.runId ||
        state.runId !== action.runId ||
        pending.id !== action.turnId ||
        pending.threadId !== action.threadId
      )
        return state;
      const thread = scenario.threads.find(
        (item) => item.id === action.threadId,
      );
      return appendMessage(
        {
          ...state,
          pendingNpcTurn: null,
          npcReplyModes: {
            ...state.npcReplyModes,
            [action.threadId]: 'ai',
          },
        },
        action.threadId,
        {
          author: 'npc',
          senderLabel: thread?.isGroup ? pending.senderLabel : undefined,
          agentId: pending.agentId,
          responseMode: 'ai',
          text: action.text.trim().slice(0, 400),
          time: action.time,
        },
      );
    }

    case 'NPC_FAILED': {
      const pending = state.pendingNpcTurn;
      if (
        !pending ||
        pending.runId !== action.runId ||
        pending.id !== action.turnId
      )
        return state;
      const thread = scenario.threads.find(
        (item) => item.id === pending.threadId,
      );
      if (!thread) return { ...state, pendingNpcTurn: null };
      const lastPlayerMessage = [...(state.messages[pending.threadId] ?? [])]
        .reverse()
        .find((item) => item.author === 'player');
      const classifiedIntent = classifyIntent(lastPlayerMessage?.text ?? '');
      const hasVisibleRequest = visiblePaymentRequests(state, scenario).some(
        (request) => request.sourceThreadId === pending.threadId,
      );
      const intent =
        classifiedIntent === 'money' && !hasVisibleRequest
          ? 'ordinary'
          : classifiedIntent;
      return appendMessage(
        {
          ...state,
          pendingNpcTurn: null,
          npcReplyModes: {
            ...state.npcReplyModes,
            [pending.threadId]: 'fallback',
          },
        },
        pending.threadId,
        {
          author: 'npc',
          senderLabel: thread.isGroup ? pending.senderLabel : undefined,
          agentId: pending.agentId,
          responseMode: 'fallback',
          text: pickFallback(
            thread.fallbacks,
            intent,
            `${state.runId}:${pending.id}:${intent}`,
          ),
          time: gameTime(scenario, state.elapsedMinutes),
        },
      );
    }

    case 'CALL': {
      const call = scenario.calls.find((item) => item.id === action.callId);
      if (!call) return state;
      if (state.callIds.includes(call.id)) return state;
      const available = callIsAvailable(state, call);
      if (!available) {
        if (state.attemptedCallIds.includes(call.id)) return state;
        return advanceStory(
          {
            ...state,
            attemptedCallIds: unique([...state.attemptedCallIds, call.id]),
          },
          scenario,
          2,
        );
      }
      const factIds = call.factId
        ? unique([...state.discoveredFactIds, call.factId])
        : state.discoveredFactIds;
      return advanceStory(
        {
          ...state,
          callIds: unique([...state.callIds, call.id]),
          attemptedCallIds: unique([...state.attemptedCallIds, call.id]),
          discoveredFactIds: factIds,
        },
        scenario,
        4,
      );
    }

    case 'DISCOVER_FACT': {
      if (
        !scenario.facts.some((fact) => fact.id === action.factId) ||
        state.discoveredFactIds.includes(action.factId)
      )
        return state;
      return advanceStory(
        {
          ...state,
          discoveredFactIds: [...state.discoveredFactIds, action.factId],
        },
        scenario,
        3,
      );
    }

    case 'SUBMIT_PAYMENT': {
      const request = scenario.paymentRequests.find(
        (item) => item.id === action.requestId,
      );
      const amount = Math.round(action.amount);
      if (
        !request ||
        !isRequestAvailable(request, state) ||
        state.requestStatus[request.id] !== 'pending' ||
        action.channel !== request.channel ||
        action.institutionLabel !== request.institutionLabel ||
        normalizePaymentDestination(action.destinationValue) !==
          normalizePaymentDestination(request.destinationValue) ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        currentBalance(state, scenario) < amount
      )
        return state;
      const paidBefore = amountPaidForRequest(state, request.id);
      const paidAfter = paidBefore + amount;
      const completed = paidAfter >= request.amount;
      const remaining = Math.max(0, request.amount - paidAfter);
      const risk: RiskFlag | null =
        request.truth === 'scam'
          ? 'money_sent_to_scam'
          : request.truth === 'compromised'
            ? 'money_sent_to_compromised'
            : null;
      let next: GameState = {
        ...state,
        requestStatus: {
          ...state.requestStatus,
          [request.id]: completed ? 'paid' : 'pending',
        },
        riskFlags: risk ? unique([...state.riskFlags, risk]) : state.riskFlags,
        lastRiskAt: risk ? state.tick + 1 : state.lastRiskAt,
        lastRiskThreadId: risk
          ? request.sourceThreadId
          : state.lastRiskThreadId,
        lastRecoveryAt: risk ? null : state.lastRecoveryAt,
        transactions: [
          ...state.transactions,
          {
            id: `${state.runId}-payment-${request.id}-${state.transactions.length + 1}`,
            requestId: request.id,
            label: request.recipient,
            detail:
              action.note.trim().slice(0, 80) ||
              `${request.note} · ${request.destinationValue}`,
            amount,
            direction: 'out',
            time: gameTime(scenario, state.elapsedMinutes + 2),
          },
        ],
      };
      const responseText = completed
        ? request.onPaidMessage
        : request.onPartialMessage?.replace(
            '{remaining}',
            `${new Intl.NumberFormat('vi-VN').format(remaining)}đ`,
          );
      if (responseText && request.onPaidThreadId) {
        next = appendMessage(next, request.onPaidThreadId, {
          author: 'npc',
          text: responseText,
          time: gameTime(scenario, state.elapsedMinutes + 2),
        });
      }
      return advanceStory(next, scenario, 2);
    }

    case 'DECLINE_REQUEST': {
      const request = scenario.paymentRequests.find(
        (item) => item.id === action.requestId,
      );
      if (
        !request ||
        !isRequestAvailable(request, state) ||
        state.requestStatus[request.id] !== 'pending'
      )
        return state;
      return advanceStory(
        {
          ...state,
          requestStatus: { ...state.requestStatus, [request.id]: 'declined' },
        },
        scenario,
        1,
      );
    }

    case 'BLOCK_THREAD':
    case 'REPORT_THREAD': {
      const threadId = action.threadId;
      const thread = scenario.threads.find((item) => item.id === threadId);
      if (!thread) return state;
      const isBlock = action.type === 'BLOCK_THREAD';
      if (
        (isBlock && state.blockedThreadIds.includes(threadId)) ||
        (!isBlock && state.reportedThreadIds.includes(threadId))
      )
        return state;
      const status = { ...state.requestStatus };
      for (const request of scenario.paymentRequests) {
        if (
          request.sourceThreadId === threadId &&
          status[request.id] === 'pending'
        )
          status[request.id] = 'declined';
      }
      return advanceStory(
        {
          ...state,
          requestStatus: status,
          blockedThreadIds: isBlock
            ? unique([...state.blockedThreadIds, threadId])
            : state.blockedThreadIds,
          reportedThreadIds: !isBlock
            ? unique([...state.reportedThreadIds, threadId])
            : state.reportedThreadIds,
          lastRecoveryAt:
            thread.truth !== 'legit' &&
            state.lastRiskAt !== null &&
            state.lastRiskThreadId === threadId
              ? state.tick + 1
              : state.lastRecoveryAt,
          pendingNpcTurn:
            state.pendingNpcTurn?.threadId === threadId
              ? null
              : state.pendingNpcTurn,
        },
        scenario,
        1,
      );
    }

    case 'BROWSER_RISK': {
      const riskCard = visibleBrowserCards(state, scenario).find(
        (card) =>
          card.riskAction === action.risk &&
          state.openedBrowserCardIds.includes(card.id),
      );
      if (!riskCard || state.riskFlags.includes(action.risk)) return state;
      return advanceStory(
        {
          ...state,
          riskFlags: [...state.riskFlags, action.risk],
          lastRiskAt: state.tick + 1,
          lastRiskThreadId: riskCard.sourceThreadId ?? null,
          lastRecoveryAt: null,
        },
        scenario,
        2,
      );
    }

    case 'WARN_FAMILY':
      return state.familyWarned
        ? state
        : advanceStory(
            {
              ...state,
              familyWarned: true,
              lastRecoveryAt: state.lastRiskAt !== null ? state.tick + 1 : null,
            },
            scenario,
            1,
          );

    case 'FINISH':
      if (!storyCanEnd(state, scenario)) return state;
      return {
        ...state,
        screen: 'debrief',
        activeThreadId: null,
        pendingNpcTurn: null,
        debrief: buildDebrief(state, scenario),
      };
  }
}
