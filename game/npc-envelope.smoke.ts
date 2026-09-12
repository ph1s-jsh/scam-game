import assert from 'node:assert/strict';
import { npcResponseEnvelopeError } from './npc-director';
import type { NpcDirectorPlan } from './types';

const plan: NpcDirectorPlan = {
  baseRevision: 'test', move: 'answer', factCatalog: [], requiredFactIds: [],
  requiredCriticalValues: [], allowedCriticalValues: [], allowedSensitiveTopics: [],
  mayClaimPaymentCompleted: false, recentNpcReplies: [], interactionMode: 'persistent',
  sceneContracts: [],
};
for (const reply of [
  'Dạ, con hiểu rồi bà. Hiện con cũng chưa có tiền để trả giúp bà.',
  'Ngày mai con về con gửi lại bà ngay ạ.',
  'Bà chưa tiện thì cứ để đó nhé con.',
  'Em hiểu rồi. Đơn vẫn đang chờ xác nhận ạ.',
  'Chị đang hỏi chuyện gì vậy?',
]) assert.equal(npcResponseEnvelopeError({ plan, reply, move: 'answer', factIdsUsed: [] }), null);
const settlement = { ...plan, settlementMethod: 'cancel-order' as const,
  requiredFactIds: ['approved'], factCatalog: [{ id: 'approved', text: 'Approved cancellation' }] };
assert.ok(npcResponseEnvelopeError({ plan: settlement, reply: 'Được ạ.', move: 'answer', factIdsUsed: [] }));
assert.ok(npcResponseEnvelopeError({ plan: settlement, reply: '', move: 'silent', factIdsUsed: [] }));
assert.equal(npcResponseEnvelopeError({ plan: settlement, reply: 'Em xác nhận rồi ạ.', move: 'confirm', factIdsUsed: ['approved'] }), null);
console.log('NPC envelope checks passed: free wording, structured settlement authorization.');
