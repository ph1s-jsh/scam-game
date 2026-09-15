import assert from 'node:assert/strict';
import { EMPTY_GAME_STATE, gameReducer, storyCanEnd, advanceStory } from './engine';
import { getScenario } from './scenarios';
for (const characterId of ['hanh','an','bao'] as const) {
  const scenario = getScenario(characterId)!;
  const initial = gameReducer(EMPTY_GAME_STATE,{type:'START',characterId,runId:characterId});
  assert.equal(storyCanEnd(initial,scenario),false);
  assert.equal(advanceStory(initial,scenario,20).elapsedMinutes,0);
  assert.equal(gameReducer(initial,{type:'CLOCK_MINUTE',runId:'obsolete'}),initial);
  const lastMinute = {...initial,elapsedMinutes:22*60-scenario.startMinutes-1};
  const end = gameReducer(lastMinute,{type:'CLOCK_MINUTE',runId:initial.runId});
  assert.equal(end.screen,'debrief');
  assert.equal(end.elapsedMinutes,22*60-scenario.startMinutes);
  assert.equal(end.debrief?.outcome,'safe');
  assert.equal(gameReducer(end,{type:'CLOCK_MINUTE',runId:end.runId}),end);
  const busy = {...lastMinute,pendingNpcTurns:[{id:'busy'} as any]};
  assert.equal(gameReducer(busy,{type:'CLOCK_MINUTE',runId:busy.runId}),busy);
}
console.log('Evening clock tests passed for all three roles.');
