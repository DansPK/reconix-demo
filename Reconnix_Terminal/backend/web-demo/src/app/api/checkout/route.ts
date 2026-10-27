import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { currentUser } from "@/lib/auth";
export async function POST(req: Request) {
  const { items, total } = await req.json();
  const user = await currentUser();
  const uid = user?.uid ?? 2; // demo falls back to a user
  // VULNERABLE: trusts the client-supplied `total` instead of recomputing from prices.
  const order = (await q("INSERT INTO orders (user_id, total) VALUES ($1,$2) RETURNING id", [uid, total]))[0];
  for (const it of items || []) {
    await q("INSERT INTO order_items (order_id, product_id, qty, price) VALUES ($1,$2,$3,0)", [order.id, it.product_id, it.qty]);
  }
  return NextResponse.json({ ok: true, orderId: order.id, charged: total });
}
