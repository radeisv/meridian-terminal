// The spike: the objective device. One side carries it into a site, plants it on the ground
// there; the other side defuses it by standing over it. Beeps accelerate; a light pulses.
import * as THREE from 'three';
import { SITES } from './world.js';

export function createBomb(scene) {
  const group = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, 0.16, 0.26),
    new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.6, metalness: 0.3 }),
  );
  shell.position.y = 0.08;
  shell.castShadow = true;
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xd84a35, emissive: 0xd84a35, emissiveIntensity: 0 });
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.1), lightMat);
  led.position.set(0, 0.18, 0);
  const halo = new THREE.PointLight(0xd84a35, 0, 7, 2);
  halo.position.set(0, 0.5, 0);
  group.add(shell, led, halo);
  group.visible = false;
  scene.add(group);

  const state = {
    carried: true, planted: false, defusing: 0, timer: 0,
    position: new THREE.Vector3(), site: null, planter: null,
    carrier: null, beep: 0,
  };

  function siteAt(position) {
    for (const [name, s] of Object.entries(SITES)) {
      if (Math.abs(position.x - s.center.x) < s.half && Math.abs(position.z - s.center.z) < s.half) return name;
    }
    return null;
  }

  return {
    state, siteAt, group,
    giveTo(actor) { state.carrier = actor; state.carried = true; state.dropped = false; },
    reset() {
      state.carried = true; state.planted = false; state.defusing = 0; state.timer = 0;
      state.site = null; state.planter = null; state.carrier = null; state.dropped = false;
      group.visible = false;
    },
    drop() { state.carrier = null; state.dropped = true; }, // a dead carrier releases it; a survivor teammate picks it up by walking over
    plant(plantingActor, position) {
      const site = siteAt(position);
      if (!site) return false;
      state.carried = false; state.carrier = null;
      state.planted = true; state.site = site; state.planter = plantingActor;
      state.timer = 40; state.beep = 0;
      state.position.copy(position); state.position.y = 0;
      group.position.copy(state.position);
      group.visible = true;
      return true;
    },
    step(dt, defuserHere) {
      if (!state.planted) return null;
      state.timer -= dt;
      const period = Math.max(0.12, 0.9 * (state.timer / 40));
      state.beep -= dt;
      if (state.beep <= 0) {
        state.beep = period;
        lightMat.emissiveIntensity = 3;
        halo.intensity = 9;
      }
      lightMat.emissiveIntensity = Math.max(0, lightMat.emissiveIntensity - dt * 22);
      halo.intensity = Math.max(0, halo.intensity - dt * 44);
      if (defuserHere) state.defusing += dt;
      else state.defusing = Math.max(0, state.defusing - dt * 1.4);
      const done = state.timer <= 0 ? 'exploded' : state.defusing >= 6 ? 'defused' : null;
      if (done) { state.planted = false; group.visible = false; }
      return done;
    },
    defuseProgress() { return state.planted ? state.defusing / 6 : 0; },
  };
}
