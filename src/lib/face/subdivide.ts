"use client";

/**
 * Uniform 1-to-4 triangle subdivision for the 3D canvas mesh.
 *
 * Why: MediaPipe gives ~40 landmarks on the nose, so each triangle spans a
 * large patch. The morph engine (geometry.ts) is a smooth displacement
 * FIELD evaluated per point, so sampling it at only 478 vertices is what
 * produces visible flat facets when a handle moves. Subdividing the mesh
 * and evaluating the same field at every new vertex removes the faceting
 * without changing the morph math at all.
 *
 * Uniform subdivision (whole mesh, no selective splits) is deliberate: it
 * avoids T-junction cracks between refined and unrefined regions. Two
 * levels turn ~900 triangles into ~14.4k and ~7.3k vertices, which is
 * trivial for the GPU and keeps per-slider field evaluation in the
 * low-milliseconds.
 *
 * Original vertices keep their indices (midpoints are appended), so the
 * anatomical anchor indices in geometry.ts (nose tip 1, nasion 168, ...)
 * remain valid on the subdivided point list.
 */

import type { Pt } from "./geometry";

export interface SubdividedMesh {
  points: Pt[];
  triangles: number[];
}

function subdivideOnce(points: Pt[], triangles: number[]): SubdividedMesh {
  const pts = points.slice();
  // edge (a,b) -> midpoint index; numeric key keeps the map fast
  const midCache = new Map<number, number>();
  const KEY = 1_000_000; // > max vertex index at any level we use

  const mid = (a: number, b: number): number => {
    const key = a < b ? a * KEY + b : b * KEY + a;
    let idx = midCache.get(key);
    if (idx === undefined) {
      const pa = pts[a];
      const pb = pts[b];
      idx =
        pts.push({
          x: (pa.x + pb.x) / 2,
          y: (pa.y + pb.y) / 2,
          z: (pa.z + pb.z) / 2,
        }) - 1;
      midCache.set(key, idx);
    }
    return idx;
  };

  const out: number[] = new Array((triangles.length / 3) * 12);
  let o = 0;
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t];
    const b = triangles[t + 1];
    const c = triangles[t + 2];
    const ab = mid(a, b);
    const bc = mid(b, c);
    const ca = mid(c, a);
    // 4 children per triangle
    out[o++] = a;  out[o++] = ab; out[o++] = ca;
    out[o++] = ab; out[o++] = b;  out[o++] = bc;
    out[o++] = ca; out[o++] = bc; out[o++] = c;
    out[o++] = ab; out[o++] = bc; out[o++] = ca;
  }
  return { points: pts, triangles: out };
}

export function subdivideMesh(
  points: Pt[],
  triangles: number[],
  levels: number
): SubdividedMesh {
  let mesh: SubdividedMesh = { points, triangles };
  for (let i = 0; i < levels; i++) {
    mesh = subdivideOnce(mesh.points, mesh.triangles);
  }
  return mesh;
}
