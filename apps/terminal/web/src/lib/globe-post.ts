/**
 * The globe's post-processing (lib/globe.ts): UnrealBloom, the output pass, and a last pass that
 * takes the alpha from the light. Skipped on low-power devices and in ambient mode.
 */
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";

export function bloomComposer(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): { composer: EffectComposer; disposables: { dispose(): void }[] } {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.9, 0.6, 0.15);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  // The bloom's blur writes alpha 1 everywhere, which made the canvas an opaque black box. The
  // globe is light on black, so take the alpha from the light: black is transparent, and the
  // canvas sits on whatever is behind it (the hero, or the AI Assistant's card).
  const alpha = new ShaderPass({
    uniforms: { tDiffuse: { value: null } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
      void main(){
        vec4 c=texture2D(tDiffuse,vUv);
        float a=clamp(max(c.r,max(c.g,c.b)),0.0,1.0);
        gl_FragColor=vec4(min(c.rgb,vec3(a)),a);
      }`,
  });
  composer.addPass(alpha);
  const disposables = [bloom, alpha] as unknown as { dispose(): void }[];
  return { composer, disposables };
}
