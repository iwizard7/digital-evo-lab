import assert from "node:assert/strict";
import { createWorld, exportState, importState, stepWorld } from "../sim-core.mjs";

function testDeterministicSeed() {
  const a = createWorld({}, 123);
  const b = createWorld({}, 123);
  stepWorld(a, 120);
  stepWorld(b, 120);
  assert.equal(a.history[a.history.length - 1].population, b.history[b.history.length - 1].population);
  assert.equal(a.history[a.history.length - 1].memory, b.history[b.history.length - 1].memory);
}

function testExportImport() {
  const state = createWorld({}, 42);
  stepWorld(state, 60);
  const payload = exportState(state);
  const restored = importState(payload);
  assert.equal(restored.tick, state.tick);
  assert.equal(restored.organisms.length, state.organisms.length);
}

function testMemoryLimit() {
  const state = createWorld({ memoryMultiplier: 0.5 }, 7);
  stepWorld(state, 400);
  const last = state.history[state.history.length - 1];
  assert.ok(last.memory <= state.memoryLimit + 220);
}

testDeterministicSeed();
testExportImport();
testMemoryLimit();

console.log("lab tests passed");
