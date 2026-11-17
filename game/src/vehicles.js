// Vehicles of Port Solano: car meshes, the player's arcade driving and the
// seeded traffic that fills the roads. Cars are box-built (body, cabin,
// wheels, lights) so the whole fleet costs a handful of draw calls each.
// Forward for a heading h is (sin h, 0, cos h); a mesh facing that way has
// rotation.y = h. All motion is stepped from the game clock.
import * as THREE from 'three';

export const CAR_COLORS = [0xd21f1f, 0x2b6fd6, 0xf2c230, 0x37b268, 0xe8e8e8, 0x8a5fc0, 0xff7a1a, 0x222831];

const GLASS = new THREE.MeshLambertMaterial({ color: 0x1d3a4a });
const TYRE = new THREE.MeshLambertMaterial({ color: 0x141414 });
const HEADLIGHT = new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0xffedb0, emissiveIntensity: 0.9 });
const TAILLIGHT = new THREE.MeshLambertMaterial({ color: 0xcc2222, emissive: 0xaa1111, emissiveIntensity: 0.6 });

function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

export function createCarMesh(kind, color) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.34, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelPositions =
    kind === 'truck'
      ? [[-0.95, 0.42, 1.7], [0.95, 0.42, 1.7], [-0.95, 0.42, -1.6], [0.95, 0.42, -1.6]]
      : [[-0.9, 0.38, 1.35], [0.9, 0.38, 1.35], [-0.9, 0.38, -1.35], [0.9, 0.38, -1.35]];
  for (const [x, y, z] of wheelPositions) {
    const w = new THREE.Mesh(wheelGeo, TYRE);
    w.position.set(x, y, z);
    group.add(w);
    wheels.push(w);
  }

  if (kind === 'truck') {
    group.add(box(2.0, 1.1, 1.6, bodyMat, 0, 1.0, 1.9)); // cab
    group.add(box(1.9, 0.9, 1.4, GLASS, 0, 1.15, 1.55));
    group.add(box(2.1, 2.2, 3.4, new THREE.MeshLambertMaterial({ color: 0xd8d2c4 }), 0, 1.7, -1.2)); // cargo
  } else if (kind === 'van') {
    group.add(box(2.0, 1.5, 4.6, bodyMat, 0, 1.15, 0));
    group.add(box(1.8, 0.7, 1.0, GLASS, 0, 1.45, 1.9));
  } else {
    const low = kind === 'sport';
    const bodyH = low ? 0.62 : 0.78;
    const bodyY = low ? 0.72 : 0.82;
    const len = low ? 4.6 : 4.2;
    group.add(box(1.95, bodyH, len, bodyMat, 0, bodyY, 0));
    group.add(box(1.7, 0.62, len * 0.48, GLASS, 0, bodyY + bodyH / 2 + 0.28, -0.15));
    if (kind === 'sport') {
      group.add(box(1.9, 0.09, 0.5, bodyMat, 0, 1.25, -len / 2 + 0.15)); // spoiler
      group.add(box(0.12, 0.3, 0.12, TYRE, -0.7, 1.05, -len / 2 + 0.15));
      group.add(box(0.12, 0.3, 0.12, TYRE, 0.7, 1.05, -len / 2 + 0.15));
    }
    if (kind === 'taxi') {
      group.add(box(0.9, 0.28, 0.4, new THREE.MeshLambertMaterial({ color: 0xffd23c, emissive: 0xaa8800, emissiveIntensity: 0.5 }), 0, 1.75, -0.15));
    }
  }

  // Headlights at the front (+Z), tail lights at the back.
  const front = kind === 'truck' ? 2.7 : kind === 'sport' ? 2.3 : 2.1;
  const back = kind === 'truck' ? -2.95 : kind === 'sport' ? -2.3 : -2.1;
  group.add(box(0.34, 0.18, 0.06, HEADLIGHT, -0.62, 0.85, front));
  group.add(box(0.34, 0.18, 0.06, HEADLIGHT, 0.62, 0.85, front));
  group.add(box(0.4, 0.16, 0.06, TAILLIGHT, -0.62, 0.85, back));
  group.add(box(0.4, 0.16, 0.06, TAILLIGHT, 0.62, 0.85, back));

  if (kind === 'cruiser') {
    // Black doors on a white body, plus the red/blue light bar.
    const doorMat = new THREE.MeshLambertMaterial({ color: 0x14181c });
    group.add(box(0.06, 0.55, 1.9, doorMat, -0.99, 0.85, 0));
    group.add(box(0.06, 0.55, 1.9, doorMat, 0.99, 0.85, 0));
    const redMat = new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 1 });
    const blueMat = new THREE.MeshLambertMaterial({ color: 0x2255ff, emissive: 0x2255ff, emissiveIntensity: 1 });
    const red = box(0.55, 0.22, 0.4, redMat, -0.32, 1.62, -0.15);
    const blue = box(0.55, 0.22, 0.4, blueMat, 0.32, 1.62, -0.15);
    group.add(red);
    group.add(blue);
    group.userData.lightRed = redMat;
    group.userData.lightBlue = blueMat;
  }
  group.userData.wheels = wheels;
  group.userData.kind = kind;
  return group;
}

export function circleHitsAABB(x, z, r, b) {
  const cx = Math.max(b.x0, Math.min(x, b.x1));
  const cz = Math.max(b.z0, Math.min(z, b.z1));
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < r * r;
}

function pushOutOfAABB(p, r, b) {
  const cx = Math.max(b.x0, Math.min(p.x, b.x1));
  const cz = Math.max(b.z0, Math.min(p.z, b.z1));
  let dx = p.x - cx;
  let dz = p.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 < 1e-6) {
    // Centre inside the box: push out along the smallest penetration axis.
    const pl = p.x - b.x0;
    const pr = b.x1 - p.x;
    const pt = p.z - b.z0;
    const pb = b.z1 - p.z;
    const m = Math.min(pl, pr, pt, pb);
    if (m === pl) p.x = b.x0 - r;
    else if (m === pr) p.x = b.x1 + r;
    else if (m === pt) p.z = b.z0 - r;
    else p.z = b.z1 + r;
    return true;
  }
  const d = Math.sqrt(d2);
  dx /= d;
  dz /= d;
  p.x = cx + dx * r;
  p.z = cz + dz * r;
  return true;
}

export class PlayerCar {
  constructor(scene, city, color) {
    this.scene = scene;
    this.city = city;
    this.color = color;
    this.group = createCarMesh('sport', color);
    scene.add(this.group);
    this.x = 0;
    this.z = 0;
    this.heading = 0;
    this.speed = 0;
    this.radius = 2.3;
    this.steerVisual = 0;
  }

  reset(x, z, heading) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.group.position.set(x, 0, z);
    this.group.rotation.y = heading;
  }

  update(input, dt, colliders, trafficCars) {
    const before = this.speed;
    if (input.forward) this.speed += 16 * dt;
    if (input.back) this.speed -= this.speed > 0.5 ? 26 * dt : 12 * dt;
    if (input.brake) {
      this.speed -= Math.sign(this.speed) * 34 * dt;
      if (Math.abs(this.speed) < 0.4) this.speed = 0;
    }
    if (!input.forward && !input.back) {
      this.speed -= this.speed * 0.6 * dt;
      if (Math.abs(this.speed) < 0.05) this.speed = 0;
    }
    this.speed = Math.max(-12, Math.min(44, this.speed));
    const steerAmount = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const grip = Math.min(1, Math.abs(this.speed) / 10 + 0.15);
    this.heading += steerAmount * 2.0 * grip * dt * (this.speed >= 0 ? 1 : -1);
    this.steerVisual += (steerAmount * 0.3 - this.steerVisual) * Math.min(1, dt * 8);

    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;

    let crashed = false;
    let hitSpeed = 0;
    for (const b of colliders) {
      if (circleHitsAABB(this.x, this.z, this.radius, b)) {
        if (Math.abs(before) > 9) {
          crashed = true;
          hitSpeed = Math.abs(before);
        }
        pushOutOfAABB(this, this.radius, b);
        this.speed *= 0.45;
      }
    }
    for (const other of trafficCars || []) {
      const dx = this.x - other.x;
      const dz = this.z - other.z;
      const rr = this.radius + (other.radius || 2.3);
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (rr - d) / 2;
        this.x += (dx / d) * push;
        this.z += (dz / d) * push;
        other.x -= (dx / d) * push;
        other.z -= (dz / d) * push;
        if (Math.abs(before - (other.speed || 0)) > 9) {
          crashed = true;
          hitSpeed = Math.abs(before - (other.speed || 0));
        }
        this.speed *= 0.7;
        if (typeof other.onBump === 'function') other.onBump();
      }
    }
    // Stay in the world: sand is fine, the ocean is not.
    this.x = Math.max(-358, Math.min(330, this.x));
    this.z = Math.max(-330, Math.min(330, this.z));

    const spin = (this.speed * dt) / 0.42;
    for (const w of this.group.userData.wheels) w.rotation.x += spin;
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.heading;
    this.group.rotation.z = -this.steerVisual * 0.12;
    return { crashed, hitSpeed };
  }

  dispose() {
    this.scene.remove(this.group);
  }
}

const TRAFFIC_KINDS = ['sedan', 'sedan', 'sedan', 'taxi', 'van', 'truck', 'sport'];

export class Traffic {
  constructor(scene, city, rng, count = 14) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.allowTurns = true; // shot staging can freeze turns so a staged road stays clear
    this.respawnPaused = false; // shot staging can pause wrap/recycle respawns for the same reason
    this.cars = [];
    for (let i = 0; i < count; i++) this.cars.push(this._spawnCar(true));
  }

  _spawnCar(initial) {
    const rng = this.rng;
    const axis = rng.chance(0.5) ? 'x' : 'z';
    const roads = axis === 'x' ? this.city.roads.xs : this.city.roads.zs;
    const road = rng.pick(roads);
    const dir = rng.chance(0.5) ? 1 : -1;
    const lane = dir > 0 ? 4 : -4;
    const kind = rng.pick(TRAFFIC_KINDS);
    const color = kind === 'taxi' ? 0xf2c230 : rng.pick(CAR_COLORS);
    const group = createCarMesh(kind, color);
    this.scene.add(group);
    const along = rng.range(-280, 280);
    const car = {
      group,
      axis,
      road,
      dir,
      lane,
      kind,
      color,
      radius: 2.3,
      x: axis === 'x' ? along : road + lane,
      z: axis === 'x' ? road + lane : along,
      heading: axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : dir > 0 ? 0 : Math.PI,
      speed: 0,
      targetSpeed: kind === 'truck' ? rng.range(8, 10) : rng.range(9, 14),
      parked: false,
    };
    car.group.position.set(car.x, 0, car.z);
    car.group.rotation.y = car.heading;
    return car;
  }

  _respawn(car) {
    const fresh = this._spawnCar(false);
    this.scene.remove(car.group);
    Object.assign(car, fresh);
  }

  // player: {x, z} plus optional playerCar {x, z, radius} for avoidance.
  update(dt, t, player, colliders) {
    const roads = this.city.roads;
    for (const car of this.cars) {
      if (car.parked) continue;
      // Slow for the car ahead on the same road and lane.
      let ahead = null;
      let aheadD = 14;
      for (const other of this.cars) {
        if (other === car || other.parked) continue;
        if (other.axis !== car.axis || other.road !== car.road || other.lane !== car.lane || other.dir !== car.dir) continue;
        const d = (other.x - car.x) * (car.axis === 'x' ? car.dir : 0) + (other.z - car.z) * (car.axis === 'z' ? car.dir : 0);
        if (d > 0 && d < aheadD) {
          aheadD = d;
          ahead = other;
        }
      }
      let want = car.targetSpeed;
      if (ahead) want = Math.min(want, Math.max(0, (aheadD - 7) * 0.8));
      if (player && player.inCar) {
        const dx = player.x - car.x;
        const dz = player.z - car.z;
        const along = car.axis === 'x' ? dx * car.dir : dz * car.dir;
        const across = car.axis === 'x' ? Math.abs(dz - car.lane) : Math.abs(dx - car.lane);
        if (along > 0 && along < 13 && across < 6) want = 0;
      }
      car.speed += (want - car.speed) * Math.min(1, dt * 1.6);
      // Turn at intersections, sometimes, onto the crossing road.
      const cross = car.axis === 'x' ? roads.zs : roads.xs;
      const alongPos = car.axis === 'x' ? car.x : car.z;
      let nearCross = null;
      for (const c of cross) {
        if (Math.abs(alongPos - c) < 10) {
          nearCross = c;
          break;
        }
      }
      if (nearCross !== null && this.allowTurns && this.rng.chance(0.25 * dt) && car.speed > 2) {
        const newAxis = car.axis === 'x' ? 'z' : 'x';
        const newRoad = nearCross;
        const newDir = this.rng.chance(0.5) ? 1 : -1;
        car.axis = newAxis;
        car.road = newRoad;
        car.dir = newDir;
        car.lane = newDir > 0 ? 4 : -4;
        if (newAxis === 'x') {
          car.z = newRoad + car.lane;
          car.x = Math.max(-300, Math.min(300, car.x));
          car.heading = newDir > 0 ? Math.PI / 2 : -Math.PI / 2;
        } else {
          car.x = newRoad + car.lane;
          car.z = Math.max(-300, Math.min(300, car.z));
          car.heading = newDir > 0 ? 0 : Math.PI;
        }
      }
      if (car.axis === 'x') car.x += car.dir * car.speed * dt;
      else car.z += car.dir * car.speed * dt;
      // Wrap around the city edge instead of driving into the sea.
      if (!this.respawnPaused) {
        if (car.axis === 'x' && (car.x > 300 || car.x < -300)) this._respawn(car);
        if (car.axis === 'z' && (car.z > 300 || car.z < -300)) this._respawn(car);
        // Too far from the player: recycle to a nearer road.
        if (player && Math.hypot(car.x - player.x, car.z - player.z) > 380) this._respawn(car);
      }
      const spin = (car.speed * dt) / 0.42;
      for (const w of car.group.userData.wheels) w.rotation.x += spin;
      car.group.position.set(car.x, 0, car.z);
      car.group.rotation.y = car.heading;
    }
  }

  // Respawn every car driving a given stretch of road, so a staged scene
  // (a chase, a screenshot) starts with a clear road ahead.
  clearStretch(axis, road, from, to) {
    for (const car of [...this.cars]) {
      if (car.axis !== axis || car.road !== road) continue;
      const along = axis === 'x' ? car.x : car.z;
      if (along >= from && along <= to) this._respawn(car);
    }
  }

  removeCar(car) {
    const i = this.cars.indexOf(car);
    if (i >= 0) this.cars.splice(i, 1);
    this.scene.remove(car.group);
  }

  nearest(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of this.cars) {
      const d = Math.hypot(car.x - x, car.z - z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }
}
