import { DurableObject } from 'cloudflare:workers';

export interface Env {
  CALLS_APP_ID: string;
  CALLS_APP_TOKEN: string;
  ROOMS: DurableObjectNamespace<RoomDO>;
  ASSETS: Fetcher;
}

const CALLS_API = 'https://rtc.live.cloudflare.com/v1';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TrackInfo {
  trackName: string;
  mid: string;
  kind: string;
}

interface ParticipantInfo {
  participantId: string;
  name: string;
  sessionId: string;
  tracks: TrackInfo[];
}

// ── Durable Object: RoomDO ────────────────────────────────────────────────────
// Manages WebSocket connections and broadcasts signaling messages.

// RoomDO uses Durable Object storage + ctx.getWebSockets() so state survives hibernation.
// The in-memory Map approach breaks after the first hibernation cycle — every webSocketMessage
// call would silently drop because the Map is empty after wake-up.
export class RoomDO extends DurableObject {
  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname !== '/websocket') {
      return new Response('Not found', { status: 404 });
    }
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const name = url.searchParams.get('name')?.trim() || 'Guest';
    const participantId = crypto.randomUUID();

    // Clean up any stale storage entries (participants whose WS is no longer active)
    // and collect the current participants list before adding the new one.
    const activeIds = new Set(
      this.ctx.getWebSockets().flatMap((ws) => this.ctx.getTags(ws)),
    );
    const allEntries = await this.ctx.storage.list<ParticipantInfo>({ prefix: 'p:' });
    const toDelete: string[] = [];
    const others: ParticipantInfo[] = [];
    for (const [key, p] of allEntries) {
      if (!activeIds.has(p.participantId)) {
        toDelete.push(key);
      } else {
        others.push(p);
      }
    }
    if (toDelete.length > 0) await this.ctx.storage.delete(toDelete);

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [participantId]);

    await this.ctx.storage.put(`p:${participantId}`, {
      participantId,
      name,
      sessionId: '',
      tracks: [],
    } satisfies ParticipantInfo);

    server.send(JSON.stringify({ type: 'room-state', participantId, participants: others }));

    this.broadcast(server, {
      type: 'participant-joined',
      participant: { participantId, name, sessionId: '', tracks: [] },
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message));
    } catch {
      return;
    }

    const [participantId] = this.ctx.getTags(ws);
    if (!participantId) return;

    const participant = await this.ctx.storage.get<ParticipantInfo>(`p:${participantId}`);
    if (!participant) return;

    if (data.type === 'publish-tracks') {
      participant.sessionId = data.sessionId as string;
      participant.tracks = data.tracks as TrackInfo[];
      await this.ctx.storage.put(`p:${participantId}`, participant);
      this.broadcast(ws, { type: 'participant-updated', participant: { ...participant } });
    }

    if (data.type === 'chat') {
      const text = ((data.message as string) ?? '').trim();
      if (text) {
        this.broadcastAll({
          type: 'chat',
          fromId: participant.participantId,
          from: participant.name,
          message: text,
          at: Date.now(),
        });
      }
    }
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    const [participantId] = this.ctx.getTags(ws);
    if (participantId) {
      await this.ctx.storage.delete(`p:${participantId}`);
      this.broadcastAll({ type: 'participant-left', participantId });
    }
  }

  override webSocketError(ws: WebSocket): void {
    void this.webSocketClose(ws);
  }

  private broadcast(excludeWs: WebSocket, message: unknown): void {
    const payload = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== excludeWs) {
        try { ws.send(payload); } catch { /* client disconnected */ }
      }
    }
  }

  private broadcastAll(message: unknown): void {
    const payload = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(payload); } catch { /* client disconnected */ }
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function callsHeaders(env: Env): Record<string, string> {
  return {
    Authorization: `Bearer ${env.CALLS_APP_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

// ── Main fetch handler ────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    // POST /api/rooms — create a room (just generates a UUID; no Calls API call needed)
    if (pathname === '/api/rooms' && request.method === 'POST') {
      return json({ id: crypto.randomUUID() });
    }

    // GET /api/rooms/:roomId/ws — upgrade to WebSocket for signaling
    const wsMatch = pathname.match(/^\/api\/rooms\/([^/]+)\/ws$/);
    if (wsMatch) {
      const roomId = wsMatch[1];
      const stub = env.ROOMS.get(env.ROOMS.idFromName(roomId));
      const wsUrl = new URL(request.url);
      wsUrl.pathname = '/websocket';
      return stub.fetch(new Request(wsUrl.toString(), request));
    }

    // POST /api/calls/sessions/new — proxy: create a Calls session
    if (pathname === '/api/calls/sessions/new' && request.method === 'POST') {
      const res = await fetch(
        `${CALLS_API}/apps/${env.CALLS_APP_ID}/sessions/new`,
        { method: 'POST', headers: callsHeaders(env) },
      );
      return json(await res.json(), res.status);
    }

    // POST /api/calls/sessions/:sessionId/tracks/new — proxy: push or pull tracks
    const tracksMatch = pathname.match(/^\/api\/calls\/sessions\/([^/]+)\/tracks\/new$/);
    if (tracksMatch && request.method === 'POST') {
      const [, sessionId] = tracksMatch;
      const body = await request.text();
      const res = await fetch(
        `${CALLS_API}/apps/${env.CALLS_APP_ID}/sessions/${sessionId}/tracks/new`,
        { method: 'POST', headers: callsHeaders(env), body },
      );
      return json(await res.json(), res.status);
    }

    // PUT /api/calls/sessions/:sessionId/renegotiate — proxy: complete renegotiation
    const renegotMatch = pathname.match(/^\/api\/calls\/sessions\/([^/]+)\/renegotiate$/);
    if (renegotMatch && request.method === 'PUT') {
      const [, sessionId] = renegotMatch;
      const body = await request.text();
      const res = await fetch(
        `${CALLS_API}/apps/${env.CALLS_APP_ID}/sessions/${sessionId}/renegotiate`,
        { method: 'PUT', headers: callsHeaders(env), body },
      );
      return json(await res.json(), res.status);
    }

    // Serve the React SPA for all other routes
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
