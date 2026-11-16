// Weapons: data for each gun, the first-person view model, and the shot resolver (spread,
// recoil, reload, damage falloff, headshot). Bots use the same data; only the view is player-only.
import * as THREE from 'three';

export const WEAPONS = {
  pistol: {
    name: 'P9 Sidearm', cost: 0, slot: 2,
    damage: 26, headMult: 3.4, falloffStart: 14, falloffPerMetre: 0.9,
    mag: 12, reserve: 48, fireInterval: 0.16, reloadTime: 1.5,
    spreadBase: 0.010, spreadMove: 0.028, spreadAir: 0.05, spreadCrouch: 0.6,
    recoilKick: 0.011, recoilRecover: 7, kickBack: 0.05,
    tracer: 0.02, sound: 'pistol',
  },
  smg: {
    name: 'K4 Cicada', cost: 1050, slot: 1,
    damage: 24, headMult: 2.6, falloffStart: 10, falloffPerMetre: 1.4,
    mag: 30, reserve: 90, fireInterval: 0.075, reloadTime: 2.2,
    spreadBase: 0.014, spreadMove: 0.036, spreadAir: 0.05, spreadCrouch: 0.7,
    recoilKick: 0.006, recoilRecover: 9, kickBack: 0.04,
    tracer: 0.015, sound: 'smg',
  },
  rifle: {
    name: 'Vx-7 Meridian', cost: 2700, slot: 1,
    damage: 34, headMult: 4.0, falloffStart: 30, falloffPerMetre: 0.4,
    mag: 30, reserve: 60, fireInterval: 0.105, reloadTime: 2.4,
    spreadBase: 0.0045, spreadMove: 0.05, spreadAir: 0.09, spreadCrouch: 0.55,
    recoilKick: 0.014, recoilRecover: 6.5, kickBack: 0.085,
    tracer: 0.02, sound: 'rifle',
  },
  marksman: {
    name: 'LR Kestrel', cost: 4300, slot: 1,
    damage: 92, headMult: 2.2, falloffStart: 60, falloffPerMetre: 0,
    mag: 5, reserve: 20, fireInterval: 1.1, reloadTime: 3.2,
    spreadBase: 0.0008, spreadMove: 0.11, spreadAir: 0.16, spreadCrouch: 0.5,
    recoilKick: 0.03, recoilRecover: 4, kickBack: 0.2,
    tracer: 0.03, sound: 'marksman',
  },
};

export function loadoutFor(kind) {
  if (kind === 'pistol') return { primary: null, sidearm: 'pistol' };
  if (kind === 'smg') return { primary: 'smg', sidearm: 'pistol' };
  if (kind === 'rifle') return { primary: 'rifle', sidearm: 'pistol' };
  if (kind === 'marksman') return { primary: 'marksman', sidearm: 'pistol' };
  return { primary: null, sidearm: 'pistol' };
}

// The gun in the player's hands: a small articulated assembly of boxes, parented to the camera.
export function createViewModel(camera) {
  const rig = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.55, metalness: 0.3 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x4a4f56, roughness: 0.5, metalness: 0.4 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x2e2620, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.52), dark);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.05, 0.3), trim);
  barrel.position.set(0, 0.015, -0.38);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.16, 0.09), trim);
  mag.position.set(0, -0.11, -0.06);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.2), grip);
  stock.position.set(0, -0.02, 0.32);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.14), dark);
  sight.position.set(0, 0.08, -0.1);
  rig.add(body, barrel, mag, stock, sight);
  rig.position.set(0.19, -0.16, -0.32);
  camera.add(rig);

  const flash = new THREE.PointLight(0xffc27a, 0, 9, 2);
  flash.position.set(0, 0.02, -0.62);
  rig.add(flash);

  let kick = 0;
  let bobT = 0;

  return {
    rig,
    flash,
    show(kind) {
      const long = kind && kind !== 'pistol';
      body.scale.z = long ? 1.25 : 0.8;
      barrel.position.z = long ? -0.5 : -0.32;
      barrel.scale.z = long ? 1.3 : 0.9;
      mag.visible = long;
      stock.visible = long;
      sight.visible = long;
      rig.visible = !!kind;
    },
    kickUp(amount) { kick = Math.min(0.09, kick + amount); },
    update(dt, moving, grounded, crouch) {
      kick = Math.max(0, kick - dt * 0.45);
      bobT += dt * (moving && grounded ? 9.2 : 2.2);
      const bob = moving && grounded ? Math.sin(bobT) * 0.008 : Math.sin(bobT) * 0.002;
      const sway = crouch ? 0.03 : 0;
      rig.position.set(0.19 + bob * 0.6, -0.16 + Math.abs(bob) * 1.4 - sway, -0.32 + kick * 0.6);
      rig.rotation.x = -kick * 2.2;
      rig.rotation.z = bob * 0.4;
      flash.intensity = Math.max(0, flash.intensity - dt * 220);
      flash.position.set(0, 0.02, barrel.position.z - 0.14);
    },
    muzzle() { flash.intensity = 26; },
  };
}

// Resolve one shot from an eye position along a direction. Returns the hit result or null.
export function rayHit(eye, dir, maxDist, world, actors, shooter) {
  let best = { dist: maxDist, actor: null, part: null };
  // Map geometry first.
  for (const box of world.colliders) {
    const t = boxRay(eye, dir, box, maxDist);
    if (t !== null && t < best.dist) best = { dist: t, actor: null, part: 'world' };
  }
  const floorT = dir.y < -1e-6 ? (eye.y - 0) / -dir.y : Infinity;
  if (floorT < best.dist) best = { dist: floorT, actor: null, part: 'world' };
  // Bodies: head sphere then body AABB.
  for (const a of actors) {
    if (!a.alive || a === shooter) continue;
    const headC = tmpVec(a.eye());
    const hd = raySphere(eye, dir, headC, 0.24);
    if (hd !== null && hd < best.dist) best = { dist: hd, actor: a, part: 'head' };
    const bx = bodyBox(a);
    const bt = boxRay(eye, dir, bx, best.dist);
    if (bt !== null && bt < best.dist) best = { dist: bt, actor: a, part: 'body' };
  }
  return best.dist < maxDist ? best : null;
}

const _v = new THREE.Vector3();
function tmpVec(v) { return _v.copy(v); }

function bodyBox(a) {
  const r = 0.42;
  return new THREE.Box3(
    new THREE.Vector3(a.position.x - r, a.position.y, a.position.z - r),
    new THREE.Vector3(a.position.x + r, a.position.y + a.height, a.position.z + r),
  );
}

export function raySphere(eye, dir, center, radius) {
  const ocX = center.x - eye.x, ocY = center.y - eye.y, ocZ = center.z - eye.z;
  const tca = ocX * dir.x + ocY * dir.y + ocZ * dir.z;
  if (tca < 0) return null;
  const d2 = ocX * ocX + ocY * ocY + ocZ * ocZ - tca * tca;
  if (d2 > radius * radius) return null;
  return tca - Math.sqrt(radius * radius - d2);
}

export function boxRay(origin, dir, box, maxLen) {
  let tmin = 0;
  let tmax = maxLen;
  for (const axis of ['x', 'y', 'z']) {
    const o = origin[axis];
    const d = dir[axis];
    if (Math.abs(d) < 1e-8) {
      if (o < box.min[axis] || o > box.max[axis]) return null;
      continue;
    }
    let t1 = (box.min[axis] - o) / d;
    let t2 = (box.max[axis] - o) / d;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

export function damageOf(weapon, dist, part) {
  const falloff = dist > weapon.falloffStart
    ? Math.max(0.4, 1 - (dist - weapon.falloffStart) / 100 * weapon.falloffPerMetre)
    : 1;
  const base = weapon.damage * falloff;
  return Math.round(part === 'head' ? base * weapon.headMult : base);
}
