import figlet from "figlet";
import { AsciiArt, type AsciiArtProps } from "@/components/ascii-art";

type Fonts = NonNullable<Parameters<typeof figlet.textSync>[1]>["font"];

export type AsciiBannerProps = Omit<AsciiArtProps, "lines" | "label"> & {
  text: string;
  /** Any font shipped in node_modules/figlet/fonts. Sections use "ANSI Shadow". */
  font?: Fonts;
  /** true = visual only (aria-hidden); the caller must provide the heading text itself. */
  decorative?: boolean;
};

/** Renders `text` with figlet and splits it into trimmed rows. Server-only (figlet reads font files). */
export function asciiLines(text: string, font: Fonts = "ANSI Shadow"): string[] {
  return figlet
    .textSync(text.toUpperCase(), { font })
    .replace(/\s+$/, "") // ANSI Shadow ends with a blank row
    .split("\n")
    .map((l) => l.trimEnd());
}


export function AsciiBanner({ text, font = "ANSI Shadow", decorative = false, ...rest }: AsciiBannerProps) {
  return <AsciiArt lines={asciiLines(text, font)} label={decorative ? undefined : text} {...rest} />;
}
