/**
 * WebRTC mesh voice chat for a room.
 *
 * The server is used ONLY for signaling (SDP offer/answer + ICE candidates) and
 * for announcing who is in the voice channel. Audio flows peer-to-peer, so the
 * game server never carries media and its load stays negligible.
 */
import { socket } from './socket';
import { C2S, S2C } from '@shared/types';

export interface VoiceCallbacks {
  onRemoteStream: (peerId: string, stream: MediaStream) => void;
  onPeerLeft: (peerId: string) => void;
  onSpeakingChange: (speaking: Set<string>) => void;
  onError: (message: string) => void;
  onEnabledChange: (enabled: boolean) => void;
  onPeerCountChange: (count: number) => void;
  onPeerStateChange?: (peerId: string, state: RTCPeerConnectionState) => void;
}

function buildIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ];
  // Optional production TURN server configured via env vars.
  const turnUrl = (import.meta as any)?.env?.VITE_TURN_URL;
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: (import.meta as any)?.env?.VITE_TURN_USER,
      credential: (import.meta as any)?.env?.VITE_TURN_PASS,
    });
  }
  return servers;
}
const ICE_SERVERS: RTCIceServer[] = buildIceServers();

export class VoiceManager {
  private roomCode: string;
  private playerId: string;
  private cb: VoiceCallbacks;
  private localStream: MediaStream | null = null;
  private processedStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private destNode: MediaStreamAudioDestinationNode | null = null;
  private inputDeviceId: string | null = null;
  private deafened = false;
  private lastMicLevel = 0;
  private peers = new Map<string, RTCPeerConnection>();
  private remoteAnalysers = new Map<string, AnalyserNode>();
  private remoteStreams = new Map<string, MediaStream>();
  private speaking = new Set<string>();
  private pollTimer: number | null = null;
  private enabled = false;
  private muted = false;
  private micVolume = 1;
  private speakerVolume = 1;
  private iceServers: RTCIceServer[];

  constructor(opts: { roomCode: string; playerId: string; iceServers?: RTCIceServer[] } & VoiceCallbacks) {
    this.roomCode = opts.roomCode;
    this.playerId = opts.playerId;
    this.cb = opts;
    this.iceServers = opts.iceServers ?? ICE_SERVERS;
  }

  get isEnabled() {
    return this.enabled;
  }
  get isMuted() {
    return this.muted;
  }
  get isDeafened() {
    return this.deafened;
  }
  get currentInputDeviceId(): string | null {
    return this.inputDeviceId;
  }
  /** Live mic level (0..1 RMS) for the settings test meter. */
  getMicLevel(): number {
    if (!this.localAnalyser || !this.enabled || this.muted || this.deafened) return 0;
    const data = new Uint8Array(this.localAnalyser.frequencyBinCount);
    this.localAnalyser.getByteFrequencyData(data);
    const rms = Math.sqrt(data.reduce((s, x) => s + x * x, 0) / data.length) / 255;
    this.lastMicLevel = rms;
    return rms;
  }
  get micLevel() {
    return this.micVolume;
  }
  get speakerLevel() {
    return this.speakerVolume;
  }
  getRemoteStreams() {
    return this.remoteStreams;
  }

  async enable(): Promise<boolean> {
    if (this.enabled) return true;
    if (!navigator.mediaDevices?.getUserMedia) {
      this.cb.onError('Microphone is not supported in this browser.');
      return false;
    }
    let raw: MediaStream;
    try {
      raw = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(this.inputDeviceId ? { deviceId: { exact: this.inputDeviceId } } : {}),
        } as MediaTrackConstraints,
        video: false,
      });
    } catch (err) {
      this.cb.onError('Microphone permission denied or unavailable.');
      return false;
    }
    this.localStream = raw;
    try {
      const settings = raw.getAudioTracks()[0]?.getSettings?.();
      if (settings?.deviceId) this.inputDeviceId = settings.deviceId;
    } catch {
      /* ignore */
    }

    // Route the mic through a gain node so the "mic volume" control actually
    // changes what is sent, and through an analyser for speaking detection.
    const AudioCtx = (window as any).AudioContext || (window as any).webkitAudioContext;
    this.audioCtx = new AudioCtx();
    const source = this.audioCtx!.createMediaStreamSource(raw);
    this.sourceNode = source;
    this.gainNode = this.audioCtx!.createGain();
    this.gainNode.gain.value = this.muted || this.deafened ? 0 : this.micVolume;
    const analyser = this.audioCtx!.createAnalyser();
    analyser.fftSize = 512;
    const dest = this.audioCtx!.createMediaStreamDestination();
    this.destNode = dest;
    source.connect(this.gainNode);
    this.gainNode.connect(dest);
    source.connect(analyser);
    this.localAnalyser = analyser;
    this.processedStream = dest.stream;

    // Ask the server who is already talking, then connect to each of them.
    const others: string[] = await new Promise((resolve) => {
      socket.emit(C2S.voiceJoin, { code: this.roomCode, playerId: this.playerId }, (res: any) => {
        if (res?.ok && Array.isArray(res.data)) resolve(res.data as string[]);
        else {
          this.cb.onError(res?.error ?? 'Could not join the voice channel.');
          resolve([]);
        }
      });
    });

    for (const pid of others) {
      if (pid === this.playerId) continue;
      // Only one side initiates, chosen deterministically by playerId order.
      if (this.playerId < pid) this.createOffer(pid);
    }

    this.startSpeakingDetection();
    this.enabled = true;
    this.cb.onEnabledChange(true);
    this.cb.onPeerCountChange(this.peers.size + (this.remoteStreams.size > 0 ? 0 : 0));
    return true;
  }

  async disable() {
    if (!this.enabled) return;
    this.enabled = false;
    this.stopSpeakingDetection();
    socket.emit(C2S.voiceLeave, {});
    for (const pc of this.peers.values()) {
      try {
        pc.close();
      } catch {
        /* ignore */
      }
    }
    this.peers.clear();
    this.remoteAnalysers.clear();
    this.remoteStreams.clear();
    if (this.localStream) {
      for (const t of this.localStream.getTracks()) t.stop();
      this.localStream = null;
    }
    this.processedStream = null;
    try {
      this.sourceNode?.disconnect();
      this.gainNode?.disconnect();
      this.destNode?.disconnect();
    } catch {
      /* ignore */
    }
    this.sourceNode = null;
    this.destNode = null;
    if (this.audioCtx) {
      try {
        await this.audioCtx.close();
      } catch {
        /* ignore */
      }
      this.audioCtx = null;
    }
    this.gainNode = null;
    this.localAnalyser = null;
    this.speaking = new Set();
    this.cb.onSpeakingChange(new Set());
    this.cb.onRemoteStream('__clear__', new MediaStream());
    this.cb.onEnabledChange(false);
    this.cb.onPeerCountChange(0);
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.applyMuteState();
  }

  /** Deafen (Discord-style): silences the mic as well as incoming audio.
   *  Incoming audio is muted by the UI layer (audio elements); here we only
   *  guarantee the microphone stops sending. */
  setDeafened(deafened: boolean) {
    this.deafened = deafened;
    this.applyMuteState();
  }

  private applyMuteState() {
    const silent = this.muted || this.deafened;
    if (this.gainNode) this.gainNode.gain.value = silent ? 0 : this.micVolume;
    if (this.localStream) {
      for (const t of this.localStream.getAudioTracks()) t.enabled = !silent;
    }
  }

  /** Switch the input device live (no renegotiation: the processed stream
   *  feeding every peer connection stays the same). */
  async setInputDevice(deviceId: string | null): Promise<boolean> {
    this.inputDeviceId = deviceId;
    if (!this.enabled || !this.audioCtx || !this.gainNode) return true;
    let raw: MediaStream;
    try {
      raw = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        } as MediaTrackConstraints,
        video: false,
      });
    } catch {
      this.cb.onError('Could not switch to that microphone.');
      return false;
    }
    const old = this.localStream;
    try {
      this.sourceNode?.disconnect();
    } catch {
      /* ignore */
    }
    const source = this.audioCtx.createMediaStreamSource(raw);
    this.sourceNode = source;
    source.connect(this.gainNode);
    if (this.localAnalyser) source.connect(this.localAnalyser);
    this.localStream = raw;
    this.applyMuteState();
    if (old) for (const t of old.getTracks()) t.stop();
    try {
      const settings = raw.getAudioTracks()[0]?.getSettings?.();
      if (settings?.deviceId) this.inputDeviceId = settings.deviceId;
    } catch {
      /* ignore */
    }
    return true;
  }

  setMicVolume(v: number) {
    this.micVolume = Math.max(0, Math.min(1, v));
    if (!this.muted && this.gainNode) this.gainNode.gain.value = this.micVolume;
  }

  setSpeakerVolume(v: number) {
    this.speakerVolume = Math.max(0, Math.min(1, v));
  }

  getSpeakerVolume() {
    return this.speakerVolume;
  }

  handlePeerList(peerIds: string[]) {
    for (const pid of peerIds) {
      if (pid === this.playerId) continue;
      if (this.peers.has(pid)) continue;
      if (this.playerId < pid) this.createOffer(pid);
      // otherwise wait for their offer
    }
    this.cb.onPeerCountChange(this.peers.size + peerIds.filter((p) => p !== this.playerId).length);
  }

  handlePeerJoined(peerId: string) {
    if (peerId === this.playerId) return;
    if (this.peers.has(peerId)) return;
    if (this.playerId < peerId) this.createOffer(peerId);
    // otherwise they will initiate (they are the smaller id)
  }

  handlePeerLeft(peerId: string) {
    const pc = this.peers.get(peerId);
    if (pc) {
      try {
        pc.close();
      } catch {
        /* ignore */
      }
      this.peers.delete(peerId);
    }
    this.remoteAnalysers.delete(peerId);
    this.remoteStreams.delete(peerId);
    this.speaking.delete(peerId);
    this.cb.onSpeakingChange(new Set(this.speaking));
    this.cb.onPeerLeft(peerId);
    this.cb.onPeerCountChange(this.peers.size);
  }

  handleOffer(from: string, sdp: any) {
    if (from === this.playerId) return;
    let pc = this.peers.get(from);
    if (!pc) pc = this.createPeer(from, false);
    pc
      .setRemoteDescription(new RTCSessionDescription(sdp))
      .then(() => pc!.createAnswer())
      .then((answer) => pc!.setLocalDescription(answer))
      .then(() => {
        socket.emit(C2S.voiceAnswer, { to: from, sdp: pc!.localDescription });
      })
      .catch((err) => this.cb.onError('Voice handshake failed: ' + (err?.message ?? err)));
  }

  handleAnswer(from: string, sdp: any) {
    const pc = this.peers.get(from);
    if (!pc) return;
    pc.setRemoteDescription(new RTCSessionDescription(sdp)).catch((err) =>
      this.cb.onError('Voice answer failed: ' + (err?.message ?? err)),
    );
  }

  handleIce(from: string, candidate: any) {
    const pc = this.peers.get(from);
    if (!pc || !candidate) return;
    pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {
      /* ignore late candidates */
    });
  }

  private createPeer(peerId: string, _initiator = true): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit(C2S.voiceIce, { to: peerId, candidate: e.candidate });
      }
    };
    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream([e.track]);
      this.remoteStreams.set(peerId, stream);
      this.cb.onRemoteStream(peerId, stream);
      this.setupRemoteAnalyser(peerId, stream);
    };
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      this.cb.onPeerStateChange?.(peerId, state);
      if (state === 'failed') {
        // Attempt an ICE restart to recover from a dropped connection.
        pc.restartIce?.();
        pc.createOffer({ iceRestart: true })
          .then((offer) => pc.setLocalDescription(offer))
          .then(() => {
            socket.emit(C2S.voiceOffer, { to: peerId, sdp: pc.localDescription });
          })
          .catch(() => {
            /* ignore — peer may be gone */
          });
      }
    };
    if (this.processedStream) {
      for (const track of this.processedStream.getAudioTracks()) {
        pc.addTrack(track, this.processedStream);
      }
    }
    this.peers.set(peerId, pc);
    return pc;
  }

  private createOffer(peerId: string) {
    const pc = this.createPeer(peerId);
    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .then(() => {
        socket.emit(C2S.voiceOffer, { to: peerId, sdp: pc.localDescription });
      })
      .catch((err) => this.cb.onError('Voice offer failed: ' + (err?.message ?? err)));
  }

  private setupRemoteAnalyser(peerId: string, stream: MediaStream) {
    if (!this.audioCtx) return;
    try {
      const source = this.audioCtx.createMediaStreamSource(stream);
      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      this.remoteAnalysers.set(peerId, analyser);
    } catch {
      /* ignore */
    }
  }

  private startSpeakingDetection() {
    this.stopSpeakingDetection();
    const poll = () => {
      const next = new Set(this.speaking);
      let changed = false;
      // local mic
      if (this.localAnalyser && this.enabled && !this.muted) {
        const data = new Uint8Array(this.localAnalyser.frequencyBinCount);
        this.localAnalyser.getByteFrequencyData(data);
        const rms = Math.sqrt(data.reduce((s, x) => s + x * x, 0) / data.length) / 255;
        const isSpeaking = rms > 0.09;
        if (isSpeaking !== this.speaking.has(this.playerId)) {
          if (isSpeaking) next.add(this.playerId);
          else next.delete(this.playerId);
          changed = true;
        }
      } else if (this.speaking.has(this.playerId)) {
        next.delete(this.playerId);
        changed = true;
      }
      // remote peers
      for (const [pid, analyser] of this.remoteAnalysers) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(data);
        const rms = Math.sqrt(data.reduce((s, x) => s + x * x, 0) / data.length) / 255;
        const isSpeaking = rms > 0.07;
        if (isSpeaking !== this.speaking.has(pid)) {
          if (isSpeaking) next.add(pid);
          else next.delete(pid);
          changed = true;
        }
      }
      if (changed) {
        this.speaking = next;
        this.cb.onSpeakingChange(new Set(next));
      }
    };
    // 120 ms: Discord-like responsiveness — the ring appears/hides almost instantly.
    this.pollTimer = window.setInterval(poll, 120) as unknown as number;
  }

  private stopSpeakingDetection() {
    if (this.pollTimer !== null) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }
}

export function supportedVoice(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof RTCPeerConnection !== 'undefined';
}
