// The story of SOLANO HEAT: five jobs for the fixer Mara Voss, from a
// stolen sedan to the big score. Each mission is a list of steps; the runner
// advances them from live game state (position, car, wanted level, rivals
// down) and reports what the HUD should say. Nothing here touches the DOM
// or three.js directly — main.js wires the runner to the world.
export const MISSIONS = [
  {
    id: 1,
    name: 'First Wheels',
    reward: 250,
    intro: 'Mara: "You need wheels before you need a reputation. Take any car on the street — nobody here locks theirs."',
    flavor: 'Mara nods at the sedan. "Not bad. You drive like you mean it."',
    steps: [
      { type: 'enterCar', label: 'Steal a car', sub: 'Walk up to any parked car and press E' },
      { type: 'goto', x: -330, z: 0, radius: 10, label: 'Drive to the pier', sub: 'Meet Mara at the end of the boardwalk' },
    ],
  },
  {
    id: 2,
    name: 'Beach Delivery',
    reward: 500,
    intro: 'Mara: "A package is waiting at the pier shack. The motel on the east side is expecting it. No questions, no stops."',
    flavor: '"Clean run. The motel crowd tips better than the banks do."',
    steps: [
      { type: 'goto', x: -352, z: 0, radius: 8, label: 'Pick up the package', sub: 'Press E at the pier shack' , needInteract: true },
      { type: 'goto', x: 270, z: 240, radius: 10, label: 'Deliver to the Palms Motel', sub: 'East side, pink neon, you cannot miss it' },
    ],
  },
  {
    id: 3,
    name: 'Rival Turf',
    reward: 900,
    intro: 'Mara: "The Vipers think the north blocks are theirs. Go remind them. Three of their runners, on the ground — then come home."',
    flavor: '"Three down, none of ours scratched. The north blocks are ours now."',
    wantedOnStart: 2,
    steps: [
      { type: 'goto', x: 120, z: -180, radius: 12, label: 'Reach Viper turf', sub: 'North blocks, past the second avenue' },
      { type: 'knockdown', count: 3, label: 'Drop 3 Viper runners', sub: 'Shoot them or run them down — your call' },
      { type: 'goto', x: -330, z: 0, radius: 10, label: 'Get back to the pier', sub: 'Mara is waiting' },
    ],
  },
  {
    id: 4,
    name: 'Getaway',
    reward: 1500,
    intro: 'Mara: "The job went loud. Three stars and counting. North gate, ninety seconds — and Dario, do not stop for anything."',
    flavor: '"Ninety seconds and not a scratch on the paint. I knew I hired the right wheelman."',
    wantedOnStart: 3,
    steps: [
      { type: 'timed', x: 0, z: -290, radius: 12, seconds: 90, label: 'Reach the north gate', sub: '90 seconds — the heat is right behind you' },
    ],
  },
  {
    id: 5,
    name: 'The Big Score',
    reward: 2500,
    intro: 'Mara: "The Solano Trust vault. One bag, one boat, one clean exit. Every cruiser in the city will be looking for you — make them look somewhere else."',
    flavor: '"Two and a half grand, and the whole city still thinks it was a drill. We are legends, Dario."',
    wantedOnStart: 4,
    steps: [
      { type: 'goto', x: 180, z: 60, radius: 8, label: 'Hit the Solano Trust', sub: 'Press E at the bank doors to grab the bag', needInteract: true },
      { type: 'goto', x: -330, z: 0, radius: 10, label: 'Escape to the pier boat', sub: 'Four stars. Do not stop. Do not look back.' },
    ],
  },
];

export class MissionRunner {
  constructor(save, hooks) {
    this.save = save;
    this.hooks = hooks; // { toast(msg), setWanted(n), onMissionComplete(mission), onMissionFailed(reason) }
    this.missionIndex = this.nextUncompleted();
    this.stepIndex = 0;
    this.active = false;
    this.stepTimer = 0;
    this.rivalsDown = 0;
    this.completedCount = save.completedMissions.length;
  }

  nextUncompleted() {
    for (let i = 0; i < MISSIONS.length; i++) {
      if (!this.save.completedMissions.includes(MISSIONS[i].id)) return i;
    }
    return -1; // story done — free roam
  }

  currentMission() {
    return this.missionIndex < 0 ? null : MISSIONS[this.missionIndex];
  }

  currentStep() {
    const m = this.currentMission();
    if (!m || !this.active) return null;
    return m.steps[this.stepIndex] ?? null;
  }

  startMission() {
    const m = this.currentMission();
    if (!m) return false;
    this.active = true;
    this.stepIndex = 0;
    this.stepTimer = 0;
    this.rivalsDown = 0;
    if (m.wantedOnStart) this.hooks.setWanted(m.wantedOnStart);
    this.hooks.toast(`${m.name} — ${m.intro}`);
    return true;
  }

  // ctx: { x, z, inCar, speed, interactPressed, rivalsDown, wanted }
  update(dt, ctx) {
    if (!this.active) return;
    const step = this.currentStep();
    if (!step) return;
    if (step.type === 'timed') {
      this.stepTimer += dt;
      if (this.stepTimer > step.seconds) {
        this.fail('Out of time — the gate closed and the heat boxed you in.');
        return;
      }
    }
    let done = false;
    if (step.type === 'enterCar') done = ctx.inCar;
    else if (step.type === 'goto' || step.type === 'timed') {
      const d = Math.hypot(ctx.x - step.x, ctx.z - step.z);
      if (d <= step.radius) {
        if (step.needInteract) done = ctx.interactPressed;
        else done = true;
      }
    } else if (step.type === 'knockdown') {
      done = ctx.rivalsDown >= step.count;
    }
    if (done) this.advanceStep();
  }

  advanceStep() {
    const m = this.currentMission();
    this.stepIndex++;
    this.stepTimer = 0;
    if (this.stepIndex >= m.steps.length) this.completeMission(m);
    else this.hooks.toast(this.currentStep().label);
  }

  completeMission(m) {
    this.active = false;
    this.save.cash += m.reward;
    this.save.totalEarned += m.reward;
    if (!this.save.completedMissions.includes(m.id)) this.save.completedMissions.push(m.id);
    this.completedCount = this.save.completedMissions.length;
    this.missionIndex = this.nextUncompleted();
    this.hooks.onMissionComplete(m);
  }

  fail(reason) {
    this.active = false;
    this.hooks.onMissionFailed(reason);
  }

  // What the HUD objective box shows right now.
  objectiveText() {
    const m = this.currentMission();
    if (!m) return { title: 'FREE ROAM', text: 'Story complete — Port Solano is yours.', sub: 'Cruise, steal, cause chaos. Your legend is already written.' };
    if (!this.active) {
      return { title: `JOB ${m.id} — ${m.name.toUpperCase()}`, text: 'Press ENTER to start the job', sub: `Reward $${m.reward} · Talk to Mara at the pier` };
    }
    const step = this.currentStep();
    let sub = step.sub || '';
    if (step.type === 'timed') sub += ` · ${Math.max(0, Math.ceil(step.seconds - this.stepTimer))}s left`;
    if (step.type === 'knockdown') sub += ` · ${this.rivalsDown}/${step.count} down`;
    return { title: `JOB ${m.id} — ${m.name.toUpperCase()}`, text: step.label, sub };
  }

  // Where the world beacon and minimap marker should point, or null.
  objectiveTarget() {
    const step = this.currentStep();
    if (!step || step.x === undefined) return null;
    return { x: step.x, z: step.z };
  }
}
