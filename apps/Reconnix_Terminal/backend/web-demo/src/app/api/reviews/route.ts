import { NextResponse } from "next/server";
import { q } from "@/lib/db";
export async function POST(req: Request) {
  const { product_id, author, body, stars } = await req.json();
  // Stored unsanitized -> rendered as raw HTML on the product page (stored XSS).
  const rows = await q(
    "INSERT INTO reviews (product_id, author, body, stars) VALUES ($1,$2,$3,$4) RETURNING *",
    [product_id, author || "anon", body || "", stars || 5]
  );
  return NextResponse.json(rows[0]);
}
