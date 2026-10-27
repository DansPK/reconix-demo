import { q } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { money } from "@/lib/utils";

export const dynamic = "force-dynamic";

// VULNERABLE: broken access control — this admin page performs NO role check,
// so anyone (even anonymous) can load all customers (incl. plaintext passwords).
export default async function Admin() {
  const users = await q("SELECT id, email, password, name, role, address FROM users ORDER BY id");
  const orders = await q("SELECT o.*, u.email FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.id DESC");
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card><CardHeader><CardTitle>Customers</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {users.map((u: any) => (
            <div key={u.id} className="flex justify-between border-b pb-1">
              <span>{u.name} · {u.email} <span className="text-muted-foreground">({u.role})</span></span>
              <code className="text-muted-foreground">{u.password}</code>
            </div>
          ))}
        </CardContent>
      </Card>
      <Card><CardHeader><CardTitle>Orders</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          {orders.map((o: any) => (
            <div key={o.id} className="flex justify-between border-b pb-1">
              <span>#{o.id} · {o.email}</span><span>{money(o.total)} · {o.status}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
