import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "英検ライティング用紙",
  description: "英検ライティング問題用紙と解答用紙のPDFプレビューとダウンロード",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
