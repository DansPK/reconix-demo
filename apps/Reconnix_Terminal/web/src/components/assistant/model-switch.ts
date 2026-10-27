/* Which word on the model that answers next the assistant shows: the page's (the server's, as of
   its last render) or the model picker's, after a switch the page doesn't know of yet. Compared by
   value, never by object: every render of the page (the live refresh too) brings a new object,
   and one the server rendered before the switch can arrive after it with the old model still in
   it, which mustn't win. Pure: browser and tests. */
import type { ModelSummary } from "./types";

/** A switch: the model the page named when it happened, and the picker's word after it. */
export interface Switched {
  from: string;
  model: ModelSummary;
}

/** Which model a summary names (its provider and model), whatever it says about its state. */
export const modelId = (m: ModelSummary) => `${m.provider}/${m.name}`;

const sameModel = (a: ModelSummary, b: ModelSummary) =>
  modelId(a) === modelId(b) && a.configured === b.configured && a.local === b.local && a.reason === b.reason;

/** The switch the picker just made, over the page's word `page`. */
export const switchOver = (page: ModelSummary, model: ModelSummary): Switched => ({ from: modelId(page), model });

/** The switch still shown over the page's word, or null once the page has caught up: it names
    another model than the one switched from, or says exactly what the picker said. From then on
    the page's word wins (drop the switch, so a later change back shows too). */
export function liveSwitch(page: ModelSummary, switched: Switched | null): Switched | null {
  if (!switched || modelId(page) !== switched.from || sameModel(page, switched.model)) return null;
  return switched;
}
