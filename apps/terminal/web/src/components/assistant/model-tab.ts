/* The model picker's filter pill (All, Local, Remote or one provider), remembered per browser
   (localStorage), so reopening the picker shows what the person last looked at. A blocked or
   full store remembers nothing: the picker then starts on All. */
const KEY = "reconix.assistant.modelTab";

export function rememberedTab(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const kept = window.localStorage.getItem(KEY);
    return typeof kept === "string" && kept !== "" ? kept : null;
  } catch {
    return null;
  }
}

export function rememberTab(tab: string): void {
  try {
    window.localStorage.setItem(KEY, tab);
  } catch {
    // blocked or full: nothing is remembered
  }
}
