import Link from "next/link";
import { q } from "@/lib/db";
import { ProductCard } from "@/components/product-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function Home() {
  const products = await q("SELECT * FROM products ORDER BY id");
  return (
    <div className="space-y-10">
      <section className="rounded-2xl bg-gradient-to-br from-primary to-indigo-700 text-primary-foreground p-10 md:p-14">
        <Badge className="bg-white/20 text-white border-0">New season · free shipping</Badge>
        <h1 className="mt-4 text-4xl md:text-5xl font-bold max-w-2xl leading-tight">
          Gear that moves you forward.
        </h1>
        <p className="mt-3 max-w-xl text-white/80">
          Hand-picked tech, audio and everyday carry. Fast delivery, 30-day returns.
        </p>
        <Button asChild size="lg" variant="secondary" className="mt-6">
          <Link href="#catalog">Shop the catalog</Link>
        </Button>
      </section>

      <section id="catalog" className="space-y-4">
        <div className="flex items-end justify-between">
          <h2 className="text-2xl font-semibold">Featured products</h2>
          <span className="text-sm text-muted-foreground">{products.length} items</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((p: any) => <ProductCard key={p.id} p={p} />)}
        </div>
      </section>
    </div>
  );
}
