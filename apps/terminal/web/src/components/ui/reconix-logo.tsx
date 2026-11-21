/* The Reconix ANSI Shadow wordmark drawn as SVG shapes, so it looks the same on every computer.
   Text in a <pre> broke where the browser forces a minimum font size or swaps in a font with other
   glyph widths. Built from RECONIX_ASCII: █ is a filled cell, the box-drawing characters are
   double lines. A Server Component (pure, no hooks). */
import { RECONIX_ASCII } from "@/lib/reconix-ascii";

const W = 6; // one character cell
const H = 12;
const CX = W / 2;
const CY = H / 2;
const DX = 1.4; // half the gap between the two lines of ║ and the corners
const DY = 2.4;

const LINES = RECONIX_ASCII.split("\n");
export const LOGO_VIEWBOX = { width: Math.max(...LINES.map((l) => l.length)) * W, height: LINES.length * H };

/** Path for one box-drawing character, relative to its cell. Empty for anything else. */
function boxPath(ch: string): string {
  switch (ch) {
    case "═":
      return `M0 ${CY - DY}H${W}M0 ${CY + DY}H${W}`;
    case "║":
      return `M${CX - DX} 0V${H}M${CX + DX} 0V${H}`;
    case "╔":
      return `M${W} ${CY - DY}H${CX - DX}V${H}M${W} ${CY + DY}H${CX + DX}V${H}`;
    case "╗":
      return `M0 ${CY - DY}H${CX + DX}V${H}M0 ${CY + DY}H${CX - DX}V${H}`;
    case "╚":
      return `M${W} ${CY + DY}H${CX - DX}V0M${W} ${CY - DY}H${CX + DX}V0`;
    case "╝":
      return `M0 ${CY + DY}H${CX + DX}V0M0 ${CY - DY}H${CX - DX}V0`;
    default:
      return "";
  }
}

/** One row as a filled-rectangle path (runs of █ joined) and a line path (box characters). */
function rowShapes(line: string, row: number): { fill: string; stroke: string } {
  let fill = "";
  let stroke = "";
  const y = row * H;
  for (let x = 0; x < line.length; ) {
    if (line[x] === "█") {
      let end = x;
      while (line[end] === "█") end++;
      fill += `M${x * W} ${y}h${(end - x) * W}v${H}h${-(end - x) * W}z`;
      x = end;
      continue;
    }
    const p = boxPath(line[x]);
    if (p) {
      // a path moved to this cell: shift every absolute coordinate by the cell origin
      stroke += `<${x * W},${y}>${p}`;
    }
    x++;
  }
  return { fill, stroke: shiftStroke(stroke) };
}

/** Turn the `<ox,oy>path` pieces into one path with absolute coordinates. */
function shiftStroke(raw: string): string {
  return raw
    .split("<")
    .filter(Boolean)
    .map((piece) => {
      const [origin, path] = piece.split(">");
      const [ox, oy] = origin.split(",").map(Number);
      return path.replace(/([MHVL])(-?[\d.]+)(?: (-?[\d.]+))?/g, (_m, cmd: string, a: string, b?: string) => {
        if (cmd === "M" || cmd === "L") return `${cmd}${ox + Number(a)} ${oy + Number(b)}`;
        if (cmd === "H") return `H${ox + Number(a)}`;
        return `V${oy + Number(a)}`;
      });
    })
    .join("");
}

const ROWS = LINES.map(rowShapes);

export function ReconixLogo({
  className,
  rowClassName,
  decorative = false,
  ...rest
}: {
  className?: string;
  /** Class for each row's group (the splash animates the rows one by one). */
  rowClassName?: string;
  /** True when a parent already names the logo for screen readers. */
  decorative?: boolean;
} & Omit<React.SVGProps<SVGSVGElement>, "className">) {
  return (
    <svg
      viewBox={`0 0 ${LOGO_VIEWBOX.width} ${LOGO_VIEWBOX.height}`}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : "Reconix"}
      aria-hidden={decorative ? true : undefined}
      className={className}
      fill="currentColor"
      {...rest}
    >
      {ROWS.map((r, i) => (
        <g key={i} className={rowClassName} style={{ "--i": i } as React.CSSProperties}>
          <path d={r.fill} shapeRendering="crispEdges" />
          <path d={r.stroke} fill="none" stroke="currentColor" strokeWidth={1.1} />
        </g>
      ))}
    </svg>
  );
}
