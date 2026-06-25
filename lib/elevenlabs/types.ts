export type ElevenLabsEndpoint = "createSpeech" | "createDialogue";

export type ElevenLabsOutputFormat =
  | "mp3_22050_32"
  | "mp3_44100_64"
  | "mp3_44100_96"
  | "mp3_44100_128"
  | "mp3_44100_192"
  | "pcm_16000"
  | "pcm_22050"
  | "pcm_24000"
  | "pcm_44100"
  | "ulaw_8000"
  | (string & {});

export type ElevenLabsTextNormalization = "auto" | "on" | "off";

export type ElevenLabsFetch = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1]
) => Promise<Response>;

export interface ElevenLabsClientOptions {
  apiKey?: string;
  baseUrl?: string;
  fetch?: ElevenLabsFetch;
  timeoutMs?: number;
  speechVoiceId?: string;
  ttsModelId?: string;
  dialogueModelId?: string;
  outputFormat?: ElevenLabsOutputFormat;
}

export interface ElevenLabsRequestMetadata {
  requestId?: string;
  traceId?: string;
}

export interface ElevenLabsVoiceSettings {
  stability?: number;
  similarityBoost?: number;
  style?: number;
  speakerBoost?: boolean;
  speed?: number;
}

export interface CreateSpeechInput {
  text: string;
  voiceId?: string;
  modelId?: string;
  outputFormat?: ElevenLabsOutputFormat;
  languageCode?: string;
  voiceSettings?: ElevenLabsVoiceSettings;
  seed?: number;
  previousText?: string;
  nextText?: string;
  previousRequestIds?: string[];
  nextRequestIds?: string[];
  textNormalization?: ElevenLabsTextNormalization;
  languageTextNormalization?: boolean;
  metadata?: ElevenLabsRequestMetadata;
}

export interface ElevenLabsDialogueInput {
  text: string;
  voiceId: string;
  role?: string;
}

export interface CreateDialogueInput {
  inputs: ElevenLabsDialogueInput[];
  modelId?: string;
  outputFormat?: ElevenLabsOutputFormat;
  languageCode?: string;
  seed?: number;
  textNormalization?: ElevenLabsTextNormalization;
  metadata?: ElevenLabsRequestMetadata;
}

export interface ElevenLabsAudioMetadata {
  provider: "elevenlabs";
  endpoint: ElevenLabsEndpoint;
  modelId: string;
  outputFormat: ElevenLabsOutputFormat;
  contentType: string;
  byteLength: number;
  characterCount: number;
  characterCost?: number;
  requestId?: string;
  traceId?: string;
  providerRequestId?: string;
  status: number;
  elapsedMs: number;
  voiceId?: string;
  voiceCount?: number;
  turnCount?: number;
}

export interface ElevenLabsAudioResult {
  bytes: Uint8Array;
  contentType: string;
  metadata: ElevenLabsAudioMetadata;
}
