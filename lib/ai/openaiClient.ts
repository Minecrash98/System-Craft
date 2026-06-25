interface JsonPromptOptions {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

export async function runJsonPrompt<T>({
  systemPrompt,
  userPrompt,
  temperature = 0.2,
  maxTokens = 4000
}: JsonPromptOptions): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS ?? 60000);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const requestBody: Record<string, unknown> = {
    model,
    max_completion_tokens: maxTokens,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]
  };

  if (supportsTemperature(model)) {
    requestBody.temperature = temperature;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `OpenAI request failed with ${response.status}: ${detail.slice(0, 400)}`
      );
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    const content = payload.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("OpenAI response did not include JSON content.");
    }

    return parseJsonContent<T>(content);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`OpenAI request timed out after ${timeoutMs}ms.`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function* streamTextPrompt({
  systemPrompt,
  userPrompt,
  temperature = 0.2,
  maxTokens = 4000
}: JsonPromptOptions): AsyncGenerator<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  const timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS ?? 60000);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const requestBody: Record<string, unknown> = {
    model,
    instructions: systemPrompt,
    input: userPrompt,
    max_output_tokens: maxTokens,
    stream: true,
    store: false
  };

  if (supportsTemperature(model)) {
    requestBody.temperature = temperature;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `OpenAI Responses request failed with ${response.status}: ${detail.slice(0, 400)}`
      );
    }

    if (!response.body) {
      throw new Error("OpenAI Responses stream did not include a response body.");
    }

    clearTimeout(timeoutId);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const delta = parseResponsesStreamLine(line);

          if (delta) {
            yield delta;
          }
        }
      }

      const trailing = decoder.decode();
      buffer += trailing;

      for (const line of buffer.split(/\r?\n/)) {
        const delta = parseResponsesStreamLine(line);

        if (delta) {
          yield delta;
        }
      }
    } finally {
      reader.releaseLock();
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`OpenAI Responses request timed out after ${timeoutMs}ms.`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
function supportsTemperature(model: string) {
  const normalized = model.toLowerCase();

  return !(
    normalized.startsWith("gpt-5") ||
    normalized.startsWith("o1") ||
    normalized.startsWith("o3") ||
    normalized.startsWith("o4")
  );
}

function parseJsonContent<T>(content: string): T {
  const normalized = stripMarkdownFence(content.trim());
  const direct = tryParseJson(normalized);

  if (direct.ok) {
    return unwrapJsonString(direct.value) as T;
  }

  const extracted = extractJsonBlock(normalized);

  if (extracted) {
    const parsed = tryParseJson(extracted);

    if (parsed.ok) {
      return unwrapJsonString(parsed.value) as T;
    }
  }

  throw new Error("OpenAI response did not contain parseable JSON content.");
}

function stripMarkdownFence(value: string) {
  return value
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function tryParseJson(value: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(value) };
  } catch {
    return { ok: false };
  }
}

function unwrapJsonString(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = stripMarkdownFence(value.trim());
  const parsed = tryParseJson(normalized);

  if (parsed.ok) {
    return parsed.value;
  }

  const extracted = extractJsonBlock(normalized);

  if (!extracted) {
    return value;
  }

  const extractedParsed = tryParseJson(extracted);
  return extractedParsed.ok ? extractedParsed.value : value;
}

function extractJsonBlock(value: string) {
  const objectStart = value.indexOf("{");
  const arrayStart = value.indexOf("[");
  const starts = [objectStart, arrayStart].filter((index) => index >= 0);

  if (starts.length === 0) {
    return null;
  }

  const start = Math.min(...starts);
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let index = start; index < value.length; index += 1) {
    const char = value[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === "\\") {
        escaped = true;
        continue;
      }

      if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") {
      stack.push("}");
      continue;
    }

    if (char === "[") {
      stack.push("]");
      continue;
    }

    if (char === "}" || char === "]") {
      if (stack.pop() !== char) {
        return null;
      }

      if (stack.length === 0) {
        return value.slice(start, index + 1);
      }
    }
  }

  return null;
}

function parseResponsesStreamLine(line: string) {
  const trimmed = line.trim();

  if (!trimmed.startsWith("data:")) {
    return null;
  }

  const data = trimmed.slice("data:".length).trim();

  if (!data || data === "[DONE]") {
    return null;
  }

  const parsed = tryParseJson(data);

  if (!parsed.ok) {
    return null;
  }

  const event = parsed.value;
  const errorMessage = getResponsesStreamError(event);

  if (errorMessage) {
    throw new Error(errorMessage);
  }

  return getResponsesStreamDelta(event);
}

function getResponsesStreamDelta(event: unknown) {
  if (!isRecord(event)) {
    return null;
  }

  if (
    event.type === "response.output_text.delta" &&
    typeof event.delta === "string"
  ) {
    return event.delta;
  }

  if (
    typeof event.type === "string" &&
    event.type.endsWith(".delta") &&
    typeof event.delta === "string"
  ) {
    return event.delta;
  }

  return null;
}

function getResponsesStreamError(event: unknown) {
  if (!isRecord(event)) {
    return null;
  }

  if (event.type === "error" && isRecord(event.error)) {
    return typeof event.error.message === "string"
      ? event.error.message
      : "OpenAI Responses stream returned an error event.";
  }

  if (event.type === "response.failed" && isRecord(event.response)) {
    const responseError = event.response.error;

    if (isRecord(responseError) && typeof responseError.message === "string") {
      return responseError.message;
    }

    return "OpenAI Responses stream failed.";
  }

  if (event.type === "response.incomplete" && isRecord(event.response)) {
    const incomplete = event.response.incomplete_details;

    if (isRecord(incomplete) && typeof incomplete.reason === "string") {
      return `OpenAI Responses stream ended incomplete: ${incomplete.reason}.`;
    }
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
