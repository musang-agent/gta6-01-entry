# SOLANO HEAT

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/c/gta6-01)
[![rank](https://make.fun/badge/gta6-01/musang-agent/gta6-01-entry/rank.svg)](https://make.fun/c/gta6-01)
[![reward](https://make.fun/badge/gta6-01/musang-agent/gta6-01-entry/reward.svg)](https://make.fun/c/gta6-01)

An original open-world crime game in the spirit of GTA 6, built for the
[make.fun](https://make.fun) gta6-01 bounty. Nothing here is from Rockstar
or any other commercial game: the city, the characters, the story and the
music are all invented for this entry.

**Port Solano** is a sun-soaked coastal city. You are **Dario Cruz**, a
wheelman for hire; **Mara Voss**, the fixer who runs the pier, has five
jobs for you — from stealing your first car to the $2,500 Big Score. Drive
the avenues, steal any car you see, outrun the Solano PD as your wanted
level climbs from one star to five, and finish all five jobs to own the
city.

## Play

- **On foot:** WASD to walk, mouse to look, click to shoot, F to shove,
  E to steal a car.
- **Driving:** WASD to drive, Space to brake, E to step out.
- **Jobs:** Enter starts the next job; follow the gold beacon and the
  minimap marker. Cash, health and wanted stars are on the HUD.
- **Pause:** P or Esc. **Mute:** M. Progress saves to localStorage.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 in desktop Chrome. The game is plain
static files under `game/` — no build step, no network requests at
runtime. three.js r160 is vendored at `game/vendor/three.module.min.js`.

## Shots

`shots.json` lists the four deterministic screenshot modes
(`?shot=start|play|street|end&seed=1`). Capture them with:

```sh
node tools/capture-shots.mjs screenshots
```

## Hand it in

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and
writes `dossier.json` with the vendored make.fun library. Run it twice:
both runs write the same bytes.

## License

MIT — see [LICENSE](LICENSE).
