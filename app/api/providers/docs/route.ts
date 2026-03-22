import { NextRequest, NextResponse } from "next/server";
import { getService, fetchServiceDocumentation } from "@/lib/dynamic-providers";

/**
 * GET /api/providers/docs?provider=<provider-id>
 * Fetch documentation for a specific provider
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const providerId = searchParams.get("provider");

    if (!providerId) {
      return NextResponse.json(
        { error: "Provider ID is required" },
        { status: 400 }
      );
    }

    const service = getService(providerId);
    if (!service) {
      return NextResponse.json(
        { error: `Provider ${providerId} not found` },
        { status: 404 }
      );
    }

    const documentation = await fetchServiceDocumentation(providerId);

    return NextResponse.json({
      provider: providerId,
      service,
      documentation,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Eagle Eye] Error fetching provider documentation:", err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
