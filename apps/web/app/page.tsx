import type { Metadata } from "next";
import { Landing } from "./landing";

export const metadata: Metadata = {
  title: "WatchDog — real-time SF safety intelligence",
  description:
    "Open-source OSINT dashboard for San Francisco. Live SFPD, SFFD, and 311 calls plotted on one map, alongside Caltrans cameras and neighborhood news. Built for residents.",
  openGraph: {
    title: "WatchDog — real-time SF safety intelligence",
    description:
      "Live SFPD, SFFD, and 311 calls plotted on one map, alongside Caltrans cameras and neighborhood news. Built for SF residents.",
    type: "website",
    locale: "en_US",
    siteName: "WatchDog",
  },
  twitter: {
    card: "summary_large_image",
    title: "WatchDog — real-time SF safety intelligence",
    description:
      "Open-source OSINT dashboard for San Francisco. Live SFPD, SFFD, 311, Caltrans cameras.",
  },
};

export default function LandingPage() {
  return <Landing />;
}
