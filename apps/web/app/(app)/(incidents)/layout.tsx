import { IncidentClusterTabs } from "@/components/app-shell/cluster-tabs";

export default function IncidentsClusterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <IncidentClusterTabs />
      {children}
    </>
  );
}
