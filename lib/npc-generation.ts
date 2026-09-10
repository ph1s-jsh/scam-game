export type NpcRepair = { reason: string; rejectedReply?: string };

export class NpcFormatError extends Error {}

// Includes model initialization and App Check, which the SDK fetch timeout omits.
export async function generateCheckedNpcReply<T extends { reply: string }>(
  generate: (repair?: NpcRepair) => Promise<T>,
  validate: (value: T) => string | null,
  timeoutMs = 22_000,
  isCurrent: () => boolean = () => true,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expired = false;
  const work = async () => {
    let repair: NpcRepair | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (expired) throw new Error('NPC reply deadline exceeded');
      if (!isCurrent()) throw new Error('NPC turn superseded');
      let value: T;
      try {
        value = await generate(repair);
      } catch (error) {
        if (!(error instanceof NpcFormatError) || attempt > 0) throw error;
        repair = { reason: error.message };
        continue;
      }
      if (expired) throw new Error('NPC reply deadline exceeded');
      if (!isCurrent()) throw new Error('NPC turn superseded');
      const reason = validate(value);
      if (!reason) return value;
      repair = { reason, rejectedReply: value.reply };
    }
    throw new Error(
      `NPC reply rejected: ${repair?.reason ?? 'invalid response'}`,
    );
  };
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          expired = true;
          reject(new Error('NPC reply deadline exceeded'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
