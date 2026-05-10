import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { nowIso, verifyEnvelope } from "./crypto.js";
import {
  AGENT_NONCE_TTL_MS,
  isRecord,
  pruneNonceWindow,
  hasSeenNonce,
  rememberNonce,
} from "./http-util.js";
import { RemoteStore } from "./store.js";
import { parseActionResultEnvelope, parseAgentHelloEnvelope } from "./schemas.js";
import type {
  ActionRecord,
  ActionResultEnvelope,
  AgentHelloEnvelope,
  AuditEvent,
  RemoteAgentRecord,
  RemoteErrorCode,
} from "./types.js";
import { acceptWebSocketUpgrade, type MinimalWebSocketConnection } from "./websocket.js";

export interface AgentConnection {
  agent: RemoteAgentRecord;
  connection: MinimalWebSocketConnection;
  seenNonces: Map<string, number>;
}

export interface PendingAction {
  action: ActionRecord;
  resolve: (value: ActionResultEnvelope) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

/** Handles agent WebSocket connection lifecycle for RemoteControlPlane. */
export class AgentWebSocketHandler {
  constructor(
    private readonly config: { agentWsPath: string },
    private readonly store: RemoteStore,
    private readonly agentConnections: Map<string, AgentConnection>,
    private readonly agentHelloNonces: Map<string, Map<string, number>>,
    private readonly pendingActions: Map<string, PendingAction>,
    private readonly audit: (event: Omit<AuditEvent, "id" | "createdAt">) => void,
  ) {}

  handleUpgrade(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer<ArrayBufferLike>,
    pathname: string,
  ): boolean {
    if (pathname !== this.config.agentWsPath) {
      return false;
    }
    const connection = acceptWebSocketUpgrade(req, socket, head);
    connection.onText((message) => {
      void this.handleAgentMessage(connection, message).catch(() => {
        connection.sendJson({
          type: "error",
          code: "INTERNAL_ERROR",
          message: "Agent message failed",
        });
        connection.close();
      });
    });
    return true;
  }

  private async handleAgentMessage(
    connection: MinimalWebSocketConnection,
    message: string,
  ): Promise<void> {
    const payload = JSON.parse(message) as unknown;
    if (!isRecord(payload)) {
      connection.sendJson({ type: "error", code: "INTERNAL_ERROR", message: "Invalid message" });
      connection.close();
      return;
    }
    if (payload.type === "agent.hello") {
      await this.handleAgentHello(connection, parseAgentHelloEnvelope(payload));
      return;
    }
    if (payload.type === "action.result") {
      await this.handleActionResult(connection, parseActionResultEnvelope(payload));
      return;
    }
    connection.sendJson({ type: "error", code: "INTERNAL_ERROR", message: "Unknown message type" });
    connection.close();
  }

  private async handleAgentHello(
    connection: MinimalWebSocketConnection,
    hello: AgentHelloEnvelope,
  ): Promise<void> {
    const agent = this.store.getAgent(hello.agent_id);
    if (!agent || agent.status === "revoked" || !agent.publicKey) {
      connection.sendJson({
        type: "error",
        code: "AGENT_NOT_FOUND",
        message: "Agent is not enrolled",
      });
      connection.close();
      return;
    }
    if (!verifyEnvelope(hello as unknown as Record<string, unknown>, agent.publicKey)) {
      this.audit({
        userId: agent.userId,
        agentId: agent.id,
        eventType: "agent_signature_invalid",
        severity: "warn",
        metadata: { message_type: "agent.hello" },
      });
      connection.sendJson({
        type: "error",
        code: "SIGNATURE_INVALID",
        message: "Agent signature is invalid",
      });
      connection.close();
      return;
    }
    const timestampAgeMs = Math.abs(Date.now() - new Date(hello.timestamp).getTime());
    if (timestampAgeMs > 300_000) {
      this.audit({
        userId: agent.userId,
        agentId: agent.id,
        eventType: "agent_hello_expired",
        severity: "warn",
        metadata: {},
      });
      connection.sendJson({
        type: "error",
        code: "ACTION_EXPIRED",
        message: "Agent hello timestamp is stale",
      });
      connection.close();
      return;
    }
    const now = Date.now();
    this.cleanupEphemeralState(now);
    const existingConnection = this.agentConnections.get(agent.id);
    if (existingConnection?.connection === connection) {
      this.audit({
        userId: agent.userId,
        agentId: agent.id,
        eventType: "agent_duplicate_hello_rejected",
        severity: "warn",
        metadata: {},
      });
      connection.sendJson({
        type: "error",
        code: "ACTION_REPLAY_DETECTED",
        message: "Agent hello was already processed on this connection",
      });
      connection.close();
      return;
    }
    const helloNonces = this.agentHelloNonces.get(agent.id) ?? new Map<string, number>();
    if (helloNonces.has(hello.nonce)) {
      this.audit({
        userId: agent.userId,
        agentId: agent.id,
        eventType: "agent_hello_replay_detected",
        severity: "warn",
        metadata: {},
      });
      connection.sendJson({
        type: "error",
        code: "ACTION_REPLAY_DETECTED",
        message: "Agent hello nonce was already used",
      });
      connection.close();
      return;
    }
    helloNonces.set(hello.nonce, now + AGENT_NONCE_TTL_MS);
    this.agentHelloNonces.set(agent.id, helloNonces);
    if (existingConnection) {
      existingConnection.connection.close();
    }
    const seenNonces = new Map<string, number>();
    rememberNonce(seenNonces, hello.nonce, now);
    this.agentConnections.set(agent.id, { agent, connection, seenNonces });
    const online: RemoteAgentRecord = {
      ...agent,
      status: "online",
      lastSeenAt: nowIso(),
      hostMetadata: hello.host,
      updatedAt: nowIso(),
    };
    this.store.updateAgent(online);
    connection.onClose(() => {
      const live = this.agentConnections.get(agent.id);
      if (live?.connection !== connection) {
        return;
      }
      this.agentConnections.delete(agent.id);
      const latest = this.store.getAgent(agent.id);
      if (latest && latest.status !== "revoked") {
        this.store.updateAgent({ ...latest, status: "offline", updatedAt: nowIso() });
      }
      this.audit({
        userId: agent.userId,
        agentId: agent.id,
        eventType: "agent_disconnected",
        severity: "info",
        metadata: {},
      });
    });
    this.audit({
      userId: agent.userId,
      agentId: agent.id,
      eventType: "agent_connected",
      severity: "info",
      metadata: { agent_version: hello.agent_version, host: hello.host.hostname },
    });
    connection.sendJson({ type: "agent.ready", agent_id: agent.id, policy: agent.policy });
  }

  private async handleActionResult(
    connection: MinimalWebSocketConnection,
    result: ActionResultEnvelope,
  ): Promise<void> {
    const pending = this.pendingActions.get(result.action_id);
    if (!pending) {
      return;
    }
    const agent = this.store.getAgent(result.agent_id);
    if (
      !agent?.publicKey ||
      !verifyEnvelope(result as unknown as Record<string, unknown>, agent.publicKey)
    ) {
      clearTimeout(pending.timeout);
      this.pendingActions.delete(result.action_id);
      this.audit({
        userId: pending.action.userId,
        agentId: pending.action.agentId,
        actionId: pending.action.id,
        eventType: "agent_result_signature_invalid",
        severity: "warn",
        metadata: {},
      });
      pending.reject(new Error("Agent result signature is invalid"));
      return;
    }
    const live = this.agentConnections.get(result.agent_id);
    if (pending.action.agentId !== result.agent_id || live?.connection !== connection) {
      clearTimeout(pending.timeout);
      this.pendingActions.delete(result.action_id);
      this.audit({
        userId: pending.action.userId,
        agentId: pending.action.agentId,
        actionId: pending.action.id,
        eventType: "agent_result_connection_invalid",
        severity: "warn",
        metadata: {},
      });
      pending.reject(
        Object.assign(new Error("Agent result came from an unexpected connection"), {
          code: "SIGNATURE_INVALID" satisfies RemoteErrorCode,
        }),
      );
      return;
    }
    const now = Date.now();
    if (hasSeenNonce(live.seenNonces, result.nonce, now)) {
      clearTimeout(pending.timeout);
      this.pendingActions.delete(result.action_id);
      this.audit({
        userId: pending.action.userId,
        agentId: pending.action.agentId,
        actionId: pending.action.id,
        eventType: "agent_result_replay_detected",
        severity: "warn",
        metadata: {},
      });
      pending.reject(
        Object.assign(new Error("Agent result nonce was already used"), {
          code: "ACTION_REPLAY_DETECTED" satisfies RemoteErrorCode,
        }),
      );
      return;
    }
    rememberNonce(live.seenNonces, result.nonce, now);
    clearTimeout(pending.timeout);
    this.pendingActions.delete(result.action_id);
    pending.resolve(result);
  }

  cleanupEphemeralState(now = Date.now()): void {
    for (const [agentId, nonces] of this.agentHelloNonces.entries()) {
      pruneNonceWindow(nonces, now);
      if (nonces.size === 0) {
        this.agentHelloNonces.delete(agentId);
      }
    }
    for (const live of this.agentConnections.values()) {
      pruneNonceWindow(live.seenNonces, now);
    }
  }

  /** Number of currently connected agents. */
  get connectedAgentCount(): number {
    return this.agentConnections.size;
  }
}
