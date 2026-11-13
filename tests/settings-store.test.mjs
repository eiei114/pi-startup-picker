import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const settingsStore = await import("../lib/settings-store.ts");

const posixOnly = process.platform === "win32"
	? { skip: "POSIX permission bits only; Windows reports synthesized modes" }
	: {};

async function modeOf(path) {
	return (await stat(path)).mode & 0o777;
}

async function tempSettingsPath() {
	const dir = await mkdtemp(join(tmpdir(), "pi-startup-picker-settings-"));
	return join(dir, "settings.json");
}

test("missing settings file means the /new picker is off", async () => {
	const path = await tempSettingsPath();

	const settings = await settingsStore.loadPickerSettings(path);

	assert.equal(settings.showOnNewSession, false);
	assert.equal(settingsStore.getSettingsStorePath().endsWith("pi-startup-picker-settings.json"), true);
});

test("reading settings never creates or rewrites the user file", async () => {
	const path = await tempSettingsPath();

	await settingsStore.loadPickerSettings(path);

	assert.deepEqual(await readdir(join(path, "..")), []);
});

test("malformed and wrong-type settings are treated as off without throwing", async () => {
	const path = await tempSettingsPath();
	await writeFile(path, "{not json", "utf8");
	assert.equal((await settingsStore.loadPickerSettings(path)).showOnNewSession, false);

	for (const payload of ["[]", "null", '"text"', "42", "{}", '{"showOnNewSession":"yes"}', '{"showOnNewSession":1}']) {
		await writeFile(path, payload, "utf8");
		assert.equal((await settingsStore.loadPickerSettings(path)).showOnNewSession, false, payload);
	}
});

test("a malformed settings file is left untouched by reads", async () => {
	const path = await tempSettingsPath();
	const original = "{not json";
	await writeFile(path, original, "utf8");

	await settingsStore.loadPickerSettings(path);

	assert.equal(await readFile(path, "utf8"), original);
});

test("savePickerSettings persists the boolean and survives a roundtrip", async () => {
	const path = await tempSettingsPath();

	await settingsStore.savePickerSettings({ showOnNewSession: true }, path);

	const raw = await readFile(path, "utf8");
	assert.equal(raw.endsWith("\n"), true);
	assert.deepEqual(JSON.parse(raw), { showOnNewSession: true });
	assert.equal((await settingsStore.loadPickerSettings(path)).showOnNewSession, true);
});

test("savePickerSettings preserves unrelated keys the user added", async () => {
	const path = await tempSettingsPath();
	await writeFile(path, JSON.stringify({ showOnNewSession: false, personal: "keep me" }), "utf8");

	await settingsStore.savePickerSettings({ showOnNewSession: true }, path);

	const parsed = JSON.parse(await readFile(path, "utf8"));
	assert.equal(parsed.showOnNewSession, true);
	assert.equal(parsed.personal, "keep me");
});

test("savePickerSettings leaves no temp files behind", async () => {
	const path = await tempSettingsPath();

	await settingsStore.savePickerSettings({ showOnNewSession: true }, path);
	await settingsStore.savePickerSettings({ showOnNewSession: false }, path);

	const leftovers = (await readdir(join(path, ".."))).filter((name) => name.endsWith(".tmp"));
	assert.deepEqual(leftovers, []);
});

test("normalizePickerSettings tolerates unknown shapes", () => {
	assert.deepEqual(settingsStore.normalizePickerSettings({ showOnNewSession: true }), { showOnNewSession: true });
	assert.deepEqual(settingsStore.normalizePickerSettings({ showOnNewSession: "true" }), { showOnNewSession: false });
	assert.deepEqual(settingsStore.normalizePickerSettings(undefined), { showOnNewSession: false });
});

test("a new settings file is created owner-only", posixOnly, async () => {
	const path = await tempSettingsPath();

	await settingsStore.savePickerSettings({ showOnNewSession: true }, path);

	assert.equal(await modeOf(path), settingsStore.SETTINGS_FILE_MODE);
});

test("saving preserves an existing owner-only settings file mode through the rename", posixOnly, async () => {
	const path = await tempSettingsPath();
	await writeFile(path, JSON.stringify({ showOnNewSession: false, personal: "keep me" }), "utf8");
	await chmod(path, 0o600);

	await settingsStore.savePickerSettings({ showOnNewSession: true }, path);

	assert.equal(await modeOf(path), 0o600);
	assert.deepEqual(JSON.parse(await readFile(path, "utf8")), { showOnNewSession: true, personal: "keep me" });
});

test("saving preserves a wider existing mode rather than widening or narrowing it", posixOnly, async () => {
	const path = await tempSettingsPath();
	await writeFile(path, "{}", "utf8");
	await chmod(path, 0o640);

	await settingsStore.savePickerSettings({ showOnNewSession: false }, path);

	assert.equal(await modeOf(path), 0o640);
});
