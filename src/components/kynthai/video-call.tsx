'use client';

/**
 * VideoCall — full-screen WebRTC video call with REST-based signaling.
 * - Uses free P2P via public STUN; optional TURN via env.
 * - Polls /api/webrtc-signaling for offer/answer/ice-candidate.
 */

import * as React from 'react';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';

interface VideoCallProps {
  roomName: string;
  displayName?: string;
  identity?: string;
  onEndCall?: () => void;
  role?: 'doctor' | 'patient';
}

interface PeerState {
  connected: boolean;
  userId?: string;
  name?: string;
}

export function VideoCall({
  roomName,
  displayName = 'Kynthai User',
  identity,
  onEndCall,
  role = 'patient',
}: VideoCallProps) {
  const localVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = React.useRef<HTMLVideoElement | null>(null);
  const pcRef = React.useRef<RTCPeerConnection | null>(null);
  const localStreamRef = React.useRef<MediaStream | null>(null);
  const remoteStreamRef = React.useRef<MediaStream | null>(null);
  const iceCandidatesBuffer = React.useRef<RTCIceCandidate[]>([]);
  const lastMsgIdRef = React.useRef<string | undefined>(undefined);
  const pollTimerRef = React.useRef<number | null>(null);
  const endedRef = React.useRef(false);

  // ICE servers are fetched from the authenticated /api/turn-credentials
  // endpoint — TURN credentials are never shipped in the client bundle
  // (previously NEXT_PUBLIC_TURN_* were inlined into the JS for anyone to
  // extract and abuse). STUN-only is the offline/dev fallback.
  const [iceServers, setIceServers] = React.useState<RTCIceServer[]>([
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]);

  const [peer, setPeer] = React.useState<PeerState>({ connected: false });
  const [muted, setMuted] = React.useState(false);
  const [videoOn, setVideoOn] = React.useState(true);
  const [callStartedAt] = React.useState<number>(Date.now());
  const [elapsed, setElapsed] = React.useState('00:00');
  const [error, setError] = React.useState<string | null>(null);
  const [joining, setJoining] = React.useState(true);
  const [consentGiven, setConsentGiven] = React.useState(false);
  const [showConsent, setShowConsent] = React.useState(true);

  const stopAllTracks = React.useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    remoteStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
  }, []);

  const postSignal = React.useCallback(
    async (type: string, payload: Record<string, unknown>) => {
      try {
        await fetch('/api/webrtc-signaling', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            appointmentId: roomName,
            role,
            userId: identity || 'unknown',
            userName: displayName,
            type,
            payload,
          }),
        });
      } catch (e) {
        logger.phiSafeError(e, 'VideoCall');
      }
    },
    [roomName, role, identity, displayName]
  );

  const buildPeerConnection = React.useCallback(() => {
    const pc = new RTCPeerConnection({ iceServers });

    pc.ontrack = event => {
      const stream = event.streams[0]!;
      remoteStreamRef.current = stream;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
      setPeer({ connected: true, userId: stream.id });
    };

    pc.onicecandidate = (event: RTCPeerConnectionIceEvent) => {
      if (event.candidate) {
        void postSignal('ice-candidate', { candidate: event.candidate.toJSON() });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setPeer({ connected: false });
      }
    };

    return pc;
  }, [iceServers, postSignal]);

  const handleEnd = React.useCallback(() => {
    endedRef.current = true;
    if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
    try {
      pcRef.current?.close();
    } catch (e) {
      logger.phiSafeError(e, 'VideoCall.closePeerConnection');
    }
    stopAllTracks();
    setPeer({ connected: false });
    setJoining(true);
    setShowConsent(true);
    setConsentGiven(false);
    setError(null);
    try {
      void postSignal('leave', {});
    } catch {
      // cleanup only — never block UI teardown on signaling errors
    }
    onEndCall?.();
  }, [onEndCall, stopAllTracks, postSignal]);

  const waitForStableSignaling = React.useCallback(async (pc: RTCPeerConnection) => {
    const timeout = new Promise<never>((_, reject) => {
      const id = window.setTimeout(() => reject(new Error('Signaling state change timeout')), 2000);
      void id; // timer used for timeout path only
    });

    await Promise.race([
      new Promise<void>(resolve => {
        const onChange = () => {
          pc.onsignalingstatechange = null;
          resolve();
        };
        pc.onsignalingstatechange = onChange;
        if (pc.signalingState === 'stable') resolve();
      }),
      timeout,
    ]);
  }, []);

  const poll = React.useCallback(async () => {
    if (endedRef.current) return;
    try {
      const url = `/api/webrtc-signaling?appointmentId=${encodeURIComponent(roomName)}&afterId=${encodeURIComponent(lastMsgIdRef.current || '')}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      const messages =
        (
          data as {
            messages?: Array<{
              id?: string;
              type?: string;
              payload?: Record<string, unknown>;
              role?: string;
            }>;
          }
        ).messages || [];
      if (!messages.length) return;

      for (const msg of messages) {
        if (msg.id) lastMsgIdRef.current = msg.id;

        if (msg.type === 'offer' && msg.role !== role && pcRef.current) {
          const pc = pcRef.current;
          if (pc.signalingState === 'have-local-offer') {
            await pc.setLocalDescription({ type: 'rollback' });
          }
          await pc.setRemoteDescription(
            new RTCSessionDescription(msg.payload?.sdp as RTCSessionDescriptionInit)
          );
          for (const c of iceCandidatesBuffer.current) {
            try {
              await pc.addIceCandidate(c);
            } catch (e) {
              logger.phiSafeError(e, 'VideoCall.addIceCandidate');
            }
          }
          iceCandidatesBuffer.current = [];
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await waitForStableSignaling(pc);
          await postSignal('answer', { sdp: pc.localDescription });
        } else if (msg.type === 'answer' && pcRef.current) {
          await pcRef.current.setRemoteDescription(
            new RTCSessionDescription(msg.payload?.sdp as RTCSessionDescriptionInit)
          );
          for (const c of iceCandidatesBuffer.current) {
            try {
              await pcRef.current!.addIceCandidate(c);
            } catch (e) {
              logger.phiSafeError(e, 'VideoCall.addIceCandidate');
            }
          }
          iceCandidatesBuffer.current = [];
        } else if (msg.type === 'ice-candidate' && pcRef.current) {
          try {
            await pcRef.current.addIceCandidate(
              new RTCIceCandidate(msg.payload?.candidate as RTCIceCandidateInit)
            );
          } catch (e) {
            logger.phiSafeError(e, 'VideoCall');
          }
        } else if (msg.type === 'leave') {
          handleEnd();
          return;
        }
      }
    } catch (e) {
      logger.phiSafeError(e, 'VideoCall');
    }
  }, [roomName, role, postSignal, handleEnd]);

  React.useEffect(() => {
    if (showConsent || !consentGiven || endedRef.current) return;

    let cancelled = false;

    async function init() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        const pc = buildPeerConnection();
        pcRef.current = pc;
        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await waitForStableSignaling(pc);
        await postSignal('offer', { sdp: pc.localDescription });
        setJoining(false);

        pollTimerRef.current = window.setInterval(poll, 800);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to start video call');
        setJoining(false);
      }
    }

    void init();

    return () => {
      cancelled = true;
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
    };
  }, [showConsent, consentGiven, buildPeerConnection, postSignal, poll]);

  React.useEffect(() => {
    // Fetch authenticated ICE servers (may include ephemeral TURN credentials).
    // Best-effort: on failure keep the STUN fallback — calls still work for
    // most peers, only NAT-traversal-heavy ones may fail.
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/turn-credentials', {
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) return;
        const data = (await res.json()) as { iceServers?: RTCIceServer[] };
        if (data.iceServers?.length && !cancelled) {
          setIceServers(data.iceServers);
        }
      } catch {
        // keep STUN fallback
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    return () => {
      endedRef.current = true;
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
      try {
        pcRef.current?.close();
      } catch (e) {
        logger.phiSafeError(e, 'VideoCall.closePeerConnection');
      }
      stopAllTracks();
    };
  }, [stopAllTracks]);

  React.useEffect(() => {
    const id = setInterval(() => {
      const seconds = Math.max(0, Math.floor((Date.now() - callStartedAt) / 1000));
      const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
      const ss = String(seconds % 60).padStart(2, '0');
      setElapsed(`${mm}:${ss}`);
    }, 1000);
    return () => clearInterval(id);
  }, [callStartedAt]);

  const toggleMute = React.useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach(t => (t.enabled = muted));
    setMuted(m => !m);
  }, [muted]);

  const toggleVideo = React.useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach(t => (t.enabled = !videoOn));
    setVideoOn(v => !v);
  }, [videoOn]);

  if (showConsent && !consentGiven) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4">
        <div className="w-full max-w-md rounded-2xl bg-background p-6 shadow-2xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
              <ShieldCheck className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Telemedicine Consent</h2>
              <p className="text-sm text-muted-foreground">Please review before starting</p>
            </div>
          </div>

          <div className="space-y-3 text-sm text-muted-foreground mb-6">
            <p>By joining this video consultation, you agree to:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>This consultation is not recorded</li>
              <li>Your health information may be shared with the consulting doctor</li>
              <li>This is not an emergency service — contact local emergency services for emergencies</li>
              <li>Prescriptions issued are valid for 30 days</li>
            </ul>
          </div>

          <div className="flex items-center gap-2 mb-6">
            <Checkbox
              id="consent"
              checked={consentGiven}
              onCheckedChange={checked => setConsentGiven(checked === true)}
            />
            <Label htmlFor="consent" className="text-sm">
              I have read and agree to the telemedicine consent
            </Label>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={handleEnd}>
              Decline
            </Button>
            <Button
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 text-white"
              disabled={!consentGiven}
              onClick={() => setShowConsent(false)}
            >
              Accept & Join
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black">
      <div className="relative flex-1 overflow-hidden bg-gradient-to-br from-emerald-950 via-black to-teal-950">
        <video ref={remoteVideoRef} autoPlay playsInline className="h-full w-full object-cover" />

        {!peer.connected && !joining && !error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center text-white">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 backdrop-blur">
              <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
            </div>
            <p className="text-sm opacity-80">Waiting for the other person to join…</p>
            <p className="text-xs opacity-60">
              Room: <span className="font-mono">{roomName}</span>
            </p>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-white">
            <p className="text-sm font-semibold">Could not start the call</p>
            <p className="text-xs opacity-70">{error}</p>
            <Button
              onClick={handleEnd}
              variant="outline"
              className="mt-3 border-white/30 bg-white/10 text-white hover:bg-white/20"
            >
              Close
            </Button>
          </div>
        )}

        <div className="absolute right-3 top-3 h-32 w-24 overflow-hidden rounded-xl border border-white/20 bg-black shadow-xl sm:h-40 sm:w-28">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full -scale-x-100 object-cover"
          />
          {!videoOn && (
            <div className="absolute inset-0 flex items-center justify-center bg-emerald-900/80 text-white">
              <VideoOff className="h-5 w-5" />
            </div>
          )}
        </div>

        <div className="absolute left-3 top-3 flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium backdrop-blur',
              peer.connected ? 'bg-emerald-500/20 text-emerald-200' : 'bg-white/10 text-white/80'
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                peer.connected ? 'bg-emerald-400' : 'bg-white/60'
              )}
            />
            {peer.connected ? 'Connected' : 'Connecting'}
          </span>
          <span className="rounded-full bg-black/40 px-2.5 py-1 text-[11px] font-mono text-white/80 backdrop-blur">
            {elapsed}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 bg-black/90 px-6 py-5 backdrop-blur">
        <Button
          size="icon"
          variant="ghost"
          onClick={toggleMute}
          className={cn(
            'h-12 w-12 rounded-full border border-white/10',
            muted ? 'bg-white/10 text-white' : 'bg-white/5 text-white hover:bg-white/10'
          )}
          aria-label={muted ? 'Unmute' : 'Mute'}
          title={muted ? 'Unmute' : 'Mute'}
        >
          {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </Button>

        <Button
          size="icon"
          variant="ghost"
          onClick={toggleVideo}
          className={cn(
            'h-12 w-12 rounded-full border border-white/10',
            videoOn ? 'bg-white/5 text-white hover:bg-white/10' : 'bg-white/10 text-white'
          )}
          aria-label={videoOn ? 'Turn off camera' : 'Turn on camera'}
          title={videoOn ? 'Turn off camera' : 'Turn on camera'}
        >
          {videoOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </Button>

        <Button
          size="icon"
          variant="ghost"
          onClick={handleEnd}
          className="h-12 w-12 rounded-full border border-red-500/40 bg-red-500/20 text-red-200 hover:bg-red-500/30"
          aria-label="End call"
          title="End call"
        >
          <PhoneOff className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
