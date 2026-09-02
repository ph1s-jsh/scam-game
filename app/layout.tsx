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
  metadataBase: new URL(process.env.SITE_ORIGIN ?? 'http://localhost:3000'),
  title: 'Phòng 203 — Game mô phỏng phòng chống lừa đảo',
  description:
    'Trò chơi hội thoại giúp người trẻ luyện kỹ năng xác minh danh tính trong đời sống số.',
  openGraph: {
    title: 'Phòng 203',
    description: 'Một tin nhắn quen. Một người chưa chắc quen.',
    images: [{ url: '/og.png', width: 1672, height: 941, alt: 'Phòng 203 — game mô phỏng chống lừa đảo' }],
    locale: 'vi_VN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Phòng 203',
    description: 'Một tin nhắn quen. Một người chưa chắc quen.',
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
