import {
  applyPreset,
  burstMutation,
  createWorld,
  exportState,
  importState,
  makeSnapshot,
  stepWorld,
} from "./sim-core.mjs";

let state = null;
let running = true;
let batch = 2;
let timer = null;

function tickLoop() {
  if (!running || !state) return;
  stepWorld(state, batch);
  const snapshot = makeSnapshot(state, { maxRender: 3200 });
  postMessage({ type: "snapshot", snapshot });
}

function startTimer() {
  if (timer) clearInterval(timer);
  timer = setInterval(tickLoop, 33);
}

onmessage = (event) => {
  const { type, payload } = event.data || {};

  if (type === "init") {
    state = createWorld(payload.config || {}, payload.seed || Date.now());
    batch = payload.batch || 2;
    running = true;
    startTimer();
    postMessage({ type: "snapshot", snapshot: makeSnapshot(state, { maxRender: 3200 }) });
  }

  if (type === "toggle") {
    running = !running;
    postMessage({ type: "status", running });
  }

  if (type === "set_running") {
    running = Boolean(payload.running);
    postMessage({ type: "status", running });
  }

  if (type === "burst") {
    if (!state) return;
    burstMutation(state, payload.amount || 0.12);
  }

  if (type === "step") {
    if (!state) return;
    stepWorld(state, payload.ticks || 1);
    postMessage({ type: "snapshot", snapshot: makeSnapshot(state, { maxRender: 3200 }) });
  }

  if (type === "preset") {
    if (!state) return;
    applyPreset(state, payload.name);
    postMessage({ type: "snapshot", snapshot: makeSnapshot(state, { maxRender: 3200 }) });
  }

  if (type === "patch_config") {
    if (!state) return;
    state.config = { ...state.config, ...payload };
    state.memoryLimit = Math.floor(state.config.width * state.config.height * state.config.memoryMultiplier);
    postMessage({ type: "snapshot", snapshot: makeSnapshot(state, { maxRender: 3200 }) });
  }

  if (type === "set_batch") {
    batch = Math.max(1, Math.min(24, payload.batch || 2));
  }

  if (type === "reset") {
    state = createWorld(payload.config || {}, payload.seed || Date.now());
    postMessage({ type: "snapshot", snapshot: makeSnapshot(state, { maxRender: 3200 }) });
  }

  if (type === "save") {
    if (!state) return;
    postMessage({ type: "saved", data: exportState(state) });
  }

  if (type === "load") {
    state = importState(payload.data);
    postMessage({ type: "snapshot", snapshot: makeSnapshot(state, { maxRender: 3200 }) });
  }

  if (type === "shutdown") {
    if (timer) clearInterval(timer);
    close();
  }
};
