import { createWorld, stepWorld } from "../sim-core.mjs";
import { writeFileSync } from "node:fs";

const SEEDS = [42, 1337, 2026, 9001, 77777];
const TICKS = 1800;

function runOne(seed, config = {}) {
  const state = createWorld(config, seed);
  stepWorld(state, TICKS);

  const last = state.history[state.history.length - 1];
  const score = Math.round(
    (last.population * 1.8 + last.cooperative * 1.2 - last.parasites * 0.7) +
      Math.max(0, state.memoryLimit - last.memory) * 0.03,
  );

  return {
    seed,
    population: last.population,
    parasites: last.parasites,
    cooperative: last.cooperative,
    memory: last.memory,
    score,
    deaths: state.deathCauses,
  };
}

function runBatch(name, config) {
  return {
    name,
    runs: SEEDS.map((seed) => runOne(seed, config)),
  };
}

const batches = [
  runBatch("balanced", {}),
  runBatch("parasite-heavy", { parasiteChance: 0.011, coopChance: 0.002, memoryMultiplier: 0.78 }),
  runBatch("cooperation-heavy", { parasiteChance: 0.001, coopChance: 0.016, memoryMultiplier: 0.86 }),
  runBatch("memory-crunch", { memoryMultiplier: 0.56, catastropheChance: 0.003 }),
];

function summarize(batch) {
  const total = batch.runs.reduce(
    (acc, x) => {
      acc.population += x.population;
      acc.parasites += x.parasites;
      acc.cooperative += x.cooperative;
      acc.score += x.score;
      return acc;
    },
    { population: 0, parasites: 0, cooperative: 0, score: 0 },
  );

  const n = batch.runs.length;
  return {
    population: Math.round(total.population / n),
    parasites: Math.round(total.parasites / n),
    cooperative: Math.round(total.cooperative / n),
    score: Math.round(total.score / n),
  };
}

const lines = [
  "# Digital Life Lab Report",
  "",
  `Generated at: ${new Date().toISOString()}`,
  `Ticks per run: ${TICKS}`,
  `Seeds: ${SEEDS.join(", ")}`,
  "",
];

for (const batch of batches) {
  const summary = summarize(batch);
  lines.push(`## ${batch.name}`);
  lines.push(`avg population: ${summary.population}`);
  lines.push(`avg parasites: ${summary.parasites}`);
  lines.push(`avg cooperative: ${summary.cooperative}`);
  lines.push(`avg score: ${summary.score}`);
  lines.push("");
  lines.push("| seed | population | parasites | coop | memory | score |");
  lines.push("|---:|---:|---:|---:|---:|---:|");
  for (const r of batch.runs) {
    lines.push(`| ${r.seed} | ${r.population} | ${r.parasites} | ${r.cooperative} | ${r.memory} | ${r.score} |`);
  }
  lines.push("");
}

writeFileSync(new URL("./report.md", import.meta.url), `${lines.join("\n")}\n`, "utf8");
console.log("report saved to lab/report.md");
