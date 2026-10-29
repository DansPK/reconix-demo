/**
 * Names shared by `SectionShell` (server) and `ScrollAmbient` (client).
 * Each backdrop has a `.backdrop-<name>` rule and each tint an
 * `.ambient-layer[data-tint="<name>"]` rule in `globals.css`.
 */
export const BACKDROPS = ["grid", "dots", "hazard", "scanlines", "glow", "none"] as const;
export type Backdrop = (typeof BACKDROPS)[number];

export const TINTS = ["primary", "accent", "muted"] as const;
export type Tint = (typeof TINTS)[number];
