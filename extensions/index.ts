import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { runStartupPicker } from "../lib/startup-picker.ts";

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (event, ctx) => {
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
	});

	pi.registerCommand("startup-picker:about", {
		description: "Show the current status for Pi Startup Picker",
		handler: async (_args, ctx) => {
			ctx.ui.notify(
				"Pi Startup Picker is loaded. On normal startup it will offer a searchable provider/model picker before the session begins.",
				"info",
			);
		},
	});
}
