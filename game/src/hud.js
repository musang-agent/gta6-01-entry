// The HUD of SOLANO HEAT: cash, health, wanted stars, the mission box, the
// speedometer and the circular minimap. The minimap is a 2D canvas redrawn
// from live state every frame — roads, the beach, the player arrow, the
// mission marker, police and traffic dots. All of it is DOM and canvas, no
// three.js, so it stays cheap.
export class Hud {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      cash: document.getElementById('cash-value'),
      healthFill: document.getElementById('health-fill'),
      stars: document.getElementById('wanted-stars'),
      clock: document.getElementById('clock'),
      objTitle: document.getElementById('objective-title'),
      objText: document.getElementById('objective-text'),
      objSub: document.getElementById('objective-sub'),
      minimap: document.getElementById('minimap'),
      speedo: document.getElementById('speedo'),
      speedValue: document.getElementById('speed-value'),
      crosshair: document.getElementById('crosshair'),
      toast: document.getElementById('toast'),
    };
    this.mapCtx = this.el.minimap.getContext('2d');
    this.toastTimer = null;
    this.lastStars = -1;
  }

  show() {
    this.el.hud.classList.remove('hidden');
  }

  hide() {
    this.el.hud.classList.add('hidden');
  }

  setCash(cash) {
    this.el.cash.textContent = cash.toLocaleString('en-US');
  }

  setHealth(hp) {
    this.el.healthFill.style.width = `${Math.max(0, Math.min(100, hp))}%`;
  }

  setWanted(level) {
    if (level === this.lastStars) return;
    this.lastStars = level;
    let html = '';
    for (let i = 0; i < 5; i++) {
      html += i < level ? '<span>★</span>' : '<span class="star-off">★</span>';
    }
    this.el.stars.innerHTML = html;
    this.el.stars.classList.toggle('hot', level >= 3);
  }

  // The wanted-stars pulse, driven by the game clock so a frozen frame is
  // a fixed frame (a CSS animation would pulse on wall time instead).
  setWantedPulse(clockT) {
    if (this.lastStars >= 3) {
      this.el.stars.style.transform = `scale(${(1 + Math.sin(clockT * 6) * 0.035).toFixed(4)})`;
    } else {
      this.el.stars.style.transform = '';
    }
  }

  // Game clock: day 1 starts 08:00, one game hour per 150 real seconds.
  setClock(day, clockT) {
    const hour = (8 + clockT / 150) % 24;
    const h = Math.floor(hour);
    const m = Math.floor((hour - h) * 60);
    this.el.clock.textContent = `DAY ${day} · ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  setObjective(obj) {
    this.el.objTitle.textContent = obj.title;
    this.el.objText.textContent = obj.text;
    this.el.objSub.textContent = obj.sub || '';
  }

  setSpeed(mph, inCar) {
    this.el.speedo.classList.toggle('hidden', !inCar);
    if (inCar) this.el.speedValue.textContent = String(Math.round(mph));
  }

  setCrosshair(on) {
    this.el.crosshair.classList.toggle('hidden', !on);
  }

  toast(msg, ms = 4200) {
    this.el.toast.textContent = msg;
    this.el.toast.classList.add('show');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.el.toast.classList.remove('show'), ms);
  }

  // Hide the toast at once (screenshot staging): its setTimeout fade runs
  // on wall time, so a staged frame must not depend on it.
  hideToast() {
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
    this.el.toast.classList.remove('show');
  }

  // state: { player: {x,z,heading}, mission: {x,z}|null, police: [{x,z}],
  // traffic: [{x,z}], city: { roads, bounds } }
  drawMinimap(state) {
    const ctx = this.mapCtx;
    const S = 220;
    const { bounds } = state.city;
    const span = bounds * 2 + 80; // include the beach strip
    const toMap = (x, z) => [((x + span / 2) / span) * S, ((z + span / 2) / span) * S];
    ctx.clearRect(0, 0, S, S);
    // Sea and sand on the west edge.
    ctx.fillStyle = '#0e3a5c';
    ctx.fillRect(0, 0, ((span / 2 - 360) / span) * S, S);
    ctx.fillStyle = '#d9b380';
    const [bx0] = toMap(-360, 0);
    const [bx1] = toMap(-300, 0);
    ctx.fillRect(bx0, 0, bx1 - bx0, S);
    // City floor.
    ctx.fillStyle = '#22303c';
    ctx.fillRect(bx1, 0, S - bx1, S);
    // Roads.
    ctx.strokeStyle = '#5a6b7a';
    ctx.lineWidth = 4;
    for (const x of state.city.roads.xs) {
      const [mx] = toMap(x, 0);
      ctx.beginPath();
      ctx.moveTo(mx, 0);
      ctx.lineTo(mx, S);
      ctx.stroke();
    }
    for (const z of state.city.roads.zs) {
      const [, mz] = toMap(0, z);
      ctx.beginPath();
      ctx.moveTo(0, mz);
      ctx.lineTo(S, mz);
      ctx.stroke();
    }
    // Mission marker: a pulsing gold diamond (pulse from the clock, passed in).
    if (state.mission) {
      const [mx, mz] = toMap(state.mission.x, state.mission.z);
      const r = 7 + Math.sin(state.clockT * 4) * 2;
      ctx.fillStyle = '#ffd23c';
      ctx.beginPath();
      ctx.moveTo(mx, mz - r);
      ctx.lineTo(mx + r, mz);
      ctx.lineTo(mx, mz + r);
      ctx.lineTo(mx - r, mz);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    // Traffic: pale dots. Police: red/blue dots.
    ctx.fillStyle = '#cfd8e3';
    for (const c of state.traffic) {
      const [mx, mz] = toMap(c.x, c.z);
      ctx.fillRect(mx - 1.5, mz - 1.5, 3, 3);
    }
    for (const c of state.police) {
      const [mx, mz] = toMap(c.x, c.z);
      ctx.fillStyle = Math.sin(state.clockT * 10) > 0 ? '#ff3b30' : '#3b82ff';
      ctx.beginPath();
      ctx.arc(mx, mz, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player: a white arrow that rotates with the heading.
    const [px, pz] = toMap(state.player.x, state.player.z);
    ctx.save();
    ctx.translate(px, pz);
    ctx.rotate(state.player.heading);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5.5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5.5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
