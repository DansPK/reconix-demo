/* The AI Assistant's models (signed in; src/proxy.ts checks the session too). Static demo:
   one fixed built-in provider (Reconix's reconix-security-flash, the same model the TUI
   preselects) is always active and local; GET answers the picker's whole view with it,
   every change is inert (409 with a sentence — nothing is saved or sent anywhere). */
import { NextResponse } from "next/server";

import { DEMO_MODELS_VIEW } from "@/lib/api/models";
import { fail, NO_STORE, refuse } from "@/lib/assistant/access";
import { PRESETS } from "@/lib/assistant/models/presets";

export async function GET(request: Request) {
  const refused = await refuse(request, { change: false });
  if (refused) return refused;
  return NextResponse.json({ ...DEMO_MODELS_VIEW, presets: PRESETS }, { headers: NO_STORE });
}

export async function POST(request: Request) {
  const refused = await refuse(request, { change: true });
  if (refused) return refused;
  return fail("This demo answers with its built-in Reconix model; adding providers is disabled.", 409);
}
