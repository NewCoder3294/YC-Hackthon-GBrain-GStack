"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const ackSchema = z.object({ id: z.string().uuid() });

// Mark a live_incidents row as acknowledged by the current user. RLS
// permits any authenticated user to update; we set acknowledged_by to
// the current auth user so the audit trail is honest.
export async function acknowledgeLiveIncident(input: z.infer<typeof ackSchema>) {
  const parsed = ackSchema.parse(input);
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) throw new Error("not signed in");
  const { error } = await supabase
    .from("live_incidents")
    .update({
      acknowledged_at: new Date().toISOString(),
      acknowledged_by: user.user.id,
    })
    .eq("id", parsed.id);
  if (error) throw new Error(error.message);
  revalidatePath("/live");
  revalidatePath(`/live/${parsed.id}`);
}

export async function unacknowledgeLiveIncident(
  input: z.infer<typeof ackSchema>,
) {
  const parsed = ackSchema.parse(input);
  const supabase = await createClient();
  const { error } = await supabase
    .from("live_incidents")
    .update({ acknowledged_at: null, acknowledged_by: null })
    .eq("id", parsed.id);
  if (error) throw new Error(error.message);
  revalidatePath("/live");
  revalidatePath(`/live/${parsed.id}`);
}
