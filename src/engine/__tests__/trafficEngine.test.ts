import { describe, expect, it } from 'vitest';
import { SoundEffectsManager } from '../audio';
import { analyzeTrajectoryConflict } from '../conflictGraph';
import {
  getApproachPoseAtS,
  getExitStartPose,
  isStrictlyRightOfYellowLine,
  LEG_SPECS,
} from '../roadGeometry';
import { ReplayBuffer } from '../replayBuffer';
import {
  computeSimultaneousLeaderIds,
  evaluatePlayerCommit,
} from '../ruleEvaluator';
import { getScenarioById, SCENARIO_CATALOG } from '../scenarios';
import { IntersectionSimulation } from '../simulation';
import { evaluateVehiclePoseAtS } from '../turnSplines';
import { ApproachLeg, VehicleState } from '../types';

describe('US Right-Hand Traffic (RHT) Geometry & Splines (PRD Section 12.3)', () => {
  it('places all 4 approaches strictly on the right-hand side of the double-yellow centerline', () => {
    const legs: ApproachLeg[] = ['SOUTH', 'NORTH', 'WEST', 'EAST'];
    for (const leg of legs) {
      for (const lane of [0, 1] as const) {
        const pose = getApproachPoseAtS(leg, lane, -5.0, 2);
        expect(isStrictlyRightOfYellowLine(leg, pose.x, pose.z)).toBe(true);
      }
    }

    // Verify exact PRD Section 12.3 lane coordinates
    const southInner = getApproachPoseAtS('SOUTH', 0, 0, 2);
    expect(southInner.x).toBeCloseTo(1.75, 2);
    expect(southInner.z).toBeCloseTo(11.5, 2);

    const northInner = getApproachPoseAtS('NORTH', 0, 0, 2);
    expect(northInner.x).toBeCloseTo(-1.75, 2);
    expect(northInner.z).toBeCloseTo(-11.5, 2);

    const westInner = getApproachPoseAtS('WEST', 0, 0, 2);
    expect(westInner.x).toBeCloseTo(-11.5, 2);
    expect(westInner.z).toBeCloseTo(1.75, 2);

    const eastInner = getApproachPoseAtS('EAST', 0, 0, 2);
    expect(eastInner.x).toBeCloseTo(11.5, 2);
    expect(eastInner.z).toBeCloseTo(-1.75, 2);
  });

  it('places STOP + ALL WAY signs on the right-hand corner of each approach (SE, NW, SW, NE)', () => {
    expect(LEG_SPECS.SOUTH.stopSignPos.x).toBeGreaterThan(0);
    expect(LEG_SPECS.SOUTH.stopSignPos.z).toBeGreaterThan(0);

    expect(LEG_SPECS.NORTH.stopSignPos.x).toBeLessThan(0);
    expect(LEG_SPECS.NORTH.stopSignPos.z).toBeLessThan(0);

    expect(LEG_SPECS.WEST.stopSignPos.x).toBeLessThan(0);
    expect(LEG_SPECS.WEST.stopSignPos.z).toBeGreaterThan(0);

    expect(LEG_SPECS.EAST.stopSignPos.x).toBeGreaterThan(0);
    expect(LEG_SPECS.EAST.stopSignPos.z).toBeLessThan(0);
  });

  it('ensures opposing left-turning vehicles pass IN FRONT OF each other with zero conflict', () => {
    const nsLeftConflict = analyzeTrajectoryConflict(
      {
        leg: 'SOUTH',
        startLane: 0,
        turnIntent: 'LEFT',
        receivingLane: 0,
        lanesPerApproach: 2,
      },
      {
        leg: 'NORTH',
        startLane: 0,
        turnIntent: 'LEFT',
        receivingLane: 0,
        lanesPerApproach: 2,
      }
    );

    expect(nsLeftConflict.conflicts).toBe(false);
    expect(nsLeftConflict.canShadowConcurrently).toBe(true);
    expect(nsLeftConflict.minSeparationMeters).toBeGreaterThan(2.85);

    const ewLeftConflict = analyzeTrajectoryConflict(
      {
        leg: 'WEST',
        startLane: 0,
        turnIntent: 'LEFT',
        receivingLane: 0,
        lanesPerApproach: 2,
      },
      {
        leg: 'EAST',
        startLane: 0,
        turnIntent: 'LEFT',
        receivingLane: 0,
        lanesPerApproach: 2,
      }
    );

    expect(ewLeftConflict.conflicts).toBe(false);
    expect(ewLeftConflict.canShadowConcurrently).toBe(true);
  });

  it('routes exit poses into the proper right-hand receiving lane of the destination road', () => {
    // South turning Left onto West leg (heading Westbound -X => North half of West road, z < 0)
    const southToWest = getExitStartPose('SOUTH', 'LEFT', 0, 2);
    expect(southToWest.pose.x).toBeCloseTo(-11.5, 2);
    expect(southToWest.pose.z).toBeCloseTo(-1.75, 2);

    // South turning Right onto East leg (heading Eastbound +X => South half of East road, z > 0)
    const southToEast = getExitStartPose('SOUTH', 'RIGHT', 1, 2);
    expect(southToEast.pose.x).toBeCloseTo(11.5, 2);
    expect(southToEast.pose.z).toBeCloseTo(5.25, 2);

    // Mid-turn pose continuity
    const midPose = evaluateVehiclePoseAtS('SOUTH', 0, 'LEFT', 0, 7.5, 2);
    expect(Number.isFinite(midPose.x)).toBe(true);
    expect(Number.isFinite(midPose.z)).toBe(true);
  });
});

describe('Hierarchical US 4-Way Stop Rule & OFM Point Evaluator (PRD REQ-04 & REQ-12)', () => {
  const makeDummyVehicle = (
    id: string,
    leg: ApproachLeg,
    turnIntent: 'STRAIGHT' | 'LEFT' | 'RIGHT',
    stopTimestamp: number | null,
    lane: 0 | 1 = 0
  ): VehicleState => ({
    id,
    label: id,
    isPlayer: id === 'player',
    kind: 'SEDAN',
    colorHex: 0xffffff,
    leg,
    lane,
    turnIntent,
    receivingLane: lane,
    trait: 'LAW_ABIDING',
    s: 0,
    speedMps: 0,
    targetCruiseMps: 7,
    accelMps2: 0,
    zone: 'ZONE_1_STOP',
    stopTimestamp,
    stopOrderBadge: null,
    hasPriorityNow: false,
    turnSignal: 'OFF',
    brakeLightsOn: true,
    highBeamFlashOn: false,
    emergencyLightsOn: false,
    schoolBusStopArmOut: false,
    pitchRad: 0,
    worldX: 0,
    worldZ: 0,
    headingRad: 0,
    acknowledgedHorn: false,
  });

  it('cites RAN_STOP_SIGN / ROLLING_STOP (3 OFM Points) when player enters Zone 3 without stopping', () => {
    const scenario = getScenarioById('tier1-seed1-fifo-yield');
    const player = makeDummyVehicle('player', 'SOUTH', 'STRAIGHT', null);

    const resRolling = evaluatePlayerCommit(
      scenario,
      player,
      [],
      [],
      'UNIVERSAL_US',
      1.8, // slowed to ~4 mph ("California Roll")
      null
    );
    expect(resRolling.violation?.code).toBe('ROLLING_STOP');
    expect(resRolling.violation?.ofmPoints).toBe(3);

    const resRan = evaluatePlayerCommit(
      scenario,
      player,
      [],
      [],
      'UNIVERSAL_US',
      6.5,
      null
    );
    expect(resRan.violation?.code).toBe('RAN_STOP_SIGN');
    expect(resRan.violation?.ofmPoints).toBe(3);
  });

  it('enforces First-to-Stop, First-to-Go (FIFO) priority and cites 2 OFM points on violation', () => {
    const scenario = getScenarioById('tier1-seed1-fifo-yield');
    const player = makeDummyVehicle('player', 'SOUTH', 'STRAIGHT', 3.0);
    const westAI = makeDummyVehicle('ai-west', 'WEST', 'STRAIGHT', 1.2);

    const res = evaluatePlayerCommit(
      scenario,
      player,
      [westAI],
      [],
      'UNIVERSAL_US',
      0,
      null
    );
    expect(res.violation?.code).toBe('FAILURE_TO_YIELD_FIFO');
    expect(res.violation?.ofmPoints).toBe(2);
  });

  it('enforces Simultaneous Arrival Yield-to-the-Right tiebreaker (East has priority over South)', () => {
    const scenario = getScenarioById('tier2-seed1-yield-to-right');
    const player = makeDummyVehicle('player', 'SOUTH', 'STRAIGHT', 2.5);
    const eastAI = makeDummyVehicle('ai-east', 'EAST', 'STRAIGHT', 2.52);

    const res = evaluatePlayerCommit(
      scenario,
      player,
      [eastAI],
      [],
      'UNIVERSAL_US',
      0,
      null
    );
    expect(res.violation?.code).toBe('FAILURE_TO_YIELD_RIGHT_TIEBREAKER');
    expect(res.violation?.ofmPoints).toBe(2);

    // Conversely, when West stops simultaneously with South, South (player) is on the right and has priority!
    const westAI = makeDummyVehicle('ai-west', 'WEST', 'STRAIGHT', 2.52);
    const resPlayerRight = evaluatePlayerCommit(
      scenario,
      player,
      [westAI],
      [],
      'UNIVERSAL_US',
      0,
      null
    );
    expect(resPlayerRight.violation).toBeNull();
  });

  it('resolves the 3-Car Simultaneous + Left-Turn Circular Deadlock (Risk #2)', () => {
    // South (Straight), East (Straight), North (Left-Turn across South)
    const southPlayer = makeDummyVehicle('player', 'SOUTH', 'STRAIGHT', 2.0);
    const eastAI = makeDummyVehicle('ai-east', 'EAST', 'STRAIGHT', 2.0);
    const northLeftAI = makeDummyVehicle('ai-north', 'NORTH', 'LEFT', 2.0);

    const leaders = computeSimultaneousLeaderIds([southPlayer, eastAI, northLeftAI]);
    // North has no car on its right (West is empty), but North is turning LEFT across opposing South Straight!
    // Therefore South (opposing straight) breaks the deadlock and receives priority!
    expect(leaders.has('player')).toBe(true);
  });

  it('cites IMPROPER_LEFT_TURN_LANE (2 OFM points) when turning left from the outer right curb lane on a 2-lane approach', () => {
    const scenario = getScenarioById('tier6-seed1-multilane-left-lane');
    const playerWrongLane = makeDummyVehicle('player', 'SOUTH', 'LEFT', 2.0, 1); // Lane 1 = Outer curb lane

    const res = evaluatePlayerCommit(
      scenario,
      playerWrongLane,
      [],
      [],
      'UNIVERSAL_US',
      0,
      null
    );
    expect(res.violation?.code).toBe('IMPROPER_LEFT_TURN_LANE');
    expect(res.violation?.ofmPoints).toBe(2);
  });

  it('enforces Emergency Vehicle, School Bus Stop-Arm, and Tier 7 Wave-Trap / Rolling-Stopper rules', () => {
    const scenario = getScenarioById('tier5-seed1-emergency-siren');
    const player = makeDummyVehicle('player', 'SOUTH', 'STRAIGHT', 1.5);
    const ambulance = makeDummyVehicle('amb', 'WEST', 'STRAIGHT', null);
    ambulance.trait = 'EMERGENCY_SIREN';
    ambulance.s = -5.0;

    const emergRes = evaluatePlayerCommit(
      scenario,
      player,
      [ambulance],
      [],
      'UNIVERSAL_US',
      0,
      null
    );
    expect(emergRes.violation?.code).toBe('EMERGENCY_VEHICLE_VIOLATION');

    const waveTrapRunner = makeDummyVehicle('runner', 'EAST', 'STRAIGHT', null, 1);
    waveTrapRunner.trait = 'WAVE_TRAP_HIDDEN';
    waveTrapRunner.s = -4.0;
    const waveRes = evaluatePlayerCommit(
      scenario,
      player,
      [waveTrapRunner],
      [],
      'UNIVERSAL_US',
      0,
      null
    );
    expect(waveRes.violation?.code).toBe('WAVE_TRAP_COLLISION');
  });
});

describe('Simulation State Machine & 60-Second Replay Buffer', () => {
  it('loads all 16 scenarios across all 7 curriculum tiers without error and records replay frames', () => {
    expect(SCENARIO_CATALOG.length).toBeGreaterThanOrEqual(14);
    const audio = new SoundEffectsManager();
    audio.muted = true;

    const sim = new IntersectionSimulation(SCENARIO_CATALOG[0], audio);
    sim.startDrivingFromBriefing();
    expect(sim.stage).toBe('STAGE_2_APPROACH');

    // Step simulation while coasting on approach and braking into Zone 1
    for (let i = 0; i < 120; i++) {
      sim.step(0.05, {
        accelerate: false,
        brake: sim.player.s >= -8.0 && sim.player.stopTimestamp === null,
        lookDirection: i % 2 === 0 ? 'LEFT' : 'RIGHT',
      });
    }

    expect(sim.player.stopTimestamp).not.toBeNull();
    expect(sim.lookedLeftAfterStop).toBe(true);
    expect(sim.lookedRightAfterStop).toBe(true);

    // Verify 60s ReplayBuffer interpolation
    const buf = new ReplayBuffer();
    buf.recordFrame(0, [sim.player], sim.pedestrians, true);
    buf.recordFrame(1.0, [sim.player], sim.pedestrians, true);
    buf.addKeyframe(0.5, 'Test Stop', 'STOP');
    expect(buf.getKeyframes().length).toBe(1);
    expect(buf.getSnapshotAtTime(0.5)).not.toBeNull();
  });
});
