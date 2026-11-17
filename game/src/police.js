// The Solano PD: cruisers that spawn when the wanted level rises, chase
// Dario down the road grid, and ram him when they catch him. They steer
// along roads where they can and cut across blocks only when the target is
// close. Light bars flash from the game clock; the siren is the sound
// bank's job. Wanted 0 means no cruisers at all.
import { createCarMesh, circleHitsAABB } from './vehicles.js';

export class Police {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.wanted = 0;
    this.cruisers = [];
  }

  get sirenOn() {
    return this.cruisers.length > 0;
  }

  setWanted(level) {
    this.wanted = Math.max(0, Math.min(5, level));
  }

  _spawnCruiserNear(target) {
    const roads = this.city.roads;
    // Pick a road point on the ring 70..100 units from the target.
    for (let tries = 0; tries < 12; tries++) {
      const axis = this.rng.chance(0.5) ? 'x' : 'z';
      const list = axis === 'x' ? roads.xs : roads.zs;
      const road = this.rng.pick(list);
      const along = this.rng.range(-280, 280);
      const x = axis === 'x' ? along : road;
      const z = axis === 'x' ? road : along;
      const d = Math.hypot(x - target.x, z - target.z);
      if (d < 70 || d > 110) continue;
      const group = createCarMesh('cruiser', 0xf2f2f2);
      this.scene.add(group);
      const c = {
        group,
        x,
        z,
        heading: Math.atan2(target.x - x, target.z - z),
        speed: 20,
        mode: 'chase',
        ramCooldown: 0,
      };
      group.position.set(x, 0, z);
      group.rotation.y = c.heading;
      this.cruisers.push(c);
      return;
    }
  }

  _removeCruiser(c) {
    const i = this.cruisers.indexOf(c);
    if (i >= 0) this.cruisers.splice(i, 1);
    this.scene.remove(c.group);
  }

  // target: {x, z, heading, speed, inCar}. Returns {rammed, closest}.
  update(dt, t, target, colliders) {
    const want = Math.min(this.wanted, 4);
    while (this.cruisers.filter((c) => c.mode === 'chase').length < want) {
      this._spawnCruiserNear(target);
    }
    // Too many cruisers: the extras give up and drive away.
    const chasing = this.cruisers.filter((c) => c.mode === 'chase');
    for (let i = want; i < chasing.length; i++) chasing[i].mode = 'leave';

    let rammed = null;
    let closest = Infinity;
    for (const c of [...this.cruisers]) {
      c.ramCooldown = Math.max(0, c.ramCooldown - dt);
      const dx = target.x - c.x;
      const dz = target.z - c.z;
      const dist = Math.hypot(dx, dz);
      closest = Math.min(closest, dist);

      if (c.mode === 'leave') {
        // Drive away from the target; vanish once far off.
        c.heading = Math.atan2(c.x - target.x, c.z - target.z);
        c.speed = Math.min(34, c.speed + 10 * dt);
        if (dist > 170) {
          this._removeCruiser(c);
          continue;
        }
      } else {
        // Chase: steer toward the target, faster at high wanted levels.
        const desired = Math.atan2(dx, dz);
        let diff = desired - c.heading;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        // Building avoidance: probe ahead; if blocked, veer to the open side.
        const probeX = c.x + Math.sin(c.heading) * 8;
        const probeZ = c.z + Math.cos(c.heading) * 8;
        let blocked = false;
        for (const b of colliders) {
          if (circleHitsAABB(probeX, probeZ, 2.5, b)) {
            blocked = true;
            break;
          }
        }
        if (blocked) {
          const leftX = c.x + Math.sin(c.heading - 0.9) * 8;
          const leftZ = c.z + Math.cos(c.heading - 0.9) * 8;
          let leftBlocked = false;
          for (const b of colliders) {
            if (circleHitsAABB(leftX, leftZ, 2.5, b)) {
              leftBlocked = true;
              break;
            }
          }
          diff += leftBlocked ? 0.9 : -0.9;
        }
        c.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
        const targetSpeed = this.wanted >= 3 ? Math.min(46, target.speed + 7) : 40;
        c.speed += (targetSpeed - c.speed) * Math.min(1, dt * 0.9);
        // Ram: a solid shove when right on the target.
        if (dist < 4.5 && c.ramCooldown <= 0) {
          rammed = { dx: Math.sin(c.heading) * 6, dz: Math.cos(c.heading) * 6 };
          c.ramCooldown = 0.8;
          c.speed *= 0.7;
        }
      }

      c.x += Math.sin(c.heading) * c.speed * dt;
      c.z += Math.cos(c.heading) * c.speed * dt;
      // Keep cruisers inside the world and out of buildings.
      c.x = Math.max(-356, Math.min(300, c.x));
      c.z = Math.max(-300, Math.min(300, c.z));
      for (const b of colliders) {
        if (circleHitsAABB(c.x, c.z, 2.3, b)) {
          // Slide along the wall: back out along the heading.
          c.x -= Math.sin(c.heading) * c.speed * dt * 1.5;
          c.z -= Math.cos(c.heading) * c.speed * dt * 1.5;
          c.heading += 0.5;
          c.speed *= 0.6;
        }
      }
      c.group.position.set(c.x, 0, c.z);
      c.group.rotation.y = c.heading;
      // Light bar flash, driven by the game clock.
      const redOn = Math.sin(t * 12) > 0;
      if (c.group.userData.lightRed) {
        c.group.userData.lightRed.emissiveIntensity = redOn ? 1.6 : 0.12;
        c.group.userData.lightBlue.emissiveIntensity = redOn ? 0.12 : 1.6;
      }
      const spin = (c.speed * dt) / 0.42;
      for (const w of c.group.userData.wheels) w.rotation.x += spin;
    }
    return { rammed, closest: closest === Infinity ? -1 : closest };
  }

  clearAll() {
    for (const c of [...this.cruisers]) this._removeCruiser(c);
    this.wanted = 0;
  }
}
