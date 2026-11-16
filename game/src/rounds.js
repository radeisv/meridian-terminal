// The round state machine: freeze-and-buy, live, spike planted, over. Decides wins by
// elimination, the spike's burst, a defuse, or time expiring on the defenders' side.
import { loadoutFor, WEAPONS } from './weapon.js';

export const PHASE = { WARMUP: 'warmup', BUY: 'buy', LIVE: 'live', OVER: 'over' };
export const BUY_TIME = 12;
export const LIVE_TIME = 105;
export const OVER_TIME = 4;
export const WIN_SCORE = 8;

export function createRounds(actorsRef, bomb, economy, hooks) {
  const state = {
    phase: PHASE.WARMUP,
    clock: 0,
    score: { strike: 0, warden: 0 },
    round: 0,
    result: null, // { winner, reason }
    playerSide: 'strike',
    switchedSides: false,
  };

  function sideOf(actor) { return actor.team; }
  function aliveOf(side) {
    let n = 0;
    for (const a of actorsRef()) if (a.team === side && a.alive) n++;
    return n;
  }
  function someoneHasKit(side) {
    return side === 'warden' && economy.teams.warden.defuseKit;
  }

  function newRound(first) {
    state.round++;
    state.phase = first ? PHASE.WARMUP : PHASE.BUY;
    state.clock = first ? 3 : BUY_TIME;
    state.result = null;
    bomb.reset();
    economy.newRound('strike');
    economy.newRound('warden');
    hooks.respawn(first);
  }

  function end(winner, reason) {
    state.result = { winner, reason };
    state.phase = PHASE.OVER;
    state.clock = OVER_TIME;
    state.score[winner]++;
    economy.reward('round', winner, true, bomb.state.planted);
    const loser = winner === 'strike' ? 'warden' : 'strike';
    economy.reward('round', loser, false, bomb.state.planted);
    hooks.roundEnd(state.result);
  }

  function step(dt) {
    if (state.phase === PHASE.WARMUP || state.phase === PHASE.BUY) {
      state.clock -= dt;
      if (state.clock <= 0) {
        state.phase = PHASE.LIVE;
        state.clock = LIVE_TIME;
        hooks.live();
      }
      return;
    }
    if (state.phase === PHASE.OVER) {
      state.clock -= dt;
      if (state.clock <= 0) {
        if (state.score.strike >= WIN_SCORE || state.score.warden >= WIN_SCORE) {
          hooks.matchOver({ ...state.score });
          state.phase = PHASE.WARMUP; // scoreboard lingers; hooks freeze the sim
          state.clock = 9999;
        } else newRound(false);
      }
      return;
    }

    // LIVE: the bomb layer feeds outcomes back through bombResult.
    state.clock -= dt;
    if (bomb.state.planted) {
      // The round clock freezes once the spike is down; the spike's own timer rules.
      const defusing = hooks.bombDefusing();
      const outcome = bomb.step(dt, defusing);
      if (outcome === 'exploded') { end('strike', 'The spike burst'); return; }
      if (outcome === 'defused') { end('warden', 'Spike defused'); return; }
    } else if (state.clock <= 0) {
      end('warden', 'Time ran out');
      return;
    }
    const sA = aliveOf('strike');
    const wA = aliveOf('warden');
    if (sA === 0 && !bomb.state.planted) { end('warden', 'Strike squad down'); return; }
    if (wA === 0) {
      if (bomb.state.planted) return; // the spike can still burst
      end('strike', 'Warden squad down');
      return;
    }
    if (sA === 0 && wA === 0) { end('warden', 'Mutual elimination'); return; }
  }

  return {
    state, step, newRound, end,
    aliveOf, someoneHasKit,
    canBuy() { return state.phase === PHASE.WARMUP || state.phase === PHASE.BUY; },
  };
}
