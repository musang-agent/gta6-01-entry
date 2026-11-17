// Combat for SOLANO HEAT: on-foot shooting. A hitscan shot from the camera
// centre, a tracer line and a muzzle flash light, damage to pedestrians,
// traffic cars and police cruisers, and a wanted-level price for firing in
// public. Melee (a shove) is the quiet alternative: no noise, no wanted.
import * as THREE from 'three';

export class Combat {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.raycaster = new THREE.Raycaster();
    this.cooldown = 0;
    this.ammo = Infinity; // street pistol, bottomless pockets
    this.tracer = null;
    this.tracerT = 0;
    this.flash = new THREE.PointLight(0xffc36b, 0, 18, 1.8);
    this.scene.add(this.flash);
    this.shotsFired = 0;
    this.hits = 0;
  }

  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.tracer) {
      this.tracerT -= dt;
      this.tracer.material.opacity = Math.max(0, this.tracerT / 0.09);
      if (this.tracerT <= 0) {
        this.scene.remove(this.tracer);
        this.tracer.geometry.dispose();
        this.tracer.material.dispose();
        this.tracer = null;
      }
    }
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 60);
  }

  get ready() {
    return this.cooldown <= 0;
  }

  // Fire one shot. targets: { pedestrians, trafficCars, cruisers } — each an
  // object with a .group mesh (or .list of pedestrians). Returns a report
  // the game uses for score, wanted and feedback.
  shoot(origin, direction, targets) {
    if (!this.ready) return null;
    this.cooldown = 0.28;
    this.shotsFired++;
    this.raycaster.set(origin, direction);
    this.raycaster.far = 90;

    const hitMeshes = [];
    const meshToOwner = new Map();
    for (const p of targets.pedestrians.list) {
      if (p.state === 'down') continue;
      p.group.traverse((m) => {
        if (m.isMesh) {
          hitMeshes.push(m);
          meshToOwner.set(m, { type: 'ped', ref: p });
        }
      });
    }
    for (const car of targets.trafficCars) {
      car.group.traverse((m) => {
        if (m.isMesh) {
          hitMeshes.push(m);
          meshToOwner.set(m, { type: 'car', ref: car });
        }
      });
    }
    for (const c of targets.cruisers) {
      c.group.traverse((m) => {
        if (m.isMesh) {
          hitMeshes.push(m);
          meshToOwner.set(m, { type: 'cruiser', ref: c });
        }
      });
    }

    const hits = this.raycaster.intersectObjects(hitMeshes, false);
    let end = origin.clone().addScaledVector(direction, 90);
    let report = { hit: null, distance: 90 };
    if (hits.length > 0) {
      const first = hits[0];
      end = first.point.clone();
      const owner = meshToOwner.get(first.object);
      if (owner) {
        this.hits++;
        report = { hit: owner.type, ref: owner.ref, distance: first.distance };
      }
    }

    // Tracer: a fading yellow line from muzzle to impact.
    const geo = new THREE.BufferGeometry().setFromPoints([origin, end]);
    const mat = new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.95 });
    if (this.tracer) {
      this.scene.remove(this.tracer);
      this.tracer.geometry.dispose();
      this.tracer.material.dispose();
    }
    this.tracer = new THREE.Line(geo, mat);
    this.tracerT = 0.09;
    this.scene.add(this.tracer);
    this.flash.position.copy(origin).addScaledVector(direction, 1.2);
    this.flash.intensity = 5;
    return report;
  }

  // A quiet shove: knocks a nearby pedestrian down without raising the alarm.
  shove(playerPos, playerHeading, pedestrians) {
    if (!this.ready) return false;
    this.cooldown = 0.5;
    const fx = Math.sin(playerHeading);
    const fz = Math.cos(playerHeading);
    const p = pedestrians.nearest(playerPos.x + fx * 1.6, playerPos.z + fz * 1.6, 1.4);
    if (p) {
      pedestrians.knockDown(p);
      return true;
    }
    return false;
  }

  accuracy() {
    return this.shotsFired === 0 ? 0 : this.hits / this.shotsFired;
  }
}
