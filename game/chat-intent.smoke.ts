import assert from 'node:assert/strict';
import { EMPTY_GAME_STATE, gameReducer } from './engine';
import { getScenario } from './scenarios';
import { findPaymentArrangement } from './payment-arrangements';
import { selectNpcAgent } from './npc-agents';
import { parseFirebaseNpcResult } from '../lib/firebase-ai';

const scenario = getScenario('hanh')!;
const initial = gameReducer(EMPTY_GAME_STATE, { type: 'START', characterId: 'hanh', runId: 'intent-test' });
const state = { ...initial, triggeredEventIds: ['hanh-event-pharmacy'] };
const arrangement = (text: string) => findPaymentArrangement({state, scenario,
  threadId: 'hanh-pharmacy', agentId: 'service.minh-tam', text});
for (const text of ['kh hủy đơn', 'Tôi không bảo hủy đơn', 'Tôi hỏi cách hủy đơn',
  'Hủy đơn được không?', 'Thanh toán khi nhận được không', 'Trả tiền mặt dc k'])
  assert.equal(arrangement(text), null, text);
assert.equal(arrangement('Hủy đơn giúp cô nhé')?.optionId, 'hanh-pharmacy-cancel');
assert.equal(arrangement('Cô trả tiền mặt khi nhận thuốc')?.optionId, 'hanh-pharmacy-cash-on-delivery');
const group = scenario.threads.find(t => t.isGroup)!;
for (const text of ['An ơi, Bảo nhắn gì vậy?', 'Bảo nhắn gì vậy An ơi?'])
  assert.equal(selectNpcAgent(scenario, group, text, state).agentId, 'family.an');
for (const [text, warned] of [['Bà thích ăn đậu giả thịt', false], ['Cả nhà cảnh giác lừa đảo nhé', true]] as const) {
  const next = gameReducer(initial, {type: 'SEND_MESSAGE', threadId: group.id, text, time: '18:36', turnId: text});
  assert.equal(next.familyWarned, warned);
}
const reply = Array(80).fill('xin chào').join(' ');
assert.equal(parseFirebaseNpcResult(JSON.stringify({reply, move: 'answer', factIdsUsed: []})).reply, reply);
console.log('Chat intent regressions passed.');
