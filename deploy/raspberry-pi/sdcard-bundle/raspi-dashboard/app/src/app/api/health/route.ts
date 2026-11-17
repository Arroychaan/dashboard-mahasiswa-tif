import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "~/server/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json(
      {
        status: "ok",
        timestamp: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, private",
        },
      },
    );
  } catch {
    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, private",
        },
      },
    );
  }
}

