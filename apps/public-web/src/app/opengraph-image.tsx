import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/*
 * Share card for links to the site (og:image / twitter:image), rendered at
 * build time by Satori. Satori cannot read CSS variables, so the palette is
 * repeated here as literals: keep it in step with the tokens in globals.css.
 */
const palette = {
  background: "#0a0f17",
  foreground: "#e8edf5",
  muted: "#8e9bb0",
  border: "#1e2a3c",
  primary: "#2dd4bf",
  card: "#0f1622",
};

const status = [
  ["scope", "approved"],
  ["policy", "armed"],
  ["tools", "ready"],
];

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "72px 88px",
          background: palette.background,
          backgroundImage: `radial-gradient(circle at 28% 45%, rgba(45, 212, 191, 0.24), transparent 55%)`,
          color: palette.foreground,
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 22,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: palette.muted,
          }}
        >
          <div style={{ width: 10, height: 10, borderRadius: 999, background: palette.primary }} />
          
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 148,
            fontWeight: 700,
            letterSpacing: 10,
            lineHeight: 1,
            color: palette.primary,
          }}
        >
          {SITE_NAME.toUpperCase()}
        </div>
        <div style={{ marginTop: 28, fontSize: 36, letterSpacing: 2, color: palette.foreground, textTransform: "uppercase" }}>
          {SITE_TAGLINE}
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 44 }}>
          {status.map(([label, value]) => (
            <div
              key={label}
              style={{
                display: "flex",
                gap: 10,
                padding: "10px 18px",
                borderRadius: 10,
                border: `1px solid ${palette.border}`,
                background: palette.card,
                fontSize: 22,
                letterSpacing: 3,
              }}
            >
              <span style={{ color: palette.muted, textTransform: "uppercase" }}>{label}</span>
              {/* a border-drawn triangle: the bundled font has no ▸ glyph and the build must not fetch one */}
              <div
                style={{
                  width: 0,
                  height: 0,
                  alignSelf: "center",
                  borderTop: "6px solid transparent",
                  borderBottom: "6px solid transparent",
                  borderLeft: `9px solid ${palette.muted}`,
                }}
              />
              <span style={{ color: palette.primary, fontWeight: 700 }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
