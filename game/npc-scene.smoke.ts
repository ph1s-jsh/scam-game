import assert from 'node:assert/strict';
import { sceneContractViolation } from './npc-scene';
import type { NpcSceneContract } from './types';

const contract: NpcSceneContract = {
  requestId: 'hanh-pay-pharmacy', speakerId: 'family.an',
  paymentChannel: 'transfer', status: 'pending', goal: 'Thanh toán thuốc',
  limits: [], routes: [], forbiddenActs: ['npc-funds-current-order'],
};
for (const reply of [
  'Ngày mai con về con gửi lại bà ngay ạ.',
  'Mai con sẽ hoàn lại cho bà.',
  'Hôm nay con không có tiền. Ngày mai con gửi lại bà ngay.',
]) assert.equal(sceneContractViolation(reply, [contract]), null, reply);
for (const reply of [
  'Con chuyển ngay cho bà, mai tính.',
  'Con chuyển ngay cho bà ngày mai.',
  'Ngày mai con trả bà nhưng hôm nay con tự thanh toán trước.',
  'Con có tiền, con thanh toán ngay.',
]) assert.ok(sceneContractViolation(reply, [contract]), reply);
assert.ok(sceneContractViolation('Ngày mai con gửi lại bà ngay.', [
  { ...contract, requestId: 'another-order' },
]));
console.log('NPC scene timing regression checks passed');
