import { analyzeTrajectoryConflict } from './conflictGraph';
import { LEG_SPECS } from './roadGeometry';
import { SIMULTANEOUS_TIE_THRESHOLD_SEC } from './stopSync';
import {
  ApproachLeg,
  JurisdictionMode,
  PedestrianState,
  ScenarioDefinition,
  VehicleState,
  ViolationCitation,
} from './types';

/**
 * Determines which vehicle in a simultaneous tiebreaker group holds the statutory
 * right-of-way under US Traffic Law (PRD Section 7 REQ-04 & Risk #2 Mitigation):
 *
 * 1. Farthest-Right Chain Rule: A vehicle yields to a vehicle on its immediate right.
 *    If 2 or 3 vehicles arrive simultaneously on adjacent legs (e.g., West, South, East),
 *    the vehicle with NO stopped vehicle on its immediate right is the "Farthest Right" leader.
 * 2. 3-Car Simultaneous + Left-Turn Circular Deadlock Breaker (Risk #2):
 *    If the farthest-right vehicle is turning LEFT across an opposing straight vehicle in the
 *    simultaneous group, the opposing STRAIGHT/RIGHT vehicle takes priority first so the
 *    circular deadlock is cleanly resolved.
 * 3. Opposing Simultaneous Arrival (e.g., North & South):
 *    - Straight or Right goes before opposing Left turn.
 *    - If both go Straight, both go Right, or both turn Left (passing in front of each other),
 *      BOTH hold concurrent right-of-way!
 */
export function computeSimultaneousLeaderIds(tiedVehicles: VehicleState[]): Set<string> {
  const leaderIds = new Set<string>();
  if (tiedVehicles.length === 0) return leaderIds;
  if (tiedVehicles.length === 1) {
    leaderIds.add(tiedVehicles[0].id);
    return leaderIds;
  }

  const occupiedLegs = new Map<ApproachLeg, VehicleState>();
  for (const v of tiedVehicles) {
    occupiedLegs.set(v.leg, v);
  }

  // Check if this is an opposing 2-leg tie (e.g., SOUTH + NORTH, or EAST + WEST)
  if (tiedVehicles.length === 2) {
    const [vA, vB] = tiedVehicles;
    const specA = LEG_SPECS[vA.leg];
    if (specA.opposingLeg === vB.leg) {
      // Opposing legs!
      if (vA.turnIntent === 'LEFT' && vB.turnIntent !== 'LEFT') {
        leaderIds.add(vB.id);
        return leaderIds;
      }
      if (vB.turnIntent === 'LEFT' && vA.turnIntent !== 'LEFT') {
        leaderIds.add(vA.id);
        return leaderIds;
      }
      // Both straight, both right, or both left (passing in front of each other) -> concurrent!
      leaderIds.add(vA.id);
      leaderIds.add(vB.id);
      return leaderIds;
    }
  }

  // Adjacent legs (2-car or 3-car simultaneous tie): Find vehicle(s) with NO vehicle on their immediate right
  const farthestRightCandidates = tiedVehicles.filter((v) => {
    const rightLeg = LEG_SPECS[v.leg].legToImmediateRight;
    return !occupiedLegs.has(rightLeg);
  });

  if (farthestRightCandidates.length > 0) {
    const primaryRightLeader = farthestRightCandidates[0];

    // Check Risk #2: 3-Car Simultaneous + Left-Turn Circular Deadlock!
    // If primaryRightLeader is turning LEFT and its opposing leg is also in the tied group going STRAIGHT/RIGHT,
    // the opposing straight/right vehicle breaks the deadlock and proceeds first.
    const opposingLeg = LEG_SPECS[primaryRightLeader.leg].opposingLeg;
    const opposingVeh = occupiedLegs.get(opposingLeg);
    if (
      tiedVehicles.length >= 3 &&
      primaryRightLeader.turnIntent === 'LEFT' &&
      opposingVeh &&
      opposingVeh.turnIntent !== 'LEFT'
    ) {
      leaderIds.add(opposingVeh.id);
      return leaderIds;
    }

    leaderIds.add(primaryRightLeader.id);
    return leaderIds;
  }

  // Fallback (4-way simultaneous tie): straight vehicles on North/South axis proceed
  for (const v of tiedVehicles) {
    leaderIds.add(v.id);
  }
  return leaderIds;
}

/**
 * Checks whether a pedestrian on any crosswalk conflicts with a vehicle's entry leg or exit leg
 * under the selected US State Jurisdiction mode (`UNIVERSAL_US` vs `CALIFORNIA_OREGON`).
 */
export function findConflictingPedestrian(
  vehicle: VehicleState,
  pedestrians: PedestrianState[],
  jurisdiction: JurisdictionMode
): PedestrianState | null {
  const spec = LEG_SPECS[vehicle.leg];
  let exitCrosswalk: ApproachLeg = spec.opposingLeg;
  if (vehicle.turnIntent === 'RIGHT') {
    exitCrosswalk = spec.legToImmediateRight;
  } else if (vehicle.turnIntent === 'LEFT') {
    exitCrosswalk = spec.legToImmediateLeft;
  }

  for (const ped of pedestrians) {
    if (!ped.active) continue;
    // Entry crosswalk (SOUTH for player) or exit crosswalk
    const isEntryCrosswalk = ped.crosswalk === vehicle.leg;
    const isExitCrosswalk = ped.crosswalk === exitCrosswalk;

    if (!isEntryCrosswalk && !isExitCrosswalk) continue;

    if (jurisdiction === 'CALIFORNIA_OREGON') {
      // Strict Full-Crosswalk Yield: any pedestrian anywhere in the crosswalk (-0.92 to +0.92)
      if (Math.abs(ped.progress) < 0.92) {
        return ped;
      }
    } else {
      // Universal US (Uniform Vehicle Code): pedestrian on the vehicle's half of the roadway
      // or approaching closely from the adjacent half (progress > -0.35 for positive half, etc.)
      if (Math.abs(ped.progress) < 0.85) {
        return ped;
      }
    }
  }
  return null;
}

/**
 * Evaluates the player's commitment into Zone 3 (`s > +1.5m`) against the complete
 * US Traffic Law & OFM Moving Violation Point System hierarchy (PRD Section 7 REQ-04 & REQ-12).
 */
export function evaluatePlayerCommit(
  scenario: ScenarioDefinition,
  player: VehicleState,
  aiVehicles: VehicleState[],
  pedestrians: PedestrianState[],
  jurisdiction: JurisdictionMode,
  lowestSpeedInZone1Mps: number,
  precedingSameLegStopTime: number | null
): {
  violation: ViolationCitation | null;
  usedConcurrentShadowing: boolean;
} {
  // 0. Check multi-lane proper approach lane selection BEFORE turning (Tier 6 / OFM "Improper turns" 2 pts)
  if (scenario.lanesPerApproach === 2 && scenario.allowPlayerLaneSwitch) {
    if (player.turnIntent === 'LEFT' && player.lane !== 0) {
      return {
        usedConcurrentShadowing: false,
        violation: {
          code: 'IMPROPER_LEFT_TURN_LANE',
          title: 'Improper Turn from Outer Curb Lane',
          ofmCategory: 'Improper turns',
          ofmPoints: 2,
          ruleSummary:
            'In US Right-Hand Traffic, a Left Turn on a multi-lane road must be made from the inner left-hand lane (adjacent to the solid double-yellow centerline), never across an inner lane from the right curb lane.',
          handbookReference: 'US OFM Guide — Improper Turns (2 Points) & Lane Positioning',
          conflictPoint: { x: player.worldX, z: player.worldZ },
        },
      };
    }
    if (player.turnIntent === 'RIGHT' && player.lane !== 1) {
      return {
        usedConcurrentShadowing: false,
        violation: {
          code: 'IMPROPER_RIGHT_TURN_LANE',
          title: 'Improper Right Turn from Inner Lane',
          ofmCategory: 'Improper turns',
          ofmPoints: 2,
          ruleSummary:
            'A Right Turn must be initiated and completed as close as practicable to the right-hand curb or edge of the roadway (the outer right lane).',
          handbookReference: 'US OFM Guide — Improper Turns (2 Points) & Right-Curb Rule',
          conflictPoint: { x: player.worldX, z: player.worldZ },
        },
      };
    }
  }

  // 1. Mandatory Complete Stop Check at White Stop Limit Line (OFM "Driving through a stop sign" = 3 pts)
  if (player.stopTimestamp === null) {
    if (precedingSameLegStopTime !== null) {
      return {
        usedConcurrentShadowing: false,
        violation: {
          code: 'PIGGYBACKING_FIFO',
          title: 'Piggybacking / Failure to Stop at Limit Line',
          ofmCategory: 'Driving through a stop sign',
          ofmPoints: 3,
          ruleSummary:
            'Even if you stopped behind the car ahead of you, US law requires EVERY vehicle to pull forward to the white stop limit line and make its own complete 0 mph stop before proceeding.',
          handbookReference: 'US OFM Guide — Driving Through a Stop Sign (3 Points) / Anti-Piggybacking Rule',
          conflictPoint: { x: player.worldX, z: 11.5 },
        },
      };
    }

    const isRollingStop = lowestSpeedInZone1Mps < 3.2;
    return {
      usedConcurrentShadowing: false,
      violation: {
        code: isRollingStop ? 'ROLLING_STOP' : 'RAN_STOP_SIGN',
        title: isRollingStop
          ? 'Rolling Stop Violation ("California Roll")'
          : 'Ran Stop Sign Without Stopping',
        ofmCategory: 'Driving through a stop sign',
        ofmPoints: 3,
        ruleSummary: isRollingStop
          ? `You slowed to ${(lowestSpeedInZone1Mps * 2.23694).toFixed(1)} mph at the white limit line instead of reaching a complete 0.0 mph stop.`
          : 'You entered the intersection conflict box without coming to a complete 0.0 mph stop before the white limit line.',
        handbookReference: 'US OFM Guide — Driving Through a Stop Sign (3 Points)',
        conflictPoint: { x: player.worldX, z: 11.5 },
      },
    };
  }

  // 2. Priority Level 1: Emergency Vehicles & School Buses (Tier 5)
  for (const ai of aiVehicles) {
    if (ai.trait === 'EMERGENCY_SIREN' && ai.zone !== 'EXITED' && ai.s < 20) {
      return {
        usedConcurrentShadowing: false,
        violation: {
          code: 'EMERGENCY_VEHICLE_VIOLATION',
          title: 'Failed to Yield to Emergency Vehicle',
          ofmCategory: 'Failure to yield at a posted sign',
          ofmPoints: 2,
          ruleSummary:
            'An emergency vehicle (Police / Ambulance) with active flashing lights and siren overrides all 4-way stop queues. All directions must remain stopped until it clears.',
          handbookReference: 'US OFM Guide — Emergency Vehicle Right-of-Way (“Move Over / Remain Stopped”)',
          conflictPartnerId: ai.id,
          conflictPoint: { x: 0, z: 0 },
        },
      };
    }
    if (ai.trait === 'SCHOOL_BUS_RED_FLASH' && ai.schoolBusStopArmOut) {
      return {
        usedConcurrentShadowing: false,
        violation: {
          code: 'SCHOOL_BUS_STOP_ARM_VIOLATION',
          title: 'Passed Stopped School Bus with Red Flashing Lights',
          ofmCategory: 'Driving through a stop sign',
          ofmPoints: 3,
          ruleSummary:
            'When a US school bus displays alternating flashing red lights and extends its red STOP arm on an undivided road, all approaching and opposing traffic must remain completely stopped.',
          handbookReference: 'US OFM Guide — School Bus Stop-Arm Law (Severe Violation)',
          conflictPartnerId: ai.id,
          conflictPoint: { x: ai.worldX, z: ai.worldZ },
        },
      };
    }
  }

  // 3. Priority Level 2: Vulnerable Road Users (Pedestrians in Crosswalk & Cyclists in Right Bike Lane)
  const conflictingPed = findConflictingPedestrian(player, pedestrians, jurisdiction);
  if (conflictingPed) {
    return {
      usedConcurrentShadowing: false,
      violation: {
        code: 'PEDESTRIAN_CROSSWALK_VIOLATION',
        title: 'Failure to Yield to Pedestrian in Crosswalk',
        ofmCategory: 'Failure to yield at a posted sign',
        ofmPoints: 2,
        ruleSummary:
          'Pedestrians in marked or unmarked crosswalks hold statutory priority over all turning and straight vehicular traffic. Always head-check both crosswalks before committing.',
        handbookReference: 'US OFM Guide — Pedestrian Right-of-Way at Intersections (2 Points)',
        conflictPoint: { x: conflictingPed.worldX, z: conflictingPed.worldZ },
      },
    };
  }

  for (const ai of aiVehicles) {
    if (
      ai.kind === 'CYCLIST' &&
      ai.leg === player.leg &&
      player.turnIntent === 'RIGHT' &&
      ai.zone !== 'EXITED' &&
      ai.s > -8.0 &&
      ai.s < 14.0
    ) {
      return {
        usedConcurrentShadowing: false,
        violation: {
          code: 'CYCLIST_RIGHT_HOOK',
          title: 'Right-Hook Conflict with Cyclist in Bike Lane',
          ofmCategory: 'Improper turns',
          ofmPoints: 2,
          ruleSummary:
            'A bicycle riding straight in the right-hand bike lane has the right-of-way over a motor vehicle turning right across the bike lane. Check your right mirror and blind spot first.',
          handbookReference: 'US Traffic Law — Bicycle Lane Right-of-Way & Anti-Right-Hook Rule (2 Points)',
          conflictPartnerId: ai.id,
          conflictPoint: { x: 6.5, z: 9.0 },
        },
      };
    }
  }

  // 4. Priority Level 5: Tier 7 Real-World Hazards (Rolling Stopper & Multi-Lane Wave Trap)
  for (const ai of aiVehicles) {
    if (ai.trait === 'ROLLING_STOPPER' && ai.zone !== 'EXITED' && ai.s > -11.0 && ai.s < 14.0) {
      return {
        usedConcurrentShadowing: false,
        violation: {
          code: 'ROLLING_STOPPER_HAZARD_COLLISION',
          title: 'Entered Path of Non-Stopping Hazard Vehicle',
          ofmCategory: 'Failure to yield at a posted sign',
          ofmPoints: 2,
          ruleSummary:
            'Even when you have the legal right-of-way on paper, defensive US driving requires verifying that cross-traffic is actually decelerating. Never pull in front of a vehicle rolling through a stop sign at high speed.',
          handbookReference: 'US Defensive Driving Standard — Duty to Avoid Collision Despite Right-of-Way',
          conflictPartnerId: ai.id,
          conflictPoint: { x: 0, z: 0 },
        },
      };
    }
    if (ai.trait === 'WAVE_TRAP_HIDDEN' && ai.zone !== 'EXITED' && ai.s > -14.0 && ai.s < 14.0) {
      return {
        usedConcurrentShadowing: false,
        violation: {
          code: 'WAVE_TRAP_COLLISION',
          title: 'Multi-Lane "Wave of Death" Trap Collision',
          ofmCategory: 'Failure to yield at a posted sign',
          ofmPoints: 2,
          ruleSummary:
            'Another driver’s headlight flash or hand wave only speaks for their single lane—never for an adjacent lane hidden behind them. Use the Creep Zone (+1.5m) to verify all lanes are clear.',
          handbookReference: 'US Defensive Driving — Courtesy Waves Are Non-Binding in Multi-Lane Traffic',
          conflictPartnerId: ai.id,
          conflictPoint: { x: ai.worldX, z: ai.worldZ },
        },
      };
    }
  }

  // 5. Priority Levels 3 & 4: FIFO Queue, Concurrent Shadowing, & Simultaneous Tiebreakers
  let usedConcurrentShadowing = false;

  const activeLawfulAIs = aiVehicles.filter(
    (ai) =>
      ai.zone !== 'EXITED' &&
      ai.stopTimestamp !== null &&
      ai.trait === 'LAW_ABIDING' &&
      !ai.acknowledgedHorn
  );

  // Collect all vehicles that stopped within SIMULTANEOUS_TIE_THRESHOLD_SEC of the player
  const tiedGroup: VehicleState[] = [player];
  for (const ai of activeLawfulAIs) {
    const dt = (player.stopTimestamp ?? 0) - (ai.stopTimestamp ?? 0);
    if (Math.abs(dt) <= SIMULTANEOUS_TIE_THRESHOLD_SEC) {
      tiedGroup.push(ai);
    }
  }
  const tiedLeaderIds = computeSimultaneousLeaderIds(tiedGroup);

  for (const ai of activeLawfulAIs) {
    const conflict = analyzeTrajectoryConflict(
      {
        leg: player.leg,
        startLane: player.lane,
        turnIntent: player.turnIntent,
        receivingLane: player.receivingLane,
        lanesPerApproach: scenario.lanesPerApproach,
      },
      {
        leg: ai.leg,
        startLane: ai.lane,
        turnIntent: ai.turnIntent,
        receivingLane: ai.receivingLane,
        lanesPerApproach: scenario.lanesPerApproach,
      }
    );

    const dt = (player.stopTimestamp ?? 0) - (ai.stopTimestamp ?? 0);

    // Did AI stop unmistakably BEFORE the player (FIFO)?
    if (dt > SIMULTANEOUS_TIE_THRESHOLD_SEC) {
      if (!conflict.conflicts && conflict.canShadowConcurrently) {
        // Player legally shadowed a non-conflicting vehicle!
        usedConcurrentShadowing = true;
        continue;
      }

      return {
        usedConcurrentShadowing: false,
        violation: {
          code: 'FAILURE_TO_YIELD_FIFO',
          title: 'First-to-Stop, First-to-Go (FIFO) Violation',
          ofmCategory: 'Failure to yield at a posted sign',
          ofmPoints: 2,
          ruleSummary: `${ai.label} reached a complete stop ${dt.toFixed(1)}s before you at the limit line and held first-in-first-out right-of-way across your path.`,
          handbookReference: 'US OFM Guide — Failure to Yield at a Posted Sign (2 Points) / 4-Way Stop FIFO Rule',
          conflictPartnerId: ai.id,
          conflictPoint: conflict.conflictPoint,
        },
      };
    }

    // Did AI and Player stop SIMULTANEOUSLY (|dt| <= 0.25s)?
    if (Math.abs(dt) <= SIMULTANEOUS_TIE_THRESHOLD_SEC) {
      if (!conflict.conflicts && conflict.canShadowConcurrently) {
        usedConcurrentShadowing = true;
        continue;
      }

      if (!tiedLeaderIds.has(player.id)) {
        const isOpposingLeftConflict =
          LEG_SPECS[player.leg].opposingLeg === ai.leg &&
          player.turnIntent === 'LEFT' &&
          ai.turnIntent !== 'LEFT';

        return {
          usedConcurrentShadowing: false,
          violation: {
            code: isOpposingLeftConflict
              ? 'LEFT_TURN_CONFLICT'
              : 'FAILURE_TO_YIELD_RIGHT_TIEBREAKER',
            title: isOpposingLeftConflict
              ? 'Left-Turn Yield Violation (Opposing Traffic)'
              : 'Simultaneous Arrival — Yield to Driver on the Right',
            ofmCategory: 'Failure to yield at a posted sign',
            ofmPoints: 2,
            ruleSummary: isOpposingLeftConflict
              ? `You and ${ai.label} stopped simultaneously on opposing legs, but a vehicle turning LEFT must yield to opposing traffic going straight or turning right.`
              : `You and ${ai.label} stopped simultaneously (Δt = ${Math.abs(dt).toFixed(2)}s). Under US law, when two or more vehicles stop at the same time, the driver on the LEFT must yield to the driver on the RIGHT (${ai.label}).`,
            handbookReference: isOpposingLeftConflict
              ? 'US OFM Guide — Left-Turn Right-of-Way Rule (2 Points)'
              : 'US OFM Guide — 4-Way Stop Simultaneous Tiebreaker: Yield to the Right (2 Points)',
            conflictPartnerId: ai.id,
            conflictPoint: conflict.conflictPoint,
          },
        };
      }
    }
  }

  return {
    violation: null,
    usedConcurrentShadowing,
  };
}
