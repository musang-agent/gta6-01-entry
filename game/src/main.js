// SOLANO HEAT — boot, game loop and wiring. This file owns the game state
// machine (title / playing / paused / mission-complete / game-over / story),
// the fixed-step simulation, input, the wanted level, stealing cars,
// shooting, the mission beacon, and the save. The world itself lives in
// city.js, vehicles.js, police.js, pedestrians.js, combat.js, player.js,
// missions.js, hud.js and audio.js — one job per file.
//
// The simulation runs on a fixed 1/60s step driven by the game clock
// (clockT). Nothing in the game reads performance.now() or Date.now() for
// state — only the outer loop uses wall time to decide how many fixed
// steps to run. That is what makes ?shot= screenshots byte-identical.
import * as THREE from 'three';
import { makeRng } from './rng.js';
import { createCity } from './city.js';
import { PlayerCar, Traffic, createCarMesh } from './vehicles.js';
import { Police } from './police.js';
import { Pedestrians } from './pedestrians.js';
import { Combat } from './combat.js';
import { Player } from './player.js';
import { MissionRunner } from './missions.js';
import { Hud } from './hud.js';
import { SoundBank } from './audio.js';
import { loadSave, storeSave } from './save.js';
import { initShots } from './shots.js';

const STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const seedParam = Number(params.get('seed') || 0);
const seed = seedParam > 0 ? seedParam : (Math.random() * 1e9) | 0;
const isShotMode = params.has('shot');

class Game {
  constructor() {
    this.clockT = 0;
    this.state = 'title';
    this.shotFrozen = false;
    this.save = loadSave();
    this.health = 100;
    this.wanted = 0;
    this.inCar = false;
    this.playerCar = null;
    this.parkedCars = [];
    this.rivals = [];
    this.rivalsDown = 0;
    this.bustedT = 0;
    this.quietT = 0;
    this.crimeT = 0;
    this.playSeconds = 0;
    this.saveT = 0;
    this.musicStep = 0;
    this.musicT = 0;
    this.lastGunshot = null;
    this.interactEdge = false;
    this.keys = new Set();
    this.shotSeed = seed;

    // Renderer: preserveDrawingBuffer so screenshots capture the WebGL
    // canvas; pixel ratio 1 keeps the frame deterministic and fast.
    this.renderer = new THREE.WebGLRenderer({
      canvas: document.getElementById('scene'),
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
    this.camera.position.set(60, 42, 190);

    const rng = makeRng(seed);
    this.city = createCity(this.scene, rng);
    this.traffic = new Traffic(this.scene, this.city, rng, 14);
    this.police = new Police(this.scene, this.city, rng);
    this.pedestrians = new Pedestrians(this.scene, this.city, rng, 26);
    this.player = new Player(this.scene, this.city);
    this.combat = new Combat(this.scene, this.camera);
    this.hud = new Hud();
    this.sound = new SoundBank();
    this.missions = new MissionRunner(this.save, {
      toast: (m) => this.hud.toast(m),
      setWanted: (n) => this.setWanted(n),
      onMissionComplete: (m) => this.onMissionComplete(m),
      onMissionFailed: (reason) => this.onMissionFailed(reason),
    });

    this._buildBeacon();
    this._bindDom();
    this._bindInput();
    this.player.reset(this.city.playerSpawn.x, this.city.playerSpawn.z, this.city.playerSpawn.heading);
    this._showTitle();
    window.__game = this;

    // Shot staging runs once the world exists, then freezes the frame.
    this.isShot = initShots(this);
    if (this.isShot) this.stageShot();
    this._loop();
  }

  // ---------------------------------------------------------- construction

  _buildBeacon() {
    this.beacon = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 46, 12, 1, true), mat);
    beam.position.y = 23;
    this.beacon.add(beam);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3.2, 24),
      new THREE.MeshBasicMaterial({ color: 0xffd23c, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    this.beacon.add(ring);
    this.beacon.visible = false;
    this.scene.add(this.beacon);
  }

  _bindDom() {
    const $ = (id) => document.getElementById(id);
    $('btn-start').addEventListener('click', () => this.startGame(false));
    $('btn-continue').addEventListener('click', () => this.startGame(true));
    $('btn-resume').addEventListener('click', () => this.setState('playing'));
    $('btn-restart').addEventListener('click', () => this.restartDay());
    $('btn-quit-title').addEventListener('click', () => this._showTitle());
    $('btn-next-mission').addEventListener('click', () => this.nextMission());
    $('btn-retry').addEventListener('click', () => this.retryAfterGameOver());
    $('btn-title2').addEventListener('click', () => this._showTitle());
    $('btn-free-roam').addEventListener('click', () => this.setState('playing'));
    $('btn-title3').addEventListener('click', () => this._showTitle());
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  _bindInput() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
      if (this.state !== 'playing') return;
      if (e.code === 'KeyE') {
        this.interactEdge = true;
        this.tryEnterCar();
      }
      if (e.code === 'KeyF') this.shove();
      if (e.code === 'Enter') this.tryStartMission();
      if (e.code === 'KeyP' || e.code === 'Escape') this.setState('paused');
      if (e.code === 'KeyM') {
        this.sound.setMuted(!this.sound.muted);
        this.hud.toast(this.sound.muted ? 'Sound muted' : 'Sound on');
      }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    const canvas = document.getElementById('scene');
    canvas.addEventListener('mousedown', (e) => {
      if (this.state !== 'playing' || this.inCar || isShotMode) return;
      if (e.button === 0) this.shoot();
      if (!isShotMode && document.pointerLockElement !== canvas) {
        canvas.requestPointerLock?.();
      }
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas && this.state === 'playing' && !this.inCar) {
        this.player.addMouseLook(e.movementX || 0);
      }
    });
  }

  // ---------------------------------------------------------- state machine

  setState(next) {
    this.state = next;
    const $ = (id) => document.getElementById(id);
    $('title-screen').classList.toggle('hidden', next !== 'title');
    $('pause-screen').classList.toggle('hidden', next !== 'paused');
    $('mission-screen').classList.toggle('hidden', next !== 'mission');
    $('gameover-screen').classList.toggle('hidden', next !== 'gameover');
    $('story-screen').classList.toggle('hidden', next !== 'story');
    if (next === 'playing') {
      this.hud.show();
      this.sound.init();
    } else if (next === 'title' || next === 'gameover' || next === 'story') {
      this.hud.hide();
    }
    if (next === 'paused') {
      const s = this.save;
      $('pause-stats').textContent =
        `Cash $${s.cash.toLocaleString('en-US')} · Day ${s.day}\nJobs done ${s.completedMissions.length} / 5 · Cars stolen ${s.carsStolen}\nBest wanted level ${'★'.repeat(Math.max(0, s.bestWanted)) || '—'}`;
    }
    if (next === 'title') this._showTitle();
  }

  _showTitle() {
    this.state = 'title';
    document.getElementById('title-screen').classList.remove('hidden');
    document.getElementById('pause-screen').classList.add('hidden');
    document.getElementById('mission-screen').classList.add('hidden');
    document.getElementById('gameover-screen').classList.add('hidden');
    document.getElementById('story-screen').classList.add('hidden');
    this.hud.hide();
    const hasSave = this.save.completedMissions.length > 0 || this.save.cash > 0;
    document.getElementById('btn-continue').classList.toggle('hidden', !hasSave);
    if (hasSave) document.getElementById('continue-day').textContent = String(this.save.day);
    this.police.clearAll();
    this.wanted = 0;
    this.hud.setWanted(0);
    this.player.reset(this.city.playerSpawn.x, this.city.playerSpawn.z, this.city.playerSpawn.heading);
    if (this.playerCar) {
      this.playerCar.dispose();
      this.playerCar = null;
    }
    this.inCar = false;
    this.player.showAvatar();
  }

  startGame(continued) {
    this.sound.init();
    this.setState('playing');
    this.health = 100;
    if (!continued) {
      this.player.reset(this.city.playerSpawn.x, this.city.playerSpawn.z, this.city.playerSpawn.heading);
    }
    if (!this.missions.active && this.missions.currentMission()) {
      this.missions.startMission();
    }
    this.hud.toast(continued ? `Day ${this.save.day} — back on the streets.` : 'Welcome to Port Solano, Dario.');
  }

  restartDay() {
    this.health = 100;
    this.setWanted(0);
    this.police.clearAll();
    this.player.reset(this.city.playerSpawn.x, this.city.playerSpawn.z, this.city.playerSpawn.heading);
    if (this.playerCar) {
      this.playerCar.dispose();
      this.playerCar = null;
    }
    this.inCar = false;
    this.player.showAvatar();
    this.setState('playing');
  }

  retryAfterGameOver() {
    this.health = 100;
    this.setWanted(0);
    this.police.clearAll();
    this.restartDay();
  }

  nextMission() {
    document.getElementById('mission-screen').classList.add('hidden');
    this.setState('playing');
    if (this.missions.currentMission()) this.missions.startMission();
  }

  // The mission-complete overlay; also used by the ?shot=end staging.
  showMissionCompleteScreen(m) {
    const $ = (id) => document.getElementById(id);
    $('mission-name').textContent = m.name;
    $('mission-flavor').textContent = m.flavor;
    $('mission-reward').textContent = `$${m.reward.toLocaleString('en-US')}`;
    $('mission-stats').textContent =
      `Cash $${this.save.cash.toLocaleString('en-US')} · Jobs done ${this.save.completedMissions.length} / 5`;
    this.setState('mission');
  }

  onMissionComplete(m) {
    this.sound.missionComplete();
    storeSave(this.save);
    if (this.missions.currentMission() === null) {
      const $ = (id) => document.getElementById(id);
      $('story-stats').textContent =
        `Total earned $${this.save.totalEarned.toLocaleString('en-US')}\nCars stolen ${this.save.carsStolen} · Best wanted ${'★'.repeat(Math.max(0, this.save.bestWanted)) || '—'}`;
      this.setState('story');
      return;
    }
    this.showMissionCompleteScreen(m);
  }

  onMissionFailed(reason) {
    this.hud.toast(reason, 6000);
    this.sound.busted();
  }

  gameOver(kind) {
    this.sound.busted();
    storeSave(this.save);
    const $ = (id) => document.getElementById(id);
    $('gameover-kicker').textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
    $('gameover-title').textContent = kind === 'busted' ? 'The heat caught up.' : 'Solano claimed another one.';
    $('gameover-sub').textContent =
      kind === 'busted'
        ? 'The Solano PD impounded your ride and your pride.'
        : 'You woke up in the county hospital, wallet lighter.';
    $('gameover-stats').textContent =
      `Cash $${this.save.cash.toLocaleString('en-US')} · Jobs done ${this.save.completedMissions.length} / 5`;
    this.setState('gameover');
  }

  // ---------------------------------------------------------- wanted / health

  setWanted(n) {
    this.wanted = Math.max(0, Math.min(5, n));
    this.police.setWanted(this.wanted);
    this.hud.setWanted(this.wanted);
    if (this.wanted > this.save.bestWanted) this.save.bestWanted = this.wanted;
    this.crimeT = 5;
  }

  addWanted(n, cap) {
    this.setWanted(Math.min(cap, this.wanted + n));
  }

  damage(amount) {
    this.health = Math.max(0, this.health - amount);
    this.hud.setHealth(this.health);
    if (this.health <= 0) this.gameOver('wasted');
  }

  // ---------------------------------------------------------- cars

  startDrivingAt(x, z, heading, color) {
    if (this.playerCar) this.playerCar.dispose();
    this.playerCar = new PlayerCar(this.scene, this.city, color);
    this.playerCar.reset(x, z, heading);
    this.inCar = true;
    this.player.hideAvatar();
    this.player.x = x;
    this.player.z = z;
    this.player.heading = heading;
  }

  placeOnFoot(x, z, heading) {
    if (this.playerCar) {
      this.playerCar.dispose();
      this.playerCar = null;
    }
    this.inCar = false;
    this.player.showAvatar();
    this.player.reset(x, z, heading);
  }

  tryEnterCar() {
    if (this.inCar) {
      // Step out: the car stays parked where it is, stealable again later.
      const pc = this.playerCar;
      this.parkedCars.push({ group: pc.group, x: pc.x, z: pc.z, heading: pc.heading, color: pc.color, kind: 'sport', radius: 2.3, parked: true });
      this.playerCar = null;
      this.inCar = false;
      const side = this.player.heading + Math.PI / 2;
      const px = pc.x + Math.sin(side) * 3;
      const pz = pc.z + Math.cos(side) * 3;
      this.player.showAvatar();
      this.player.reset(px, pz, pc.heading);
      this.sound.doorSlam();
      return;
    }
    const fromTraffic = this.traffic.nearest(this.player.x, this.player.z, 5);
    let parked = null;
    let parkedD = 5;
    for (const c of this.parkedCars) {
      const d = Math.hypot(c.x - this.player.x, c.z - this.player.z);
      if (d < parkedD) {
        parkedD = d;
        parked = c;
      }
    }
    const target = fromTraffic || parked;
    if (!target) {
      this.hud.toast('No car in reach — get closer.');
      return;
    }
    if (fromTraffic) this.traffic.removeCar(fromTraffic);
    else {
      this.parkedCars.splice(this.parkedCars.indexOf(parked), 1);
      this.scene.remove(target.group); // the parked mesh leaves with its car
    }
    // Keep the stolen car's look: swap the sport mesh for its own kind.
    this.playerCar = new PlayerCar(this.scene, this.city, target.color);
    this.scene.remove(this.playerCar.group);
    this.playerCar.group = createCarMesh(target.kind, target.color);
    this.scene.add(this.playerCar.group);
    this.playerCar.reset(target.x, target.z, target.heading);
    this.inCar = true;
    this.player.hideAvatar();
    this.player.x = target.x;
    this.player.z = target.z;
    this.player.heading = target.heading;
    this.save.carsStolen++;
    this.sound.doorSlam();
    const witnessed = this.pedestrians.nearest(target.x, target.z, 25) || this.police.cruisers.length > 0;
    if (witnessed) {
      this.addWanted(1, 2);
      this.hud.toast('Car stolen — someone saw you!');
    } else {
      this.hud.toast('Car stolen. Nice and quiet.');
    }
  }

  tryStartMission() {
    if (!this.missions.active && this.missions.currentMission()) {
      this.missions.startMission();
    }
  }

  // ---------------------------------------------------------- combat

  shoot() {
    if (!this.combat.ready) return;
    const origin = this.camera.position.clone();
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const report = this.combat.shoot(origin, dir, {
      pedestrians: this.pedestrians,
      trafficCars: this.traffic.cars,
      cruisers: this.police.cruisers,
    });
    this.sound.gunshot();
    this.lastGunshot = { x: this.player.x, z: this.player.z, radius: 18 };
    if (!report || !report.hit) return;
    if (report.hit === 'ped') {
      const p = report.ref;
      const wasRival = !!p.isRival;
      this.pedestrians.knockDown(p);
      if (wasRival) {
        this.rivalsDown++;
        this.hud.toast(`Viper down — ${this.rivalsDown} of 3.`);
      } else {
        this.addWanted(1, 3);
        this.hud.toast('You shot a civilian! The heat is coming.');
      }
    } else if (report.hit === 'car') {
      report.ref.speed *= 0.4;
      this.addWanted(1, 3);
    } else if (report.hit === 'cruiser') {
      this.setWanted(Math.min(5, this.wanted + 2));
      this.hud.toast('You shot a cop! Every cruiser in the city is coming.');
    }
  }

  shove() {
    if (this.inCar || !this.combat.ready) return;
    if (this.combat.shove({ x: this.player.x, z: this.player.z }, this.player.heading, this.pedestrians)) {
      this.hud.toast('Shoved them down. Quiet.');
    }
  }

  markRivals() {
    const cx = 120;
    const cz = -180;
    const near = this.pedestrians.list
      .filter((p) => p.state !== 'down')
      .map((p) => ({ p, d: Math.hypot(p.x - cx, p.z - cz) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 3);
    this.rivals = near.map((n) => n.p);
    for (const p of this.rivals) {
      p.isRival = true;
      p.group.traverse((m) => {
        if (m.isMesh && m.userData.isShirt && m.material && m.material.color) m.material.color.set(0xaa1111);
      });
    }
    this.rivalsDown = 0;
  }

  // ---------------------------------------------------------- simulation

  _input() {
    const k = this.keys;
    return {
      forward: k.has('KeyW') || k.has('ArrowUp'),
      back: k.has('KeyS') || k.has('ArrowDown'),
      left: k.has('KeyA') || k.has('ArrowLeft'),
      right: k.has('KeyD') || k.has('ArrowRight'),
      brake: k.has('Space'),
    };
  }

  simulate(dt, input) {
    this.clockT += dt;
    this.city.update(dt, this.clockT);
    if (this.state === 'title') {
      // Slow cinematic orbit over the city while the title is up.
      const a = this.clockT * 0.045;
      this.player.setCameraPose(this.camera, Math.sin(a) * 200, 58, Math.cos(a) * 200, 0, 4, 0);
      return;
    }
    if (this.state !== 'playing') return;

    this.playSeconds += dt;
    this.crimeT = Math.max(0, this.crimeT - dt);
    const inputNow = input || this._input();

    // --- the player
    let speed = 0;
    let px = this.player.x;
    let pz = this.player.z;
    let heading = this.player.heading;
    if (this.inCar && this.playerCar) {
      const res = this.playerCar.update(inputNow, dt, this.city.colliders, this.traffic.cars);
      if (res.crashed) {
        this.sound.crash();
        if (res.hitSpeed > 15) this.damage((res.hitSpeed - 15) * 0.8);
      }
      speed = this.playerCar.speed;
      px = this.playerCar.x;
      pz = this.playerCar.z;
      heading = this.playerCar.heading;
      this.player.x = px;
      this.player.z = pz;
      this.player.heading = heading;
      // Run over a pedestrian: it counts, and the law notices.
      const victim = this.pedestrians.nearest(px, pz, 2.4);
      if (victim && Math.abs(speed) > 4) {
        const wasRival = !!victim.isRival;
        this.pedestrians.knockDown(victim);
        if (wasRival) {
          this.rivalsDown++;
          this.hud.toast(`Viper down — ${this.rivalsDown} of 3.`);
        } else {
          this.addWanted(1, 2);
        }
      }
    } else {
      speed = this.player.updateFoot(dt, this.clockT, inputNow, this.city.colliders);
      px = this.player.x;
      pz = this.player.z;
      heading = this.player.heading;
    }

    // --- the world
    this.traffic.update(dt, this.clockT, { x: px, z: pz, inCar: this.inCar }, this.city.colliders);
    const target = { x: px, z: pz, heading, speed, inCar: this.inCar };
    const policeRes = this.police.update(dt, this.clockT, target, this.city.colliders);
    if (policeRes.rammed) {
      if (this.inCar && this.playerCar) {
        this.playerCar.x += policeRes.rammed.dx * dt * 8;
        this.playerCar.z += policeRes.rammed.dz * dt * 8;
        this.playerCar.speed *= 0.82;
        this.damage(8);
        this.sound.crash();
      } else {
        this.damage(12);
        this.sound.crash();
      }
    }
    const threat = this.lastGunshot || (this.inCar && Math.abs(speed) > 12 ? { x: px, z: pz, radius: 10 } : null);
    this.pedestrians.update(dt, this.clockT, { x: px, z: pz }, threat);
    this.lastGunshot = null;
    this.combat.update(dt);

    // --- wanted decay and busted
    if (this.wanted > 0) {
      if (policeRes.closest > 45 && this.crimeT <= 0) {
        this.quietT += dt;
        if (this.quietT > 8) {
          this.quietT = 0;
          this.setWanted(this.wanted - 1);
          this.hud.toast('You lost them — heat dropping.');
        }
      } else {
        this.quietT = 0;
      }
      if (!this.inCar && policeRes.closest >= 0 && policeRes.closest < 3.5) {
        this.bustedT += dt;
        if (this.bustedT > 2.5) {
          this.bustedT = 0;
          this.gameOver('busted');
          return;
        }
      } else {
        this.bustedT = 0;
      }
    }
    if (this.wanted === 0 && this.health < 100) {
      this.health = Math.min(100, this.health + dt * 2);
      this.hud.setHealth(this.health);
    }

    // --- missions
    const stepBefore = this.missions.currentStep();
    this.missions.update(dt, {
      x: px,
      z: pz,
      inCar: this.inCar,
      interactPressed: this.interactEdge,
      rivalsDown: this.rivalsDown,
      wanted: this.wanted,
    });
    this.interactEdge = false;
    const stepNow = this.missions.currentStep();
    if (stepBefore !== stepNow && stepNow && stepNow.type === 'knockdown') {
      this.markRivals();
    }

    // --- beacon, HUD, sound
    const targetPos = this.missions.objectiveTarget();
    if (targetPos && this.missions.active) {
      this.beacon.visible = true;
      this.beacon.position.set(targetPos.x, 0, targetPos.z);
      const pulse = 1 + Math.sin(this.clockT * 3) * 0.12;
      this.beacon.scale.set(pulse, 1, pulse);
      this.beacon.rotation.y = this.clockT * 0.5;
    } else {
      this.beacon.visible = false;
    }
    this.hud.setCash(this.save.cash);
    this.hud.setHealth(this.health);
    this.hud.setWanted(this.wanted);
    this.hud.setWantedPulse(this.clockT);
    this.hud.setClock(this.save.day, this.clockT);
    this.hud.setObjective(this.missions.objectiveText());
    this.hud.setSpeed(Math.abs(speed) * 2.2, this.inCar);
    this.hud.setCrosshair(!this.inCar && this.state === 'playing');
    this.hud.drawMinimap({
      player: { x: px, z: pz, heading },
      mission: targetPos,
      police: this.police.cruisers,
      traffic: this.traffic.cars,
      city: this.city,
      clockT: this.clockT,
    });
    this.sound.setEngine(Math.min(1, Math.abs(speed) / 44), !this.inCar);
    this.sound.setSiren(this.police.sirenOn, this.clockT);
    this.musicT += dt;
    if (this.musicT > 0.42) {
      this.musicT = 0;
      this.sound.musicStep(this.musicStep++);
    }

    // --- camera
    this.player.updateCamera(this.camera, dt, this.clockT, { x: px, z: pz, heading, speed }, this.inCar);

    // --- autosave
    this.saveT += dt;
    if (this.saveT > 10) {
      this.saveT = 0;
      this.save.playSeconds += 10;
      storeSave(this.save);
    }
  }

  freezeShot() {
    this.shotFrozen = true;
    this.renderer.render(this.scene, this.camera);
  }

  _loop() {
    let last = performance.now();
    let acc = 0;
    const frame = (now) => {
      requestAnimationFrame(frame);
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      if (!this.shotFrozen) {
        acc += dt;
        let steps = 0;
        while (acc >= STEP && steps < 5) {
          this.simulate(STEP);
          acc -= STEP;
          steps++;
        }
        if (steps === 5) acc = 0;
      }
      this.renderer.render(this.scene, this.camera);
    };
    requestAnimationFrame(frame);
  }
}

new Game();
