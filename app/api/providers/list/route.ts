import { NextResponse } from "next/server";
import { getAllServices } from "@/lib/dynamic-providers";

/**
 * GET /api/providers/list
 * List all available providers with their metadata
 */
export async function GET() {
  try {
    const services = getAllServices();

    return NextResponse.json({
      providers: services,
      count: services.length,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[Eagle Eye] Error listing providers:", err);
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
