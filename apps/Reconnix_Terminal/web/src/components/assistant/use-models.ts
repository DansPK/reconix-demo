"use client";

/* The model picker's data: the saved providers and the active choice, read when the picker
   opens; switching, adding a model ("Add model": a new provider, or a change to a saved one and
   a switch) and removing one (the provider with its last model, else a change of its list) go to
   the server, whose answer (the whole view) replaces what the picker shows and tells the
   assistant which model answers next (setModel), so the chip, the reason above the composer and
   Ask follow without a reload. One change at a time: `pending` names it (a switch:
   "<providerId>/<model>", a removal: "remove:<providerId>/<model>"). */
import { useCallback, useRef, useState } from "react";

import * as api from "@/lib/assistant/client";
import type { ModelsView } from "@/lib/assistant/models/view";
import type { AddRequests, RemoveRequest } from "./model-picker-rules";
import type { ModelSummary } from "./types";

export interface ModelsState {
  status: "idle" | "loading" | "ready" | "error";
  view: ModelsView | null;
  error: string | null;
}

/** The key of one model choice (a switch in flight). */
export const choiceKey = (providerId: string, model: string) => `${providerId}/${model}`;

export function useModels(setModel: (model: ModelSummary) => void) {
  const [state, setState] = useState<ModelsState>({ status: "idle", view: null, error: null });
  const [pending, setPending] = useState<string | null>(null);
  const busy = useRef(false);

  const take = useCallback(
    (view: ModelsView) => {
      setState({ status: "ready", view, error: null });
      setModel(view.summary);
    },
    [setModel],
  );

  const load = useCallback(() => {
    setState((s) => ({ ...s, status: s.view ? "ready" : "loading", error: null }));
    void api.listModels().then((result) => {
      if (result.ok) take(result.view);
      else setState((s) => ({ ...s, status: "error", error: result.detail }));
    });
  }, [take]);

  /** Runs one change; resolves to null when it worked, or what went wrong. A provider that is
      gone (404: removed in another tab) reloads the list, so the picker stops offering it. */
  const run = useCallback(
    async (label: string, call: () => Promise<api.ModelsAnswer>): Promise<string | null> => {
      if (busy.current) return "Another change is still being saved.";
      busy.current = true;
      setPending(label);
      try {
        const result = await call();
        if (!result.ok) {
          if (result.status === 404) load();
          return result.detail;
        }
        take(result.view);
        return null;
      } finally {
        busy.current = false;
        setPending(null);
      }
    },
    [take, load],
  );

  const choose = useCallback((providerId: string, model: string) => run(choiceKey(providerId, model), () => api.switchModel({ providerId, model })), [run]);
  /** Removes one model (`key`: its row): the provider with its last one, else from its list. */
  const remove = useCallback(
    (key: string, request: RemoveRequest) =>
      run(`remove:${key}`, () => (request.kind === "delete" ? api.removeModelProvider(request.id) : api.updateModelProvider(request.id, request.body))),
    [run],
  );
  /** "Add model": the new provider (made active as it is added), or the saved one's changes
      first (their view is shown even when the switch after them is refused) and the switch. */
  const save = useCallback(
    (requests: AddRequests) =>
      run("save", async () => {
        if (requests.kind === "add") return api.addModelProvider(requests.body);
        if (requests.body) {
          const changed = await api.updateModelProvider(requests.id, requests.body);
          if (!changed.ok) return changed;
          take(changed.view);
        }
        return api.switchModel(requests.activate);
      }),
    [run, take],
  );

  return { state, pending, load, choose, remove, save };
}

export type Models = ReturnType<typeof useModels>;
