import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { runStartupPicker } from "../lib/startup-picker.ts";

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (event, ctx) => {
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
