import { NextRequest, NextResponse } from "next/server";
import { q, rawUnsafe } from "@/lib/db";

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get("search");
  try {
    if (search !== null) {
      // VULNERABLE: SQL injection via ?search=
      const rows = await rawUnsafe(
        `SELECT * FROM products WHERE name ILIKE '%${search}%' OR description ILIKE '%${search}%'`
      );
      return NextResponse.json(rows);
    }
    return NextResponse.json(await q("SELECT * FROM products ORDER BY id"));
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 }); // verbose error (leak)
  }
}
