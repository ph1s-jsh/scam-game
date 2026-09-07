import { EMPTY_GAME_STATE } from './engine';
import { agentIdsForThread } from './npc-agents';
import type { CharacterId, GameState, PendingNpcTurn } from './types';
import { getScenario } from './scenarios';

const STORAGE_KEY = 'three-screens:session:v3';
const LEGACY_STORAGE_KEY = 'three-screens:session:v2';
const characterIds = new Set<CharacterId>(['hanh', 'an', 'bao']);

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

function restoreConfiguredMessageLinks(state: GameState) {
  const scenario = getScenario(state.characterId);
  if (!scenario) return state;
  let messages = state.messages;

  for (const event of scenario.scheduledEvents) {
    if (!event.threadId || !event.message?.browserLink) continue;
    const threadMessages = messages[event.threadId];
    if (!threadMessages) continue;
    const scheduledMessageId = `${event.id}-message`;
    let changed = false;
    const restoredThread = threadMessages.map((message) => {
      if (message.id !== scheduledMessageId || message.browserLink)
        return message;
      changed = true;
      return { ...message, browserLink: event.message?.browserLink };
    });
    if (!changed) continue;
    if (messages === state.messages) messages = { ...messages };
    messages[event.threadId] = restoredThread;
  }

  return messages === state.messages ? state : { ...state, messages };
}

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
    (pending.replanCount === undefined ||
      (Number.isInteger(pending.replanCount) && pending.replanCount >= 0)) &&
    (pending.settlementOnReply === undefined ||
      (typeof pending.settlementOnReply === 'object' &&
        pending.settlementOnReply !== null &&
        typeof pending.settlementOnReply.requestId === 'string' &&
        Boolean(pending.settlementOnReply.requestId) &&
        typeof pending.settlementOnReply.optionId === 'string' &&
        Boolean(pending.settlementOnReply.optionId))) &&
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
    const requestArrangementOptionIds =
      typeof parsed.requestArrangementOptionIds === 'object' &&
      parsed.requestArrangementOptionIds !== null &&
      !Array.isArray(parsed.requestArrangementOptionIds)
        ? Object.fromEntries(
            Object.entries(parsed.requestArrangementOptionIds).filter(
              (entry): entry is [string, string] =>
                Boolean(entry[0]) &&
                typeof entry[1] === 'string' &&
                Boolean(entry[1]),
            ),
          )
        : {};
    const scenario = getScenario(parsed.characterId ?? null);
    const allowedAgentIds = new Set(
      scenario?.threads.flatMap((thread) =>
        agentIdsForThread(scenario, thread),
      ) ?? [],
    );
    const allowedFactIds = new Set(
      scenario?.facts
        .filter((fact) => parsed.discoveredFactIds?.includes(fact.id))
        .map((fact) => fact.id) ?? [],
    );
    const npcKnownFactIds =
      typeof parsed.npcKnownFactIds === 'object' &&
      parsed.npcKnownFactIds !== null &&
      !Array.isArray(parsed.npcKnownFactIds)
        ? Object.fromEntries(
            Object.entries(parsed.npcKnownFactIds).flatMap(
              ([agentId, factIds]) =>
                allowedAgentIds.has(agentId) && isStringArray(factIds)
                  ? [
                      [
                        agentId,
                        [
                          ...new Set(
                            factIds.filter((factId) =>
                              allowedFactIds.has(factId),
                            ),
                          ),
                        ],
                      ],
                    ]
                  : [],
            ),
          )
        : {};
    const restored = {
      ...EMPTY_GAME_STATE,
      ...parsed,
      saveVersion: 3,
      focusedBrowserCardId:
        typeof parsed.focusedBrowserCardId === 'string'
          ? parsed.focusedBrowserCardId
          : null,
      requestArrangementOptionIds,
      npcKnownFactIds,
      pendingNpcTurns:
        parsed.saveVersion === 3 && Array.isArray(parsed.pendingNpcTurns)
          ? parsed.pendingNpcTurns
              .filter((pending) => isValidPendingTurn(pending, parsed))
              .map((pending) => ({
                ...pending,
                directorPlan: undefined,
                replanCount: 0,
              }))
          : [],
    } as GameState;
    return restoreConfiguredMessageLinks(restored);
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
