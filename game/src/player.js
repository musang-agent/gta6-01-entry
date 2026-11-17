// Dario Cruz on foot: the avatar, its walk cycle and the third-person
// camera. Driving lives in vehicles.js (PlayerCar); this file owns the
// on-foot half and the camera that follows both. The walk cycle and the
// camera sway both read the game clock, never wall time.
import * as THREE from 'three';

function buildDarioMesh() {
  const group = new THREE.Group();
  const jacket = new THREE.MeshLambertMaterial({ color: 0xc22e1f }); // red jacket
  const jeans = new THREE.MeshLambertMaterial({ color: 0x1e2a3a });
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98d64 });
  const cap = new THREE.MeshLambertMaterial({ color: 0x111111 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.8, 0.38), jacket);
  torso.position.y = 1.3;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10), skin);
  head.position.y = 1.95;
  group.add(head);
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.3, 0.12, 12), cap);
  hat.position.y = 2.12;
  group.add(hat);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.3), cap);
  brim.position.set(0, 2.07, 0.28);
  group.add(brim);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.88, 0.25), jeans);
  legL.position.set(-0.17, 0.44, 0);
  group.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.88, 0.25), jeans);
  legR.position.set(0.17, 0.44, 0);
  group.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.72, 0.19), jacket);
  armL.position.set(-0.42, 1.3, 0);
  group.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.72, 0.19), jacket);
  armR.position.set(0.42, 1.3, 0);
  group.add(armR);
  group.userData = { legL, legR, armL, armR, torso };
  return group;
}

export class Player {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;
    this.group = buildDarioMesh();
    this.group.visible = true;
    scene.add(this.group);
    this.x = 0;
    this.z = 120;
    this.heading = 0;
    this.speed = 0;
    this.cameraYaw = 0;
    this.mouseYaw = 0; // mouse-look offset, eases back to 0
    this.camPos = new THREE.Vector3(0, 4, 110);
    this.camLook = new THREE.Vector3(0, 1, 120);
  }

  reset(x, z, heading) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.cameraYaw = heading;
    this.mouseYaw = 0;
    this.group.position.set(x, 0, z);
    this.group.rotation.y = heading;
    this.group.visible = true;
  }

  // input: {forward, back, left, right} — movement is relative to the
  // camera yaw, so W always walks away from the camera. Returns speed.
  updateFoot(dt, t, input, colliders) {
    let mx = 0;
    let mz = 0;
    if (input.forward) { mx += Math.sin(this.cameraYaw); mz += Math.cos(this.cameraYaw); }
    if (input.back) { mx -= Math.sin(this.cameraYaw); mz -= Math.cos(this.cameraYaw); }
    if (input.left) { mx -= Math.cos(this.cameraYaw); mz += Math.sin(this.cameraYaw); }
    if (input.right) { mx += Math.cos(this.cameraYaw); mz -= Math.sin(this.cameraYaw); }
    const len = Math.hypot(mx, mz);
    const targetSpeed = len > 0 ? 6.2 : 0;
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 10);
    if (len > 0) {
      mx /= len;
      mz /= len;
      const targetHeading = Math.atan2(mx, mz);
      let diff = targetHeading - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.heading += Math.max(-9 * dt, Math.min(9 * dt, diff));
      const nx = this.x + mx * this.speed * dt;
      const nz = this.z + mz * this.speed * dt;
      if (!this._hitsBuilding(nx, this.z, colliders)) this.x = nx;
      if (!this._hitsBuilding(this.x, nz, colliders)) this.z = nz;
      this.x = Math.max(-356, Math.min(300, this.x));
      this.z = Math.max(-300, Math.min(300, this.z));
    }
    // Walk cycle from the game clock.
    const phase = t * 9;
    const swing = Math.sin(phase) * Math.min(1, this.speed / 6) * 0.55;
    const u = this.group.userData;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.7;
    u.armR.rotation.x = swing * 0.7;
    u.torso.position.y = 1.3 + Math.abs(Math.sin(phase)) * 0.05 * Math.min(1, this.speed / 6);
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.heading;
    return this.speed;
  }

  _hitsBuilding(x, z, colliders) {
    const r = 0.6;
    for (const b of colliders) {
      if (x + r > b.x0 && x - r < b.x1 && z + r > b.z0 && z - r < b.z1) return true;
    }
    return false;
  }

  // Mouse look: horizontal mouse movement orbits the camera around Dario.
  addMouseLook(dx) {
    this.mouseYaw -= dx * 0.0028;
    this.mouseYaw = Math.max(-1.2, Math.min(1.2, this.mouseYaw));
  }

  // Third-person chase camera. focus: {x, z, heading, speed} of whatever
  // the player is (on foot or in a car). inCar pulls the camera further
  // back and higher. The camera yaw eases toward the focus heading plus
  // the mouse-look offset, which decays back to zero.
  updateCamera(camera, dt, t, focus, inCar) {
    this.mouseYaw *= Math.max(0, 1 - dt * 1.4);
    const targetYaw = focus.heading + this.mouseYaw;
    let diff = targetYaw - this.cameraYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const ease = inCar ? 5.5 : 7;
    this.cameraYaw += diff * Math.min(1, dt * ease);
    const dist = inCar ? 11.5 : 7;
    const height = inCar ? 4.6 : 3.2;
    const fx = Math.sin(this.cameraYaw);
    const fz = Math.cos(this.cameraYaw);
    const desired = new THREE.Vector3(
      focus.x - fx * dist,
      height + Math.sin(t * 0.7) * 0.04,
      focus.z - fz * dist,
    );
    const k = 1 - Math.exp(-dt * 7);
    this.camPos.lerp(desired, k);
    const lookTarget = new THREE.Vector3(
      focus.x + fx * (inCar ? 7 : 3),
      inCar ? 1.4 : 1.6,
      focus.z + fz * (inCar ? 7 : 3),
    );
    this.camLook.lerp(lookTarget, 1 - Math.exp(-dt * 9));
    camera.position.copy(this.camPos);
    camera.lookAt(this.camLook);
  }

  // A fixed cinematic camera for title / shot staging.
  setCameraPose(camera, px, py, pz, lx, ly, lz) {
    this.camPos.set(px, py, pz);
    this.camLook.set(lx, ly, lz);
    camera.position.copy(this.camPos);
    camera.lookAt(this.camLook);
  }

  hideAvatar() {
    this.group.visible = false;
  }

  showAvatar() {
    this.group.visible = true;
  }
}
