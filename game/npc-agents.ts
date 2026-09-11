import type {
  CharacterId,
  GameState,
  ScenarioDefinition,
  ThreadDefinition,
} from './types';

type AgentBinding = {
  agentId: string;
  memoryKey: string;
  name: string;
};

export type NpcAgentProfile = AgentBinding & {
  roleBrief: string;
  allowedFacts: string[];
  forbiddenClaims: string[];
  voiceExamples: string[];
  aliases: string[];
};

export type NpcMemoryTurn = {
  from: 'player' | 'npc';
  text: string;
  senderLabel?: string;
  channelLabel: string;
  isRecovery?: boolean;
};

const THREAD_AGENTS: Record<CharacterId, Record<string, AgentBinding>> = {
  hanh: {
    'hanh-an-real': {
      agentId: 'family.an',
      memoryKey: 'family.an',
      name: 'An',
    },
    'hanh-an-new': {
      agentId: 'fraud.fake-an-number',
      memoryKey: 'incident.fake-an-number',
      name: 'An · số mới',
    },
    'hanh-bao-social': {
      agentId: 'fraud.bao-account-takeover',
      memoryKey: 'incident.bao-account-takeover',
      name: 'Bảo',
    },
    'hanh-pharmacy': {
      agentId: 'service.minh-tam',
      memoryKey: 'order.MH-203',
      name: 'Nhà thuốc Minh Tâm',
    },
  },
  an: {
    'an-hanh': {
      agentId: 'family.hanh',
      memoryKey: 'family.hanh',
      name: 'Bà Hạnh',
    },
    'an-bao-social': {
      agentId: 'fraud.bao-account-takeover',
      memoryKey: 'incident.bao-account-takeover',
      name: 'Bảo',
    },
    'an-recruiter': {
      agentId: 'fraud.recruiter-vy',
      memoryKey: 'incident.recruiter-vy',
      name: 'Chị Vy',
    },
    'an-provider': {
      agentId: 'service.mang-nha-minh',
      memoryKey: 'invoice.P203-08',
      name: 'Mạng Nhà Mình',
    },
  },
  bao: {
    'bao-hanh': {
      agentId: 'family.hanh',
      memoryKey: 'family.hanh',
      name: 'Bà Hạnh',
    },
    'bao-an-social': {
      agentId: 'fraud.an-account-takeover',
      memoryKey: 'incident.an-account-takeover',
      name: 'An',
    },
    'bao-fake-support': {
      agentId: 'fraud.fake-arena-support',
      memoryKey: 'incident.fake-arena-support',
      name: 'Hỗ trợ Arena Star',
    },
    'bao-game-official': {
      agentId: 'service.arena-star',
      memoryKey: 'service.arena-star',
      name: 'Arena Star',
    },
    'bao-an-sms': {
      agentId: 'family.an',
      memoryKey: 'family.an',
      name: 'An',
    },
  },
};

const GROUP_AGENTS: Record<CharacterId, NpcAgentProfile[]> = {
  hanh: [
    {
      agentId: 'family.an',
      memoryKey: 'family.an',
      name: 'An',
      aliases: ['an', 'chị an'],
      roleBrief:
        'Bạn là An, cháu gái 20 tuổi của Bà Hạnh, đang nhắn trong nhóm gia đình. Bạn học đến 20 giờ và nói với bà bằng giọng ấm áp, lễ phép.',
      allowedFacts: [
        'An đang học đến 20 giờ.',
        'Bảo học bù và về muộn.',
        'Cả nhà biết có đơn thuốc huyết áp giao tối nay.',
        'An chưa có tiền để thanh toán hoặc ứng hộ đơn MH-203 hôm nay. An chỉ có thể hoàn lại tiền cho bà vào ngày mai.',
        'Bà Hạnh có thể chọn trả 186.000đ tiền mặt khi nhận đúng túi thuốc.',
        'Chỉ bàn hủy nếu bà chủ động hỏi hoặc yêu cầu hủy. Không tự đề nghị hủy vì bà nói không có tiền. An không tự vay, xoay tiền hoặc gọi hộ.',
      ],
      forbiddenClaims: ['Không quyết định hộ Bà Hạnh hoặc Bảo.'],
      voiceExamples: [
        'Dạ con vẫn đang ở lớp, bà ăn cơm trước nha.',
        'Bà cứ từ từ kiểm tra, cần thì gọi con nhé.',
      ],
    },
    {
      agentId: 'family.bao',
      memoryKey: 'family.bao',
      name: 'Bảo',
      aliases: ['bảo', 'cháu bảo'],
      roleBrief:
        'Bạn là Bảo, cháu trai 14 tuổi của Bà Hạnh, đang nhắn trong nhóm gia đình. Bạn nói tự nhiên như học sinh và lễ phép với bà.',
      allowedFacts: [
        'Bảo học bù và về muộn.',
        'An đang học đến 20 giờ.',
        'Cả nhà biết có đơn thuốc huyết áp giao tối nay.',
      ],
      forbiddenClaims: ['Không quyết định hộ Bà Hạnh hoặc An.'],
      voiceExamples: [
        'Dạ con biết rồi bà, lát con về ạ.',
        'Bà chờ chị An xác nhận thêm cho chắc nha.',
      ],
    },
  ],
  an: [
    {
      agentId: 'family.hanh',
      memoryKey: 'family.hanh',
      name: 'Bà Hạnh',
      aliases: ['bà', 'bà hạnh', 'ngoại'],
      roleBrief:
        'Bạn là Bà Hạnh, bà ngoại 62 tuổi của An, đang nhắn trong nhóm gia đình. Bạn nói ngắn, ấm áp và thực tế.',
      allowedFacts: [
        'Bà Hạnh đang ở nhà.',
        'Cả nhà chờ An về ăn tối.',
        'Bảo có thể bị đăng xuất khỏi tài khoản mạng xã hội.',
        'Bà chưa có tiền khả dụng trả cước hiện tại nên nhờ An, không tự đi đóng, ứng tiền hoặc hứa vay hộ.',
      ],
      forbiddenClaims: ['Không quyết định hộ An hoặc Bảo.'],
      voiceExamples: [
        'Cơm bà để phần trong bếp nha con.',
        'Không chắc thì về nhà bà cháu mình xem lại cũng được.',
      ],
    },
    {
      agentId: 'family.bao',
      memoryKey: 'family.bao',
      name: 'Bảo',
      aliases: ['bảo', 'em bảo'],
      roleBrief:
        'Bạn là Bảo, em trai 14 tuổi của An, đang nhắn trong nhóm gia đình. Bạn nói tự nhiên, hơi tinh nghịch nhưng biết nghe lời.',
      allowedFacts: [
        'Cả nhà chờ An về ăn tối.',
        'Bảo cần một cây bút đen.',
        'Bảo có thể bị đăng xuất khỏi tài khoản mạng xã hội.',
      ],
      forbiddenClaims: ['Không quyết định hộ An hoặc Bà Hạnh.'],
      voiceExamples: [
        'Chị về nhớ mua giúp em cây bút đen nha.',
        'Em biết rồi, có gì em báo cả nhà.',
      ],
    },
  ],
  bao: [
    {
      agentId: 'family.an',
      memoryKey: 'family.an',
      name: 'An',
      aliases: ['an', 'chị', 'chị an'],
      roleBrief:
        'Bạn là An, chị gái 20 tuổi của Bảo, đang nhắn trong nhóm gia đình. Bạn nói quan tâm nhưng không lên giọng dạy đời.',
      allowedFacts: [
        'An học đến 20 giờ.',
        'Bà Hạnh đang ở nhà.',
        'Bảo vừa tan học.',
      ],
      forbiddenClaims: ['Không quyết định hộ Bảo hoặc Bà Hạnh.'],
      voiceExamples: [
        'Chị học tới 8 giờ, hai bà cháu ăn trước nha.',
        'Em cứ chờ chị gọi lại rồi mình kiểm tra cho chắc.',
      ],
    },
    {
      agentId: 'family.hanh',
      memoryKey: 'family.hanh',
      name: 'Bà Hạnh',
      aliases: ['bà', 'bà hạnh', 'ngoại'],
      roleBrief:
        'Bạn là Bà Hạnh, bà ngoại 62 tuổi của Bảo, đang nhắn trong nhóm gia đình. Bạn nói hiền, gần gũi và ngắn gọn.',
      allowedFacts: [
        'Bà Hạnh đang ở nhà.',
        'An học đến 20 giờ.',
        'Bảo vừa tan học.',
      ],
      forbiddenClaims: ['Không quyết định hộ Bảo hoặc An.'],
      voiceExamples: [
        'Bảo về nhớ mua giúp bà bó rau nha con.',
        'Không vội đâu con, về nhà rồi bà cháu mình xem.',
      ],
    },
  ],
};

function words(value: string) {
  return value.toLocaleLowerCase('vi').match(/[\p{L}\p{N}]+/gu) ?? [];
}

function groupAgentsForThread(
  scenario: ScenarioDefinition,
  thread: ThreadDefinition,
) {
  return thread.isGroup ? GROUP_AGENTS[scenario.id] : [];
}

function threadBinding(
  scenario: ScenarioDefinition,
  thread: ThreadDefinition,
): AgentBinding {
  return (
    THREAD_AGENTS[scenario.id][thread.id] ?? {
      agentId: `${scenario.id}.${thread.id}`,
      memoryKey: `thread.${thread.id}`,
      name: thread.participantLabel ?? thread.title,
    }
  );
}

export function selectNpcAgent(
  scenario: ScenarioDefinition,
  thread: ThreadDefinition,
  latestMessage: string,
  state?: GameState,
): NpcAgentProfile {
  const groupAgents = groupAgentsForThread(scenario, thread);
  if (groupAgents.length) {
    const messageWords = words(latestMessage);
    const addressed = groupAgents
      .flatMap((agent, agentOrder) =>
        agent.aliases.flatMap((alias) => {
          const aliasWords = words(alias);
          const index = messageWords.findIndex((_, wordIndex) =>
            aliasWords.every(
              (word, offset) => messageWords[wordIndex + offset] === word,
            ),
          );
          return index < 0 ? [] : [{ agent, index, agentOrder }];
        }),
      )
      .sort(
        (left, right) =>
          left.index - right.index || left.agentOrder - right.agentOrder,
      )[0]?.agent;
    if (addressed) return addressed;

    const lastNpcAgentId = [...(state?.messages[thread.id] ?? [])]
      .reverse()
      .find((message) => message.author === 'npc' && message.agentId)?.agentId;
    return (
      groupAgents.find((agent) => agent.agentId === lastNpcAgentId) ??
      groupAgents[0]
    );
  }

  const binding = threadBinding(scenario, thread);
  return {
    ...binding,
    aliases: [binding.name],
    roleBrief: thread.roleBrief,
    allowedFacts: thread.allowedFacts,
    forbiddenClaims: thread.forbiddenClaims,
    // Fallbacks are recovery copy, not style examples. Feeding them back to
    // Gemini made a failed canned line increasingly likely to be repeated.
    voiceExamples: [],
  };
}

export function getNpcAgent(
  scenario: ScenarioDefinition,
  thread: ThreadDefinition,
  agentId: string,
) {
  const groupAgent = groupAgentsForThread(scenario, thread).find(
    (agent) => agent.agentId === agentId,
  );
  if (groupAgent) return groupAgent;
  const fallback = selectNpcAgent(scenario, thread, '');
  return fallback.agentId === agentId ? fallback : null;
}

export function threadSupportsAgent(
  scenario: ScenarioDefinition,
  thread: ThreadDefinition,
  agentId: string,
) {
  if (thread.isGroup)
    return groupAgentsForThread(scenario, thread).some(
      (agent) => agent.agentId === agentId,
    );
  return threadBinding(scenario, thread).agentId === agentId;
}

export function agentIdsForThread(
  scenario: ScenarioDefinition,
  thread: ThreadDefinition,
) {
  const groupAgents = groupAgentsForThread(scenario, thread);
  return groupAgents.length
    ? groupAgents.map((agent) => agent.agentId)
    : [threadBinding(scenario, thread).agentId];
}

function messageMinute(time: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

export function collectNpcMemory(
  state: GameState,
  scenario: ScenarioDefinition,
  agentId: string,
  currentThreadId: string,
  latestMessageId: string,
): NpcMemoryTurn[] {
  const turns = scenario.threads
    .filter((thread) => threadSupportsAgent(scenario, thread, agentId))
    .flatMap((thread, threadIndex) =>
      (state.messages[thread.id] ?? [])
        .filter(
          (message) =>
            message.author !== 'system' &&
            !message.npcIgnored &&
            message.id !== latestMessageId,
        )
        .map((message, messageIndex) => ({
          from:
            message.author === 'player'
              ? ('player' as const)
              : ('npc' as const),
          text: message.text,
          senderLabel:
            message.author === 'npc'
              ? (message.senderLabel ?? threadBinding(scenario, thread).name)
              : undefined,
          channelLabel: thread.title,
          isRecovery: message.responseMode === 'fallback',
          minute: messageMinute(message.time),
          current: thread.id === currentThreadId ? 1 : 0,
          stableOrder:
            message.sequence ?? -1_000_000 + threadIndex * 1000 + messageIndex,
        })),
    )
    .sort(
      (left, right) =>
        left.minute - right.minute || left.stableOrder - right.stableOrder,
    );

  const currentTurns = turns.filter((turn) => turn.current);
  const otherTurns = turns.filter((turn) => !turn.current);
  return [...otherTurns.slice(-4), ...currentTurns.slice(-14)]
    .sort(
      (left, right) =>
        left.stableOrder - right.stableOrder || left.minute - right.minute,
    )
    .map(({ from, text, senderLabel, channelLabel, isRecovery }) => ({
      from,
      text,
      senderLabel,
      channelLabel,
      isRecovery,
    }));
}
