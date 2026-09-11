import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.SITE_ORIGIN ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : undefined) ??
      'https://phong-203-scam-game.nhau245310.chatgpt.site',
  ),
  title: 'Ba màn hình — Một nhà, ba góc nhìn',
  description:
    'Trò chơi nhập vai trên điện thoại mô phỏng về những lựa chọn số trong đời sống thường ngày.',
  openGraph: {
    title: 'Phòng 203',
    description: 'Bạn vừa chuyển trọ. Điện thoại còn vài tin nhắn đang chờ.',
    images: [
      {
        url: '/og.png',
        width: 1672,
        height: 941,
        alt: 'Phòng 203 — một tối ở khu trọ',
      },
    ],
    locale: 'vi_VN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Phòng 203',
    description: 'Bạn vừa chuyển trọ. Điện thoại còn vài tin nhắn đang chờ.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
