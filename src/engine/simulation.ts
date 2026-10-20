import { SoundEffectsManager } from './audio';
import { analyzeTrajectoryConflict } from './conflictGraph';
import {
  CREEP_MAX_SPEED_MPS,
  INTERSECTION_HALF_BOX,
  ZONE_1_STOP_MAX_S,
  ZONE_1_STOP_MIN_S,
  ZONE_2_CREEP_MAX_S,
} from './roadGeometry';
import { ReplayBuffer } from './replayBuffer';
import {
  computeSimultaneousLeaderIds,
  evaluatePlayerCommit,
  findConflictingPedestrian,
} from './ruleEvaluator';
import { applyDynamicStopSync, SIMULTANEOUS_TIE_THRESHOLD_SEC } from './stopSync';
import { evaluateVehiclePoseAtS } from './turnSplines';
import {
  CrosswalkSide,
  HeadLookDirection,
  JurisdictionMode,
  PedestrianState,
  ScenarioDefinition,
  ScenarioEvaluationResult,
  UXFlowStage,
  VehicleState,
  ViolationCitation,
} from './types';

export interface PlayerInputState {
  accelerate: boolean;
  brake: boolean;
  lookDirection: HeadLookDirection;
}

export class IntersectionSimulation {
  public scenario: ScenarioDefinition;
  public stage: UXFlowStage = 'STAGE_1_BRIEFING';
  public simTimeSec = 0;
  public player!: VehicleState;
  public aiVehicles: VehicleState[] = [];
  public pedestrians: PedestrianState[] = [];
  public replayBuffer = new ReplayBuffer();
  public audio: SoundEffectsManager;

  public jurisdiction: JurisdictionMode = 'UNIVERSAL_US';
  public wipersActive = false;
  public lookedLeftAfterStop = false;
  public lookedRightAfterStop = false;
  public usedCreepZone = false;
  public lowestSpeedInZone1Mps = 99;
  public hesitationTimerSec = 0;
  public isPlayerHoldRightOfWay = false;

  public evaluationResult: ScenarioEvaluationResult | null = null;
  public transientBanner: { text: string; tone: 'info' | 'safe' | 'warn' } | null = null;
  private bannerExpirySec = 0;

  // Cumulative US Dept of State OFM Driving Record Points
  public ofmTotalPoints = 0;
  public completedScenarioIds = new Set<string>();
  public tierStars = new Map<string, number>();

  constructor(scenario: ScenarioDefinition, audio: SoundEffectsManager) {
    this.scenario = scenario;
    this.audio = audio;
    this.loadScenario(scenario, true);
  }

  public loadScenario(scenario: ScenarioDefinition, showBriefing = true): void {
    this.scenario = scenario;
    this.stage = showBriefing ? 'STAGE_1_BRIEFING' : 'STAGE_2_APPROACH';
    this.simTimeSec = 0;
    this.wipersActive = false;
    this.lookedLeftAfterStop = false;
    this.lookedRightAfterStop = false;
    this.usedCreepZone = false;
    this.lowestSpeedInZone1Mps = 99;
    this.hesitationTimerSec = 0;
    this.isPlayerHoldRightOfWay = false;
    this.evaluationResult = null;
    this.transientBanner = null;
    this.replayBuffer.clear();

    const playerReceivingLane =
      scenario.lanesPerApproach === 2
        ? scenario.playerTurnIntent === 'RIGHT'
          ? 1
          : 0
        : 0;

    const initialPlayerS = -22.0;
    const playerPose = evaluateVehiclePoseAtS(
      'SOUTH',
      scenario.playerStartLane,
      scenario.playerTurnIntent,
      playerReceivingLane,
      initialPlayerS,
      scenario.lanesPerApproach
    );

    this.player = {
      id: 'player',
      label: 'You (South Leg)',
      isPlayer: true,
      kind: 'SEDAN',
      colorHex: 0x10b981,
      leg: 'SOUTH',
      lane: scenario.playerStartLane,
      turnIntent: scenario.playerTurnIntent,
      receivingLane: playerReceivingLane,
      trait: 'LAW_ABIDING',
      s: initialPlayerS,
      speedMps: 6.4, // ~14.3 mph approach speed
      targetCruiseMps: 7.2,
      accelMps2: 0,
      zone: 'APPROACH',
      stopTimestamp: null,
      stopOrderBadge: null,
      hasPriorityNow: false,
      turnSignal:
        scenario.playerTurnIntent === 'LEFT'
          ? 'LEFT'
          : scenario.playerTurnIntent === 'RIGHT'
          ? 'RIGHT'
          : 'OFF',
      brakeLightsOn: false,
      highBeamFlashOn: false,
      emergencyLightsOn: false,
      schoolBusStopArmOut: false,
      pitchRad: 0,
      worldX: playerPose.x,
      worldZ: playerPose.z,
      headingRad: playerPose.headingRad,
      acknowledgedHorn: false,
    };

    this.aiVehicles = scenario.aiSpawns.map((sp) => {
      const recLane =
        sp.receivingLane !== undefined
          ? sp.receivingLane
          : scenario.lanesPerApproach === 2
          ? sp.turnIntent === 'RIGHT'
            ? 1
            : 0
          : 0;
      const pose = evaluateVehiclePoseAtS(
        sp.leg,
        sp.lane,
        sp.turnIntent,
        recLane,
        sp.initialS,
        scenario.lanesPerApproach
      );

      const isAlreadyStopped = sp.initialSpeedMps === 0 && sp.initialS >= ZONE_1_STOP_MIN_S;

      return {
        id: sp.id,
        label: sp.label,
        isPlayer: false,
        kind: sp.kind,
        colorHex: sp.colorHex,
        leg: sp.leg,
        lane: sp.lane,
        turnIntent: sp.turnIntent,
        receivingLane: recLane,
        trait: sp.trait,
        s: sp.initialS,
        speedMps: sp.initialSpeedMps,
        targetCruiseMps: sp.kind === 'CYCLIST' ? 4.3 : sp.trait === 'EMERGENCY_SIREN' ? 10.5 : 7.0,
        accelMps2: 0,
        zone: isAlreadyStopped ? 'ZONE_1_STOP' : 'APPROACH',
        stopTimestamp: isAlreadyStopped ? 0.05 : null,
        stopOrderBadge: null,
        hasPriorityNow: false,
        turnSignal:
          sp.turnIntent === 'LEFT'
            ? 'LEFT'
            : sp.turnIntent === 'RIGHT'
            ? 'RIGHT'
            : 'OFF',
        brakeLightsOn: isAlreadyStopped,
        highBeamFlashOn: sp.trait === 'POLITE_WAVER',
        emergencyLightsOn: sp.trait === 'EMERGENCY_SIREN',
        schoolBusStopArmOut: sp.trait === 'SCHOOL_BUS_RED_FLASH',
        pitchRad: 0,
        worldX: pose.x,
        worldZ: pose.z,
        headingRad: pose.headingRad,
        acknowledgedHorn: false,
      };
    });

    this.pedestrians = scenario.pedestrianSpawns.map((ps) => {
      const coords = computePedestrianWorldCoords(ps.crosswalk, ps.initialProgress);
      return {
        id: ps.id,
        crosswalk: ps.crosswalk,
        progress: ps.initialProgress,
        direction: ps.direction,
        speedNormalizedPerSec: ps.speedNormalizedPerSec,
        active: true,
        isJaywalker: ps.isJaywalker,
        worldX: coords.x,
        worldZ: coords.z,
        activeHalf: ps.initialProgress < 0 ? 'NEGATIVE_HALF' : 'POSITIVE_HALF',
      };
    });

    this.replayBuffer.recordFrame(0, [this.player, ...this.aiVehicles], this.pedestrians, true);
  }

  public startDrivingFromBriefing(): void {
    if (this.stage === 'STAGE_1_BRIEFING') {
      this.stage = 'STAGE_2_APPROACH';
      this.showBanner('Approach the White Stop Line — Hold [S] / [SPACE] to Brake to 0.0 mph', 'info', 3.5);
    }
  }

  public switchPlayerApproachLane(targetLane: 0 | 1): void {
    if (!this.scenario.allowPlayerLaneSwitch) return;
    if (this.player.s > -3.5) {
      this.showBanner('Solid White Line Ahead — Too late to change approach lanes!', 'warn', 2.5);
      return;
    }
    this.player.lane = targetLane;
    this.player.receivingLane =
      this.scenario.lanesPerApproach === 2
        ? this.player.turnIntent === 'RIGHT'
          ? 1
          : 0
        : 0;
    this.showBanner(
      targetLane === 0
        ? 'Shifted to Inner Left-Turn Lane (Lane 0 — Right of Double-Yellow)'
        : 'Shifted to Outer Right Curb Lane (Lane 1)',
      'safe',
      2.5
    );
  }

  public toggleWipers(): void {
    this.wipersActive = !this.wipersActive;
    this.showBanner(
      this.wipersActive ? 'Windshield Wipers & Defogger ON [F]' : 'Windshield Wipers OFF',
      'safe',
      2.0
    );
  }

  public honkHorn(): void {
    this.audio.playHorn();
    let reacted = false;
    for (const ai of this.aiVehicles) {
      if (ai.trait === 'POLITE_WAVER' && ai.highBeamFlashOn) {
        ai.highBeamFlashOn = false;
        ai.acknowledgedHorn = false;
        reacted = true;
      }
    }
    if (reacted) {
      this.showBanner('Horn [H]: Polite Waver cancelled courtesy wave — watch outer lane!', 'info', 3.0);
    } else {
      this.showBanner('Horn [H] sounded', 'info', 1.4);
    }
  }

  public showBanner(text: string, tone: 'info' | 'safe' | 'warn', durationSec = 2.6): void {
    this.transientBanner = { text, tone };
    this.bannerExpirySec = this.simTimeSec + durationSec;
  }

  public step(dtSec: number, input: PlayerInputState): void {
    if (this.stage === 'STAGE_1_BRIEFING' || this.stage === 'STAGE_5_OUTCOME_REPLAY') {
      return;
    }

    const dt = Math.min(dtSec, 0.05);
    this.simTimeSec += dt;

    if (this.transientBanner && this.simTimeSec > this.bannerExpirySec) {
      this.transientBanner = null;
    }

    // Update turn signal audio relay
    this.audio.updateBlinker(
      dt,
      this.player.turnSignal !== 'OFF' && this.player.zone !== 'EXITED'
    );

    // Track head-check scanning after or near stop
    if (this.player.s >= -5.0) {
      if (input.lookDirection === 'LEFT') this.lookedLeftAfterStop = true;
      if (input.lookDirection === 'RIGHT') this.lookedRightAfterStop = true;
    }

    // 1. Update Pedestrians
    this.updatePedestrians(dt);

    // 2. Update Player Kinematics & 3-Zone Spatial State Machine
    this.updatePlayerVehicle(dt, input);

    // 3. Update AI Vehicles & Dynamic Stop-Sync
    this.updateAIVehicles(dt);
    applyDynamicStopSync(this.scenario, this.player, this.aiVehicles, this.simTimeSec);

    // 4. Evaluate Priority & Hesitation Timer
    this.updatePriorityAndHesitation(dt);

    // 5. Record frame to 60s Replay Buffer
    this.replayBuffer.recordFrame(
      this.simTimeSec,
      [this.player, ...this.aiVehicles],
      this.pedestrians
    );

    // 6. Check if Player has completed crossing (Pass condition)
    if (this.player.s >= 18.5 && this.stage === 'STAGE_4_COMMIT') {
      this.completeScenarioPass();
    }
  }

  private updatePedestrians(dt: number): void {
    for (const ped of this.pedestrians) {
      if (!ped.active) continue;
      ped.progress += ped.direction * ped.speedNormalizedPerSec * dt;
      if (ped.progress > 1.05 || ped.progress < -1.05) {
        ped.active = false;
      }
      const coords = computePedestrianWorldCoords(ped.crosswalk, ped.progress);
      ped.worldX = coords.x;
      ped.worldZ = coords.z;
      ped.activeHalf =
        Math.abs(ped.progress) < 0.15
          ? 'CENTER_DIVIDER'
          : ped.progress < 0
          ? 'NEGATIVE_HALF'
          : 'POSITIVE_HALF';
    }

    // If a School Bus is waiting for a student on the North crosswalk, retract its stop arm once the student clears!
    for (const ai of this.aiVehicles) {
      if (ai.trait === 'SCHOOL_BUS_RED_FLASH' && ai.schoolBusStopArmOut) {
        const activeNorthPed = this.pedestrians.some(
          (p) => p.crosswalk === 'NORTH' && p.active && Math.abs(p.progress) < 0.95
        );
        if (!activeNorthPed && this.simTimeSec > 3.5) {
          ai.schoolBusStopArmOut = false;
          ai.emergencyLightsOn = false;
          ai.trait = 'LAW_ABIDING';
          ai.stopTimestamp = 0.1;
          this.showBanner('School Bus Red Stop Arm Retracted — Safe to Proceed After Bus', 'safe', 3.0);
        }
      }
    }
  }

  private updatePlayerVehicle(dt: number, input: PlayerInputState): void {
    const p = this.player;
    const prevSpeed = p.speedMps;

    // Determine acceleration / braking based on current zone and input
    if (input.brake) {
      p.brakeLightsOn = true;
      // Smart Stop-Line Brake Modulation: if player holds brake early on approach (before Zone 1),
      // decelerate smoothly to an approach crawl (~2.0 m/s) into Zone 1, then lock to 0.0 mph inside Zone 1!
      if (p.stopTimestamp === null && p.s < ZONE_1_STOP_MIN_S + 0.3) {
        const distToZone1 = (ZONE_1_STOP_MIN_S + 0.8) - p.s;
        const idealSpeed = Math.max(1.8, Math.min(7.0, Math.sqrt(2 * 3.5 * Math.max(0.2, distToZone1))));
        p.accelMps2 = p.speedMps > idealSpeed ? -8.5 : 0;
      } else {
        p.accelMps2 = -9.5;
      }
    } else if (input.accelerate) {
      p.brakeLightsOn = false;
      if (p.stopTimestamp !== null && p.s <= ZONE_2_CREEP_MAX_S && this.stage === 'STAGE_3_STOP_SCAN_CREEP') {
        // Controlled progression through Zone 2 Creep Buffer into Zone 3
        p.accelMps2 = 3.8;
      } else {
        p.accelMps2 = 4.8;
      }
    } else {
      // Neither pedal pressed:
      // - While approaching (< -2.5m), gentle engine coasting so player must actively brake
      // - Inside Zone 1 or Zone 2 after stopping, automatic creep-hold braking brings car to 0 mph
      if (p.stopTimestamp !== null && p.s <= ZONE_2_CREEP_MAX_S) {
        p.accelMps2 = -6.0;
        p.brakeLightsOn = p.speedMps < 0.2;
      } else {
        p.accelMps2 = -0.55;
        p.brakeLightsOn = false;
      }
    }

    p.speedMps = Math.max(0, Math.min(11.5, p.speedMps + p.accelMps2 * dt));
    p.s += p.speedMps * dt;

    // Suspension pitch feedback (nose-dive under braking, slight squat under acceleration)
    const targetPitch =
      p.speedMps > 0.05 && input.brake
        ? 0.042
        : p.speedMps > 0.2 && input.accelerate
        ? -0.022
        : 0;
    p.pitchRad += (targetPitch - p.pitchRad) * Math.min(1, dt * 10);

    // Track lowest speed in Zone 1 for rolling-stop diagnostics
    if (p.s >= ZONE_1_STOP_MIN_S - 1.0 && p.s <= ZONE_2_CREEP_MAX_S) {
      this.lowestSpeedInZone1Mps = Math.min(this.lowestSpeedInZone1Mps, p.speedMps);
    }

    // Check Legal Complete Stop Registration in Zone 1 [-3.2m, +0.25m]
    if (
      p.stopTimestamp === null &&
      p.s >= ZONE_1_STOP_MIN_S &&
      p.s <= ZONE_1_STOP_MAX_S &&
      p.speedMps <= 0.08
    ) {
      p.speedMps = 0;
      p.stopTimestamp = this.simTimeSec;
      p.zone = 'ZONE_1_STOP';
      this.stage = 'STAGE_3_STOP_SCAN_CREEP';
      this.audio.playStopRegisteredChime();
      this.replayBuffer.addKeyframe(this.simTimeSec, 'You Stopped (0.0 mph)', 'STOP');
      this.showBanner('COMPLETE STOP REGISTERED (0.0 mph) — Scan [A]/[D] & Check Priority', 'safe', 3.0);
    }

    // Zone 2: Visibility Creep Buffer (0.0m < s <= +1.5m)
    if (p.stopTimestamp !== null && p.s > ZONE_1_STOP_MAX_S && p.s <= ZONE_2_CREEP_MAX_S) {
      p.zone = 'ZONE_2_CREEP';
      this.stage = 'STAGE_3_STOP_SCAN_CREEP';
      if (!this.usedCreepZone) {
        this.usedCreepZone = true;
        this.replayBuffer.addKeyframe(this.simTimeSec, 'Creep Zone (+1.5m Sightline)', 'CREEP');
      }
      // If creeping gently without committing yet, cap creep speed if player taps W
      if (!input.accelerate && prevSpeed > 0) {
        p.speedMps = Math.min(p.speedMps, CREEP_MAX_SPEED_MPS);
      }
    }

    // Zone 3: Conflict Entry Threshold (s > +1.5m) -> COMMIT!
    if (p.s > ZONE_2_CREEP_MAX_S && p.zone !== 'ZONE_3_COMMIT' && p.zone !== 'EXITED') {
      p.zone = 'ZONE_3_COMMIT';
      this.stage = 'STAGE_4_COMMIT';
      this.replayBuffer.addKeyframe(this.simTimeSec, 'Player Committed to Intersection', 'COMMIT');

      const evalOutcome = evaluatePlayerCommit(
        this.scenario,
        this.player,
        this.aiVehicles,
        this.pedestrians,
        this.jurisdiction,
        this.lowestSpeedInZone1Mps,
        null
      );

      if (evalOutcome.violation) {
        this.triggerViolationOutcome(evalOutcome.violation);
        return;
      }
    }

    // Update Player 3D World Pose along US RHT Spline
    const pose = evaluateVehiclePoseAtS(
      p.leg,
      p.lane,
      p.turnIntent,
      p.receivingLane,
      p.s,
      this.scenario.lanesPerApproach
    );
    p.worldX = pose.x;
    p.worldZ = pose.z;
    p.headingRad = pose.headingRad;
  }

  private updateAIVehicles(dt: number): void {
    for (const ai of this.aiVehicles) {
      if (ai.zone === 'EXITED') continue;

      if (ai.trait === 'EMERGENCY_SIREN') {
        // Emergency vehicle cruises right through with siren & lights
        ai.speedMps = ai.targetCruiseMps;
        ai.s += ai.speedMps * dt;
      } else if (ai.trait === 'SCHOOL_BUS_RED_FLASH') {
        // School bus stays stopped at limit line while red lights flash
        ai.speedMps = 0;
        ai.brakeLightsOn = true;
      } else if (ai.trait === 'ROLLING_STOPPER') {
        // Tier 7 Rolling Stopper: slows slightly near s = 0 (~5.8 m/s = 13 mph) then accelerates through!
        const target = ai.s > -6.0 && ai.s < 2.0 ? 5.6 : 7.8;
        ai.speedMps += (target - ai.speedMps) * Math.min(1, dt * 4);
        ai.s += ai.speedMps * dt;
        ai.brakeLightsOn = ai.s > -8.0 && ai.s < -1.0;
      } else if (ai.trait === 'WAVE_TRAP_HIDDEN') {
        // Tier 7 Outer-lane wave trap vehicle: cruises through outer lane after brief delay
        if (this.simTimeSec > 1.2) {
          ai.speedMps = 7.2;
          ai.s += ai.speedMps * dt;
        }
      } else if (ai.trait === 'POLITE_WAVER') {
        // Stops at limit line and flashes high beams waving player through
        ai.speedMps = 0;
        ai.brakeLightsOn = true;
        if (ai.stopTimestamp === null) {
          ai.stopTimestamp = 0.1;
          this.replayBuffer.addKeyframe(this.simTimeSec, `${ai.label} Waving`, 'WAVE');
        }
      } else {
        // Standard Law-Abiding AI (including cyclists and box truck occluders)
        this.updateLawAbidingAI(ai, dt);
      }

      if (ai.s > 25.0) {
        ai.zone = 'EXITED';
        ai.turnSignal = 'OFF';
      }

      const pose = evaluateVehiclePoseAtS(
        ai.leg,
        ai.lane,
        ai.turnIntent,
        ai.receivingLane,
        ai.s,
        this.scenario.lanesPerApproach
      );
      ai.worldX = pose.x;
      ai.worldZ = pose.z;
      ai.headingRad = pose.headingRad;
    }
  }

  private updateLawAbidingAI(ai: VehicleState, dt: number): void {
    // Cyclist in bike lane continues smoothly across intersection
    if (ai.kind === 'CYCLIST') {
      ai.speedMps = ai.targetCruiseMps;
      ai.s += ai.speedMps * dt;
      ai.zone = ai.s > 1.5 ? 'ZONE_3_COMMIT' : 'APPROACH';
      return;
    }

    // Box truck occluder in Tier 6.2 waits so player can practice creeping past it
    if (ai.kind === 'BOX_TRUCK') {
      if (this.player.s < 6.0) {
        ai.speedMps = 0;
        ai.brakeLightsOn = true;
        return;
      }
    }

    // Phase A: Approaching the White Stop Limit Line (s < -0.25m)
    if (ai.stopTimestamp === null) {
      const distToStop = -0.25 - ai.s;
      if (distToStop > 0.15) {
        // Smooth braking curve into Zone 1
        const desiredSpeed = Math.min(ai.targetCruiseMps, Math.sqrt(2 * 3.4 * distToStop));
        ai.speedMps = Math.max(0.35, desiredSpeed);
        ai.brakeLightsOn = distToStop < 9.0;
        ai.s += ai.speedMps * dt;
        ai.pitchRad = ai.brakeLightsOn ? 0.025 : 0;
      } else {
        ai.s = -0.25;
        ai.speedMps = 0;
        ai.stopTimestamp = this.simTimeSec;
        ai.zone = 'ZONE_1_STOP';
        ai.brakeLightsOn = true;
        ai.pitchRad = 0;
        this.replayBuffer.addKeyframe(this.simTimeSec, `${ai.label} Stopped`, 'STOP');
      }
      return;
    }

    // Phase B: Already committed to crossing (Zone 3)
    if (ai.zone === 'ZONE_3_COMMIT') {
      ai.brakeLightsOn = false;
      ai.speedMps = Math.min(ai.targetCruiseMps, ai.speedMps + 4.2 * dt);
      ai.s += ai.speedMps * dt;
      return;
    }

    // Phase C: Stopped in Zone 1 — Check if AI holds right-of-way and has waited >= 0.9s after stopping
    const waitElapsed = this.simTimeSec - (ai.stopTimestamp ?? 0);
    if (waitElapsed < 0.95) {
      ai.speedMps = 0;
      ai.brakeLightsOn = true;
      return;
    }

    if (this.canLawfulAIProceedNow(ai)) {
      ai.zone = 'ZONE_3_COMMIT';
      ai.brakeLightsOn = false;
    }
  }

  private canLawfulAIProceedNow(candidate: VehicleState): boolean {
    // 1. Yield to active emergency vehicles or school bus stop arm
    for (const other of this.aiVehicles) {
      if (other.id === candidate.id || other.zone === 'EXITED') continue;
      if (other.trait === 'EMERGENCY_SIREN' || other.schoolBusStopArmOut) {
        return false;
      }
      // If another AI is already inside Zone 3 on a conflicting path, wait for it to clear
      if (other.zone === 'ZONE_3_COMMIT' && other.s < 15.0) {
        const c = analyzeTrajectoryConflict(
          {
            leg: candidate.leg,
            startLane: candidate.lane,
            turnIntent: candidate.turnIntent,
            receivingLane: candidate.receivingLane,
            lanesPerApproach: this.scenario.lanesPerApproach,
          },
          {
            leg: other.leg,
            startLane: other.lane,
            turnIntent: other.turnIntent,
            receivingLane: other.receivingLane,
            lanesPerApproach: this.scenario.lanesPerApproach,
          }
        );
        if (c.conflicts) return false;
      }
    }

    // 2. Yield to conflicting pedestrians
    if (findConflictingPedestrian(candidate, this.pedestrians, this.jurisdiction)) {
      return false;
    }

    // 3. Compare against Player and other stopped Law-Abiding AIs
    const activeCompetitors = [
      this.player,
      ...this.aiVehicles.filter(
        (v) =>
          v.id !== candidate.id &&
          v.zone !== 'EXITED' &&
          v.trait === 'LAW_ABIDING' &&
          v.kind !== 'BOX_TRUCK' &&
          v.stopTimestamp !== null
      ),
    ];

    for (const comp of activeCompetitors) {
      if (comp.zone === 'EXITED') continue;

      const conflict = analyzeTrajectoryConflict(
        {
          leg: candidate.leg,
          startLane: candidate.lane,
          turnIntent: candidate.turnIntent,
          receivingLane: candidate.receivingLane,
          lanesPerApproach: this.scenario.lanesPerApproach,
        },
        {
          leg: comp.leg,
          startLane: comp.lane,
          turnIntent: comp.turnIntent,
          receivingLane: comp.receivingLane,
          lanesPerApproach: this.scenario.lanesPerApproach,
        }
      );

      // If non-conflicting (e.g. mutual left turns or opposing straight), AI can proceed concurrently
      // once the player has also stopped!
      if (!conflict.conflicts && conflict.canShadowConcurrently) {
        if (comp.isPlayer && comp.stopTimestamp === null) {
          return false;
        }
        continue;
      }

      if (comp.stopTimestamp === null) {
        // Competitor hasn't stopped yet: if candidate stopped clearly first, candidate can go
        // UNLESS this is a SIMULTANEOUS_TIE scenario waiting for player to stop!
        if (this.scenario.requiredStopMode === 'SIMULTANEOUS_TIE' && comp.isPlayer) {
          return false;
        }
        continue;
      }

      const dt = (candidate.stopTimestamp ?? 0) - (comp.stopTimestamp ?? 0);

      // Competitor stopped clearly BEFORE candidate -> candidate yields
      if (dt > SIMULTANEOUS_TIE_THRESHOLD_SEC) {
        return false;
      }

      // Simultaneous tie with competitor -> check tiebreaker leader set
      if (Math.abs(dt) <= SIMULTANEOUS_TIE_THRESHOLD_SEC) {
        const tiedAll = [
          candidate,
          ...activeCompetitors.filter(
            (c) =>
              c.stopTimestamp !== null &&
              Math.abs((c.stopTimestamp ?? 0) - (candidate.stopTimestamp ?? 0)) <=
                SIMULTANEOUS_TIE_THRESHOLD_SEC
          ),
        ];
        const leaders = computeSimultaneousLeaderIds(tiedAll);
        if (!leaders.has(candidate.id)) {
          return false;
        }
      }
    }

    return true;
  }

  private updatePriorityAndHesitation(dt: number): void {
    if (this.player.stopTimestamp === null || this.stage !== 'STAGE_3_STOP_SCAN_CREEP') {
      this.isPlayerHoldRightOfWay = false;
      this.hesitationTimerSec = 0;
      return;
    }

    const hypotheticalEval = evaluatePlayerCommit(
      this.scenario,
      this.player,
      this.aiVehicles,
      this.pedestrians,
      this.jurisdiction,
      this.lowestSpeedInZone1Mps,
      null
    );

    const anyActiveCrossTrafficInBox = this.aiVehicles.some(
      (ai) => ai.zone === 'ZONE_3_COMMIT' && ai.s > 0 && ai.s < 14.5
    );

    this.isPlayerHoldRightOfWay =
      hypotheticalEval.violation === null && !anyActiveCrossTrafficInBox;
    this.player.hasPriorityNow = this.isPlayerHoldRightOfWay;

    if (this.isPlayerHoldRightOfWay) {
      this.hesitationTimerSec += dt;
      if (this.hesitationTimerSec > 7.5) {
        this.triggerViolationOutcome({
          code: 'EXCESSIVE_HESITATION_DEADLOCK',
          title: 'Excessive Hesitation — Unnecessary Traffic Delay',
          ofmCategory: 'Traffic Flow Obstruction',
          ofmPoints: 0,
          ruleSummary:
            'You held the legal right-of-way with all hazards cleared for over 7.5 seconds without proceeding. At US 4-way stops, over-hesitating when it is your turn creates unpredictable deadlock and rear-end risk.',
          handbookReference: 'US Driver Guide — Assertive Right-of-Way Execution',
          conflictPoint: { x: this.player.worldX, z: this.player.worldZ },
        });
      }
    } else {
      this.hesitationTimerSec = 0;
    }
  }

  private triggerViolationOutcome(citation: ViolationCitation): void {
    this.stage = 'STAGE_5_OUTCOME_REPLAY';
    this.ofmTotalPoints += citation.ofmPoints;
    this.audio.playViolationAlert();
    this.replayBuffer.addKeyframe(this.simTimeSec, `Violation: ${citation.title}`, 'VIOLATION');
    this.replayBuffer.recordFrame(
      this.simTimeSec,
      [this.player, ...this.aiVehicles],
      this.pedestrians,
      true
    );

    this.evaluationResult = {
      passed: false,
      stars: 0,
      citation,
      complimentTitle: citation.title,
      complimentBody: citation.ruleSummary,
      usedConcurrentShadowing: false,
      headChecksCompleted: this.lookedLeftAfterStop && this.lookedRightAfterStop,
      completedStopAtLimitLine: this.player.stopTimestamp !== null,
    };
  }

  private completeScenarioPass(): void {
    this.stage = 'STAGE_5_OUTCOME_REPLAY';
    this.audio.playPassFanfare();
    this.completedScenarioIds.add(this.scenario.id);

    const headChecked = this.lookedLeftAfterStop || this.lookedRightAfterStop;
    const stars: 1 | 2 | 3 =
      this.hesitationTimerSec < 4.5 && headChecked ? 3 : headChecked ? 2 : 2;

    const prevBest = this.tierStars.get(this.scenario.id) ?? 0;
    if (stars > prevBest) {
      this.tierStars.set(this.scenario.id, stars);
    }

    this.replayBuffer.recordFrame(
      this.simTimeSec,
      [this.player, ...this.aiVehicles],
      this.pedestrians,
      true
    );

    this.evaluationResult = {
      passed: true,
      stars,
      citation: null,
      complimentTitle: 'Legal US 4-Way Stop Execution!',
      complimentBody: `You made a full 0.0 mph stop at the white limit line, respected US Right-Hand Traffic priority, and exited cleanly into the proper right-hand lane.`,
      usedConcurrentShadowing: this.scenario.id.includes('mutual') || this.scenario.id.includes('deadlock'),
      headChecksCompleted: headChecked,
      completedStopAtLimitLine: true,
    };
  }
}

function computePedestrianWorldCoords(
  crosswalk: CrosswalkSide,
  progress: number
): { x: number; z: number } {
  const span = 7.2; // Crosses from -7.2m to +7.2m across the roadway
  const crossDist = INTERSECTION_HALF_BOX - 1.3; // 10.2m from center (inside crosswalk zebra stripes)

  switch (crosswalk) {
    case 'SOUTH':
      return { x: progress * span, z: crossDist };
    case 'NORTH':
      return { x: -progress * span, z: -crossDist };
    case 'EAST':
      return { x: crossDist, z: progress * span };
    case 'WEST':
      return { x: -crossDist, z: -progress * span };
  }
}
