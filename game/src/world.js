// The map: Meridian Terminal, a freight dock held between two squads. One floor, three lanes
// (A-way along the west cranes, Mid down the centre, B-way along the east warehouse), two bomb
// sites at the north end, spawn zones at the south and centre-north. Plain boxes only: every
// wall and crate is a collider a body and a bullet both stop on.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const MAP_BOUNDS = { minX: -32, maxX: 32, minZ: -44, maxZ: 44 };
export const SITES = {
  A: { center: new THREE.Vector3(-20, 0, -20), half: 5.5 },
  B: { center: new THREE.Vector3(20, 0, -20), half: 5.5 },
};

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of ['concrete', 'concreteDark', 'metal', 'rust', 'teal', 'accent', 'danger']) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'metal' ? 0.6 : 0.94,
      metalness: name === 'metal' ? 0.35 : 0.04,
    });
  }

  const colliders = []; // THREE.Box3
  const shootables = []; // meshes bullets test against

  function solid(w, h, d, x, y, z, material, opts = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    if (opts.rotationY) mesh.rotation.y = opts.rotationY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const b = new THREE.Box3().setFromObject(mesh);
    colliders.push(b);
    shootables.push(mesh);
    return mesh;
  }

  // Floor: one slab, marked with site plates.
  const floor = new THREE.Mesh(new THREE.BoxGeometry(66, 1, 90), materials.concreteDark);
  floor.position.set(0, -0.5, 0);
  floor.receiveShadow = true;
  group.add(floor);

  // Painted site plates and lane stripes (thin boxes just above the floor, no collision).
  function plate(x, z, w, d, material) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), materials[material]);
    m.position.set(x, 0.03, z);
    m.receiveShadow = true;
    group.add(m);
  }
  plate(-20, -20, 11, 11, 'rust');
  plate(20, -20, 11, 11, 'rust');
  plate(0, 0, 2.2, 26, 'teal');
  plate(-24, 14, 2.2, 30, 'teal');
  plate(24, 14, 2.2, 30, 'teal');

  // Perimeter walls.
  solid(66, 5, 1, 0, 2.5, 44.5, 'concrete');
  solid(66, 5, 1, 0, 2.5, -44.5, 'concrete');
  solid(1, 5, 90, -32.5, 2.5, 0, 'concrete');
  solid(1, 5, 90, 32.5, 2.5, 0, 'concrete');

  // --- A-way (west): long lane behind a rank of crane supports, opens onto site A.
  solid(1.4, 4.2, 30, -22.5, 2.1, 6, 'concrete');      // lane divider to mid
  solid(1.4, 4.2, 14, -22.5, 2.1, -14, 'concrete');
  solid(9, 1.2, 1.4, -26, 3.4, -6, 'metal');           // crane girder overhead
  solid(0.9, 4.2, 0.9, -29.5, 2.1, -6, 'metal');       // crane leg
  solid(0.9, 4.2, 0.9, -22.5, 2.1, -6, 'metal');
  solid(3.2, 1.6, 3.2, -29, 0.8, 12, 'concreteDark');  // crate stack
  solid(2.4, 1.6, 2.4, -26.4, 0.8, 12, 'rust');
  solid(2.4, 1.6, 2.4, -28, 2.4, 12.6, 'metal');
  solid(3.2, 1.6, 3.2, -29.5, 0.8, -1, 'concreteDark'); // crates at the A corner
  solid(2.4, 1.6, 2.4, -26.6, 0.8, -1.6, 'metal');

  // Site A: a cargo pit ringed by low walls and one tall marker column.
  solid(10, 2.2, 1, -20, 1.1, -25.5, 'concrete');
  solid(1, 2.2, 10, -25.5, 1.1, -20, 'concrete');
  solid(0.8, 6, 0.8, -20, 3, -20, 'accent');           // site column, signal orange
  solid(2.6, 1.5, 2.6, -16.5, 0.75, -23, 'teal');
  solid(2.6, 1.5, 2.6, -23.5, 0.75, -16.5, 'teal');

  // A connector room between A-way and site: one door, one window.
  solid(8, 4.2, 0.9, -20, 2.1, -9.5, 'concrete');
  solid(2.2, 2.6, 0.9, -17.4, 1.3, -9.5, 'concrete');  // window sill block (shoot over it)
  solid(2.2, 2.6, 0.9, -22.6, 1.3, -9.5, 'concrete');

  // --- Mid: the centre road, broken by two big skips and a kiosk.
  solid(4.5, 1.6, 2.2, -3.5, 0.8, -4, 'rust');         // skip container west
  solid(4.5, 1.6, 2.2, 3.5, 0.8, 6, 'rust');           // skip container east
  solid(3, 3, 3, 0, 1.5, -14, 'concrete');             // kiosk
  solid(5, 1.4, 1.2, 0, 0.7, -30.5, 'metal');          // low barrier before the north yard
  solid(1.2, 4.2, 12, -7.5, 2.1, -24, 'concrete');     // divider wall A-mid
  solid(1.2, 4.2, 12, 7.5, 2.1, -24, 'concrete');

  // --- B-way (east): warehouse wall with two doorways, loading bay crates.
  solid(1.4, 4.2, 30, 22.5, 2.1, 6, 'concrete');       // lane divider to mid
  solid(1.4, 4.2, 14, 22.5, 2.1, -14, 'concrete');
  solid(10, 1.2, 1.4, 26, 3.4, -6, 'metal');           // warehouse lintel
  solid(0.9, 4.2, 0.9, 29.5, 2.1, -6, 'metal');
  solid(0.9, 4.2, 0.9, 22.5, 2.1, -6, 'metal');
  solid(3.2, 1.6, 3.2, 29, 0.8, 12, 'concreteDark');
  solid(2.4, 1.6, 2.4, 26.4, 0.8, 12, 'rust');
  solid(3.2, 1.6, 3.2, 29.5, 0.8, -1, 'concreteDark');
  solid(2.4, 1.6, 2.4, 26.6, 0.8, -1.6, 'metal');

  // Site B: stacked pallets and a tall container to fight around.
  solid(10, 2.2, 1, 20, 1.1, -25.5, 'concrete');
  solid(1, 2.2, 10, 25.5, 1.1, -20, 'concrete');
  solid(2.2, 5, 5, 21, 2.5, -21, 'teal');              // the B container
  solid(2.6, 1.5, 2.6, 16.5, 0.75, -23, 'teal');
  solid(2.6, 1.5, 2.6, 17.5, 0.75, -16, 'metal');

  // South yards (spawn areas), open with sparse cover.
  solid(3.2, 1.6, 3.2, -12, 0.8, 34, 'concreteDark');
  solid(3.2, 1.6, 3.2, 12, 0.8, 34, 'concreteDark');
  solid(2.4, 1.6, 2.4, -8, 0.8, 27, 'rust');
  solid(2.4, 1.6, 2.4, 8, 0.8, 27, 'rust');
  solid(5, 1.4, 1.2, 0, 0.7, 30, 'metal');             // spawn barrier
  solid(3.2, 1.6, 3.2, -4, 0.8, -34, 'concreteDark');  // warden side cover
  solid(3.2, 1.6, 3.2, 4, 0.8, -34, 'concreteDark');
  solid(2.4, 1.6, 2.4, 0, 0.8, -38, 'rust');

  // Directional sun and a soft ambient; dusk atmosphere handled by main.
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.6);
  sun.position.set(-24, 36, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -45;
  sun.shadow.camera.right = 45;
  sun.shadow.camera.top = 50;
  sun.shadow.camera.bottom = -50;
  sun.shadow.camera.far = 110;
  group.add(sun);
  const skyFill = new THREE.HemisphereLight(0x5d7285, 0x2a2118, 1.6);
  group.add(skyFill);
  const rim = new THREE.DirectionalLight(0x2e6f6c, 1.4);
  rim.position.set(20, 14, -30);
  group.add(rim);

  const spawns = {
    strike: [
      new THREE.Vector3(-12, 0, 38), new THREE.Vector3(-6, 0, 38),
      new THREE.Vector3(0, 0, 38), new THREE.Vector3(6, 0, 38), new THREE.Vector3(12, 0, 38),
    ],
    warden: [
      new THREE.Vector3(-12, 0, -38), new THREE.Vector3(-6, 0, -38),
      new THREE.Vector3(0, 0, -38), new THREE.Vector3(6, 0, -38), new THREE.Vector3(12, 0, -38),
    ],
  };

  // Navigation nodes for the bots: lanes, connectors and site anchors, linked when a straight
  // segment between them clears every collider (computed in nav.js at load).
  const NAV_NODES = [
    // south yard
    [-12, 36], [0, 36], [12, 36],
    // lane entrances
    [-24.2, 28], [24.2, 28], [-6, 24], [6, 24],
    // A-way and B-way middles
    [-24.2, 12], [24.2, 12], [-24.2, 0], [24.2, 0], [-24.2, -12], [24.2, -12],
    // mid course
    [0, 20], [-3.5, 0], [3.5, 10], [4.8, -14], [-5, -27], [5, -27],
    // connectors and doors
    [-20, -9], [20, -9], [-13, -14], [13, -14], [-11, -30], [11, -30],
    // sites
    [-20, -18], [-16, -27], [-22, -27], [20, -18], [20, -27], [23, -24],
    // warden yard
    [-12, -36], [0, -36], [12, -36],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z));

  return { group, colliders, shootables, spawns, NAV_NODES, sun };
}
