// Cloudflare Calls API client — all requests are proxied through the Worker
// so that APP_ID and APP_TOKEN never leave the server.

export interface TrackLocator {
  location: 'local' | 'remote';
  mid?: string;
  trackName?: string;
  sessionId?: string;
}

export interface SessionDesc {
  type: string;
  sdp: string;
}

export interface TracksResponse {
  tracks: Array<{
    mid: string;
    trackName: string;
    errorCode?: string;
    errorDescription?: string;
  }>;
  sessionDescription?: SessionDesc;
  requiresImmediateRenegotiation?: boolean;
  errorCode?: string;
  errorDescription?: string;
}

const BASE = '/api/calls';

/** Create a Calls session. Returns the sessionId. */
export async function cfCreateSession(): Promise<string> {
  const res = await fetch(`${BASE}/sessions/new`, { method: 'POST' });
  if (!res.ok) throw new Error(`Session creation failed: ${res.status}`);
  const data = (await res.json()) as { sessionId: string };
  return data.sessionId;
}

/** Push local tracks with an SDP offer. Returns answer SDP + published track mids. */
export async function cfPushTracks(
  sessionId: string,
  offerSdp: string,
  tracks: TrackLocator[],
): Promise<TracksResponse> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/tracks/new`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionDescription: { type: 'offer', sdp: offerSdp },
      tracks,
    }),
  });
  if (!res.ok) throw new Error(`Push tracks failed (${res.status}): ${await res.text()}`);
  return res.json() as Promise<TracksResponse>;
}

/** Pull remote tracks. Returns an offer SDP if renegotiation is required. */
export async function cfPullTracks(
  sessionId: string,
  tracks: TrackLocator[],
): Promise<TracksResponse> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/tracks/new`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tracks }),
  });
  if (!res.ok) throw new Error(`Pull tracks failed (${res.status}): ${await res.text()}`);
  return res.json() as Promise<TracksResponse>;
}

/** Complete a renegotiation by sending our answer SDP. */
export async function cfRenegotiate(sessionId: string, answerSdp: string): Promise<void> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/renegotiate`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionDescription: { type: 'answer', sdp: answerSdp } }),
  });
  if (!res.ok) throw new Error(`Renegotiation failed: ${res.status}`);
}

/** Create a RTCPeerConnection pre-configured for Cloudflare Calls. */
export function createPC(): RTCPeerConnection {
  return new RTCPeerConnection({
    iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }],
    bundlePolicy: 'max-bundle',
  });
}

/** Wait for ICE gathering to complete (or timeout after `ms` ms). */
export function waitForIceGathering(pc: RTCPeerConnection, ms = 3000): Promise<void> {
  return new Promise<void>((resolve) => {
    if (pc.iceGatheringState === 'complete') { resolve(); return; }
    const check = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', check);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', check);
    setTimeout(resolve, ms);
  });
}

/** Wait for ICE connection to reach 'connected' state (or reject on failure/timeout). */
export function waitForIceConnected(pc: RTCPeerConnection, ms = 15000): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (pc.iceConnectionState === 'connected') { resolve(); return; }
    const handler = () => {
      if (pc.iceConnectionState === 'connected') {
        pc.removeEventListener('iceconnectionstatechange', handler);
        resolve();
      }
      if (['failed', 'closed'].includes(pc.iceConnectionState)) {
        pc.removeEventListener('iceconnectionstatechange', handler);
        reject(new Error(`ICE connection ${pc.iceConnectionState}`));
      }
    };
    pc.addEventListener('iceconnectionstatechange', handler);
    setTimeout(() => reject(new Error('ICE connection timeout')), ms);
  });
}
