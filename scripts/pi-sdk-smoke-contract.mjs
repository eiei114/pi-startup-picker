export const VERIFICATION_CONTRACT = "pi-sdk-behavior-v2";
export const SDK_NAMES = [
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-tui",
];
export const UNHANDLED_ERROR_PATTERN = /UnhandledPromiseRejection|uncaught exception|shutdown error/i;
export const EXTENSION_LOAD_ERROR_PATTERN = /Failed to load extension|Error loading extension/i;

export function parseJsonLines(output) {
  return output.split(/\r?\n/).flatMap((line) => {
    if (!line.trim()) return [];
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

function assertion(id, expected, observed, passed) {
  return { id, expected, observed: JSON.stringify(observed), passed: passed === true };
}

function commandResponse(responses, command) {
  return responses.find((row) => row?.type === "response" && row.command === command && row.success === true);
}

function registeredPicker(responses) {
  const response = commandResponse(responses, "get_commands");
  const command = response?.data?.commands?.find((row) =>
    row.name === "startup-picker:about" && row.source === "extension",
  );
  return command && { name: command.name, description: command.description, source: command.source };
}

function modelState(responses) {
  return responses.find((row) => row?.type === "response" && row.command === "get_state"
    && row.success === true && row.data?.model?.provider === "offline-smoke"
    && row.data?.model?.id === "offline-smoke-model");
}

function aboutResponse(responses) {
  return commandResponse(responses, "prompt")?.data?.disposition === "handled"
    ? commandResponse(responses, "prompt")
    : undefined;
}

function aboutNotification(responses) {
  return responses.find((row) => row?.type === "extension_ui_request" && row.method === "notify"
    && row.notifyType === "info"
    && row.message === "Pi Startup Picker is loaded. On normal startup it will offer a searchable provider/model picker before the session begins.");
}

function parseErrorResponse(responses) {
  return responses.find((row) => row?.type === "response" && row.command === "parse"
    && row.success === false && typeof row.error === "string" && row.error.length > 0);
}

export function behaviorAssertions(name, {
  responses,
  fullOutput,
  exit_code,
  expectedVersion,
  processExited,
  selectionCompleted,
  selectedRecent,
}) {
  const hasUnhandled = UNHANDLED_ERROR_PATTERN.test(fullOutput)
    || responses.some((row) => row?.type === "extension_error");
  const hasLoadError = EXTENSION_LOAD_ERROR_PATTERN.test(fullOutput)
    || responses.some((row) => row?.type === "extension_error");

  if (name === "extension_load") {
    const command = registeredPicker(responses);
    return [assertion("extension_registered", "Actual Pi registers startup-picker:about from the loaded extension",
      command ?? null, !!command)];
  }
  if (name === "happy_path") {
    const selectedModel = modelState(responses);
    const handledPrompt = aboutResponse(responses);
    const notification = aboutNotification(responses);
    return [assertion("feature_response", "Actual Pi selects the configured offline model and handles the extension command",
      { model: selectedModel?.data?.model ?? null, selectionCompleted: selectionCompleted === true,
        prompt: handledPrompt ?? null, notification: notification ?? null },
      !!selectedModel && selectionCompleted === true && !!registeredPicker(responses) && !!handledPrompt && !!notification)];
  }
  if (name === "error_path") {
    const errorResponse = parseErrorResponse(responses);
    return [assertion("handled_error", "Malformed RPC input returns a structured parse failure while the host remains usable",
      { parse: errorResponse ?? null, extensionRegistered: !!registeredPicker(responses) },
      !!errorResponse && !!registeredPicker(responses))];
  }
  if (name === "reload_cleanup") {
    const command = registeredPicker(responses);
    const selectedModel = modelState(responses);
    const handledPrompt = aboutResponse(responses);
    const notification = aboutNotification(responses);
    return [
      assertion("reloaded_extension_registered", "The second actual Pi process registers startup-picker:about",
        command ?? null, !!command),
      assertion("reloaded_feature_response", "The second process selects the persisted recent model and handles the extension command",
        { model: selectedModel?.data?.model ?? null, selectedRecent: selectedRecent === true,
          prompt: handledPrompt ?? null, notification: notification ?? null },
        !!selectedModel && selectedRecent === true && !!handledPrompt && !!notification),
      assertion("clean_shutdown", "The second Pi process exits zero without unhandled or extension shutdown errors",
        { processExited: processExited === true, exit_code, unhandled: hasUnhandled, loadError: hasLoadError },
        processExited === true && exit_code === 0 && !hasUnhandled && !hasLoadError),
    ];
  }
  if (name === "host_shell") {
    const output = fullOutput.trim();
    return [assertion("native_shell_boundary", "The native host shell launches the locally pinned Pi CLI and reports its exact SDK version",
      { exit_code, output, expectedVersion }, exit_code === 0 && output === expectedVersion)];
  }
  throw new Error(`Unknown smoke case: ${name}`);
}
