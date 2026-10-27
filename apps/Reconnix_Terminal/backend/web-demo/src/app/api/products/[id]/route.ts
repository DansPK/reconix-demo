import { NextResponse } from "next/server";
import { rawUnsafe } from "@/lib/db";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const rows = await rawUnsafe(`SELECT * FROM products WHERE id = ${id}`); // VULNERABLE: SQLi
    return rows[0] ? NextResponse.json(rows[0]) : NextResponse.json({ error: "not found" }, { status: 404 });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
