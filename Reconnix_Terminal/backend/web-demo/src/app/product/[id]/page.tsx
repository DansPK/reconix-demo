import { notFound } from "next/navigation";
import { rawUnsafe, q } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { money } from "@/lib/utils";
import { ReviewForm } from "./review-form";

export const dynamic = "force-dynamic";

export default async function Product({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await rawUnsafe(`SELECT * FROM products WHERE id = ${id}`).catch(() => []); // VULNERABLE: SQLi
  const p = rows[0];
  if (!p) return notFound();
  const reviews = await q("SELECT * FROM reviews WHERE product_id = $1 ORDER BY id DESC", [p.id]);
  return (
    <div className="grid md:grid-cols-2 gap-10">
      <div className="aspect-square rounded-2xl flex items-center justify-center bg-gradient-to-br from-accent to-secondary text-[10rem]">
        {p.emoji}
      </div>
      <div>
        <Badge>{p.category}</Badge>
        <h1 className="mt-3 text-3xl font-bold">{p.name}</h1>
        <div className="mt-2 text-2xl font-semibold text-primary">{money(p.price)}</div>
        <p className="mt-4 text-muted-foreground">{p.description}</p>
        <div className="mt-6 flex gap-3">
          <Button size="lg">Add to cart</Button>
          <Button size="lg" variant="outline">Buy now</Button>
        </div>
        <div className="mt-4 text-sm text-muted-foreground">{p.stock} in stock · ⭐ {p.rating}</div>

        <h2 className="mt-10 text-lg font-semibold">Reviews</h2>
        <div className="mt-3 space-y-3">
          {reviews.map((r: any) => (
            <Card key={r.id}><CardContent className="p-4">
              <div className="text-sm font-medium">{r.author} · {"★".repeat(r.stars)}</div>
              {/* VULNERABLE: stored XSS — review body rendered as raw HTML. */}
              <div className="mt-1 text-sm text-muted-foreground" dangerouslySetInnerHTML={{ __html: r.body }} />
            </CardContent></Card>
          ))}
          {reviews.length === 0 && <p className="text-sm text-muted-foreground">No reviews yet.</p>}
        </div>
        <ReviewForm productId={p.id} />
      </div>
    </div>
  );
}
