// Navigation over the world's waypoint nodes: adjacency from clear straight segments, then
// Dijkstra for routes. One graph, built once from the map's NAV_NODES and colliders.
import * as THREE from 'three';
import { MAP_BOUNDS } from './world.js';

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

function segmentClear(a, b, colliders, lift) {
  // Lift both ends up to body height so low crates count as obstacles, walls too.
  tmpA.copy(a); tmpA.y = lift;
  tmpB.copy(b); tmpB.y = lift;
  const dir = tmpB.clone().sub(tmpA);
  const len = dir.length();
  if (len < 0.01) return true;
  dir.divideScalar(len);
  for (const box of colliders) {
    if (box.min.y > lift + 1.4 || box.max.y < lift) continue; // step over low plates, under girders
    const hit = rayBoxDistance(tmpA, dir, box, len);
    if (hit !== null && hit < len - 0.35) return false;
  }
  return true;
}

export function rayBoxDistance(origin, dir, box, maxLen) {
  let tmin = 0;
  let tmax = maxLen;
  for (const axis of ['x', 'y', 'z']) {
    const o = origin[axis];
    const d = dir[axis];
    const lo = box.min[axis];
    const hi = box.max[axis];
    if (Math.abs(d) < 1e-8) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

export function buildNav(nodes, colliders) {
  const adj = nodes.map(() => []);
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dist = nodes[i].distanceTo(nodes[j]);
      if (dist > 26) continue;
      if (segmentClear(nodes[i], nodes[j], colliders, 1.0) && segmentClear(nodes[i], nodes[j], colliders, 0.5)) {
        adj[i].push({ node: j, dist });
        adj[j].push({ node: i, dist });
      }
    }
  }
  return adj;
}

export function nearestNode(graph, nodes, point) {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const d = nodes[i].distanceToSquared(point);
    if (d < bestD && lineClearToNode(point, nodes[i])) { bestD = d; best = i; }
  }
  if (best === -1) { // fall back to the closest node whatever the clearance
    for (let i = 0; i < nodes.length; i++) {
      const d = nodes[i].distanceToSquared(point);
      if (d < bestD) { bestD = d; best = i; }
    }
  }
  return best;
}

function lineClearToNode(point, node) {
  // Nodes are open air; only obvious wall crossings matter here. Cheap: sample three points.
  for (let t = 0.25; t < 1; t += 0.25) {
    const x = point.x + (node.x - point.x) * t;
    const z = point.z + (node.z - point.z) * t;
    if (x < MAP_BOUNDS.minX + 1 || x > MAP_BOUNDS.maxX - 1 || z < MAP_BOUNDS.minZ + 1 || z > MAP_BOUNDS.maxZ - 1) return false;
  }
  return true;
}

export function route(graph, nodes, fromNode, toNode) {
  if (fromNode === toNode) return [toNode];
  const dist = new Array(nodes.length).fill(Infinity);
  const prev = new Array(nodes.length).fill(-1);
  const done = new Array(nodes.length).fill(false);
  dist[fromNode] = 0;
  for (;;) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
    if (u === -1) break;
    done[u] = true;
    for (const edge of graph[u]) {
      const nd = dist[u] + edge.dist;
      if (nd < dist[edge.node]) { dist[edge.node] = nd; prev[edge.node] = u; }
    }
  }
  if (dist[toNode] === Infinity) return [toNode];
  const path = [];
  for (let n = toNode; n !== -1; n = prev[n]) path.push(n);
  path.reverse();
  return path;
}
