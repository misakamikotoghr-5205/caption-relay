import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "字幕交接台 Caption Relay",
  description: "字幕时间约束检查、AI 文字建议和可回溯交接报告。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
