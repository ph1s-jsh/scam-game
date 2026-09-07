import assert from 'node:assert/strict';

import {
  currentBalance,
  EMPTY_GAME_STATE,
  gameReducer,
  storyCanEnd,
  visiblePaymentRequests,
} from './engine';
import { collectNpcMemory } from './npc-agents';
import { npcWorldRevision, validateNpcDirectorReply } from './npc-director';
import { findPaymentArrangement } from './payment-arrangements';
import { loadGameState } from './persistence';
import { getScenario } from './scenarios';
import type {
  CharacterId,
  GameAction,
  GameState,
  PaymentRequest,
} from './types';

const characterIds: CharacterId[] = ['hanh', 'an', 'bao'];

const act = (state: GameState, ...actions: GameAction[]) =>
  actions.reduce(gameReducer, state);

const start = (characterId: CharacterId, runId = `test-${characterId}`) =>
  gameReducer(EMPTY_GAME_STATE, { type: 'START', characterId, runId });

const finish = (state: GameState) => gameReducer(state, { type: 'FINISH' });

const call = (callId: string): GameAction => ({ type: 'CALL', callId });
const openCard = (cardId: string): GameAction => ({
  type: 'OPEN_BROWSER_CARD',
  cardId,
});
const decline = (requestId: string): GameAction => ({
  type: 'DECLINE_REQUEST',
  requestId,
});
const report = (threadId: string): GameAction => ({
  type: 'REPORT_THREAD',
  threadId,
});
const block = (threadId: string): GameAction => ({
  type: 'BLOCK_THREAD',
  threadId,
});

function requestFor(requestId: string): PaymentRequest {
  const request = characterIds
    .flatMap((characterId) => getScenario(characterId)?.paymentRequests ?? [])
    .find((item) => item.id === requestId);
  assert.ok(request, `Unknown payment request: ${requestId}`);
  return request;
}

function pay(requestId: string, amount?: number): GameAction {
  const request = requestFor(requestId);
  return {
    type: 'SUBMIT_PAYMENT',
    requestId,
    channel: request.channel,
    institutionLabel: request.institutionLabel,
    destinationValue: request.destinationValue,
    amount: amount ?? request.amount,
    note: request.note,
  };
}

function send(
  state: GameState,
  threadId: string,
  text: string,
  turnId: string,
) {
  return gameReducer(state, {
    type: 'SEND_MESSAGE',
    threadId,
    text,
    time: '20:00',
    turnId,
  });
}

function failPending(state: GameState) {
  const pending = state.pendingNpcTurns[0];
  assert.ok(pending);
  return gameReducer(state, {
    type: 'NPC_FAILED',
    runId: state.runId,
    turnId: pending.id,
  });
}

function replyPending(state: GameState, text: string) {
  return gameReducer(state, replyAction(state, text));
}

function replyAction(
  state: GameState,
  text: string,
  mode?: 'ai' | 'fallback' | 'local',
): Extract<GameAction, { type: 'NPC_REPLY' }> {
  const pending = state.pendingNpcTurns[0];
  assert.ok(pending);
  if (mode !== 'local') assert.ok(pending.directorPlan);
  const factIdsUsed = pending.directorPlan?.requiredFactIds.length
    ? pending.directorPlan.requiredFactIds
    : (pending.directorPlan?.factCatalog
        .filter((fact) => fact.id.startsWith('player-claim:'))
        .map((fact) => fact.id)
        .slice(0, 1) ?? []);
  return {
    type: 'NPC_REPLY',
    runId: state.runId,
    turnId: pending.id,
    threadId: pending.threadId,
    text,
    time: '20:01',
    mode,
    baseRevision: pending.directorPlan?.baseRevision,
    move: pending.directorPlan?.move,
    factIdsUsed,
  };
}

function messageBeat(state: GameState, threadId: string, marker: string) {
  const next = send(
    state,
    threadId,
    `Mình đang kiểm tra các việc bình thường ${marker}.`,
    `${state.runId}-${marker}`,
  );
  return next.pendingNpcTurns.length ? failPending(next) : next;
}

function progressToEnding(state: GameState) {
  for (let beat = 0; beat < 30; beat += 1) {
    if (state.pendingNpcTurns.length) state = failPending(state);
    const scenario = getScenario(state.characterId);
    assert.ok(scenario);
    if (storyCanEnd(state, scenario)) return state;

    if (
      state.characterId === 'hanh' &&
      !state.openedThreadIds.includes('hanh-an-real')
    ) {
      state = gameReducer(state, {
        type: 'OPEN_THREAD',
        threadId: 'hanh-an-real',
      });
      continue;
    }
    if (
      state.characterId === 'an' &&
      !state.openedThreadIds.includes('an-hanh')
    ) {
      state = gameReducer(state, {
        type: 'OPEN_THREAD',
        threadId: 'an-hanh',
      });
      continue;
    }
    if (
      state.characterId === 'an' &&
      state.triggeredEventIds.includes('an-event-bao') &&
      !state.openedBrowserCardIds.includes('an-web-job')
    ) {
      state = gameReducer(state, openCard('an-web-job'));
      continue;
    }
    if (
      state.characterId === 'bao' &&
      !state.openedThreadIds.includes('bao-family')
    ) {
      state = gameReducer(state, {
        type: 'OPEN_THREAD',
        threadId: 'bao-family',
      });
      continue;
    }
    if (
      state.characterId === 'bao' &&
      state.triggeredEventIds.includes('bao-event-an-social') &&
      !state.openedBrowserCardIds.includes('bao-web-official')
    ) {
      state = gameReducer(state, openCard('bao-web-official'));
      continue;
    }

    const safeThread =
      state.characterId === 'hanh'
        ? 'hanh-family'
        : state.characterId === 'an'
          ? 'an-family'
          : 'bao-family';
    state = messageBeat(state, safeThread, `ending-${beat}`);
  }
  assert.fail(`Story did not reach an ending for ${state.characterId}`);
}

function reachAnRecruiter(runId: string) {
  let state = start('an', runId);
  state = gameReducer(state, { type: 'OPEN_THREAD', threadId: 'an-hanh' });
  state = act(state, call('an-call-hanh'), pay('an-pay-internet'));
  assert.ok(state.triggeredEventIds.includes('an-event-bao'));
  state = gameReducer(state, {
    type: 'OPEN_THREAD',
    threadId: 'an-bao-social',
  });
  state = gameReducer(state, openCard('an-web-job'));
  state = gameReducer(state, call('an-call-bao'));
  state = messageBeat(state, 'an-family', `${runId}-recruiter-delay`);
  assert.ok(state.triggeredEventIds.includes('an-event-recruiter'));
  return gameReducer(state, {
    type: 'OPEN_THREAD',
    threadId: 'an-recruiter',
  });
}

function reachAnTask(runId = 'an-task') {
  let state = reachAnRecruiter(runId);
  state = send(state, 'an-recruiter', 'Được, em làm thử nhé', `${runId}-turn`);
  assert.ok(!state.triggeredEventIds.includes('an-event-reward'));
  state = failPending(state);
  state = gameReducer(state, call('an-call-recruiter'));
  state = gameReducer(state, openCard('an-web-company'));
  assert.ok(state.triggeredEventIds.includes('an-event-reward'));
  state = gameReducer(state, { type: 'OPEN_APP', appId: 'bank' });
  state = messageBeat(state, 'an-family', `${runId}-task-1`);
  state = messageBeat(state, 'an-family', `${runId}-task-2`);
  assert.ok(state.triggeredEventIds.includes('an-event-task'));
  return state;
}

// Everyday chat behavior is decided locally before any AI request is queued.
{
  const base = start('hanh', 'reply-policy');

  const acknowledged = send(base, 'hanh-family', 'ok', 'ack-turn');
  assert.equal(acknowledged.pendingNpcTurns.length, 0);
  assert.equal(
    acknowledged.messages['hanh-family'].at(-1)?.deliveryStatus,
    'seen',
  );
  assert.equal(acknowledged.tick, base.tick);

  const thanked = send(base, 'hanh-family', 'cảm ơn', 'thanks-turn');
  assert.equal(thanked.pendingNpcTurns.length, 0);
  assert.equal(thanked.tick, base.tick);

  const noise = send(base, 'hanh-family', 'zzzzzzzz', 'noise-turn');
  assert.equal(noise.pendingNpcTurns.length, 0);
  assert.equal(noise.tick, base.tick);

  const forwardedLink = send(
    base,
    'hanh-an-real',
    'https://example.invalid/kiem-tra',
    'forwarded-link',
  );
  assert.equal(forwardedLink.pendingNpcTurns[0]?.responseKind, 'ai');
  assert.ok(forwardedLink.pendingNpcTurns[0]?.delayMs >= 6_500);

  const questionLikeAck = send(base, 'hanh-family', 'rồi?', 'ack-question');
  assert.equal(questionLikeAck.pendingNpcTurns[0]?.responseKind, 'ai');

  let parallel = send(
    base,
    'hanh-family',
    'Cả nhà ăn cơm chưa?',
    'parallel-family',
  );
  parallel = send(
    parallel,
    'hanh-an-real',
    'An còn ở lớp không con?',
    'parallel-an',
  );
  assert.equal(parallel.pendingNpcTurns.length, 2);

  let boundary = send(
    base,
    'hanh-an-real',
    'Đồ ngu, trả lời đi',
    'boundary-one',
  );
  assert.equal(boundary.pendingNpcTurns[0]?.responseKind, 'local');
  const localPending = boundary.pendingNpcTurns[0];
  assert.ok(localPending?.localReply);
  boundary = gameReducer(boundary, {
    type: 'NPC_REPLY',
    runId: boundary.runId,
    turnId: localPending.id,
    threadId: localPending.threadId,
    text: localPending.localReply,
    time: '20:01',
    mode: 'local',
  });
  assert.equal(boundary.messages['hanh-an-real'].at(-1)?.responseMode, 'local');
  assert.equal(
    boundary.messages['hanh-an-real'].at(-2)?.deliveryStatus,
    'seen',
  );
  const repeatedAbuse = send(
    boundary,
    'hanh-an-real',
    'Cút đi, đồ ngu',
    'boundary-two',
  );
  assert.equal(repeatedAbuse.pendingNpcTurns.length, 0);
  assert.equal(repeatedAbuse.tick, boundary.tick);

  let duplicate = send(
    base,
    'hanh-family',
    'Cả nhà ăn cơm chưa?',
    'duplicate-one',
  );
  duplicate = failPending(duplicate);
  const duplicateAgain = send(
    duplicate,
    'hanh-family',
    'Cả nhà ăn cơm chưa?',
    'duplicate-two',
  );
  assert.equal(duplicateAgain.pendingNpcTurns.length, 0);
  assert.equal(duplicateAgain.tick, duplicate.tick);
}

// Every conversation turn is bound to a concrete, isolated AI character.
{
  let state = start('hanh', 'persona-routing');
  const scenario = getScenario('hanh');
  assert.ok(scenario);

  state = send(state, 'hanh-family', 'Bảo ơi, con về chưa?', 'turn-group-bao');
  assert.equal(state.pendingNpcTurns[0]?.agentId, 'family.bao');
  assert.equal(state.pendingNpcTurns[0]?.senderLabel, 'Bảo');
  assert.equal(
    state.pendingNpcTurns[0]?.memoryScopeId,
    'persona-routing:family.bao',
  );
  state = replyPending(state, 'Bà hỏi rõ hơn giúp con nha.');
  assert.equal(state.messages['hanh-family'].at(-1)?.senderLabel, 'Bảo');
  assert.equal(state.messages['hanh-family'].at(-1)?.agentId, 'family.bao');
  assert.equal(state.messages['hanh-family'].at(-1)?.responseMode, 'ai');

  state = send(
    state,
    'hanh-an-real',
    'An ơi, con còn ở lớp không?',
    'turn-real-an',
  );
  assert.equal(state.pendingNpcTurns[0]?.agentId, 'family.an');
  assert.equal(state.pendingNpcTurns[0]?.directorPlan?.move, 'answer');
  assert.ok(
    state.pendingNpcTurns[0]?.directorPlan?.requiredFactIds.includes(
      'role:family.an',
    ),
  );
  state = replyPending(state, 'Dạ con đang ở lớp đến 20 giờ.');
  assert.equal(state.messages['hanh-an-real'].at(-1)?.responseMode, 'ai');

  let fakeState = start('hanh', 'persona-routing-fake');
  fakeState = gameReducer(fakeState, {
    type: 'OPEN_THREAD',
    threadId: 'hanh-an-real',
  });
  fakeState = gameReducer(fakeState, call('hanh-call-pharmacy'));
  fakeState = gameReducer(fakeState, call('hanh-call-an'));
  fakeState = messageBeat(fakeState, 'hanh-family', 'reveal-new-number');
  assert.ok(fakeState.triggeredEventIds.includes('hanh-event-new-number'));
  fakeState = send(
    fakeState,
    'hanh-an-new',
    'Ai đang nhắn vậy?',
    'turn-fake-an',
  );
  assert.equal(fakeState.pendingNpcTurns[0]?.agentId, 'fraud.fake-an-number');
  const fakeMemory = collectNpcMemory(
    fakeState,
    scenario,
    'fraud.fake-an-number',
    'hanh-an-new',
    fakeState.messages['hanh-an-new'].at(-1)?.id ?? '',
  );
  assert.ok(fakeMemory.every((turn) => turn.channelLabel === 'An · số mới'));
}

// The director selects a group speaker deterministically and keeps a natural turn owner.
{
  const base = start('hanh', 'director-routing');
  const baoFirst = send(
    base,
    'hanh-family',
    'Bảo ơi, hỏi chị An xem mấy giờ về giúp bà.',
    'director-bao-first',
  );
  assert.equal(baoFirst.pendingNpcTurns[0]?.agentId, 'family.bao');

  const anFirst = send(
    base,
    'hanh-family',
    'An ơi, Bảo học về chưa con?',
    'director-an-first',
  );
  assert.equal(anFirst.pendingNpcTurns[0]?.agentId, 'family.an');

  const verificationQuestion = send(
    base,
    'hanh-an-real',
    'Mã đơn đúng chưa con?',
    'director-question-not-refusal',
  );
  assert.notEqual(
    verificationQuestion.pendingNpcTurns[0]?.directorPlan?.move,
    'refuse',
  );

  let continuity = replyPending(baoFirst, 'Dạ, để con hỏi chị An rồi báo bà.');
  continuity = send(
    continuity,
    'hanh-family',
    'Ừ, vậy con nhớ nói lại với bà nha.',
    'director-continuity',
  );
  assert.equal(continuity.pendingNpcTurns[0]?.agentId, 'family.bao');

  const defaultOne = send(
    base,
    'hanh-family',
    'Cả nhà ăn cơm chưa?',
    'director-default-one',
  );
  const defaultTwo = send(
    base,
    'hanh-family',
    'Cả nhà ăn cơm chưa?',
    'director-default-two',
  );
  assert.equal(defaultOne.pendingNpcTurns[0]?.agentId, 'family.an');
  assert.equal(
    defaultOne.pendingNpcTurns[0]?.agentId,
    defaultTwo.pendingNpcTurns[0]?.agentId,
  );

  const direct = send(
    base,
    'hanh-an-real',
    'An ơi, Bảo vừa nói gì vậy con?',
    'director-direct-owner',
  );
  assert.equal(direct.pendingNpcTurns[0]?.agentId, 'family.an');
}

// Verified information is shared only with NPCs who observed the channel.
{
  let direct = start('hanh', 'director-private-knowledge');
  direct = gameReducer(direct, call('hanh-call-pharmacy'));
  direct = send(
    direct,
    'hanh-an-real',
    'Nhà thuốc xác nhận mã đơn, tên người nhận và số tiền đều khớp.',
    'director-private-fact',
  );
  assert.ok(
    direct.npcKnownFactIds['family.an']?.includes('hanh-fact-pharmacy'),
  );
  assert.ok(
    !direct.npcKnownFactIds['family.bao']?.includes('hanh-fact-pharmacy'),
  );

  let group = start('hanh', 'director-group-knowledge');
  group = gameReducer(group, call('hanh-call-pharmacy'));
  group = send(
    group,
    'hanh-family',
    'Nhà thuốc xác nhận mã đơn, tên người nhận và số tiền đều khớp.',
    'director-group-fact',
  );
  assert.ok(group.npcKnownFactIds['family.an']?.includes('hanh-fact-pharmacy'));
  assert.ok(
    group.npcKnownFactIds['family.bao']?.includes('hanh-fact-pharmacy'),
  );
  assert.ok(
    group.npcKnownFactIds['service.minh-tam']?.includes('hanh-fact-pharmacy'),
  );

  let negated = start('hanh', 'director-negated-knowledge');
  negated = gameReducer(negated, call('hanh-call-pharmacy'));
  negated = send(
    negated,
    'hanh-family',
    'Nhà thuốc không xác nhận mã đơn và số tiền.',
    'director-negated-fact',
  );
  assert.ok(
    !negated.npcKnownFactIds['family.an']?.includes('hanh-fact-pharmacy'),
  );
  assert.ok(
    !negated.npcKnownFactIds['family.bao']?.includes('hanh-fact-pharmacy'),
  );
}

// AI output is accepted only for the same world revision and within its fact contract.
{
  let state = send(
    start('an', 'director-contract'),
    'an-hanh',
    'Bà cho con hỏi hóa đơn Internet bao nhiêu?',
    'director-contract-turn',
  );
  const pending = state.pendingNpcTurns[0];
  const plan = pending?.directorPlan;
  assert.ok(pending && plan);
  assert.equal(plan.baseRevision, npcWorldRevision(state));
  assert.equal(
    validateNpcDirectorReply({
      plan,
      reply: 'Hóa đơn là 219.000đ, mã P203-08 đó con.',
      move: plan.move,
      factIdsUsed: plan.requiredFactIds,
    }),
    true,
  );
  assert.equal(
    validateNpcDirectorReply({
      plan,
      reply: 'Con chuyển 2.800.000đ vào STK 000203280001 nha.',
      move: plan.move,
      factIdsUsed: [],
    }),
    false,
  );
  assert.equal(
    validateNpcDirectorReply({
      plan,
      reply: 'Mở https://evil.example rồi gửi OTP 839201 nha.',
      move: plan.move,
      factIdsUsed: [],
    }),
    false,
  );
  assert.equal(
    validateNpcDirectorReply({
      plan,
      reply: 'Bà đã thanh toán xong rồi con.',
      move: plan.move,
      factIdsUsed: [],
    }),
    false,
  );
  assert.equal(
    validateNpcDirectorReply({
      plan,
      reply: 'Tôi đang ở Đà Nẵng với chị Hoa.',
      move: plan.move,
      factIdsUsed: ['player-claim:director-contract-turn-player'],
    }),
    false,
  );
  assert.equal(
    validateNpcDirectorReply({
      plan,
      reply: 'hôm qua tôi vừa bị tai nạn ở quê.',
      move: plan.move,
      factIdsUsed: ['player-claim:director-contract-turn-player'],
    }),
    false,
  );
  assert.equal(
    validateNpcDirectorReply({
      plan,
      reply: 'Hóa đơn bị hủy.',
      move: plan.move,
      factIdsUsed: plan.requiredFactIds,
    }),
    false,
  );
  assert.equal(
    validateNpcDirectorReply({
      plan,
      reply: 'Hóa đơn không phải 219.000đ, mã P203-08 đó con.',
      move: plan.move,
      factIdsUsed: plan.requiredFactIds,
    }),
    false,
  );
  assert.equal(
    validateNpcDirectorReply({
      plan,
      reply: 'Con ở bệnh viện.',
      move: plan.move,
      factIdsUsed: plan.requiredFactIds,
    }),
    false,
  );

  const staleAction = replyAction(
    state,
    'Hóa đơn là 219.000đ, mã P203-08 đó con.',
  );
  state = gameReducer(state, call('an-call-hanh'));
  assert.strictEqual(gameReducer(state, staleAction), state);
  const oldBaseRevision = plan.baseRevision;
  state = gameReducer(state, {
    type: 'REPLAN_NPC_TURN',
    runId: state.runId,
    turnId: pending.id,
  });
  assert.notEqual(
    state.pendingNpcTurns[0]?.directorPlan?.baseRevision,
    oldBaseRevision,
  );
  assert.equal(
    state.pendingNpcTurns[0]?.directorPlan?.baseRevision,
    npcWorldRevision(state),
  );

  let harmless = send(
    start('hanh', 'director-ui-change'),
    'hanh-an-real',
    'Hôm nay ở lớp có vui không con?',
    'director-ui-turn',
  );
  const uiRevision = npcWorldRevision(harmless);
  harmless = gameReducer(harmless, { type: 'OPEN_APP', appId: 'notes' });
  assert.equal(npcWorldRevision(harmless), uiRevision);
  harmless = replyPending(harmless, 'Bà hỏi rõ hơn giúp con nha.');
  assert.equal(harmless.pendingNpcTurns.length, 0);
  assert.equal(harmless.messages['hanh-an-real'].at(-1)?.responseMode, 'ai');
}

// Locked payment beats are not exposed to an NPC before their story event.
{
  let state = reachAnRecruiter('director-hidden-payment');
  state = send(
    state,
    'an-recruiter',
    'Cho em hỏi công việc cụ thể là gì?',
    'director-hidden-payment-turn',
  );
  const catalogIds =
    state.pendingNpcTurns[0]?.directorPlan?.factCatalog.map(
      (fact) => fact.id,
    ) ?? [];
  assert.ok(!catalogIds.includes('request:an-pay-task'));
  assert.ok(!catalogIds.includes('request:an-pay-task-large'));
}

// Ordinary conversation no longer advances story clocks by itself.
{
  const state = start('hanh', 'director-pacing');
  const chatted = send(
    state,
    'hanh-family',
    'Hôm nay cả nhà có vui không?',
    'director-pacing-turn',
  );
  assert.equal(chatted.tick, state.tick);
  assert.equal(chatted.elapsedMinutes, state.elapsedMinutes);
}

// Reading one thing only arms a later event; it does not reveal the next beat immediately.
{
  let state = start('hanh', 'delayed-events');
  state = gameReducer(state, {
    type: 'OPEN_THREAD',
    threadId: 'hanh-an-real',
  });
  assert.ok(!state.triggeredEventIds.includes('hanh-event-pharmacy'));
  state = messageBeat(state, 'hanh-family', 'delay-1');
  assert.ok(state.triggeredEventIds.includes('hanh-event-pharmacy'));
  assert.ok(!state.triggeredEventIds.includes('hanh-event-new-number'));
  state = messageBeat(state, 'hanh-family', 'delay-2');
  assert.ok(!state.triggeredEventIds.includes('hanh-event-new-number'));
  state = messageBeat(state, 'hanh-family', 'delay-3');
  assert.ok(state.triggeredEventIds.includes('hanh-event-new-number'));
}

// Refusing the job cannot accidentally unlock a reward or paid task.
{
  let state = reachAnRecruiter('causality-refusal');
  state = send(
    state,
    'an-recruiter',
    'Không, em không tham gia. Đây có vẻ là lừa đảo.',
    'refuse-turn',
  );
  state = failPending(state);
  state = gameReducer(state, call('an-call-recruiter'));
  state = gameReducer(state, openCard('an-web-company'));
  state = messageBeat(state, 'an-family', 'refuse-later-1');
  state = messageBeat(state, 'an-family', 'refuse-later-2');
  assert.ok(!state.triggeredEventIds.includes('an-event-reward'));
  assert.ok(!state.triggeredEventIds.includes('an-event-task'));
  assert.ok(!state.transactions.some((item) => item.id === 'an-reward-credit'));
  assert.ok(
    !visiblePaymentRequests(state, getScenario('an')!).some(
      (request) => request.id === 'an-pay-task',
    ),
  );
}

// Acceptance unlocks the reward only after later activity, then the paid task.
{
  const state = reachAnTask('causality-accept');
  assert.equal(
    state.transactions.filter((item) => item.id === 'an-reward-credit').length,
    1,
  );
  assert.ok(
    visiblePaymentRequests(state, getScenario('an')!).some(
      (request) => request.id === 'an-pay-task',
    ),
  );
}

// A short contextual acceptance is answered, while scripted messages wait for it.
{
  let state = reachAnRecruiter('contextual-ok');
  const beforeAcceptance = state.tick;
  state = send(state, 'an-recruiter', 'ok', 'contextual-ok-turn');
  const pending = state.pendingNpcTurns[0];
  assert.ok(pending);
  assert.equal(pending.responseKind, 'ai');
  assert.equal(state.tick, beforeAcceptance + 1);

  state = gameReducer(state, call('an-call-recruiter'));
  state = gameReducer(state, openCard('an-web-company'));
  assert.ok(!state.triggeredEventIds.includes('an-event-reward'));

  state = gameReducer(state, {
    type: 'REPLAN_NPC_TURN',
    runId: state.runId,
    turnId: pending.id,
  });
  state = replyPending(state, 'Chị hỏi rõ hơn giúp em nhé.');
  assert.ok(state.triggeredEventIds.includes('an-event-reward'));
  assert.equal(
    state.messages['an-recruiter'].at(-1)?.id,
    'an-event-reward-message',
  );
}

// The fake support account appears only after credentials were actually submitted.
{
  let state = start('bao', 'support-causality');
  state = gameReducer(state, { type: 'OPEN_THREAD', threadId: 'bao-family' });
  state = messageBeat(state, 'bao-family', 'social-1');
  state = messageBeat(state, 'bao-family', 'social-2');
  assert.ok(state.triggeredEventIds.includes('bao-event-an-social'));
  state = gameReducer(state, openCard('bao-web-vote'));
  assert.ok(!state.triggeredEventIds.includes('bao-event-support'));
  state = gameReducer(state, {
    type: 'BROWSER_RISK',
    risk: 'credentials_shared',
  });
  assert.ok(!state.triggeredEventIds.includes('bao-event-support'));
  state = gameReducer(state, call('bao-call-game'));
  assert.ok(state.triggeredEventIds.includes('bao-event-support'));
}

// Bảo can open the simulated voting page from the link An sent in chat.
{
  let state = start('bao', 'message-link');
  state = gameReducer(state, { type: 'OPEN_THREAD', threadId: 'bao-family' });
  state = messageBeat(state, 'bao-family', 'message-link-1');
  state = messageBeat(state, 'bao-family', 'message-link-2');
  assert.ok(state.triggeredEventIds.includes('bao-event-an-social'));

  const linkedMessage = state.messages['bao-an-social'].find(
    (message) => message.browserLink?.cardId === 'bao-web-vote',
  );
  assert.ok(linkedMessage);
  assert.strictEqual(
    gameReducer(state, {
      type: 'OPEN_MESSAGE_LINK',
      threadId: 'bao-an-social',
      messageId: 'missing-message',
    }),
    state,
  );

  state = gameReducer(state, {
    type: 'OPEN_MESSAGE_LINK',
    threadId: 'bao-an-social',
    messageId: linkedMessage.id,
  });
  assert.equal(state.activeApp, 'browser');
  assert.equal(state.focusedBrowserCardId, 'bao-web-vote');
  assert.ok(state.openedBrowserCardIds.includes('bao-web-vote'));
  assert.ok(!state.riskFlags.includes('credentials_shared'));

  state = gameReducer(state, {
    type: 'BROWSER_RISK',
    risk: 'credentials_shared',
  });
  assert.ok(state.riskFlags.includes('credentials_shared'));
  assert.equal(state.lastRiskThreadId, 'bao-an-social');

  state = gameReducer(state, { type: 'OPEN_APP', appId: 'browser' });
  assert.equal(state.focusedBrowserCardId, null);
}

// Repeating completed actions is a true no-op and cannot fast-forward the story.
{
  let state = start('bao', 'no-op');
  const firstUnavailableCall = gameReducer(state, call('bao-call-an'));
  assert.notStrictEqual(firstUnavailableCall, state);
  assert.strictEqual(
    gameReducer(firstUnavailableCall, call('bao-call-an')),
    firstUnavailableCall,
  );
  state = gameReducer(firstUnavailableCall, call('bao-call-hanh'));
  assert.strictEqual(gameReducer(state, call('bao-call-hanh')), state);

  state = gameReducer(state, openCard('bao-web-official'));
  assert.strictEqual(gameReducer(state, openCard('bao-web-official')), state);
  state = gameReducer(state, pay('bao-pay-topup'));
  assert.strictEqual(gameReducer(state, pay('bao-pay-topup')), state);
  state = gameReducer(state, block('bao-an-social'));
  assert.strictEqual(gameReducer(state, block('bao-an-social')), state);
  state = gameReducer(state, report('bao-an-social'));
  assert.strictEqual(gameReducer(state, report('bao-an-social')), state);
  state = gameReducer(state, { type: 'WARN_FAMILY' });
  assert.strictEqual(gameReducer(state, { type: 'WARN_FAMILY' }), state);
}

// Profiles and forged actions cannot open a conversation before it appears.
{
  const hidden = start('bao', 'hidden-thread');
  assert.strictEqual(
    gameReducer(hidden, { type: 'OPEN_THREAD', threadId: 'bao-an-sms' }),
    hidden,
  );
  assert.strictEqual(
    send(hidden, 'bao-an-sms', 'Chị nhắn em à?', 'hidden-message'),
    hidden,
  );
}

// Manual payment details are validated, partial amounts accumulate, and balances never overdraw.
{
  const scenario = getScenario('bao')!;
  const base = start('bao', 'manual-payment');
  const validPayment = pay('bao-pay-topup') as Extract<
    GameAction,
    { type: 'SUBMIT_PAYMENT' }
  >;
  assert.strictEqual(
    gameReducer(base, { ...validPayment, destinationValue: '0000000999' }),
    base,
  );
  assert.strictEqual(
    gameReducer(base, { ...validPayment, institutionLabel: 'Ngân hàng sai' }),
    base,
  );

  const partial = gameReducer(base, pay('bao-pay-topup', 20_000));
  assert.equal(currentBalance(partial, scenario), 360_000);
  assert.equal(partial.requestStatus['bao-pay-topup'], 'pending');
  const completed = gameReducer(partial, pay('bao-pay-topup', 30_000));
  assert.equal(currentBalance(completed, scenario), 330_000);
  assert.equal(completed.requestStatus['bao-pay-topup'], 'paid');
  assert.strictEqual(
    gameReducer(completed, pay('bao-pay-topup', 1_000)),
    completed,
  );

  const lowBalance: GameState = {
    ...base,
    transactions: [
      {
        id: 'balance-drain',
        label: 'Kiểm thử',
        detail: 'Kiểm thử số dư',
        amount: 340_000,
        direction: 'out',
        time: '00:00',
      },
    ],
  };
  assert.equal(currentBalance(lowBalance, scenario), 40_000);
  assert.strictEqual(gameReducer(lowBalance, pay('bao-pay-topup')), lowBalance);
}

// Legitimate cash and family arrangements resolve only after the NPC turn, without touching the player's bank balance.
{
  const hanhScenario = getScenario('hanh')!;
  let contact = start('hanh', 'cash-contact');
  const initialBalance = currentBalance(contact, hanhScenario);
  contact = send(
    contact,
    'hanh-an-real',
    'An chuyển khoản giúp bà đúng 186.000đ nhé, lúc về bà đưa lại con tiền mặt.',
    'cash-contact-turn',
  );
  const contactPending = contact.pendingNpcTurns[0];
  assert.equal(
    contactPending?.settlementOnReply?.optionId,
    'hanh-an-pays-cash-back',
  );
  assert.equal(contactPending?.responseKind, 'local');
  assert.equal(contactPending?.directorPlan, undefined);
  assert.equal(contact.requestStatus['hanh-pay-pharmacy'], 'pending');
  assert.equal(currentBalance(contact, hanhScenario), initialBalance);
  assert.strictEqual(gameReducer(contact, pay('hanh-pay-pharmacy')), contact);
  const wrongRoleReply = replyAction(
    contact,
    'Dạ được bà, bà thanh toán 186.000đ tiền mặt khi nhận thuốc nha.',
    'local',
  );
  assert.strictEqual(gameReducer(contact, wrongRoleReply), contact);
  const declinedWhileWaiting = gameReducer(
    contact,
    decline('hanh-pay-pharmacy'),
  );
  const cancelledAcceptance = gameReducer(
    declinedWhileWaiting,
    replyAction(
      declinedWhileWaiting,
      declinedWhileWaiting.pendingNpcTurns[0]?.localReply ?? '',
      'local',
    ),
  );
  assert.equal(cancelledAcceptance.pendingNpcTurns.length, 0);
  assert.equal(
    cancelledAcceptance.messages['hanh-an-real'].at(-1)?.author,
    'player',
  );
  assert.equal(
    cancelledAcceptance.requestStatus['hanh-pay-pharmacy'],
    'declined',
  );
  const contactReply = replyAction(
    contact,
    contactPending?.localReply ?? '',
    'local',
  );
  contact = gameReducer(contact, contactReply);
  assert.equal(contact.requestStatus['hanh-pay-pharmacy'], 'arranged');
  assert.equal(
    contact.requestArrangementOptionIds['hanh-pay-pharmacy'],
    'hanh-an-pays-cash-back',
  );
  assert.equal(currentBalance(contact, hanhScenario), initialBalance);
  assert.ok(
    !contact.transactions.some(
      (transaction) => transaction.requestId === 'hanh-pay-pharmacy',
    ),
  );
  assert.strictEqual(gameReducer(contact, contactReply), contact);
  assert.strictEqual(gameReducer(contact, pay('hanh-pay-pharmacy')), contact);

  let cashOnDelivery = start('hanh', 'cash-delivery');
  cashOnDelivery = gameReducer(cashOnDelivery, {
    type: 'OPEN_THREAD',
    threadId: 'hanh-an-real',
  });
  cashOnDelivery = messageBeat(
    cashOnDelivery,
    'hanh-an-real',
    'reveal-pharmacy',
  );
  assert.ok(cashOnDelivery.triggeredEventIds.includes('hanh-event-pharmacy'));
  cashOnDelivery = gameReducer(cashOnDelivery, {
    type: 'OPEN_THREAD',
    threadId: 'hanh-pharmacy',
  });
  cashOnDelivery = send(
    cashOnDelivery,
    'hanh-pharmacy',
    'Cô sẽ trả 186.000đ tiền mặt khi nhận đúng đơn nhé.',
    'cash-delivery-turn',
  );
  assert.equal(
    cashOnDelivery.pendingNpcTurns[0]?.settlementOnReply?.optionId,
    'hanh-pharmacy-cash-on-delivery',
  );
  cashOnDelivery = failPending(cashOnDelivery);
  assert.equal(cashOnDelivery.requestStatus['hanh-pay-pharmacy'], 'arranged');
  assert.match(
    cashOnDelivery.messages['hanh-pharmacy'].at(-1)?.text ?? '',
    /tiền mặt khi nhận/i,
  );
  assert.ok(
    !cashOnDelivery.transactions.some(
      (transaction) => transaction.requestId === 'hanh-pay-pharmacy',
    ),
  );

  const anScenario = getScenario('an')!;
  let anCash = start('an', 'an-cash-counter');
  const anBalance = currentBalance(anCash, anScenario);
  anCash = send(anCash, 'an-hanh', 'Bà đưa tiền mặt đi nha.', 'an-cash-turn');
  assert.equal(
    anCash.pendingNpcTurns[0]?.settlementOnReply?.optionId,
    'an-hanh-cash-at-counter',
  );
  anCash = gameReducer(
    anCash,
    replyAction(anCash, anCash.pendingNpcTurns[0]?.localReply ?? '', 'local'),
  );
  assert.equal(anCash.requestStatus['an-pay-internet'], 'arranged');
  assert.equal(currentBalance(anCash, anScenario), anBalance);

  const negated = send(
    start('an', 'cash-negated'),
    'an-hanh',
    'Bà đừng đóng tiền mặt, để con kiểm tra lại đã.',
    'cash-negated-turn',
  );
  assert.equal(negated.pendingNpcTurns[0]?.settlementOnReply, undefined);

  const choosesCashInstead = send(
    start('an', 'cash-instead-of-transfer'),
    'an-hanh',
    'Không cần chuyển khoản đâu, bà trả tiền mặt đi nha.',
    'cash-instead-of-transfer-turn',
  );
  assert.equal(
    choosesCashInstead.pendingNpcTurns[0]?.settlementOnReply?.optionId,
    'an-hanh-cash-at-counter',
  );

  const scamScenario = getScenario('hanh')!;
  assert.equal(
    findPaymentArrangement({
      state: start('hanh', 'cash-scam'),
      scenario: scamScenario,
      threadId: 'hanh-an-new',
      agentId: 'fraud.fake-an-number',
      text: 'Bà sẽ trả tiền mặt cho con, không chuyển khoản nữa.',
    }),
    null,
  );

  const familyAn = send(
    start('hanh', 'cash-family-an'),
    'hanh-family',
    'An ơi, con chuyển hộ bà 186.000đ, về bà đưa lại tiền mặt nha.',
    'cash-family-an-turn',
  );
  assert.equal(familyAn.pendingNpcTurns[0]?.agentId, 'family.an');
  assert.equal(
    familyAn.pendingNpcTurns[0]?.settlementOnReply?.optionId,
    'hanh-an-pays-cash-back',
  );
  const familyBao = send(
    start('hanh', 'cash-family-bao'),
    'hanh-family',
    'Bảo ơi, con chuyển hộ bà 186.000đ, về bà đưa lại tiền mặt nha.',
    'cash-family-bao-turn',
  );
  assert.equal(familyBao.pendingNpcTurns[0]?.agentId, 'family.bao');
  assert.equal(familyBao.pendingNpcTurns[0]?.settlementOnReply, undefined);
}

// Replies from an old run or a wrong turn never leak into a new game.
{
  let oldState = start('hanh', 'run-old');
  oldState = send(oldState, 'hanh-family', 'Cả nhà ăn cơm chưa?', 'turn-old');
  const newState = start('bao', 'run-new');
  const stale = gameReducer(newState, {
    type: 'NPC_REPLY',
    runId: 'run-old',
    turnId: 'turn-old',
    threadId: 'hanh-family',
    text: 'Tin nhắn cũ',
    time: '20:01',
  });
  assert.strictEqual(stale, newState);
  assert.strictEqual(
    gameReducer(oldState, {
      type: 'NPC_REPLY',
      runId: 'run-old',
      turnId: 'wrong-turn',
      threadId: 'hanh-family',
      text: 'Sai lượt',
      time: '20:01',
    }),
    oldState,
  );
  const replied = replyPending(oldState, 'Bà hỏi rõ hơn giúp con nha.');
  assert.equal(replied.pendingNpcTurns.length, 0);
  assert.equal(
    replied.messages['hanh-family'].at(-1)?.text,
    'Bà hỏi rõ hơn giúp con nha.',
  );
  assert.strictEqual(
    gameReducer(replied, {
      type: 'NPC_REPLY',
      runId: 'run-old',
      turnId: 'turn-old',
      threadId: 'hanh-family',
      text: 'Lặp lại',
      time: '20:02',
    }),
    replied,
  );
}

// Restored sessions discard stale or malformed pending turns instead of locking chat.
{
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value),
      },
    },
  });

  const pendingState = send(
    start('hanh', 'restore-run'),
    'hanh-an-real',
    'Con đang ở đâu vậy?',
    'restore-turn',
  );
  assert.equal(pendingState.pendingNpcTurns.length, 1);
  values.set('three-screens:session:v3', JSON.stringify(pendingState));
  assert.equal(loadGameState()?.pendingNpcTurns.length, 1);
  assert.equal(loadGameState()?.pendingNpcTurns[0]?.directorPlan, undefined);

  values.set(
    'three-screens:session:v3',
    JSON.stringify({
      ...pendingState,
      pendingNpcTurns: [
        { ...pendingState.pendingNpcTurns[0], runId: 'stale-run' },
      ],
    }),
  );
  assert.equal(loadGameState()?.pendingNpcTurns.length, 0);

  values.set(
    'three-screens:session:v3',
    JSON.stringify({
      ...pendingState,
      pendingNpcTurns: [
        {
          ...pendingState.pendingNpcTurns[0],
          settlementOnReply: { requestId: 203, optionId: null },
        },
      ],
    }),
  );
  assert.equal(loadGameState()?.pendingNpcTurns.length, 0);

  values.clear();
  values.set(
    'three-screens:session:v2',
    JSON.stringify({
      ...pendingState,
      saveVersion: 2,
      pendingNpcTurns: undefined,
    }),
  );
  assert.equal(loadGameState()?.saveVersion, 3);
  assert.equal(loadGameState()?.pendingNpcTurns.length, 0);

  let legacyBao = start('bao', 'restore-message-link');
  legacyBao = gameReducer(legacyBao, {
    type: 'OPEN_THREAD',
    threadId: 'bao-family',
  });
  legacyBao = messageBeat(legacyBao, 'bao-family', 'restore-link-1');
  legacyBao = messageBeat(legacyBao, 'bao-family', 'restore-link-2');
  const legacyMessages = legacyBao.messages['bao-an-social'].map((message) =>
    message.id === 'bao-event-an-social-message'
      ? { ...message, browserLink: undefined }
      : message,
  );
  values.set(
    'three-screens:session:v3',
    JSON.stringify({
      ...legacyBao,
      messages: { ...legacyBao.messages, 'bao-an-social': legacyMessages },
    }),
  );
  assert.equal(
    loadGameState()?.messages['bao-an-social'].find(
      (message) => message.id === 'bao-event-an-social-message',
    )?.browserLink?.cardId,
    'bao-web-vote',
  );
  Reflect.deleteProperty(globalThis, 'window');
}

// The result screen stays locked until the narrative reaches its closing beat.
{
  const initial = start('hanh', 'finish-gate');
  assert.strictEqual(finish(initial), initial);
  let ready = progressToEnding(initial);
  assert.ok(storyCanEnd(ready, getScenario('hanh')!));

  const awaitingReply = send(
    ready,
    'hanh-family',
    'Cả nhà còn thức không?',
    'finish-pending',
  );
  assert.ok(awaitingReply.pendingNpcTurns.length > 0);
  assert.ok(!storyCanEnd(awaitingReply, getScenario('hanh')!));
  assert.strictEqual(finish(awaitingReply), awaitingReply);
  ready = failPending(awaitingReply);
  assert.ok(storyCanEnd(ready, getScenario('hanh')!));
  assert.equal(finish(ready).screen, 'debrief');
}

// Ignoring a suspicious link still leaves a causal, safe path to the ending.
{
  let an = start('an', 'safe-ignore-an');
  an = gameReducer(an, { type: 'OPEN_THREAD', threadId: 'an-hanh' });
  an = act(an, call('an-call-hanh'), pay('an-pay-internet'));
  assert.ok(an.triggeredEventIds.includes('an-event-bao'));
  an = gameReducer(an, {
    type: 'OPEN_THREAD',
    threadId: 'an-bao-social',
  });
  an = gameReducer(an, report('an-bao-social'));
  an = gameReducer(an, call('an-call-bao'));
  an = messageBeat(an, 'an-family', 'safe-ignore-an-delay');
  assert.ok(!an.openedBrowserCardIds.includes('an-web-job'));
  assert.ok(an.triggeredEventIds.includes('an-event-recruiter'));
  an = gameReducer(an, {
    type: 'OPEN_THREAD',
    threadId: 'an-recruiter',
  });
  an = gameReducer(an, call('an-call-recruiter'));
  an = gameReducer(an, report('an-recruiter'));
  an = gameReducer(an, openCard('an-web-company'));
  an = messageBeat(an, 'an-family', 'safe-ignore-an-family-1');
  an = messageBeat(an, 'an-family', 'safe-ignore-an-family-2');
  assert.equal(an.riskFlags.length, 0);
  assert.ok(storyCanEnd(an, getScenario('an')!));

  let bao = start('bao', 'safe-ignore-bao');
  bao = gameReducer(bao, { type: 'OPEN_THREAD', threadId: 'bao-family' });
  bao = act(bao, call('bao-call-hanh'), pay('bao-pay-topup'));
  assert.ok(bao.triggeredEventIds.includes('bao-event-an-social'));
  bao = gameReducer(bao, {
    type: 'OPEN_THREAD',
    threadId: 'bao-an-social',
  });
  bao = gameReducer(bao, call('bao-call-game'));
  bao = messageBeat(bao, 'bao-family', 'safe-ignore-bao-family');
  bao = messageBeat(bao, 'bao-hanh', 'safe-ignore-bao-hanh');
  bao = messageBeat(bao, 'bao-game-official', 'safe-ignore-bao-official');
  assert.ok(!bao.callIds.includes('bao-call-an'));
  assert.ok(!bao.blockedThreadIds.includes('bao-an-social'));
  assert.ok(!bao.reportedThreadIds.includes('bao-an-social'));
  assert.ok(!bao.openedBrowserCardIds.includes('bao-web-official'));
  assert.ok(!bao.riskFlags.includes('credentials_shared'));
  assert.ok(bao.triggeredEventIds.includes('bao-event-an-sms'));
  bao = gameReducer(bao, call('bao-call-an'));
  bao = gameReducer(bao, report('bao-an-social'));
  assert.equal(bao.riskFlags.length, 0);
  assert.ok(storyCanEnd(bao, getScenario('bao')!));
}

// Each role has a safe route: ordinary mistakes may lower quality, but only fraud causes a loss.
{
  let hanh = progressToEnding(start('hanh', 'safe-hanh'));
  hanh = act(
    hanh,
    call('hanh-call-an'),
    call('hanh-call-pharmacy'),
    call('hanh-call-bao'),
    pay('hanh-pay-pharmacy'),
    decline('hanh-pay-tuition'),
    decline('hanh-pay-card'),
    { type: 'WARN_FAMILY' },
  );
  assert.equal(finish(hanh).debrief?.ending, 'family-safe');
  assert.equal(finish(hanh).debrief?.outcome, 'safe');

  let hanhCash = progressToEnding(start('hanh', 'safe-hanh-cash'));
  hanhCash = send(
    hanhCash,
    'hanh-an-real',
    'An chuyển đúng 186.000đ hộ bà, về bà đưa lại con tiền mặt nhé.',
    'safe-hanh-cash-turn',
  );
  hanhCash = gameReducer(
    hanhCash,
    replyAction(
      hanhCash,
      hanhCash.pendingNpcTurns[0]?.localReply ?? '',
      'local',
    ),
  );
  hanhCash = act(
    hanhCash,
    call('hanh-call-an'),
    call('hanh-call-pharmacy'),
    call('hanh-call-bao'),
    decline('hanh-pay-tuition'),
    decline('hanh-pay-card'),
    { type: 'WARN_FAMILY' },
  );
  const hanhCashDebrief = finish(hanhCash).debrief;
  assert.equal(hanhCashDebrief?.ending, 'family-safe');
  assert.equal(
    hanhCashDebrief?.dimensions.find(
      (dimension) => dimension.label === 'Việc đời thường',
    )?.value,
    100,
  );
  assert.ok(
    hanhCashDebrief?.timeline.some((item) =>
      item.includes('hoàn lại An bằng tiền mặt'),
    ),
  );

  let an = reachAnTask('safe-an');
  an = act(an, decline('an-pay-task'), { type: 'WARN_FAMILY' });
  an = progressToEnding(an);
  assert.equal(finish(an).debrief?.ending, 'family-safe');
  assert.equal(finish(an).debrief?.outcome, 'safe');

  let bao = progressToEnding(start('bao', 'safe-bao'));
  bao = act(
    bao,
    call('bao-call-hanh'),
    call('bao-call-an'),
    pay('bao-pay-topup'),
    report('bao-an-social'),
    { type: 'WARN_FAMILY' },
  );
  assert.equal(finish(bao).debrief?.ending, 'family-safe');
  assert.equal(finish(bao).debrief?.outcome, 'safe');
}

// Any submitted scam money or secret is a fraud outcome, even after recovery.
{
  const credentialRisk = (runId: string) => {
    let state = start('bao', runId);
    state = gameReducer(state, {
      type: 'OPEN_THREAD',
      threadId: 'bao-family',
    });
    state = messageBeat(state, 'bao-family', `${runId}-social-1`);
    state = messageBeat(state, 'bao-family', `${runId}-social-2`);
    state = gameReducer(state, openCard('bao-web-vote'));
    return gameReducer(state, {
      type: 'BROWSER_RISK',
      risk: 'credentials_shared',
    });
  };

  let recovered = credentialRisk('risk-recovered');
  recovered = gameReducer(recovered, { type: 'WARN_FAMILY' });
  recovered = progressToEnding(recovered);
  assert.equal(finish(recovered).debrief?.ending, 'recovered');
  assert.equal(finish(recovered).debrief?.outcome, 'scammed');

  let warnedTooEarly = start('bao', 'warned-too-early');
  warnedTooEarly = gameReducer(warnedTooEarly, { type: 'WARN_FAMILY' });
  const riskAfterWarning = credentialRisk('warned-too-early-risk');
  warnedTooEarly = {
    ...riskAfterWarning,
    familyWarned: warnedTooEarly.familyWarned,
  };
  warnedTooEarly = progressToEnding(warnedTooEarly);
  assert.equal(finish(warnedTooEarly).debrief?.ending, 'trusted-wrong');

  let otpLoss = credentialRisk('otp-loss');
  otpLoss = gameReducer(otpLoss, openCard('bao-web-otp'));
  otpLoss = gameReducer(otpLoss, openCard('bao-web-send-otp'));
  otpLoss = gameReducer(otpLoss, {
    type: 'BROWSER_RISK',
    risk: 'otp_shared',
  });
  otpLoss = gameReducer(otpLoss, { type: 'WARN_FAMILY' });
  otpLoss = progressToEnding(otpLoss);
  assert.equal(finish(otpLoss).debrief?.ending, 'trusted-wrong');
  assert.equal(finish(otpLoss).debrief?.outcome, 'scammed');

  let partialScam = progressToEnding(start('hanh', 'partial-scam'));
  partialScam = gameReducer(partialScam, pay('hanh-pay-tuition', 10_000));
  partialScam = gameReducer(partialScam, { type: 'WARN_FAMILY' });
  assert.equal(finish(partialScam).debrief?.outcome, 'scammed');
}

// Safe but incomplete and false-positive endings remain non-loss outcomes.
{
  let falsePositive = progressToEnding(start('hanh', 'false-positive'));
  falsePositive = gameReducer(falsePositive, decline('hanh-pay-pharmacy'));
  const falsePositiveDebrief = finish(falsePositive).debrief;
  assert.equal(falsePositiveDebrief?.ending, 'false-positive');
  assert.equal(falsePositiveDebrief?.outcome, 'safe');

  const unfinished = finish(
    progressToEnding(start('hanh', 'unfinished')),
  ).debrief;
  assert.equal(unfinished?.ending, 'unfinished');
  assert.equal(unfinished?.outcome, 'safe');

  let largeLoss = reachAnTask('large-loss');
  largeLoss = act(largeLoss, pay('an-pay-task'), pay('an-pay-task-large'), {
    type: 'WARN_FAMILY',
  });
  largeLoss = progressToEnding(largeLoss);
  assert.equal(finish(largeLoss).debrief?.ending, 'trusted-wrong');
  assert.equal(finish(largeLoss).debrief?.outcome, 'scammed');
}

console.log(
  'Engine smoke tests passed: conditional pacing, manual payments, AI guards, finish gating, and outcomes.',
);
