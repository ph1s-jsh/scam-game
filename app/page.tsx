'use client';

import { FormEvent, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Ban,
  BookOpenCheck,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  Flag,
  MessageCircle,
  Phone,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
} from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type ContactId = 'impostor' | 'dung' | 'group' | 'landlady';
type EndingId = 'safe' | 'loss' | 'overcautious';
type Message = {
  id: string;
  from: 'player' | 'npc' | 'system';
  text: string;
  time: string;
};
type Evidence = {
  id: string;
  title: string;
  detail: string;
  strength: 'strong' | 'weak';
};

const contacts: Array<{
  id: ContactId;
  initials: string;
  name: string;
  preview: string;
  time: string;
}> = [
  { id: 'impostor', initials: 'M', name: 'Minh · số mới', preview: 'M gửi lại file lab...', time: '21:16' },
  { id: 'dung', initials: 'D', name: 'Dũng phòng 204', preview: 'Wifi nay lag ghê', time: '20:42' },
  { id: 'group', initials: 'A3', name: 'Nhóm lớp A3', preview: 'Mai học B3.12 nha', time: '19:08' },
  { id: 'landlady', initials: 'C', name: 'Cô Hạnh chủ trọ', preview: 'Nhớ khóa cửa cổng', time: '18:25' },
];

const initialMessages: Record<ContactId, Message[]> = {
  impostor: [
    { id: 'i-1', from: 'npc', text: 'Ê tao Minh nè, tao đổi số rồi. Số cũ tự nhiên mất sóng luôn :))', time: '21:14' },
    { id: 'i-2', from: 'npc', text: 'M gửi lại file lab sáng nay cho tao với, đang cần gấp á.', time: '21:15' },
  ],
  dung: [
    { id: 'd-1', from: 'npc', text: 'Ê phòng 203, wifi nay lag ghê. M có đang tải game không đó :))', time: '20:42' },
  ],
  group: [
    { id: 'g-1', from: 'npc', text: 'Thảo: Thầy đổi phòng rồi nha, mai học B3.12.', time: '19:06' },
    { id: 'g-2', from: 'npc', text: 'Minh: Ai đi sớm giữ chỗ cuối lớp với :))', time: '19:08' },
  ],
  landlady: [
    { id: 'l-1', from: 'npc', text: 'Cô Hạnh: Tối về nhớ khóa cửa cổng giúp cô nha con.', time: '18:25' },
  ],
};

const contactStyles: Record<ContactId, string> = {
  impostor: 'bg-amber-400 text-slate-950',
  dung: 'bg-violet-400 text-slate-950',
  group: 'bg-sky-400 text-slate-950',
  landlady: 'bg-emerald-400 text-slate-950',
};

const endings: Record<EndingId, {
  eyebrow: string;
  title: string;
  summary: string;
  score: number;
  color: string;
  skills: Array<{ label: string; value: number }>;
  lesson: string;
}> = {
  safe: {
    eyebrow: 'Đã xác minh an toàn',
    title: 'Bạn không để sự quen thuộc quyết định thay mình.',
    summary: 'Bạn kiểm tra qua một kênh độc lập trước khi hành động. Minh thật xác nhận chưa từng đổi số.',
    score: 92,
    color: 'text-emerald-300',
    skills: [
      { label: 'Xác minh danh tính', value: 96 },
      { label: 'Đánh giá bằng chứng', value: 90 },
      { label: 'Chống thúc ép', value: 94 },
      { label: 'Hiệu chỉnh niềm tin', value: 88 },
    ],
    lesson: 'Tên, lớp và lịch học có thể là thông tin công khai. Danh tính chỉ được xác nhận khi bạn kiểm tra qua một kênh đáng tin cậy khác.',
  },
  loss: {
    eyebrow: 'Giao dịch mô phỏng đã xảy ra',
    title: 'Thông tin đúng đã tạo ra một kết luận sai.',
    summary: 'Bạn chuyển 480.000đ mô phỏng cho một tài khoản không phải Minh. Không có tiền thật nào được sử dụng.',
    score: 28,
    color: 'text-rose-300',
    skills: [
      { label: 'Xác minh danh tính', value: 24 },
      { label: 'Đánh giá bằng chứng', value: 36 },
      { label: 'Chống thúc ép', value: 18 },
      { label: 'Hiệu chỉnh niềm tin', value: 34 },
    ],
    lesson: 'Kẻ giả danh thường trộn thông tin đúng với một yêu cầu nhỏ, rồi mới nâng mức rủi ro. Hãy dừng giao dịch và xác minh qua số cũ hoặc người thứ ba.',
  },
  overcautious: {
    eyebrow: 'An toàn nhưng chưa đủ căn cứ',
    title: 'Bạn tránh được rủi ro, nhưng đã kết luận quá sớm.',
    summary: 'Chặn ngay là an toàn trong tình huống này, nhưng thói quen chặn mọi tương tác lạ không giúp bạn phân biệt người thật và kẻ giả.',
    score: 61,
    color: 'text-amber-300',
    skills: [
      { label: 'Xác minh danh tính', value: 42 },
      { label: 'Đánh giá bằng chứng', value: 48 },
      { label: 'Chống thúc ép', value: 88 },
      { label: 'Hiệu chỉnh niềm tin', value: 52 },
    ],
    lesson: 'Mục tiêu không phải là không tin ai. Hãy kiểm tra bằng một câu hỏi riêng hoặc một kênh độc lập trước khi kết luận.',
  },
};

function cloneMessages() {
  return Object.fromEntries(
    Object.entries(initialMessages).map(([key, value]) => [key, value.map((message) => ({ ...message }))]),
  ) as Record<ContactId, Message[]>;
}

function normalizeText(value: string) {
  return value
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');
}

function ruleBasedReply(message: string, requestMade: boolean) {
  const input = normalizeText(message);

  if (/sang nay|noi gi|chuyen rieng|mat khau|cau gi|an gi|quan nao/.test(input)) {
    return {
      reply: 'Ủa đoạn nào? Sáng giờ nói tùm lum ai mà nhớ. Gửi file trước đi rồi nói :))',
      evidence: {
        id: 'private-check',
        title: 'Né câu hỏi riêng tư',
        detail: 'Người này không trả lời được điều chỉ Minh thật mới biết.',
        strength: 'weak' as const,
      },
    };
  }
  if (/video|goi mat|call|bat cam|camera/.test(input)) {
    return {
      reply: 'Camera máy t đang hư á, gọi tiếng cũng chập chờn. Để mai gặp rồi nói.',
      evidence: {
        id: 'avoids-live-check',
        title: 'Tránh xác minh trực tiếp',
        detail: 'Tài khoản từ chối gọi hình với một lý do khó kiểm chứng.',
        strength: 'weak' as const,
      },
    };
  }
  if (/ai day|minh nao|m la ai|ten gi|lop nao/.test(input)) {
    return { reply: 'Minh lớp A3 chứ Minh nào nữa cha. Mai học B3.12 đó, quên rồi hả?', evidence: null };
  }
  if (/so cu|doi so|mat sim|sim/.test(input)) {
    return { reply: 'Số cũ tự nhiên mất sóng, t đang chạy ra làm lại SIM nè. Đừng gọi số đó.', evidence: null };
  }
  if (/group|nhom|bao moi nguoi|thong bao/.test(input)) {
    return {
      reply: 'Tí t báo, giờ đang ngoài đường. M đừng làm lớn chuyện nha, gửi file riêng t trước đi.',
      evidence: {
        id: 'isolation',
        title: 'Muốn giữ cuộc nói chuyện riêng',
        detail: 'Người này trì hoãn xác nhận công khai trong nhóm lớp.',
        strength: 'weak' as const,
      },
    };
  }
  if (/tien|chuyen khoan|480|bank|ngan hang|stk/.test(input)) {
    return {
      reply: requestMade
        ? 'Có 480k thôi mà, lát app bank chạy lại t trả liền. M giúp t gấp với.'
        : 'Chưa có gì đâu, gửi file lab t trước đi. App bank t cũng đang hơi lỗi.',
      evidence: null,
    };
  }
  if (/khong tin|lua dao|gia mao|nghi|scam/.test(input)) {
    return {
      reply: 'Ủa bạn bè mà m nói gì căng vậy? T biết mai học B3.12 với sáng nay nộp lab mà còn giả gì nữa?',
      evidence: {
        id: 'familiarity-pressure',
        title: 'Dùng sự quen thuộc để gây áp lực',
        detail: 'Tài khoản dùng thông tin công khai thay cho bằng chứng danh tính.',
        strength: 'weak' as const,
      },
    };
  }
  if (/file|lab|bai|gui/.test(input)) {
    return { reply: 'Ừ file lab sáng nay á. M gửi lẹ giúp t, deadline dí quá trời.', evidence: null };
  }
  if (/hello|alo|chao|ê|e |oi/.test(input)) {
    return { reply: 'Alo t đây. M đang ở phòng trọ hả? Gửi file lab t với nha.', evidence: null };
  }
  return null;
}

function ContactButton({
  contact,
  active,
  onClick,
  compact = false,
}: {
  contact: (typeof contacts)[number];
  active: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <Button
      className={`${compact ? 'h-auto min-w-[154px]' : 'h-auto w-full'} justify-start gap-3 rounded-xl p-2.5 text-left ${
        active ? 'bg-primary/10 ring-1 ring-primary/20 hover:bg-primary/15' : 'hover:bg-white/4'
      }`}
      onClick={onClick}
      variant="ghost"
    >
      <Avatar className="size-10">
        <AvatarFallback className={contactStyles[contact.id]}>{contact.initials}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-medium text-foreground">{contact.name}</span>
          {!compact && <span className="text-[10px] text-muted-foreground">{contact.time}</span>}
        </span>
        <span className="block truncate text-xs font-normal text-muted-foreground">{contact.preview}</span>
      </span>
    </Button>
  );
}

export default function Home() {
  const [started, setStarted] = useState(false);
  const [activeContact, setActiveContact] = useState<ContactId>('impostor');
  const [messages, setMessages] = useState<Record<ContactId, Message[]>>(cloneMessages);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [turns, setTurns] = useState(0);
  const [requestMade, setRequestMade] = useState(false);
  const [deferred, setDeferred] = useState(false);
  const [checkedActions, setCheckedActions] = useState<string[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [ending, setEnding] = useState<EndingId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const messageId = useRef(20);

  const active = contacts.find((contact) => contact.id === activeContact) ?? contacts[0];
  const progress = Math.min(100, 18 + turns * 12 + evidence.length * 18 + (requestMade ? 16 : 0));
  const strongEvidence = evidence.some((item) => item.strength === 'strong');
  const currentEnding = ending ? endings[ending] : null;

  const timeline = useMemo(() => {
    if (requestMade) return 'Một yêu cầu tài chính vừa xuất hiện.';
    if (turns >= 1) return 'Cuộc trò chuyện bắt đầu có điểm chưa khớp.';
    return 'Một số mới tự nhận là Minh và xin lại file lab.';
  }, [requestMade, turns]);

  function appendMessage(contactId: ContactId, message: Omit<Message, 'id'>) {
    messageId.current += 1;
    setMessages((current) => ({
      ...current,
      [contactId]: [...current[contactId], { ...message, id: `m-${messageId.current}` }],
    }));
  }

  function addEvidence(item: Evidence | null) {
    if (!item) return;
    setEvidence((current) => (current.some((e) => e.id === item.id) ? current : [...current, item]));
  }

  function delay(ms: number) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function askNpcAI(message: string) {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, requestMade, turns }),
      });
      if (!response.ok) return null;
      const data = (await response.json()) as { reply?: string };
      return data.reply?.slice(0, 320) || null;
    } catch {
      return null;
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || typing || ending) return;

    appendMessage(activeContact, { from: 'player', text: trimmed, time: '21:17' });
    setInput('');
    setTyping(true);

    if (activeContact !== 'impostor') {
      await delay(520);
      const replies: Record<Exclude<ContactId, 'impostor'>, string> = {
        dung: 'Dũng: T không biết vụ đổi số. Mà nãy có người lạ đứng dưới hỏi phòng sinh viên mới chuyển vào đó.',
        group: 'Thảo: Trong group Minh vẫn đang online mà. Tag nó hỏi luôn đi?',
        landlady: 'Cô Hạnh: Cô không biết bạn con. Có chuyện tiền nong thì con gọi trực tiếp người ta kiểm tra nha.',
      };
      appendMessage(activeContact, { from: 'npc', text: replies[activeContact], time: '21:18' });
      setTyping(false);
      return;
    }

    const nextTurn = turns + 1;
    setTurns(nextTurn);
    const ruled = ruleBasedReply(trimmed, requestMade);
    const aiReply = ruled?.reply ?? (await askNpcAI(trimmed));
    await delay(620);
    appendMessage('impostor', {
      from: 'npc',
      text: aiReply ?? 'M hỏi gì lạ vậy :)) T đang vội quá. Gửi file lab cho t trước nha.',
      time: '21:18',
    });
    addEvidence(ruled?.evidence ?? null);

    if (nextTurn >= 2 && !requestMade) {
      await delay(780);
      appendMessage('impostor', {
        from: 'npc',
        text: 'À app bank t đang lỗi. M chuyển giúp t 480k vào tài khoản này được không? Lát t trả ngay, gấp lắm.',
        time: '21:19',
      });
      setRequestMade(true);
      addEvidence({
        id: 'money-escalation',
        title: 'Yêu cầu tăng mức rủi ro',
        detail: 'Cuộc trò chuyện chuyển từ xin file sang nhờ chuyển tiền gấp.',
        strength: 'weak',
      });
    }
    setTyping(false);
  }

  async function runAction(action: 'call' | 'group' | 'dung') {
    if (checkedActions.includes(action) || ending) return;
    setCheckedActions((current) => [...current, action]);

    if (action === 'call') {
      setNotice('Minh thật bắt máy: “T có đổi số đâu? Đừng chuyển gì hết nha!”');
      addEvidence({
        id: 'old-number-confirmed',
        title: 'Xác nhận qua số cũ',
        detail: 'Minh thật trả lời và xác nhận chưa từng đổi số.',
        strength: 'strong',
      });
      await delay(2500);
      setNotice(null);
      return;
    }
    if (action === 'group') {
      setActiveContact('group');
      appendMessage('group', { from: 'player', text: '@Minh m đổi số hả?', time: '21:18' });
      await delay(520);
      appendMessage('group', { from: 'npc', text: 'Minh: T đổi số hồi nào trời? Số cũ vẫn đây mà.', time: '21:18' });
      addEvidence({
        id: 'group-confirmed',
        title: 'Đối chiếu trong nhóm lớp',
        detail: 'Tài khoản Minh cũ phủ nhận việc đổi số.',
        strength: 'strong',
      });
      return;
    }
    setActiveContact('dung');
    appendMessage('dung', { from: 'player', text: 'M có biết Minh bạn cùng lớp t không?', time: '21:18' });
    await delay(520);
    appendMessage('dung', {
      from: 'npc',
      text: 'Không biết. Nhưng chiều có người lạ đứng dưới hỏi cô Hạnh phòng 203 có sinh viên mới chuyển vào không.',
      time: '21:18',
    });
    addEvidence({
      id: 'stranger-at-house',
      title: 'Có người hỏi thông tin phòng 203',
      detail: 'Chi tiết đáng chú ý nhưng chưa trực tiếp chứng minh danh tính tài khoản.',
      strength: 'weak',
    });
  }

  function decide(decision: 'transfer' | 'report' | 'block' | 'delay') {
    if (decision === 'transfer') {
      setEnding('loss');
      return;
    }
    if (decision === 'delay') {
      setDeferred(true);
      addEvidence({
        id: 'resisted-urgency',
        title: 'Không quyết định dưới áp lực',
        detail: 'Bạn chủ động trì hoãn để có thời gian xác minh.',
        strength: 'weak',
      });
      appendMessage('impostor', {
        from: 'npc',
        text: 'M chuyển luôn được không? Người ta đang đứng chờ t, trễ là phiền lắm đó.',
        time: '21:20',
      });
      return;
    }
    if (decision === 'report') {
      setEnding(strongEvidence ? 'safe' : 'overcautious');
      return;
    }
    setEnding(strongEvidence || requestMade ? 'safe' : 'overcautious');
  }

  function restart() {
    setStarted(true);
    setActiveContact('impostor');
    setMessages(cloneMessages());
    setInput('');
    setTyping(false);
    setTurns(0);
    setRequestMade(false);
    setDeferred(false);
    setCheckedActions([]);
    setEvidence([]);
    setEnding(null);
    setNotice(null);
  }

  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <Dialog open={!started}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-white/10 bg-card p-0 sm:max-w-xl" showCloseButton={false}>
          <div className="relative aspect-[16/9] overflow-hidden border-b border-white/8">
            <img
              alt="Căn phòng trọ sinh viên ban đêm với điện thoại đang mở cuộc trò chuyện"
              className="h-full w-full object-cover"
              src="/og.png"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-card/75 via-transparent to-transparent" />
          </div>
          <div className="bg-[radial-gradient(circle_at_top_right,rgb(243_174_74/14%),transparent_38%),linear-gradient(135deg,rgb(28_39_58),rgb(17_25_39))] p-6 sm:p-8">
            <Badge className="border-primary/30 bg-primary/10 text-primary" variant="outline">
              Chapter 01 · 8 phút
            </Badge>
            <DialogHeader className="mt-5 text-left">
              <DialogTitle className="text-3xl font-semibold tracking-[-0.055em] sm:text-4xl">Phòng 203</DialogTitle>
              <DialogDescription className="max-w-md text-base leading-relaxed text-slate-300">
                Một tin nhắn quen. Một người chưa chắc quen. Bạn vừa chuyển trọ và có một tối rất bình thường — cho đến khi Minh đổi số.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-5 grid gap-2 text-sm text-slate-300 sm:grid-cols-3">
              <span className="rounded-xl border border-white/8 bg-white/5 p-3"><MessageCircle className="mb-2 size-4 text-primary" />Chat tự do</span>
              <span className="rounded-xl border border-white/8 bg-white/5 p-3"><ShieldCheck className="mb-2 size-4 text-primary" />Tự xác minh</span>
              <span className="rounded-xl border border-white/8 bg-white/5 p-3"><BookOpenCheck className="mb-2 size-4 text-primary" />Học sau trải nghiệm</span>
            </div>
            <Button className="mt-5 h-11 w-full rounded-xl text-sm" onClick={() => setStarted(true)}>
              Bắt đầu tối đầu tiên <ArrowRight />
            </Button>
            <p className="mt-3 text-center text-[11px] text-slate-400">Tất cả nhân vật và giao dịch đều là mô phỏng.</p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(ending)}>
        <DialogContent className="max-h-[92vh] overflow-y-auto border-white/10 bg-card p-0 sm:max-w-2xl" showCloseButton={false}>
          {currentEnding && (
            <div>
              <div className="border-b border-white/8 bg-background/40 p-6 sm:p-8">
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${currentEnding.color}`}>{currentEnding.eyebrow}</p>
                    <DialogHeader className="mt-3 text-left">
                      <DialogTitle className="text-2xl font-semibold leading-tight tracking-[-0.04em] sm:text-3xl">
                        {currentEnding.title}
                      </DialogTitle>
                      <DialogDescription className="max-w-xl leading-relaxed">{currentEnding.summary}</DialogDescription>
                    </DialogHeader>
                  </div>
                  <div className="grid size-20 shrink-0 place-items-center rounded-full border border-primary/25 bg-primary/8">
                    <span className="text-2xl font-semibold text-primary">{currentEnding.score}</span>
                  </div>
                </div>
              </div>
              <div className="space-y-6 p-6 sm:p-8">
                <div className="grid gap-4 sm:grid-cols-2">
                  {currentEnding.skills.map((skill) => (
                    <div key={skill.label}>
                      <div className="mb-2 flex justify-between text-xs"><span>{skill.label}</span><span className="text-muted-foreground">{skill.value}%</span></div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${skill.value}%` }} /></div>
                    </div>
                  ))}
                </div>
                <div className="rounded-2xl border border-primary/15 bg-primary/6 p-4">
                  <p className="flex items-center gap-2 text-sm font-medium text-primary"><Sparkles className="size-4" /> Điều cần mang ra đời thật</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{currentEnding.lesson}</p>
                </div>
                {evidence.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Dấu hiệu bạn đã thu thập</p>
                    <div className="flex flex-wrap gap-2">{evidence.map((item) => <Badge key={item.id} variant="secondary"><Check /> {item.title}</Badge>)}</div>
                  </div>
                )}
                <Button className="h-11 w-full rounded-xl" onClick={restart}><RotateCcw /> Chơi lại với cách khác</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {notice && (
        <div className="fixed left-1/2 top-5 z-50 flex w-[min(560px,calc(100%-2rem))] -translate-x-1/2 items-start gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-950/95 p-4 text-sm shadow-2xl backdrop-blur-xl">
          <Phone className="mt-0.5 size-5 shrink-0 text-emerald-300" />
          <div><p className="font-medium text-emerald-200">Cuộc gọi đã kết nối</p><p className="mt-1 text-emerald-100/75">{notice}</p></div>
        </div>
      )}

      <div className="mx-auto flex min-h-screen w-full max-w-[1440px] flex-col px-3 py-3 sm:px-6 lg:px-8">
        <header className="mb-3 flex items-center justify-between rounded-2xl border border-white/8 bg-card/75 px-4 py-3 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[0_0_24px_rgb(243_174_74/18%)]"><ShieldCheck className="size-5" /></span>
            <div><p className="font-semibold tracking-[-0.02em]">Phòng 203</p><p className="text-xs text-muted-foreground">Chương 01 · Ngày đầu chuyển trọ</p></div>
          </div>
          <Badge className="border-primary/25 bg-primary/10 text-primary" variant="outline"><Clock3 /> 21:17</Badge>
        </header>

        <div className="mb-3 flex gap-2 overflow-x-auto pb-1 lg:hidden">
          {contacts.map((contact) => <ContactButton active={activeContact === contact.id} compact contact={contact} key={contact.id} onClick={() => setActiveContact(contact.id)} />)}
        </div>

        <section className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[260px_minmax(0,1fr)_310px]">
          <aside className="hidden rounded-2xl border border-white/8 bg-card/65 p-3 lg:block">
            <p className="px-2 pb-3 pt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Cuộc trò chuyện</p>
            <div className="space-y-1.5">{contacts.map((contact) => <ContactButton active={activeContact === contact.id} contact={contact} key={contact.id} onClick={() => setActiveContact(contact.id)} />)}</div>
            <div className="mt-6 rounded-xl border border-white/8 bg-background/30 p-3">
              <p className="text-xs font-medium">Diễn biến</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{timeline}</p>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} /></div>
            </div>
          </aside>

          <div className="flex min-h-[610px] flex-col overflow-hidden rounded-2xl border border-white/8 bg-card shadow-2xl shadow-black/20 lg:min-h-0">
            <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
              <div className="flex items-center gap-3">
                <Avatar className="size-10"><AvatarFallback className={contactStyles[active.id]}>{active.initials}</AvatarFallback></Avatar>
                <div><div className="flex items-center gap-2"><p className="text-sm font-semibold">{active.name}</p><span className="size-1.5 rounded-full bg-emerald-400" /></div><p className="text-xs text-muted-foreground">Hoạt động gần đây</p></div>
              </div>
              {activeContact === 'impostor' && <Button aria-label="Gọi số hiện tại" className="rounded-xl" onClick={() => runAction('call')} size="icon" variant="ghost"><Phone /></Button>}
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[radial-gradient(circle_at_top,rgb(243_174_74/7%),transparent_42%)] px-4 py-5 sm:px-8">
              <div className="mx-auto mb-6 rounded-full border border-white/8 bg-background/40 px-3 py-1 text-[11px] text-muted-foreground">Hôm nay</div>
              <div className="mt-auto space-y-3">
                {messages[activeContact].map((message) => (
                  <div className={`flex ${message.from === 'player' ? 'justify-end' : message.from === 'system' ? 'justify-center' : 'justify-start'}`} key={message.id}>
                    <div className={`max-w-[84%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      message.from === 'player' ? 'rounded-br-md bg-primary text-primary-foreground' : message.from === 'system' ? 'bg-background/50 text-xs text-muted-foreground' : 'rounded-bl-md bg-secondary text-secondary-foreground'
                    }`}>
                      {message.text}
                      {message.from !== 'system' && <span className={`mt-1 block text-[9px] ${message.from === 'player' ? 'text-slate-800/60' : 'text-muted-foreground'}`}>{message.time}</span>}
                    </div>
                  </div>
                ))}
                {typing && activeContact === 'impostor' && <div className="flex justify-start"><div className="flex gap-1 rounded-2xl rounded-bl-md bg-secondary px-4 py-3"><span className="typing-dot" /><span className="typing-dot [animation-delay:120ms]" /><span className="typing-dot [animation-delay:240ms]" /></div></div>}
              </div>
            </div>

            {activeContact === 'impostor' && requestMade && (
              <div className="flex flex-wrap gap-2 border-t border-white/8 bg-amber-400/5 px-3 py-2.5">
                <Button className="flex-1 rounded-xl" onClick={() => decide('transfer')} size="sm" variant="destructive"><WalletCards /> Chuyển 480.000đ</Button>
                <Button className="flex-1 rounded-xl border-emerald-400/25 text-emerald-300" onClick={() => decide('report')} size="sm" variant="outline"><Flag /> Từ chối & báo cáo</Button>
                {!deferred && <Button className="rounded-xl" onClick={() => decide('delay')} size="sm" variant="ghost"><Clock3 /> Để sau</Button>}
              </div>
            )}

            <form className="border-t border-white/8 bg-background/30 p-3" onSubmit={sendMessage}>
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-background/60 p-1.5 pl-4 focus-within:border-primary/45">
                <input aria-label="Nhập tin nhắn" autoComplete="off" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" disabled={Boolean(ending)} onChange={(event) => setInput(event.target.value)} placeholder={activeContact === 'impostor' ? 'Bạn muốn hỏi gì cũng được...' : `Nhắn ${active.name}...`} value={input} />
                <Button aria-label="Gửi tin nhắn" className="size-9 rounded-xl" disabled={!input.trim() || typing} size="icon" type="submit"><Send /></Button>
              </div>
              <p className="mt-2 text-center text-[10px] text-muted-foreground">Tình huống mô phỏng · Không sử dụng thông tin hoặc tiền thật</p>
            </form>
          </div>

          <aside className="space-y-4 rounded-2xl border border-white/8 bg-card/65 p-4">
            <div>
              <Badge className="mb-3 border-sky-400/20 bg-sky-400/8 text-sky-300" variant="outline">Mục tiêu hiện tại</Badge>
              <h1 className="text-xl font-semibold leading-tight tracking-[-0.035em]">Xác minh người đang nhắn</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Người này biết đúng tên, lớp và bài lab — nhưng những dữ kiện đó có đủ chứng minh danh tính không?</p>
            </div>

            <div className="grid gap-2">
              <Button className="h-11 justify-start rounded-xl" disabled={checkedActions.includes('call')} onClick={() => runAction('call')} variant="outline"><Phone className="text-emerald-400" /> {checkedActions.includes('call') ? 'Đã gọi số cũ' : 'Gọi số cũ của Minh'} {checkedActions.includes('call') && <Check className="ml-auto" />}</Button>
              <Button className="h-11 justify-start rounded-xl" disabled={checkedActions.includes('group')} onClick={() => runAction('group')} variant="outline"><Users className="text-sky-400" /> {checkedActions.includes('group') ? 'Đã hỏi nhóm lớp' : 'Hỏi trong nhóm lớp'} {checkedActions.includes('group') && <Check className="ml-auto" />}</Button>
              <Button className="h-11 justify-start rounded-xl" disabled={checkedActions.includes('dung')} onClick={() => runAction('dung')} variant="outline"><MessageCircle className="text-violet-400" /> {checkedActions.includes('dung') ? 'Đã hỏi Dũng' : 'Nhắn Dũng hỏi thêm'} {checkedActions.includes('dung') && <Check className="ml-auto" />}</Button>
              <Button className="h-10 justify-start rounded-xl text-muted-foreground" onClick={() => decide('block')} variant="ghost"><Ban /> Chặn số ngay</Button>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[0.13em] text-muted-foreground">Dấu hiệu đã ghi nhận</p><Badge variant="secondary">{evidence.length}</Badge></div>
              {evidence.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 p-3 text-xs leading-relaxed text-muted-foreground">Chưa đủ dữ kiện. Hãy hỏi hoặc kiểm tra qua một kênh khác.</div>
              ) : (
                <div className="space-y-2">{evidence.slice(-3).map((item) => <div className="rounded-xl border border-white/8 bg-background/30 p-3" key={item.id}><p className="flex items-center gap-2 text-xs font-medium">{item.strength === 'strong' ? <ShieldCheck className="size-3.5 text-emerald-300" /> : <CircleAlert className="size-3.5 text-amber-300" />}{item.title}</p><p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{item.detail}</p></div>)}</div>
              )}
            </div>

            <div className="rounded-xl border border-primary/15 bg-primary/6 p-3">
              <p className="text-xs font-medium text-primary">Gợi ý kín</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Hãy hỏi một điều chỉ Minh thật mới biết. Game quan sát cách bạn xác minh, không chấm từ khóa.</p>
            </div>

            {strongEvidence && requestMade && <Button className="h-11 w-full rounded-xl" onClick={() => decide('report')}>Kết luận tình huống <ChevronRight /></Button>}
          </aside>
        </section>
      </div>
    </main>
  );
}
