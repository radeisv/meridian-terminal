// Bots: the other nine bodies. Each walks routes on the nav graph, holds a post, turns to
// what it sees, fires with reaction time and a skill-scaled spread, carries the spike to a
// site and plants it, defuses it, picks it up when it drops. One shared think tick per bot,
// staggered so nine raycasts never land in the same frame.
import * as THREE from 'three';
import { rayHit, WEAPONS, damageOf } from './weapon.js';
import { buildNav, nearestNode, route } from './nav.js';
import { SITES } from './world.js';
import { createBody, stepBody } from './player.js';

const EYE = 1.55;
const tmpDir = new THREE.Vector3();
const tmpEye = new THREE.Vector3();
const tmpTarget = new THREE.Vector3();

let graph = null;
let nodes = null;
let worldRef = null;

export function initNav(world) {
  worldRef = world;
  nodes = world.NAV_NODES;
  graph = buildNav(nodes, world.colliders);
}

// One grenade per team per round: the economy buys it, a designated bot carries and throws it.
function economyBuyGrenade(team) {
  return economyRef?.(team) ?? false;
}
let economyRef = null;
export function setEconomyBuy(fn) { economyRef = fn; }

export function createBots(scene, world, count) {
  const bots = [];
  const posts = [
    { site: 'A', spot: new THREE.Vector3(-24, 0, -23), aim: new THREE.Vector3(-20, 0, 8) },
    { site: 'A', spot: new THREE.Vector3(-17, 0, -17), aim: new THREE.Vector3(0, 0, 0) },
    { site: 'B', spot: new THREE.Vector3(23, 0, -24), aim: new THREE.Vector3(20, 0, 8) },
    { site: 'B', spot: new THREE.Vector3(17, 0, -17), aim: new THREE.Vector3(6, 0, 0) },
    { site: 'A', spot: new THREE.Vector3(-20, 0, -9), aim: new THREE.Vector3(-26, 0, 24) },
  ];

  for (let i = 0; i < count; i++) {
    const bot = {
      index: i,
      body: null,
      weapon: 'pistol',
      mag: 12, reserve: 48,
      reloadLeft: 0,
      cooldown: 0,
      recoil: 0,
      route: null, routeIdx: 0,
      thinkAt: i * 0.13,
      seen: null, seenFor: 0, react: 0.34,
      skill: 0.5 + (i % 5) * 0.1,
      holdPost: null,
      state: 'idle',
      plantAt: null,
      defuseT: 0,
      grenade: false,
    };
    bots.push(bot);
  }

  function findPathTo(bot, point) {
    const from = nearestNode(graph, nodes, bot.body.position);
    const to = nearestNode(graph, nodes, point);
    return route(graph, nodes, from, to);
  }

  function canSee(bot, target) {
    if (!target.alive) return false;
    tmpEye.set(bot.body.position.x, bot.body.position.y + EYE - 0.1, bot.body.position.z);
    tmpTarget.set(target.position.x, target.position.y + (target.height - 0.4), target.position.z);
    tmpDir.copy(tmpTarget).sub(tmpEye);
    const dist = tmpDir.length();

    tmpDir.divideScalar(dist);
    // Facing check: within ~100 degrees of where the bot looks (forward is (−sin yaw, −cos yaw)).
    const facing = -(Math.sin(bot.body.yaw) * tmpDir.x + Math.cos(bot.body.yaw) * tmpDir.z);

    const hit = rayHit(tmpEye, tmpDir, dist, worldRef, allActors(), bot.body);
    return !hit || hit.dist >= dist - 0.5;
  }

  function shoot(bot, dt, target, audio, onDamage) {
    bot.cooldown -= dt;
    bot.recoil = Math.max(0, bot.recoil - dt * WEAPONS[bot.weapon].recoilRecover);
    if (bot.reloadLeft > 0) {
      bot.reloadLeft -= dt;
      if (bot.reloadLeft <= 0) {
        const need = WEAPONS[bot.weapon].mag - bot.mag;
        const take = Math.min(need, bot.reserve);
        bot.mag += take; bot.reserve -= take;
      }
      return;
    }
    if (bot.mag <= 0) {
      if (bot.reserve > 0) { bot.reloadLeft = WEAPONS[bot.weapon].reloadTime; audio.reload(); }
      return;
    }
    if (bot.cooldown > 0) return;
    bot.cooldown = WEAPONS[bot.weapon].fireInterval;
    bot.mag--;
    const w = WEAPONS[bot.weapon];
    tmpEye.set(bot.body.position.x, bot.body.position.y + EYE - 0.1, bot.body.position.z);
    tmpTarget.set(target.position.x, target.position.y + target.height - 0.35, target.position.z);
    tmpDir.copy(tmpTarget).sub(tmpEye).normalize();
    // Skill spread + movement spread + recoil bloom; a small systematic miss keeps fights fair.
    const moving = bot.body.velocity.length() > 1.2;
    const moveErr = moving ? w.spreadMove * 0.35 : 0;
    const err = (w.spreadBase + moveErr + bot.recoil) * (1.1 - bot.skill * 0.6);
    const ang = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * err;
    const right = new THREE.Vector3(Math.cos(bot.body.yaw), 0, -Math.sin(bot.body.yaw));
    tmpDir.addScaledVector(right, Math.cos(ang) * r).addScaledVector(new THREE.Vector3(0, 1, 0), Math.sin(ang) * r).normalize();
    const hit = rayHit(tmpEye, tmpDir, 70, worldRef, allActors(), bot.body);
    bot.recoil += w.recoilKick * 0.7;
    const near = hit && hit.actor && hit.actor.isPlayer;
    audio.shot(w.sound, near);
    if (hit && hit.actor && hit.actor.team !== bot.body.team) {
      const dmg = damageOf(w, hit.dist, hit.part) * (0.55 + bot.skill * 0.5);
      onDamage(hit.actor, dmg, bot.body, hit.part);
    }
  }

  function botBody(bot, scene, teamColor) {
    bot.body = createBody(scene, new THREE.Vector3(0, 0, 0), teamColor, false);
    bot.body.isBot = true;
    bot.body.bot = bot;
    return bot.body;
  }

  function allActors() { return worldRef.actors(); }

  function assignRound(assignments, bomb) {
    // assignments: [{bot, team, lane}]
    for (const a of assignments) {
      const bot = a.bot;
      bot.team = a.team;
      bot.body.team = a.team;
      bot.body.alive = true;
      bot.state = a.team === 'strike' ? 'push' : 'hold';
      bot.navPath = null;
      bot.seen = null;
      bot.plantAt = null;
      if (a.team === 'strike') {
        const key = a.lane ?? (Math.random() < 0.5 ? 'A' : 'B');
        bot.goal = key === 'A' ? SITES.A.center.clone() : SITES.B.center.clone();
        bot.grenade = bot.index === 0 && economyBuyGrenade(a.team);
      } else {
        bot.holdPost = posts[(bot.index) % posts.length];
        bot.goal = null;
        bot.grenade = bot.index === 6 && economyBuyGrenade(a.team);
      }
    }
  }

  function step(bot, dt, bomb, audio, onDamage, roundState) {
    bot.defusing = false;
    const body = bot.body;
    if (!body.alive) return;
    bot.thinkAt -= dt;
    const think = bot.thinkAt <= 0;
    if (think) bot.thinkAt = 0.16;

    if (bot.reloadLeft > 0) { /* reload ticks inside shoot() */ }

    // Perception: the nearest visible enemy.
    let visible = null;
    let visibleD = Infinity;
    for (const a of allActors()) {
      if (!a.alive || a.team === bot.team) continue;
      if (think && canSee(bot, a)) {
        const d = bot.body.position.distanceTo(a.position);
        if (d < visibleD) { visibleD = d; visible = a; }
      }
    }
    if (visible) {
      if (bot.seen !== visible) { bot.seen = visible; bot.react = 0.24 + (1 - bot.skill) * 0.3; }
      bot.seenFor = 0;
      bot.state = 'fight';
    } else {
      bot.seenFor += dt;
      if (bot.seenFor > 2.4 && bot.seen) {
        bot.seen = null;
        bot.state = bot.team === 'strike' ? 'push' : 'hold';
      }
    }
    if (bot.state === 'fight') bot.react -= dt;

    if (bot.state === 'fight' && bot.seen && bot.react <= 0) {
      faceTowards(bot, bot.seen.position, dt, 9);
      shoot(bot, dt, bot.seen, audio, onDamage);
      // A carried frag is thrown once, at a distant target, on a short chance each second.
      const throwAt = bot.body.position.distanceTo(bot.seen.position);
      if (throwAt < 22 && bot.grenade && Math.random() < dt * 0.5) {
        bot.grenade = false;
        const dir = tmpTarget.copy(bot.seen.position).sub(bot.body.position).normalize().addScaledVector(new THREE.Vector3(0, 1, 0), 0.5).normalize();
        worldRef.grenades.throw(bot.body, bot.body.eye(), dir, 13);
      }
      // Strafe jiggle while firing, only at a distance; up close, plant and duel.
      const far = bot.body.position.distanceTo(bot.seen.position) > 12;
      if (far) {
        const jig = Math.sin(performance.now() * 0.004 + bot.index) > 0 ? 1 : -1;
        const right = new THREE.Vector3(Math.cos(body.yaw), 0, -Math.sin(body.yaw)).multiplyScalar(jig);
        stepBody(body, right, 1.6, dt, worldRef.colliders, 22, false);
      } else {
        stepBody(body, new THREE.Vector3(), 0, dt, worldRef.colliders, 22, false);
      }
      return;
    }

    if (bot.team === 'strike') {
      // Carry the spike, plant, or keep pushing the target site.
      if (bomb.state.carrier === body) {
        if (!bot.goal) bot.goal = SITES.A.center.clone();
        if (bot.body.position.distanceTo(bot.goal) < 3.2) {
          faceTowards(bot, bot.goal, dt, 4);
          const planted = bomb.plant(body, body.position);
          if (planted) { audio.planted(); bot.state = 'guard'; bot.goal = null; }
          stepBody(body, new THREE.Vector3(), 0, dt, worldRef.colliders, 22, false);
          return;
        }
        walkRouteTo(bot, dt, bot.goal, 3.6);
        return;
      }
      if (bomb.state.planted) {
        // Guard the spike: hold near it, face the likely approach.
        const away = tmpTarget.copy(body.position).sub(bomb.state.position);
        faceTowards(bot, bomb.state.position.clone().add(away.multiplyScalar(-2)), dt, 4);
        stepBody(body, new THREE.Vector3(), 0, dt, worldRef.colliders, 22, false);
        return;
      }
      if (!bot.goal) bot.goal = SITES.A.center.clone();
      walkRouteTo(bot, dt, bot.goal, 3.6);
      return;
    }

    // Warden: hold the post; after the plant, rotate to the spike and defuse.
    if (bomb.state.planted) {
      const d = body.position.distanceTo(bomb.state.position);
      if (d > 1.7) { walkRouteTo(bot, dt, bomb.state.position, 4.4); return; }
      bot.defusing = roundState.phase === 'live';
      faceTowards(bot, bomb.state.position, dt, 5);
      stepBody(body, new THREE.Vector3(), 0, dt, worldRef.colliders, 22, false);
      return;
    }
    if (bot.holdPost) {
      const d = body.position.distanceTo(bot.holdPost.spot);
      if (d > 1.5) { walkRouteTo(bot, dt, bot.holdPost.spot, 3.6); return; }
      faceTowards(bot, bot.holdPost.aim, dt, 2.2);
      stepBody(body, new THREE.Vector3(), 0, dt, worldRef.colliders, 22, false);
    }
  }

  function walkRouteTo(bot, dt, goal, speed) {
    if (!bot.navPath || bot.navGoal !== goal || bot.navIdx >= bot.navPath.length) {
      bot.navPath = findPathTo(bot, goal).map(i => nodes[i]);
      bot.navGoal = goal;
      bot.navIdx = 0;
    }
    const target = bot.navPath[Math.min(bot.navIdx, bot.navPath.length - 1)];
    const dx = target.x - bot.body.position.x;
    const dz = target.z - bot.body.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 1.4 && bot.navIdx < bot.navPath.length - 1) { bot.navIdx++; return; }
    if (d < 1.2) { stepBody(bot.body, new THREE.Vector3(), 0, dt, worldRef.colliders, 22, false); return; }
    const wish = new THREE.Vector3(dx / d, 0, dz / d);
    faceTowards(bot, target, dt, 7);
    stepBody(bot.body, wish, speed, dt, worldRef.colliders, 22, false);
    // Footstep audio occasionally
    bot.stepT = (bot.stepT ?? 0) - dt;
    if (bot.stepT <= 0) { bot.stepT = 0.38; }
  }

  function faceTowards(bot, point, dt, speed) {
    const dx = point.x - bot.body.position.x;
    const dz = point.z - bot.body.position.z;
    const want = Math.atan2(-dx, -dz); // forward is (−sin yaw, −cos yaw)
    let diff = want - bot.body.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    bot.body.yaw += diff * Math.min(1, dt * speed);
  }

  return { bots, createBotBody: botBody, assignRound, step, allActors };
}
