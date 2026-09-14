import assert from 'node:assert/strict';
import { EMPTY_GAME_STATE, gameReducer } from './engine';

const initial = gameReducer(EMPTY_GAME_STATE, {type:'START', characterId:'hanh', runId:'confirm-test'});
const base = {...initial, triggeredEventIds:['hanh-event-pharmacy'], messages:{...initial.messages,
  'hanh-pharmacy':[{id:'seed', author:'npc' as const, text:'Đơn MH-203 đang giao.', time:'18:39'}]}};
const sent = gameReducer(base, {type:'SEND_MESSAGE',threadId:'hanh-pharmacy',text:'Hủy đơn giúp cô',time:'18:40',turnId:'proposal'});
assert.equal(sent.requestStatus['hanh-pay-pharmacy'], 'pending');
assert.equal(sent.pendingNpcTurns[0].settlementOnReply, undefined);
assert.equal(sent.arrangementProposals?.length, 1);
const pending = sent.pendingNpcTurns[0];
const replied = gameReducer(sent, {type:'NPC_REPLY',runId:sent.runId,turnId:pending.id,threadId:pending.threadId,
  text:'Đã hủy rồi ạ.',time:'18:40',mode:'ai',move:'answer',factIdsUsed:[],baseRevision:pending.directorPlan!.baseRevision});
assert.equal(replied.requestStatus['hanh-pay-pharmacy'], 'pending');
const confirm = {type:'CONFIRM_ARRANGEMENT' as const, proposalId:'proposal',runId:sent.runId};
const confirmed = gameReducer(replied, confirm);
assert.equal(confirmed.requestStatus['hanh-pay-pharmacy'], 'cancelled');
assert.equal(gameReducer(confirmed, confirm), confirmed);
assert.equal(gameReducer(sent,{...confirm,runId:'old'}),sent);
const dismissed = gameReducer(sent,{...confirm,type:'DISMISS_ARRANGEMENT'});
assert.equal(dismissed.requestStatus['hanh-pay-pharmacy'],'pending');
assert.equal(dismissed.arrangementProposals?.length,0);
const changed = gameReducer(sent,{type:'SEND_MESSAGE',threadId:'hanh-pharmacy',text:'Thôi đừng hủy',time:'18:40',turnId:'changed'});
assert.equal(gameReducer(changed,confirm).requestStatus['hanh-pay-pharmacy'],'pending');
console.log('Explicit confirmation regressions passed.');
