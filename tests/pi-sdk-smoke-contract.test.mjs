import assert from "node:assert/strict";
import test from "node:test";
import { behaviorAssertions, parseJsonLines } from "../scripts/pi-sdk-smoke-contract.mjs";

const commandResponse = {
  id: "req_1",
  type: "response",
  command: "get_commands",
  success: true,
  data: { commands: [{ name: "startup-picker:about", source: "extension" }] },
};
const selectedModelResponse = {
  id: "req_3",
  type: "response",
  command: "get_state",
  success: true,
  data: { model: { provider: "offline-smoke", id: "offline-smoke-model" } },
};
const promptResponse = {
  id: "req_2",
  type: "response",
  command: "prompt",
  success: true,
  data: { disposition: "handled" },
};
const featureNotification = {
  type: "extension_ui_request",
  method: "notify",
  notifyType: "info",
  message: "Pi Startup Picker is loaded. On normal startup it will offer a searchable provider/model picker before the session begins.",
};
const base = { fullOutput: "", exit_code: 0, expectedVersion: "1.2.0", processExited: true };

function assertions(name, responses, overrides = {}) {
  return behaviorAssertions(name, { ...base, responses, ...overrides });
}

test("RPC line parser ignores diagnostics and keeps complete JSON responses", () => {
  assert.deepEqual(parseJsonLines('diagnostic\n{"type":"response","success":true}\n'), [
    { type: "response", success: true },
  ]);
});

test("extension load assertion requires the real extension command registration", () => {
  assert.equal(assertions("extension_load", [commandResponse])[0].passed, true);
  assert.equal(assertions("extension_load", [])[0].passed, false);
});

test("happy path requires both the selected model and handled feature response", () => {
  const responses = [commandResponse, selectedModelResponse, promptResponse, featureNotification];
  assert.equal(assertions("happy_path", responses, { selectionCompleted: true })[0].id, "feature_response");
  assert.equal(assertions("happy_path", responses, { selectionCompleted: true })[0].passed, true);
  assert.equal(assertions("happy_path", responses.filter((row) => row !== selectedModelResponse))[0].passed, false);
  assert.equal(assertions("happy_path", responses.filter((row) => row !== featureNotification))[0].passed, false);
  assert.equal(assertions("happy_path", responses, { selectionCompleted: false })[0].passed, false);
});

test("error path fails when the malformed RPC response is missing or successful", () => {
  const parseFailure = { type: "response", command: "parse", success: false, error: "Failed to parse command" };
  assert.equal(assertions("error_path", [commandResponse, parseFailure])[0].passed, true);
  assert.equal(assertions("error_path", [commandResponse])[0].passed, false);
  assert.equal(assertions("error_path", [commandResponse, { ...parseFailure, success: true }])[0].passed, false);
});

test("reload assertions require second-process registration, feature response and clean exit", () => {
  const responses = [commandResponse, selectedModelResponse, promptResponse, featureNotification];
  const result = assertions("reload_cleanup", responses, { selectedRecent: true });
  assert.deepEqual(result.map((item) => item.id), [
    "reloaded_extension_registered",
    "reloaded_feature_response",
    "clean_shutdown",
  ]);
  assert.ok(result.every((item) => item.passed));
  assert.equal(assertions("reload_cleanup", [commandResponse, promptResponse])[1].passed, false);
  assert.equal(assertions("reload_cleanup", responses, { selectedRecent: false })[1].passed, false);
  assert.equal(assertions("reload_cleanup", responses, { processExited: false })[2].passed, false);
});

test("host shell assertion requires the exact pinned SDK version", () => {
  assert.equal(assertions("host_shell", [], { fullOutput: "1.2.0\n" })[0].passed, true);
  assert.equal(assertions("host_shell", [], { fullOutput: "0.99.1\n" })[0].passed, false);
});
