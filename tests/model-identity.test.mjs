import assert from "node:assert/strict";
import test from "node:test";

const { modelKey, recentKey } = await import("../lib/model-identity.ts");

test("model identity keys preserve provider boundaries", () => {
  assert.equal(modelKey({ provider: "openai", id: "shared-model" }), "openai/shared-model");
  assert.equal(modelKey({ provider: "anthropic", id: "shared-model" }), "anthropic/shared-model");
  assert.equal(recentKey({ provider: "openai", modelId: "shared-model" }), "openai/shared-model");
});
