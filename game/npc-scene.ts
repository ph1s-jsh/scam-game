import type {
  GameState,
  NpcSceneContract,
  PendingNpcTurn,
  ScenarioDefinition,
} from './types';

export function npcSceneContracts(
  state: GameState,
  scenario: ScenarioDefinition,
  pending: PendingNpcTurn,
): NpcSceneContract[] {
  return scenario.paymentRequests.flatMap<NpcSceneContract>((request) => {
    const policy = request.dialoguePolicy;
    if (
      !policy ||
      !policy.agentIds.includes(pending.agentId) ||
      !policy.threadIds.includes(pending.threadId)
    ) {
      if (request.sourceThreadId !== pending.threadId) return [];
      return [
        {
          requestId: request.id,
          status: state.requestStatus[request.id] ?? 'pending',
          goal: request.title,
          limits: [],
          routes: (request.alternatives ?? []).map((option) => option.label),
          forbiddenActs: [],
        },
      ];
    }
    return [
      {
        requestId: request.id,
        status: state.requestStatus[request.id] ?? 'pending',
        ...policy,
      },
    ];
  });
}

// Only guard consequential commitments. Ordinary phrasing remains the model's job.
export function sceneContractViolation(
  reply: string,
  contracts: NpcSceneContract[] = [],
): string | null {
  const text = reply
    .toLocaleLowerCase('vi')
    // Preserve distinct meanings before stripping Vietnamese diacritics.
    .replace(/\bmuốn(?=\s)/g, 'mong-muon')
    .replace(/\bnhớ(?=\s)/g, 'ghi-nho')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
  const clauses = text
    .replace(
      /\b(?:muon|nho|bao|de nghi)\s+(?:con|chau|an)\b/g,
      'mong nguoi-than',
    )
    .split(/[.!?;,\n]+|\b(?:va|nhung|roi)\b/)
    .map((clause) => clause.trim());
  for (const contract of contracts) {
    if (contract.forbiddenActs.includes('npc-funds-current-order')) {
      const claimsNpcPays = clauses.some(
        (clause) =>
          /\b(?:con|chau|an)\s+(?:(?:se|tu|co the|van|xin|cung|di|kiem tra roi)\s+){0,3}(?:chuyen|thanh toan|tra|ung|gui|xoay|vay|muon)\b/.test(
            clause,
          ) &&
          // Tomorrow must describe reimbursement, not "chuyển ngay rồi mai tính".
          !(
            /\b(?:mai|ngay mai)\b/.test(clause) &&
            /\b(?:tra|gui|chuyen|hoan)\b/.test(clause) &&
            /\b(?:lai|cho ba|ba)\b/.test(clause) &&
            !/\b(?:ngay|bay gio|truoc|ung|xoay|vay|muon)\b/.test(
              clause.replace(/ngay mai/g, 'mai'),
            )
          ),
      );
      const claimsAvailableFunds =
        /\b(?:con|chau|an)\s+(?:van\s+|da\s+)?co\s+(?:du\s+)?tien\b/.test(text);
      if (claimsNpcPays || claimsAvailableFunds)
        return 'NPC không có tiền ứng đơn hiện tại. Không được hứa chuyển, gửi, trả hoặc xoay tiền ngay. Chỉ có thể hẹn hoàn lại vào ngày mai.';
    }
    if (
      contract.forbiddenActs.includes('invent-offscreen-action') &&
      clauses.some((clause) =>
        /\b(?:con|chau|an|minh|toi)\s+(?:(?:se|dang|da|vua|co the|tu|xin)\s+)*(?:tim|xoay|vay|muon|nho|lien he|goi|huy)\b/.test(
          clause,
        ),
      )
    )
      return 'Không có hành động hậu trường này. Giải thích giới hạn và đưa người chơi tới phương án đang có; không hứa tìm tiền, gọi hộ hoặc hủy hộ.';
    if (
      contract.status === 'cancelled' &&
      clauses.some(
        (clause) =>
          /\b(?:thanh toan|chuyen giup|tra tien|nhan thuoc)\b/.test(clause) &&
          !/\b(?:khong|chua|dung)\s+(?:(?:can|phai|nen|tiep tuc)\s+){0,3}(?:thanh toan|chuyen|tra|nhan)\b/.test(
            clause,
          ),
      )
    )
      return 'Đơn đã hủy. Không tiếp tục đòi thanh toán hay nhận đơn này.';
  }
  return null;
}
