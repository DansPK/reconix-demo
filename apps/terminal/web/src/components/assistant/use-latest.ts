"use client";

/* The latest value of something, for callbacks that must stay the same function (they read it
   when called, not when made). Updated after each render, before the browser paints. */
import { useLayoutEffect, useRef } from "react";

export function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
