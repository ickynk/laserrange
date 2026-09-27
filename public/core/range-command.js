export const voiceCommands = ["moving", "cover", "retrograde"];
export function parseVoiceCommand(text) {
  const word = String(text)
    .toLowerCase()
    .trim()
    .replace(/[.!?,;:]+$/g, "")
    .trim();
  return voiceCommands.includes(word) ? word : null;
}
export function applyRangeCommand(command, { magazine, timeline, time }) {
  if (command === "cover") {
    if (!magazine.enabled) return { message: "Magazine counter is disabled." };
    return {
      accepted: true,
      message: "Magazine reloaded.",
      magazine: magazine.reload(),
    };
  }
  if (!["moving", "retrograde"].includes(command))
    return { message: "Unknown command." };
  if (!timeline.enabled)
    return {
      message:
        "Enable camera movement and segment pauses to use path commands.",
    };
  if (!timeline.state(time).held)
    return { message: "Camera is moving. Repeat the command at the endpoint." };
  const accepted = timeline.step(command === "moving" ? 1 : -1, time);
  return {
    accepted,
    message: accepted
      ? command === "moving"
        ? "Moving to next segment."
        : "Returning to previous segment."
      : "No further segment in that direction.",
  };
}
