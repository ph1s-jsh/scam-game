import type {
  GameState,
  PaymentAlternative,
  PaymentRequest,
  PendingNpcTurn,
  RequestStatus,
  ScenarioDefinition,
} from './types';

function searchable(value: string) {
  return value
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function paymentRequestIsAvailable(
  request: PaymentRequest,
  state: GameState,
) {
  if (request.unlockAfter !== undefined && state.tick < request.unlockAfter)
    return false;
  if (
    request.unlockEventId &&
    !state.triggeredEventIds.includes(request.unlockEventId)
  )
    return false;
  if (request.unlockRisk && !state.riskFlags.includes(request.unlockRisk))
    return false;
  return true;
}

function explicitlyRejectsCash(value: string) {
  return (
    /\b(khong|dung|chang|chua)\b(?:\s+(?:co|muon|can|nen|duoc|the|tu|minh|phai)){0,4}\s+\b(tra|dua|dong|nop|dung|thanh toan)\b(?:\s+[a-z0-9]+){0,3}\s+\b(tien mat|cod)\b/.test(
      value,
    ) || /\b(khong can|khong muon|bo qua)\s+(tien mat|cod)\b/.test(value)
  );
}

function matchesCashPayment(value: string) {
  const mentionsCash =
    /\b(tien mat|cod|khi nhan|luc nhan|nhan hang|nhan thuoc|shipper|nguoi giao|diem thu|quay giao dich)\b/.test(
      value,
    );
  const choosesPayment =
    /\b(tra|dua|dong|nop|thanh toan|thu tien|mang tien)\b/.test(value);
  return mentionsCash && choosesPayment && !explicitlyRejectsCash(value);
}

function matchesTrustedContactCash(value: string) {
  if (explicitlyRejectsCash(value)) return false;
  const contactPays =
    /\b(an|con|chau)\b(?:\s+[a-z0-9]+){0,8}\s+\b(chuyen|chuyen khoan|thanh toan|dong|tra)\b/.test(
      value,
    ) ||
    /\b(chuyen|chuyen khoan|thanh toan|dong|tra)\b(?:\s+[a-z0-9]+){0,5}\s+\b(ho|giup)\b(?:\s+[a-z0-9]+){0,3}\s+\b(ba|co)\b/.test(
      value,
    );
  const cashReimbursement =
    /\b(ba|co)\b(?:\s+[a-z0-9]+){0,8}\s+\b(dua|gui|tra|hoan)\b(?:\s+[a-z0-9]+){0,4}\s+\b(tien mat|tien)\b/.test(
      value,
    ) ||
    /\b(tien mat)\b(?:\s+[a-z0-9]+){0,6}\s+\b(cho con|cho an|dua lai|tra lai|gui lai)\b/.test(
      value,
    );
  const rejectsContactPayment =
    /\b(an|con|chau)\b(?:\s+[a-z0-9]+){0,4}\s+\b(khong|dung|chang|chua)\b(?:\s+[a-z0-9]+){0,4}\s+\b(chuyen|chuyen khoan|thanh toan|dong|tra)\b/.test(
      value,
    ) ||
    /\b(khong|dung|chang|chua)\b(?:\s+(?:can|muon|de)){0,2}\s+\b(an|con|chau)\b(?:\s+[a-z0-9]+){0,4}\s+\b(chuyen|chuyen khoan|thanh toan|dong|tra)\b/.test(
      value,
    );
  return contactPays && cashReimbursement && !rejectsContactPayment;
}

function triggerMatches(option: PaymentAlternative, text: string) {
  const value = searchable(text);
  if (!value) return false;
  // Inspect the action clause, not unrelated reasons such as "không có tiền".
  if (option.trigger === 'cancel-order') {
    if (
      /[?？]/u.test(text) ||
      /\b(?:neu|gia su|duoc khong|dc k|co the|co nen)\b/.test(value) ||
      /\b(?:khong|ko|kh|k|chua)$/.test(value)
    )
      return false;
    return text.split(/[,.!;\n]+/).some((clause) => {
      const action = searchable(clause);
      return (
        /\b(?:huy don|huy giup|khong nhan don|khong nhan thuoc)\b/.test(
          action,
        ) &&
        !/\b(?:khong|chua|dung)\s+(?:(?:muon|can|nen|voi)\s+)*huy\b/.test(
          action,
        ) &&
        !/\b(?:chua|dung)\s+khong nhan\b/.test(action)
      );
    });
  }
  if (/\b(?:neu|gia su)\b/.test(value) || /[?？]/u.test(text)) return false;
  return option.trigger === 'trusted-contact-cash'
    ? matchesTrustedContactCash(value)
    : !matchesTrustedContactCash(value) && matchesCashPayment(value);
}

export function paymentAlternativeFor(
  scenario: ScenarioDefinition,
  requestId: string,
  optionId: string,
) {
  const request = scenario.paymentRequests.find(
    (candidate) => candidate.id === requestId,
  );
  const option = request?.alternatives?.find(
    (candidate) => candidate.id === optionId,
  );
  return request && option ? { request, option } : null;
}

export function requestIsHandled(status: RequestStatus | undefined) {
  return status === 'paid' || status === 'arranged' || status === 'cancelled';
}

export function selectedPaymentAlternative(
  state: GameState,
  scenario: ScenarioDefinition,
  requestId: string,
) {
  const optionId = state.requestArrangementOptionIds[requestId];
  return optionId
    ? (paymentAlternativeFor(scenario, requestId, optionId)?.option ?? null)
    : null;
}

export function findPaymentArrangement(input: {
  state: GameState;
  scenario: ScenarioDefinition;
  threadId: string;
  agentId: string;
  text: string;
}) {
  const { state, scenario, threadId, agentId, text } = input;
  for (const request of scenario.paymentRequests) {
    if (
      request.truth !== 'legit' ||
      !['pending', 'arranged'].includes(state.requestStatus[request.id])
    )
      continue;
    for (const option of request.alternatives ?? []) {
      if (
        option.threadIds.includes(threadId) &&
        option.agentIds.includes(agentId) &&
        (state.requestStatus[request.id] === 'pending' ||
          option.method === 'cancel-order') &&
        (option.method !== 'cancel-order' ||
          paymentRequestIsAvailable(request, state)) &&
        triggerMatches(option, text)
      )
        return { requestId: request.id, optionId: option.id };
    }
  }
  return null;
}

export function validatedPendingAlternative(
  state: GameState,
  scenario: ScenarioDefinition,
  pending: PendingNpcTurn,
): { request: PaymentRequest; option: PaymentAlternative } | null {
  const proposal = pending.settlementOnReply;
  if (!proposal) return null;
  const configured = paymentAlternativeFor(
    scenario,
    proposal.requestId,
    proposal.optionId,
  );
  const playerMessage = (state.messages[pending.threadId] ?? []).find(
    (message) => message.id === pending.playerMessageId,
  );
  if (
    !configured ||
    !playerMessage ||
    playerMessage.author !== 'player' ||
    configured.request.truth !== 'legit' ||
    (state.requestStatus[configured.request.id] !== 'pending' &&
      !(
        configured.option.method === 'cancel-order' &&
        state.requestStatus[configured.request.id] === 'arranged'
      )) ||
    !configured.option.threadIds.includes(pending.threadId) ||
    !configured.option.agentIds.includes(pending.agentId) ||
    !triggerMatches(configured.option, playerMessage.text)
  )
    return null;
  return configured;
}
