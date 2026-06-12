import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repoRoot = process.cwd();
const buildDir = process.env.PROMPT_ITER_BUILD_DIR;
const outDir = path.resolve(
  repoRoot,
  process.env.PROMPT_ITER_OUT_DIR ?? "runs/analysis/prompt-iter-01/latest",
);
const label = process.env.PROMPT_ITER_LABEL ?? "latest";
const attemptCount = Number.parseInt(process.env.PROMPT_ITER_ATTEMPTS ?? "1", 10);
const timeoutMs = Number.parseInt(
  process.env.PROMPT_ITER_TIMEOUT_MS ?? "180000",
  10,
);
const includeAmbient = process.env.PROMPT_ITER_AMBIENT !== "0";

if (buildDir === undefined || buildDir.length === 0) {
  throw new Error("PROMPT_ITER_BUILD_DIR is required");
}

if (!Number.isInteger(attemptCount) || attemptCount < 1) {
  throw new Error(`invalid PROMPT_ITER_ATTEMPTS: ${attemptCount}`);
}

const importBuilt = async (relativePath) =>
  import(pathToFileURL(path.join(buildDir, relativePath)).href);

const [{ config, bounds }, { assemblePrompt }, providerModule, gate0Module, gate1Module, manifestModule, reportModule] =
  await Promise.all([
    importBuilt("config/index.js"),
    importBuilt("director/prompt/assemble.js"),
    importBuilt("director/provider/index.js"),
    importBuilt("gauntlet/gates01/gate0.js"),
    importBuilt("gauntlet/gates01/gate1.js"),
    importBuilt("schemas/manifest.js"),
    importBuilt("gauntlet/gates01/report.js"),
  ]);

const { createAmbientDirectorProvider } = providerModule;
const { runGate0 } = gate0Module;
const { runGate1 } = gate1Module;
const { parseManifest } = manifestModule;
const { failedChecks } = reportModule;

const traceFacts = {
  facts: {
    combatEngagementRate: 0.46,
    fightsPicked: 19,
    fightsAvoided: 22,
    retreatCount: 3,
    retreatFrequency: 0.012,
    itemPickups: 13,
    itemUses: 1,
    itemUsesByCategory: { food: 1, coin: 7, weapon: 2, armor: 1, tool: 2 },
    hoardingSignal: 12,
    npcTalksInitiated: 1,
    explorationRatio: 0.2,
    cellsVisited: 160,
    floorCellsEstimate: 800,
    closeCallCount: 1,
    killsByEnemyType: { "moss-bit": 4, "silt-guard": 1 },
    questAccepted: 1,
    questRefused: 0,
    questCompleted: 0,
    totalTurns: 520,
  },
  textBlock: [
    "PLAYER TRACE SUMMARY",
    "Combat: engagement 46% (19 fights picked, 22 avoided); retreats 3 (1.2% of turns).",
    "Items: 13 pickups, 1 uses; hoarding signal 12.00; profile coin:7, food:1, weapon:2, armor:1, tool:2.",
    "Exploration: 160 cells seen (~20.0% of floor); close calls 1.",
    "Social: 1 talks initiated; quests accepted 1, refused 0, completed 0.",
    "Kills: moss-bit:4, silt-guard:1.",
    "Turns recorded: 520.",
  ].join("\n"),
};

const attemptSpecs = [
  { band: "shallows", depth: 3 },
  { band: "shallows", depth: 4 },
  { band: "middle", depth: 6 },
  { band: "middle", depth: 8 },
  { band: "lowest", depth: 10 },
];

await mkdir(outDir, { recursive: true });

const tempCodexHome = await prepareTempCodexHome();
try {
  const fixtureResults = await parseSpikeFixtures();
  await writeJson("fixture-errors.json", fixtureResults);

  const attempts = [];
  if (includeAmbient) {
    const provider = createAmbientDirectorProvider();

    for (let index = 0; index < attemptCount; index += 1) {
      const spec = attemptSpecs[index % attemptSpecs.length];
      const seed = `prompt-iter-${label}-${index + 1}`;
      const runId = `prompt-iter-${label}-${index + 1}`;
      const prompt = assemblePrompt({
        band: spec.band,
        depth: spec.depth,
        config,
        bounds,
        traceFacts,
        memoryBlock: null,
        runContext: { seed, runId },
      });

      const attemptDir = path.join(outDir, `attempt-${index + 1}`);
      await mkdir(attemptDir, { recursive: true });
      await writeFile(path.join(attemptDir, "prompt.txt"), prompt);

      const startedAt = new Date().toISOString();
      const result = await provider.generateManifest(prompt, { timeoutMs });
      const raw = result.raw ?? "";
      await writeFile(path.join(attemptDir, "raw.txt"), raw);

      const gate0 = runGate0(raw);
      const parsed = parseManifest(raw);
      const gate1 = parsed.ok ? runGate1(parsed.manifest) : null;

      if (parsed.ok) {
        await writeJsonIn(attemptDir, "manifest.json", parsed.manifest);
      }

      await writeJsonIn(attemptDir, "provider.json", sanitizeProviderResult(result));
      await writeJsonIn(attemptDir, "gate0.json", gate0);
      if (gate1 !== null) {
        await writeJsonIn(attemptDir, "gate1.json", gate1);
      }

      attempts.push({
        attempt: index + 1,
        startedAt,
        band: spec.band,
        depth: spec.depth,
        seed,
        promptChars: prompt.length,
        providerOk: result.ok,
        providerError: result.ok ? null : result.error,
        latencyMs: result.usage.latencyMs,
        gate0Pass: gate0.pass,
        gate1Pass: gate1?.pass ?? null,
        passGate01: gate0.pass && gate1?.pass === true,
        gate0Failed: failedChecks(gate0),
        gate1Failed: gate1 === null ? [] : failedChecks(gate1),
        parseErrors: parsed.ok ? [] : parsed.errors,
      });

      await writeJson("partial-results.json", { label, attempts });
    }
  }

  await writeJson("results.json", {
    label,
    generatedAt: new Date().toISOString(),
    outDir,
    buildDir,
    tempCodexHomeUsed: tempCodexHome !== null,
    includeAmbient,
    attempts,
    fixtureResults,
  });
} finally {
  if (tempCodexHome !== null) {
    await rm(tempCodexHome, { recursive: true, force: true });
  }
}

async function parseSpikeFixtures() {
  const files = [
    "runs/spikes/29-ambient-director/attempts/host-1-stdout.txt",
    "runs/spikes/29-ambient-director/attempts/host-2-stdout.txt",
    "runs/spikes/29-ambient-director/attempts/host-3-stdout.txt",
  ];

  const results = [];
  for (const file of files) {
    const raw = await readFile(path.join(repoRoot, file), "utf8");
    const parsed = parseManifest(raw);
    results.push({
      file,
      ok: parsed.ok,
      errors: parsed.ok ? [] : parsed.errors,
    });
  }
  return results;
}

async function prepareTempCodexHome() {
  const sourceHome = process.env.CODEX_HOME ?? path.join(homedir(), ".codex");
  const authPath = path.join(sourceHome, "auth.json");
  if (!existsSync(authPath)) {
    return null;
  }

  const targetHome = path.join(
    await import("node:fs/promises").then((fs) =>
      fs.mkdtemp(path.join(tmpdir(), "prompt-iter-codex-home.")),
    ),
  );
  await copyFile(authPath, path.join(targetHome, "auth.json"));
  process.env.CODEX_HOME = targetHome;
  return targetHome;
}

async function writeJson(name, value) {
  await writeJsonIn(outDir, name, value);
}

async function writeJsonIn(directory, name, value) {
  await writeFile(path.join(directory, name), `${JSON.stringify(value, null, 2)}\n`);
}

function sanitizeProviderResult(result) {
  if (result.ok) {
    return {
      ok: true,
      usage: result.usage,
    };
  }

  return {
    ok: false,
    error: result.error,
    usage: result.usage,
  };
}
