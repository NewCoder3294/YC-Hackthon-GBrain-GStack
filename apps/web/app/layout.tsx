import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "WatchDog",
  description: "Real-time crime intelligence for police dispatchers",
  openGraph: {
    title: "WatchDog",
    description: "Real-time crime intelligence for police dispatchers",
  },
};

// Pre-paint script — applies the dark class from localStorage BEFORE the
// page first renders, preventing the white flash on dark-mode reloads.
const themeBootScript = `try{if(localStorage.getItem('wd:dark')==='1')document.documentElement.classList.add('dark');}catch{}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
