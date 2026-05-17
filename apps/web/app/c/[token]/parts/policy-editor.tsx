import { adminClient } from "@/lib/supabase/admin";
import { PolicyEditorForm } from "./policy-editor-form";

interface CameraPolicy {
  camera_id: string;
  geofence_radius_m: number;
  window_start_local: string | null;
  window_end_local: string | null;
  warrant_required: boolean;
  exigent_allowed: boolean;
  blocked_incident_types: string[];
}

interface CameraRow {
  id: string;
  description: string;
}

export async function PolicyEditor({
  token,
  contributorId,
}: {
  token: string;
  contributorId: string;
}) {
  const supabase = adminClient();
  const { data: camerasRaw } = await supabase
    .from("cameras")
    .select("id, description")
    .eq("contributor_id", contributorId);
  const cameras = (camerasRaw ?? []) as CameraRow[];

  if (cameras.length === 0) {
    return (
      <p className="font-mono text-xs text-neutral-500">
        Register a camera before setting access policies.
      </p>
    );
  }

  const ids = cameras.map((c) => c.id);
  const { data: policiesRaw } = await supabase
    .from("camera_policies")
    .select(
      "camera_id, geofence_radius_m, window_start_local, window_end_local, warrant_required, exigent_allowed, blocked_incident_types",
    )
    .in("camera_id", ids);
  const policies = (policiesRaw ?? []) as CameraPolicy[];

  // Default profile = "balanced" (per PRD) for any camera without an explicit row.
  const cameraPolicies = cameras.map((cam) => {
    const found = policies.find((p) => p.camera_id === cam.id);
    return {
      cameraId: cam.id,
      description: cam.description,
      policy: found ?? {
        camera_id: cam.id,
        geofence_radius_m: 500,
        window_start_local: null,
        window_end_local: null,
        warrant_required: false,
        exigent_allowed: true,
        blocked_incident_types: [],
      },
    };
  });

  return <PolicyEditorForm token={token} cameras={cameraPolicies} />;
}
