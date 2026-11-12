import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { runAboutCommand, runSettingsCommand } from "../lib/settings-command.ts";
import { runStartupPicker } from "../lib/startup-picker.ts";

function warnSafely(ctx: ExtensionContext, message: string): void {
	try {
		ctx.ui.notify(message, "warning");
	} catch {
		// Pi invalidates a ctx after a session replacement. A late deferred handler
		// must not turn that into an unhandled rejection.
	}
}

export default function (pi: ExtensionAPI) {
	// RPC mode binds the new session's extensions twice, so `session_start` fires
	// twice for one `/new`. Guard the opt-in picker per session so it opens once.
	let lastNewSessionKey: string | undefined;

	pi.on("session_start", async (event, ctx) => {
		if (event.reason === "startup") {
			// Pi binds RPC input after initial session_start handlers settle. Deferring
			// its dialogs lets the RPC client respond before the startup flow continues.
			if (ctx.mode === "rpc") {
				setTimeout(() => {
					void runStartupPicker(pi, event, ctx).catch((error: unknown) => {
						ctx.ui.notify(`Pi Startup Picker failed: ${String(error)}`, "error");
					});
				}, 0);
				return;
			}

			await runStartupPicker(pi, event, ctx);
			return;
		}

		// `/new` is opt-in. Picker trouble only warns, and the session continues with
		// the model that was current before the picker opened.
		const runOptionalPicker = async () => {
			if (event.reason === "new") {
				let sessionKey: string | undefined;
				try {
					sessionKey = `${ctx.sessionManager.getSessionId()}:${event.previousSessionFile ?? ""}`;
				} catch {
					// Without a session identity, prefer running the picker over skipping it.
				}

				if (sessionKey !== undefined) {
					if (sessionKey === lastNewSessionKey) return;
					lastNewSessionKey = sessionKey;
				}
			}

			await runStartupPicker(pi, event, ctx).catch((error: unknown) => {
				warnSafely(
					ctx,
					`Pi Startup Picker could not offer the model picker: ${String(error)}. Continuing with your current model.`,
				);
			});
		};

		// RPC mode keeps the existing async deferral so `/new` is not held open by
		// dialogs the client answers asynchronously.
		if (ctx.mode === "rpc") {
			setTimeout(() => {
				void runOptionalPicker();
			}, 0);
			return;
		}

		await runOptionalPicker();
	});

	pi.registerCommand("startup-picker:about", {
		description: "Show the current status for Pi Startup Picker",
		handler: async (_args, ctx) => {
			await runAboutCommand(ctx.ui);
		},
	});

	pi.registerCommand("startup-picker:settings", {
		description: "Toggle the opt-in model picker on /new",
		handler: async (_args, ctx) => {
			await runSettingsCommand(ctx.ui);
		},
	});
}
