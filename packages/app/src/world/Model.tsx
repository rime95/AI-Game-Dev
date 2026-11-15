import { useMemo } from 'react';
import { useGLTF } from '@react-three/drei';
import { Box3, CanvasTexture, Vector3, type Mesh, type MeshStandardMaterial, type Object3D } from 'three';

/** Models live in public/models/<pack>/ (relative so the Electron build finds them too). */
const BASE = `${import.meta.env.BASE_URL}models/`;
export const modelUrl = (name: string) => `${BASE}garage/${name}.glb`;

/** Every model the HQ uses, so they start loading with the scene instead of one by one. */
export const HQ_MODELS = [
  'desk', 'chairDesk', 'computerScreen', 'beigePc', 'table', 'lampSquareTable', 'radio', 'cardboardBoxOpen',
  'cardboardBoxClosed', 'bookcaseOpen', 'books', 'kitchenCoffeeMachine', 'kitchenFridgeSmall', 'loungeSofa',
  'tableCoffee', 'trashcan', 'coatRackStanding', 'pottedPlant', 'wall', 'wallWindow',
];

/**
 * A model fitted into a box: `size` is width (x), height (y), depth (z) in tiles, `face` turns it
 * (0 = its front toward +z). It sits on the group's origin, centered. Uniform scale keeps the
 * model's proportions; `stretch` fills the box exactly (tables, walls).
 */
export function FitModel({ name, size, face = 0, stretch = false }: { name: string; size: [number, number, number]; face?: number; stretch?: boolean }) {
  const { scene } = useGLTF(modelUrl(name));
  if (name === 'beigePc') makeBeige(scene);
  const [sx, sy, sz] = size;
  const obj = useMemo(() => {
    const o = scene.clone(true);
    // Kenney's furniture faces -z; the PC model faces +z. Normalize so face 0 means front toward +z.
    o.rotation.set(0, face + (name === 'beigePc' ? 0 : Math.PI), 0);
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
    o.traverse((m) => {
      if ((m as Mesh).isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
        m.raycast = () => null;
      }
    });
    return o;
  }, [scene, sx, sy, sz, face, stretch]);
  return <primitive object={obj} />;
}

/**
 * The PC model ships in charcoal grey; 1991 PCs were beige. Repaint the plain grey plastic in
 * its texture beige and leave the dark details (vents, keys, screen) alone. Done once per load.
 */
function makeBeige(scene: Object3D) {
  if (scene.userData.beige) return;
  scene.userData.beige = true;
  scene.traverse((o) => {
    const mat = (o as Mesh).material as MeshStandardMaterial | undefined;
    const img = mat?.map?.image as (CanvasImageSource & { width: number; height: number }) | undefined;
    if (!mat?.map || !img?.width || mat.map.userData.beige) return;
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
      const grey = Math.abs(r - g) < 8 && Math.abs(g - b) < 8;
      // Case plastic: the mid-dark greys. Keys' near-black and the screen's blues stay.
      if (grey && r >= 36 && r <= 80) {
        const k = 0.8 + (r - 36) / 220;
        px[i] = 222 * k;
        px[i + 1] = 210 * k;
        px[i + 2] = 182 * k;
      }
    }
    ctx.putImageData(data, 0, 0);
    const tex = new CanvasTexture(canvas);
    tex.flipY = mat.map.flipY;
    tex.colorSpace = mat.map.colorSpace;
    tex.wrapS = mat.map.wrapS;
    tex.wrapT = mat.map.wrapT;
    tex.userData.beige = true;
    mat.map = tex;
    mat.needsUpdate = true;
  });
}

for (const m of HQ_MODELS) useGLTF.preload(modelUrl(m));
