import { IntelClusterTabs } from "@/components/app-shell/cluster-tabs";

export default function IntelClusterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <IntelClusterTabs />
      {children}
    </>
  );
}
