/**
 * Standardized error shapes for MCP tool responses.
 *
 * The MCP protocol represents tool failures via `isError: true` plus a
 * human-readable `content` block. We wrap errors in a consistent shape so
 * that clients can display them uniformly and so that smoke tests can match
 * on `error_code` without parsing free-form strings.
 */

export type CrossmintMcpErrorCode =
  | "CONFIG_MISSING"
  | "WALLET_NOT_FOUND"
  | "INSUFFICIENT_BALANCE"
  | "X402_CHALLENGE_FAILED"
  | "X402_PAYMENT_REJECTED"
  | "SDK_ERROR"
  | "NETWORK_ERROR"
  | "VALIDATION_ERROR"
  | "UNKNOWN";

export interface CrossmintMcpErrorPayload {
  error_code: CrossmintMcpErrorCode;
  message: string;
  hint?: string;
}

export function toolErrorResponse(
  code: CrossmintMcpErrorCode,
  message: string,
  hint?: string,
): {
  isError: true;
  content: Array<{ type: "text"; text: string }>;
} {
  const payload: CrossmintMcpErrorPayload = { error_code: code, message };
  if (hint) payload.hint = hint;
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

export function classifyError(err: unknown): CrossmintMcpErrorCode {
  if (!(err instanceof Error)) return "UNKNOWN";
  const msg = err.message.toLowerCase();
  if (msg.includes("env var") || msg.includes("required")) return "CONFIG_MISSING";
  if (msg.includes("not found") || msg.includes("does not exist"))
    return "WALLET_NOT_FOUND";
  if (msg.includes("insufficient")) return "INSUFFICIENT_BALANCE";
  if (msg.includes("402") || msg.includes("x-payment")) return "X402_CHALLENGE_FAILED";
  if (msg.includes("fetch") || msg.includes("network") || msg.includes("econn"))
    return "NETWORK_ERROR";
  return "SDK_ERROR";
}
