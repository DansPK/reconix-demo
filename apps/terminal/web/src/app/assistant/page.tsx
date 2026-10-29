/* A short address for the AI Assistant, which lives on the dashboard page (`?view=assistant`).
   Anyone signed in may open it (src/proxy.ts checks the session first, this page again). */
import { redirect } from "next/navigation";

import { ASSISTANT_VIEW } from "@/lib/assistant/paths";

export default async function AssistantPage() {
  redirect(ASSISTANT_VIEW);
}
