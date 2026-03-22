import { NextRequest, NextResponse } from "next/server";
import { getService, registerService, inferCredentialTypes } from "@/lib/dynamic-providers";

/**
 * GET /api/providers/metadata?provider=<provider-id>
 * Get metadata and credential requirements for a provider
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

    let service = getService(providerId);

    // If provider not found, try to register it as unknown
    if (!service) {
      service = registerService(providerId, {
        name: providerId.toUpperCase(),
        category: "other",
        credentialTypes: inferCredentialTypes(providerId, "other"),
      });
    }

    return NextResponse.json({
      provider: providerId,
      metadata: service,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Eagle Eye] Error fetching provider metadata:", err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}

/**
 * POST /api/providers/metadata
 * Register a new provider with custom metadata
 */
export async function POST(req: NextRequest) {
  try {
    const { providerId, metadata } = await req.json();

    if (!providerId) {
      return NextResponse.json(
        { error: "Provider ID is required" },
        { status: 400 }
      );
    }

    const service = registerService(providerId, metadata);

    return NextResponse.json({
      provider: providerId,
      metadata: service,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Eagle Eye] Error registering provider:", err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
