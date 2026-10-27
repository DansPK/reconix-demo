// Decide what a chat message asks for. Rules are checked in order; keep them here so they are easy to change.

export type Route =
  | { kind: "github"; url: string }
  | { kind: "rescan" }
  | { kind: "scan" }
  | { kind: "switch"; provider?: string; model?: string }
  | { kind: "chat" };

const GITHUB = /https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+/;
const RESCAN = /\brescan\b|\bscan\s+again\b|\bre-scan\b/i;
const SCAN_VERB = /\b(scan|analy[sz]e|check)\b/i;
const SCAN_OBJECT = /\b(this|project|workspace|code|folder)\b/i;
const SWITCH = /\b(switch|change|use|set|select)\b/i;
// Provider ids, plus the short names people type ("use anthropic …"); same list as the harness catalog.
const PROVIDERS: Record<string, string> = {
  reconix: "reconix", default: "reconix",
  openai: "openai", gpt: "openai",
  anthropic: "anthropic", claude: "anthropic",
  deepseek: "deepseek",
  ollama: "ollama",
  openai_compatible: "openai_compatible", "openai-compatible": "openai_compatible", compatible: "openai_compatible",
};

function switchTarget(text: string): { provider?: string; model?: string } | null {
  if (!SWITCH.test(text)) return null;
  const slash = text.match(/\b([A-Za-z_][\w-]*)\/([\w.:+-]+)/); // provider/model
  const named = slash && PROVIDERS[slash[1].toLowerCase()];
  if (named) return { provider: named, model: slash[2] };
  const low = text.toLowerCase();
  for (const [name, id] of Object.entries(PROVIDERS)) {
    if (new RegExp(`\\b${name}\\b`).test(low)) {
      const after = low.match(new RegExp(`\\b${name}\\b[\\s:/]+([\\w.:+-]+)`));
      return { provider: id, model: after?.[1] };
    }
  }
  return null;
}

export function route(text: string): Route {
  const gh = text.match(GITHUB);
  if (gh) return { kind: "github", url: gh[0].replace(/[.,;:!?)]+$/, "").replace(/\.git$/, "") };
  if (RESCAN.test(text)) return { kind: "rescan" };
  const switched = switchTarget(text);
  if (switched) return { kind: "switch", ...switched };
  if (SCAN_VERB.test(text) && SCAN_OBJECT.test(text)) return { kind: "scan" };
  return { kind: "chat" };
}
