import { ReplayFrameSnapshot, ReplayKeyframe, VehicleState, PedestrianState } from './types';

export const MAX_REPLAY_DURATION_SEC = 60.0;

/**
 * 60-Second Ring Buffer & Keyframe Recorder for the 3D Overhead Tactical Replay (PRD REQ-07).
 *
 * Solves Risk #6 ("12-Second Replay Truncation"):
 * - Records up to 60 seconds of full intersection state snapshots.
 * - Tags discrete keyframe events (`STOP`, `TIE`, `CREEP`, `WAVE`, `COMMIT`, `VIOLATION`)
 *   so the player can jump directly to any event or scrub smoothly.
 * - Detects stationary "dead air" intervals where all vehicles are stopped (< 0.15 m/s)
 *   so playback can automatically time-warp at 2x through long waits.
 */
export class ReplayBuffer {
  private frames: ReplayFrameSnapshot[] = [];
  private keyframes: ReplayKeyframe[] = [];
  private lastSampleTimeSec = -1;
  private readonly sampleIntervalSec = 1 / 20; // 20 Hz snapshot recording (1,200 frames max for 60s)

  public clear(): void {
    this.frames = [];
    this.keyframes = [];
    this.lastSampleTimeSec = -1;
  }

  public recordFrame(
    timestampSec: number,
    vehicles: VehicleState[],
    pedestrians: PedestrianState[],
    forceCapture = false
  ): void {
    if (
      !forceCapture &&
      this.lastSampleTimeSec >= 0 &&
      timestampSec - this.lastSampleTimeSec < this.sampleIntervalSec
    ) {
      return;
    }

    this.lastSampleTimeSec = timestampSec;

    const snapshot: ReplayFrameSnapshot = {
      timestampSec,
      vehicles: vehicles.map((v) => ({
        id: v.id,
        label: v.label,
        isPlayer: v.isPlayer,
        kind: v.kind,
        colorHex: v.colorHex,
        leg: v.leg,
        turnIntent: v.turnIntent,
        s: v.s,
        speedMps: v.speedMps,
        worldX: v.worldX,
        worldZ: v.worldZ,
        headingRad: v.headingRad,
        pitchRad: v.pitchRad,
        stopTimestamp: v.stopTimestamp,
        stopOrderBadge: v.stopOrderBadge,
        turnSignal: v.turnSignal,
        brakeLightsOn: v.brakeLightsOn,
        highBeamFlashOn: v.highBeamFlashOn,
        emergencyLightsOn: v.emergencyLightsOn,
        schoolBusStopArmOut: v.schoolBusStopArmOut,
      })),
      pedestrians: pedestrians.map((p) => ({
        id: p.id,
        crosswalk: p.crosswalk,
        worldX: p.worldX,
        worldZ: p.worldZ,
        active: p.active,
      })),
    };

    this.frames.push(snapshot);

    // Trim frames older than 60 seconds
    const minTimestamp = timestampSec - MAX_REPLAY_DURATION_SEC;
    while (this.frames.length > 2 && this.frames[0].timestampSec < minTimestamp) {
      this.frames.shift();
    }
  }

  public addKeyframe(
    timestampSec: number,
    label: string,
    kind: ReplayKeyframe['kind']
  ): void {
    // Avoid duplicate keyframes within 0.3s of same kind
    const exists = this.keyframes.some(
      (k) => k.kind === kind && Math.abs(k.timestampSec - timestampSec) < 0.3
    );
    if (!exists) {
      this.keyframes.push({ timestampSec, label, kind });
    }
  }

  public getFrames(): ReplayFrameSnapshot[] {
    return this.frames;
  }

  public getKeyframes(): ReplayKeyframe[] {
    return this.keyframes;
  }

  public getDurationSec(): number {
    if (this.frames.length === 0) return 0;
    return this.frames[this.frames.length - 1].timestampSec - this.frames[0].timestampSec;
  }

  public getStartTimeSec(): number {
    return this.frames.length > 0 ? this.frames[0].timestampSec : 0;
  }

  public getEndTimeSec(): number {
    return this.frames.length > 0 ? this.frames[this.frames.length - 1].timestampSec : 0;
  }

  /**
   * Returns an interpolated or nearest frame snapshot for a given replay timestamp.
   */
  public getSnapshotAtTime(targetSec: number): ReplayFrameSnapshot | null {
    if (this.frames.length === 0) return null;
    if (targetSec <= this.frames[0].timestampSec) return this.frames[0];
    const last = this.frames[this.frames.length - 1];
    if (targetSec >= last.timestampSec) return last;

    for (let i = 0; i < this.frames.length - 1; i++) {
      const f0 = this.frames[i];
      const f1 = this.frames[i + 1];
      if (targetSec >= f0.timestampSec && targetSec <= f1.timestampSec) {
        const span = f1.timestampSec - f0.timestampSec || 1;
        const alpha = (targetSec - f0.timestampSec) / span;
        return {
          timestampSec: targetSec,
          vehicles: f0.vehicles.map((v0, idx) => {
            const v1 = f1.vehicles[idx] ?? v0;
            return {
              ...v0,
              s: v0.s + (v1.s - v0.s) * alpha,
              speedMps: v0.speedMps + (v1.speedMps - v0.speedMps) * alpha,
              worldX: v0.worldX + (v1.worldX - v0.worldX) * alpha,
              worldZ: v0.worldZ + (v1.worldZ - v0.worldZ) * alpha,
              headingRad: lerpAngle(v0.headingRad, v1.headingRad, alpha),
              pitchRad: v0.pitchRad + (v1.pitchRad - v0.pitchRad) * alpha,
            };
          }),
          pedestrians: f0.pedestrians.map((p0, idx) => {
            const p1 = f1.pedestrians[idx] ?? p0;
            return {
              ...p0,
              worldX: p0.worldX + (p1.worldX - p0.worldX) * alpha,
              worldZ: p0.worldZ + (p1.worldZ - p0.worldZ) * alpha,
            };
          }),
        };
      }
    }
    return last;
  }

  /**
   * Returns true if all vehicles at `targetSec` are nearly stationary ("dead air"),
   * allowing the replay player to auto-time-warp at 2x speed.
   */
  public isDeadAirAtTime(targetSec: number): boolean {
    const snap = this.getSnapshotAtTime(targetSec);
    if (!snap) return false;
    return snap.vehicles.every((v) => v.speedMps < 0.35);
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = b - a;
  while (diff < -Math.PI) diff += Math.PI * 2;
  while (diff > Math.PI) diff -= Math.PI * 2;
  return a + diff * t;
}
