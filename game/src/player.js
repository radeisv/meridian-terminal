// Body movement: acceleration and friction on the ground, gravity and a jump in the air,
// crouching under boxes, and capsule-vs-AABB resolution against the map's colliders.
import * as THREE from 'three';

const RADIUS = 0.42;
const STAND_EYE = 1.62;
const CROUCH_EYE = 1.08;
export const STAND_HEIGHT = 1.75;
export const CROUCH_HEIGHT = 1.2;

const tmp = new THREE.Vector3();

export function createBody(scene, position, teamColor, isPlayer) {
  const group = new THREE.Group();
  const torsoMat = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.7 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xd8cfc2, roughness: 0.6 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.5, 4, 8), torsoMat);
  torso.position.y = 0.62;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), headMat);
  head.position.y = 1.31;
  head.castShadow = true;
  if (!isPlayer) { group.add(torso); group.add(head); }
  else torso.visible = false, head.visible = false;
  scene.add(group);

  return {
    position: position.clone(),
    velocity: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    eyeHeight: STAND_EYE,
    height: STAND_HEIGHT,
    crouching: false,
    grounded: true,
    group, torso, head,
    alive: true,
    hp: 100,
    armor: 0,
  };
}

// Move a body through the world for dt seconds; returns true when grounded this step.
export function stepBody(body, wishDir, wishSpeed, dt, colliders, gravity, jump) {
  // Horizontal acceleration: reach wishSpeed over ~0.12 s, friction on release.
  tmp.set(wishDir.x, 0, wishDir.z);
  if (tmp.lengthSq() > 1) tmp.normalize();
  const targetVX = tmp.x * wishSpeed;
  const targetVZ = tmp.z * wishSpeed;
  const accel = body.grounded ? 34 : 6;
  body.velocity.x += Math.max(-accel * dt, Math.min(accel * dt, targetVX - body.velocity.x));
  body.velocity.z += Math.max(-accel * dt, Math.min(accel * dt, targetVZ - body.velocity.z));

  if (body.grounded && jump) {
    body.velocity.y = 4.6;
    body.grounded = false;
  }
  body.velocity.y -= gravity * dt;

  body.crouching = body.height !== STAND_HEIGHT;
  const wantHeight = body.crouchHeld ? CROUCH_HEIGHT : STAND_HEIGHT;
  if (wantHeight > body.height) {
    // Stand up only when there is room overhead.
    const head = body.position.y + wantHeight;
    let blocked = false;
    for (const box of colliders) {
      if (head > box.min.y && body.position.y + 0.1 < box.max.y &&
          Math.abs(body.position.x - (box.min.x + box.max.x) / 2) < RADIUS + (box.max.x - box.min.x) / 2 &&
          Math.abs(body.position.z - (box.min.z + box.max.z) / 2) < RADIUS + (box.max.z - box.min.z) / 2) {
        blocked = true; break;
      }
    }
    if (!blocked) body.height = wantHeight;
  } else if (wantHeight < body.height) {
    body.height = wantHeight;
  }

  // Integrate with axis-separated collision resolution.
  moveAxis(body, 'x', body.velocity.x * dt, colliders);
  moveAxis(body, 'z', body.velocity.z * dt, colliders);
  const newY = body.position.y + body.velocity.y * dt;
  body.grounded = false;
  if (body.velocity.y <= 0 && newY <= groundBelow(body, colliders)) {
    body.position.y = groundBelow(body, colliders);
    body.velocity.y = 0;
    body.grounded = true;
  } else {
    body.position.y = Math.max(newY, 0);
    // Ceiling
    for (const box of colliders) {
      const halfW = (box.max.x - box.min.x) / 2 + RADIUS;
      const halfD = (box.max.z - box.min.z) / 2 + RADIUS;
      const cx = (box.min.x + box.max.x) / 2;
      const cz = (box.min.z + box.max.z) / 2;
      if (body.position.x > box.min.x - RADIUS && body.position.x < box.max.x + RADIUS &&
          body.position.z > box.min.z - RADIUS && body.position.z < box.max.z + RADIUS &&
          body.position.y + body.height > box.min.y && body.position.y < box.min.y &&
          box.max.y - body.position.y < 1.2) {
        body.position.y = Math.min(body.position.y, box.min.y - body.height);
        if (body.velocity.y > 0) body.velocity.y = 0;
      }
    }
  }

  // Eye height follows the body smoothly; the mesh follows position.
  const eye = body.height === STAND_HEIGHT ? STAND_EYE : CROUCH_EYE;
  body.eyeHeight += (eye - body.eyeHeight) * Math.min(1, dt * 14);
  if (!body.isPlayerOnly) {
    body.group.position.set(body.position.x, body.position.y, body.position.z);
    body.group.rotation.y = body.yaw + Math.PI;
    body.torso.scale.setScalar(body.height / STAND_HEIGHT);
    body.head.position.y = (body.height - 0.28) * (body.height / STAND_HEIGHT);
  }
  return body.grounded;
}

function groundBelow(body, colliders) {
  let ground = 0;
  for (const box of colliders) {
    const halfW = (box.max.x - box.min.x) / 2 + RADIUS;
    const halfD = (box.max.z - box.min.z) / 2 + RADIUS;
    const cx = (box.min.x + box.max.x) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    if (Math.abs(body.position.x - cx) < halfW && Math.abs(body.position.z - cz) < halfD) {
      if (box.max.y <= body.position.y + 0.35 && box.max.y > ground) ground = box.max.y;
    }
  }
  return ground;
}

function moveAxis(body, axis, delta, colliders) {
  if (delta === 0) return;
  body.position[axis] += delta;
  const feet = body.position.y;
  const head = body.position.y + body.height;
  for (const box of colliders) {
    if (box.max.y <= feet + 0.02 || box.min.y >= head) continue; // below feet or above head
    const halfW = (box.max.x - box.min.x) / 2 + RADIUS;
    const halfD = (box.max.z - box.min.z) / 2 + RADIUS;
    const cx = (box.min.x + box.max.x) / 2;
    const cz = (box.min.z + box.max.z) / 2;
    const dx = body.position.x - cx;
    const dz = body.position.z - cz;
    if (Math.abs(dx) < halfW && Math.abs(dz) < halfD) {
      if (axis === 'x') body.position.x = cx + halfW * Math.sign(dx || 1);
      else body.position.z = cz + halfD * Math.sign(dz || 1);
    }
  }
}
