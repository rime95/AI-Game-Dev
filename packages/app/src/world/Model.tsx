import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { Box3, Color, Vector3, type Material, type Mesh, type MeshStandardMaterial, type Object3D } from 'three';

/** Models live in public/models/<pack>/ (relative so the Electron build finds them too). */
const BASE = `${import.meta.env.BASE_URL}models/`;

/** Parts of a model that can be repainted: props have one `paint` area, people four. */
export type Slot = 'paint' | 'shirt' | 'trousers' | 'hair' | 'skin';
export type Palette = Partial<Record<Slot, string>>;

/** Key colors baked into a generated model's texture, and the slot each one paints. */
interface Keys {
  red?: Slot;
  blue?: Slot;
  green?: Slot;
  skin?: Slot;
}

interface ModelInfo {
  pack: 'garage' | 'hq2';
  /** Turn that brings the model's front to +z. */
  front: number;
  keys?: Keys;
}

// Kenney furniture faces -z; Meshy models face +z; Tripo models face +x.
const KENNEY: ModelInfo = { pack: 'garage', front: Math.PI };
const MESHY = (keys?: Keys): ModelInfo => ({ pack: 'hq2', front: 0, keys });
const TRIPO = (keys?: Keys): ModelInfo => ({ pack: 'hq2', front: -Math.PI / 2, keys });
const PAINT: Keys = { red: 'paint' };

/**
 * The generated set (Higgsfield: Meshy 7 and Tripo, from GPT Image references). Each is made once
 * and reused in every stage and era; the red key areas are repainted per stage (see palettes.ts).
 */
const MODEL_INFO: Record<string, ModelInfo> = {
  desk: MESHY(PAINT),
  chair: MESHY(PAINT),
  beigePc: MESHY(),
  workbench: MESHY(PAINT),
  flatPc: TRIPO(),
  labCart: TRIPO(PAINT),
  couch: TRIPO(PAINT),
  kitchenette: TRIPO(PAINT),
  confTable: TRIPO(PAINT),
  shelving: TRIPO(PAINT),
  characterRig: TRIPO({ red: 'shirt', blue: 'trousers', green: 'hair', skin: 'skin' }),
};
const info = (name: string) => MODEL_INFO[name] ?? KENNEY;
export const modelUrl = (name: string) => `${BASE}${info(name).pack}/${name}.glb`;

/** Every model the HQ uses, so they start loading with the scene instead of one by one. */
export const HQ_MODELS = [
  ...Object.keys(MODEL_INFO),
  'cardboardBoxOpen', 'cardboardBoxClosed', 'tableCoffee', 'trashcan', 'coatRackStanding', 'pottedPlant',
];

/**
 * A model fitted into a box: `size` is width (x), height (y), depth (z) in tiles, `face` turns it
 * (0 = its front toward +z). It sits on the group's origin, centered. Uniform scale keeps the
 * model's proportions; `stretch` fills the box exactly (tables). `palette` repaints its key areas.
 */
export function FitModel({
  name,
  size,
  face = 0,
  stretch = false,
  palette,
}: {
  name: string;
  size: [number, number, number];
  face?: number;
  stretch?: boolean;
  palette?: Palette;
}) {
  const { scene } = useGLTF(modelUrl(name));
  const [sx, sy, sz] = size;
  const paint = palette ? JSON.stringify(palette) : '';
  const obj = useMemo(() => {
    const o = scene.clone(true);
    o.rotation.set(0, face + info(name).front, 0);
    o.position.set(0, 0, 0);
    o.scale.set(1, 1, 1);
    o.updateMatrixWorld(true);
    const box = new Box3().setFromObject(o);
    const dim = box.getSize(new Vector3());
    // Size and dim are both in the room's frame; a quarter turn means the model's own x lies along z.
    const quarter = Math.abs(Math.round(o.rotation.y / (Math.PI / 2))) % 2 === 1;
    const k = [sx / dim.x, sy / dim.y, sz / dim.z];
    const u = Math.min(...k);
    // Scale is applied before the turn, so stretch factors go in the model's own axes.
    if (stretch) o.scale.set(quarter ? k[2] : k[0], k[1], quarter ? k[0] : k[2]);
    else o.scale.setScalar(u);
    o.updateMatrixWorld(true);
    const fitted = new Box3().setFromObject(o);
    const c = fitted.getCenter(new Vector3());
    o.position.set(-c.x, -fitted.min.y, -c.z);
    applyPalette(o, name, palette);
    o.traverse((m) => {
      if ((m as Mesh).isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.raycast = () => null;
      }
    });
    return o;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, name, sx, sy, sz, face, stretch, paint]);
  return <primitive object={obj} />;
}

/** Swap each mesh's material for a repainted copy when the model has key colors and a palette is given. */
export function applyPalette(root: Object3D, name: string, palette?: Palette) {
  const keys = info(name).keys;
  if (!keys || !palette) return;
  root.traverse((m) => {
    const mesh = m as Mesh;
    if (mesh.isMesh && !Array.isArray(mesh.material)) mesh.material = keyedMaterial(mesh.material as MeshStandardMaterial, keys, palette);
  });
}

const keyedCache = new Map<string, Material>();

/**
 * A copy of `base` whose texture's key colors (pure red, blue, green, and skin tone) are replaced
 * in the shader with the palette's colors, keeping the texture's shading. Copies are cached per
 * palette and share the texture, so a hundred differently dressed people cost one texture.
 */
function keyedMaterial(base: MeshStandardMaterial, keys: Keys, palette: Palette): Material {
  const id = `${base.uuid}|${JSON.stringify(keys)}|${JSON.stringify(palette)}`;
  const hit = keyedCache.get(id);
  if (hit) return hit;
  const mat = base.clone();
  const col = (slot?: Slot) => new Color(slot && palette[slot] ? palette[slot] : '#ffffff');
  const on = (slot?: Slot) => (slot && palette[slot] ? 1 : 0);
  const uniforms = {
    kRed: { value: col(keys.red) },
    kBlue: { value: col(keys.blue) },
    kGreen: { value: col(keys.green) },
    kSkin: { value: col(keys.skin) },
    kOn: { value: [on(keys.red), on(keys.blue), on(keys.green), on(keys.skin)] },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${KEYED_GLSL}`)
      .replace(
        '#include <map_fragment>',
        `#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  sampledDiffuseColor.rgb = keyed( sampledDiffuseColor.rgb );
  diffuseColor *= sampledDiffuseColor;
#endif`,
      );
  };
  mat.customProgramCacheKey = () => 'keyed-v1';
  keyedCache.set(id, mat);
  return mat;
}

const KEYED_GLSL = /* glsl */ `
uniform vec3 kRed;
uniform vec3 kBlue;
uniform vec3 kGreen;
uniform vec3 kSkin;
uniform vec4 kOn;
vec3 keyHsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
}
float keyHue(float h, float center, float width) {
  float d = abs(h - center);
  d = min(d, 1.0 - d);
  return 1.0 - smoothstep(width * 0.6, width, d);
}
vec3 keyed(vec3 c) {
  // Classify in display (sRGB-like) space, where the key colors were painted.
  vec3 hsv = keyHsv(pow(max(c, vec3(0.0)), vec3(1.0 / 2.2)));
  float strong = smoothstep(0.45, 0.65, hsv.y) * smoothstep(0.12, 0.25, hsv.z);
  float shade = pow(clamp(hsv.z / 0.92, 0.0, 1.15), 2.2);
  vec3 o = c;
  o = mix(o, kRed * shade, kOn.x * strong * keyHue(hsv.x, 0.0, 0.07));
  o = mix(o, kGreen * shade, kOn.z * strong * keyHue(hsv.x, 1.0 / 3.0, 0.09));
  o = mix(o, kBlue * shade, kOn.y * strong * keyHue(hsv.x, 2.0 / 3.0, 0.09));
  float skin = kOn.w * keyHue(hsv.x, 0.07, 0.07) * smoothstep(0.1, 0.18, hsv.y) * (1.0 - smoothstep(0.55, 0.68, hsv.y)) * smoothstep(0.42, 0.55, hsv.z);
  o = mix(o, kSkin * pow(clamp(hsv.z / 0.95, 0.0, 1.1), 2.2), skin);
  return o;
}
`;

for (const m of HQ_MODELS) useGLTF.preload(modelUrl(m));
