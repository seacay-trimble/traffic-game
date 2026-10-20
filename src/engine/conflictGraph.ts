import { LEG_SPECS } from './roadGeometry';
import { computeMinimumPathSeparation, sampleIntersectionPath } from './turnSplines';
import { ApproachLeg, LaneIndex, TurnIntent, Vec2 } from './types';

export interface TrajectorySpec {
  leg: ApproachLeg;
  startLane: LaneIndex;
  turnIntent: TurnIntent;
  receivingLane: LaneIndex;
  lanesPerApproach: 1 | 2;
}

export interface ConflictAnalysis {
  conflicts: boolean;
  canShadowConcurrently: boolean;
  conflictPoint: Vec2;
  minSeparationMeters: number;
  reason: string;
}

/**
 * Evaluates whether two vehicle trajectories conflict inside the 4-way stop intersection box,
 * or whether they are non-conflicting and eligible for Concurrent Progression ("Shadowing", REQ-04).
 *
 * Key US Right-Hand Traffic non-conflicting pairs:
 * 1. Opposing Straight-Through vehicles (e.g., SOUTH Straight + NORTH Straight)
 * 2. Opposing Right-Turning vehicles (e.g., SOUTH Right -> East + NORTH Right -> West)
 * 3. Opposing Left-Turning vehicles passing IN FRONT OF each other (e.g., SOUTH Left -> West + NORTH Left -> East)
 * 4. Same-direction parallel lanes turning or going straight into separate lanes
 * 5. Straight vehicle + Opposing or Perpendicular Right-Turn into a non-overlapping lane
 */
export function analyzeTrajectoryConflict(
  trajA: TrajectorySpec,
  trajB: TrajectorySpec
): ConflictAnalysis {
  const pathA = sampleIntersectionPath(
    trajA.leg,
    trajA.startLane,
    trajA.turnIntent,
    trajA.receivingLane,
    trajA.lanesPerApproach
  );
  const pathB = sampleIntersectionPath(
    trajB.leg,
    trajB.startLane,
    trajB.turnIntent,
    trajB.receivingLane,
    trajB.lanesPerApproach
  );

  const { minDistance, closestPoint } = computeMinimumPathSeparation(pathA, pathB);
  const specA = LEG_SPECS[trajA.leg];
  const isOpposing = specA.opposingLeg === trajB.leg;

  // Case 1: Opposing Straight + Straight => Zero conflict, classic concurrent shadowing
  if (isOpposing && trajA.turnIntent === 'STRAIGHT' && trajB.turnIntent === 'STRAIGHT') {
    return {
      conflicts: false,
      canShadowConcurrently: true,
      conflictPoint: closestPoint,
      minSeparationMeters: minDistance,
      reason: 'Opposing straight trajectories run parallel on opposite sides of the double-yellow centerline.',
    };
  }

  // Case 2: Opposing Right + Right => Turn onto opposite legs, zero conflict
  if (isOpposing && trajA.turnIntent === 'RIGHT' && trajB.turnIntent === 'RIGHT') {
    return {
      conflicts: false,
      canShadowConcurrently: true,
      conflictPoint: closestPoint,
      minSeparationMeters: minDistance,
      reason: 'Opposing right turns exit onto opposite roadways without intersecting.',
    };
  }

  // Case 3: Opposing Left + Left => In US RHT, opposing left turns pass IN FRONT OF each other!
  if (isOpposing && trajA.turnIntent === 'LEFT' && trajB.turnIntent === 'LEFT') {
    return {
      conflicts: false,
      canShadowConcurrently: true,
      conflictPoint: closestPoint,
      minSeparationMeters: minDistance,
      reason: 'US Right-Hand Traffic rule: opposing left-turning vehicles pass in front of each other without crossing paths.',
    };
  }

  // Case 4: Opposing Left + Straight or Left + Right => Left turn crosses opposing traffic!
  if (
    isOpposing &&
    ((trajA.turnIntent === 'LEFT' && trajB.turnIntent !== 'LEFT') ||
      (trajB.turnIntent === 'LEFT' && trajA.turnIntent !== 'LEFT'))
  ) {
    return {
      conflicts: true,
      canShadowConcurrently: false,
      conflictPoint: closestPoint,
      minSeparationMeters: minDistance,
      reason: 'A vehicle turning left across opposing straight or right-turning traffic must yield.',
    };
  }

  // Geometric path clearance check (vehicles are ~2.0m wide; > 2.85m centerline separation is conflict-free)
  const safeClearanceMeters = 2.85;
  const conflicts = minDistance < safeClearanceMeters;

  return {
    conflicts,
    canShadowConcurrently: !conflicts,
    conflictPoint: closestPoint,
    minSeparationMeters: minDistance,
    reason: conflicts
      ? 'Vehicle paths intersect inside the conflict box.'
      : 'Vehicle paths remain separated with safe lateral clearance.',
  };
}
