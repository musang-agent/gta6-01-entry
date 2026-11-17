// Pedestrians of Port Solano: simple articulated figures that stroll the
// sidewalks, cross at corners, and run when a car or a gunshot comes too
// close. Every walk-cycle angle comes from the game clock, so a fixed clock
// means a fixed pose.
import * as THREE from 'three';

const SKIN = [0xc98d64, 0x8a5a3b, 0xe8b98d, 0x6b4423];
const SHIRTS = [0xff6b4a, 0x3fa7ff, 0xffd23c, 0x7ee081, 0xff8fd0, 0xffffff, 0x9b7ede];
const PANTS = [0x2b3a55, 0x3a3a3a, 0x5a4632, 0x224422];

function buildPedestrianMesh(rng) {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: rng.pick(SHIRTS) });
  const pants = new THREE.MeshLambertMaterial({ color: rng.pick(PANTS) });
  const skin = new THREE.MeshLambertMaterial({ color: rng.pick(SKIN) });
  const hair = new THREE.MeshLambertMaterial({ color: rng.pick([0x1a1a1a, 0x4a2f16, 0x777777, 0x2b1a0e]) });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.78, 0.36), shirt);
  torso.position.y = 1.28;
  torso.userData.isShirt = true;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), skin);
  head.position.y = 1.92;
  group.add(head);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  hairCap.position.y = 1.96;
  group.add(hairCap);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.85, 0.24), pants);
  legL.position.set(-0.16, 0.43, 0);
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.85, 0.24), pants);
  legR.position.set(0.16, 0.43, 0);
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.18), shirt);
  armL.position.set(-0.4, 1.28, 0);
  group.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.7, 0.18), shirt);
  armR.position.set(0.4, 1.28, 0);
  group.add(armR);
  group.userData = { legL, legR, armL, armR, torso };
  return group;
}

export class Pedestrians {
  constructor(scene, city, rng, count = 26) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.list = [];
    for (let i = 0; i < count; i++) {
      const group = buildPedestrianMesh(rng);
      const spawn = city.pedSpawns[i % city.pedSpawns.length];
      const p = {
        group,
        x: spawn.x + rng.range(-4, 4),
        z: spawn.z + rng.range(-4, 4),
        heading: rng.range(0, Math.PI * 2),
        speed: rng.range(1.0, 1.7),
        walkPhase: rng.range(0, Math.PI * 2),
        state: 'walk', // 'walk' | 'flee' | 'down'
        fleeT: 0,
        targetHeading: rng.range(0, Math.PI * 2),
        retargetT: rng.range(2, 6),
      };
      p.group.position.set(p.x, 0, p.z);
      p.group.rotation.y = p.heading;
      scene.add(p.group);
      this.list.push(p);
    }
  }

  // threat: {x, z, radius} or null. fleeRadius is how close a car/gunshot
  // must be before a pedestrian runs.
  update(dt, t, player, threat) {
    const roads = this.city.roads;
    for (const p of this.list) {
      if (p.state === 'down') continue;
      // Decide: run from a nearby threat.
      if (threat) {
        const dx = p.x - threat.x;
        const dz = p.z - threat.z;
        const d = Math.hypot(dx, dz);
        if (d < threat.radius) {
          p.state = 'flee';
          p.fleeT = 1.6;
          p.targetHeading = Math.atan2(dx, dz);
        }
      }
      if (p.state === 'flee') {
        p.fleeT -= dt;
        if (p.fleeT <= 0) p.state = 'walk';
      }
      if (p.state === 'walk') {
        p.retargetT -= dt;
        if (p.retargetT <= 0) {
          p.retargetT = this.rng.range(3, 8);
          // Pick a heading along a nearby road, so walkers stay on the
          // sidewalks instead of cutting through blocks.
          const nearX = roads.xs.reduce((a, b) => (Math.abs(b - p.x) < Math.abs(a - p.x) ? b : a));
          const nearZ = roads.zs.reduce((a, b) => (Math.abs(b - p.z) < Math.abs(a - p.z) ? b : a));
          const alongX = Math.abs(nearZ - p.z) < Math.abs(nearX - p.x);
          const dir = this.rng.chance(0.5) ? 1 : -1;
          p.targetHeading = alongX ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
        }
      }
      // Steer toward the target heading.
      let diff = p.targetHeading - p.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      p.heading += Math.max(-2.2 * dt, Math.min(2.2 * dt, diff));
      const speed = p.state === 'flee' ? 5.2 : p.speed;
      p.x += Math.sin(p.heading) * speed * dt;
      p.z += Math.cos(p.heading) * speed * dt;
      // Keep inside the city and off the beach road: walkers turn around.
      if (p.x < -295 || p.x > 295 || p.z < -295 || p.z > 295) {
        p.targetHeading = p.heading + Math.PI;
        p.x = Math.max(-295, Math.min(295, p.x));
        p.z = Math.max(-295, Math.min(295, p.z));
      }
      // Walk cycle, driven by the game clock: same t, same pose.
      p.walkPhase = t * (p.state === 'flee' ? 11 : 6) + p.x * 0.01;
      const swing = Math.sin(p.walkPhase) * (p.state === 'flee' ? 0.75 : 0.5);
      const u = p.group.userData;
      u.legL.rotation.x = swing;
      u.legR.rotation.x = -swing;
      u.armL.rotation.x = -swing * 0.7;
      u.armR.rotation.x = swing * 0.7;
      u.torso.position.y = 1.28 + Math.abs(Math.sin(p.walkPhase)) * 0.04;
      p.group.position.set(p.x, 0, p.z);
      p.group.rotation.y = p.heading;
    }
  }

  // Nearest pedestrian to a point, within maxDist, or null.
  nearest(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const p of this.list) {
      if (p.state === 'down') continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  // Knock one down (shot or run over): it lies flat and stops.
  knockDown(p) {
    if (!p || p.state === 'down') return;
    p.state = 'down';
    p.group.rotation.x = Math.PI / 2;
    p.group.position.y = 0.25;
  }

  countStanding() {
    return this.list.filter((p) => p.state !== 'down').length;
  }
}
