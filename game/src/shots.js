// Deterministic screenshot staging for SOLANO HEAT.
//
// ?shot=start  — title screen over the city at a fixed camera pose
// ?shot=play   — the chase: Dario driving east on 3rd Avenue, wanted 3,
//                three cruisers staged head-on ahead of him, traffic around
// ?shot=street — on foot at the pier, mission marker in view, pedestrians
// ?shot=end    — the mission-complete screen for The Big Score
// ?seed=N      — world seed (default 1)
//
// Every staged frame comes from a fixed seed plus a fixed number of fixed
// 1/60s simulation steps, then the game freezes: the same URL always
// renders the same pixels, so two capture runs are byte-identical. Police
// are placed head-on AFTER the simulation steps, because a chasing cruiser
// always ends up behind the player and out of frame.
export function initShots(game) {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('shot');
  if (!mode) return false;
  const seed = Number(params.get('seed') || 1) || 1;
  game.shotSeed = seed;
  game.shotMode = mode;

  // The boot sequence calls this once the world exists.
  game.stageShot = () => {
    if (mode === 'start') stageStart(game);
    else if (mode === 'play') stageChase(game);
    else if (mode === 'street') stageStreet(game);
    else if (mode === 'end') stageEnd(game);
    else stageChase(game);
    game.hud.hideToast();
    game.freezeShot();
    window.__shotReady = true;
  };
  return true;
}

function driveForward(game, steps) {
  for (let i = 0; i < steps; i++) {
    game.simulate(1 / 60, { forward: true, back: false, left: false, right: false, brake: false });
  }
}

function walkForward(game, steps) {
  for (let i = 0; i < steps; i++) {
    game.simulate(1 / 60, { forward: true, back: false, left: false, right: false, brake: false });
  }
}

function stageStart(game) {
  game.setState('title');
  game.clockT = 12; // late-afternoon light, fixed
  game.placeOnFoot(0, 120, Math.PI);
  // A high cinematic view down the main avenue toward the beach sunset.
  game.player.setCameraPose(game.camera, 60, 42, 190, -40, 6, -60);
  game.hud.hide();
}

function stageChase(game) {
  game.setState('playing');
  game.hud.show();
  // Mission 3, step 1: drive to Viper turf at (120, -180).
  game.missions.missionIndex = 2;
  game.missions.startMission();
  game.setWanted(3);
  // Dario in a red sportscar, eastbound in the eastbound lane of the avenue
  // at z = -180 (lane centre -176). Start well west of the turf marker so
  // the 4s drive does not already complete step 1 (the gold beacon must
  // still be visible ahead), and clear the road ahead so the chase is not
  // stuck behind traffic.
  game.startDrivingAt(-40, -176, Math.PI / 2, 0xd21f1f);
  // Clear the avenue itself: cars on it travel along X, so axis 'x'.
  game.traffic.clearStretch('x', -180, -60, 260);
  game.traffic.allowTurns = false; // no car turns onto the avenue mid-chase
  game.traffic.respawnPaused = true; // no wrap-around respawn lands on the avenue either
  // Four seconds of driving: traffic flows, the wanted stars burn.
  driveForward(game, 240);
  // Now stage three cruisers head-on, close ahead of the player, sirens
  // flashing — near enough to loom in the frame.
  const p = game.playerCar;
  const fx = Math.sin(p.heading);
  const fz = Math.cos(p.heading);
  game.police.setWanted(3);
  game.police.cruisers.forEach((c, i) => {
    const ahead = 22 + i * 8;
    const lateral = (i - 1) * 5;
    c.x = p.x + fx * ahead - fz * lateral;
    c.z = p.z + fz * ahead + fx * lateral;
    c.heading = p.heading + Math.PI; // facing the player, head-on
    c.speed = 0;
    c.mode = 'chase';
    c.group.position.set(c.x, 0, c.z);
    c.group.rotation.y = c.heading;
  });
  // Camera: a tight chase view behind the car, the cruisers dead ahead.
  game.player.cameraYaw = p.heading;
  game.player.mouseYaw = 0;
  game.player.updateCamera(game.camera, 1, game.clockT, { x: p.x, z: p.z, heading: p.heading, speed: p.speed }, true);
  game.player.setCameraPose(
    game.camera,
    p.x - fx * 9.5, 4.2, p.z - fz * 9.5,
    p.x + fx * 45, 1.6, p.z + fz * 45,
  );
}

function stageStreet(game) {
  game.setState('playing');
  game.hud.show();
  game.missions.missionIndex = 1;
  game.missions.startMission();
  game.setWanted(0);
  // On foot at the downtown crossing, looking north-west toward the pier:
  // the gold mission beacon, pedestrians and traffic in frame.
  game.placeOnFoot(0, 120, Math.atan2(-352, -120));
  walkForward(game, 120);
  // Stage three pedestrians ahead of Dario so the street reads as lived-in.
  const px = game.player.x;
  const pz = game.player.z;
  const fx = Math.sin(game.player.heading);
  const fz = Math.cos(game.player.heading);
  game.pedestrians.list.slice(0, 3).forEach((ped, i) => {
    const ahead = 8 + i * 4;
    const lateral = (i - 1) * 2.5;
    ped.x = px + fx * ahead - fz * lateral;
    ped.z = pz + fz * ahead + fx * lateral;
    ped.heading = game.player.heading + Math.PI;
    ped.group.position.set(ped.x, 0, ped.z);
    ped.group.rotation.y = ped.heading;
  });
  game.hud.setCrosshair(true);
  game.player.cameraYaw = game.player.heading;
  game.player.updateCamera(game.camera, 1, game.clockT, { x: game.player.x, z: game.player.z, heading: game.player.heading, speed: 0 }, false);
}

function stageEnd(game) {
  game.setState('playing');
  game.hud.show();
  game.missions.missionIndex = 4;
  game.missions.startMission();
  game.setWanted(4);
  game.startDrivingAt(-280, 0, Math.PI / 2, 0xffd23c);
  driveForward(game, 120);
  // The Big Score, complete: the overlay carries the story.
  const mission = game.missions.currentMission();
  game.missions.save.cash += mission.reward;
  game.missions.save.totalEarned += mission.reward;
  if (!game.missions.save.completedMissions.includes(mission.id)) {
    game.missions.save.completedMissions.push(mission.id);
  }
  game.showMissionCompleteScreen(mission);
  game.player.setCameraPose(
    game.camera,
    game.playerCar.x - 14, 5, game.playerCar.z + 10,
    game.playerCar.x, 1.5, game.playerCar.z,
  );
}
