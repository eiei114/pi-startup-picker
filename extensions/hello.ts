import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.setStatus("startup-picker", "Startup Picker scaffold loaded");
  });

  pi.registerCommand("startup-picker:hello", {
    description: "Show a smoke-test hello message from Pi Startup Picker",
    handler: async (args, ctx) => {
      const name = args.trim() || "Pi";
      ctx.ui.notify(`Pi Startup Picker says hello, ${name}!`, "info");
    },
  });
}