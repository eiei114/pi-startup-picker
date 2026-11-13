import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ABOUT_MESSAGE_OFF,
  ABOUT_MESSAGE_ON,
  behaviorAssertions,
  classifySelectDialog,
  parseJsonLines,
} from "../scripts/pi-sdk-smoke-contract.mjs";

const commandResponse = {
  id: "req_1",
  type: "response",
  command: "get_commands",
  success: true,
  data: {
    commands: [
      { name: "startup-picker:about", source: "extension" },
      { name: "startup-picker:settings", source: "extension" },
    ],
  },
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
  message: ABOUT_MESSAGE_OFF,
};
const newSessionResponse = {
  id: "req_4",
  type: "response",
  command: "new_session",
  success: true,
  data: { cancelled: false },
};
const base = { fullOutput: "", exit_code: 0, expectedVersion: "1.5.0", processExited: true };

function assertions(name, responses, overrides = {}) {
  return behaviorAssertions(name, { ...base, responses, ...overrides });
}

test("RPC line parser ignores diagnostics and keeps complete JSON responses", () => {
  assert.deepEqual(parseJsonLines('diagnostic\n{"type":"response","success":true}\n'), [
    { type: "response", success: true },
  ]);
});

test("about messages report the exact on and off states", () => {
  assert.match(ABOUT_MESSAGE_OFF, /Ask on \/new \(opt-in, default off\): off\.$/);
  assert.match(ABOUT_MESSAGE_ON, /Ask on \/new \(opt-in, default off\): on\.$/);
  assert.notEqual(ABOUT_MESSAGE_OFF, ABOUT_MESSAGE_ON);
});

test("extension load assertion requires both extension commands", () => {
  assert.equal(assertions("extension_load", [commandResponse])[0].passed, true);

  const withoutSettings = {
    ...commandResponse,
    data: { commands: [{ name: "startup-picker:about", source: "extension" }] },
  };
  assert.equal(assertions("extension_load", [withoutSettings])[0].passed, false);
  assert.equal(assertions("extension_load", [])[0].passed, false);
});

test("happy path requires both the selected model and handled feature response", () => {
  const responses = [commandResponse, selectedModelResponse, promptResponse, featureNotification];
  assert.equal(assertions("happy_path", responses, { selectionCompleted: true })[0].id, "feature_response");
  assert.equal(assertions("happy_path", responses, { selectionCompleted: true })[0].passed, true);
  assert.equal(assertions("happy_path", responses.filter((row) => row !== selectedModelResponse))[0].passed, false);
  assert.equal(assertions("happy_path", responses.filter((row) => row !== featureNotification))[0].passed, false);
  assert.equal(assertions("happy_path", responses, { selectionCompleted: false })[0].passed, false);

  // The about text must report the real setting, not a stale static string.
  const staleNotification = { ...featureNotification, message: "Pi Startup Picker is loaded." };
  assert.equal(
    assertions("happy_path", responses.filter((row) => row !== featureNotification).concat(staleNotification), {
      selectionCompleted: true,
    })[0].passed,
    false,
  );
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

test("new /new assertions accept a settled session and reject stray or missing evidence", () => {
  const noPicker = assertions("new_session_default_off", [commandResponse, newSessionResponse], {
    newSessionTitles: [],
    newSessionStateChecked: true,
  });
  assert.equal(noPicker[0].passed, true);

  // A picker opening with the setting off fails the case.
  assert.equal(
    assertions("new_session_disabled", [commandResponse, newSessionResponse], {
      newSessionTitles: ["Choose a provider"],
      newSessionStateChecked: true,
    })[0].passed,
    false,
  );

  // Both settings-off variants share the same evidence shape.
  assert.equal(
    assertions("new_session_disabled", [commandResponse, newSessionResponse], {
      newSessionTitles: [],
      newSessionStateChecked: false,
    })[0].passed,
    false,
  );
});

test("/new with the setting on requires the full provider and model picker", () => {
  const both = assertions("new_session_enabled", [commandResponse, newSessionResponse], {
    newSessionTitles: ["Choose a provider", "Choose a model"],
    newSessionStateChecked: true,
  });
  assert.equal(both[0].passed, true);

  assert.equal(
    assertions("new_session_enabled", [commandResponse, newSessionResponse], {
      newSessionTitles: ["Choose a provider"],
      newSessionStateChecked: true,
    })[0].passed,
    false,
  );
  assert.equal(
    assertions("new_session_enabled", [commandResponse, newSessionResponse], {
      newSessionTitles: [],
      newSessionStateChecked: true,
    })[0].passed,
    false,
  );
  assert.equal(
    assertions("new_session_enabled", [commandResponse], {
      newSessionTitles: ["Choose a provider", "Choose a model"],
      newSessionStateChecked: true,
    })[0].passed,
    false,
  );
});

test("new /new assertions require a non-cancelled new_session response", () => {
  const cancelled = { ...newSessionResponse, data: { cancelled: true } };
  assert.equal(
    assertions("new_session_enabled", [commandResponse, cancelled], {
      newSessionTitles: ["Choose a provider", "Choose a model"],
      newSessionStateChecked: true,
    })[0].passed,
    false,
  );
});

test("/new dialog classification keeps tracking dialogs after the bounded window", () => {
  assert.deepEqual(classifySelectDialog({ newSessionSent: false, newSessionStateChecked: false }), {
    kind: "startup",
    invalidatesStateCheck: false,
  });

  // The picker opened by the deferred `/new` handler is still a `/new` dialog even
  // when it arrives after the bounded window already read state.
  assert.deepEqual(classifySelectDialog({ newSessionSent: true, newSessionStateChecked: true }), {
    kind: "new-session",
    invalidatesStateCheck: true,
  });
  assert.deepEqual(classifySelectDialog({ newSessionSent: true, newSessionStateChecked: false }), {
    kind: "new-session",
    invalidatesStateCheck: false,
  });
});

test("a late `/new` provider dialog still lets the enabled case pass", () => {
  assert.equal(
    assertions("new_session_enabled", [commandResponse, newSessionResponse], {
      newSessionTitles: ["Choose a provider", "Choose a model"],
      newSessionStateChecked: true,
    })[0].passed,
    true,
  );

  // The same dialogs classified as startup dialogs would fail the assertion.
  assert.equal(
    assertions("new_session_enabled", [commandResponse, newSessionResponse], {
      newSessionTitles: [],
      newSessionStateChecked: true,
    })[0].passed,
    false,
  );
});

test("host shell assertion requires the exact pinned SDK version", () => {
  assert.equal(assertions("host_shell", [], { fullOutput: "1.5.0\n" })[0].passed, true);
  assert.equal(assertions("host_shell", [], { fullOutput: "1.4.0\n" })[0].passed, false);
});

test("committed smoke report records the manifest-pinned SDK versions", () => {
  const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const report = JSON.parse(readFileSync(new URL("../docs/verification/pi-sdk-smoke.json", import.meta.url), "utf8"));
  for (const [name, version] of Object.entries(report.sdk_versions)) {
    assert.equal(version, manifest.devDependencies[name], name);
  }
  assert.equal(Object.keys(report.sdk_versions).length, 4);
});
