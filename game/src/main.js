// Meridian Terminal — boot, the one loop, the player, the buy flow, the spike actions and the
// screenshot pipeline. A fixed 60 Hz simulation advances everything; the render draws whatever
// the simulation says at the display's rate.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, SITES } from './world.js';
import { createInput } from './input.js';
import { createBody, stepBody, STAND_HEIGHT } from './player.js';
import { WEAPONS, createViewModel, rayHit, damageOf } from './weapon.js';
import { initNav, createBots, setEconomyBuy } from './bots.js';
import { createBomb } from './bomb.js';
import { createGrenades, grenadeDamage } from './grenades.js';
import { createEconomy, PRICES } from './economy.js';
import { createHud } from './hud.js';
import { createRounds, PHASE, WIN_SCORE, LIVE_TIME } from './rounds.js';
import { createAudio } from './audio.js';


const FIXED_STEP = 1 / 60;
const GRAVITY = 22;

const params = new URLSearchParams(window.location.search);
const shotMode = params.get('shot'); // start | play | end, with &seed=N
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const captureName = shotMode ? params.get('capture') : null;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ 0;
    return (t ^ (t >>> 14)) >>> 0;
  };
}
let random = mulberry32(seed);
// The seeded stream replaces Math.random for the sim; deterministic rounds per seed.
const mathRandom = Math.random.bind(Math);
Math.random = () => random() / 4294967296;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.getElementById('game').appendChild(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.sky), 40, 90);
const camera = new THREE.PerspectiveCamera(76, window.innerWidth / window.innerHeight, 0.05, 150);

const world = createWorld(scene);
initNav(world);
const actors = [];
const actorsRef = () => actors;
world.actors = actorsRef;

const input = createInput(canvas);
const audio = createAudio();
const economy = createEconomy();
const bomb = createBomb(scene);
const grenades = createGrenades(scene, world);
world.grenades = grenades;
const hud = createHud(world);
const viewModel = createViewModel(camera);

// --- Actors -----------------------------------------------------------------
// A body stands for an actor: the teams, health and inventory live on it, the mesh only on bots.
const playerBody = createBody(scene, world.spawns.strike[2].clone(), PALETTE.strike, true);
playerBody.team = 'strike';
playerBody.isPlayer = true;
playerBody.weapon = 'pistol';
playerBody.mag = 12;
playerBody.reserve = 48;
playerBody.reloadLeft = 0;
playerBody.cooldown = 0;
playerBody.recoil = 0;
playerBody.eye = () => new THREE.Vector3(playerBody.position.x, playerBody.position.y + playerBody.eyeHeight, playerBody.position.z);
actors.push(playerBody);

const botsApi = createBots(scene, world, 9);
for (const bot of botsApi.bots) {
  const team = bot.index < 4 ? 'strike' : 'warden';
  const color = team === 'strike' ? PALETTE.strike : PALETTE.warden;
  botsApi.createBotBody(bot, scene, color);
  bot.body.team = team;
  bot.body.weapon = 'pistol';
  bot.body.mag = 12;
  bot.body.reserve = 48;
  bot.body.reloadLeft = 0;
  bot.body.cooldown = 0;
  bot.body.recoil = 0;
  bot.body.eye = () => new THREE.Vector3(bot.body.position.x, bot.body.position.y + bot.body.eyeHeight, bot.body.position.z);
  actors.push(bot.body);
}
scene.add(camera);
setEconomyBuy((team) => economy.buy(team, 'grenade'));

// --- Player loadout & buying -------------------------------------------------
const loadout = { primary: null, sidearm: 'pistol', slot: 'sidearm', grenade: false, /* from economy */ };

function currentGun() {
  const kind = loadout.primary && loadout.slot === 'primary' ? loadout.primary : 'pistol';
  return kind;
}

function giveGun(actor, kind) {
  actor.weapon = kind;
  actor.mag = WEAPONS[kind].mag;
  actor.reserve = WEAPONS[kind].reserve;
}

function buyItem(code) {
  if (!rounds.canBuy() || !playerBody.alive) return;
  const purchases = {
    '1': () => buyGun('smg'), '2': () => buyGun('rifle'), '3': () => buyGun('marksman'),
    '4': () => { if (economy.buy('strike', 'armor')) { playerBody.armor = 100; audio.buy(); } },
    '5': () => { if (economy.buy('strike', 'grenade', loadout)) audio.buy(); },
    '6': () => { hud.feed('Defuse kits belong to the Warden squad'); },
  };
  (purchases[code] ?? (() => {}))();
}

function buyGun(kind) {
  if (loadout.primary === kind) { loadout.slot = 'primary'; audio.buy(); return; }
  if (!economy.buy('strike', kind)) return;
  loadout.primary = kind;
  loadout.slot = 'primary';
  giveGun(playerBody, kind);
  audio.buy();
}

// --- Damage -----------------------------------------------------------------
function damage(actor, amount, attacker, part, source) {
  if (!actor.alive) return;
  if (attacker && actor.team === attacker.team) return;
  if (actor.armor > 0 && !(source === 'grenade')) {
    const absorbed = Math.min(actor.armor, Math.round(amount * 0.5));
    actor.armor -= absorbed;
    amount -= absorbed;
  } else if (source === 'grenade') {
    amount = Math.round(amount * 0.6);
  }
  actor.hp -= amount;
  if (actor.isPlayer) {
    audio.hurt();
    flashDamage();
  }
  if (attacker?.isPlayer) hud.hitmarker();
  if (actor.hp <= 0) {
    actor.alive = false;
    if (!actor.isPlayer) { actor.group.visible = false; }
    const killer = attacker?.team ?? '';
    hud.feed(`<b class="${killer === 'strike' ? 's' : 'w'}">${nameOf(attacker)}</b> downed <b class="${actor.team === 'strike' ? 's' : 'w'}">${nameOf(actor)}</b>${part === 'head' ? ' · headshot' : ''}`);
    economy.reward('kill', killer);
    if (bomb.state.carrier === actor) bomb.drop();
    checkPickups();
  }
}

function nameOf(actor) {
  if (actor.isPlayer) return 'you';
  const n = actor.bot ? botNames[actor.bot.index % botNames.length] : 'oper';
  return n;
}
const botNames = ['Cinder', 'Vane', 'Rooke', 'Tally', 'Marrow', 'Sable', 'Quill', 'Dray', 'Fen'];

// --- Round wiring -----------------------------------------------------------
let spikeKeyTarget = null;

const rounds = createRounds(actorsRef, bomb, economy, {
  respawn(first) {
    // Player and bots back to spawns, guns kept or pistol, hp reset.
    economy.reset?.call?.();
    playerBody.alive = true;
    playerBody.hp = 100;
    playerBody.armor = economy.teams[rounds.state.playerSide].armor ?? 0;
    const spot = new THREE.Vector3(0, 0, 40.5);
    playerBody.position.copy(spot);
    playerBody.velocity.set(0, 0, 0);
    playerBody.yaw = 0; // face north, into the map
    playerBody.height = STAND_HEIGHT;
    if (!playerBody.group.visible) playerBody.group.visible = true;
    if (first) loadout.primary = null, loadout.grenade = false, giveGun(playerBody, 'pistol'), loadout.slot = 'sidearm';
    else if (loadout.primary) giveGun(playerBody, loadout.primary);
    else giveGun(playerBody, 'pistol');

    const assignment = [];
    let strikeIdx = 0;
    let wardenIdx = 0;
    const strikeSpotIdx = [0, 1, 3, 4]; // skip the middle spot: that is the player's
    for (const bot of botsApi.bots) {
      const team = bot.index < 4 ? 'strike' : 'warden';
      const alive = true;
      bot.body.alive = alive;
      bot.body.hp = 100;
      bot.body.armor = economy.teams[team].armor ?? 0;
      const spots = world.spawns[team];
      const spot2 = spots[team === 'strike' ? strikeSpotIdx[strikeIdx % 4] : (wardenIdx++ % spots.length)];
      if (team === 'strike') strikeIdx++;
      bot.body.position.copy(spot2.position ?? spot2);
      if (spot2.position) bot.body.position.copy(spot2.position);
      bot.body.velocity.set(0, 0, 0);
      bot.body.group.visible = true;
      bot.body.height = STAND_HEIGHT;
      const kind = first ? 'pistol' : (economy.teams[team].money >= 2700 ? 'rifle' : economy.teams[team].money >= 1050 ? 'smg' : 'pistol');
      if (kind !== 'pistol') economy.buy(team, kind);
      giveGun(bot.body, kind);
      bot.grenade = false;
      assignment.push({ bot, team, lane: bot.index % 2 === 0 ? 'A' : 'B' });
    }
    // One strike bot carries the spike.
    const carrier = assignment.find((a) => a.team === 'strike');
    botsApi.assignRound(assignment, bomb);
    bomb.giveTo(carrier.bot.body);
    loadout.slot = loadout.primary ? 'primary' : 'sidearm';
    hud.el.overlay.hidden = true;
  },
  live() {
    audio.roundStart();
    hud.el.phase.textContent = 'live · plant or hold';
  },
  roundEnd(result) {
    audio[result.winner === 'strike' ? 'win' : 'lose']();
    hud.el.phase.textContent = `round over · ${result.reason}`;
  },
  matchOver(score) {
    hud.el.overlay.hidden = true;
    hud.scoreboard('Meridian', 'The final heat is settled', `${score.strike} · ${score.warden}`);
  },
  bombDefusing() {
    return (playerBody.alive && defusingPlayer) || botsApi.bots.some((bot) =>
      bot.body.alive && bot.body.team === 'warden' && bot.defusing &&
      bot.body.position.distanceTo(bomb.state.position) <= 1.7);
  },
});

let defusingPlayer = false;

// --- Spike actions (player) ---------------------------------------------------
function spikeActions(dt, input) {
  const livePhase = rounds.state.phase === PHASE.LIVE;
  const carry = bomb.state.carrier === playerBody;
  const onSite = bomb.siteAt(playerBody.position);
  spikeKeyTarget = null;
  hud.el.bombbar.hidden = true;
  hud.el.hint.hidden = true;

  if (input.usePressed) {
    if (carry && onSite && !bomb.state.planted && livePhase && bomb.plant(playerBody, playerBody.position)) {
      audio.planted();
      economy.reward('plant', 'strike');
      hud.feed('<b class="s">you</b> planted the spike');
    }
  }
  defusingPlayer = livePhase && input.use && playerBody.alive &&
    playerBody.team === 'warden' && bomb.state.planted &&
    playerBody.position.distanceTo(bomb.state.position) < 1.6;
  input.usePressed = false;

  if (bomb.state.planted && playerBody.alive) {
    const d = playerBody.position.distanceTo(bomb.state.position);
    if (d < 1.8) {
      const progress = bomb.defuseProgress();
      hud.el.bombbar.hidden = false;
      hud.el.bombfill.style.width = `${(progress * 100).toFixed(0)}%`;
      hud.el.hint.hidden = rounds.state.playerSide === 'strike';
      if (rounds.state.playerSide === 'warden') hud.el.hint.textContent = 'hold E to defuse';
    }
  }
  if (carry && !onSite && livePhase) {
    hud.el.hint.hidden = false;
    hud.el.hint.textContent = 'carry the spike into a marked site';
  }
}

// Pickup: surviving strike bodies take the dropped spike by walking over it.
function checkPickups() {
  if (bomb.state.carrier || bomb.state.planted || !bomb.state.dropped) return;
  for (const a of actors) {
    if (a.alive && a.team === 'strike' && a.position.distanceTo(bomb.state.position) < 1.4) {
      bomb.giveTo(a);
      break;
    }
  }
}

// --- Shooting (player) ---------------------------------------------------------

// --- Shooting (player) ---------------------------------------------------------
function playerFire(dt) {
  const gun = WEAPONS[currentGun()];
  const wasReloading = playerBody.reloadLeft > 0;
  playerBody.cooldown -= dt;
  playerBody.recoil = Math.max(0, playerBody.recoil - dt * gun.recoilRecover);
  playerBody.reloadLeft = Math.max(0, playerBody.reloadLeft - dt);
  if (wasReloading && playerBody.reloadLeft === 0) {
    const take = Math.min(gun.mag - playerBody.mag, playerBody.reserve);
    playerBody.mag += take;
    playerBody.reserve -= take;
  }
  if (playerBody.reloadLeft > 0) return;

  if (input.reload && playerBody.mag < gun.mag && playerBody.reserve > 0) {
    playerBody.reloadLeft = gun.reloadTime;
    audio.reload();
    input.reload = false;
    return;
  }
  input.reload = false;
  if (!input.fire || playerBody.reloadLeft > 0) return;
  if (playerBody.cooldown > 0) return;
  if (playerBody.mag <= 0) { audio.empty(); playerBody.cooldown = 0.3; return; }

  playerBody.cooldown = gun.fireInterval;
  playerBody.mag--;
  viewModel.muzzle();

  const eye = playerBody.eye();
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  // Spread: stance, movement, air, recoil bloom.
  const moving = Math.hypot(playerBody.velocity.x, playerBody.velocity.z);
  let spread = gun.spreadBase;
  spread += (moving / 4) * gun.spreadMove * (input.walk ? 0.4 : 1);
  if (!playerBody.grounded) spread += gun.spreadAir;
  if (playerBody.height < STAND_HEIGHT) spread *= gun.spreadCrouch;
  spread += playerBody.recoil;
  const ang = random() * Math.PI * 2;
  const r = Math.sqrt(random()) * spread;
  const right = new THREE.Vector3(Math.cos(playerBody.yaw), 0, -Math.sin(playerBody.yaw));
  dir.addScaledVector(right, Math.cos(ang) * r).addScaledVector(new THREE.Vector3(0, 1, 0), Math.sin(ang) * r).normalize();

  const hit = rayHit(eye, dir, 120, world, actors, playerBody);
  tracer(eye, dir, hit ? hit.dist : 120);
  if (hit && hit.actor && hit.actor.team !== playerBody.team) {
    const dmg = damageOf(gun, hit.dist, hit.part);
    damage(hit.actor, dmg, playerBody, hit.part);
    audio.hit(hit.part === 'head');
    spark(eye, dir, hit.dist);
  }

  playerBody.recoil += gun.recoilKick;
  viewModel.kickUp(gun.kickBack);
  playerBody.pitch += gun.recoilKick * 0.8;
  audio.shot(gun.sound, true);
}

// --- FX: tracer, sparks, damage flash ------------------------------------------
const tracerGeo = new THREE.CylinderGeometry(0.008, 0.008, 1, 5);
tracerGeo.translate(0, -0.5, 0);
const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.7 });
const tracers = [];
for (let i = 0; i < 8; i++) {
  const m = new THREE.Mesh(tracerGeo, tracerMat);
  m.visible = false;
  scene.add(m);
  tracers.push({ mesh: m, life: 0 });
}
function tracer(from, dir, dist) {
  const t = tracers.find((t) => t.life <= 0) ?? tracers[0];
  t.life = 0.05;
  t.mesh.position.copy(from);
  t.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  t.mesh.scale.set(1, dist, 1);
  t.mesh.visible = true;
}
const sparkPool = [];
const sparkGeo = new THREE.SphereGeometry(0.05, 5, 4);
for (let i = 0; i < 12; i++) {
  const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: 0xffc27a }));
  m.visible = false;
  scene.add(m);
  sparkPool.push({ mesh: m, life: 0 });
}
function spark(origin, dir, dist) {
  const s = sparkPool.find((s) => s.life <= 0) ?? sparkPool[0];
  s.life = 0.12;
  s.mesh.position.copy(origin).addScaledVector(dir, dist);
  s.mesh.visible = true;
}
let dmgFlash = 0;
function flashDamage() { dmgFlash = 0.5; }
function stepFx(dt) {
  for (const t of tracers) {
    t.life -= dt;
    t.mesh.visible = t.life > 0;
  }
  for (const s of sparkPool) {
    s.life -= dt;
    s.mesh.visible = s.life > 0;
  }
  dmgFlash = Math.max(0, dmgFlash - dt);
  document.getElementById('vignette').style.boxShadow =
    `inset 0 0 120px rgba(0,0,0,0.55), inset 0 0 90px rgba(216,74,53,${(dmgFlash * 0.6).toFixed(2)})`;
}

// --- Grenade (player) ------------------------------------------------------------
function playerGrenade() {
  if (!loadout.grenade) return;
  loadout.grenade = false;
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  grenades.throw(playerBody, playerBody.eye(), dir, 14);
}
function explode(thrower, point) {
  audio.burst();
  const flashLight = new THREE.PointLight(0xffb066, 60, 16, 2);
  flashLight.position.copy(point);
  scene.add(flashLight);
  const boom = sparkPool.find((s) => s.life <= 0) ?? sparkPool[0];
  boom.life = 0.3;
  boom.mesh.position.copy(point);
  boom.mesh.visible = true;
  boom.mesh.scale.setScalar(9);
  setTimeout(() => { scene.remove(flashLight); boom.mesh.scale.setScalar(1); }, 90);
  const dist = point.distanceTo(playerBody.position);
  if (dist < 40) audio.explosionFar();
  for (const a of actors) {
    if (!a.alive) continue;
    const d = grenadeDamage(point, a);
    if (d > 0) damage(a, d, thrower, 'body', 'grenade');
  }
}

// --- Camera & view --------------------------------------------------------------
function updateCamera() {
  camera.position.set(playerBody.position.x, playerBody.position.y + playerBody.eyeHeight, playerBody.position.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = playerBody.yaw;
  camera.rotation.x = playerBody.pitch;
}

// --- Simulation step --------------------------------------------------------------
function simulate(dt) {
  input.sample();
  const buying = rounds.canBuy();
  const playerAlive = playerBody.alive;
  if (!buying || !playerAlive) input.buyOpen = false;
  hud.el.buy.hidden = !input.buyOpen;

  if (buying && playerAlive) {
    if (input.buyToggle) input.buyToggle = false;
    stepBody(playerBody, new THREE.Vector3(), 0, dt, world.colliders, GRAVITY, false);
  } else if (playerAlive) {
    const wish = new THREE.Vector3(input.strafe, 0, -input.forward);
    wish.applyAxisAngle(new THREE.Vector3(0, 1, 0), playerBody.yaw);
    const walkSpeed = input.walk ? 2.1 : 0;
    let speed = input.crouch ? 1.7 : 5.2;
    if (walkSpeed) speed = Math.min(speed, walkSpeed);
    playerBody.crouchHeld = input.crouch;
    stepBody(playerBody, wish, speed, dt, world.colliders, GRAVITY, input.jump && playerBody.grounded);
    if (input.jump) input.jump = false;
    spiralCd(playerBody, dt);
    if (input.grenadeKey) { input.grenadeKey = false; playerGrenade(); }
  }
  playerBody.yaw += input.yawDelta;
  playerBody.pitch = Math.max(-1.45, Math.min(1.45, playerBody.pitch + input.pitchDelta));
  input.yawDelta = 0;
  input.pitchDelta = 0;

  if (input.weaponSelect) { buyItem(String(input.weaponSelect)); input.weaponSelect = 0; }
  input.buyToggle = false; // the toggle was consumed by the listener when it flipped the menu

  spikeActions(dt, input);

  // Bots tick.
  const dtBots = dt;
  const roundState = rounds.state;
  if (!buying || roundState.phase === PHASE.WARMUP) {
    for (const bot of botsApi.bots) {
      botsApi.step(bot, dtBots, bomb, audio, (a, d, atk, part) => damage(a, d, atk, part), roundState);
    }
  } else {
    for (const bot of botsApi.bots) stepBody(bot.body, new THREE.Vector3(), 0, dt, world.colliders, GRAVITY, false);
  }

  if (playerAlive && !buying) playerFire(dt);
  grenades.step(dt, actors, (thrower, point) => explode(thrower, point));

  // Footsteps of nearby runners, heard as audio only.
  for (const a of actors) {
    if (!a.alive || a.isPlayer) continue;
    const speed = Math.hypot(a.velocity.x, a.velocity.z);
    if (speed > 2 && playerBody.position.distanceTo(a.position) < 12) {
      a.stepT = (a.stepT ?? 0) - dt;
      if (a.stepT <= 0) { a.stepT = 0.4; audio.step(a.team === 'warden'); }
    }
  }

  stepFx(dt);
  rounds.step(dt);
}

function spiralCd(body, dt) {
  body.recoil = Math.max(0, (body.recoil ?? 0) - dt * 8);
}

// --- HUD update --------------------------------------------------------------------
function fmtClock(t) {
  const s = Math.max(0, Math.ceil(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function updateHud() {
  const gun = WEAPONS[currentGun()];
  hud.el.health.textContent = Math.max(0, playerBody.hp);
  hud.el.armor.textContent = `ARM ${Math.max(0, Math.round(playerBody.armor))}`;
  hud.el.money.textContent = `$${economy.teams[rounds.state.playerSide].money}`;
  hud.el.mag.textContent = playerBody.mag;
  hud.el.reserve.textContent = `/ ${playerBody.reserve}`;
  hud.el.ammo.classList.toggle('empty', playerBody.mag === 0);
  hud.el.weapon.textContent = gun.name.toUpperCase();
  hud.el.clock.textContent = fmtClock(bomb.state.planted ? bomb.state.timer : rounds.state.clock);
  hud.el.clock.style.color = bomb.state.planted ? 'var(--danger)' : '';
  hud.el.score.innerHTML = `<span class="s">STR ${rounds.state.score.strike}</span> · <span class="w">${rounds.state.score.warden} WRD</span>`;
  hud.el.phase.textContent =
    rounds.state.phase === PHASE.BUY ? 'buy · B / number buys' :
    rounds.state.phase === PHASE.WARMUP ? 'match begins' :
    bomb.state.planted ? 'spike planted' : 'live';
  hud.dots(actors, 'strike', bomb);
}

// --- Shot pipeline ---------------------------------------------------------------
// A body looks along (−sin yaw, −cos yaw); to face a point, yaw = atan2(−dx, −dz).
function lookYaw(from, to) { return Math.atan2(-(to.x - from.x), -(to.z - from.z)); }

async function runShotMode() {
  // Freeze the overlay so screenshots show the game, not the click panel.
  document.getElementById('overlay').hidden = true;
  rounds.newRound(true);
  const sim = (n) => { for (let i = 0; i < n; i++) simulate(FIXED_STEP); };
  if (shotMode === 'start') {
    sim(20); // a beat after buy phase opens: armed operators at spawn
    rounds.state.phase = PHASE.LIVE;
    rounds.state.clock = LIVE_TIME - 2;
    sim(1);
  } else if (shotMode === 'play') {
    rounds.state.phase = PHASE.LIVE;
    rounds.state.clock = LIVE_TIME - 20;
    sim(780); // thirteen seconds of live play: pushes, contacts, opening fights
    // Stand behind a pushing teammate and look where the fight is.
    let guide = actors.find((a) => a.alive && !a.isPlayer && a.team === 'strike') ?? playerBody;
    for (const a of actors) if (a.alive && !a.isPlayer && a.team === 'strike' && a.position.z < guide.position.z) guide = a;
    playerBody.position.set(guide.position.x - 1.2, guide.position.y, guide.position.z + 2.6);
    const foes = actors.filter((a) => a.alive && a.team === 'warden');
    foes.sort((a, b) => guide.position.distanceToSquared(a.position) - guide.position.distanceToSquared(b.position));
    let aimed = false;
    for (const foe of foes) {
      // Aim at the first enemy a straight line actually reaches.
      const dir = foe.eye().sub(guide.eye());
      const dist = dir.length();
      const hit = rayHit(guide.eye(), dir.normalize(), dist, world, actors, guide);
      if (!hit || hit.actor === foe) {
        playerBody.yaw = lookYaw(playerBody.position, foe.position);
        aimed = true;
        break;
      }
    }
    if (!aimed) playerBody.yaw = (guide.yaw ?? 0);
    playerBody.pitch = -0.02;
    sim(2);
  } else if (shotMode === 'end') {
    rounds.state.phase = PHASE.LIVE;
    rounds.state.clock = 6;
    bomb.plant(actors[1] ?? playerBody, SITES.A.center);
    sim(200); // spike down, teams converging
    playerBody.position.set(-14, 0, -10);
    playerBody.yaw = lookYaw(playerBody.position, bomb.state.position);
    playerBody.pitch = -0.08;
    sim(2);
  }
  if (captureName) {
    console.log('[shot]', shotMode, 'player', playerBody.position.x.toFixed(1), playerBody.position.z.toFixed(1), 'yaw', playerBody.yaw.toFixed(2));
    for (const a of actors) if (!a.isPlayer) console.log('[bot]', a.bot?.index, a.alive, a.position.x.toFixed(1), a.position.z.toFixed(1), 'path', a.bot?.navPath?.length, 'idx', a.bot?.navIdx);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    renderer.render(scene, camera);
    try {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      await fetch(`/capture/${captureName}`, { method: 'POST', body: dataUrl });
      console.log('capture sent');
    } catch (e) {
      console.log('capture skipped: only while serve.ts runs the page');
    }
  }
  window.__shotReady = true;
}

// --- Main loop ---------------------------------------------------------------------
let accumulator = 0;
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (shotMode) {
    if (!window.__frozeOnce) {
      runShotMode().then(() => { window.__frozeOnce = true; });
      window.__frozeOnce = true;
    }
    if (window.__shotReady) {
      updateCamera();
      updateHud();
      renderer.render(scene, camera);
    }
    return;
  }
  accumulator += dt;
  while (accumulator >= FIXED_STEP) {
    simulate(FIXED_STEP);
    accumulator -= FIXED_STEP;
  }
  updateCamera();
  updateHud();
  viewModel.update(dt, Math.hypot(playerBody.velocity.x, playerBody.velocity.z) > 0.4, playerBody.grounded, input.crouch);
  renderer.render(scene, camera);
}

// Boot wiring that needs the DOM ----------------------------------------------------
document.getElementById('play').addEventListener('click', () => {
  audio.resume();
  if (rounds.state.phase === PHASE.WARMUP) rounds.newRound(true);
  document.getElementById('overlay').hidden = true;
  input.requestLock();
});
document.getElementById('overlay').addEventListener('click', (e) => {
  if (e.target.id !== 'play') input.requestLock();
});
canvas.addEventListener('click', () => {
  if (!input.locked() && rounds.state.phase !== PHASE.WARMUP) input.requestLock();
});

updateHud();
requestAnimationFrame(frame);
