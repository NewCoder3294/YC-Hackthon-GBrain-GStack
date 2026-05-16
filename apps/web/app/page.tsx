import type { Metadata } from "next";
import { Landing } from "./landing";

export const metadata: Metadata = {
  title: "WatchDog — real-time crime intelligence for dispatchers",
  description:
    "Incident fusion, institutional memory, and policy-as-code consent for municipal real-time crime centers.",
};

export default function LandingPage() {
  return <Landing />;
}
