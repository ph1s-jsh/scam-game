import assert from 'node:assert/strict';
import { generateCheckedNpcReply, NpcFormatError } from './npc-generation';

let calls = 0;
const repaired = await generateCheckedNpcReply(
  async (repair) => {
    calls++;
    if (calls === 1) return { reply: 'impossible' };
    assert.equal(repair?.reason, 'cannot pay today');
    assert.equal(repair?.rejectedReply, 'impossible');
    return { reply: 'tomorrow' };
  },
  (value) => (value.reply === 'impossible' ? 'cannot pay today' : null),
);
assert.equal(calls, 2);
assert.equal(repaired.reply, 'tomorrow');
calls = 0;
await assert.rejects(
  generateCheckedNpcReply(
    async () => {
      calls++;
      throw new NpcFormatError('schema');
    },
    () => null,
  ),
  /schema/,
);
assert.equal(calls, 2);

let release!: (value: { reply: string }) => void;
calls = 0;
const late = generateCheckedNpcReply(
  () => {
    calls++;
    return new Promise<{ reply: string }>((resolve) => {
      release = resolve;
    });
  },
  () => 'bad',
  15,
);
await assert.rejects(late, /deadline/);
release({ reply: 'late' });
await new Promise((resolve) => setTimeout(resolve, 10));
assert.equal(calls, 1);

let current = true;
calls = 0;
await assert.rejects(
  generateCheckedNpcReply(
    async () => {
      calls++;
      current = false;
      return { reply: 'obsolete' };
    },
    () => 'bad',
    100,
    () => current,
  ),
  /superseded/,
);
assert.equal(calls, 1);
console.log(
  'NPC generation tests passed: reasoned repair, max attempts, whole-operation deadline and supersession.',
);
