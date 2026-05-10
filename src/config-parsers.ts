import * as fs from "node:fs";
import { logger } from "./logging.js";
import type { PolicyConfig } from "./policy.js";
import type { HostKeyPolicy } from "./types.js";

export const CONNECTOR_CREDENTIAL_PROVIDERS = ["none", "agent", "command"] as const;
export type ConnectorCredentialProvider = (typeof CONNECTOR_CREDENTIAL_PROVIDERS)[number];

export function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function parseInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseHostKeyPolicy(
  value: string | undefined,
  fallback: HostKeyPolicy,
): HostKeyPolicy {
  if (value === "strict" || value === "accept-new" || value === "insecure") {
    return value;
  }
  return fallback;
}

export function parseCredentialProvider(
  value: string | undefined,
  fallback: ConnectorCredentialProvider,
): ConnectorCredentialProvider {
  if (value === undefined || value === "") {
    return fallback;
  }
  if (CONNECTOR_CREDENTIAL_PROVIDERS.includes(value as ConnectorCredentialProvider)) {
    return value as ConnectorCredentialProvider;
  }
  return fallback;
}

export function parseAuthMode(
  value: string | undefined,
  fallback: "bearer" | "oauth",
): "bearer" | "oauth" {
  return value === "oauth" || value === "bearer" ? value : fallback;
}

/**
 * Map of deprecated environment variable names to their replacements.
 * Keys are deprecated names, values are the recommended replacements.
 */
const DEPRECATED_ENV_VARS: Record<string, string> = {
  PORT: "SSH_MCP_HTTP_PORT",
  KNOWN_HOSTS_PATH: "SSH_MCP_KNOWN_HOSTS_PATH",
  STRICT_HOST_KEY_CHECKING: "SSH_MCP_HOST_KEY_POLICY",
  SSH_MCP_STRICT_HOST_KEY: "SSH_MCP_HOST_KEY_POLICY",
  SSH_MCP_CONNECTOR_PROFILE: "SSH_MCP_TOOL_PROFILE",
};

/**
 * Check for deprecated environment variables and log migration warnings.
 * Returns a count of warnings issued for testing or reporting.
 */
export function checkDeprecatedEnvVars(): number {
  let count = 0;
  for (const [oldName, newName] of Object.entries(DEPRECATED_ENV_VARS)) {
    if (process.env[oldName] !== undefined) {
      logger.warn(
        `Environment variable ${oldName} is deprecated. Use ${newName} instead. ` +
          `Support for ${oldName} will be removed in a future release.`,
      );
      count++;
    }
  }
  return count;
}

export function loadPolicyFile(filePath: string | undefined): Partial<PolicyConfig> {
  if (!filePath) {
    return {};
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as Partial<PolicyConfig>;
  } catch (error) {
    logger.error("Failed to load explicitly configured policy file", {
      filePath,
      error,
    });
    throw new Error(
      `Invalid SSH_MCP_POLICY_FILE ${filePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
