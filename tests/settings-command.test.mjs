import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const { runSettingsCommand, runAboutCommand, SETTINGS_DIALOG_TITLE } = await import(
	"../lib/settings-command.ts"
);

function createUI(selectAnswers = [], saveError) {
	const selectCalls = [];
	const notifications = [];
	const saved = [];

	const ui = {
		select: async (title, options) => {
			selectCalls.push({ title, options });
			return selectAnswers.shift();
		},
		notify: (message, level) => {
			notifications.push({ message, level });
		},
	};

	return { ui, selectCalls, notifications, saved, saveError };
}

function optionsFor(showOnNewSession, saveError) {
	return {
		settingsPath: "ignored.json",
		loadSettings: async () => ({ showOnNewSession }),
		saveShowOnNewSession: async (value) => {
			if (saveError) throw saveError;
			return { showOnNewSession: value };
		},
	};
}

test("settings command turns Ask on /new on", async () => {
	const harness = createUI(["Ask on /new: on"]);

	const result = await runSettingsCommand(harness.ui, optionsFor(false));

	assert.equal(result.action, "saved");
	assert.equal(result.showOnNewSession, true);
	assert.deepEqual(harness.selectCalls[0].options, ["Ask on /new: on", "Ask on /new: off (current)"]);
	assert.equal(harness.selectCalls[0].title, SETTINGS_DIALOG_TITLE);
	assert.match(harness.notifications.at(-1).message, /now on/);
	assert.equal(harness.notifications.at(-1).level, "info");
});

test("settings command turns Ask on /new off", async () => {
	const harness = createUI(["Ask on /new: off"]);

	const result = await runSettingsCommand(harness.ui, optionsFor(true));

	assert.equal(result.action, "saved");
	assert.equal(result.showOnNewSession, false);
	assert.deepEqual(harness.selectCalls[0].options, ["Ask on /new: on (current)", "Ask on /new: off"]);
	assert.match(harness.notifications.at(-1).message, /now off/);
});

test("settings command cancel keeps the current value and writes nothing", async () => {
	const harness = createUI([undefined]);
	let saved = 0;

	const result = await runSettingsCommand(harness.ui, {
		...optionsFor(true),
		saveShowOnNewSession: async () => {
			saved++;
			return { showOnNewSession: false };
		},
	});

	assert.equal(result.action, "unchanged");
	assert.equal(result.showOnNewSession, true);
	assert.equal(saved, 0);
	assert.match(harness.notifications[0].message, /stays on/);
	assert.equal(harness.notifications[0].level, "info");
});

test("settings command reports a write failure and does not claim it was saved", async () => {
	const harness = createUI(["Ask on /new: on"]);

	const result = await runSettingsCommand(harness.ui, optionsFor(false, new Error("EACCES: permission denied")));

	assert.equal(result.action, "write-failed");
	assert.equal(result.showOnNewSession, false);
	assert.match(harness.notifications[0].message, /Could not save the Pi Startup Picker settings/);
	assert.match(harness.notifications[0].message, /EACCES/);
	assert.match(harness.notifications[0].message, /stays off/);
	assert.equal(harness.notifications[0].level, "error");
	assert.equal(harness.notifications.length, 1);
});

test("about command reports the current on/off state", async () => {
	for (const [value, expected] of [
		[true, /Ask on \/new \(separate opt-in, default off\): on\./],
		[false, /Ask on \/new \(separate opt-in, default off\): off\./],
	]) {
		const notifications = [];
		const settings = await runAboutCommand(
			{ notify: (message, level) => notifications.push({ message, level }) },
			{
				settingsPath: "ignored.json",
				recentStorePath: "ignored-recents.json",
				loadSettings: async () => ({ showOnNewSession: value }),
				loadRecentStore: async () => ({ status: "missing", recents: [] }),
			},
		);

		assert.equal(settings.showOnNewSession, value);
		assert.match(notifications[0].message, /Startup flow: the searchable provider\/model picker runs on normal startup, before the session begins \(startup-only\)/);
		assert.match(notifications[0].message, expected);
	}
});

test("about command reports the recent store path and count when the store is present", async () => {
	const dir = await mkdtemp(join(tmpdir(), "pi-startup-picker-about-"));
	try {
		const storePath = join(dir, "recents.json");
		await writeFile(
			storePath,
			JSON.stringify([
				{ provider: "openai", modelId: "gpt-5" },
				{ provider: "anthropic", modelId: "claude-sonnet-4" },
			]),
			"utf8",
		);
		const notifications = [];

		await runAboutCommand(
			{ notify: (message, level) => notifications.push({ message, level }) },
			{
				settingsPath: "ignored.json",
				recentStorePath: storePath,
				loadSettings: async () => ({ showOnNewSession: false }),
			},
		);

		assert.ok(notifications[0].message.includes(`Recent store path: ${storePath}.`));
		assert.match(notifications[0].message, /Recent entries: 2\./);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("about command reports zero entries when the recent store is missing", async () => {
	const dir = await mkdtemp(join(tmpdir(), "pi-startup-picker-about-"));
	try {
		const notifications = [];
		await runAboutCommand(
			{ notify: (message, level) => notifications.push({ message, level }) },
			{
				settingsPath: "ignored.json",
				recentStorePath: join(dir, "missing-recents.json"),
				loadSettings: async () => ({ showOnNewSession: false }),
			},
		);

		assert.match(notifications[0].message, /Recent entries: 0 \(store does not exist yet\)\./);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("about command reports an unreadable recent store without throwing", async () => {
	const dir = await mkdtemp(join(tmpdir(), "pi-startup-picker-about-"));
	try {
		const unreadablePath = join(dir, "recents-directory");
		await mkdir(unreadablePath);
		const notifications = [];
		await runAboutCommand(
			{ notify: (message, level) => notifications.push({ message, level }) },
			{
				settingsPath: "ignored.json",
				recentStorePath: unreadablePath,
				loadSettings: async () => ({ showOnNewSession: false }),
			},
		);

		assert.match(notifications[0].message, /Recent entries: unavailable \(store could not be read\)\./);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
});

test("about command treats a malformed settings file as off", async () => {
	const notifications = [];
	await runAboutCommand(
		{ notify: (message, level) => notifications.push({ message, level }) },
		{ settingsPath: "ignored.json", loadSettings: async () => ({ showOnNewSession: false }) },
	);

	assert.match(notifications[0].message, /: off\./);
});
