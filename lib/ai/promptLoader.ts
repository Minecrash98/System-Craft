import { readFile } from "node:fs/promises";
import path from "node:path";

export async function loadPrompt(
  fileName: "clarify.md" | "generateArchitecture.md" | "narrationScript.md"
) {
  return readFile(path.join(process.cwd(), "prompts", fileName), "utf8");
}
