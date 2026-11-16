// Input: pointer lock, keyboard state, and the hooks the HUD overlays need. One object the
// simulation reads; no DOM lookups after construction.
export function createInput(canvas) {
  const state = {
    forward: 0, strafe: 0,
    yawDelta: 0, pitchDelta: 0,
    fire: false, firePressed: false,
    reload: false, use: false, usePressed: false,
    walk: false, crouch: false, jump: false,
    buyOpen: false, buyToggle: false,
    weaponSelect: 0, // 0 none, 1..4 slot keys
    grenadeKey: false,
  };
  const keys = new Set();

  function onKey(code, down) {
    if (down) keys.add(code); else keys.delete(code);
    if (down) {
      if (code === 'KeyR') state.reload = true;
      if (code === 'KeyB' && !state.buyHeld) { state.buyToggle = true; state.buyOpen = !state.buyOpen; }
      if (code === 'KeyB') state.buyHeld = true;
      if (code === 'KeyE') state.usePressed = true;
      if (code === 'Digit1') state.weaponSelect = 1;
      if (code === 'Digit2') state.weaponSelect = 2;
      if (code === 'Digit3') state.weaponSelect = 3;
      if (code === 'Digit4') state.weaponSelect = 4;
      if (code === 'Digit5') state.weaponSelect = 5;
      if (code === 'KeyG') state.grenadeKey = true;
      if (code === 'Space') state.jump = true;
    }
  }

  document.addEventListener('keydown', (e) => {
    if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) e.preventDefault();
    onKey(e.code, true);
  });
  document.addEventListener('keyup', (e) => {
    onKey(e.code, false);
    if (e.code === 'KeyB') state.buyHeld = false;
  });
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement !== canvas) return;
    state.yawDelta -= e.movementX * 0.0022;
    state.pitchDelta -= e.movementY * 0.0022;
  });
  document.addEventListener('mousedown', (e) => {
    if (document.pointerLockElement !== canvas) return;
    if (e.button === 0) { state.fire = true; state.firePressed = true; }
  });
  document.addEventListener('mouseup', (e) => { if (e.button === 0) state.fire = false; });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== canvas) { keys.clear(); state.fire = false; state.buyHeld = false; }
  });

  state.sample = () => {
    state.use = keys.has('KeyE');
    state.forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    state.strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    state.walk = keys.has('ShiftLeft') || keys.has('ShiftRight');
    state.crouch = keys.has('ControlLeft') || keys.has('ControlRight');
    if (!keys.has('Space')) state.jump = false;
  };

  state.requestLock = () => canvas.requestPointerLock?.();
  state.locked = () => document.pointerLockElement === canvas;
  return state;
}
