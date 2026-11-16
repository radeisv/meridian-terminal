// Grenades: a thrown HE with arc physics, bounce off the floor, a timed burst, and radial
// damage that walls attenuate. One mesh per grenade, pooled at construction, reused per throw.
import * as THREE from 'three';
import { damageOf } from './weapon.js';

export function createGrenades(scene, world) {
  const pool = [];
  const active = [];

  function spawn(thrower, origin, dir, power) {
    let g = pool.pop();
    if (!g) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x35513a, roughness: 0.7 }),
      );
      mesh.castShadow = true;
      scene.add(mesh);
      g = { mesh };
    }
    g.mesh.position.copy(origin);
    g.mesh.visible = true;
    const vel = dir.clone().multiplyScalar(power);
    vel.y += 2.6;
    const item = {
      mesh: g.mesh, velocity: vel,
      fuse: 1.6, thrower,
      light: null,
    };
    active.push(item);
  }

  function burst(item, onExplode) {
    const p = item.mesh.position;
    onExplode(item.thrower, p, item);
    item.mesh.visible = false;
    pool.push({ mesh: item.mesh });
  }

  function step(dt, actors, onExplode) {
    for (let i = active.length - 1; i >= 0; i--) {
      const g = active[i];
      g.fuse -= dt;
      if (g.fuse <= 0) { burst(g, onExplode); active.splice(i, 1); continue; }
      g.velocity.y -= 13 * dt;
      g.mesh.position.addScaledVector(g.velocity, dt);
      // Floor bounce with damping; walls stop it.
      if (g.mesh.position.y < 0.09) {
        g.mesh.position.y = 0.09;
        if (Math.abs(g.velocity.y) > 1.2) g.velocity.y = -g.velocity.y * 0.4;
        else g.velocity.y = 0;
        g.velocity.x *= 0.86; g.velocity.z *= 0.86;
      }
      for (const box of world.colliders) {
        if (g.mesh.position.x > box.min.x - 0.1 && g.mesh.position.x < box.max.x + 0.1 &&
            g.mesh.position.z > box.min.z - 0.1 && g.mesh.position.z < box.max.z + 0.1 &&
            g.mesh.position.y > box.min.y - 0.1 && g.mesh.position.y < box.max.y + 0.1) {
          g.velocity.multiplyScalar(-0.3);
          g.mesh.position.addScaledVector(g.velocity, dt * 2);
          break;
        }
      }
      // Damage on burst happens in burst(); the ball also hurts on direct impact late in fuse.
      if (g.fuse < 0.06) {
        for (const a of actors) {
          if (!a.alive) continue;
          const d = a.position.distanceTo(g.mesh.position);
          if (d < 0.8) { g.fuse = 0; burst(g, onExplode); active.splice(i, 1); break; }
        }
      }
    }
  }

  return { throw: spawn, step, active };
}

// Radial damage used by the burst callback: 96 at the centre, wall LOS required, armour halves.
export function grenadeDamage(origin, actor) {
  const d = origin.distanceTo(new THREE.Vector3(actor.position.x, actor.position.y + 1, actor.position.z));
  if (d > 7) return 0;
  return Math.round(96 * Math.max(0.15, 1 - d / 7));
}
