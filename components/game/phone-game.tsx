'use client';

import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Ban,
  BatteryMedium,
  Bell,
  BookOpenText,
  Check,
  CheckCheck,
  ChevronRight,
  CircleCheck,
  Clock3,
  ExternalLink,
  Flag,
  Gamepad2,
  Globe2,
  GraduationCap,
  Home,
  Info,
  Landmark,
  LockKeyhole,
  MessageCircle,
  NotebookText,
  Phone,
  PhoneCall,
  RotateCcw,
  Send,
  Signal,
  Smartphone,
  UserRound,
  Users,
  Wifi,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  classifyIntent,
  callIsAvailable,
  currentBalance,
  EMPTY_GAME_STATE,
  gameReducer,
  gameTime,
  matchingPaymentRequest,
  storyCanEnd,
  unreadCount,
  visibleBrowserCards,
  visiblePaymentRequests,
} from '@/game/engine';
import { collectNpcMemory, getNpcAgent } from '@/game/npc-agents';
import {
  identityForCall,
  identityForGroupSender,
  identityForThread,
  type IdentityProfile,
} from '@/game/identity-profiles';
import {
  clearGameState,
  loadGameState,
  saveGameState,
} from '@/game/persistence';
import { characterProfiles, getScenario } from '@/game/scenarios';
import type {
  BrowserCard,
  CallDefinition,
  CharacterId,
  GameState,
  PaymentChannel,
  PaymentRequest,
  PhoneAppId,
  ScenarioDefinition,
  ThreadDefinition,
} from '@/game/types';
import {
  FIREBASE_APP_CHECK_CONSOLE_URL,
  generateFirebaseNpcReply,
  getFirebaseAiFailureDiagnostic,
  getLocalAppCheckDebugToken,
} from '@/lib/firebase-ai';

const characterIcons: Record<CharacterId, LucideIcon> = {
  hanh: UserRound,
  an: GraduationCap,
  bao: Gamepad2,
};

const phoneApps: Array<{
  id: Exclude<PhoneAppId, 'home'>;
  name: string;
  icon: LucideIcon;
  color: string;
}> = [
  {
    id: 'messages',
    name: 'Tin nhắn',
    icon: MessageCircle,
    color: 'bg-emerald-500',
  },
  { id: 'calls', name: 'Cuộc gọi', icon: Phone, color: 'bg-sky-500' },
  { id: 'bank', name: 'Ngân hàng', icon: Landmark, color: 'bg-indigo-600' },
  { id: 'browser', name: 'Trình duyệt', icon: Globe2, color: 'bg-orange-500' },
  { id: 'notes', name: 'Ghi chú', icon: NotebookText, color: 'bg-amber-500' },
];

const personalNotes: Record<CharacterId, string[]> = {
  hanh: [
    'Thuốc huyết áp còn đủ tới tối nay.',
    'Mai 9–11 giờ khu phố cắt nước.',
    'Nhớ gọi hai đứa nhỏ về ăn cơm.',
  ],
  an: [
    '08:00 mai · Thuyết trình nhóm ở phòng B3.12.',
    'Mua bút đen cho Bảo trên đường về.',
    'File thuyết trình nằm trong thư mục Lớp A3.',
  ],
  bao: [
    '19:00 · Giải đấu học đường Arena Star.',
    'Mua bó rau cho bà trước khi về nhà.',
    'Nộp bài Toán vào sáng mai.',
  ],
};

const draftCache = new Map<string, string>();

function makeRunId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    return crypto.randomUUID();
  return `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatMoney(amount: number) {
  return `${new Intl.NumberFormat('vi-VN').format(amount)}đ`;
}

function CharacterSelect({ onStart }: { onStart: (id: CharacterId) => void }) {
  return (
    <main className="min-h-dvh bg-[radial-gradient(circle_at_top,#21304d_0%,#0b1220_42%,#050914_100%)] px-4 py-8 text-white sm:py-12">
      <section className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-5xl flex-col justify-center">
        <div className="mb-8 max-w-2xl">
          <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
            <Smartphone className="size-6 text-cyan-300" />
          </div>
          <p className="mb-2 text-sm font-medium tracking-[0.16em] text-cyan-300 uppercase">
            Một nhà · Ba màn hình
          </p>
          <h1 className="text-4xl font-semibold tracking-[-0.045em] sm:text-6xl">
            Bạn sẽ cầm điện thoại của ai?
          </h1>
          <p className="mt-4 max-w-xl text-base leading-7 text-slate-300 sm:text-lg">
            Cùng một gia đình, cùng những việc rất bình thường — nhưng mỗi người
            chỉ nhìn thấy một phần câu chuyện.
          </p>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          {characterProfiles.map((profile) => {
            const Icon = characterIcons[profile.id];
            return (
              <button
                className="group relative min-h-64 overflow-hidden rounded-[2rem] border border-white/12 bg-white/[0.07] p-5 text-left shadow-2xl backdrop-blur transition hover:-translate-y-1 hover:border-white/25 hover:bg-white/[0.11] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 motion-reduce:transform-none"
                key={profile.id}
                onClick={() => onStart(profile.id)}
                type="button"
              >
                <div
                  className={`mb-8 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br ${profile.accent} text-xl font-semibold text-slate-950 shadow-lg`}
                >
                  {profile.initials}
                </div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold tracking-tight">
                      {profile.name}
                    </h2>
                    <p className="mt-1 text-sm text-slate-300">
                      {profile.age} · {profile.role}
                    </p>
                  </div>
                  <Icon className="mt-1 size-5 text-slate-400 transition group-hover:text-cyan-300" />
                </div>
                <p className="mt-5 text-sm leading-6 text-slate-300">
                  {profile.description}
                </p>
                <span className="mt-7 inline-flex items-center gap-2 text-sm font-medium text-cyan-300">
                  Cầm điện thoại <span aria-hidden>→</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function StatusBar({
  scenario,
  state,
  light = false,
}: {
  scenario: ScenarioDefinition;
  state: GameState;
  light?: boolean;
}) {
  return (
    <div
      className={`absolute inset-x-0 top-0 z-40 flex h-[calc(2.25rem+env(safe-area-inset-top))] items-center justify-between px-6 pt-[env(safe-area-inset-top)] text-xs font-semibold ${light ? 'text-white' : 'text-slate-900'}`}
    >
      <span className="flex items-center gap-2">
        {gameTime(scenario, state.elapsedMinutes)}
        <span
          className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide ${light ? 'bg-white/15 text-white/75' : 'bg-slate-900/7 text-slate-500'}`}
        >
          Mô phỏng
        </span>
      </span>
      <span
        className="flex items-center gap-1.5"
        aria-label={`Mạng 5G, pin ${scenario.profile.battery}%`}
      >
        <Signal className="size-3.5" aria-hidden />
        <Wifi className="size-3.5" aria-hidden />
        <BatteryMedium className="size-4" aria-hidden />
        <span>{scenario.profile.battery}%</span>
      </span>
    </div>
  );
}

function LockScreen({
  state,
  scenario,
  dispatch,
  onInspectIdentity,
}: {
  state: GameState;
  scenario: ScenarioDefinition;
  dispatch: React.Dispatch<Parameters<typeof gameReducer>[1]>;
  onInspectIdentity: (profile: IdentityProfile) => void;
}) {
  const openNotification = (threadId: string | undefined, app: PhoneAppId) => {
    dispatch({ type: 'UNLOCK' });
    if (threadId) dispatch({ type: 'OPEN_THREAD', threadId });
    else dispatch({ type: 'OPEN_APP', appId: app });
  };

  return (
    <div
      className={`relative flex h-full flex-col bg-gradient-to-br ${scenario.profile.wallpaper} px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[calc(4rem+env(safe-area-inset-top))] text-white`}
    >
      <StatusBar scenario={scenario} state={state} light />
      <div className="mt-10 text-center drop-shadow">
        <p className="text-6xl font-light tracking-[-0.07em]">
          {gameTime(scenario, state.elapsedMinutes)}
        </p>
        <p className="mt-2 text-sm text-white/80">{scenario.dayLabel}</p>
      </div>

      <div className="mt-auto space-y-2.5">
        <p className="mb-3 px-1 text-xs font-medium text-white/75">
          {state.notifications.length} thông báo
        </p>
        {state.notifications.slice(0, 4).map((notification) => {
          const identity = notification.threadId
            ? identityForThread(scenario.id, notification.threadId)
            : null;
          return (
            <div
              className="flex min-h-16 w-full items-center rounded-2xl border border-white/25 bg-white/82 text-slate-950 shadow-lg backdrop-blur-xl transition hover:bg-white"
              key={notification.id}
            >
              <button
                className="min-w-0 flex-1 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                onClick={() =>
                  openNotification(notification.threadId, notification.app)
                }
                type="button"
              >
                <span className="flex items-center gap-2 text-xs font-semibold">
                  <Bell className="size-3.5 text-indigo-600" />
                  {notification.title}
                  <span className="ml-auto font-normal text-slate-500">
                    {notification.time}
                  </span>
                </span>
                <span className="mt-1.5 line-clamp-2 block text-sm text-slate-700">
                  {notification.body}
                </span>
              </button>
              {identity ? (
                <button
                  aria-label={`Xem hồ sơ ${notification.title}`}
                  className="mr-2 grid size-10 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-slate-100"
                  onClick={() => onInspectIdentity(identity)}
                  type="button"
                >
                  <Info className="size-4" />
                </button>
              ) : null}
            </div>
          );
        })}
        <Button
          className="mt-4 h-12 w-full rounded-2xl bg-white text-slate-950 hover:bg-white/90"
          onClick={() => dispatch({ type: 'UNLOCK' })}
        >
          <LockKeyhole /> Mở điện thoại của {scenario.profile.name}
        </Button>
      </div>
    </div>
  );
}

function HomeScreen({
  state,
  scenario,
  dispatch,
  onFinish,
  onReset,
}: {
  state: GameState;
  scenario: ScenarioDefinition;
  dispatch: React.Dispatch<Parameters<typeof gameReducer>[1]>;
  onFinish: () => void;
  onReset: () => void;
}) {
  const canEnd = storyCanEnd(state, scenario);
  return (
    <div
      className={`flex h-full flex-col overflow-y-auto bg-gradient-to-br ${scenario.profile.wallpaper} px-5 pb-24 pt-[calc(3.5rem+env(safe-area-inset-top))] text-slate-950`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-700">Chào buổi tối,</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {scenario.profile.name}
          </h1>
        </div>
        <div
          className={`flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br ${scenario.profile.accent} font-semibold shadow-md`}
        >
          {scenario.profile.initials}
        </div>
      </div>

      <nav
        className="mt-10 grid grid-cols-3 gap-x-5 gap-y-7"
        aria-label="Ứng dụng trên điện thoại"
      >
        {phoneApps.map((app) => {
          const Icon = app.icon;
          const badge = unreadCount(state, app.id);
          return (
            <button
              aria-label={`${app.name}${badge ? `, ${badge} thông báo chưa đọc` : ''}`}
              className="relative flex min-h-20 flex-col items-center gap-2 rounded-xl text-xs font-medium text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-indigo-600"
              key={app.id}
              onClick={() => dispatch({ type: 'OPEN_APP', appId: app.id })}
              type="button"
            >
              <span
                className={`relative flex size-14 items-center justify-center rounded-[1.15rem] ${app.color} text-white shadow-lg`}
              >
                <Icon className="size-7" />
                {badge ? (
                  <span className="absolute -right-1.5 -top-1.5 grid min-h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white ring-2 ring-slate-100">
                    {badge}
                  </span>
                ) : null}
              </span>
              {app.name}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto space-y-2 pt-8">
        {canEnd ? (
          <Button
            className="h-11 w-full rounded-2xl bg-slate-900 text-white hover:bg-slate-800"
            onClick={onFinish}
          >
            <Clock3 /> Xem lại diễn biến
          </Button>
        ) : null}
        <button
          className="min-h-11 w-full rounded-xl text-xs text-slate-700 hover:bg-white/30"
          onClick={onReset}
          type="button"
        >
          Đổi nhân vật
        </button>
      </div>
    </div>
  );
}

function AppHeader({
  title,
  subtitle,
  onBack,
  actions,
  identity,
  onIdentityOpen,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  actions?: React.ReactNode;
  identity?: Pick<IdentityProfile, 'initials' | 'color'>;
  onIdentityOpen?: () => void;
}) {
  return (
    <header className="flex min-h-16 shrink-0 items-center gap-2 border-b border-slate-200 bg-white/95 px-3 pb-2 pt-[calc(2.5rem+env(safe-area-inset-top))] backdrop-blur">
      <button
        aria-label="Quay lại"
        className="grid size-11 place-items-center rounded-full text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        onClick={onBack}
        type="button"
      >
        <ArrowLeft className="size-5" />
      </button>
      {onIdentityOpen ? (
        <button
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          onClick={onIdentityOpen}
          type="button"
        >
          {identity ? (
            <span
              className={`grid size-9 shrink-0 place-items-center rounded-full ${identity.color} text-xs font-semibold text-white`}
            >
              {identity.initials}
            </span>
          ) : null}
          <span className="min-w-0">
            <span className="block truncate text-base font-semibold">
              {title}
            </span>
            {subtitle ? (
              <span className="block truncate text-xs text-slate-500">
                {subtitle}
              </span>
            ) : null}
          </span>
        </button>
      ) : (
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold">{title}</h1>
          {subtitle ? (
            <p className="truncate text-xs text-slate-500">{subtitle}</p>
          ) : null}
        </div>
      )}
      {actions}
    </header>
  );
}

function IdentitySheet({
  profile,
  canOpenThread,
  onClose,
  onOpenThread,
  onOpenCalls,
}: {
  profile: IdentityProfile | null;
  canOpenThread: boolean;
  onClose: () => void;
  onOpenThread: (threadId: string) => void;
  onOpenCalls: () => void;
}) {
  if (!profile) return null;
  return (
    <div className="absolute inset-0 z-[80] flex justify-end">
      <button
        aria-label="Đóng hồ sơ"
        className="absolute inset-0 bg-slate-950/45"
        onClick={onClose}
        type="button"
      />
      <dialog
        aria-labelledby="identity-profile-title"
        aria-modal="true"
        className="relative m-0 ml-auto flex h-full max-h-none w-full max-w-[390px] flex-col overflow-y-auto border-0 bg-white p-0 text-slate-950 shadow-2xl"
        open
      >
        <header className="relative border-b border-slate-100 px-5 pb-5 pt-8 text-center">
          <button
            aria-label="Đóng hồ sơ"
            className="absolute right-3 top-3 grid size-11 place-items-center rounded-full text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            onClick={onClose}
            type="button"
          >
            <X className="size-5" />
          </button>
          <div
            className={`mx-auto grid size-20 place-items-center rounded-full ${profile.color} text-xl font-semibold text-white shadow-lg`}
          >
            {profile.initials}
          </div>
          <h2
            className="mt-3 text-xl font-semibold"
            id="identity-profile-title"
          >
            {profile.name}
          </h2>
          <p className="mt-1 text-sm text-slate-500">{profile.channel}</p>
        </header>

        <div className="flex-1 space-y-4 px-5 py-4">
          <dl className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {[
              [profile.addressLabel, profile.addressValue],
              ['Danh bạ', profile.savedLabel],
              ['Thời gian', profile.accountAge],
              ['Lịch sử', profile.history],
              ['Liên hệ chung', profile.connections],
            ].map(([label, value]) => (
              <div
                className="border-b border-slate-100 px-4 py-3 last:border-0"
                key={label}
              >
                <dt className="text-xs text-slate-500">{label}</dt>
                <dd className="mt-1 text-sm leading-5 text-slate-800">
                  {value}
                </dd>
              </div>
            ))}
          </dl>

          {profile.members ? (
            <section>
              <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Thành viên
              </h3>
              <div className="mt-2 rounded-2xl bg-slate-50 px-4 py-2">
                {profile.members.map((member) => (
                  <p
                    className="flex min-h-10 items-center gap-2 border-b border-slate-200 text-sm last:border-0"
                    key={member}
                  >
                    <Users className="size-4 text-slate-400" /> {member}
                  </p>
                ))}
              </div>
            </section>
          ) : null}

          <section>
            <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Hoạt động tài khoản
            </h3>
            <div className="mt-2 rounded-2xl bg-slate-50 px-4 py-2">
              {profile.activity.map((item) => (
                <p
                  className="flex min-h-10 items-center gap-2 border-b border-slate-200 text-sm last:border-0"
                  key={item}
                >
                  <span className="size-1.5 shrink-0 rounded-full bg-slate-400" />
                  {item}
                </p>
              ))}
            </div>
          </section>
        </div>

        <footer className="sticky bottom-0 grid grid-cols-2 gap-2 border-t border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
          {profile.linkedThreadId && canOpenThread ? (
            <Button
              className="h-11"
              onClick={() => onOpenThread(profile.linkedThreadId!)}
            >
              <MessageCircle /> Nhắn tin
            </Button>
          ) : (
            <Button className="h-11" onClick={onClose} variant="outline">
              Đóng
            </Button>
          )}
          {profile.linkedCallId ? (
            <Button className="h-11" onClick={onOpenCalls} variant="outline">
              <PhoneCall /> Mở danh bạ
            </Button>
          ) : null}
        </footer>
      </dialog>
    </div>
  );
}

function MessagesApp({
  state,
  scenario,
  dispatch,
  typingThreadIds,
  onInspectIdentity,
}: {
  state: GameState;
  scenario: ScenarioDefinition;
  dispatch: React.Dispatch<Parameters<typeof gameReducer>[1]>;
  typingThreadIds: Set<string>;
  onInspectIdentity: (profile: IdentityProfile) => void;
}) {
  const activeThread = scenario.threads.find(
    (thread) =>
      thread.id === state.activeThreadId &&
      (state.messages[thread.id]?.length ?? 0) > 0,
  );
  if (activeThread)
    return (
      <ChatThread
        key={activeThread.id}
        state={state}
        scenario={scenario}
        thread={activeThread}
        dispatch={dispatch}
        isTyping={typingThreadIds.has(activeThread.id)}
        onInspectIdentity={onInspectIdentity}
      />
    );

  const visibleThreads = scenario.threads.filter(
    (thread) => (state.messages[thread.id]?.length ?? 0) > 0,
  );
  return (
    <div className="flex h-full flex-col bg-slate-50 text-slate-950">
      <AppHeader
        title="Tin nhắn"
        subtitle={`${visibleThreads.length} cuộc trò chuyện`}
        onBack={() => dispatch({ type: 'HOME' })}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {visibleThreads.map((thread) => {
          const messages = state.messages[thread.id] ?? [];
          const last = messages[messages.length - 1];
          const isUnread = state.notifications.some(
            (noti) =>
              noti.threadId === thread.id &&
              !state.readNotificationIds.includes(noti.id),
          );
          const identity = identityForThread(scenario.id, thread.id);
          return (
            <div
              className="flex min-h-20 w-full items-center gap-2 rounded-2xl px-2 py-2.5 hover:bg-white"
              key={thread.id}
            >
              <button
                aria-label={`Xem hồ sơ ${thread.title}`}
                className="grid size-12 shrink-0 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                disabled={!identity}
                onClick={() => identity && onInspectIdentity(identity)}
                type="button"
              >
                <span
                  className={`grid size-12 place-items-center rounded-full ${thread.color} font-semibold text-white`}
                >
                  {thread.initials}
                </span>
              </button>
              <button
                className="min-w-0 flex-1 rounded-xl px-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                onClick={() =>
                  dispatch({ type: 'OPEN_THREAD', threadId: thread.id })
                }
                type="button"
              >
                <span className="flex items-center gap-2">
                  <span className="truncate font-semibold">{thread.title}</span>
                  {isUnread ? (
                    <span
                      className="size-2 rounded-full bg-blue-600"
                      aria-label="Chưa đọc"
                    />
                  ) : null}
                  <span className="ml-auto text-xs text-slate-400">
                    {last?.time}
                  </span>
                </span>
                <span className="mt-1 line-clamp-1 block text-sm text-slate-500">
                  {last?.senderLabel ? `${last.senderLabel}: ` : ''}
                  {last?.text}
                </span>
              </button>
              {identity ? (
                <button
                  aria-label={`Thông tin ${thread.title}`}
                  className="grid size-9 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  onClick={() => onInspectIdentity(identity)}
                  type="button"
                >
                  <Info className="size-4" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChatThread({
  state,
  scenario,
  thread,
  dispatch,
  isTyping,
  onInspectIdentity,
}: {
  state: GameState;
  scenario: ScenarioDefinition;
  thread: ThreadDefinition;
  dispatch: React.Dispatch<Parameters<typeof gameReducer>[1]>;
  isTyping: boolean;
  onInspectIdentity: (profile: IdentityProfile) => void;
}) {
  const draftKey = `${state.runId}:${thread.id}`;
  const [draft, setDraftState] = useState(() => draftCache.get(draftKey) ?? '');
  const [moderation, setModeration] = useState<'block' | 'report' | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const messages = state.messages[thread.id] ?? [];
  const isPending = state.pendingNpcTurns.some(
    (pending) => pending.threadId === thread.id,
  );
  const isBlocked = state.blockedThreadIds.includes(thread.id);
  const isReported = state.reportedThreadIds.includes(thread.id);
  const threadIdentity = identityForThread(scenario.id, thread.id);

  useEffect(() => {
    if (shouldStickToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ block: 'end' });
      setShowNewMessage(false);
    } else {
      setShowNewMessage(true);
    }
  }, [messages.length, isTyping]);

  const send = () => {
    const text = draft.trim();
    if (!text || isPending || isBlocked) return;
    dispatch({
      type: 'SEND_MESSAGE',
      threadId: thread.id,
      text,
      time: gameTime(scenario, state.elapsedMinutes),
      turnId: makeRunId(),
    });
    draftCache.delete(draftKey);
    setDraftState('');
  };

  const setDraft = (value: string) => {
    if (value) draftCache.set(draftKey, value);
    else draftCache.delete(draftKey);
    setDraftState(value);
  };

  const relatedCall = scenario.calls.find(
    (call) => call.id === threadIdentity?.linkedCallId,
  );
  return (
    <div className="flex h-full flex-col bg-[#f4f6fa] text-slate-950">
      <AppHeader
        title={thread.title}
        subtitle={
          isBlocked ? 'Đã chặn' : isReported ? 'Đã báo cáo' : thread.subtitle
        }
        identity={threadIdentity ?? undefined}
        onIdentityOpen={
          threadIdentity ? () => onInspectIdentity(threadIdentity) : undefined
        }
        onBack={() => dispatch({ type: 'OPEN_APP', appId: 'messages' })}
        actions={
          <div className="flex items-center">
            {relatedCall ? (
              <button
                aria-label={`Mở danh bạ để gọi ${thread.title}`}
                title="Mở danh bạ"
                className="grid size-11 place-items-center rounded-full text-sky-600 hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                onClick={() => dispatch({ type: 'OPEN_APP', appId: 'calls' })}
                type="button"
              >
                <PhoneCall className="size-5" />
              </button>
            ) : null}
            {thread.canModerate ? (
              <>
                <button
                  aria-label={`Báo cáo ${thread.title}`}
                  className="grid size-11 place-items-center rounded-full text-slate-600 hover:bg-slate-100"
                  onClick={() => setModeration('report')}
                  type="button"
                >
                  <Flag className="size-4" />
                </button>
                <button
                  aria-label={`Chặn ${thread.title}`}
                  className="grid size-11 place-items-center rounded-full text-slate-600 hover:bg-slate-100"
                  onClick={() => setModeration('block')}
                  type="button"
                >
                  <Ban className="size-4" />
                </button>
              </>
            ) : null}
          </div>
        }
      />

      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 py-5"
        onScroll={(event) => {
          const element = event.currentTarget;
          shouldStickToBottomRef.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            80;
          if (shouldStickToBottomRef.current) setShowNewMessage(false);
        }}
        ref={scrollAreaRef}
      >
        <p className="mb-5 text-center text-[11px] text-slate-400">Hôm nay</p>
        <div
          className="space-y-3"
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
        >
          {messages.map((message) => (
            <div
              className={`flex ${message.author === 'player' ? 'justify-end' : 'justify-start'}`}
              key={message.id}
            >
              <div
                className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 shadow-sm ${message.author === 'player' ? 'rounded-br-md bg-blue-600 text-white' : message.author === 'system' ? 'bg-slate-200 text-slate-700' : 'rounded-bl-md bg-white text-slate-800'}`}
              >
                {message.senderLabel
                  ? (() => {
                      const senderIdentity = identityForGroupSender(
                        scenario.id,
                        message.senderLabel,
                      );
                      return senderIdentity ? (
                        <button
                          className="mb-1 block text-[11px] font-semibold opacity-65 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current"
                          onClick={() => onInspectIdentity(senderIdentity)}
                          type="button"
                        >
                          {message.senderLabel}
                        </button>
                      ) : (
                        <p className="mb-1 text-[11px] font-semibold opacity-65">
                          {message.senderLabel}
                        </p>
                      );
                    })()
                  : null}
                <p className="whitespace-pre-wrap text-[14px] leading-5">
                  {message.text}
                </p>
                <p
                  className={`mt-1 flex items-center gap-1.5 text-[11px] ${message.author === 'player' ? 'text-blue-100' : 'text-slate-400'}`}
                >
                  <span>{message.time}</span>
                  {message.author === 'player' && message.deliveryStatus ? (
                    <span className="inline-flex items-center gap-1">
                      <CheckCheck className="size-3" />
                      {message.deliveryStatus === 'seen'
                        ? 'Đã xem'
                        : message.deliveryStatus === 'delivered'
                          ? 'Đã nhận'
                          : 'Đã gửi'}
                    </span>
                  ) : null}
                </p>
              </div>
            </div>
          ))}
        </div>
        {isTyping ? (
          <div className="mt-3 flex justify-start">
            <output className="sr-only">{thread.title} đang nhập</output>
            <div
              aria-hidden
              className="flex gap-1 rounded-2xl rounded-bl-md bg-white px-4 py-3 shadow-sm"
            >
              {[0, 1, 2].map((index) => (
                <span
                  className="typing-dot motion-reduce:animate-none"
                  key={index}
                  style={{ animationDelay: `${index * 0.15}s` }}
                />
              ))}
            </div>
          </div>
        ) : null}
        {showNewMessage ? (
          <button
            className="sticky bottom-2 mx-auto mt-3 block min-h-9 rounded-full bg-slate-900 px-4 text-xs font-medium text-white shadow-lg"
            onClick={() => {
              shouldStickToBottomRef.current = true;
              bottomRef.current?.scrollIntoView({
                behavior: 'smooth',
                block: 'end',
              });
              setShowNewMessage(false);
            }}
            type="button"
          >
            Tin nhắn mới
          </button>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-slate-200 bg-white px-3 pb-3 pt-2">
        {isBlocked ? (
          <p className="py-3 text-center text-sm text-slate-500">
            Bạn đã chặn cuộc trò chuyện này.
          </p>
        ) : (
          <div>
            <div className="flex items-end gap-2">
              <textarea
                aria-label={`Nhắn cho ${thread.title}`}
                className="max-h-28 min-h-11 flex-1 resize-none rounded-2xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    send();
                  }
                }}
                placeholder="Nhắn tin…"
                rows={1}
                value={draft}
              />
              <button
                aria-label="Gửi tin nhắn"
                className="grid size-11 place-items-center rounded-full bg-blue-600 text-white disabled:opacity-40"
                disabled={!draft.trim() || isPending}
                onClick={send}
                type="button"
              >
                <Send className="size-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={moderation !== null}
        onOpenChange={(open) => !open && setModeration(null)}
      >
        <DialogContent
          className="bg-white text-slate-950"
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle>
              {moderation === 'block'
                ? 'Chặn cuộc trò chuyện?'
                : 'Báo cáo tài khoản?'}
            </DialogTitle>
            <DialogDescription>
              {moderation === 'block'
                ? 'Tin nhắn mới từ tài khoản này sẽ không xuất hiện sau khi chặn.'
                : 'Nền tảng sẽ ghi nhận báo cáo và giữ lại cuộc trò chuyện để bạn có thể xem lại.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-slate-50">
            <DialogClose render={<Button className="h-11" variant="outline" />}>
              Để sau
            </DialogClose>
            <Button
              className="h-11"
              onClick={() => {
                if (moderation === 'block')
                  dispatch({ type: 'BLOCK_THREAD', threadId: thread.id });
                else dispatch({ type: 'REPORT_THREAD', threadId: thread.id });
                setModeration(null);
              }}
            >
              {moderation === 'block' ? 'Chặn' : 'Báo cáo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CallsApp({
  state,
  scenario,
  dispatch,
  onInspectIdentity,
}: {
  state: GameState;
  scenario: ScenarioDefinition;
  dispatch: React.Dispatch<Parameters<typeof gameReducer>[1]>;
  onInspectIdentity: (profile: IdentityProfile) => void;
}) {
  const [result, setResult] = useState<{
    call: CallDefinition;
    text: string;
  } | null>(null);
  const call = (item: CallDefinition) => {
    const available = callIsAvailable(state, item);
    setResult({
      call: item,
      text: available
        ? item.result
        : (item.earlyResult ?? 'Không có người nghe máy.'),
    });
    dispatch({
      type: 'CALL',
      callId: item.id,
      factId: available ? item.factId : undefined,
    });
  };
  return (
    <div className="flex h-full flex-col bg-slate-50 text-slate-950">
      <AppHeader
        title="Cuộc gọi"
        subtitle="Danh bạ gia đình và dịch vụ"
        onBack={() => dispatch({ type: 'HOME' })}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <h2 className="px-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Liên hệ gần đây
        </h2>
        <div className="mt-2 space-y-2">
          {scenario.calls.map((item) => {
            const identity = identityForCall(scenario.id, item.id);
            return (
              <div
                className="flex min-h-20 items-center gap-2 rounded-2xl bg-white p-3 shadow-sm"
                key={item.id}
              >
                <button
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                  disabled={!identity}
                  onClick={() => identity && onInspectIdentity(identity)}
                  type="button"
                >
                  <span
                    className={`grid size-11 shrink-0 place-items-center rounded-full ${item.color} font-semibold text-white`}
                  >
                    {item.initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {item.name}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {item.numberLabel}
                    </span>
                  </span>
                  <Info className="size-4 shrink-0 text-slate-400" />
                </button>
                <button
                  aria-label={`Gọi ${item.name}`}
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                  onClick={() => call(item)}
                  type="button"
                >
                  <PhoneCall className="size-5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <Dialog
        open={result !== null}
        onOpenChange={(open) => !open && setResult(null)}
      >
        <DialogContent className="bg-white text-slate-950">
          <DialogHeader>
            <div
              className={`mb-2 grid size-12 place-items-center rounded-full ${result?.call.color} font-semibold text-white`}
            >
              {result?.call.initials}
            </div>
            <DialogTitle>Cuộc gọi với {result?.call.name}</DialogTitle>
            <DialogDescription className="text-slate-600">
              {result?.text}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-slate-50">
            <DialogClose render={<Button className="h-11" />}>
              Kết thúc cuộc gọi
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BankApp({
  state,
  scenario,
  dispatch,
}: {
  state: GameState;
  scenario: ScenarioDefinition;
  dispatch: React.Dispatch<Parameters<typeof gameReducer>[1]>;
}) {
  const [channel, setChannel] = useState<PaymentChannel | null>(null);
  const [institution, setInstitution] = useState('');
  const [destination, setDestination] = useState('');
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState('');
  const [pendingPayment, setPendingPayment] = useState<{
    request: PaymentRequest;
    amount: number;
    destinationValue: string;
    note: string;
  } | null>(null);
  const [receipt, setReceipt] = useState<{
    recipient: string;
    amount: number;
    time: string;
  } | null>(null);
  const history = [...state.transactions, ...scenario.bankHistory];
  const institutions: Record<PaymentChannel, string[]> = {
    transfer: ['Ngân hàng Mộc', 'Ngân hàng Đại Việt', 'Ngân hàng Phương Nam'],
    bill: ['Mạng Nhà Mình'],
    topup: ['Nhà mạng Mây'],
  };
  const channelLabels: Record<
    PaymentChannel,
    { title: string; destination: string; placeholder: string }
  > = {
    transfer: {
      title: 'Chuyển tiền',
      destination: 'Số tài khoản',
      placeholder: 'Nhập số tài khoản',
    },
    bill: {
      title: 'Thanh toán hóa đơn',
      destination: 'Mã khách hàng',
      placeholder: 'Nhập mã khách hàng',
    },
    topup: {
      title: 'Nạp điện thoại',
      destination: 'Số điện thoại',
      placeholder: 'Nhập số điện thoại',
    },
  };
  const matchedRequest = channel
    ? matchingPaymentRequest(state, scenario, channel, destination)
    : null;
  const matchedInstitution =
    matchedRequest && matchedRequest.institutionLabel === institution
      ? matchedRequest
      : null;

  const chooseChannel = (next: PaymentChannel) => {
    setChannel(next);
    setInstitution('');
    setDestination('');
    setAmountText('');
    setNote('');
    setFormError('');
    setReceipt(null);
  };

  const reviewPayment = () => {
    if (!channel) return;
    const amount = Number(amountText.replace(/[^0-9]/g, ''));
    if (!institution) {
      setFormError('Hãy chọn ngân hàng hoặc nhà cung cấp.');
      return;
    }
    if (!destination.trim()) {
      setFormError(
        `Hãy nhập ${channelLabels[channel].destination.toLowerCase()}.`,
      );
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('Số tiền phải lớn hơn 0đ.');
      return;
    }
    if (!matchedRequest || matchedRequest.institutionLabel !== institution) {
      setFormError(
        'Không tìm thấy thông tin người nhận. Hãy kiểm tra lại từng ký tự.',
      );
      return;
    }
    if (state.requestStatus[matchedRequest.id] !== 'pending') {
      setFormError('Khoản này đã được xử lý trước đó.');
      return;
    }
    if (amount > currentBalance(state, scenario)) {
      setFormError('Số dư không đủ cho giao dịch này.');
      return;
    }
    setFormError('');
    setPendingPayment({
      request: matchedRequest,
      amount,
      destinationValue: destination,
      note,
    });
  };

  const resetForm = () => {
    setChannel(null);
    setInstitution('');
    setDestination('');
    setAmountText('');
    setNote('');
    setFormError('');
  };

  return (
    <div className="flex h-full flex-col bg-[#f4f6fb] text-slate-950">
      <AppHeader
        title="Ngân hàng Mộc"
        subtitle="Tài khoản thanh toán"
        onBack={() => dispatch({ type: 'HOME' })}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-4">
        <div className="rounded-3xl bg-gradient-to-br from-indigo-600 to-blue-700 p-5 text-white shadow-lg">
          <p className="text-xs text-blue-100">Số dư khả dụng</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight">
            {formatMoney(currentBalance(state, scenario))}
          </p>
          <p className="mt-5 text-xs text-blue-100">
            •••• 203 · {scenario.profile.name}
          </p>
        </div>

        <h2 className="mt-6 px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Giao dịch mới
        </h2>
        <div className="mt-2 rounded-3xl bg-white p-4 shadow-sm">
          {!channel ? (
            <div>
              <p className="text-sm font-semibold">Bạn muốn làm gì?</p>
              <div className="mt-4 grid gap-2">
                {(
                  [
                    'transfer',
                    'bill',
                    'topup',
                  ] as const satisfies readonly PaymentChannel[]
                ).map((item) => (
                  <button
                    className="flex min-h-14 items-center justify-between rounded-2xl border border-slate-200 px-4 text-left text-sm font-semibold hover:border-indigo-300 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                    key={item}
                    onClick={() => chooseChannel(item)}
                    type="button"
                  >
                    <span>{channelLabels[item].title}</span>
                    <ChevronRight className="size-4 text-slate-400" />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                reviewPayment();
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">
                    {channelLabels[channel].title}
                  </p>
                </div>
                <button
                  className="min-h-10 rounded-xl px-3 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                  onClick={resetForm}
                  type="button"
                >
                  Đổi loại
                </button>
              </div>

              <label className="mt-5 block text-xs font-semibold text-slate-600">
                {channel === 'transfer' ? 'Ngân hàng nhận' : 'Nhà cung cấp'}
                <select
                  className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  onChange={(event) => {
                    setInstitution(event.target.value);
                    setFormError('');
                  }}
                  value={institution}
                >
                  <option value="">Chọn từ danh sách</option>
                  {institutions[channel].map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>

              <label className="mt-4 block text-xs font-semibold text-slate-600">
                {channelLabels[channel].destination}
                <input
                  autoComplete="off"
                  className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base tracking-wide outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  inputMode={channel === 'bill' ? 'text' : 'numeric'}
                  onChange={(event) => {
                    setDestination(event.target.value);
                    setFormError('');
                  }}
                  placeholder={channelLabels[channel].placeholder}
                  spellCheck={false}
                  value={destination}
                />
              </label>

              <div
                className={`mt-2 min-h-10 rounded-xl px-3 py-2 text-xs ${
                  matchedInstitution
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-slate-50 text-slate-500'
                }`}
                aria-live="polite"
              >
                {matchedInstitution ? (
                  <span>
                    Người nhận: <strong>{matchedInstitution.recipient}</strong>
                    <span className="mt-0.5 block text-[11px] font-normal">
                      {matchedInstitution.recipientMeta}
                    </span>
                  </span>
                ) : (
                  'Tên người nhận sẽ hiện sau khi thông tin khớp.'
                )}
              </div>

              <label className="mt-4 block text-xs font-semibold text-slate-600">
                Số tiền
                <div className="relative mt-1.5">
                  <input
                    autoComplete="off"
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 pr-10 text-base outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    inputMode="numeric"
                    onChange={(event) => {
                      setAmountText(event.target.value);
                      setFormError('');
                    }}
                    placeholder="0"
                    value={amountText}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-slate-500">
                    đ
                  </span>
                </div>
              </label>

              <label className="mt-4 block text-xs font-semibold text-slate-600">
                Nội dung (không bắt buộc)
                <input
                  autoComplete="off"
                  className="mt-1.5 h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                  maxLength={80}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Nhập nội dung chuyển tiền"
                  value={note}
                />
              </label>

              {formError ? (
                <p
                  className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700"
                  role="alert"
                >
                  {formError}
                </p>
              ) : null}

              <Button className="mt-5 h-12 w-full rounded-2xl" type="submit">
                Kiểm tra giao dịch
              </Button>
            </form>
          )}

          {receipt ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              <p className="flex items-center gap-2 font-semibold">
                <CircleCheck className="size-4" /> Giao dịch thành công
              </p>
              <p className="mt-1 text-xs leading-5">
                {formatMoney(receipt.amount)} tới {receipt.recipient} ·{' '}
                {receipt.time}
              </p>
            </div>
          ) : null}
        </div>

        <h2 className="mt-6 px-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">
          Biến động gần đây
        </h2>
        <div className="mt-2 overflow-hidden rounded-2xl bg-white shadow-sm">
          {history.map((item) => (
            <div
              className="flex min-h-16 items-center gap-3 border-b border-slate-100 px-3 py-2 last:border-0"
              key={item.id}
            >
              <span
                className={`grid size-9 place-items-center rounded-full ${item.direction === 'in' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-600'}`}
              >
                {item.direction === 'in' ? (
                  <ArrowDownLeft className="size-4" />
                ) : (
                  <ArrowUpRight className="size-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {item.label}
                </span>
                <span className="block truncate text-[11px] text-slate-400">
                  {item.detail} · {item.time}
                </span>
              </span>
              <span
                className={`text-sm font-semibold ${item.direction === 'in' ? 'text-emerald-600' : 'text-slate-800'}`}
              >
                {item.direction === 'in' ? '+' : '−'}
                {formatMoney(item.amount)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <Dialog
        open={pendingPayment !== null}
        onOpenChange={(open) => {
          if (!open) setPendingPayment(null);
        }}
      >
        <DialogContent
          className="bg-white text-slate-950"
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle>
              Xác nhận{' '}
              {pendingPayment ? formatMoney(pendingPayment.amount) : ''}
            </DialogTitle>
            <DialogDescription>
              Kiểm tra lại người nhận và số tiền trước khi xác nhận.
            </DialogDescription>
          </DialogHeader>
          <dl className="space-y-3 rounded-2xl bg-slate-50 p-4 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Người nhận</dt>
              <dd className="mt-1 font-semibold">
                {pendingPayment?.request.recipient}
              </dd>
              <dd className="text-xs text-slate-500">
                {pendingPayment?.request.institutionLabel} ·{' '}
                {pendingPayment?.destinationValue}
              </dd>
            </div>
            <div className="flex items-end justify-between gap-3">
              <div>
                <dt className="text-xs text-slate-500">Số tiền</dt>
                <dd className="mt-1 text-2xl font-semibold">
                  {pendingPayment ? formatMoney(pendingPayment.amount) : ''}
                </dd>
              </div>
              <div className="text-right">
                <dt className="text-xs text-slate-500">Số dư sau giao dịch</dt>
                <dd className="mt-1 font-medium">
                  {pendingPayment
                    ? formatMoney(
                        currentBalance(state, scenario) - pendingPayment.amount,
                      )
                    : ''}
                </dd>
              </div>
            </div>
          </dl>
          <DialogFooter className="bg-slate-50">
            <Button
              className="h-11"
              variant="outline"
              onClick={() => setPendingPayment(null)}
            >
              Quay lại
            </Button>
            <Button
              className="h-11"
              onClick={() => {
                if (!pendingPayment) return;
                const time = gameTime(scenario, state.elapsedMinutes + 2);
                dispatch({
                  type: 'SUBMIT_PAYMENT',
                  requestId: pendingPayment.request.id,
                  channel: pendingPayment.request.channel,
                  institutionLabel: pendingPayment.request.institutionLabel,
                  destinationValue: pendingPayment.destinationValue,
                  amount: pendingPayment.amount,
                  note: pendingPayment.note,
                });
                setReceipt({
                  recipient: pendingPayment.request.recipient,
                  amount: pendingPayment.amount,
                  time,
                });
                setPendingPayment(null);
                resetForm();
              }}
            >
              Xác nhận giao dịch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BrowserApp({
  state,
  scenario,
  dispatch,
}: {
  state: GameState;
  scenario: ScenarioDefinition;
  dispatch: React.Dispatch<Parameters<typeof gameReducer>[1]>;
}) {
  const [riskCard, setRiskCard] = useState<BrowserCard | null>(null);
  const cards = visibleBrowserCards(state, scenario);
  const open = (card: BrowserCard) => {
    dispatch({ type: 'OPEN_BROWSER_CARD', cardId: card.id });
    if (card.riskAction) setRiskCard(card);
  };
  return (
    <div className="flex h-full flex-col bg-slate-100 text-slate-950">
      <AppHeader
        title="Trình duyệt"
        subtitle="Các trang đã mở gần đây"
        onBack={() => dispatch({ type: 'HOME' })}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-4">
        <div className="mb-4 flex h-11 items-center rounded-full bg-white px-4 text-xs text-slate-500 shadow-sm">
          <Globe2 className="mr-2 size-4" /> Tìm kiếm hoặc nhập địa chỉ
        </div>
        <div className="space-y-3">
          {cards.map((card) => (
            <article
              className="rounded-2xl bg-white p-4 shadow-sm"
              key={card.id}
            >
              <p className="text-[11px] text-slate-400">{card.urlLabel}</p>
              <h2 className="mt-1 font-semibold">{card.title}</h2>
              <p className="mt-2 text-sm leading-5 text-slate-600">
                {card.summary}
              </p>
              <Button
                className="mt-4 h-11 w-full"
                variant="outline"
                onClick={() => open(card)}
              >
                {state.openedBrowserCardIds.includes(card.id) ? (
                  <Check />
                ) : (
                  <ChevronRight />
                )}
                {state.openedBrowserCardIds.includes(card.id) &&
                !card.riskAction
                  ? 'Đã mở'
                  : card.actionLabel}
              </Button>
            </article>
          ))}
        </div>
      </div>
      <Dialog
        open={riskCard !== null}
        onOpenChange={(openValue) => !openValue && setRiskCard(null)}
      >
        <DialogContent
          className="bg-white text-slate-950"
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle>{riskCard?.actionLabel}?</DialogTitle>
            <DialogDescription>
              {riskCard?.riskAction === 'credentials_shared'
                ? 'Trang sẽ tiếp tục bằng tài khoản game đang đăng nhập trên thiết bị.'
                : 'Mã xác nhận AS-4821 sẽ được gửi tới tài khoản hỗ trợ.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-slate-50">
            <Button
              className="h-11"
              variant="outline"
              onClick={() => setRiskCard(null)}
            >
              Hủy
            </Button>
            <Button
              className="h-11"
              onClick={() => {
                if (riskCard?.riskAction)
                  dispatch({ type: 'BROWSER_RISK', risk: riskCard.riskAction });
                setRiskCard(null);
              }}
            >
              {riskCard?.riskAction === 'otp_shared' ? 'Gửi mã' : 'Tiếp tục'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NotesApp({
  scenario,
  dispatch,
}: {
  scenario: ScenarioDefinition;
  dispatch: React.Dispatch<Parameters<typeof gameReducer>[1]>;
}) {
  return (
    <div className="flex h-full flex-col bg-[#fbf8ef] text-slate-950">
      <AppHeader
        title="Ghi chú"
        subtitle="Trên thiết bị"
        onBack={() => dispatch({ type: 'HOME' })}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-4">
        <div className="rounded-2xl border border-amber-200/70 bg-white/75 p-4">
          <p className="text-xs font-semibold text-amber-700">
            {scenario.dayLabel}
          </p>
          <h2 className="mt-1 text-xl font-semibold">Ghi chú gần đây</h2>
        </div>
        <div className="mt-3 space-y-2">
          {personalNotes[scenario.id].map((note, index) => (
            <article className="rounded-2xl bg-white p-4 shadow-sm" key={note}>
              <div className="flex gap-3">
                <BookOpenText className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <div>
                  <h3 className="text-xs font-semibold text-slate-400">
                    Ghi chú {index + 1}
                  </h3>
                  <p className="mt-1 text-sm leading-5 text-slate-700">
                    {note}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}

function DebriefScreen({
  state,
  scenario,
  onReplay,
  onReset,
}: {
  state: GameState;
  scenario: ScenarioDefinition;
  onReplay: () => void;
  onReset: () => void;
}) {
  const debrief = state.debrief;
  if (!debrief) return null;
  const truthLabels = {
    legit: 'Yêu cầu hợp lệ',
    scam: 'Giả mạo',
    compromised: 'Tài khoản bị chiếm',
  } as const;
  const safe = debrief.outcome === 'safe';
  return (
    <div className="h-full overflow-y-auto bg-slate-50 px-5 pb-10 pt-[calc(3.5rem+env(safe-area-inset-top))] text-slate-950">
      <p
        className={`mx-auto w-fit rounded-full px-3 py-1 text-xs font-bold tracking-[0.12em] ${safe ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}
      >
        {safe ? 'KHÔNG BỊ LỪA' : 'ĐÃ BỊ LỪA'}
      </p>
      <div
        className={`mx-auto mt-4 grid size-24 place-items-center rounded-full text-center text-white shadow-xl ${safe ? 'bg-emerald-700' : 'bg-rose-700'}`}
      >
        <div>
          <p className="text-3xl font-semibold">{debrief.score}</p>
          <p className="text-[10px] text-slate-300">/ 100</p>
        </div>
      </div>
      <p className="mt-5 text-center text-xs font-semibold tracking-[0.15em] text-blue-600 uppercase">
        Tổng kết buổi tối
      </p>
      <h1 className="mt-2 text-center text-3xl font-semibold tracking-tight">
        {debrief.title}
      </h1>
      <p className="mt-3 text-center text-sm leading-6 text-slate-600">
        {debrief.summary}
      </p>

      <section className="mt-7 rounded-3xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Bốn mặt của lựa chọn</h2>
        <div className="mt-4 space-y-4">
          {debrief.dimensions.map((dimension) => (
            <div key={dimension.label}>
              <div className="flex justify-between text-xs">
                <span>{dimension.label}</span>
                <span className="font-semibold">{dimension.value}</span>
              </div>
              <div
                aria-hidden
                className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"
              >
                <div
                  className="h-full rounded-full bg-blue-600"
                  style={{ width: `${dimension.value}%` }}
                />
              </div>
              <progress
                aria-label={dimension.label}
                className="sr-only"
                max={100}
                value={dimension.value}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-3xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Điều đã xảy ra</h2>
        <div className="mt-3 space-y-3">
          {debrief.timeline.map((item) => (
            <div
              className="flex gap-2 text-sm leading-5 text-slate-600"
              key={item}
            >
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-blue-600" />
              {item}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-3xl bg-white p-4 shadow-sm">
        <h2 className="font-semibold">Sự thật phía sau các cuộc trò chuyện</h2>
        <div className="mt-3 space-y-2">
          {scenario.threads
            .filter(
              (thread) =>
                thread.truth !== 'legit' ||
                scenario.paymentRequests.some(
                  (request) => request.sourceThreadId === thread.id,
                ),
            )
            .map((thread) => (
              <div
                className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2"
                key={thread.id}
              >
                <span className="text-sm font-medium">{thread.title}</span>
                <span className="text-right text-xs text-slate-500">
                  {truthLabels[thread.truth]}
                </span>
              </div>
            ))}
        </div>
      </section>

      <a
        className="mt-4 flex min-h-12 items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-blue-700 shadow-sm"
        href={scenario.sourceUrl}
        rel="noreferrer"
        target="_blank"
      >
        Case thực tế: {scenario.sourceTitle}
        <ExternalLink className="ml-3 size-4 shrink-0" />
      </a>
      <p className="mt-3 text-center text-xs leading-5 text-slate-500">
        Mọi tiền, tài khoản và mã xác nhận vừa thấy đều là dữ liệu giả lập.
      </p>

      <div className="mt-6 grid gap-2">
        <Button className="h-12 rounded-2xl" onClick={onReplay}>
          <RotateCcw /> Chơi lại vai {scenario.profile.name}
        </Button>
        <Button
          className="h-12 rounded-2xl"
          variant="outline"
          onClick={onReset}
        >
          Chọn nhân vật khác
        </Button>
      </div>
    </div>
  );
}

function PhoneFrame({
  state,
  scenario,
  dispatch,
  typingThreadIds,
  onFinish,
  onReset,
  onReplay,
}: {
  state: GameState;
  scenario: ScenarioDefinition;
  dispatch: React.Dispatch<Parameters<typeof gameReducer>[1]>;
  typingThreadIds: Set<string>;
  onFinish: () => void;
  onReset: () => void;
  onReplay: () => void;
}) {
  const [hiddenNotificationId, setHiddenNotificationId] = useState<
    string | null
  >(null);
  const [selectedIdentity, setSelectedIdentity] =
    useState<IdentityProfile | null>(null);
  const latestNotification = state.notifications.find(
    (notification) =>
      !state.readNotificationIds.includes(notification.id) &&
      notification.id !== hiddenNotificationId &&
      !scenario.openingNotifications.some(
        (opening) => opening.id === notification.id,
      ) &&
      notification.threadId !== state.activeThreadId,
  );
  const openNotification = () => {
    if (!latestNotification) return;
    if (latestNotification.threadId)
      dispatch({ type: 'OPEN_THREAD', threadId: latestNotification.threadId });
    else dispatch({ type: 'OPEN_APP', appId: latestNotification.app });
  };
  const latestNotificationIdentity = latestNotification?.threadId
    ? identityForThread(scenario.id, latestNotification.threadId)
    : null;
  let content: React.ReactNode;
  if (state.screen === 'lock')
    content = (
      <LockScreen
        state={state}
        scenario={scenario}
        dispatch={dispatch}
        onInspectIdentity={setSelectedIdentity}
      />
    );
  else if (state.screen === 'debrief')
    content = (
      <DebriefScreen
        state={state}
        scenario={scenario}
        onReplay={onReplay}
        onReset={onReset}
      />
    );
  else if (state.activeApp === 'home')
    content = (
      <HomeScreen
        state={state}
        scenario={scenario}
        dispatch={dispatch}
        onFinish={onFinish}
        onReset={onReset}
      />
    );
  else if (state.activeApp === 'messages')
    content = (
      <MessagesApp
        state={state}
        scenario={scenario}
        dispatch={dispatch}
        typingThreadIds={typingThreadIds}
        onInspectIdentity={setSelectedIdentity}
      />
    );
  else if (state.activeApp === 'calls')
    content = (
      <CallsApp
        state={state}
        scenario={scenario}
        dispatch={dispatch}
        onInspectIdentity={setSelectedIdentity}
      />
    );
  else if (state.activeApp === 'bank')
    content = <BankApp state={state} scenario={scenario} dispatch={dispatch} />;
  else if (state.activeApp === 'browser')
    content = (
      <BrowserApp state={state} scenario={scenario} dispatch={dispatch} />
    );
  else content = <NotesApp scenario={scenario} dispatch={dispatch} />;

  return (
    <main className="min-h-dvh overflow-hidden bg-[radial-gradient(circle_at_top,#21304d_0%,#0b1220_48%,#050914_100%)] text-white sm:grid sm:place-items-center sm:p-5">
      <section className="relative mx-auto h-dvh w-full overflow-hidden bg-slate-100 text-slate-950 shadow-[0_40px_100px_rgb(0_0_0/55%)] sm:h-[min(880px,calc(100dvh-2.5rem))] sm:w-[430px] sm:rounded-[3rem] sm:border-[9px] sm:border-slate-950">
        {state.screen !== 'lock' ? (
          <StatusBar scenario={scenario} state={state} />
        ) : null}
        {state.screen === 'phone' && latestNotification ? (
          <output
            aria-live="polite"
            className={`absolute inset-x-3 z-50 flex min-h-14 items-center rounded-2xl border border-slate-200 bg-white/95 text-left shadow-xl backdrop-blur ${state.activeApp === 'home' ? 'top-[calc(2.5rem+env(safe-area-inset-top))]' : 'top-[calc(6.25rem+env(safe-area-inset-top))]'}`}
          >
            <button
              className="flex min-w-0 flex-1 items-center gap-3 rounded-l-2xl px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              onClick={openNotification}
              type="button"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600">
                <Bell className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold">
                  {latestNotification.title}
                </span>
                <span className="line-clamp-1 block text-xs text-slate-500">
                  {latestNotification.body}
                </span>
              </span>
              <span className="text-[10px] text-slate-400">
                {latestNotification.time}
              </span>
            </button>
            {latestNotificationIdentity ? (
              <button
                aria-label={`Xem hồ sơ ${latestNotification.title}`}
                className="grid size-10 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                onClick={() => setSelectedIdentity(latestNotificationIdentity)}
                type="button"
              >
                <Info className="size-4" />
              </button>
            ) : null}
            <button
              aria-label="Ẩn thông báo"
              className="mr-1 grid size-10 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              onClick={() => setHiddenNotificationId(latestNotification.id)}
              type="button"
            >
              <X className="size-4" />
            </button>
          </output>
        ) : null}
        <div
          className={
            state.screen === 'phone' && state.activeApp !== 'home'
              ? 'h-full pb-[calc(4rem+env(safe-area-inset-bottom))]'
              : 'h-full'
          }
        >
          {content}
        </div>
        {state.screen === 'phone' && state.activeApp !== 'home' ? (
          <nav
            className="absolute inset-x-0 bottom-0 z-30 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-center justify-center gap-24 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
            aria-label="Điều hướng điện thoại"
          >
            <button
              aria-label="Quay lại"
              className="grid size-11 place-items-center rounded-full text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              onClick={() =>
                state.activeThreadId
                  ? dispatch({ type: 'OPEN_APP', appId: 'messages' })
                  : dispatch({ type: 'HOME' })
              }
              type="button"
            >
              <ArrowLeft className="size-5" />
            </button>
            <button
              aria-label="Màn hình chính"
              className="grid size-11 place-items-center rounded-full bg-slate-900 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              onClick={() => dispatch({ type: 'HOME' })}
              type="button"
            >
              <Home className="size-5" />
            </button>
          </nav>
        ) : null}
        <IdentitySheet
          profile={selectedIdentity}
          canOpenThread={Boolean(
            selectedIdentity?.linkedThreadId &&
            (state.messages[selectedIdentity.linkedThreadId]?.length ?? 0) > 0,
          )}
          onClose={() => setSelectedIdentity(null)}
          onOpenThread={(threadId) => {
            setSelectedIdentity(null);
            if (state.screen === 'lock') dispatch({ type: 'UNLOCK' });
            dispatch({ type: 'OPEN_THREAD', threadId });
          }}
          onOpenCalls={() => {
            setSelectedIdentity(null);
            if (state.screen === 'lock') dispatch({ type: 'UNLOCK' });
            dispatch({ type: 'OPEN_APP', appId: 'calls' });
          }}
        />
      </section>
    </main>
  );
}

export function PhoneGame() {
  const [state, dispatch] = useReducer(gameReducer, EMPTY_GAME_STATE);
  const [hydrated, setHydrated] = useState(false);
  const [confirmFinish, setConfirmFinish] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [appCheckDebugToken, setAppCheckDebugToken] = useState<string | null>(
    null,
  );
  const [debugTokenCopied, setDebugTokenCopied] = useState(false);
  const [typingTurnIds, setTypingTurnIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [showOnboarding, setShowOnboarding] = useState(false);
  const stateRef = useRef(state);
  const startedTurnIdsRef = useRef(new Set<string>());
  const turnTimerRefs = useRef(new Map<string, number>());
  const activePersonaIdsRef = useRef(new Set<string>());
  const appCheckSetupDismissedRef = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = loadGameState();
      if (saved) dispatch({ type: 'RESTORE', state: saved });
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (hydrated) saveGameState(state);
  }, [hydrated, state]);

  useEffect(() => {
    const runPendingTurn = (turnId: string) => {
      const latestState = stateRef.current;
      const pending = latestState.pendingNpcTurns.find(
        (item) => item.id === turnId,
      );
      const scenario = getScenario(latestState.characterId);
      if (!pending || !scenario || pending.runId !== latestState.runId) return;

      const thread = scenario.threads.find(
        (item) => item.id === pending.threadId,
      );
      const latest = (latestState.messages[pending.threadId] ?? []).find(
        (message) => message.id === pending.playerMessageId,
      );
      const agent = thread
        ? getNpcAgent(scenario, thread, pending.agentId)
        : null;
      if (!thread || !latest || !agent) {
        dispatch({
          type: 'NPC_FAILED',
          runId: pending.runId,
          turnId: pending.id,
        });
        return;
      }

      if (activePersonaIdsRef.current.has(pending.memoryScopeId)) {
        const retryTimer = window.setTimeout(
          () => runPendingTurn(pending.id),
          450,
        );
        turnTimerRefs.current.set(pending.id, retryTimer);
        return;
      }
      activePersonaIdsRef.current.add(pending.memoryScopeId);

      setTypingTurnIds((current) => new Set(current).add(pending.id));
      const clearTyping = () =>
        setTypingTurnIds((current) => {
          const next = new Set(current);
          next.delete(pending.id);
          return next;
        });
      const releasePersona = () =>
        activePersonaIdsRef.current.delete(pending.memoryScopeId);

      if (pending.responseKind === 'local' && pending.localReply) {
        const localTimer = window.setTimeout(() => {
          const currentState = stateRef.current;
          const currentScenario = getScenario(currentState.characterId);
          dispatch({
            type: 'NPC_REPLY',
            runId: pending.runId,
            turnId: pending.id,
            threadId: pending.threadId,
            text: pending.localReply!,
            time: currentScenario
              ? gameTime(currentScenario, currentState.elapsedMinutes)
              : latest.time,
            mode: 'local',
          });
          clearTyping();
          releasePersona();
          turnTimerRefs.current.delete(pending.id);
        }, 850);
        turnTimerRefs.current.set(pending.id, localTimer);
        return;
      }

      const intent = classifyIntent(latest.text);
      const sceneState = [
        ...scenario.scheduledEvents
          .filter(
            (event) =>
              event.threadId === thread.id &&
              latestState.triggeredEventIds.includes(event.id),
          )
          .map((event) => `Đã tới mốc: ${event.notification.body}`),
        ...visiblePaymentRequests(latestState, scenario)
          .filter((request) => request.sourceThreadId === thread.id)
          .map(
            (request) =>
              `${request.title}: ${latestState.requestStatus[request.id] === 'paid' ? 'người chơi đã thanh toán' : latestState.requestStatus[request.id] === 'declined' ? 'người chơi đã từ chối' : 'đang chờ quyết định'}.`,
          ),
      ];

      void generateFirebaseNpcReply({
        personaId: pending.memoryScopeId,
        npcName: agent.name,
        playerRole: `${scenario.profile.name}, ${scenario.profile.age}, ${scenario.profile.role}`,
        roleBrief: `${agent.roleBrief}\nÝ định gần nhất của người chơi: ${intent}.${pending.responseGuidance ? `\nNhịp phản hồi: ${pending.responseGuidance}` : ''}`,
        allowedFacts: agent.allowedFacts,
        forbiddenClaims: agent.forbiddenClaims,
        voiceExamples: agent.voiceExamples,
        sceneState,
        participantLabel: pending.senderLabel,
        latestMessage: latest.text,
        history: collectNpcMemory(
          latestState,
          scenario,
          pending.agentId,
          thread.id,
          latest.id,
        ),
      })
        .then(({ reply }) => {
          const currentState = stateRef.current;
          const currentScenario = getScenario(currentState.characterId);
          dispatch({
            type: 'NPC_REPLY',
            runId: pending.runId,
            turnId: pending.id,
            threadId: pending.threadId,
            text: reply,
            time: currentScenario
              ? gameTime(currentScenario, currentState.elapsedMinutes)
              : latest.time,
          });
        })
        .catch((error: unknown) => {
          const diagnostic = getFirebaseAiFailureDiagnostic(error);
          console.warn(
            `[Firebase AI] NPC reply failed: kind=${diagnostic.kind} code=${diagnostic.code || 'unknown'} status=${diagnostic.status ?? 'unknown'} detail=${diagnostic.detail || 'unavailable'}`,
          );
          if (
            diagnostic.kind === 'app-check' &&
            !appCheckSetupDismissedRef.current
          ) {
            const debugToken = getLocalAppCheckDebugToken();
            if (debugToken) {
              setDebugTokenCopied(false);
              setAppCheckDebugToken(debugToken);
            }
          }
          dispatch({
            type: 'NPC_FAILED',
            runId: pending.runId,
            turnId: pending.id,
          });
        })
        .finally(() => {
          clearTyping();
          releasePersona();
          turnTimerRefs.current.delete(pending.id);
        });
    };

    for (const pending of state.pendingNpcTurns) {
      if (startedTurnIdsRef.current.has(pending.id)) continue;
      startedTurnIdsRef.current.add(pending.id);
      const timer = window.setTimeout(
        () => runPendingTurn(pending.id),
        pending.delayMs,
      );
      turnTimerRefs.current.set(pending.id, timer);
    }
  }, [state.pendingNpcTurns]);

  useEffect(
    () => () => {
      for (const timer of turnTimerRefs.current.values())
        window.clearTimeout(timer);
      turnTimerRefs.current.clear();
      activePersonaIdsRef.current.clear();
    },
    [],
  );

  const typingThreadIds = useMemo(
    () =>
      new Set(
        state.pendingNpcTurns
          .filter((pending) => typingTurnIds.has(pending.id))
          .map((pending) => pending.threadId),
      ),
    [state.pendingNpcTurns, typingTurnIds],
  );

  const scenario = useMemo(
    () => getScenario(state.characterId),
    [state.characterId],
  );
  const clearPendingTurnTimers = () => {
    for (const timer of turnTimerRefs.current.values())
      window.clearTimeout(timer);
    turnTimerRefs.current.clear();
    startedTurnIdsRef.current.clear();
    activePersonaIdsRef.current.clear();
    setTypingTurnIds(new Set());
  };
  const start = (characterId: CharacterId) => {
    clearPendingTurnTimers();
    draftCache.clear();
    dispatch({ type: 'START', characterId, runId: makeRunId() });
    setShowOnboarding(true);
  };
  const reset = () => {
    clearPendingTurnTimers();
    clearGameState();
    draftCache.clear();
    dispatch({ type: 'RESET' });
    setConfirmReset(false);
  };
  const replay = () => {
    if (state.characterId) {
      clearPendingTurnTimers();
      draftCache.clear();
      dispatch({
        type: 'START',
        characterId: state.characterId,
        runId: makeRunId(),
      });
      setShowOnboarding(true);
    }
  };

  if (!hydrated)
    return (
      <main className="grid min-h-dvh place-items-center bg-slate-950 text-white">
        <output className="flex items-center gap-3 text-sm text-slate-300">
          <span className="size-3 animate-pulse rounded-full bg-cyan-300 motion-reduce:animate-none" />
          Đang khôi phục điện thoại…
        </output>
      </main>
    );
  if (!scenario) return <CharacterSelect onStart={start} />;

  return (
    <>
      <PhoneFrame
        state={state}
        scenario={scenario}
        dispatch={dispatch}
        typingThreadIds={typingThreadIds}
        onFinish={() => setConfirmFinish(true)}
        onReset={() => setConfirmReset(true)}
        onReplay={replay}
      />
      <Dialog open={showOnboarding} onOpenChange={setShowOnboarding}>
        <DialogContent
          className="bg-white text-slate-950"
          showCloseButton={false}
        >
          <DialogHeader>
            <div
              className={`mb-2 grid size-12 place-items-center rounded-2xl bg-gradient-to-br ${scenario.profile.accent} font-semibold text-slate-950`}
            >
              {scenario.profile.initials}
            </div>
            <DialogTitle>
              Đây là điện thoại của {scenario.profile.name}
            </DialogTitle>
            <DialogDescription className="leading-6">
              Hãy sử dụng như một chiếc điện thoại bình thường. Câu chuyện sẽ
              thay đổi theo những gì bạn làm. Mọi tài khoản, dữ liệu và tiền
              trong trải nghiệm này đều là mô phỏng; không nhập thông tin cá
              nhân, mật khẩu hoặc mã thật.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-slate-50">
            <Button className="h-11" onClick={() => setShowOnboarding(false)}>
              Bắt đầu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmFinish} onOpenChange={setConfirmFinish}>
        <DialogContent
          className="bg-white text-slate-950"
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle>Xem lại diễn biến?</DialogTitle>
            <DialogDescription>
              Câu chuyện đã tới một điểm dừng. Bạn có thể xem kết quả hoặc quay
              lại điện thoại để kiểm tra thêm.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-slate-50">
            <Button
              className="h-11"
              variant="outline"
              onClick={() => setConfirmFinish(false)}
            >
              Xem lại điện thoại
            </Button>
            <Button
              className="h-11"
              onClick={() => {
                dispatch({ type: 'FINISH' });
                setConfirmFinish(false);
              }}
            >
              Xem kết quả
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent
          className="bg-white text-slate-950"
          showCloseButton={false}
        >
          <DialogHeader>
            <DialogTitle>Đổi nhân vật?</DialogTitle>
            <DialogDescription>
              Tiến trình của vai hiện tại sẽ được xóa khỏi thiết bị này.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="bg-slate-50">
            <Button
              className="h-11"
              variant="outline"
              onClick={() => setConfirmReset(false)}
            >
              Ở lại
            </Button>
            <Button className="h-11" onClick={reset}>
              Đổi nhân vật
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={appCheckDebugToken !== null}
        onOpenChange={(open) => {
          if (!open) {
            appCheckSetupDismissedRef.current = true;
            setAppCheckDebugToken(null);
            setDebugTokenCopied(false);
          }
        }}
      >
        <DialogContent
          className="bg-white text-slate-950"
          showCloseButton={false}
        >
          <DialogHeader>
            <div className="mb-2 grid size-11 place-items-center rounded-2xl bg-amber-50 text-amber-700">
              <LockKeyhole className="size-5" aria-hidden />
            </div>
            <DialogTitle>Cho phép phản hồi AI trên localhost</DialogTitle>
            <DialogDescription>
              Firebase đã nhận request nhưng App Check chưa nhận diện trình
              duyệt cục bộ này. Đăng ký token bên dưới một lần để Gemini có thể
              trả lời.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-6 pb-2">
            <div>
              <label
                className="mb-1.5 block text-xs font-semibold text-slate-600"
                htmlFor="firebase-debug-token"
              >
                Firebase App Check debug token
              </label>
              <input
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 font-mono text-xs text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                id="firebase-debug-token"
                onFocus={(event) => event.currentTarget.select()}
                readOnly
                value={appCheckDebugToken ?? ''}
              />
            </div>

            <ol className="list-decimal space-y-1 pl-5 text-sm leading-6 text-slate-600">
              <li>Sao chép token.</li>
              <li>
                Mở App Check, chọn ứng dụng Web rồi chọn “Manage debug tokens”.
              </li>
              <li>Thêm token, lưu lại và quay về tải lại game.</li>
            </ol>

            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
              Đây là mã bí mật dành riêng cho môi trường phát triển. Không gửi
              cho người khác, không đưa vào mã nguồn và không dùng trên website
              thật.
            </p>
          </div>

          <DialogFooter className="bg-slate-50">
            <Button
              className="h-11"
              variant="outline"
              onClick={() => {
                if (!appCheckDebugToken) return;
                void navigator.clipboard
                  .writeText(appCheckDebugToken)
                  .then(() => setDebugTokenCopied(true));
              }}
            >
              {debugTokenCopied ? <Check /> : <LockKeyhole />}
              {debugTokenCopied ? 'Đã sao chép' : 'Sao chép token'}
            </Button>
            <Button
              className="h-11"
              nativeButton={false}
              variant="outline"
              render={
                <a
                  aria-label="Mở Firebase App Check trong tab mới"
                  href={FIREBASE_APP_CHECK_CONSOLE_URL}
                  rel="noreferrer"
                  target="_blank"
                />
              }
            >
              Mở Firebase App Check <ExternalLink />
            </Button>
            <Button className="h-11" onClick={() => window.location.reload()}>
              Đã thêm — tải lại
            </Button>
            <DialogClose render={<Button variant="ghost" />}>
              Để sau, dùng phản hồi dự phòng
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
