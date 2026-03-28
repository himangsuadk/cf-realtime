import { useState, useEffect, useRef, useCallback } from 'react';
import {
  cfCreateSession,
  cfPushTracks,
  cfPullTracks,
  cfRenegotiate,
  createPC,
  waitForIceGathering,
  waitForIceConnected,
  TrackLocator,
} from './calls';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TrackInfo {
  trackName: string;
  mid: string;
  kind: string; // 'audio' | 'video' | 'screenshare'
}

export interface RemoteParticipant {
  participantId: string;
  name: string;
  sessionId: string;
  tracks: TrackInfo[];
  stream: MediaStream;
}

export interface ChatMessage {
  id: string;
  fromId: string;
  from: string;
  message: string;
  at: number;
  isMine: boolean;
}

export type RoomStatus = 'connecting' | 'connected' | 'error';

export interface RoomState {
  status: RoomStatus;
  error: string;
  myParticipantId: string;
  myName: string;
  localStream: MediaStream | null;
  screenStream: MediaStream | null;
  micEnabled: boolean;
  cameraEnabled: boolean;
  screenShareEnabled: boolean;
  remoteParticipants: RemoteParticipant[];
  chatMessages: ChatMessage[];
  toggleMic: () => void;
  toggleCamera: () => void;
  toggleScreenShare: () => Promise<void>;
  sendChat: (msg: string) => void;
  leave: () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useRoom(roomId: string, name: string): RoomState {
  const [status, setStatus] = useState<RoomStatus>('connecting');
  const [error, setError] = useState('');
  const [myParticipantId, setMyParticipantId] = useState('');
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [micEnabled, setMicEnabled] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [screenShareEnabled, setScreenShareEnabled] = useState(false);
  const [remoteParticipants, setRemoteParticipants] = useState<RemoteParticipant[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  // Refs — stable across renders, don't trigger DOM updates
  const wsRef = useRef<WebSocket | null>(null);
  const sendPCRef = useRef<RTCPeerConnection | null>(null);
  const recvPCRef = useRef<RTCPeerConnection | null>(null);
  const sendSessionIdRef = useRef('');
  const recvSessionIdRef = useRef('');
  const localStreamRef = useRef<MediaStream | null>(null);
  const myParticipantIdRef = useRef('');
  const midToParticipantId = useRef(new Map<string, string>());
  const screenTransceiverRef = useRef<RTCRtpTransceiver | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);

  // Pull queue — ensures renegotiations don't overlap
  const pullChainRef = useRef<Promise<void>>(Promise.resolve());

  // ── Pull a remote participant's tracks onto the recv PC ───────────────────

  const pullParticipant = useCallback(
    (participantId: string, sessionId: string, tracks: TrackInfo[]) => {
      if (!sessionId || tracks.length === 0) return;

      pullChainRef.current = pullChainRef.current.then(async () => {
        const recvPC = recvPCRef.current;
        const recvSessionId = recvSessionIdRef.current;
        if (!recvPC || !recvSessionId) return;

        const tracksToPull: TrackLocator[] = tracks.map((t) => ({
          location: 'remote',
          sessionId,
          trackName: t.trackName,
        }));

        try {
          const result = await cfPullTracks(recvSessionId, tracksToPull);
          if (result.errorCode) {
            console.warn('Pull error:', result.errorDescription);
            return;
          }

          // Map Calls mids → participantId so ontrack can route tracks
          result.tracks.forEach((t) => {
            if (t.mid) midToParticipantId.current.set(t.mid, participantId);
          });

          // Handle renegotiation if Calls API demands it
          if (result.requiresImmediateRenegotiation && result.sessionDescription) {
            await recvPC.setRemoteDescription(
              result.sessionDescription as RTCSessionDescriptionInit,
            );
            const answer = await recvPC.createAnswer();
            await recvPC.setLocalDescription(answer);
            await cfRenegotiate(recvSessionId, answer.sdp!);
          }
        } catch (err) {
          console.error('Failed to pull participant tracks:', err);
        }
      });
    },
    [],
  );

  // ── Main initialization effect ────────────────────────────────────────────

  useEffect(() => {
    let destroyed = false;

    async function init() {
      try {
        // 1. Acquire local camera + mic (optional — join works even if denied/unavailable)
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
          });
        } catch {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          } catch {
            stream = new MediaStream();
          }
        }
        if (destroyed) { stream.getTracks().forEach((t) => t.stop()); return; }
        localStreamRef.current = stream;
        setLocalStream(stream);
        setMicEnabled(stream.getAudioTracks().some((t) => t.enabled));
        setCameraEnabled(stream.getVideoTracks().some((t) => t.enabled));

        // 2. Connect signaling WebSocket
        const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
        const wsUrl = `${protocol}://${location.host}/api/rooms/${encodeURIComponent(roomId)}/ws?name=${encodeURIComponent(name)}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        await new Promise<void>((resolve, reject) => {
          ws.onopen = () => resolve();
          ws.onerror = () => reject(new Error('WebSocket connection failed'));
          setTimeout(() => reject(new Error('WebSocket connection timeout')), 10000);
        });
        if (destroyed) { ws.close(); return; }

        // Buffer messages that arrive during the Calls setup phase.
        // The server sends `room-state` immediately on connect, so we MUST
        // capture it here; otherwise it is dropped before onmessage is set.
        const earlyBuffer: Array<Record<string, unknown>> = [];
        ws.onmessage = (event) => {
          earlyBuffer.push(JSON.parse(event.data as string) as Record<string, unknown>);
        };

        // 3. Create Calls sessions (send + recv) in parallel
        const [sendSessionId, recvSessionId] = await Promise.all([
          cfCreateSession(),
          cfCreateSession(),
        ]);
        if (destroyed) return;
        sendSessionIdRef.current = sendSessionId;
        recvSessionIdRef.current = recvSessionId;

        // 4. Send PC — push local tracks to Cloudflare Calls (skipped if no media available)
        const sendPC = createPC();
        sendPCRef.current = sendPC;
        const localTracks = stream.getTracks();

        if (localTracks.length > 0) {
          localTracks.forEach((track) => {
            sendPC.addTransceiver(track, { direction: 'sendonly' });
          });

          const sendOffer = await sendPC.createOffer();
          await sendPC.setLocalDescription(sendOffer);
          await waitForIceGathering(sendPC);

          const pushResult = await cfPushTracks(
            sendSessionId,
            sendPC.localDescription!.sdp,
            sendPC.getTransceivers().map((t) => ({
              location: 'local' as const,
              mid: t.mid!,
              trackName: t.sender.track!.id,
            })),
          );
          if (pushResult.errorCode) throw new Error(pushResult.errorDescription ?? 'Push tracks failed');
          if (!pushResult.sessionDescription) throw new Error('No SDP returned from push tracks');

          await sendPC.setRemoteDescription(
            pushResult.sessionDescription as RTCSessionDescriptionInit,
          );
          await waitForIceConnected(sendPC);
        }

        // 5. Recv PC — will pull remote tracks on demand
        const recvPC = createPC();
        recvPCRef.current = recvPC;

        recvPC.ontrack = ({ transceiver, track }) => {
          const mid = transceiver.mid;
          if (!mid) return;
          const pid = midToParticipantId.current.get(mid);
          if (!pid) return;

          // Add the incoming track to that participant's MediaStream
          setRemoteParticipants((prev) =>
            prev.map((p) => {
              if (p.participantId !== pid) return p;
              // Avoid duplicate tracks
              if (p.stream.getTracks().some((t) => t.id === track.id)) return p;
              p.stream.addTrack(track);
              return { ...p }; // new ref to trigger re-render
            }),
          );
        };

        // 6. Handle WebSocket messages
        const handleMessage = (data: Record<string, unknown>) => {
          if (data.type === 'room-state') {
            const { participantId, participants } = data as {
              participantId: string;
              participants: RemoteParticipant[];
            };
            myParticipantIdRef.current = participantId;
            setMyParticipantId(participantId);

            const initial = participants.map((p) => ({ ...p, stream: new MediaStream() }));
            setRemoteParticipants(initial);

            initial.forEach((p) => {
              if (p.sessionId && p.tracks.length > 0) {
                pullParticipant(p.participantId, p.sessionId, p.tracks);
              }
            });

            setStatus('connected');

            // Tell the room which Calls session + tracks we are publishing
            const myTracks = sendPC.getTransceivers()
              .filter((t) => t.sender.track)
              .map((t) => ({
                trackName: t.sender.track!.id,
                mid: t.mid!,
                kind: t.sender.track!.kind,
              }));
            ws.send(JSON.stringify({ type: 'publish-tracks', sessionId: sendSessionId, tracks: myTracks }));
            return;
          }

          if (data.type === 'participant-joined') {
            const p = data.participant as RemoteParticipant;
            setRemoteParticipants((prev) => {
              if (prev.some((x) => x.participantId === p.participantId)) return prev;
              return [...prev, { ...p, stream: new MediaStream() }];
            });
          }

          if (data.type === 'participant-updated') {
            const updated = data.participant as RemoteParticipant;
            setRemoteParticipants((prev) =>
              prev.map((p) =>
                p.participantId === updated.participantId
                  ? { ...p, sessionId: updated.sessionId, tracks: updated.tracks }
                  : p,
              ),
            );
            pullParticipant(updated.participantId, updated.sessionId, updated.tracks);
          }

          if (data.type === 'participant-left') {
            const { participantId } = data as { participantId: string };
            setRemoteParticipants((prev) => prev.filter((p) => p.participantId !== participantId));
          }

          if (data.type === 'chat') {
            const msg = data as { fromId: string; from: string; message: string; at: number };
            setChatMessages((prev) => [
              ...prev,
              {
                id: `${msg.at}-${msg.fromId}`,
                fromId: msg.fromId,
                from: msg.from,
                message: msg.message,
                at: msg.at,
                isMine: msg.fromId === myParticipantIdRef.current,
              },
            ]);
          }
        };

        // Switch to live dispatch and drain anything buffered during setup
        ws.onmessage = (event) => {
          const data = JSON.parse(event.data as string) as Record<string, unknown>;
          handleMessage(data);
        };
        earlyBuffer.forEach(handleMessage);

        ws.onclose = () => {
          if (!destroyed) {
            setStatus('error');
            setError('Connection lost. Please rejoin the meeting.');
          }
        };
      } catch (err) {
        if (!destroyed) {
          setError((err as Error).message);
          setStatus('error');
        }
      }
    }

    void init();

    return () => {
      destroyed = true;
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      wsRef.current?.close();
      sendPCRef.current?.close();
      recvPCRef.current?.close();
    };
  }, [roomId, name, pullParticipant]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Controls ──────────────────────────────────────────────────────────────

  // Pushes a brand-new track (obtained via getUserMedia after joining) onto the
  // existing sendPC + Calls session, then republishes via WebSocket.
  const pushNewTrack = useCallback(async (track: MediaStreamTrack): Promise<void> => {
    const sendPC = sendPCRef.current;
    const sendSessionId = sendSessionIdRef.current;
    if (!sendPC || !sendSessionId) return;

    // Add track to local MediaStream so the local preview picks it up
    if (!localStreamRef.current) {
      const ms = new MediaStream([track]);
      localStreamRef.current = ms;
      setLocalStream(ms);
    } else {
      localStreamRef.current.addTrack(track);
      // Replace state ref so VideoTile re-renders
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
    }

    // Add transceiver and renegotiate with Calls
    const transceiver = sendPC.addTransceiver(track, { direction: 'sendonly' });
    const offer = await sendPC.createOffer();
    await sendPC.setLocalDescription(offer);
    await waitForIceGathering(sendPC, 2000);

    const pushResult = await cfPushTracks(sendSessionId, sendPC.localDescription!.sdp, [
      { location: 'local', mid: transceiver.mid!, trackName: track.id },
    ]);
    if (pushResult.errorCode) {
      console.error('Failed to push new track:', pushResult.errorDescription);
      return;
    }
    if (pushResult.sessionDescription) {
      await sendPC.setRemoteDescription(
        pushResult.sessionDescription as RTCSessionDescriptionInit,
      );
    }

    // If the PC was never connected (joined with no media), wait for ICE now
    if (
      sendPC.iceConnectionState !== 'connected' &&
      sendPC.iceConnectionState !== 'completed'
    ) {
      await waitForIceConnected(sendPC);
    }

    // Republish all active tracks so remote participants pull the new one
    const myTracks = sendPC
      .getTransceivers()
      .filter((t) => t.direction === 'sendonly' && t.sender.track)
      .map((t) => ({
        trackName: t.sender.track!.id,
        mid: t.mid!,
        kind: t.sender.track!.kind,
      }));
    wsRef.current?.send(
      JSON.stringify({ type: 'publish-tracks', sessionId: sendSessionId, tracks: myTracks }),
    );
  }, []);

  const toggleMic = useCallback(() => {
    void (async () => {
      const audioTrack = localStreamRef.current?.getAudioTracks()[0];
      if (audioTrack) {
        // Track already exists — just mute/unmute
        audioTrack.enabled = !audioTrack.enabled;
        setMicEnabled(audioTrack.enabled);
      } else {
        // No track yet — request mic permission and push to Calls
        try {
          const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
          const track = ms.getAudioTracks()[0];
          if (!track) return;
          await pushNewTrack(track);
          setMicEnabled(true);
        } catch {
          // Permission denied or unavailable — silently ignore
        }
      }
    })();
  }, [pushNewTrack]);

  const toggleCamera = useCallback(() => {
    void (async () => {
      const videoTrack = localStreamRef.current?.getVideoTracks()[0];
      if (videoTrack) {
        // Track already exists — just show/hide
        videoTrack.enabled = !videoTrack.enabled;
        setCameraEnabled(videoTrack.enabled);
      } else {
        // No track yet — request camera permission and push to Calls
        try {
          const ms = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
          });
          const track = ms.getVideoTracks()[0];
          if (!track) return;
          await pushNewTrack(track);
          setCameraEnabled(true);
        } catch {
          // Permission denied or unavailable — silently ignore
        }
      }
    })();
  }, [pushNewTrack]);

  const toggleScreenShare = useCallback(async () => {
    const sendPC = sendPCRef.current;
    if (!sendPC) return;

    if (screenShareEnabled) {
      // ── Stop screen share ──
      const transceiver = screenTransceiverRef.current;
      if (transceiver?.sender.track) {
        transceiver.sender.track.stop();
        transceiver.sender.replaceTrack(null).catch(() => {});
      }
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      setScreenStream(null);
      setScreenShareEnabled(false);
      screenTransceiverRef.current = null;

      // Republish tracks (without screen)
      const myTracks = sendPC
        .getTransceivers()
        .filter((t) => t.direction === 'sendonly' && t.sender.track)
        .map((t) => ({ trackName: t.sender.track!.id, mid: t.mid!, kind: t.sender.track!.kind }));
      wsRef.current?.send(
        JSON.stringify({ type: 'publish-tracks', sessionId: sendSessionIdRef.current, tracks: myTracks }),
      );
    } else {
      // ── Start screen share ──
      try {
        const ss = await (navigator.mediaDevices as MediaDevices).getDisplayMedia({ video: true });
        const [track] = ss.getVideoTracks();
        if (!track) return;

        screenStreamRef.current = ss;
        setScreenStream(ss);

        // Reuse existing screen transceiver if available, else add a new one
        let transceiver = screenTransceiverRef.current;
        if (transceiver) {
          await transceiver.sender.replaceTrack(track);
          transceiver.direction = 'sendonly';
        } else {
          transceiver = sendPC.addTransceiver(track, { direction: 'sendonly' });
          screenTransceiverRef.current = transceiver;

          // Renegotiate with Calls to register the new transceiver
          const offer = await sendPC.createOffer();
          await sendPC.setLocalDescription(offer);
          await waitForIceGathering(sendPC, 2000);

          const pushResult = await cfPushTracks(sendSessionIdRef.current, sendPC.localDescription!.sdp, [
            { location: 'local', mid: transceiver.mid!, trackName: track.id },
          ]);
          if (!pushResult.errorCode && pushResult.sessionDescription) {
            await sendPC.setRemoteDescription(
              pushResult.sessionDescription as RTCSessionDescriptionInit,
            );
          }
        }

        setScreenShareEnabled(true);

        const myTracks = sendPC
          .getTransceivers()
          .filter((t) => t.direction === 'sendonly' && t.sender.track)
          .map((t) => ({
            trackName: t.sender.track!.id,
            mid: t.mid!,
            kind: t === transceiver ? 'screenshare' : t.sender.track!.kind,
          }));
        wsRef.current?.send(
          JSON.stringify({ type: 'publish-tracks', sessionId: sendSessionIdRef.current, tracks: myTracks }),
        );

        // Clean up if the user stops sharing from the browser UI
        track.addEventListener('ended', () => {
          screenStreamRef.current = null;
          setScreenStream(null);
          setScreenShareEnabled(false);
          screenTransceiverRef.current = null;
          // Republish without screen
          const remaining = sendPC
            .getTransceivers()
            .filter((t) => t.direction === 'sendonly' && t.sender.track && t !== transceiver)
            .map((t) => ({ trackName: t.sender.track!.id, mid: t.mid!, kind: t.sender.track!.kind }));
          wsRef.current?.send(
            JSON.stringify({ type: 'publish-tracks', sessionId: sendSessionIdRef.current, tracks: remaining }),
          );
        });
      } catch {
        // User cancelled the screen picker or permission denied — silently ignore
      }
    }
  }, [screenShareEnabled]);

  const sendChat = useCallback((msg: string) => {
    if (msg.trim()) wsRef.current?.send(JSON.stringify({ type: 'chat', message: msg }));
  }, []);

  const leave = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    wsRef.current?.close();
    sendPCRef.current?.close();
    recvPCRef.current?.close();
  }, []);

  return {
    status,
    error,
    myParticipantId,
    myName: name,
    localStream,
    screenStream,
    micEnabled,
    cameraEnabled,
    screenShareEnabled,
    remoteParticipants,
    chatMessages,
    toggleMic,
    toggleCamera,
    toggleScreenShare,
    sendChat,
    leave,
  };
}
