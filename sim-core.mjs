export const PRESETS = {
  balanced: {
    name: "Сбалансированный",
    mutationChance: 0.05,
    parasiteChance: 0.003,
    coopChance: 0.005,
    catastropheChance: 0.0016,
    foodPulse: 1,
    memoryMultiplier: 0.82,
  },
  parasite_world: {
    name: "Мир паразитов",
    mutationChance: 0.07,
    parasiteChance: 0.011,
    coopChance: 0.002,
    catastropheChance: 0.002,
    foodPulse: 0.95,
    memoryMultiplier: 0.78,
  },
  cooperation_world: {
    name: "Мир кооперации",
    mutationChance: 0.045,
    parasiteChance: 0.001,
    coopChance: 0.016,
    catastropheChance: 0.0013,
    foodPulse: 1.08,
    memoryMultiplier: 0.86,
  },
  memory_crunch: {
    name: "Жесткий дефицит памяти",
    mutationChance: 0.055,
    parasiteChance: 0.004,
    coopChance: 0.004,
    catastropheChance: 0.003,
    foodPulse: 0.82,
    memoryMultiplier: 0.56,
  },
};

const DEFAULT_CONFIG = {
  width: 96,
  height: 48,
  initialOrganisms: 220,
  maxGenome: 72,
  minGenome: 6,
  memoryMultiplier: 0.82,
  mutationChance: 0.05,
  parasiteChance: 0.003,
  coopChance: 0.005,
  catastropheChance: 0.0016,
  foodPulse: 1,
  maxPopulationHint: 10000,
  seasonalSpeed: 0.02,
  instructionsPerTick: 3,
  hgtChance: 0.02,
  historySize: 300,
};

export function mergeConfig(base = {}, presetName = "balanced", custom = {}) {
  const preset = PRESETS[presetName] || PRESETS.balanced;
  return { ...DEFAULT_CONFIG, ...base, ...preset, ...custom };
}

export function mulberry32(seed) {
  let t = seed >>> 0;
  return function rng() {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function ri(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function hashGenome(genome) {
  let h = 2166136261;
  for (let i = 0; i < genome.length; i += 1) {
    h ^= genome[i];
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function copyGenome(genome) {
  return Uint8Array.from(genome);
}

function familyFromHash(hash, orgTraits = null) {
  if (!orgTraits) return String.fromCharCode(65 + (hash % 26));

  const adjList =
    orgTraits.aggression > 0.66
      ? ["Яростные", "Хищные", "Острые", "Кровавые", "Грозные"]
      : orgTraits.metabolism > 1.3
        ? ["Быстрые", "Резвые", "Летучие", "Шустрые", "Импульсивные"]
        : orgTraits.fertility > 0.9
          ? ["Многочисленные", "Густые", "Вечные", "Плодовитые", "Роящиеся"]
          : ["Стихийные", "Мягкие", "Туманные", "Тихие", "Древние"];

  const nounList =
    orgTraits.mode === "parasite"
      ? ["Пожиратели", "Вурдалаки", "Тени", "Клещи", "Вирусы"]
      : orgTraits.mode === "cooperative"
        ? ["Артели", "Узлы", "Связи", "Строители", "Ткачи"]
        : ["Бродяги", "Искры", "Оболочки", "Странники", "Жители"];

  const a = adjList[Math.abs(hash) % adjList.length];
  const n = nounList[Math.abs(hash >>> 8) % nounList.length];
  return `${a} ${n}`;
}

function speciesFromGenome(genome) {
  const h = hashGenome(genome);
  return `S${(h >>> 0).toString(36).slice(0, 5)}`;
}

function makeBiomeMap(config, rng) {
  const size = config.width * config.height;
  const biomes = new Uint8Array(size);
  const baseResource = new Float32Array(size);

  for (let y = 0; y < config.height; y += 1) {
    for (let x = 0; x < config.width; x += 1) {
      const idx = y * config.width + x;
      const n =
        (Math.sin(x * 0.12 + rng() * 0.4) +
          Math.cos(y * 0.09 + rng() * 0.4) +
          Math.sin((x + y) * 0.05 + rng() * 0.2)) /
        3;
      if (n < -0.2) {
        biomes[idx] = 0;
        baseResource[idx] = 0.35;
      } else if (n > 0.28) {
        biomes[idx] = 2;
        baseResource[idx] = 0.62;
      } else {
        biomes[idx] = 1;
        baseResource[idx] = 0.95;
      }
    }
  }

  return { biomes, baseResource };
}

function randomGenome(config, rng) {
  const length = ri(rng, config.minGenome, 34);
  const g = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) g[i] = ri(rng, 0, 255);
  return g;
}

function randomMode(byte) {
  const v = byte / 255;
  if (v < 0.08) return "parasite";
  if (v > 0.91) return "cooperative";
  return "normal";
}

function makeOrganism(state, x, y, genome, parent = null, forcedMode = null) {
  const h = hashGenome(genome);
  const mode = forcedMode || randomMode(genome[3] || 127);
  const organism = {
    id: ++state.nextId,
    x,
    y,
    genome,
    ip: 0,
    size: genome.length,
    family: familyFromHash(h),
    species: speciesFromGenome(genome),
    energy: parent ? Math.max(9, Math.round(parent.energy * 0.44)) : ri(state.rng, 22, 52),
    age: 0,
    metabolism: 0.5 + (genome[0] / 255) * 1.35,
    fertility: 0.22 + (genome[1] / 255) * 1.2,
    aggression: genome[2] / 255,
    mode,
    alive: true,
    parentId: parent ? parent.id : null,
    parentSpecies: parent ? parent.species : null,
    deathCause: null,
  };

  organism.family = familyFromHash(h, {
    aggression: organism.aggression,
    metabolism: organism.metabolism,
    fertility: organism.fertility,
    mode: organism.mode,
  });
  organism.species = speciesFromGenome(genome);

  if (parent && parent.species !== organism.species) {
    state.speciesEdges.push({
      from: parent.species,
      to: organism.species,
      tick: state.tick,
    });
    if (state.speciesEdges.length > 500) state.speciesEdges.shift();
  }

  return organism;
}

function mutateGenome(state, source, force = false) {
  const g = copyGenome(source);
  const chance = state.config.mutationChance + state.mutationBoost;
  let mutated = false;

  for (let i = 0; i < g.length; i += 1) {
    if (state.rng() < chance || (force && state.rng() < 0.12)) {
      g[i] = (g[i] + ri(state.rng, -56, 56) + 256) % 256;
      mutated = true;
    }
  }

  if (state.rng() < chance * 0.22 || (force && state.rng() < 0.25)) {
    if (state.rng() < 0.5 && g.length > state.config.minGenome) {
      const cut = ri(state.rng, 0, g.length - 1);
      const next = new Uint8Array(g.length - 1);
      next.set(g.subarray(0, cut));
      next.set(g.subarray(cut + 1), cut);
      return { genome: next, mutated: true };
    }
    if (g.length < state.config.maxGenome) {
      const ins = ri(state.rng, 0, g.length);
      const next = new Uint8Array(g.length + 1);
      next.set(g.subarray(0, ins));
      next[ins] = ri(state.rng, 0, 255);
      next.set(g.subarray(ins), ins + 1);
      return { genome: next, mutated: true };
    }
  }

  return { genome: g, mutated };
}

function mapKey(state, x, y) {
  return y * state.config.width + x;
}

function seasonFactor(state) {
  return 0.5 + 0.5 * (Math.sin(state.tick * state.config.seasonalSpeed) + 1) / 2;
}

function biomePenalty(biomeId) {
  if (biomeId === 0) return 0.94;
  if (biomeId === 2) return 0.75;
  return 1;
}

function addEvent(state, type, text) {
  state.events.unshift({ tick: state.tick, type, text });
  if (state.events.length > 26) state.events.pop();
  state.eventWindow.push(state.tick);
  const lower = state.tick - 360;
  while (state.eventWindow.length && state.eventWindow[0] < lower) state.eventWindow.shift();
}

function totalMemory(state) {
  let sum = 0;
  for (let i = 0; i < state.organisms.length; i += 1) sum += state.organisms[i].size;
  return sum;
}

function placeInitialPopulation(state) {
  const occupied = new Set();
  while (state.organisms.length < state.config.initialOrganisms) {
    const x = ri(state.rng, 0, state.config.width - 1);
    const y = ri(state.rng, 0, state.config.height - 1);
    const key = mapKey(state, x, y);
    if (occupied.has(key)) continue;

    const org = makeOrganism(state, x, y, randomGenome(state.config, state.rng));
    if (totalMemory(state) + org.size > state.memoryLimit) break;

    state.organisms.push(org);
    occupied.add(key);
  }
  addEvent(state, "system", `Стартовая популяция: ${state.organisms.length}`);
}

export function createWorld(config = {}, seed = Date.now()) {
  const cfg = mergeConfig({}, "balanced", config);
  const rng = mulberry32(seed >>> 0);
  const state = {
    config: cfg,
    seed: seed >>> 0,
    rng,
    tick: 0,
    nextId: 0,
    organisms: [],
    events: [],
    eventWindow: [],
    history: [],
    worldLog: [], // История великих кланов
    lastDominant: null,
    domStartTick: 0,
    deathCauses: { starvation: 0, aging: 0, attack: 0, memory: 0, catastrophe: 0 },
    mutationBoost: 0,
    speciesEdges: [],
    memoryLimit: Math.floor(cfg.width * cfg.height * cfg.memoryMultiplier),
    pheromones: new Float32Array(cfg.width * cfg.height),
    viruses: [],
    ...makeBiomeMap(cfg, rng),
  };
  placeInitialPopulation(state);
  collectHistory(state);
  return state;
}

function chooseMove(state, org) {
  const dx = ri(state.rng, -1, 1);
  const dy = ri(state.rng, -1, 1);
  return {
    x: clamp(org.x + dx, 0, state.config.width - 1),
    y: clamp(org.y + dy, 0, state.config.height - 1),
  };
}

function getNeighbor(state, map, x, y, offset) {
  const pos = mapKey(state, x, y) + offset;
  return map.get(pos);
}

function isCompatible(org, other) {
  return org.family === other.family;
}

function applyHGT(state, org, other) {
  if (!other || other === org || state.rng() > state.config.hgtChance) return;
  if (org.mode === "parasite" && other.mode === "normal" && state.rng() < 0.5) return;

  const a = copyGenome(org.genome);
  const b = other.genome;
  if (!a.length || !b.length) return;

  const from = ri(state.rng, 0, b.length - 1);
  const to = clamp(from + ri(state.rng, 1, Math.max(1, Math.floor(b.length * 0.18))), 0, b.length);
  const insert = ri(state.rng, 0, a.length - 1);

  let k = 0;
  for (let i = from; i < to; i += 1) {
    if (insert + k >= a.length) break;
    a[insert + k] = b[i];
    k += 1;
  }

  org.genome = a;
  org.size = a.length;
  org.species = speciesFromGenome(a);
  org.family = familyFromHash(hashGenome(a));
  org.metabolism = 0.5 + (a[0] / 255) * 1.35;
  org.fertility = 0.22 + (a[1] / 255) * 1.2;
  org.aggression = a[2] / 255;
  if (state.rng() < 0.02) addEvent(state, "hgt", `Горизонтальный перенос: ${other.family} -> ${org.family}`);
}

function doInteraction(state, org, other) {
  if (!other || !other.alive || !org.alive) return;

  if (org.mode === "parasite") {
    const drain = Math.min(other.energy, 1.4 + org.aggression * 6.8);
    other.energy -= drain;
    org.energy += drain;
    if (drain > 0 && state.rng() < 0.009) addEvent(state, "parasite", `Паразитизм ${org.family} против ${other.family}`);
    return;
  }

  if (org.mode === "cooperative" && isCompatible(org, other) && org.energy > 18) {
    const give = Math.max(0.4, org.energy * 0.04);
    org.energy -= give;
    other.energy += give;
    if (state.rng() < 0.006) addEvent(state, "coop", `Кооперация внутри клана ${org.family}`);
    return;
  }

  if (org.aggression > 0.72 && !isCompatible(org, other) && org.energy > other.energy) {
    const steal = Math.min(other.energy, 1.1 + org.aggression * 5.9);
    org.energy += steal;
    other.energy -= steal;
    if (other.energy <= 0) other.deathCause = "attack";
  }
}

function updatePheromones(state) {
  const w = state.config.width;
  const h = state.config.height;
  const next = new Float32Array(state.pheromones.length);
  const decay = 0.94; // Испарение
  const spread = 0.04; // Диффузия

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      const val = state.pheromones[idx];
      if (val < 0.01) continue;

      const distributed = val * spread;
      const remaining = val * decay - distributed;
      next[idx] += remaining;

      const neighbors = [
        [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]
      ];
      const part = distributed / neighbors.length;
      for (const [nx, ny] of neighbors) {
        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
          next[ny * w + nx] += part;
        }
      }
    }
  }
  state.pheromones = next;
}

function executeOpcode(state, org, map, occupied) {
  const code = org.genome[org.ip % org.genome.length] % 12; // Увеличиваем диапазон опкодов
  org.ip = (org.ip + 1) % org.genome.length;

  if (code === 0) {
    const mv = chooseMove(state, org);
    const old = mapKey(state, org.x, org.y);
    const next = mapKey(state, mv.x, mv.y);
    if (!occupied.has(next) || next === old) {
      occupied.delete(old);
      map.delete(old);
      org.x = mv.x;
      org.y = mv.y;
      occupied.add(next);
      map.set(next, org);
    }
  } else if (code === 1) {
    let bestX = org.x;
    let bestY = org.y;
    let bestRes = -1;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = clamp(org.x + dx, 0, state.config.width - 1);
        const ny = clamp(org.y + dy, 0, state.config.height - 1);
        const res = state.baseResource[mapKey(state, nx, ny)];
        if (res > bestRes) {
          bestRes = res;
          bestX = nx;
          bestY = ny;
        }
      }
    }
    const old = mapKey(state, org.x, org.y);
    const next = mapKey(state, bestX, bestY);
    if (!occupied.has(next) || next === old) {
      occupied.delete(old);
      map.delete(old);
      org.x = bestX;
      org.y = bestY;
      occupied.add(next);
      map.set(next, org);
    }
  } else if (code === 2) {
    const idx = mapKey(state, org.x, org.y);
    const sf = seasonFactor(state);
    const val = state.baseResource[idx] * sf * state.config.foodPulse;
    org.energy += val * 1.4;
  } else if (code === 3) {
    const offsets = [-1, 1, -state.config.width, state.config.width];
    const target = getNeighbor(state, map, org.x, org.y, offsets[ri(state.rng, 0, offsets.length - 1)]);
    if (target) doInteraction(state, org, target);
  } else if (code === 4) {
    const offsets = [-1, 1, -state.config.width, state.config.width];
    const target = getNeighbor(state, map, org.x, org.y, offsets[ri(state.rng, 0, offsets.length - 1)]);
    if (target && target.family === org.family && org.energy > 15) {
      const share = org.energy * 0.03;
      org.energy -= share;
      target.energy += share;
    }
  } else if (code === 5) {
    // Поиск феромонов (Sense)
    let bestX = org.x;
    let bestY = org.y;
    let bestP = state.pheromones[mapKey(state, org.x, org.y)];
    const radius = 2;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = clamp(org.x + dx, 0, state.config.width - 1);
        const ny = clamp(org.y + dy, 0, state.config.height - 1);
        const p = state.pheromones[mapKey(state, nx, ny)];
        if (p > bestP) {
          bestP = p;
          bestX = nx;
          bestY = ny;
        }
      }
    }
    const old = mapKey(state, org.x, org.y);
    const next = mapKey(state, bestX, bestY);
    if (!occupied.has(next) || next === old) {
      occupied.delete(old);
      map.delete(old);
      org.x = bestX;
      org.y = bestY;
      occupied.add(next);
      map.set(next, org);
    }
  } else if (code === 6) {
    if (state.rng() < 0.04) {
      const out = mutateGenome(state, org.genome, true);
      org.genome = out.genome;
      org.size = out.genome.length;
      org.species = speciesFromGenome(org.genome);
      org.family = familyFromHash(hashGenome(org.genome));
      if (out.mutated && state.rng() < 0.02) addEvent(state, "mutation", `Самомутация в ${org.family}`);
    }
  } else if (code === 7) {
    // Выделение феромона (Emit)
    const idx = mapKey(state, org.x, org.y);
    state.pheromones[idx] = Math.min(10, state.pheromones[idx] + 2.5);
    org.energy -= 0.15;
  } else if (code === 10) {
    // Вирусная репликация (Viral Replication)
    if (org.energy > 8) {
      org.energy -= 4.5;
      state.viruses.push({
        x: org.x,
        y: org.y,
        genome: new Uint8Array([10, ri(state.rng, 0, 255), ri(state.rng, 0, 255)]), // Вирусный ген
        life: 180
      });
      if (state.rng() < 0.05) addEvent(state, "virus", `Вирус реплицирован кланом ${org.family}`);
    }
  } else {
    org.energy += 0.12;
  }
}

function reproduce(state, org, occupied) {
  if (org.energy < 24) return;
  if (state.rng() > 0.025 + org.fertility * 0.05) return;
  if (state.organisms.length > state.config.maxPopulationHint) return;

  const dirs = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
    [1, -1],
    [-1, 1],
  ];

  for (let i = dirs.length - 1; i > 0; i -= 1) {
    const j = ri(state.rng, 0, i);
    [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
  }

  for (let i = 0; i < dirs.length; i += 1) {
    const nx = clamp(org.x + dirs[i][0], 0, state.config.width - 1);
    const ny = clamp(org.y + dirs[i][1], 0, state.config.height - 1);
    const key = mapKey(state, nx, ny);
    if (occupied.has(key)) continue;

    const out = mutateGenome(state, org.genome);
    const childMode = out.mutated && state.rng() < 0.13
      ? (state.rng() < 0.5 ? "parasite" : "cooperative")
      : org.mode;
    const child = makeOrganism(state, nx, ny, out.genome, org, childMode);

    if (totalMemory(state) + child.size > state.memoryLimit) return;

    org.energy = Math.max(8, org.energy * 0.56);
    state.organisms.push(child);
    occupied.add(key);
    if (out.mutated && state.rng() < 0.03) addEvent(state, "mutation", `Новый вариант: ${child.species}`);
    return;
  }
}

function applySystemEvents(state) {
  if (state.rng() < state.config.parasiteChance && state.organisms.length) {
    const target = state.organisms[ri(state.rng, 0, state.organisms.length - 1)];
    target.mode = "parasite";
    target.energy += 5;
    addEvent(state, "parasite", `Спонтанный паразит в ${target.family}`);
  }

  if (state.rng() < state.config.coopChance && state.organisms.length) {
    const target = state.organisms[ri(state.rng, 0, state.organisms.length - 1)];
    target.mode = "cooperative";
    addEvent(state, "coop", `Кооперативный сигнал в ${target.family}`);
  }

  if (state.organisms.length > 25 && state.rng() < state.config.catastropheChance) {
    const kill = 0.22 + state.rng() * 0.42;
    let lost = 0;
    const survivors = [];
    for (let i = 0; i < state.organisms.length; i += 1) {
      if (state.rng() > kill) survivors.push(state.organisms[i]);
      else {
        state.deathCauses.catastrophe += 1;
        lost += 1;
      }
    }
    state.organisms = survivors;
    addEvent(state, "extinct", `Вымирание: -${lost}`);
  }

  if (state.rng() < 0.0018) { // Спонтанный вирус
    state.viruses.push({
      x: ri(state.rng, 0, state.config.width - 1),
      y: ri(state.rng, 0, state.config.height - 1),
      genome: new Uint8Array([10, 0, 0]),
      life: 250
    });
    addEvent(state, "virus", "Обнаружена вирусная аномалия");
  }

  if (state.mutationBoost > 0) state.mutationBoost = Math.max(0, state.mutationBoost - 0.0005);
}

function updateViruses(state, occupied) {
  for (let i = state.viruses.length - 1; i >= 0; i--) {
    const v = state.viruses[i];
    v.life--;
    if (v.life <= 0) {
      state.viruses.splice(i, 1);
      continue;
    }

    // Случайное движение вируса
    if (state.rng() < 0.6) {
      v.x = clamp(v.x + ri(state.rng, -1, 1), 0, state.config.width - 1);
      v.y = clamp(v.y + ri(state.rng, -1, 1), 0, state.config.height - 1);
    }

    // Поиск жертвы (инфекция)
    for (let j = 0; j < state.organisms.length; j++) {
      const org = state.organisms[j];
      if (org.x === v.x && org.y === v.y) {
        // Инфекция: встраиваем вирусный код
        const newGenome = new Uint8Array(org.genome.length + 1);
        const pos = org.ip % org.genome.length;
        newGenome.set(org.genome.subarray(0, pos));
        newGenome[pos] = 10; // Инструкция репликации
        newGenome.set(org.genome.subarray(pos), pos + 1);
        org.genome = newGenome;
        org.size = newGenome.length;
        if (state.rng() < 0.02) addEvent(state, "virus", `Заражение: ${org.family}`);
        state.viruses.splice(i, 1);
        break;
      }
    }
  }
}

function enforceMemory(state) {
  let over = totalMemory(state) - state.memoryLimit;
  if (over <= 0) return;

  state.organisms.sort((a, b) => a.energy + a.age * 0.18 - (b.energy + b.age * 0.18));
  let removed = 0;
  while (over > 0 && state.organisms.length > 5) {
    const x = state.organisms.shift();
    over -= x.size;
    removed += 1;
    state.deathCauses.memory += 1;
  }
  if (removed > 0) addEvent(state, "extinct", `Давление памяти: -${removed}`);
}

function collectHistory(state) {
  const pop = state.organisms.length;
  let parasites = 0;
  let coop = 0;
  const speciesCounts = new Map();

  for (let i = 0; i < state.organisms.length; i += 1) {
    const o = state.organisms[i];
    if (o.mode === "parasite") parasites += 1;
    if (o.mode === "cooperative") coop += 1;
    speciesCounts.set(o.species, (speciesCounts.get(o.species) || 0) + 1);
  }

  const topSpecies = [...speciesCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  state.history.push({
    tick: state.tick,
    population: pop,
    memory: totalMemory(state),
    parasites,
    cooperative: coop,
    topSpecies,
  });

  if (state.history.length > state.config.historySize) state.history.shift();

  // Отслеживание истории империй (World Log)
  const currentDom = topFamilies(state.organisms)[0];
  if (currentDom) {
    const [name, count] = currentDom;
    if (!state.lastDominant || state.lastDominant.name !== name) {
      if (state.lastDominant && state.tick - state.domStartTick > 400) {
        state.worldLog.unshift({
          name: state.lastDominant.name,
          duration: state.tick - state.domStartTick,
          peak: state.lastDominant.peak,
          endTick: state.tick
        });
        if (state.worldLog.length > 10) state.worldLog.pop();
        addEvent(state, "system", `Закат эры: ${state.lastDominant.name}`);
      }
      state.lastDominant = { name, peak: count };
      state.domStartTick = state.tick;
      if (count > 15) addEvent(state, "system", `Рассвет эры: ${name}`);
    } else {
      state.lastDominant.peak = Math.max(state.lastDominant.peak, count);
    }
  }
}

export function stepWorld(state, ticks = 1) {
  for (let t = 0; t < ticks; t += 1) {
    state.tick += 1;

    const map = new Map();
    for (let i = 0; i < state.organisms.length; i += 1) {
      const o = state.organisms[i];
      map.set(mapKey(state, o.x, o.y), o);
    }
    const occupied = new Set(map.keys());

    for (let i = 0; i < state.organisms.length; i += 1) {
      const org = state.organisms[i];
      if (!org.alive) continue;

      org.age += 1;
      const idx = mapKey(state, org.x, org.y);
      org.energy -= org.metabolism * (1.03 / biomePenalty(state.biomes[idx]));

      for (let k = 0; k < state.config.instructionsPerTick; k += 1) {
        executeOpcode(state, org, map, occupied);
      }

      const neigh = getNeighbor(state, map, org.x, org.y, state.config.width);
      if (neigh) applyHGT(state, org, neigh);

      reproduce(state, org, occupied);

      const ageLimit = 210 + (org.genome[4] || 0);
      if (org.energy <= 0) {
        org.alive = false;
        state.deathCauses[org.deathCause || "starvation"] += 1;
      } else if (org.age > ageLimit) {
        org.alive = false;
        state.deathCauses.aging += 1;
      }
    }

    state.organisms = state.organisms.filter((x) => x.alive);

    updatePheromones(state);
    updateViruses(state, occupied);
    applySystemEvents(state);
    enforceMemory(state);

    if (state.organisms.length === 0) {
      addEvent(state, "extinct", "Полное вымирание, регенерация мира");
      placeInitialPopulation(state);
    }

    collectHistory(state);
  }

  return state;
}

export function applyPreset(state, presetName = "balanced") {
  const preset = PRESETS[presetName] || PRESETS.balanced;
  state.config = { ...state.config, ...preset };
  state.memoryLimit = Math.floor(state.config.width * state.config.height * state.config.memoryMultiplier);
  addEvent(state, "system", `Применен пресет: ${preset.name}`);
}

export function burstMutation(state, amount = 0.12) {
  state.mutationBoost = clamp(state.mutationBoost + amount, 0, 0.6);
  addEvent(state, "mutation", "Мутационный всплеск");
}

export function exportState(state) {
  return {
    config: state.config,
    seed: state.seed,
    tick: state.tick,
    nextId: state.nextId,
    mutationBoost: state.mutationBoost,
    memoryLimit: state.memoryLimit,
    biomes: Array.from(state.biomes),
    baseResource: Array.from(state.baseResource),
    organisms: state.organisms.map((o) => ({
      ...o,
      genome: Array.from(o.genome),
    })),
    events: state.events,
    history: state.history,
    deathCauses: state.deathCauses,
    speciesEdges: state.speciesEdges,
    eventWindow: state.eventWindow,
    worldLog: state.worldLog,
  };
}

export function importState(payload) {
  const seed = payload.seed || Date.now();
  const state = createWorld(payload.config || {}, seed);

  state.tick = payload.tick || 0;
  state.nextId = payload.nextId || 0;
  state.mutationBoost = payload.mutationBoost || 0;
  state.memoryLimit = payload.memoryLimit || state.memoryLimit;
  state.biomes = Uint8Array.from(payload.biomes || []);
  state.baseResource = Float32Array.from(payload.baseResource || []);
  state.organisms = (payload.organisms || []).map((o) => ({ ...o, genome: Uint8Array.from(o.genome || []) }));
  state.events = payload.events || [];
  state.history = payload.history || [];
  state.deathCauses = payload.deathCauses || state.deathCauses;
  state.speciesEdges = payload.speciesEdges || [];
  state.eventWindow = payload.eventWindow || [];
  state.worldLog = payload.worldLog || [];
  return state;
}

function topFamilies(organisms) {
  const m = new Map();
  for (let i = 0; i < organisms.length; i += 1) {
    const o = organisms[i];
    m.set(o.family, (m.get(o.family) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
}

export function makeSnapshot(state, options = {}) {
  const maxRender = options.maxRender || 2600;
  const organisms = state.organisms.length > maxRender
    ? state.organisms.slice(0, maxRender)
    : state.organisms;

  return {
    tick: state.tick,
    config: state.config,
    memoryLimit: state.memoryLimit,
    mutationChance: state.config.mutationChance + state.mutationBoost,
    population: state.organisms.length,
    memory: totalMemory(state),
    organisms: organisms.map((o) => ({
      id: o.id,
      x: o.x,
      y: o.y,
      energy: o.energy,
      size: o.size,
      family: o.family,
      species: o.species,
      mode: o.mode,
      aggression: o.aggression,
      fertility: o.fertility,
      age: o.age,
      colorHash: hashGenome(o.genome),
    })),
    history: state.history,
    events: state.events,
    eventRate: Math.round((state.eventWindow.length / 360) * 60),
    deathCauses: state.deathCauses,
    topFamilies: topFamilies(state.organisms),
    speciesEdges: state.speciesEdges,
    biomes: Array.from(state.biomes),
    baseResource: Array.from(state.baseResource),
    pheromones: Array.from(state.pheromones),
    worldLog: state.worldLog,
    viruses: state.viruses.map(v => ({ x: v.x, y: v.y })),
  };
}
