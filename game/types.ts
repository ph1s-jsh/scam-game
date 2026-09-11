export type CharacterId = 'hanh' | 'an' | 'bao';

export type PhoneAppId =
  | 'home'
  | 'messages'
  | 'calls'
  | 'bank'
  | 'browser'
  | 'notes';

export type ThreadTruth = 'legit' | 'scam' | 'compromised';

export type MessageAuthor = 'player' | 'npc' | 'system';

export type NpcReplyMode = 'ai' | 'fallback' | 'local';

export type NpcDirectorMove =
  | 'silent'
  | 'answer'
  | 'clarify'
  | 'acknowledge'
  | 'refuse'
  | 'confirm'
  | 'boundary';

export type MessageDeliveryStatus = 'sent' | 'delivered' | 'seen';

export type FactStrength = 'context' | 'strong';

export type RiskFlag =
  | 'money_sent_to_scam'
  | 'money_sent_to_compromised'
  | 'credentials_shared'
  | 'otp_shared';

export type EndingId =
  | 'family-safe'
  | 'recovered'
  | 'unfinished'
  | 'false-positive'
  | 'trusted-wrong';

export type RequestStatus =
  | 'pending'
  | 'paid'
  | 'arranged'
  | 'declined'
  | 'cancelled';

export type PaymentChannel = 'transfer' | 'bill' | 'topup';

export type PaymentAlternativeMethod =
  | 'cash-on-delivery'
  | 'cash-at-counter'
  | 'trusted-contact'
  | 'cancel-order';

export type StoryCondition =
  | { type: 'event'; eventId: string }
  | { type: 'thread-opened'; threadId: string }
  | { type: 'player-message'; threadId: string }
  | { type: 'offer-accepted'; threadId: string }
  | { type: 'browser-opened'; cardId: string }
  | { type: 'app-opened'; appId: PhoneAppId }
  | { type: 'risk'; risk: RiskFlag }
  | { type: 'thread-blocked'; threadId: string }
  | { type: 'thread-reported'; threadId: string }
  | { type: 'call'; callId: string }
  | {
      type: 'request-status';
      requestId: string;
      status: Exclude<RequestStatus, 'pending'>;
    };

export type MessageIntent =
  | 'identity'
  | 'verification'
  | 'delay'
  | 'money'
  | 'accusation'
  | 'help'
  | 'ordinary';

export interface CharacterProfile {
  id: CharacterId;
  name: string;
  age: string;
  role: string;
  initials: string;
  description: string;
  accent: string;
  wallpaper: string;
  battery: number;
}

export interface GameMessage {
  id: string;
  sequence?: number;
  author: MessageAuthor;
  senderLabel?: string;
  agentId?: string;
  responseMode?: NpcReplyMode;
  deliveryStatus?: MessageDeliveryStatus;
  npcIgnored?: boolean;
  text: string;
  time: string;
  browserLink?: {
    label: string;
    cardId: string;
  };
}

export interface NpcFallbacks {
  ordinary: string[];
  identity?: string[];
  verification?: string[];
  delay?: string[];
  money?: string[];
  accusation?: string[];
  help?: string[];
}

export interface ThreadDefinition {
  id: string;
  title: string;
  subtitle: string;
  initials: string;
  color: string;
  truth: ThreadTruth;
  participantLabel?: string;
  initialMessages: GameMessage[];
  roleBrief: string;
  allowedFacts: string[];
  forbiddenClaims: string[];
  verificationFactIds?: string[];
  fallbacks: NpcFallbacks;
  isGroup?: boolean;
  canCall?: boolean;
  canModerate?: boolean;
}

export interface PhoneNotification {
  id: string;
  app: PhoneAppId;
  title: string;
  body: string;
  time: string;
  threadId?: string;
}

export interface FactDefinition {
  id: string;
  title: string;
  detail: string;
  source: string;
  strength: FactStrength;
}

export interface CallDefinition {
  id: string;
  agentId?: string;
  name: string;
  numberLabel: string;
  initials: string;
  color: string;
  result: string;
  earlyResult?: string;
  availableAfterEventId?: string;
  factId?: string;
}

export interface PaymentRequest {
  id: string;
  title: string;
  recipient: string;
  recipientMeta: string;
  channel: PaymentChannel;
  destinationValue: string;
  destinationLabel: string;
  institutionLabel: string;
  amount: number;
  note: string;
  sourceThreadId: string;
  truth: ThreadTruth;
  verificationFactIds: string[];
  unlockAfter?: number;
  unlockEventId?: string;
  unlockRisk?: RiskFlag;
  onPaidMessage?: string;
  onPaidThreadId?: string;
  onPartialMessage?: string;
  alternatives?: PaymentAlternative[];
  dialoguePolicy?: {
    threadIds: string[];
    agentIds: string[];
    goal: string;
    limits: string[];
    routes: string[];
    forbiddenActs: string[];
  };
}

export interface PaymentAlternative {
  id: string;
  method: PaymentAlternativeMethod;
  trigger: 'cash-payment' | 'trusted-contact-cash' | 'cancel-order';
  threadIds: string[];
  agentIds: string[];
  label: string;
  npcGuidance: string;
  fallbackReply: string;
}

export interface BankTransactionSeed {
  id: string;
  label: string;
  detail: string;
  amount: number;
  direction: 'in' | 'out';
  time: string;
}

export interface BrowserCard {
  id: string;
  title: string;
  urlLabel: string;
  summary: string;
  actionLabel: string;
  factId?: string;
  tone: 'neutral' | 'official' | 'social';
  riskAction?: Extract<RiskFlag, 'credentials_shared' | 'otp_shared'>;
  riskLabel?: string;
  sourceThreadId?: string;
  unlockAfter?: number;
  unlockEventId?: string;
  unlockRisk?: RiskFlag;
}

export interface ScheduledStoryEvent {
  id: string;
  delayActions?: number;
  notification: PhoneNotification;
  threadId?: string;
  message?: Omit<GameMessage, 'id'>;
  bankCredit?: BankTransactionSeed;
  requiresAll?: StoryCondition[];
  requiresAny?: StoryCondition[];
}

export interface ScenarioDefinition {
  id: CharacterId;
  profile: CharacterProfile;
  startMinutes: number;
  dayLabel: string;
  balance: number;
  eveningTitle: string;
  eveningSummary: string;
  openingNotifications: PhoneNotification[];
  threads: ThreadDefinition[];
  calls: CallDefinition[];
  paymentRequests: PaymentRequest[];
  bankHistory: BankTransactionSeed[];
  browserCards: BrowserCard[];
  facts: FactDefinition[];
  scheduledEvents: ScheduledStoryEvent[];
  endingEventId: string;
  sourceTitle: string;
  sourceUrl: string;
}

export interface RuntimeTransaction extends BankTransactionSeed {
  requestId?: string;
}

export interface NpcDirectorFact {
  id: string;
  text: string;
}

export interface NpcSceneContract {
  paymentChannel?: PaymentChannel;
  cancellationDiscussed?: boolean;
  speakerId?: string;
  requestId: string;
  status: RequestStatus;
  goal: string;
  limits: string[];
  routes: string[];
  forbiddenActs: string[];
}

export interface NpcDirectorPlan {
  settlementMethod?: PaymentAlternativeMethod;
  baseRevision: string;
  move: NpcDirectorMove;
  factCatalog: NpcDirectorFact[];
  requiredFactIds: string[];
  requiredCriticalValues: string[];
  allowedCriticalValues: string[];
  allowedSensitiveTopics: string[];
  mayClaimPaymentCompleted: boolean;
  recentNpcReplies: string[];
  interactionMode: 'supportive' | 'procedural' | 'persistent' | 'coercive';
  sceneContracts?: NpcSceneContract[];
}

export interface PendingNpcTurn {
  id: string;
  runId: string;
  threadId: string;
  agentId: string;
  memoryScopeId: string;
  senderLabel: string;
  playerMessageId: string;
  delayMs: number;
  responseKind: 'ai' | 'local';
  localReply?: string;
  responseGuidance?: string;
  settlementOnReply?: {
    requestId: string;
    optionId: string;
  };
  directorPlan?: NpcDirectorPlan;
  replanCount?: number;
}

export interface Debrief {
  outcome: 'safe' | 'scammed';
  ending: EndingId;
  title: string;
  summary: string;
  score: number;
  dimensions: Array<{ label: string; value: number }>;
  timeline: string[];
}

export interface GameState {
  saveVersion: 3;
  runId: string;
  characterId: CharacterId | null;
  screen: 'select' | 'lock' | 'phone' | 'debrief';
  activeApp: PhoneAppId;
  activeThreadId: string | null;
  focusedBrowserCardId: string | null;
  tick: number;
  elapsedMinutes: number;
  sequence: number;
  messages: Record<string, GameMessage[]>;
  notifications: PhoneNotification[];
  readNotificationIds: string[];
  openedThreadIds: string[];
  openedAppIds: PhoneAppId[];
  openedBrowserCardIds: string[];
  triggeredEventIds: string[];
  queuedEventBeats: Record<string, number>;
  discoveredFactIds: string[];
  callIds: string[];
  attemptedCallIds: string[];
  transactions: RuntimeTransaction[];
  requestStatus: Record<string, RequestStatus>;
  requestArrangementOptionIds: Record<string, string>;
  npcKnownFactIds: Record<string, string[]>;
  blockedThreadIds: string[];
  reportedThreadIds: string[];
  riskFlags: RiskFlag[];
  lastRiskAt: number | null;
  lastRiskThreadId: string | null;
  lastRecoveryAt: number | null;
  familyWarned: boolean;
  pendingNpcTurns: PendingNpcTurn[];
  failedNpcTurns?: PendingNpcTurn[];
  npcReplyModes: Record<string, NpcReplyMode>;
  debrief: Debrief | null;
}

export type GameAction =
  | { type: 'START'; characterId: CharacterId; runId: string }
  | { type: 'UNLOCK' }
  | { type: 'OPEN_APP'; appId: PhoneAppId }
  | { type: 'OPEN_THREAD'; threadId: string }
  | { type: 'OPEN_BROWSER_CARD'; cardId: string }
  | { type: 'OPEN_MESSAGE_LINK'; threadId: string; messageId: string }
  | { type: 'HOME' }
  | {
      type: 'SEND_MESSAGE';
      threadId: string;
      text: string;
      time: string;
      turnId: string;
    }
  | {
      type: 'NPC_REPLY';
      runId: string;
      turnId: string;
      threadId: string;
      text: string;
      time: string;
      mode?: NpcReplyMode;
      baseRevision?: string;
      move?: NpcDirectorMove;
      factIdsUsed?: string[];
    }
  | { type: 'NPC_FAILED'; runId: string; turnId: string }
  | { type: 'RETRY_NPC_TURN'; failedTurnId: string; turnId: string }
  | { type: 'REPLAN_NPC_TURN'; runId: string; turnId: string }
  | { type: 'CALL'; callId: string; factId?: string }
  | { type: 'DISCOVER_FACT'; factId: string }
  | {
      type: 'SUBMIT_PAYMENT';
      requestId: string;
      channel: PaymentChannel;
      institutionLabel: string;
      destinationValue: string;
      amount: number;
      note: string;
    }
  | { type: 'DECLINE_REQUEST'; requestId: string }
  | { type: 'BLOCK_THREAD'; threadId: string }
  | { type: 'REPORT_THREAD'; threadId: string }
  | {
      type: 'BROWSER_RISK';
      risk: Extract<RiskFlag, 'credentials_shared' | 'otp_shared'>;
    }
  | { type: 'WARN_FAMILY' }
  | { type: 'FINISH' }
  | { type: 'RESTORE'; state: GameState }
  | { type: 'RESET' };
