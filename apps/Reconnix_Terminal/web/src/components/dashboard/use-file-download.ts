"use client";

/* Fetching a report file, then saving it, for the Report view: the combined report's Generate
   PDF / DOCX, one run's downloads and the runs table's. A file is fetched rather than linked so
   that a refusal is shown, not saved: the whole file is awaited, then that one blob downloads;
   a 501 on a PDF (no browser to print with) offers the Word document, a 413 on a DOCX
   (DOCX_TOO_LARGE) says why, and any other failure or a timeout offers Retry (report-file.tsx
   shows each). One request at a time per owner: a new one aborts the one in flight, and answers
   to an older request are dropped. */
import { useCallback, useEffect, useRef, useState } from "react";

import { EXPORT_FILES, type FileState } from "@/components/dashboard/report-file";
import { DOCX_TOO_LARGE, type ExportFormat, NO_PRINTER } from "@/lib/report/formats";

/** A refused response's JSON `detail`, when it has one. */
export async function detailOf(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    if (typeof body.detail === "string" && body.detail) return body.detail;
  } catch {
    /* not JSON */
  }
  return null;
}

/** Why a response was refused, from its JSON `detail` when it has one. */
export async function describe(res: Response): Promise<string> {
  return (await detailOf(res)) ?? `The dashboard answered ${res.status}.`;
}

/** Save a fetched file under `name` (one click on a temporary link to the blob). */
function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const fileNameOf = (disposition: string | null) => disposition?.match(/filename="([A-Za-z0-9._-]+)"/)?.[1] ?? null;

/** A fetch that gives up after `ms` (and when `signal` aborts). */
export function fetchWithin(href: string, ms: number, signal: AbortSignal, accept: string): Promise<Response> {
  const timeout = AbortSignal.timeout(ms);
  return fetch(href, { credentials: "same-origin", headers: { accept }, signal: AbortSignal.any([signal, timeout]) });
}

export interface Ticket {
  signal: AbortSignal;
  /** Whether this is still the current request. */
  mine: () => boolean;
  /** Frees the slot (only if this request still holds it). */
  done: () => void;
}

/** One request at a time: `begin()` aborts the one in flight and hands out the new one's ticket. */
export function useOneRequest() {
  const inflight = useRef<AbortController | null>(null);
  const serial = useRef(0); // the current request's number: answers to an older one are dropped

  const abort = useCallback(() => {
    inflight.current?.abort();
    inflight.current = null;
    serial.current += 1;
  }, []);
  useEffect(() => abort, [abort]); // unmount

  const begin = useCallback((): Ticket => {
    abort();
    const controller = new AbortController();
    inflight.current = controller;
    const id = serial.current;
    const mine = () => serial.current === id && !controller.signal.aborted;
    const done = () => {
      if (mine()) inflight.current = null;
    };
    return { signal: controller.signal, mine, done };
  }, [abort]);

  return { begin, abort };
}

/** One file to fetch and save. */
export interface FileRequest {
  format: ExportFormat;
  href: string;
  /** The Word document's address, offered when the PDF can't be printed. */
  docx: string;
  /** The name to save under when the response names none. */
  name: string;
  /** The run it is about, named in the status line (FileState `of`). */
  of?: string;
}

/** Fetches `req` under `ticket`, reporting each step through `report`, and saves the file. */
export async function fetchFile(req: FileRequest, ticket: Ticket, report: (state: FileState) => void): Promise<void> {
  const { format, of } = req;
  const spec = EXPORT_FILES[format];
  const { signal, mine } = ticket;
  report({ kind: "generating", format, of });
  try {
    const res = await fetchWithin(req.href, spec.timeoutMs, signal, spec.accept);
    if (!mine()) return;
    if (res.status === 501 || res.status === 413) {
      // the message comes from the route (the fixed one when it has none); the DOCX link is ours
      const detail = await detailOf(res);
      if (!mine()) return;
      if (res.status === 501) report({ kind: "unsupported", format, message: detail ?? NO_PRINTER, docx: req.docx, of });
      else report({ kind: "refused", format, message: detail ?? DOCX_TOO_LARGE, of });
      return;
    }
    if (!res.ok) {
      const message = await describe(res);
      if (mine()) report({ kind: "failed", format, message, of });
      return;
    }
    const blob = await res.blob();
    if (!mine()) return;
    const name = fileNameOf(res.headers.get("content-disposition")) ?? req.name;
    saveBlob(blob, name);
    report({ kind: "done", format, name, of });
  } catch (error) {
    if (!mine()) return;
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    report({ kind: "failed", format, of, message: timedOut ? (format === "pdf" ? "the printer took too long" : "the dashboard took too long") : "the dashboard could not be reached" });
  } finally {
    ticket.done();
  }
}

/** A file download with its status: `download(req)` fetches and saves one, `retry()` asks for the
    last one again. */
export function useFileDownload() {
  const { begin } = useOneRequest();
  const [file, setFile] = useState<FileState>({ kind: "idle" });
  const last = useRef<FileRequest | null>(null);

  const download = useCallback(
    (req: FileRequest) => {
      last.current = req;
      void fetchFile(req, begin(), setFile);
    },
    [begin],
  );
  const retry = useCallback(() => {
    if (last.current) download(last.current);
  }, [download]);

  return { file, download, retry, busy: file.kind === "generating" };
}
