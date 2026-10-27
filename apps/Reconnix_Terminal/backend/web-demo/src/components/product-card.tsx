import Link from "next/link";
import { Star } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { money } from "@/lib/utils";

export function ProductCard({ p }: { p: any }) {
  return (
    <Link href={`/product/${p.id}`}>
      <Card className="group h-full overflow-hidden transition hover:shadow-md hover:-translate-y-0.5">
        <div className="aspect-square flex items-center justify-center bg-gradient-to-br from-accent to-secondary text-7xl">
          {p.emoji}
        </div>
        <CardContent className="p-4">
          <div className="text-xs text-muted-foreground">{p.category}</div>
          <div className="font-medium leading-tight line-clamp-1 group-hover:text-primary">{p.name}</div>
          <div className="mt-2 flex items-center justify-between">
            <span className="font-semibold">{money(p.price)}</span>
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Star className="size-3 fill-yellow-400 text-yellow-400" />{p.rating}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
