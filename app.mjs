import { PRESETS } from "./sim-core.mjs";

const arena = document.getElementById("arena");
const arenaCtx = arena.getContext("2d");
const historyCanvas = document.getElementById("history");
const historyCtx = historyCanvas.getContext("2d");
const deathCanvas = document.getElementById("deathChart");
const deathCtx = deathCanvas.getContext("2d");
const traitCanvas = document.getElementById("traitChart");
const traitCtx = traitCanvas.getContext("2d");
const phyloCanvas = document.getElementById("phylo");
const phyloCtx = phyloCanvas.getContext("2d");
const duelCanvas = document.getElementById("arenaDuel");
const duelCtx = duelCanvas.getContext("2d");

const tickLabel = document.getElementById("tickLabel");
const eventRate = document.getElementById("eventRate");
const domFamily = document.getElementById("domFamily");
const statsNode = document.getElementById("stats");
const eventsNode = document.getElementById("events");
const replaySlider = document.getElementById("replaySlider");
const duelStatus = document.getElementById("duelStatus");

const toggleRunBtn = document.getElementById("toggleRun");
const stepOnceBtn = document.getElementById("stepOnce");
const burstBtn = document.getElementById("burst");
const saveStateBtn = document.getElementById("saveState");
const loadStateInput = document.getElementById("loadState");
const presetSelect = document.getElementById("presetSelect");
const seedInput = document.getElementById("seedInput");
const batchInput = document.getElementById("batchInput");
const mutationInput = document.getElementById("mutationInput");
const parasiteInput = document.getElementById("parasiteInput");
const coopInput = document.getElementById("coopInput");
const catInput = document.getElementById("catInput");
const memInput = document.getElementById("memInput");
const applyConfigBtn = document.getElementById("applyConfig");
const resetWorldBtn = document.getElementById("resetWorld");
const duelStartBtn = document.getElementById("duelStart");
const duelStopBtn = document.getElementById("duelStop");

let world = null;
let duelWorld = null;
let running = true;
let showHeatmap = false;
let replayFrames = [];
let replayMode = false;

function hsl(hash, energy, mode) {
  let hue = hash % 360;
  if (mode === "parasite") hue = 325;
  if (mode === "cooperative") hue = 187;
  const light = Math.max(28, Math.min(74, Math.floor(30 + energy * 0.8)));
  return `hsl(${hue} 74% ${light}%)`;
}

function spawnWorker(seed = Number(seedInput.value) || 42) {
  if (world) world.terminate();
  world = new Worker("./sim-worker.mjs", { type: "module" });
  world.onmessage = onWorldMessage;
  world.postMessage({
    type: "init",
    payload: {
      seed,
      batch: Number(batchInput.value),
      config: {
        mutationChance: Number(mutationInput.value),
        parasiteChance: Number(parasiteInput.value),
        coopChance: Number(coopInput.value),
        catastropheChance: Number(catInput.value),
        memoryMultiplier: Number(memInput.value),
      },
    },
  });
}

function spawnDuel(seed = 1337) {
  if (duelWorld) duelWorld.terminate();
  duelWorld = new Worker("./sim-worker.mjs", { type: "module" });
  duelWorld.onmessage = onDuelMessage;
  duelWorld.postMessage({
    type: "init",
    payload: {
      seed,
      batch: 3,
      config: {
        mutationChance: 0.065,
        parasiteChance: 0.008,
        coopChance: 0.004,
        catastropheChance: 0.002,
        memoryMultiplier: 0.72,
      },
    },
  });
}

function drawArena(snapshot, ctx, canvas, options = {}) {
  if (!snapshot) return;
  const w = snapshot.config.width;
  const h = snapshot.config.height;
  const cell = Math.min(canvas.width / w, canvas.height / h);

  ctx.fillStyle = "rgba(6,17,24,0.9)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (showHeatmap && snapshot.baseResource && snapshot.biomes && !options.disableHeatmap) {
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const idx = y * w + x;
        const v = snapshot.baseResource[idx] || 0;
        const b = snapshot.biomes[idx] || 0;
        const hue = b === 0 ? 34 : b === 2 ? 302 : 97;
        ctx.fillStyle = `hsla(${hue} 70% 55% / ${Math.min(0.34, v * 0.22)})`;
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
  }

  // Отрисовка феромонов
  if (snapshot.pheromones) {
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const p = snapshot.pheromones[y * w + x];
        if (p > 0.05) {
          ctx.fillStyle = `rgba(168, 115, 255, ${Math.min(0.4, p * 0.12)})`;
          ctx.fillRect(x * cell, y * cell, cell, cell);
        }
      }
    }
  }

  // Отрисовка вирусов
  if (snapshot.viruses) {
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#ff0000";
    ctx.lineWidth = 1;
    for (let i = 0; i < snapshot.viruses.length; i++) {
      const v = snapshot.viruses[i];
      ctx.beginPath();
      // Вирусы стали чуть крупнее и с обводкой
      ctx.arc(v.x * cell + cell / 2, v.y * cell + cell / 2, cell / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  for (let i = 0; i < snapshot.organisms.length; i += 1) {
    const o = snapshot.organisms[i];
    ctx.fillStyle = hsl(o.colorHash, o.energy, o.mode);
    ctx.fillRect(o.x * cell + 0.7, o.y * cell + 0.7, cell - 1.4, cell - 1.4);
  }
}

function drawHistory(snapshot) {
  const history = snapshot.history || [];
  historyCtx.clearRect(0, 0, historyCanvas.width, historyCanvas.height);
  historyCtx.fillStyle = "rgba(8, 20, 29, 0.9)";
  historyCtx.fillRect(0, 0, historyCanvas.width, historyCanvas.height);
  if (history.length < 2) return;

  const maxPop = Math.max(1, ...history.map((x) => x.population));
  const maxMem = Math.max(1, snapshot.memoryLimit || 1);

  const drawLine = (fn, max, color) => {
    historyCtx.beginPath();
    historyCtx.strokeStyle = color;
    historyCtx.lineWidth = 2;
    history.forEach((point, i) => {
      const x = (i / Math.max(1, history.length - 1)) * historyCanvas.width;
      const y = historyCanvas.height - (fn(point) / max) * historyCanvas.height;
      if (i === 0) historyCtx.moveTo(x, y);
      else historyCtx.lineTo(x, y);
    });
    historyCtx.stroke();
  };

  drawLine((p) => p.population, maxPop, "#62efb3");
  drawLine((p) => p.parasites, maxPop, "#ff5fb8");
  drawLine((p) => p.cooperative, maxPop, "#7df6ff");
  drawLine((p) => p.memory, maxMem, "#ffbe5c");
}

function drawDeathChart(snapshot) {
  deathCtx.clearRect(0, 0, deathCanvas.width, deathCanvas.height);
  deathCtx.fillStyle = "rgba(8, 20, 29, 0.9)";
  deathCtx.fillRect(0, 0, deathCanvas.width, deathCanvas.height);

  const causes = snapshot.deathCauses || {};
  const entries = Object.entries(causes);
  const total = entries.reduce((s, [, n]) => s + n, 0) || 1;

  const colors = {
    starvation: "#ff7f6e", // Голод
    aging: "#7fb7ff",      // Старость
    attack: "#ff5fb8",     // Атака
    memory: "#ffbe5c",     // Память
    catastrophe: "#d2d2d2", // Катаклизм
  };

  const labels = {
    starvation: "Голод",
    aging: "Старость",
    attack: "Атака",
    memory: "Память",
    catastrophe: "Крах",
  };

  const barW = deathCanvas.width / Math.max(entries.length, 1);
  entries.forEach(([key, val], idx) => {
    const h = ((val || 0) / total) * (deathCanvas.height - 35);
    const x = idx * barW + 8;
    const y = deathCanvas.height - h - 20;
    deathCtx.fillStyle = colors[key] || "#9fd4ff";
    deathCtx.fillRect(x, y, barW - 14, h);
    deathCtx.fillStyle = "#d5efff";
    deathCtx.font = "11px Manrope";
    deathCtx.fillText(labels[key] || key, x, deathCanvas.height - 6);
  });
}

function drawTraitScatter(snapshot) {
  traitCtx.clearRect(0, 0, traitCanvas.width, traitCanvas.height);
  traitCtx.fillStyle = "rgba(8,20,29,0.9)";
  traitCtx.fillRect(0, 0, traitCanvas.width, traitCanvas.height);

  traitCtx.strokeStyle = "rgba(151,205,232,0.2)";
  traitCtx.strokeRect(20, 10, traitCanvas.width - 35, traitCanvas.height - 30);

  const pts = snapshot.organisms;
  for (let i = 0; i < pts.length; i += 1) {
    const o = pts[i];
    const x = 20 + o.aggression * (traitCanvas.width - 40);
    const y = traitCanvas.height - 20 - o.fertility * (traitCanvas.height - 35);
    traitCtx.fillStyle = o.mode === "parasite" ? "#ff5fb8" : o.mode === "cooperative" ? "#7df6ff" : "#65ebb0";
    traitCtx.fillRect(x, y, 2, 2);
  }
}

function drawPhylo(snapshot) {
  phyloCtx.clearRect(0, 0, phyloCanvas.width, phyloCanvas.height);
  phyloCtx.fillStyle = "rgba(8,20,29,0.9)";
  phyloCtx.fillRect(0, 0, phyloCanvas.width, phyloCanvas.height);

  const edges = (snapshot.speciesEdges || []).slice(-60);
  if (!edges.length) {
    phyloCtx.fillStyle = "#9fc7da";
    phyloCtx.fillText("Пока нет заметного ветвления видов", 12, 20);
    return;
  }

  const nodes = new Map();
  for (let i = 0; i < edges.length; i += 1) {
    nodes.set(edges[i].from, 1);
    nodes.set(edges[i].to, 1);
  }
  const list = [...nodes.keys()].slice(0, 16);
  const pos = new Map();
  list.forEach((s, i) => {
    pos.set(s, {
      x: 20 + (i % 4) * 98,
      y: 20 + Math.floor(i / 4) * 38,
    });
  });

  phyloCtx.strokeStyle = "rgba(130,220,252,0.35)";
  for (let i = 0; i < edges.length; i += 1) {
    const e = edges[i];
    const a = pos.get(e.from);
    const b = pos.get(e.to);
    if (!a || !b) continue;
    phyloCtx.beginPath();
    phyloCtx.moveTo(a.x, a.y);
    phyloCtx.lineTo(b.x, b.y);
    phyloCtx.stroke();
  }

  list.forEach((name) => {
    const p = pos.get(name);
    phyloCtx.fillStyle = "#7df6ff";
    phyloCtx.fillRect(p.x - 3, p.y - 3, 6, 6);
    phyloCtx.fillStyle = "#e4f9ff";
    phyloCtx.font = "10px Manrope";
    phyloCtx.fillText(name, p.x + 4, p.y - 3);
  });
}

function renderStats(snapshot) {
  const dominant = snapshot.topFamilies?.[0] || ["-", 0];
  const avgGenome = snapshot.organisms.length
    ? (snapshot.organisms.reduce((s, o) => s + o.size, 0) / snapshot.organisms.length).toFixed(1)
    : "0";

  const rows = [
    ["Популяция", snapshot.population],
    ["Память", `${snapshot.memory} / ${snapshot.memoryLimit}`],
    ["Средний геном", `${avgGenome} байт`],
    ["Шанс мутации", `${(snapshot.mutationChance * 100).toFixed(2)}%`],
    ["Топ-клан", `${dominant[0]} (${dominant[1]})`],
    ["Рендер организмов", snapshot.organisms.length],
  ];

  statsNode.innerHTML = rows
    .map(([a, b]) => `<div class="stat-row"><span>${a}</span><strong>${b}</strong></div>`)
    .join("");

  tickLabel.textContent = `тик ${snapshot.tick}`;
  eventRate.textContent = `${snapshot.eventRate || 0} / мин`;
  domFamily.textContent = `клан: ${dominant[0]}`;
}

function renderEvents(snapshot) {
  eventsNode.innerHTML = (snapshot.events || [])
    .map((e) => `<li><b>[${e.tick}]</b> ${e.text}</li>`)
    .join("");
}

function renderWorldLog(snapshot) {
  const logNode = document.getElementById("worldLog");
  if (!logNode) return;

  const currentDom = snapshot.topFamilies?.[0];
  let html = "";

  // Сначала показываем текущую империю
  if (currentDom) {
    html += `
      <div class="log-entry active">
        <div class="log-title">Текущая эра: ${currentDom[0]}</div>
        <div class="log-details">Правление в разгаре | Мощь: ${currentDom[1]}</div>
      </div>
    `;
  }

  // Затем список павших империй
  if (snapshot.worldLog && snapshot.worldLog.length > 0) {
    html += snapshot.worldLog
      .map(
        (entry) => `
      <div class="log-entry">
        <div class="log-title">Эра ${entry.name}</div>
        <div class="log-details">Закат на тике ${entry.endTick} | Пик мощи: ${entry.peak}</div>
      </div>
    `
      )
      .join("");
  } else if (!currentDom) {
    html = '<div class="tiny">История пока не написана...</div>';
  }

  logNode.innerHTML = html;
}

function pushReplay(snapshot) {
  const wasAtEnd = Math.abs(Number(replaySlider.value) - Number(replaySlider.max)) < 0.1;
  replayFrames.push(snapshot);
  if (replayFrames.length > 300) replayFrames.shift();
  replaySlider.max = String(Math.max(0, replayFrames.length - 1));
  if (wasAtEnd && !replayMode) {
    replaySlider.value = replaySlider.max;
  }
}

function renderSnapshot(snapshot) {
  drawArena(snapshot, arenaCtx, arena);
  drawHistory(snapshot);
  drawDeathChart(snapshot);
  drawTraitScatter(snapshot);
  drawPhylo(snapshot);
  renderStats(snapshot);
  renderEvents(snapshot);
  renderWorldLog(snapshot);
}

function onWorldMessage(event) {
  const { type, snapshot, data, running: runState } = event.data || {};
  if (type === "snapshot") {
    if (!replayMode) renderSnapshot(snapshot);
    pushReplay(snapshot);
  }

  if (type === "saved") {
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `digital-life-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  if (type === "status") {
    running = runState;
    toggleRunBtn.textContent = running ? "Пауза" : "Продолжить";
  }
}

function onDuelMessage(event) {
  const { type, snapshot } = event.data || {};
  if (type !== "snapshot") return;
  drawArena(snapshot, duelCtx, duelCanvas, { disableHeatmap: true });

  const mainSnap = replayFrames[replayFrames.length - 1];
  const mainPop = mainSnap ? mainSnap.population : 0;
  const duelPop = snapshot.population || 0;
  const winner = mainPop === duelPop ? "равенство" : mainPop > duelPop ? "основной мир" : "дуэльный мир";
  duelStatus.textContent = `основной: ${mainPop}, дуэльный: ${duelPop} | лидирует: ${winner}`;
}

function bindControls() {
  toggleRunBtn.addEventListener("click", () => {
    world.postMessage({ type: "toggle" });
  });

  stepOnceBtn.addEventListener("click", () => {
    world.postMessage({ type: "step", payload: { ticks: 1 } });
  });

  burstBtn.addEventListener("click", () => {
    world.postMessage({ type: "burst", payload: { amount: 0.14 } });
  });

  saveStateBtn.addEventListener("click", () => {
    world.postMessage({ type: "save" });
  });

  loadStateInput.addEventListener("change", async (ev) => {
    const file = ev.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const data = JSON.parse(text);
    world.postMessage({ type: "load", payload: { data } });
  });

  presetSelect.addEventListener("change", () => {
    const key = presetSelect.value;
    const p = PRESETS[key] || PRESETS.balanced;
    mutationInput.value = p.mutationChance;
    parasiteInput.value = p.parasiteChance;
    coopInput.value = p.coopChance;
    catInput.value = p.catastropheChance;
    memInput.value = p.memoryMultiplier;
    world.postMessage({ type: "preset", payload: { name: key } });
  });

  batchInput.addEventListener("input", () => {
    world.postMessage({ type: "set_batch", payload: { batch: Number(batchInput.value) } });
  });

  applyConfigBtn.addEventListener("click", () => {
    world.postMessage({
      type: "patch_config",
      payload: {
        mutationChance: Number(mutationInput.value),
        parasiteChance: Number(parasiteInput.value),
        coopChance: Number(coopInput.value),
        catastropheChance: Number(catInput.value),
        memoryMultiplier: Number(memInput.value),
      },
    });
  });

  resetWorldBtn.addEventListener("click", () => {
    replayFrames = [];
    replayMode = false;
    if (duelWorld) {
      duelWorld.terminate();
      duelWorld = null;
      duelStatus.textContent = "дуэль прервана";
    }
    world.postMessage({
      type: "reset",
      payload: {
        seed: Number(seedInput.value) || Date.now(),
        config: {
          mutationChance: Number(mutationInput.value),
          parasiteChance: Number(parasiteInput.value),
          coopChance: Number(coopInput.value),
          catastropheChance: Number(catInput.value),
          memoryMultiplier: Number(memInput.value),
        },
      },
    });
  });

  replaySlider.addEventListener("input", () => {
    const idx = Number(replaySlider.value);
    if (!replayFrames[idx]) return;
    replayMode = idx < replayFrames.length - 1;
    renderSnapshot(replayFrames[idx]);
  });

  duelStartBtn.addEventListener("click", () => {
    spawnDuel(Number(seedInput.value) + 99);
    duelStatus.textContent = "дуэль запущена";
  });

  duelStopBtn.addEventListener("click", () => {
    if (duelWorld) {
      duelWorld.terminate();
      duelWorld = null;
      duelCtx.clearRect(0, 0, duelCanvas.width, duelCanvas.height);
      duelStatus.textContent = "дуэль остановлена";
    }
  });

  window.addEventListener("keydown", (ev) => {
    if (ev.key.toLowerCase() === "h") {
      showHeatmap = !showHeatmap;
      if (replayFrames.length) renderSnapshot(replayFrames[replayFrames.length - 1]);
    }
  });
}

spawnWorker(Number(seedInput.value) || 42);
bindControls();
