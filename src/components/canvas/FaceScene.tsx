"use client";

/**
 * The 3D consultation canvas scene (04_consultation-canvas-3d.md §3).
 * A textured face mesh built from MediaPipe landmarks:
 *   - Move: orbit / zoom / pan (buttery, damped)
 *   - Draw: annotations painted into the face texture in UV space, so they
 *     stick to the mesh and rotate with it
 *   - Sculpt: soft-falloff push/pull brush along vertex normals
 *   - Morph sliders + feature scaling flow in via the shared morph engine
 */

import { useEffect, useMemo, useRef, useCallback, useState } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  applyMorphs,
  buildEyeFill,
  faceTriangles,
  featureFrame,
  featureWeight,
  toPx,
  type FeatureId,
  type Pt,
} from "@/lib/face/geometry";
import { subdivideMesh } from "@/lib/face/subdivide";
import type { AnnotationStroke } from "@/lib/types";

export type CanvasTool = "move" | "draw" | "sculpt";

export interface DrawSettings {
  color: string;
  size: number; // px on the texture
  erase: boolean;
}

export interface SculptSettings {
  strength: number; // 0..100
  direction: 1 | -1; // 1 = pull out, -1 = push in
}

interface FaceSceneProps {
  image: HTMLImageElement;
  landmarks: number[][]; // normalized
  morphs: Record<string, number>;
  tool: CanvasTool;
  draw: DrawSettings;
  sculpt: SculptSettings;
  highlight: FeatureId | null;
  annotations: AnnotationStroke[];
  onStrokeCommit: (stroke: AnnotationStroke) => void;
  resetToken: number; // bump to clear sculpt deltas
}

/**
 * Uniform subdivision applied to the landmark mesh. The morph engine is a
 * smooth displacement field; the visible triangles came from sampling it at
 * only 478 points. Two levels (~14.4k triangles) sample it densely enough
 * that a handle drag reads as a refined, curved push instead of a flat
 * wedge. Cost: low-millisecond field evaluation, trivial GPU load.
 */
const SUBDIV_LEVELS = 2;

export function FaceScene(props: FaceSceneProps) {
  // Mobile (T4): with Draw/Sculpt active, a second finger must still
  // orbit/zoom — no tool traps. Track live pointer count; two or more
  // switches the gesture to navigation and cancels any live stroke.
  const pointers = useRef(new Set<number>());
  const [multiTouch, setMultiTouch] = useState(false);
  const track = (e: React.PointerEvent, down: boolean) => {
    if (down) pointers.current.add(e.pointerId);
    else pointers.current.delete(e.pointerId);
    const multi = pointers.current.size >= 2;
    setMultiTouch((m) => (m === multi ? m : multi));
  };

  return (
    <div
      className="w-full h-full"
      onPointerDownCapture={(e) => track(e, true)}
      onPointerUpCapture={(e) => track(e, false)}
      onPointerCancelCapture={(e) => track(e, false)}
      onPointerLeave={(e) => track(e, false)}
    >
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        camera={{ position: [0, 0.05, 3.1], fov: 35 }}
        style={{ touchAction: "none" }}
      >
        <FaceMeshObject {...props} multiTouch={multiTouch} />
        <StageShadow />
        <OrbitControls
          enabled={props.tool === "move" || multiTouch}
          enableDamping
          dampingFactor={0.08}
          minDistance={1.7}
          maxDistance={6}
          minAzimuthAngle={-Math.PI * 0.42}
          maxAzimuthAngle={Math.PI * 0.42}
          minPolarAngle={Math.PI * 0.3}
          maxPolarAngle={Math.PI * 0.68}
          makeDefault
        />
      </Canvas>
    </div>
  );
}

function FaceMeshObject({
  image,
  landmarks,
  morphs,
  tool,
  draw,
  sculpt,
  highlight,
  annotations,
  onStrokeCommit,
  resetToken,
  multiTouch = false,
}: FaceSceneProps & { multiTouch?: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const multiTouchRef = useRef(multiTouch);
  multiTouchRef.current = multiTouch;

  // ---- static frame ---------------------------------------------------
  const frame = useMemo(() => {
    const w = image.naturalWidth;
    const h = image.naturalHeight;
    const basePx = toPx(landmarks, w, h);
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (let i = 0; i < Math.min(468, basePx.length); i++) {
      const p = basePx[i];
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const scale = (maxY - minY) / 2.3 || 1; // face height ≈ 2.3 world units
    const cz = basePx[1]?.z ?? 0;
    // Fill the eye sockets (tessellation leaves them as holes), then densify.
    // Originals keep indices 0..477 (anchors stay valid); eye-fill apexes and
    // subdivision midpoints are appended. The morph field is evaluated at
    // every vertex; eye-region vertices carry ~0 nose weight, so they hold
    // still while the nose morphs.
    const eyeFill = buildEyeFill(basePx);
    const seedPoints = eyeFill.points.length
      ? [...basePx, ...eyeFill.points]
      : basePx;
    const seedTris = eyeFill.triangles.length
      ? [...faceTriangles(), ...eyeFill.triangles]
      : faceTriangles();
    const { points, triangles } = subdivideMesh(
      seedPoints,
      seedTris,
      SUBDIV_LEVELS
    );
    return { w, h, basePx, points, triangles, cx, cy, cz, scale };
  }, [image, landmarks]);

  const toWorld = useCallback(
    (p: Pt): [number, number, number] => [
      (p.x - frame.cx) / frame.scale,
      -(p.y - frame.cy) / frame.scale,
      -(p.z - frame.cz) / frame.scale,
    ],
    [frame]
  );

  // ---- geometry (built once per photo) ---------------------------------
  const geometry = useMemo(() => {
    const n = frame.points.length;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(n * 3);
    const uvs = new Float32Array(n * 2);
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const p = frame.points[i];
      const [x, y, z] = toWorld(p);
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      // UV is a linear map of base pixel position, so midpoints inherit it
      uvs[i * 2] = p.x / frame.w;
      uvs[i * 2 + 1] = 1 - p.y / frame.h;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geo.setIndex(frame.triangles);
    geo.computeVertexNormals();
    return geo;
  }, [frame, toWorld]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  // ---- texture: photo + annotations, painted in UV space ----------------
  const textureBundle = useMemo(() => {
    const texW = Math.min(1024, frame.w);
    const texH = Math.round((texW / frame.w) * frame.h);
    const canvas = document.createElement("canvas");
    canvas.width = texW;
    canvas.height = texH;
    const ctx = canvas.getContext("2d")!;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return { canvas, ctx, texture, texW, texH };
  }, [frame]);

  useEffect(() => () => textureBundle.texture.dispose(), [textureBundle]);

  const liveStroke = useRef<AnnotationStroke | null>(null);

  const repaintTexture = useCallback(() => {
    const { ctx, texW, texH, texture } = textureBundle;
    ctx.clearRect(0, 0, texW, texH);
    ctx.drawImage(image, 0, 0, texW, texH);
    const paint = (stroke: AnnotationStroke) => {
      if (stroke.points.length === 0) return;
      ctx.save();
      if (stroke.color === "erase") {
        // erase = repaint photo along the path; emulate by clipping circles
        ctx.globalCompositeOperation = "source-over";
      }
      ctx.strokeStyle = stroke.color === "erase" ? "rgba(0,0,0,0)" : stroke.color;
      ctx.lineWidth = stroke.size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      stroke.points.forEach((pt, i) => {
        const x = pt.u * texW;
        const y = (1 - pt.v) * texH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      if (stroke.color !== "erase") ctx.stroke();
      ctx.restore();
    };
    for (const s of annotations) paint(s);
    if (liveStroke.current) paint(liveStroke.current);
    texture.needsUpdate = true;
  }, [annotations, image, textureBundle]);

  useEffect(() => {
    repaintTexture();
  }, [repaintTexture]);

  // ---- sculpt deltas (world space, transient) ---------------------------
  const sculptDelta = useRef(new Float32Array(0));

  const baseNormals = useMemo(() => {
    const n = geometry.getAttribute("normal") as THREE.BufferAttribute;
    return new Float32Array(n.array as Float32Array);
  }, [geometry]);

  // ---- position update (morphs + sculpt) --------------------------------
  const updatePositions = useCallback(() => {
    const attr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const n = frame.points.length;
    if (sculptDelta.current.length !== n * 3) {
      sculptDelta.current = new Float32Array(n * 3);
    }
    // Evaluate the smooth morph field at every subdivided vertex — this is
    // what turns per-triangle bulk movement into a refined, curved push.
    const morphedPx = applyMorphs(frame.points, morphs);
    const delta = sculptDelta.current;
    for (let i = 0; i < n; i++) {
      const p = morphedPx[i] ?? frame.points[i];
      const [x, y, z] = toWorld(p);
      arr[i * 3] = x + delta[i * 3];
      arr[i * 3 + 1] = y + delta[i * 3 + 1];
      arr[i * 3 + 2] = z + delta[i * 3 + 2];
    }
    attr.needsUpdate = true;
    geometry.computeBoundingSphere();
  }, [geometry, frame, morphs, toWorld]);

  useEffect(() => {
    updatePositions();
  }, [updatePositions]);

  useEffect(() => {
    sculptDelta.current.fill(0);
    updatePositions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetToken, geometry]);

  // ---- highlight vertex colors ------------------------------------------
  useEffect(() => {
    const attr = geometry.getAttribute("color") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    arr.fill(0);
    if (highlight) {
      const ff = featureFrame(frame.points);
      const mint = new THREE.Color("#34D3B0");
      for (let i = 0; i < frame.points.length; i++) {
        const w = featureWeight(i, frame.points[i], ff)[highlight] ?? 0;
        if (w <= 0.02) continue;
        // Rim-biased: a soft mint halo at the region's edge (peaks where the
        // weight transitions) plus a very faint interior wash. This marks the
        // selected feature without flooding it in green, so the face stays
        // clearly visible.
        const rim = 4 * w * (1 - w); // 0 at solid core / outside, 1 mid-edge
        const intensity = Math.min(1, 0.85 * rim + 0.1 * w);
        arr[i * 3] = mint.r * intensity;
        arr[i * 3 + 1] = mint.g * intensity;
        arr[i * 3 + 2] = mint.b * intensity;
      }
    }
    attr.needsUpdate = true;
  }, [highlight, geometry, frame]);

  // ---- interaction -------------------------------------------------------
  const pointerActive = useRef(false);

  // A second finger landing mid-stroke cancels the stroke (no commit) and
  // hands the gesture to OrbitControls (T4: no tool traps on touch).
  useEffect(() => {
    if (multiTouch) {
      pointerActive.current = false;
      liveStroke.current = null;
    }
  }, [multiTouch]);

  const applySculptAt = useCallback(
    (point: THREE.Vector3) => {
      const attr = geometry.getAttribute("position") as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      const radius = 0.34;
      const strength = (sculpt.strength / 100) * 0.02 * sculpt.direction;
      const delta = sculptDelta.current;
      const n = Math.min(frame.points.length, delta.length / 3);
      for (let i = 0; i < n; i++) {
        const dx = arr[i * 3] - point.x;
        const dy = arr[i * 3 + 1] - point.y;
        const dz = arr[i * 3 + 2] - point.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > radius) continue;
        const t = 1 - d / radius;
        const w = t * t * (3 - 2 * t);
        // clamp per-vertex total displacement to stay plausible
        const cap = 0.16;
        delta[i * 3] = clamp(delta[i * 3] + baseNormals[i * 3] * strength * w, -cap, cap);
        delta[i * 3 + 1] = clamp(
          delta[i * 3 + 1] + baseNormals[i * 3 + 1] * strength * w,
          -cap,
          cap
        );
        delta[i * 3 + 2] = clamp(
          delta[i * 3 + 2] + baseNormals[i * 3 + 2] * strength * w,
          -cap,
          cap
        );
      }
      updatePositions();
    },
    [geometry, frame, sculpt, baseNormals, updatePositions]
  );

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (tool === "move" || multiTouchRef.current) return;
    e.stopPropagation();
    (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
    pointerActive.current = true;
    if (tool === "draw" && e.uv) {
      liveStroke.current = {
        points: [{ u: e.uv.x, v: e.uv.y }],
        color: draw.erase ? "erase" : draw.color,
        size: draw.size,
      };
      repaintTexture();
    } else if (tool === "sculpt") {
      applySculptAt(e.point);
    }
  };

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!pointerActive.current || tool === "move" || multiTouchRef.current)
      return;
    e.stopPropagation();
    if (tool === "draw" && e.uv && liveStroke.current) {
      liveStroke.current.points.push({ u: e.uv.x, v: e.uv.y });
      repaintTexture();
    } else if (tool === "sculpt") {
      applySculptAt(e.point);
    }
  };

  const endStroke = () => {
    if (!pointerActive.current) return;
    pointerActive.current = false;
    if (tool === "draw" && liveStroke.current) {
      if (liveStroke.current.points.length > 1 && liveStroke.current.color !== "erase") {
        onStrokeCommit(liveStroke.current);
      }
      liveStroke.current = null;
      repaintTexture();
    }
  };

  return (
    <group>
      <mesh
        ref={meshRef}
        geometry={geometry}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerLeave={endStroke}
      >
        <meshBasicMaterial
          map={textureBundle.texture}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
      {/* highlight glow layer — soft mint rim, face stays visible */}
      <mesh geometry={geometry} scale={1.004} raycast={() => null}>
        <meshBasicMaterial
          vertexColors
          transparent
          opacity={0.5}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

/** Soft elliptical shadow under the head — the "floating on a stage" cue. */
function StageShadow() {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext("2d")!;
    const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
    g.addColorStop(0, "rgba(20, 80, 70, 0.32)");
    g.addColorStop(1, "rgba(20, 80, 70, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c);
    return t;
  }, []);
  return (
    <mesh
      position={[0, -1.5, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      raycast={() => null}
    >
      <planeGeometry args={[3.4, 2.2]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
}
