import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { money } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function Account() {
  const user = await currentUser();
  if (!user) return <p>Please <Link href="/login" className="text-primary underline">sign in</Link>.</p>;
  const orders = await q("SELECT * FROM orders WHERE user_id = $1 ORDER BY id DESC", [user.uid]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Hi, {user.email.split("@")[0]}</h1>
        <p className="text-muted-foreground">Your recent orders</p>
      </div>
      <div className="space-y-3">
        {orders.map((o: any) => (
          <Card key={o.id}><CardContent className="p-4 flex justify-between">
            <div>
              {/* Order detail is fetched by id from /api/orders/[id] — IDOR lives there. */}
              <Link href={`/api/orders/${o.id}`} className="font-medium hover:text-primary">Order #{o.id}</Link>
              <div className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</div>
            </div>
            <div className="text-right"><div className="font-semibold">{money(o.total)}</div><div className="text-xs">{o.status}</div></div>
          </CardContent></Card>
        ))}
        {orders.length === 0 && <p className="text-muted-foreground">No orders yet.</p>}
      </div>
    </div>
  );
}
