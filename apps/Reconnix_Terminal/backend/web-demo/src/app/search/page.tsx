import { ProductCard } from "@/components/product-card";
import { rawUnsafe } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  let products: any[] = [];
  let error = "";
  try {
    // VULNERABLE: user input interpolated straight into SQL (SQL injection).
    products = await rawUnsafe(
      `SELECT * FROM products WHERE name ILIKE '%${q}%' OR description ILIKE '%${q}%' ORDER BY id`
    );
  } catch (e: any) {
    error = String(e.message); // verbose DB error leak
  }
  return (
    <div className="space-y-6">
      {/* VULNERABLE: reflected XSS — query echoed as raw HTML. */}
      <h1 className="text-2xl font-semibold">
        Results for <span dangerouslySetInnerHTML={{ __html: q }} />
      </h1>
      {error && <pre className="rounded bg-red-50 text-red-700 p-3 text-sm overflow-auto">{error}</pre>}
      {products.length === 0 && !error && <p className="text-muted-foreground">No products matched.</p>}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {products.map((p: any) => <ProductCard key={p.id} p={p} />)}
      </div>
    </div>
  );
}
