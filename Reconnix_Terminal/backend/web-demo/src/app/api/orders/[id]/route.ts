import { NextResponse } from "next/server";
import { q } from "@/lib/db";
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // VULNERABLE: BOLA/IDOR — returns ANY order by id, no ownership/authz check.
  const order = (await q("SELECT * FROM orders WHERE id = $1", [id]))[0];
  if (!order) return NextResponse.json({ error: "not found" }, { status: 404 });
  const items = await q("SELECT * FROM order_items WHERE order_id = $1", [id]);
  return NextResponse.json({ ...order, items });
}
