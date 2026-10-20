import {
  getApproachPoseAtS,
  getExitStartPose,
  LEG_SPECS,
} from './roadGeometry';
import { ApproachLeg, LaneIndex, Pose2D, TurnIntent, Vec2 } from './types';

export interface CubicBezier2D {
  p0: Vec2;
  p1: Vec2;
  p2: Vec2;
  p3: Vec2;
  approxLength: number;
}

/**
 * Constructs the cubic Bézier spline across the intersection box (from s = 0 at entry limit line
 * to the exit limit line on the receiving right-hand roadway).
 *
 * CRITICAL US TRAFFIC RULE (PRD Section 12.3):
 * Opposing left-turning vehicles MUST pass IN FRONT OF each other (tangential near-side left turns)
 * without crossing behind each other's centerpoint.
 * Using a control handle length of ~6.8m from the limit line keeps opposing left-turn arcs
 * strictly separated on their respective near sides of the (0, 0) intersection center.
 */
export function buildIntersectionBezier(
  leg: ApproachLeg,
  startLane: LaneIndex,
  turnIntent: TurnIntent,
  receivingLane: LaneIndex,
  lanesPerApproach: 1 | 2 = 2
): CubicBezier2D {
  const startPose = getApproachPoseAtS(leg, startLane, 0, lanesPerApproach);
  const { pose: endPose, exitForwardVec } = getExitStartPose(
    leg,
    turnIntent,
    receivingLane,
    lanesPerApproach
  );
  const spec = LEG_SPECS[leg];

  const p0: Vec2 = { x: startPose.x, z: startPose.z };
  const p3: Vec2 = { x: endPose.x, z: endPose.z };

  let handleLenStart = 7.6;
  let handleLenEnd = 7.6;

  if (turnIntent === 'LEFT') {
    // Near-side tangential control points so opposing left turns pass in front of each other
    handleLenStart = 6.8;
    handleLenEnd = 6.8;
  } else if (turnIntent === 'RIGHT') {
    // Tight curb-hugging right turn
    handleLenStart = 4.2;
    handleLenEnd = 4.2;
  }

  const p1: Vec2 = {
    x: p0.x + spec.forwardVec.x * handleLenStart,
    z: p0.z + spec.forwardVec.z * handleLenStart,
  };

  const p2: Vec2 = {
    x: p3.x - exitForwardVec.x * handleLenEnd,
    z: p3.z - exitForwardVec.z * handleLenEnd,
  };

  // Numerical arc-length approximation (32 segments)
  let length = 0;
  let prev = p0;
  const steps = 32;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const pt = evalBezierPoint(p0, p1, p2, p3, t);
    length += Math.hypot(pt.x - prev.x, pt.z - prev.z);
    prev = pt;
  }

  return { p0, p1, p2, p3, approxLength: length };
}

export function evalBezierPoint(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;

  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    z: uuu * p0.z + 3 * uu * t * p1.z + 3 * u * tt * p2.z + ttt * p3.z,
  };
}

export function evalBezierTangent(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t;
  const dx =
    3 * u * u * (p1.x - p0.x) +
    6 * u * t * (p2.x - p1.x) +
    3 * t * t * (p3.x - p2.x);
  const dz =
    3 * u * u * (p1.z - p0.z) +
    6 * u * t * (p2.z - p1.z) +
    3 * t * t * (p3.z - p2.z);
  const len = Math.hypot(dx, dz) || 1;
  return { x: dx / len, z: dz / len };
}

/**
 * Evaluates a vehicle's world Pose2D (x, z, headingRad) at ANY longitudinal distance `s` (meters):
 * - s <= 0: Straight approach in right-hand lane toward the white stop limit line
 * - 0 < s <= bezier.approxLength: Smooth rail-guided trajectory through the intersection
 * - s > bezier.approxLength: Straight exit along the receiving right-hand lane
 */
export function evaluateVehiclePoseAtS(
  leg: ApproachLeg,
  startLane: LaneIndex,
  turnIntent: TurnIntent,
  receivingLane: LaneIndex,
  s: number,
  lanesPerApproach: 1 | 2 = 2
): Pose2D {
  if (s <= 0) {
    return getApproachPoseAtS(leg, startLane, s, lanesPerApproach);
  }

  const bezier = buildIntersectionBezier(
    leg,
    startLane,
    turnIntent,
    receivingLane,
    lanesPerApproach
  );

  if (s <= bezier.approxLength) {
    const t = Math.max(0, Math.min(1, s / bezier.approxLength));
    const pt = evalBezierPoint(bezier.p0, bezier.p1, bezier.p2, bezier.p3, t);
    const tan = evalBezierTangent(bezier.p0, bezier.p1, bezier.p2, bezier.p3, t);
    return {
      x: pt.x,
      z: pt.z,
      headingRad: Math.atan2(-tan.x, -tan.z),
    };
  }

  // Beyond intersection box: continue straight along exit leg
  const { pose: exitStart, exitForwardVec } = getExitStartPose(
    leg,
    turnIntent,
    receivingLane,
    lanesPerApproach
  );
  const extraDist = s - bezier.approxLength;
  return {
    x: exitStart.x + exitForwardVec.x * extraDist,
    z: exitStart.z + exitForwardVec.z * extraDist,
    headingRad: exitStart.headingRad,
  };
}

/**
 * Samples points along a vehicle's intersection spline for 3D tactical replay ribbons
 * and path-intersection conflict checks.
 */
export function sampleIntersectionPath(
  leg: ApproachLeg,
  startLane: LaneIndex,
  turnIntent: TurnIntent,
  receivingLane: LaneIndex,
  lanesPerApproach: 1 | 2 = 2,
  numSamples = 28
): Vec2[] {
  const bezier = buildIntersectionBezier(
    leg,
    startLane,
    turnIntent,
    receivingLane,
    lanesPerApproach
  );
  const pts: Vec2[] = [];
  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    pts.push(evalBezierPoint(bezier.p0, bezier.p1, bezier.p2, bezier.p3, t));
  }
  return pts;
}

/**
 * Computes minimum Euclidean distance between two sampled intersection paths,
 * plus the approximate midpoint of closest approach.
 */
export function computeMinimumPathSeparation(
  pathA: Vec2[],
  pathB: Vec2[]
): { minDistance: number; closestPoint: Vec2 } {
  let minDistance = Infinity;
  let closestPoint: Vec2 = { x: 0, z: 0 };

  for (let i = 1; i < pathA.length - 1; i++) {
    for (let j = 1; j < pathB.length - 1; j++) {
      const d = Math.hypot(pathA[i].x - pathB[j].x, pathA[i].z - pathB[j].z);
      if (d < minDistance) {
        minDistance = d;
        closestPoint = {
          x: (pathA[i].x + pathB[j].x) * 0.5,
          z: (pathA[i].z + pathB[j].z) * 0.5,
        };
      }
    }
  }

  return { minDistance, closestPoint };
}
