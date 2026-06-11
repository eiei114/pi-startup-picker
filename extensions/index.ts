import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { formatGreeting } from "../lib/greeting.ts";
import { runStartupPicker } from "../lib/startup-picker.ts";
import { StringEnum } from "../lib/schema.ts";

const greetParameters = Type.Object({
  name: Type.String({ description: "Name to greet" }),
  mode: StringEnum(["short", "friendly"], {
    description: "Greeting style. Prefer short unless the user asks for more warmth.",
  }),
});

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (event, ctx) => {
		await runStartupPicker(pi, event, ctx);
	});

	pi.registerCommand("startup-picker:about", {
		description: "Show the current bootstrap status for Pi Startup Picker",
		handler: async (_args, ctx) => {
			ctx.ui.notify(
				"Pi Startup Picker is loaded. On normal startup it will offer a provider/model picker before the session begins.",
				"info",
			);
		},
  });

  pi.registerTool({
    name: "startup_picker_greet",
    label: "Startup Picker Greet",
    description: "Return a typed greeting from the Pi Startup Picker scaffold",
    promptSnippet: "startup_picker_greet: return a typed greeting from the startup picker scaffold package",
    promptGuidelines: [
      "Use startup_picker_greet only when testing that the package loaded correctly.",
    ],
    parameters: greetParameters,
    async execute(_toolCallId, params) {
      const message = formatGreeting(params);

      return {
        content: [{ type: "text", text: message }],
        details: { message, mode: params.mode },
      };
    },
  });
}
