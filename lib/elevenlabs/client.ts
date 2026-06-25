import { ElevenLabsError } from "./errors";
import type {
  CreateDialogueInput,
  CreateSpeechInput,
  ElevenLabsAudioMetadata,
  ElevenLabsAudioResult,
  ElevenLabsClientOptions,
  ElevenLabsEndpoint,
  ElevenLabsFetch,
  ElevenLabsOutputFormat,
  ElevenLabsVoiceSettings
} from "./types";

const DEFAULT_BASE_URL = "https://api.elevenlabs.io/v1";
const DEFAULT_TTS_MODEL = "eleven_multilingual_v2";
const DEFAULT_DIALOGUE_MODEL = "eleven_v3";
const DEFAULT_OUTPUT_FORMAT: ElevenLabsOutputFormat = "mp3_44100_128";
const DEFAULT_TIMEOUT_MS = 120000;
const MAX_TIMEOUT_MS = 180000;
const MAX_DIALOGUE_CHARACTERS = 2000;
const MAX_DIALOGUE_VOICES = 10;

interface ResolvedConfig {
  apiKey: string;
  baseUrl: string;
  fetch: ElevenLabsFetch;
  timeoutMs: number;
  speechVoiceId?: string;
  ttsModelId: string;
  dialogueModelId: string;
  outputFormat: ElevenLabsOutputFormat;
}

interface RequestAudioOptions {
  endpoint: ElevenLabsEndpoint;
  path: string;
  payload: Record<string, unknown>;
  config: ResolvedConfig;
  outputFormat: ElevenLabsOutputFormat;
  metadata: Omit<
    ElevenLabsAudioMetadata,
    | "provider"
    | "contentType"
    | "byteLength"
    | "characterCost"
    | "providerRequestId"
    | "status"
    | "elapsedMs"
  >;
}

export async function createSpeech(
  input: CreateSpeechInput,
  options: ElevenLabsClientOptions = {}
): Promise<ElevenLabsAudioResult> {
  const config = resolveConfig(options);
  const text = normalizeRequiredText(input.text, "Speech text");
  const voiceId = normalizeOptionalText(
    input.voiceId ?? config.speechVoiceId,
    "Speech voice ID"
  );

  if (!voiceId) {
    throw new ElevenLabsError({
      code: "configuration_error",
      message:
        "ELEVENLABS_NARRATOR_VOICE_ID or a server-provided speech voice ID is required."
    });
  }

  const modelId = normalizeOptionalText(input.modelId, "Speech model ID") ?? config.ttsModelId;
  const outputFormat = input.outputFormat ?? config.outputFormat;
  const characterCount = countCharacters(text);

  return requestAudio({
    endpoint: "createSpeech",
    path: `/text-to-speech/${encodeURIComponent(voiceId)}`,
    config,
    outputFormat,
    metadata: {
      endpoint: "createSpeech",
      modelId,
      outputFormat,
      characterCount,
      requestId: input.metadata?.requestId,
      traceId: input.metadata?.traceId,
      voiceId
    },
    payload: compactObject({
      text,
      model_id: modelId,
      language_code: input.languageCode,
      voice_settings: serializeVoiceSettings(input.voiceSettings),
      seed: input.seed,
      previous_text: input.previousText,
      next_text: input.nextText,
      previous_request_ids: input.previousRequestIds,
      next_request_ids: input.nextRequestIds,
      apply_text_normalization: input.textNormalization,
      apply_language_text_normalization: input.languageTextNormalization
    })
  });
}

export async function createDialogue(
  input: CreateDialogueInput,
  options: ElevenLabsClientOptions = {}
): Promise<ElevenLabsAudioResult> {
  const config = resolveConfig(options);

  if (input.inputs.length === 0) {
    throw new ElevenLabsError({
      code: "invalid_request",
      message: "Dialogue input must include at least one turn."
    });
  }

  const normalizedInputs = input.inputs.map((dialogueInput, index) => ({
    text: normalizeRequiredText(dialogueInput.text, `Dialogue turn ${index + 1} text`),
    voiceId: normalizeRequiredText(
      dialogueInput.voiceId,
      `Dialogue turn ${index + 1} voice ID`
    )
  }));
  const characterCount = normalizedInputs.reduce(
    (total, dialogueInput) => total + countCharacters(dialogueInput.text),
    0
  );
  const voiceCount = new Set(
    normalizedInputs.map((dialogueInput) => dialogueInput.voiceId)
  ).size;

  if (characterCount > MAX_DIALOGUE_CHARACTERS) {
    throw new ElevenLabsError({
      code: "invalid_request",
      message: `Dialogue text must be ${MAX_DIALOGUE_CHARACTERS} characters or fewer.`
    });
  }

  if (voiceCount > MAX_DIALOGUE_VOICES) {
    throw new ElevenLabsError({
      code: "invalid_request",
      message: `Dialogue input must use ${MAX_DIALOGUE_VOICES} or fewer unique voices.`
    });
  }

  const modelId =
    normalizeOptionalText(input.modelId, "Dialogue model ID") ?? config.dialogueModelId;
  const outputFormat = input.outputFormat ?? config.outputFormat;

  return requestAudio({
    endpoint: "createDialogue",
    path: "/text-to-dialogue",
    config,
    outputFormat,
    metadata: {
      endpoint: "createDialogue",
      modelId,
      outputFormat,
      characterCount,
      requestId: input.metadata?.requestId,
      traceId: input.metadata?.traceId,
      voiceCount,
      turnCount: normalizedInputs.length
    },
    payload: compactObject({
      inputs: normalizedInputs.map((dialogueInput) => ({
        text: dialogueInput.text,
        voice_id: dialogueInput.voiceId
      })),
      model_id: modelId,
      language_code: input.languageCode,
      seed: input.seed,
      apply_text_normalization: input.textNormalization
    })
  });
}

async function requestAudio({
  endpoint,
  path,
  payload,
  config,
  outputFormat,
  metadata
}: RequestAudioOptions): Promise<ElevenLabsAudioResult> {
  const startedAt = Date.now();
  const url = buildUrl(config.baseUrl, path, outputFormat);
  const response = await fetchWithTimeout(
    endpoint,
    config.fetch,
    url,
    {
      method: "POST",
      headers: {
        Accept: "audio/mpeg, audio/*, application/octet-stream",
        "Content-Type": "application/json",
        "xi-api-key": config.apiKey
      },
      body: JSON.stringify(payload)
    },
    config.timeoutMs
  );
  const providerRequestId = readHeader(response.headers, [
    "request-id",
    "x-request-id",
    "xi-request-id"
  ]);

  if (!response.ok) {
    await throwProviderError(endpoint, response, providerRequestId);
  }

  const contentType = response.headers.get("content-type") ?? "application/octet-stream";

  if (contentType.toLowerCase().includes("application/json")) {
    const providerMessage = await readSafeBody(response);
    throw new ElevenLabsError({
      code: "malformed_response",
      message: `ElevenLabs ${endpoint} returned JSON instead of audio bytes.`,
      status: response.status,
      providerRequestId,
      providerMessage
    });
  }

  let bytes: Uint8Array;

  try {
    bytes = new Uint8Array(await response.arrayBuffer());
  } catch (cause) {
    throw new ElevenLabsError({
      code: "malformed_response",
      message: `ElevenLabs ${endpoint} audio response could not be read.`,
      status: response.status,
      providerRequestId,
      cause
    });
  }

  if (bytes.byteLength === 0) {
    throw new ElevenLabsError({
      code: "malformed_response",
      message: `ElevenLabs ${endpoint} returned an empty audio response.`,
      status: response.status,
      providerRequestId
    });
  }

  const resultMetadata: ElevenLabsAudioMetadata = {
    ...metadata,
    provider: "elevenlabs",
    contentType,
    byteLength: bytes.byteLength,
    characterCost: readNumberHeader(response.headers, [
      "character-cost",
      "x-character-cost",
      "x-elevenlabs-character-cost",
      "elevenlabs-character-cost"
    ]),
    providerRequestId,
    status: response.status,
    elapsedMs: Date.now() - startedAt
  };

  return {
    bytes,
    contentType,
    metadata: resultMetadata
  };
}

function resolveConfig(options: ElevenLabsClientOptions): ResolvedConfig {
  assertServerExecution();

  const apiKey = normalizeOptionalText(
    options.apiKey ?? process.env.ELEVENLABS_API_KEY,
    "ElevenLabs API key"
  );
  const fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis);

  if (!apiKey) {
    throw new ElevenLabsError({
      code: "configuration_error",
      message: "ELEVENLABS_API_KEY is not configured."
    });
  }

  if (!fetchImpl) {
    throw new ElevenLabsError({
      code: "configuration_error",
      message: "No fetch implementation is available for ElevenLabs requests."
    });
  }

  return {
    apiKey,
    baseUrl:
      normalizeOptionalText(options.baseUrl, "ElevenLabs base URL") ?? DEFAULT_BASE_URL,
    fetch: fetchImpl,
    timeoutMs: resolveTimeoutMs(options.timeoutMs),
    speechVoiceId: normalizeOptionalText(
      options.speechVoiceId ?? process.env.ELEVENLABS_NARRATOR_VOICE_ID,
      "Speech voice ID"
    ),
    ttsModelId:
      normalizeOptionalText(
        options.ttsModelId ?? process.env.ELEVENLABS_TTS_MODEL,
        "TTS model ID"
      ) ?? DEFAULT_TTS_MODEL,
    dialogueModelId:
      normalizeOptionalText(
        options.dialogueModelId ?? process.env.ELEVENLABS_DIALOGUE_MODEL,
        "Dialogue model ID"
      ) ?? DEFAULT_DIALOGUE_MODEL,
    outputFormat:
      normalizeOptionalText(
        options.outputFormat ?? process.env.ELEVENLABS_OUTPUT_FORMAT,
        "ElevenLabs output format"
      ) ?? DEFAULT_OUTPUT_FORMAT
  };
}

function assertServerExecution() {
  if (typeof window !== "undefined") {
    throw new ElevenLabsError({
      code: "configuration_error",
      message: "ElevenLabs audio calls can only run during server execution."
    });
  }
}

async function fetchWithTimeout(
  endpoint: ElevenLabsEndpoint,
  fetchImpl: ElevenLabsFetch,
  url: URL,
  init: RequestInit,
  timeoutMs: number
) {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutError = new ElevenLabsError({
    code: "timeout",
    message: `ElevenLabs ${endpoint} timed out after ${timeoutMs}ms.`
  });
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<Response>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(timeoutError);
    }, timeoutMs);
  });

  try {
    const response = await Promise.race([
      fetchImpl(url, { ...init, signal: controller.signal }),
      timeoutPromise
    ]);

    return response;
  } catch (cause) {
    if (cause instanceof ElevenLabsError) {
      throw cause;
    }

    if (timedOut || isAbortError(cause)) {
      throw timeoutError;
    }

    throw new ElevenLabsError({
      code: "provider_error",
      message: `ElevenLabs ${endpoint} request failed before a provider response.`,
      cause
    });
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

async function throwProviderError(
  endpoint: ElevenLabsEndpoint,
  response: Response,
  providerRequestId?: string
): Promise<never> {
  const providerMessage = await readSafeBody(response);
  const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));

  if (response.status === 401 || response.status === 403) {
    throw new ElevenLabsError({
      code: "unauthorized",
      message: `ElevenLabs ${endpoint} was rejected by the provider.`,
      status: response.status,
      providerRequestId,
      providerMessage,
      retryAfterMs
    });
  }

  if (response.status === 429) {
    throw new ElevenLabsError({
      code: "rate_limited",
      message: `ElevenLabs ${endpoint} was rate limited by the provider.`,
      status: response.status,
      providerRequestId,
      providerMessage,
      retryAfterMs
    });
  }

  throw new ElevenLabsError({
    code: "provider_error",
    message: `ElevenLabs ${endpoint} failed with status ${response.status}.`,
    status: response.status,
    providerRequestId,
    providerMessage,
    retryAfterMs
  });
}

function buildUrl(
  baseUrl: string,
  path: string,
  outputFormat: ElevenLabsOutputFormat
) {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const url = new URL(path.replace(/^\//, ""), normalizedBase);
  url.searchParams.set("output_format", outputFormat);
  return url;
}

function serializeVoiceSettings(settings?: ElevenLabsVoiceSettings) {
  if (!settings) {
    return undefined;
  }

  return compactObject({
    stability: settings.stability,
    similarity_boost: settings.similarityBoost,
    style: settings.style,
    use_speaker_boost: settings.speakerBoost,
    speed: settings.speed
  });
}

function normalizeRequiredText(value: string, label: string) {
  const normalized = normalizeOptionalText(value, label);

  if (!normalized) {
    throw new ElevenLabsError({
      code: "invalid_request",
      message: `${label} is required.`
    });
  }

  return normalized;
}

function normalizeOptionalText(value: string | undefined, label: string) {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();

  if (normalized.length === 0) {
    if (label === "ElevenLabs API key") {
      return undefined;
    }

    throw new ElevenLabsError({
      code: "invalid_request",
      message: `${label} cannot be blank.`
    });
  }

  return normalized;
}

function resolveTimeoutMs(optionTimeoutMs?: number) {
  const rawTimeout =
    optionTimeoutMs ?? readEnvNumber("ELEVENLABS_TIMEOUT_MS") ?? DEFAULT_TIMEOUT_MS;

  if (!Number.isFinite(rawTimeout) || rawTimeout <= 0) {
    throw new ElevenLabsError({
      code: "configuration_error",
      message: "ELEVENLABS_TIMEOUT_MS must be a positive number."
    });
  }

  return Math.min(Math.round(rawTimeout), MAX_TIMEOUT_MS);
}

function readEnvNumber(name: string) {
  const value = process.env[name];

  if (!value || value.trim().length === 0) {
    return undefined;
  }

  return Number(value);
}

function compactObject<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter((entry) => entry[1] !== undefined)
  );
}

function countCharacters(value: string) {
  return Array.from(value).length;
}

function readHeader(headers: Headers, names: string[]) {
  for (const name of names) {
    const value = headers.get(name);

    if (value) {
      return value;
    }
  }

  return undefined;
}

function readNumberHeader(headers: Headers, names: string[]) {
  const value = readHeader(headers, names);

  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function readSafeBody(response: Response) {
  try {
    const body = await response.text();
    return body.slice(0, 400);
  } catch {
    return undefined;
  }
}

function parseRetryAfterMs(value: string | null) {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);

  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.round(seconds * 1000));
  }

  const dateMs = Date.parse(value);

  if (!Number.isNaN(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return undefined;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
