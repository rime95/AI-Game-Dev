import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Box3, Euler, Quaternion, type Bone, type Group, type Mesh, type Object3D } from 'three';
import { applyPalette, modelUrl, type Palette } from './Model';

/** How tall a person stands, in tiles. */
const HEIGHT = 0.62;
/** The rig is 1.2 m tall (set when it was rigged). */
const RIG_HEIGHT = 1.2;

/**
 * Joint bends for each pose, in radians around each bone's own axes (x = bend forward/back for
 * this rig). Animated on top of these: typing hands, breathing, a nod.
 */
type Pose = Partial<Record<string, [number, number, number]>>;
const SIT: Pose = {
  LeftUpLeg: [-1.45, 0, 0.06],
  RightUpLeg: [-1.45, 0, -0.06],
  LeftLeg: [1.5, 0, 0],
  RightLeg: [1.5, 0, 0],
  LeftArm: [0, 0, 0],
  RightArm: [0, 0, 0],
};
const ARMS_DOWN: Pose = {
  LeftArm: [0, 0, 0.9],
  RightArm: [0, 0, -0.9],
};
const TYPING: Pose = {
  LeftArm: [-0.75, 0, 0.55],
  RightArm: [-0.75, 0, -0.55],
  LeftForeArm: [-0.2, 0, 0.9],
  RightForeArm: [-0.2, 0, -0.9],
};
const SLUMP: Pose = {
  Spine01: [0.3, 0, 0],
  neck: [0.35, 0, 0],
};

export type Activity = 'type' | 'sit' | 'stand';

/**
 * One rigged character for everyone (founder and staff), repainted per person and posed in code:
 * sitting and typing at desks, sitting on couches, standing around. Slumped when morale is low.
 */
export function Character({
  palette,
  activity,
  slump,
  bob,
}: {
  palette: Palette;
  activity: Activity;
  slump: boolean;
  /** Bounce a little (crowded, nowhere to sit). */
  bob?: boolean;
}) {
  const { scene } = useGLTF(modelUrl('characterRig'));
  const paint = JSON.stringify(palette);
  const { root, bones, rest, height } = useMemo(() => {
    const root = cloneSkinned(scene) as Object3D;
    applyPalette(root, 'characterRig', palette);
    const bones: Record<string, Bone> = {};
    const rest: Record<string, Quaternion> = {};
    root.traverse((o) => {
      if ((o as Bone).isBone) {
        bones[o.name] = o as Bone;
        rest[o.name] = o.quaternion.clone();
      }
      if ((o as Mesh).isMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
        o.raycast = () => null;
      }
    });
    // Feet on the floor and centered, measured on the skinned vertices in the rest pose.
    root.updateMatrixWorld(true);
    const box = new Box3().setFromObject(root, true);
    root.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    const height = box.max.y - box.min.y;
    return { root, bones, rest, height };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, paint]);

  const ref = useRef<Group>(null);
  const phase = useMemo(() => Math.random() * Math.PI * 2, []);
  const q = useMemo(() => new Quaternion(), []);
  const e = useMemo(() => new Euler(), []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + phase;
    const pose: Pose = {
      ...(activity === 'stand' ? ARMS_DOWN : {}),
      ...(activity !== 'stand' ? SIT : {}),
      ...(activity === 'type' ? TYPING : activity === 'sit' ? ARMS_DOWN : {}),
      ...(slump ? SLUMP : {}),
    };
    for (const name in rest) {
      const b = bones[name];
      const d = pose[name];
      let [x, y, z] = d ?? [0, 0, 0];
      // Typing: forearms tap; everyone breathes; standing people shift their weight.
      if (activity === 'type' && name.endsWith('ForeArm')) x += Math.sin(t * 9 + (name[0] === 'L' ? 0 : 1.6)) * 0.12;
      if (name === 'Spine02') x += Math.sin(t * 1.6) * 0.02;
      if (name === 'Head' && !slump) y += Math.sin(t * 0.5) * 0.15;
      if (activity === 'stand' && name === 'Hips') z += Math.sin(t * 0.8) * 0.03;
      if (!d && x === 0 && y === 0 && z === 0) {
        b.quaternion.copy(rest[name]);
        continue;
      }
      b.quaternion.copy(rest[name]).multiply(q.setFromEuler(e.set(x, y, z)));
    }
    if (ref.current) ref.current.position.y = bob ? Math.abs(Math.sin(t * 2.2)) * 0.04 : 0;
  });

  const k = HEIGHT / (height || RIG_HEIGHT);
  return (
    <group ref={ref}>
      {/* The rig faces +x; seats face -z at 0 (toward their desk), so turn it a quarter. */}
      <group rotation={[0, Math.PI / 2, 0]} scale={k} position={[0, activity === 'stand' ? 0 : 0.03, 0]}>
        <primitive object={root} />
      </group>
    </group>
  );
}

useGLTF.preload(modelUrl('characterRig'));
