import { EMPTY_GAME_STATE } from './engine';
import type { CharacterId, GameState } from './types';

const STORAGE_KEY = 'three-screens:session:v2';
const characterIds = new Set<CharacterId>(['hanh', 'an', 'bao']);

export function loadGameState(): GameState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GameState>;
    if (parsed.saveVersion !== 2) return null;
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
    const restored = { ...EMPTY_GAME_STATE, ...parsed } as GameState;
    if (
      restored.pendingNpcTurn &&
      (!restored.pendingNpcTurn.agentId ||
        !restored.pendingNpcTurn.memoryScopeId ||
        !restored.pendingNpcTurn.senderLabel)
    )
      restored.pendingNpcTurn = null;
    return restored;
  } catch {
    return null;
  }
}

export function saveGameState(state: GameState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be unavailable in privacy modes. The current session still works.
  }
}

export function clearGameState() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing else to clear.
  }
}
