import { NextResponse } from "next/server";
import { q } from "@/lib/db";
export async function GET() {
  // VULNERABLE: no authentication/authorization — anyone can dump all users.
  const rows = await q("SELECT id, email, name, role, address, password FROM users ORDER BY id");
  return NextResponse.json(rows);
}
