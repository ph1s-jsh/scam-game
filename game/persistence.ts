import { EMPTY_GAME_STATE } from './engine';
import type { CharacterId, GameState, PendingNpcTurn } from './types';

const STORAGE_KEY = 'three-screens:session:v3';
const LEGACY_STORAGE_KEY = 'three-screens:session:v2';
const characterIds = new Set<CharacterId>(['hanh', 'an', 'bao']);

function isValidPendingTurn(
  pending: PendingNpcTurn,
  parsed: Omit<Partial<GameState>, 'saveVersion'> & { saveVersion?: number },
) {
  const sourceMessages =
    typeof pending.threadId === 'string'
      ? parsed.messages?.[pending.threadId]
      : undefined;
  return Boolean(
    typeof pending.id === 'string' &&
    pending.id &&
    typeof pending.runId === 'string' &&
    pending.runId === parsed.runId &&
    typeof pending.threadId === 'string' &&
    pending.threadId &&
    typeof pending.agentId === 'string' &&
    pending.agentId &&
    typeof pending.memoryScopeId === 'string' &&
    pending.memoryScopeId &&
    typeof pending.senderLabel === 'string' &&
    pending.senderLabel &&
    typeof pending.playerMessageId === 'string' &&
    pending.playerMessageId &&
    typeof pending.delayMs === 'number' &&
    Number.isFinite(pending.delayMs) &&
    pending.delayMs >= 0 &&
    (pending.responseKind === 'ai' || pending.responseKind === 'local') &&
    (pending.responseKind !== 'local' ||
      (typeof pending.localReply === 'string' && pending.localReply.trim())) &&
    (pending.responseGuidance === undefined ||
      typeof pending.responseGuidance === 'string') &&
    Array.isArray(sourceMessages) &&
    sourceMessages.some(
      (message) =>
        message.id === pending.playerMessageId && message.author === 'player',
    ),
  );
}

export function loadGameState(): GameState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw =
      window.localStorage.getItem(STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Omit<
      Partial<GameState>,
      'saveVersion'
    > & {
      saveVersion?: number;
    };
    if (parsed.saveVersion !== 2 && parsed.saveVersion !== 3) return null;
    if (
      parsed.characterId !== null &&
      !characterIds.has(parsed.characterId as CharacterId)
    )
      return null;
    if (
      !parsed.runId ||
      !parsed.screen ||
      !parsed.messages ||
      !parsed.requestStatus
    )
      return null;
    const restored = {
      ...EMPTY_GAME_STATE,
      ...parsed,
      saveVersion: 3,
      pendingNpcTurns:
        parsed.saveVersion === 3 && Array.isArray(parsed.pendingNpcTurns)
          ? parsed.pendingNpcTurns.filter((pending) =>
              isValidPendingTurn(pending, parsed),
            )
          : [],
    } as GameState;
    return restored;
  } catch {
    return null;
  }
}

export function saveGameState(state: GameState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in privacy modes. The current session still works.
  }
}

export function clearGameState() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Nothing else to clear.
  }
}
