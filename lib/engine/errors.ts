export type ErrorKind =
  | "rate_limit"
  | "auth"
  | "network"
  | "provider_down"
  | "token_exceeded"
  | "parse_error"
  | "unknown";

export class ResearchError extends Error {
  readonly kind: ErrorKind;
  readonly provider?: string;
  readonly statusCode?: number;
  readonly retryable: boolean;

  constructor(
    message: string,
    kind: ErrorKind,
    options?: { provider?: string; statusCode?: number }
  ) {
    super(message);
    this.name = "ResearchError";
    this.kind = kind;
    this.provider = options?.provider;
    this.statusCode = options?.statusCode;
    this.retryable = isRetryable(kind, options?.statusCode);
  }
}

function isRetryable(kind: ErrorKind, statusCode?: number): boolean {
  if (kind === "rate_limit") return true;
  if (kind === "network") return true;
  if (kind === "provider_down") return true;
  if (statusCode && statusCode >= 500) return true;
  return false;
}

export function classifyError(error: unknown, provider?: string): ResearchError {
  if (error instanceof ResearchError) return error;

  // AbortSignal.timeout() throws a DOMException with name "TimeoutError"
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return new ResearchError("Request timed out", "network", { provider });
  }
  if (error instanceof Error && error.name === "AbortError") {
    return new ResearchError("Request aborted", "network", { provider });
  }

  if (error instanceof TypeError && error.message.includes("fetch")) {
    return new ResearchError("Network error — could not reach API", "network", {
      provider,
    });
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes("rate limit") || msg.includes("429")) {
      return new ResearchError("Rate limit exceeded", "rate_limit", { provider });
    }
    if (msg.includes("unauthorized") || msg.includes("401") || msg.includes("api key")) {
      return new ResearchError("Authentication failed — check API key", "auth", {
        provider,
        statusCode: 401,
      });
    }
    if (msg.includes("502") || msg.includes("503") || msg.includes("504")) {
      return new ResearchError("Provider temporarily unavailable", "provider_down", {
        provider,
      });
    }
    return new ResearchError(error.message, "unknown", { provider });
  }

  return new ResearchError("An unknown error occurred", "unknown", { provider });
}

export function userFacingMessage(error: ResearchError): string {
  switch (error.kind) {
    case "rate_limit":
      return "Too many requests — retrying with a different provider...";
    case "auth":
      return "API key is missing or invalid. Please check your configuration.";
    case "network":
      return "Could not connect to the service. Check your internet connection.";
    case "provider_down":
      return "The AI provider is temporarily down. Trying an alternative...";
    case "token_exceeded":
      return "The query is too complex. Try a shorter or simpler question.";
    case "parse_error":
      return "Failed to process the response. Trying again...";
    default:
      return "Something went wrong. Please try again.";
  }
}
