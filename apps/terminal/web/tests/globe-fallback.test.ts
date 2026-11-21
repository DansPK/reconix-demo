/* GPU detection and non-GPU fallback behaviour for the hero globe (lib/globe.ts). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { hasHardwareWebGL, mountCanvas2DGlobe } from "@/lib/globe";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubDocumentWithContext(getContext: (kind: string, attrs?: unknown) => unknown) {
  vi.stubGlobal("document", {
    createElement: () => ({ getContext }),
  });
}

describe("hasHardwareWebGL", () => {
  it("returns false when WebGL context creation fails (no GPU)", () => {
    stubDocumentWithContext(() => null);
    expect(hasHardwareWebGL()).toBe(false);
  });

  it("returns false when the browser reports a CPU software renderer (SwiftShader / llvmpipe)", () => {
    const loseContext = vi.fn();
    stubDocumentWithContext(() => ({
      getExtension: (name: string) =>
        name === "WEBGL_debug_renderer_info"
          ? { UNMASKED_RENDERER_WEBGL: 0x9246 }
          : name === "WEBGL_lose_context"
            ? { loseContext }
            : null,
      getParameter: () => "Google SwiftShader",
    }));
    expect(hasHardwareWebGL()).toBe(false);
    expect(loseContext).toHaveBeenCalledTimes(1);
  });

  it("returns true for a hardware GPU renderer and releases the probe context", () => {
    const loseContext = vi.fn();
    stubDocumentWithContext(() => ({
      getExtension: (name: string) =>
        name === "WEBGL_debug_renderer_info"
          ? { UNMASKED_RENDERER_WEBGL: 0x9246 }
          : name === "WEBGL_lose_context"
            ? { loseContext }
            : null,
      getParameter: () => "ANGLE (NVIDIA GeForce RTX 4060 Direct3D11)",
    }));
    expect(hasHardwareWebGL()).toBe(true);
    expect(loseContext).toHaveBeenCalledTimes(1);
  });
});

describe("mountCanvas2DGlobe", () => {
  it("degrades cleanly to CSS glow when even 2D canvas is unavailable", () => {
    const dataset: Record<string, string> = {};
    const fakeCanvas = {
      dataset,
      getContext: () => null,
    } as unknown as HTMLCanvasElement;

    const controls = mountCanvas2DGlobe(fakeCanvas, { reducedMotion: false, lowPower: true });
    expect(dataset.globeBackend).toBe("css");
    expect(dataset.globe).toBe("still");
    expect(() => {
      controls.pause("hidden");
      controls.resume("hidden");
      controls.setAmbient(true);
      controls.setPointScale(0.5);
      controls.redraw();
      controls.destroy();
    }).not.toThrow();
  });
});
