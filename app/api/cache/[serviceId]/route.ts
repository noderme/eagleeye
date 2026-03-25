import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { deleteEndpointMap } from "@/lib/endpoint-store";

/**
 * DELETE /api/cache/[serviceId]
 *
 * Nukes the cached endpoint map for a service, forcing full re-discovery
 * on the next scan. Useful during testing or when a service's API has changed.
 *
 * Auth: requires a logged-in user session.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { serviceId: string } }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { serviceId } = params;
  if (!serviceId || typeof serviceId !== "string") {
    return NextResponse.json({ error: "Missing serviceId" }, { status: 400 });
  }

  const service = createServiceClient();
  await deleteEndpointMap(service, serviceId);

  return NextResponse.json({
    ok: true,
    serviceId,
    message: `Cache cleared for "${serviceId}". Next scan will run full LLM discovery.`,
  });
}
