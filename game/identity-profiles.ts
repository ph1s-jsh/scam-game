import type { CharacterId } from './types';

export type IdentityProfile = {
  id: string;
  name: string;
  initials: string;
  color: string;
  channel: string;
  addressLabel: string;
  addressValue: string;
  savedLabel: string;
  accountAge: string;
  history: string;
  connections: string;
  activity: string[];
  members?: string[];
  linkedThreadId?: string;
  linkedCallId?: string;
};

type ScenarioIdentities = {
  profiles: Record<string, IdentityProfile>;
  threads: Record<string, string>;
  calls: Record<string, string>;
  groupSenders: Record<string, string>;
};

const identities: Record<CharacterId, ScenarioIdentities> = {
  hanh: {
    profiles: {
      family: {
        id: 'hanh-family-profile',
        name: 'Nhóm gia đình',
        initials: 'N',
        color: 'bg-cyan-500',
        channel: 'Nhóm trò chuyện',
        addressLabel: 'Thành viên',
        addressValue: '3 người',
        savedLabel: 'Đã ghim trong Tin nhắn',
        accountAge: 'Tạo từ tháng 3/2021',
        history: 'Ảnh, cuộc gọi và tin nhắn gia đình trong nhiều năm',
        connections: 'Bà Hạnh, An và Bảo',
        activity: ['Tên nhóm chưa thay đổi gần đây', 'Thông báo nhóm đang bật'],
        members: [
          'Bà Hạnh · chủ điện thoại',
          'An · cháu gái',
          'Bảo · cháu trai',
        ],
        linkedThreadId: 'hanh-family',
      },
      anPhone: {
        id: 'hanh-an-phone',
        name: 'An',
        initials: 'A',
        color: 'bg-sky-500',
        channel: 'Tin nhắn điện thoại',
        addressLabel: 'Số điện thoại',
        addressValue: '••• ••• 203',
        savedLabel: 'Đã lưu · Cháu gái',
        accountAge: 'Lưu trong danh bạ từ năm 2019',
        history: 'Có lịch sử tin nhắn và cuộc gọi gia đình',
        connections: 'Cùng Nhóm gia đình',
        activity: [
          'Cuộc gọi gần nhất: Chủ nhật',
          'Không có thay đổi liên hệ gần đây',
        ],
        linkedThreadId: 'hanh-an-real',
        linkedCallId: 'hanh-call-an',
      },
      anNew: {
        id: 'hanh-an-new-profile',
        name: 'An',
        initials: 'A',
        color: 'bg-indigo-500',
        channel: 'Tin nhắn điện thoại',
        addressLabel: 'Số điện thoại',
        addressValue: '+84 ••• ••• 781',
        savedLabel: 'Chưa lưu trong danh bạ',
        accountAge: 'Cuộc trò chuyện bắt đầu hôm nay',
        history: 'Chưa có tin nhắn hoặc cuộc gọi trước đó',
        connections: 'Không có liên hệ chung được hiển thị',
        activity: ['Tên “An” do người gửi tự đặt', 'Không có ảnh liên hệ'],
        linkedThreadId: 'hanh-an-new',
      },
      baoSocial: {
        id: 'hanh-bao-may',
        name: 'Bảo',
        initials: 'B',
        color: 'bg-emerald-500',
        channel: 'Tài khoản Mây',
        addressLabel: 'Tên người dùng',
        addressValue: '@bao.nguyen',
        savedLabel: 'Đã kết bạn',
        accountAge: 'Tham gia từ tháng 8/2021',
        history: 'Có ảnh cũ và lịch sử trò chuyện gia đình',
        connections: '12 người quen chung',
        activity: [
          'Ảnh đại diện được dùng hơn một năm',
          'Không đổi tên hiển thị gần đây',
        ],
        linkedThreadId: 'hanh-bao-social',
        linkedCallId: 'hanh-call-bao',
      },
      baoPhone: {
        id: 'hanh-bao-phone',
        name: 'Bảo',
        initials: 'B',
        color: 'bg-emerald-500',
        channel: 'Danh bạ điện thoại',
        addressLabel: 'Số điện thoại',
        addressValue: '••• ••• 914',
        savedLabel: 'Đã lưu · Cháu trai',
        accountAge: 'Lưu trong danh bạ từ năm 2020',
        history: 'Có lịch sử cuộc gọi gia đình',
        connections: 'Cùng Nhóm gia đình',
        activity: ['Cuộc gọi gần nhất: Thứ hai', 'Số liên hệ chưa thay đổi'],
        linkedCallId: 'hanh-call-bao',
      },
      pharmacy: {
        id: 'hanh-pharmacy-profile',
        name: 'Nhà thuốc Minh Tâm',
        initials: 'M',
        color: 'bg-teal-600',
        channel: 'Tin nhắn doanh nghiệp',
        addressLabel: 'Mã người gửi',
        addressValue: 'MINHTAM',
        savedLabel: 'Không lưu trong danh bạ',
        accountAge: 'Hồ sơ doanh nghiệp hoạt động từ năm 2018',
        history: 'Có một tin giao thuốc từ tháng trước',
        connections: 'Số cửa hàng xuất hiện trên hóa đơn cũ',
        activity: ['Danh mục: Nhà thuốc', 'Giờ hoạt động: 07:00–21:30'],
        linkedThreadId: 'hanh-pharmacy',
        linkedCallId: 'hanh-call-pharmacy',
      },
    },
    threads: {
      'hanh-family': 'family',
      'hanh-an-real': 'anPhone',
      'hanh-an-new': 'anNew',
      'hanh-bao-social': 'baoSocial',
      'hanh-pharmacy': 'pharmacy',
    },
    calls: {
      'hanh-call-an': 'anPhone',
      'hanh-call-bao': 'baoPhone',
      'hanh-call-pharmacy': 'pharmacy',
    },
    groupSenders: { an: 'anPhone', bảo: 'baoPhone' },
  },
  an: {
    profiles: {
      family: {
        id: 'an-family-profile',
        name: 'Nhóm gia đình',
        initials: 'N',
        color: 'bg-cyan-500',
        channel: 'Nhóm trò chuyện',
        addressLabel: 'Thành viên',
        addressValue: '3 người',
        savedLabel: 'Đã ghim trong Tin nhắn',
        accountAge: 'Tạo từ tháng 3/2021',
        history: 'Ảnh, cuộc gọi và tin nhắn gia đình trong nhiều năm',
        connections: 'Bà Hạnh, An và Bảo',
        activity: ['Tên nhóm chưa thay đổi gần đây', 'Thông báo nhóm đang bật'],
        members: ['Bà Hạnh · bà ngoại', 'An · chủ điện thoại', 'Bảo · em trai'],
        linkedThreadId: 'an-family',
      },
      hanhPhone: {
        id: 'an-hanh-phone',
        name: 'Bà Hạnh',
        initials: 'H',
        color: 'bg-rose-400',
        channel: 'Tin nhắn điện thoại',
        addressLabel: 'Số điện thoại',
        addressValue: '••• ••• 412',
        savedLabel: 'Đã lưu · Bà ngoại',
        accountAge: 'Lưu trong danh bạ từ năm 2018',
        history: 'Có lịch sử tin nhắn và cuộc gọi gia đình',
        connections: 'Cùng Nhóm gia đình',
        activity: ['Cuộc gọi gần nhất: Hôm qua', 'Số liên hệ chưa thay đổi'],
        linkedThreadId: 'an-hanh',
        linkedCallId: 'an-call-hanh',
      },
      baoSocial: {
        id: 'an-bao-may',
        name: 'Bảo',
        initials: 'B',
        color: 'bg-emerald-500',
        channel: 'Tài khoản Mây',
        addressLabel: 'Tên người dùng',
        addressValue: '@bao.nguyen',
        savedLabel: 'Đã kết bạn',
        accountAge: 'Tham gia từ tháng 8/2021',
        history: 'Có ảnh cũ và lịch sử trò chuyện giữa hai chị em',
        connections: '12 người quen chung',
        activity: [
          'Ảnh đại diện được dùng hơn một năm',
          'Không đổi tên hiển thị gần đây',
        ],
        linkedThreadId: 'an-bao-social',
        linkedCallId: 'an-call-bao',
      },
      baoPhone: {
        id: 'an-bao-phone',
        name: 'Bảo',
        initials: 'B',
        color: 'bg-emerald-500',
        channel: 'Danh bạ điện thoại',
        addressLabel: 'Số điện thoại',
        addressValue: '••• ••• 914',
        savedLabel: 'Đã lưu · Em trai',
        accountAge: 'Lưu trong danh bạ từ năm 2020',
        history: 'Có lịch sử cuộc gọi giữa hai chị em',
        connections: 'Cùng Nhóm gia đình',
        activity: ['Cuộc gọi gần nhất: Thứ hai', 'Số liên hệ chưa thay đổi'],
        linkedCallId: 'an-call-bao',
      },
      recruiter: {
        id: 'an-recruiter-profile',
        name: 'Chị Vy · Tuyển dụng',
        initials: 'V',
        color: 'bg-violet-500',
        channel: 'Tài khoản Mây',
        addressLabel: 'Tên người dùng',
        addressValue: '@vieclam.vy',
        savedLabel: 'Chưa lưu trong danh bạ',
        accountAge: 'Tạo cách đây 3 tuần',
        history: 'Cuộc trò chuyện bắt đầu hôm nay',
        connections: 'Không hiển thị người quen chung',
        activity: ['Danh mục: Tuyển dụng', 'Không có địa chỉ hoặc số tổng đài'],
        linkedThreadId: 'an-recruiter',
        linkedCallId: 'an-call-recruiter',
      },
      provider: {
        id: 'an-provider-profile',
        name: 'Mạng Nhà Mình',
        initials: 'M',
        color: 'bg-blue-600',
        channel: 'Thông báo dịch vụ',
        addressLabel: 'Mã người gửi',
        addressValue: 'MANGNHAMINH',
        savedLabel: 'Dịch vụ đang sử dụng',
        accountAge: 'Thuê bao P203-08 hoạt động từ năm 2022',
        history: 'Có hóa đơn và thông báo các tháng trước',
        connections: 'Liên kết với hợp đồng Internet gia đình',
        activity: ['Kỳ cước: Tháng 8', 'Kênh này không nhận cuộc gọi'],
        linkedThreadId: 'an-provider',
      },
    },
    threads: {
      'an-family': 'family',
      'an-hanh': 'hanhPhone',
      'an-bao-social': 'baoSocial',
      'an-recruiter': 'recruiter',
      'an-provider': 'provider',
    },
    calls: {
      'an-call-hanh': 'hanhPhone',
      'an-call-bao': 'baoPhone',
      'an-call-recruiter': 'recruiter',
    },
    groupSenders: { 'bà hạnh': 'hanhPhone', bảo: 'baoPhone' },
  },
  bao: {
    profiles: {
      family: {
        id: 'bao-family-profile',
        name: 'Nhóm gia đình',
        initials: 'N',
        color: 'bg-cyan-500',
        channel: 'Nhóm trò chuyện',
        addressLabel: 'Thành viên',
        addressValue: '3 người',
        savedLabel: 'Đã ghim trong Tin nhắn',
        accountAge: 'Tạo từ tháng 3/2021',
        history: 'Ảnh, cuộc gọi và tin nhắn gia đình trong nhiều năm',
        connections: 'Bà Hạnh, An và Bảo',
        activity: ['Tên nhóm chưa thay đổi gần đây', 'Thông báo nhóm đang bật'],
        members: ['Bà Hạnh · bà ngoại', 'An · chị gái', 'Bảo · chủ điện thoại'],
        linkedThreadId: 'bao-family',
      },
      hanhPhone: {
        id: 'bao-hanh-phone',
        name: 'Bà Hạnh',
        initials: 'H',
        color: 'bg-rose-400',
        channel: 'Tin nhắn điện thoại',
        addressLabel: 'Số điện thoại',
        addressValue: '••• ••• 412',
        savedLabel: 'Đã lưu · Bà ngoại',
        accountAge: 'Lưu trong danh bạ từ năm 2018',
        history: 'Có lịch sử tin nhắn và cuộc gọi gia đình',
        connections: 'Cùng Nhóm gia đình',
        activity: ['Cuộc gọi gần nhất: Hôm qua', 'Số liên hệ chưa thay đổi'],
        linkedThreadId: 'bao-hanh',
        linkedCallId: 'bao-call-hanh',
      },
      anSocial: {
        id: 'bao-an-may',
        name: 'An',
        initials: 'A',
        color: 'bg-sky-500',
        channel: 'Tài khoản Mây',
        addressLabel: 'Tên người dùng',
        addressValue: '@an.nguyen',
        savedLabel: 'Đã kết bạn',
        accountAge: 'Tham gia từ tháng 5/2020',
        history: 'Có ảnh cũ và lịch sử trò chuyện giữa hai chị em',
        connections: '28 người quen chung',
        activity: [
          'Ảnh đại diện được dùng 8 tháng',
          'Không đổi tên hiển thị gần đây',
        ],
        linkedThreadId: 'bao-an-social',
        linkedCallId: 'bao-call-an',
      },
      anPhone: {
        id: 'bao-an-phone',
        name: 'An',
        initials: 'A',
        color: 'bg-sky-500',
        channel: 'Tin nhắn điện thoại',
        addressLabel: 'Số điện thoại',
        addressValue: '••• ••• 203',
        savedLabel: 'Đã lưu · Chị gái',
        accountAge: 'Lưu trong danh bạ từ năm 2019',
        history: 'Có lịch sử SMS và cuộc gọi gia đình',
        connections: 'Cùng Nhóm gia đình',
        activity: ['Cuộc gọi gần nhất: Chủ nhật', 'Số liên hệ chưa thay đổi'],
        linkedThreadId: 'bao-an-sms',
        linkedCallId: 'bao-call-an',
      },
      fakeSupport: {
        id: 'bao-fake-support-profile',
        name: 'Hỗ trợ Arena Star',
        initials: 'AS',
        color: 'bg-purple-600',
        channel: 'Trang cộng đồng',
        addressLabel: 'Tên người dùng',
        addressValue: '@arenastar.hotro',
        savedLabel: 'Chưa theo dõi',
        accountAge: 'Tạo hôm qua',
        history: 'Cuộc trò chuyện bắt đầu hôm nay',
        connections: '14 người theo dõi · không có bạn chung',
        activity: [
          'Tên trước đây: “Arena Gift 24h”',
          'Đổi ảnh đại diện hôm nay',
        ],
        linkedThreadId: 'bao-fake-support',
      },
      officialGame: {
        id: 'bao-game-official-profile',
        name: 'Arena Star',
        initials: 'AS',
        color: 'bg-blue-600',
        channel: 'Hộp thư trong game',
        addressLabel: 'Mã người gửi',
        addressValue: 'ARENA-SYSTEM',
        savedLabel: 'Kênh hệ thống của ứng dụng',
        accountAge: 'Có từ khi cài trò chơi',
        history: 'Có thông báo cập nhật và giải đấu trước đây',
        connections: 'Liên kết với tài khoản game trên thiết bị',
        activity: [
          'Tin hệ thống không thể trả lời',
          'Hỗ trợ mở từ bên trong ứng dụng',
        ],
        linkedThreadId: 'bao-game-official',
        linkedCallId: 'bao-call-game',
      },
    },
    threads: {
      'bao-family': 'family',
      'bao-hanh': 'hanhPhone',
      'bao-an-social': 'anSocial',
      'bao-fake-support': 'fakeSupport',
      'bao-game-official': 'officialGame',
      'bao-an-sms': 'anPhone',
    },
    calls: {
      'bao-call-hanh': 'hanhPhone',
      'bao-call-an': 'anPhone',
      'bao-call-game': 'officialGame',
    },
    groupSenders: { an: 'anPhone', 'bà hạnh': 'hanhPhone' },
  },
};

function profileForKey(characterId: CharacterId, key?: string) {
  return key ? (identities[characterId].profiles[key] ?? null) : null;
}

export function identityForThread(characterId: CharacterId, threadId: string) {
  return profileForKey(characterId, identities[characterId].threads[threadId]);
}

export function identityForCall(characterId: CharacterId, callId: string) {
  return profileForKey(characterId, identities[characterId].calls[callId]);
}

export function identityForGroupSender(
  characterId: CharacterId,
  senderLabel?: string,
) {
  if (!senderLabel) return null;
  return profileForKey(
    characterId,
    identities[characterId].groupSenders[senderLabel.toLocaleLowerCase('vi')],
  );
}
