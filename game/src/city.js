import * as THREE from 'three';

export function createCity(scene, rng) {
  scene.background = new THREE.Color(0x9fc9de);
  scene.fog = new THREE.Fog(0xc6d5d5, 160, 720);
  scene.add(new THREE.HemisphereLight(0xffedcf, 0x77766c, 2));
  const sun = new THREE.DirectionalLight(0xffd49c, 2.2);
  sun.position.set(-160, 220, 90);
  sun.castShadow = false;
  scene.add(sun);

  const root = new THREE.Group();
  scene.add(root);
  const material = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  function box(x, y, z, w, h, d, mat) {
    const mesh = new THREE.Mesh(boxGeometry, mat);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    root.add(mesh);
    return mesh;
  }
  function plane(x, y, z, w, d, mat) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, y, z);
    root.add(mesh);
    return mesh;
  }
  const ground = material(0xa69f90);
  const asphalt = material(0x41484b);
  const sidewalk = material(0xd8cdb7);
  const paint = material(0xe7dca9);
  const wood = material(0x987452);
  const poleMat = material(0x55585a);
  const glow = material(0xffe1a1, { emissive: 0xffc66b, emissiveIntensity: 0.7 });
  plane(0, 0, 0, 600, 600, ground);
  plane(-330, -0.01, 0, 60, 900, material(0xe9d09b));
  const ocean = plane(-880, -0.2, 0, 1040, 1800, material(0x428fa9));
  const centres = Array.from({ length: 11 }, (_, i) => -300 + i * 60);
  for (const c of centres) {
    plane(c, 0.02, 0, 12, 612, asphalt);
    plane(0, 0.021, c, 612, 12, asphalt);
    // Split sidewalks at intersections so no strip covers a crossing road.
    for (let b = -300; b < 300; b += 60) {
      for (const side of [-1, 1]) {
        plane(c + side * 7, 0.035, b + 30, 2, 44, sidewalk);
        plane(b + 30, 0.035, c + side * 7, 44, 2, sidewalk);
      }
      for (const along of [15, 25, 35, 45]) {
        box(c, 0.05, b + along, 0.17, 0.035, 4, paint);
        box(b + along, 0.05, c, 4, 0.035, 0.17, paint);
      }
    }
  }

  const palette = [0xeee5d2, 0xc77d62, 0xd9bc88, 0xabc9d0, 0xe4b6b1, 0x859fa9];
  const facades = palette.map(c => material(c));
  const roofs = palette.map(c => material(new THREE.Color(c).multiplyScalar(0.78)));
  const windows = material(0x7da1ab, { emissive: 0x698c91, emissiveIntensity: 0.25 });
  const colliders = [];
  let block = 0;
  for (let ix = 0; ix < 10; ix++) {
    for (let iz = 0; iz < 10; iz++, block++) {
      const bx = -300 + ix * 60;
      const bz = -300 + iz * 60;
      const count = block % 10 === 0 ? 2 : 1;
      for (let n = 0; n < count; n++) {
        const w = count === 2 ? 14 : rng.range(24, 34);
        const d = rng.range(22, 34);
        const x = bx + (count === 2 ? 20 + n * 20 : 30);
        const z = bz + 30;
        const h = rng.range(8, 45);
        const colorIndex = rng.int(0, palette.length - 1);
        box(x, h / 2, z, w, h, d, facades[colorIndex]);
        box(x, h + 0.3, z, w + 0.4, 0.6, d + 0.4, roofs[colorIndex]);
        const strips = rng.int(0, 3);
        for (let s = 0; s < strips; s++) {
          const y = h * (s + 1) / (strips + 1);
          box(x, y, z + d / 2 + 0.025, w * 0.8, 0.45, 0.05, windows);
          box(x + w / 2 + 0.025, y, z, 0.05, 0.45, d * 0.8, windows);
        }
        colliders.push({ x0: x - w / 2 - 0.2, z0: z - d / 2 - 0.2,
          x1: x + w / 2 + 0.2, z1: z + d / 2 + 0.2 });
      }
    }
  }

  const trunkMat = material(0x967456);
  const leafMat = material(0x527d4a);
  const trunkGeometry = new THREE.CylinderGeometry(0.24, 0.38, 7, 6);
  const frondGeometry = new THREE.ConeGeometry(1, 5, 4);
  function palm(x, z) {
    const trunk = new THREE.Mesh(trunkGeometry, trunkMat);
    trunk.position.set(x, 3.5, z);
    root.add(trunk);
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      const frond = new THREE.Mesh(frondGeometry, leafMat);
      frond.scale.set(0.8, 1, 0.17);
      frond.rotation.set(0, a, -1.25);
      frond.position.set(x + Math.cos(a) * 1.4, 7, z - Math.sin(a) * 1.4);
      root.add(frond);
    }
  }
  for (let z = -270; z <= 270; z += 60) palm(rng.range(-348, -318), z);
  for (let i = 0; i < 12; i++) {
    const x = -300 + rng.int(0, 9) * 60 + 10;
    const z = -300 + rng.int(0, 9) * 60 + 10;
    palm(x, z);
  }
  for (const c of centres) {
    for (let i = 0; i < 10; i++) {
      const z = -270 + i * 60;
      const x = c + (i % 2 ? 7.6 : -7.6);
      box(x, 3.3, z, 0.18, 6.6, 0.18, poleMat);
      box(x, 6.6, z, 0.55, 0.18, 0.8, glow);
    }
  }

  // The pier and shack are outside the city road grid.
  for (let i = 0; i < 35; i++) box(-360.5 - i, 0.45, 0, 0.94, 0.35, 6, wood);
  box(-391, 2.1, 0, 5, 3, 4.5, wood);
  box(-391, 3.8, 0, 5.6, 0.4, 5, roofs[0]);
  const signals = [];
  const dotGeometry = new THREE.SphereGeometry(0.14, 6, 4);
  for (let i = 0; i < 8; i++) {
    const x = -180 + (i % 4) * 120 + 7.6;
    const z = (i < 4 ? -120 : 120) + 7.6;
    box(x, 2.5, z, 0.18, 5, 0.18, poleMat);
    box(x, 5, z, 0.55, 1.35, 0.45, poleMat);
    const dots = [0xff4538, 0xffbc35, 0x5ee378].map((color, index) => {
      const mat = material(color, { emissive: color, emissiveIntensity: 0.1 });
      const dot = new THREE.Mesh(dotGeometry, mat);
      dot.position.set(x, 5.42 - index * 0.42, z + 0.25);
      root.add(dot);
      return mat;
    });
    signals.push(dots);
  }
  const carSpawns = Array.from({ length: 8 }, (_, i) => ({
    x: centres[i + 1] + (i % 2 ? -4 : 4), z: i % 2 ? 150 : -150,
    heading: i % 2 ? Math.PI : 0,
  }));
  const pedSpawns = Array.from({ length: 20 }, (_, i) => ({
    x: centres[i % 10] + (i % 2 ? -7.6 : 7.6),
    z: -270 + Math.floor(i / 2) * 60,
  }));
  return {
    colliders, roads: { xs: centres.slice(), zs: centres.slice() },
    roadHalfWidth: 6, bounds: 300,
    playerSpawn: { x: 0, z: 120, heading: 0 }, carSpawns, pedSpawns,
    update(dt, t) {
      ocean.position.y = -0.2 + Math.sin(t * 0.5) * 0.08;
      signals.forEach((dots, i) => {
        const phase = ((t + i * 1.3) % 12 + 12) % 12;
        const active = phase < 5 ? 2 : phase < 6 ? 1 : 0;
        dots.forEach((mat, index) => { mat.emissiveIntensity = index === active ? 1 : 0.08; });
      });
    },
  };
}
