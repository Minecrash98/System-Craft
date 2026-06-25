export type ElevenLabsErrorCode =
  | "configuration_error"
  | "invalid_request"
  | "timeout"
  | "unauthorized"
  | "rate_limited"
  | "provider_error"
  | "malformed_response";

interface ElevenLabsErrorOptions {
  code: ElevenLabsErrorCode;
  message: string;
  status?: number;
  providerRequestId?: string;
  providerMessage?: string;
  retryAfterMs?: number;
  cause?: unknown;
}

export class ElevenLabsError extends Error {
  readonly code: ElevenLabsErrorCode;
  readonly status?: number;
  readonly providerRequestId?: string;
  readonly providerMessage?: string;
  readonly retryAfterMs?: number;

  constructor({
    code,
    message,
    status,
    providerRequestId,
    providerMessage,
    retryAfterMs,
    cause
  }: ElevenLabsErrorOptions) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "ElevenLabsError";
    this.code = code;
    this.status = status;
    this.providerRequestId = providerRequestId;
    this.providerMessage = providerMessage;
    this.retryAfterMs = retryAfterMs;
  }
}

export function isElevenLabsError(error: unknown): error is ElevenLabsError {
  return error instanceof ElevenLabsError;
}
