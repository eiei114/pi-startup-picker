import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import {
  behaviorAssertions,
  EXTENSION_LOAD_ERROR_PATTERN,
  parseJsonLines,
  SDK_NAMES,
  UNHANDLED_ERROR_PATTERN,
  VERIFICATION_CONTRACT,
} from "./pi-sdk-smoke-contract.mjs";

const PROBE_TIMEOUT_MS = 15_000;
const CLEANUP_GRACE_MS = 1_000;
const root = resolve(import.meta.dirname, "..");
const reportPath = process.argv.includes("--update-curated-report")
  ? resolve(root, "docs/verification/pi-sdk-smoke.json")
  : resolve(root, ".tmp/pi-sdk-smoke.json");
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const manifest = readJson(resolve(root, "package.json"));
const sdkVersions = Object.fromEntries(SDK_NAMES.map((name) => {
  const installed = readJson(resolve(root, "node_modules", name, "package.json")).version;
  if (manifest.devDependencies?.[name] !== installed) {
    throw new Error(`Smoke requires an exact dev/test pin for ${name}; installed ${installed}`);
  }
  return [name, installed];
}));
const expectedSdkVersions = {
  "@earendil-works/pi-agent-core": "1.2.0",
  "@earendil-works/pi-ai": "1.2.0",
  "@earendil-works/pi-coding-agent": "1.2.0",
  "@earendil-works/pi-tui": "1.2.0",
};
if (JSON.stringify(sdkVersions) !== JSON.stringify(expectedSdkVersions)) {
  throw new Error(`Unexpected SDK versions: ${JSON.stringify(sdkVersions)}`);
}

const codingAgentManifest = readJson(resolve(root, "node_modules/@earendil-works/pi-coding-agent/package.json"));
const piCli = resolve(root, "node_modules/@earendil-works/pi-coding-agent", codingAgentManifest.bin.pi);
const smokeModel = {
  id: "offline-smoke-model",
  name: "Offline Smoke Model",
  api: "openai-completions",
  baseUrl: "http://127.0.0.1:9/v1",
  reasoning: false,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 8192,
  maxTokens: 1024,
};

function isolatedEnvironment(agentDir) {
  const env = {
    ...process.env,
    PI_CODING_AGENT_DIR: agentDir,
    PI_OFFLINE: "1",
    PI_TELEMETRY: "0",
  };
  for (const key of Object.keys(env)) {
    if (/(?:API_KEY|AUTH_TOKEN|OAUTH_TOKEN|ACCESS_TOKEN|SECRET|PASSWORD)$/i.test(key)) delete env[key];
  }
  return env;
}

function createAgentDir(withModel) {
  const agentDir = mkdtempSync(resolve(tmpdir(), "pi-startup-picker-sdk-smoke-"));
  if (withModel) {
    writeFileSync(resolve(agentDir, "models.json"), JSON.stringify({
      providers: {
        "offline-smoke": {
          baseUrl: smokeModel.baseUrl,
          api: smokeModel.api,
          apiKey: "offline-only-not-used",
          models: [smokeModel],
        },
      },
    }, null, 2));
  }
  return agentDir;
}

function sanitizeOutput(text, agentDir) {
  return text
    .replaceAll(JSON.stringify(root).slice(1, -1), "<checkout>")
    .replaceAll(JSON.stringify(agentDir).slice(1, -1), "<isolated-agent-dir>");
}

function hasSavedSmokeRecent(agentDir) {
  try {
    const recents = JSON.parse(readFileSync(resolve(agentDir, "pi-startup-picker-recents.json"), "utf8"));
    return recents.some((recent) => recent.provider === "offline-smoke" && recent.modelId === smokeModel.id);
  } catch {
    return false;
  }
}

function runPiProcess({ agentDir, withModel = false, selectRecent = false, feature = false, malformed = false }) {
  return new Promise((resolveResult) => {
    const startedAt = Date.now();
    const args = [piCli, "--offline", "--no-session", "--no-tools", "--no-extensions", "--no-skills",
      "--no-prompt-templates", "--no-mcp", "--no-context-files", "-e", ".", "--mode", "rpc"];
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: isolatedEnvironment(agentDir),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    const responses = [];
    const rpcInput = [];
    let stdout = "";
    let stderr = "";
    let lineBuffer = "";
    let timedOut = false;
    let cleanupTimedOut = false;
    let closed = false;
    let inputEndedByHarness = false;
    let startedPrompt = false;
    let pollingState = false;
    let parseErrorSeen = false;
    let selectedStateSeen = false;
    let promptResponseSeen = false;
    let aboutNotificationSeen = false;
    let startupFallbackSeen = false;
    let uiSelectResponses = 0;
    const uiSelectTitles = [];
    let nextRequestId = 0;
    let cleanupTimer;

    const send = (value) => {
      if (child.stdin.destroyed || !child.stdin.writable) return false;
      const line = typeof value === "string" ? value : JSON.stringify(value);
      rpcInput.push(line);
      return child.stdin.write(`${line}\n`);
    };
    const sendRequest = (type, fields = {}) => {
      const id = `smoke_${++nextRequestId}`;
      send({ type, id, ...fields });
      return id;
    };
    const finishInput = () => {
      if (closed) return;
      closed = true;
      inputEndedByHarness = true;
      child.stdin.end();
    };
    const maybeFinish = () => {
      const commandsReady = responses.some((row) => row?.type === "response" && row.command === "get_commands" && row.success);
      if (withModel) {
        const selectionComplete = selectRecent
          ? uiSelectTitles.includes("Choose a startup model")
          : uiSelectTitles.includes("Choose a model");
        if (selectedStateSeen && selectionComplete && hasSavedSmokeRecent(agentDir)
          && (!feature || (promptResponseSeen && aboutNotificationSeen))) {
          finishInput();
        } else if (selectedStateSeen && selectionComplete && !closed) {
          setTimeout(maybeFinish, 25);
        }
      } else if (commandsReady && startupFallbackSeen && (!malformed || parseErrorSeen)) {
        finishInput();
      }
    };
    const requestState = () => {
      const requiredSelections = selectRecent ? 1 : 2;
      const readyToCheckState = feature ? promptResponseSeen : uiSelectResponses >= requiredSelections;
      if (!withModel || !readyToCheckState || pollingState || closed) return;
      pollingState = true;
      sendRequest("get_state");
    };
    const handleResponse = (row) => {
      if (row.type === "extension_ui_request" && row.method === "select" && withModel) {
        let value;
        if (selectRecent && row.title === "Choose a startup model") {
          value = row.options?.find((option) => option.startsWith("Recent:") && option.includes(smokeModel.id));
        } else if (row.title === "Choose a provider") {
          value = row.options?.find((option) => option.includes("offline-smoke")) ?? row.options?.[0];
        } else if (row.title === "Choose a model") {
          value = row.options?.find((option) => option.includes(smokeModel.id));
        }
        if (typeof value !== "string") {
          send({ type: "extension_ui_response", id: row.id, cancelled: true });
          return;
        }
        uiSelectResponses++;
        uiSelectTitles.push(row.title);
        send({ type: "extension_ui_response", id: row.id, value });
        requestState();
        return;
      }

      if (row.type === "response" && row.command === "parse" && row.success === false) {
        parseErrorSeen = true;
      }
      if (row.type === "response" && row.command === "get_commands" && row.success === true && feature && !startedPrompt) {
        startedPrompt = true;
        sendRequest("prompt", { message: "/startup-picker:about" });
      }
      if (row.type === "response" && row.command === "prompt") {
        promptResponseSeen = row.success === true && row.data?.disposition === "handled";
        requestState();
      }
      if (row.type === "extension_ui_request" && row.method === "notify"
        && row.message === "Pi Startup Picker is loaded. On normal startup it will offer a searchable provider/model picker before the session begins.") {
        aboutNotificationSeen = true;
      }
      if (row.type === "extension_ui_request" && row.method === "notify"
        && row.message === "No configured models are available for the startup picker. Continuing with your default model.") {
        startupFallbackSeen = true;
      }
      if (row.type === "response" && row.command === "get_state") {
        pollingState = false;
        selectedStateSeen = row.success === true && row.data?.model?.provider === "offline-smoke"
          && row.data?.model?.id === smokeModel.id;
        if (selectedStateSeen) {
          maybeFinish();
        } else if (promptResponseSeen && !closed) {
          setTimeout(requestState, 25);
        }
      }
      maybeFinish();
    };
    const handleLine = (line) => {
      if (!line.trim()) return;
      try {
        const row = JSON.parse(line);
        responses.push(row);
        handleResponse(row);
      } catch {
        // Non-JSON diagnostics are retained in stdout and checked as errors below.
      }
    };

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
      lineBuffer += chunk.toString();
      const lines = lineBuffer.split(/\r?\n/);
      lineBuffer = lines.pop() ?? "";
      for (const line of lines) handleLine(line);
    });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.once("error", (error) => {
      stderr += `\nspawn error: ${error.message}`;
      finishInput();
    });

    const deadlineTimer = setTimeout(() => {
      timedOut = true;
      child.kill();
      cleanupTimer = setTimeout(() => {
        if (child.exitCode === null) {
          cleanupTimedOut = true;
          child.kill("SIGKILL");
        }
      }, CLEANUP_GRACE_MS);
    }, PROBE_TIMEOUT_MS);

    child.once("close", (exitCode, signal) => {
      clearTimeout(deadlineTimer);
      clearTimeout(cleanupTimer);
      if (lineBuffer.trim()) handleLine(lineBuffer);
      const fullOutput = `${stdout}${stderr}`;
      const assertions = [];
      resolveResult({
        responses,
        rpcInput,
        stdout,
        stderr,
        fullOutput,
        exit_code: exitCode ?? 1,
        processExited: exitCode !== null,
        signal,
        timedOut,
        cleanupTimedOut,
        inputEndedByHarness,
        elapsed_ms: Date.now() - startedAt,
        uiSelectResponses,
        uiSelectTitles,
        assertions,
      });
    });

    if (malformed) send("not-json");
    sendRequest("get_commands");
  });
}

async function runPiCase(name, options = {}) {
  const agentDir = createAgentDir(options.withModel === true);
  try {
    const first = await runPiProcess({ agentDir, ...options });
    const transcripts = [first];
    let observed = first;
    if (name === "reload_cleanup") {
      if (first.exit_code === 0 && first.processExited && first.uiSelectTitles.includes("Choose a model")
        && hasSavedSmokeRecent(agentDir)) {
        observed = await runPiProcess({ agentDir, withModel: true, selectRecent: true, feature: true });
      } else {
        observed = { ...first, exit_code: 1, processExited: false };
      }
      transcripts.push(observed);
    }
    const fullOutput = transcripts.map((item) => sanitizeOutput(item.fullOutput, agentDir)).join("\n--- second Pi process ---\n");
    const assertions = behaviorAssertions(name, {
      responses: observed.responses,
      fullOutput,
      exit_code: observed.exit_code,
      expectedVersion: sdkVersions["@earendil-works/pi-coding-agent"],
      processExited: observed.processExited && !observed.timedOut && !observed.cleanupTimedOut,
      selectionCompleted: observed.uiSelectTitles.includes("Choose a model") && hasSavedSmokeRecent(agentDir),
      selectedRecent: observed.uiSelectTitles.includes("Choose a startup model") && hasSavedSmokeRecent(agentDir),
    });
    const hasUnhandledError = transcripts.some((item) => UNHANDLED_ERROR_PATTERN.test(item.fullOutput)
      || item.responses.some((row) => row?.type === "extension_error"));
    const hasLoadError = transcripts.some((item) => EXTENSION_LOAD_ERROR_PATTERN.test(item.fullOutput)
      || item.responses.some((row) => row?.type === "extension_error"));
    const passed = observed.exit_code === 0 && observed.processExited && !observed.timedOut
      && !observed.cleanupTimedOut && !hasUnhandledError && !hasLoadError && assertions.every((item) => item.passed);
    const evidence = JSON.stringify({
      host: "actual Pi RPC process using the installed coding-agent 1.2.0 CLI",
      argv: ["--offline", "--no-session", "--no-tools", "--no-extensions", "--no-skills",
        "--no-prompt-templates", "--no-mcp", "--no-context-files", "-e", ".", "--mode", "rpc"],
      process_deadline_ms: PROBE_TIMEOUT_MS,
      cleanup_grace_ms: CLEANUP_GRACE_MS,
      processes: transcripts.map((item) => ({
        exit_code: item.exit_code,
        process_exited: item.processExited,
        timed_out: item.timedOut,
        cleanup_timed_out: item.cleanupTimedOut,
        input_ended_by_harness: item.inputEndedByHarness,
        elapsed_ms: item.elapsed_ms,
        rpc_ui_selections: item.uiSelectResponses,
        rpc_ui_selection_titles: item.uiSelectTitles,
        rpc_input: item.rpcInput,
        stdout: sanitizeOutput(item.stdout, agentDir),
        stderr: sanitizeOutput(item.stderr, agentDir),
      })),
    }, null, 2);
    return {
      name,
      command: "npm run smoke:pi",
      exit_code: observed.exit_code,
      passed,
      evidence,
      assertions,
      hasUnhandledError,
      hasLoadError,
    };
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
  }
}

function runHostShell() {
  let executable;
  let args;
  if (process.platform === "win32") {
    executable = resolve(process.env.SystemRoot ?? "C:/Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");
    const quote = (value) => `'${value.replaceAll("'", "''")}'`;
    args = ["-NoProfile", "-NonInteractive", "-Command",
      `& ${quote(process.execPath)} ${quote(piCli)} --no-extensions --version; exit $LASTEXITCODE`];
  } else {
    executable = "/bin/sh";
    args = ["-c", '"$1" "$2" --no-extensions --version', "pi-host-shell", process.execPath, piCli];
  }
  const agentDir = createAgentDir(false);
  try {
    const result = spawnSync(executable, args, {
      cwd: root,
      env: isolatedEnvironment(agentDir),
      encoding: "utf8",
      timeout: PROBE_TIMEOUT_MS,
      windowsHide: true,
    });
    const fullOutput = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    const assertions = behaviorAssertions("host_shell", {
      responses: [],
      fullOutput,
      exit_code: result.status ?? 1,
      expectedVersion: sdkVersions["@earendil-works/pi-coding-agent"],
      processExited: result.status !== null && result.status !== undefined,
    });
    const timedOut = result.error?.code === "ETIMEDOUT";
    return {
      name: "host_shell",
      command: "npm run smoke:pi",
      exit_code: result.status ?? 1,
      passed: !result.error && !timedOut && assertions.every((item) => item.passed),
      evidence: JSON.stringify({
        native_shell: process.platform === "win32" ? "Windows PowerShell" : "/bin/sh",
        argv: process.platform === "win32"
          ? ["-NoProfile", "-NonInteractive", "-Command", "node <installed-pi-cli> --no-extensions --version"]
          : ["-c", '"$1" "$2" --no-extensions --version', "pi-host-shell", "node", "<installed-pi-cli>"],
        process_deadline_ms: PROBE_TIMEOUT_MS,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        spawn_error: result.error?.message ?? null,
      }, null, 2),
      assertions,
      hasUnhandledError: UNHANDLED_ERROR_PATTERN.test(fullOutput),
      hasLoadError: EXTENSION_LOAD_ERROR_PATTERN.test(fullOutput),
    };
  } finally {
    rmSync(agentDir, { recursive: true, force: true });
  }
}

const cases = [];
cases.push(await runPiCase("extension_load"));
cases.push(await runPiCase("happy_path", { withModel: true, feature: true }));
cases.push(await runPiCase("error_path", { malformed: true }));
cases.push(await runPiCase("reload_cleanup", { withModel: true }));
cases.push(runHostShell());

const report = {
  schema_version: 1,
  verification_contract: VERIFICATION_CONTRACT,
  sdk_versions: sdkVersions,
  platform: process.platform,
  model_inference: "none; an isolated offline-only model definition exercises real selection without sending inference",
  unhandled_errors: cases.filter((item) => item.hasUnhandledError).length,
  extension_load_errors: cases.filter((item) => item.hasLoadError || (item.name === "extension_load" && !item.passed)).length,
  cases: cases.map(({ hasUnhandledError, hasLoadError, ...item }) => item),
};
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  verification_contract: VERIFICATION_CONTRACT,
  platform: process.platform,
  cases: cases.map(({ name, passed, exit_code }) => ({ name, passed, exit_code })),
}));
if (cases.some((item) => !item.passed)) process.exitCode = 1;
