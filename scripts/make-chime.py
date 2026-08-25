#!/usr/bin/env python3
"""Generate Kynthai's premium clinical chime: /public/med-chime.wav (+ copy in /sounds).

Design: warm 'hospital-spa' bell arpeggio — G5-C6-E6-G6, each note a layered
bell voice (fundamental + inharmonic partials), soft 8ms attack, long smooth
exponential decay, subtle stereo shimmer, gentle master fade. 44.1kHz 16-bit.
"""
import math
import struct
import wave

SR = 44100

def bell(ctx_len, freq, t0, amp, decay):
    """Yield additive partials for one bell strike into buffer."""
    n0 = int(t0 * SR)
    # fundamental + 3 partials (slightly inharmonic -> real-bell warmth)
    partials = [
        (1.00, 1.000),
        (2.01, 0.320),
        (2.98, 0.180),
        (4.16, 0.090),
    ]
    for ratio, pamp in partials:
        f = freq * ratio
        p = amp * pamp
        d = decay * (1.0 / max(ratio, 1.0)) ** 0.7  # higher partials die faster
        n = int(d * SR)
        for i in range(n):
            idx = n0 + i
            if idx >= len(samples[0]):
                break
            env = math.exp(-i / SR / d * 9.0)
            att = min(1.0, i / (SR * 0.008))  # 8ms soft attack
            v = math.sin(2 * math.pi * f * i / SR) * p * env * att
            samples[0][idx] += v

def render():
    dur = 4.2
    total = int(SR * dur)
    global samples
    samples = [[0.0] * total, [0.0] * total]

    # Arpeggio: G5 783.99, C6 1046.50, E6 1318.51, G6 1567.98
    seq = [
        (783.99,  0.00, 0.30, 2.4),
        (1046.50, 0.22, 0.28, 2.3),
        (1318.51, 0.44, 0.25, 2.2),
        (1567.98, 0.66, 0.34, 2.6),  # final note rings longest
    ]
    for freq, t0, amp, dec in seq:
        bell(total, freq, t0, amp, dec)

    # Subtle octave-down pad under the arpeggio for body/warmth
    bell(total, 392.0, 0.0, 0.10, 3.4)

    # Stereo shimmer: right channel gets a 12ms delayed mix of left
    delay = int(0.012 * SR)
    left = samples[0]
    right = samples[1]
    for i in range(delay, total):
        right[i] += left[i - delay] * 0.22

    # Master: normalize to 89% FS, then 300ms outro fade
    peak = max(max(abs(s) for s in ch) for ch in samples)
    gain = 0.89 / peak
    fade = int(0.30 * SR)
    for ch in samples:
        for i in range(total):
            v = ch[i] * gain
            if i > total - fade:
                v *= (total - i) / fade
            # 16-bit clamp
            v = max(-1.0, min(1.0, v))
            ch[i] = v

    frames = bytearray()
    for i in range(total):
        for ch in samples:
            frames += struct.pack('<h', int(ch[i] * 32767))

    for path in ('public/med-chime.wav', 'public/sounds/med-chime.wav'):
        with wave.open(path, 'wb') as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(bytes(frames))
        print(f"wrote {path} ({len(frames)} bytes, {dur}s)")

    # Mono mixdown for Android res/raw (keeps APK lean, same sound design)
    mono = bytearray()
    for i in range(total):
        v = (samples[0][i] + samples[1][i]) / 2
        mono += struct.pack('<h', int(v * 32767))
    for path in ('android/app/src/main/res/raw/med_chime.wav',
                 'android/app/src/main/res/raw/kynthai_chime.wav'):
        with wave.open(path, 'wb') as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes(bytes(mono))
        print(f"wrote {path} ({len(mono)} bytes, {dur}s)")

if __name__ == '__main__':
    render()
