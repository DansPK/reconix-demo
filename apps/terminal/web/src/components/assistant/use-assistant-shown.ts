/* Whether the AI Assistant is on screen. Its stage stays mounted (hidden and inert) while
   another view shows, so what is open in it would outlive leaving it: the stage provides this
   (assistant-stage.tsx: on, and the address names the assistant), and what must not stay open
   behind it (the model picker, with a key typed in it: model-chip.tsx) closes when it turns
   false. True outside the stage. */
import { createContext, useContext } from "react";

export const AssistantShown = createContext(true);

/** Whether the AI Assistant is on screen now. */
export const useAssistantShown = () => useContext(AssistantShown);
