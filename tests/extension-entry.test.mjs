import assert from "node:assert/strict";
import test from "node:test";

const { default: extension } = await import("../extensions/index.ts");

function createModel(provider, id, name = id) {
	return { provider, id, name };
}

function createHarness({ models = [], hasUI = true, mode = "tui" } = {}) {
	const commands = [];
	const events = {};
	const setModelCalls = [];
	const notifications = [];

	extension({
		on(event, handler) {
			events[event] = handler;
		},
		registerCommand(name, definition) {
			commands.push({ name, ...definition });
		},
		setModel: async (model) => {
			setModelCalls.push(model);
			return true;
		},
	});

	const ctx = {
		hasUI,
		mode,
		model: createModel("openai", "gpt-5.4", "GPT-5.4"),
		modelRegistry: {
			getAvailable: () => models,
			getProviderDisplayName: (provider) => provider.toUpperCase(),
		},
		sessionManager: {
			getSessionId: () => "session-id",
		},
		ui: {
			select: async () => undefined,
			notify: (message, level) => notifications.push({ message, level }),
		},
	};

	return { events, commands, setModelCalls, ctx, notifications };
}

test("extension registers the about and settings commands", () => {
	const harness = createHarness();

	assert.deepEqual(harness.commands.map((command) => command.name), [
		"startup-picker:about",
		"startup-picker:settings",
	]);
	assert.equal(typeof harness.events.session_start, "function");
	assert.equal(typeof harness.commands[0].handler, "function");
	assert.equal(typeof harness.commands[1].handler, "function");
});

test("resume, fork and reload never open the picker or warn", async () => {
	for (const reason of ["resume", "fork", "reload"]) {
		const harness = createHarness({ models: [createModel("openai", "gpt-5.4", "GPT-5.4")] });

		await harness.events.session_start({ type: "session_start", reason }, harness.ctx);

		assert.equal(harness.setModelCalls.length, 0, reason);
		assert.deepEqual(harness.notifications, [], reason);
	}
});

test("a deferred startup notice never becomes an unhandled rejection after a session replacement", async () => {
	const rejections = [];
	const onRejection = (reason) => rejections.push(reason);
	process.on("unhandledRejection", onRejection);

	try {
		const harness = createHarness({ models: [], mode: "rpc" });
		// Pi invalidates a captured ctx after newSession/fork/switchSession/reload: its
		// `ui` getter runs runner.assertActive() and throws this exact shape.
		harness.ctx.ui.notify = () => {
			throw new Error("extension ctx is stale after session replacement or reload");
		};

		await harness.events.session_start({ type: "session_start", reason: "startup" }, harness.ctx);
		await new Promise((done) => setTimeout(done, 50));

		assert.deepEqual(rejections, []);
	} finally {
		process.off("unhandledRejection", onRejection);
	}
});

test("a rejecting deferred startup picker is swallowed when the ctx is already stale", async () => {
	const rejections = [];
	const onRejection = (reason) => rejections.push(reason);
	process.on("unhandledRejection", onRejection);

	try {
		const harness = createHarness({ models: [createModel("openai", "gpt-5.4", "GPT-5.4")], mode: "rpc" });
		harness.ctx.ui.select = async () => {
			throw new Error("extension ctx is stale after session replacement or reload");
		};
		harness.ctx.ui.notify = () => {
			throw new Error("extension ctx is stale after session replacement or reload");
		};

		await harness.events.session_start({ type: "session_start", reason: "startup" }, harness.ctx);
		await new Promise((done) => setTimeout(done, 50));

		assert.deepEqual(rejections, []);
	} finally {
		process.off("unhandledRejection", onRejection);
	}
});

test("startup keeps its awaited flow and its existing no-model fallback warning", async () => {
	const harness = createHarness({ models: [] });

	await harness.events.session_start({ type: "session_start", reason: "startup" }, harness.ctx);

	assert.equal(harness.notifications.length, 1);
	assert.equal(harness.notifications[0].level, "warning");
	assert.match(harness.notifications[0].message, /No configured models are available for the startup picker/);
});
