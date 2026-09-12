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
          paymentChannel: request.channel,
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
        paymentChannel: request.channel,
        speakerId: pending.agentId,
        cancellationDiscussed: (state.messages[pending.threadId] ?? []).some(
          (message) => message.author === 'player' &&
            /hủy|huỷ|huy don|boom|bom|không (?:muốn )?nhận|khong (?:muon )?nhan/iu.test(message.text),
        ),
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
    if (contract.paymentChannel === 'transfer' &&
      /\b(?:chi (?:nhan|tra|thanh toan)(?: bang)? tien mat|(?:nha thuoc|ho) khong (?:nhan|cho|chap nhan)(?: thanh toan)? chuyen khoan)\b/.test(text))
      return 'Yêu cầu này có hỗ trợ chuyển khoản. Không nói bên nhận chỉ nhận tiền mặt. NPC không có tiền không có nghĩa người chơi không được chuyển khoản.';
    if (contract.cancellationDiscussed === false && /\b(?:huy|boom|bom)\b/.test(text))
      return 'Người chơi chưa đề cập hủy đơn. Không tự chuyển cuộc trò chuyện sang hủy: hỏi họ chưa tiện trả, chưa biết thao tác hay còn lo ngại, rồi hỗ trợ đúng khả năng.';
    const isGrandmother = contract.speakerId === 'family.hanh';
    const ownClauses = isGrandmother
      ? clauses.map((clause) => clause
          .replace(/\b(?:con|chau|an)\b/g, 'nguoi-choi')
          .replace(/\bba\b/g, 'con'))
      : clauses;
    const canRepayTomorrow = contract.requestId === 'hanh-pay-pharmacy';
    if (contract.forbiddenActs.includes('npc-funds-current-order')) {
      const claimsNpcPays = ownClauses.some(
        (clause) =>
          /\b(?:con|chau|an)\s+(?:(?:se|tu|co the|van|xin|cung|di|kiem tra roi)\s+){0,3}(?:chuyen|thanh toan|tra|ung|gui|xoay|vay|muon|nap|dong|hoan)\b/.test(
            clause,
          ) &&
          // Tomorrow must describe reimbursement, not "chuyển ngay rồi mai tính".
          !(
            canRepayTomorrow &&
            /\b(?:mai|ngay mai)\b/.test(clause) &&
            /\b(?:tra|gui|chuyen|hoan)\b/.test(clause) &&
            /\b(?:lai|cho ba|ba)\b/.test(clause) &&
            !/\b(?:bay gio|hom nay|toi nay|truoc|ung|xoay|vay|muon)\b/.test(clause) &&
            // "Ngày mai con gửi lại bà ngay" is still tomorrow.
            // Only accept an emphatic "ngay" when tomorrow precedes the act.
            (!/\bngay\b/.test(clause.replace(/ngay mai/g, 'mai')) ||
              /\b(?:ngay mai|mai)\b.*\b(?:con|chau|an)\b.*\b(?:tra|gui|chuyen|hoan)\b/.test(clause))
          ),
      );
      const claimsAvailableFunds = ownClauses.some((clause) =>
        /\b(?:con|chau|an)\s+(?:van\s+|da\s+)?co\s+(?:du\s+)?tien\b/.test(
          clause,
        ),
      );
      if (claimsNpcPays || claimsAvailableFunds)
        return 'NPC không có tiền khả dụng trả khoản đang nhờ. Không tự trả, nạp, ứng, vay hay xoay tiền. Chỉ hẹn hoàn tiền nếu thời điểm đó có trong giới hạn của cảnh.';
    }
    if (
      contract.forbiddenActs.includes('invent-offscreen-action') &&
      (ownClauses.some((clause) =>
        /\b(?:con|chau|an|minh|toi)\s+(?:(?:se|dang|da|vua|co the|tu|xin)\s+)*(?:tim|xoay|vay|muon|nho|lien he|goi|huy)\b/.test(
          clause,
        ),
      ) || /\b(?:co mong-muon|can|de)\s+(?:con|chau|ba)\s+(?:goi|lien he|huy|vay|xoay)\b/.test(text))
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
