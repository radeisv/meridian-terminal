// HUD: health and armour, ammo, money, score and clock, kill feed, hit markers, the buy menu
// panel, spike status and a minimap canvas. DOM only; the minimap draws from the world's
// colliders once and repaints dots each frame.
import { MAP_BOUNDS } from './world.js';

export function createHud(world) {
  const el = {
    health: id('hud-health'), armor: id('hud-armor'),
    mag: id('hud-mag'), reserve: id('hud-reserve'), ammo: id('hud-ammo'),
    money: id('hud-money'), clock: id('hud-clock'),
    score: id('hud-score'), weapon: id('hud-weapon'),
    feed: id('hud-feed'), hint: id('hint'),
    phase: id('hud-phase'), bombbar: id('hud-bombbar'), bombfill: id('hud-bombfill'),
    buy: id('hud-buy'), overlay: id('overlay'), overlayTitle: id('overlay-title'),
    overlayCopy: id('overlay-copy'), play: id('play'), scoreboard: id('hud-scoreboard'),
    minimap: id('hud-minimap'),
  };
  const mapCtx = el.minimap.getContext('2d');

  const feedLines = [];

  function drawStaticMap() {
    const W = el.minimap.width;
    const s = W / (MAP_BOUNDS.maxX - MAP_BOUNDS.minX);
    const toX = (x) => (x - MAP_BOUNDS.minX) * s;
    const toY = (z) => (z - MAP_BOUNDS.minZ) * s;
    mapCtx.clearRect(0, 0, W, W);
    mapCtx.fillStyle = 'rgba(20,23,28,0.82)';
    mapCtx.fillRect(0, 0, W, W);
    mapCtx.fillStyle = 'rgba(240,168,48,0.28)';
    for (const box of world.colliders) {
      mapCtx.fillStyle = 'rgba(200,205,210,0.34)';
      mapCtx.fillRect(toX(box.min.x), toY(box.min.z), (box.max.x - box.min.x) * s, (box.max.z - box.min.z) * s);
    }
    mapCtx.font = 'bold 13px monospace';
    mapCtx.fillStyle = '#f0a830';
    mapCtx.fillText('A', toX(-20) - 4, toY(-20) + 5);
    mapCtx.fillText('B', toX(20) - 4, toY(-20) + 5);
    el.mapTo = { toX, toY, s };
  }

  function dots(actors, playerSide, bomb) {
    drawStaticMap();
    if (!el.mapTo) return;
    const { toX, toY, s } = el.mapTo;
    for (const a of actors) {
      if (!a.alive) continue;
      const friendly = a.team === playerSide;
      if (!friendly && !a.isPlayer && !a.wasSeenRecently?.()) continue; // enemies appear only when seen
      mapCtx.fillStyle = a.isPlayer ? '#ffffff' : (a.team === 'strike' ? '#c25a3a' : '#3a8a94');
      mapCtx.beginPath();
      mapCtx.arc(toX(a.position.x), toY(a.position.z), a.isPlayer ? 3.4 : 2.6, 0, Math.PI * 2);
      mapCtx.fill();
    }
    if (bomb.state.planted) {
      mapCtx.fillStyle = '#d84a35';
      mapCtx.fillRect(toX(bomb.state.position.x) - 3, toY(bomb.state.position.z) - 3, 6, 6);
    }
  }

  function feed(text) {
    feedLines.unshift(text);
    if (feedLines.length > 5) feedLines.pop();
    el.feed.innerHTML = feedLines.map((t) => `<div>${t}</div>`).join('');
  }

  let markerT = 0;
  function hitmarker() {
    const m = document.getElementById('hitmarker');
    m.classList.add('on');
    clearTimeout(markerT);
    markerT = setTimeout(() => m.classList.remove('on'), 120);
  }

  function scoreboard(title, reason, final) {
    const s = document.getElementById('hud-scoreboard');
    document.getElementById('sb-title').textContent = title;
    document.getElementById('sb-reason').textContent = reason;
    document.getElementById('sb-score').textContent = final;
    s.hidden = false;
  }

  function id(name) { return document.getElementById(name); }

  drawStaticMap();
  return { el, feed, dots, id, hitmarker, scoreboard };
}
