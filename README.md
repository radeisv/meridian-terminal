# meridian-terminal

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/radeisv/meridian-terminal/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/radeisv/meridian-terminal/reward.svg)](https://make.fun/bounty/threejs-fps-02/?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

Meridian Terminal is an original single-player tactical FPS built with three.js. Fight alongside bots in five-a-side rounds, buy weapons and grenades, and plant or defend the spike across a dusk freight dock.

## Run it

```
node serve.ts
# Open http://localhost:8080 in desktop Chrome (Node.js 22.18+ required).
```

Loads straight in desktop Chrome using `node serve.ts`, with no build step or external assets. The submission entrypoint `node main.ts` writes the game, screenshots and dossier to `MAKEFUN_OUTPUT_DIR` (default `/output`).

## The game

*Meridian Terminal* is a round-based five-a-side tactical shooter in the Counter-Strike style, played between two squads, Strike and Warden, on a dusk freight dock:

- Two bomb sites (A and B), one spike that Strike carries, plants and defends and Warden defuses
- An economy: kill rewards, win and loss bonuses, a planting bonus, and a buy menu (rifle, marksman SMG, sniper, vest, frag grenade)
- Gunplay where stopping to aim pays: recoil bloom, spread that grows on the move, armour halving damage, a headshot multiplier heavier than most
- Nine squadmate bots that walk lane routes on a waypoint graph, hold posts, react to what they see, plant, defend and defuse
- Three original lanes, a mid kiosk, two crane-yards, and a HUD with a live minimap, all with synthesized audio and zero assets

## Files

- `main.ts` — the Node 22 entrypoint the scorer runs: copies `game/` and `screenshots/` and writes the dossier
- `game/` — the whole game: ES modules, the vendored three.js 0.187.0, an import map, no build step
- `screenshots/` — three captures taken of the game itself while it ran
- `serve.ts` — a dev-only static server (`node serve.ts`) with the local screenshot-capture endpoint
- `vendor/makefun-threejs.ts` — make.fun's dossier library, unchanged

## Credits

Built with [three.js](https://threejs.org) v0.187.0 (vendored, MIT). Everything else — map, bots, economy, art, sound — written for this entry.

<sub>Play or share bounties at make.fun — referred by [https://make.fun/r/f62prjm7](https://make.fun/r/f62prjm7).</sub>
