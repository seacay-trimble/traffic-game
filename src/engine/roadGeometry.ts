import { ApproachLeg, LaneIndex, Pose2D, Vec2 } from './types';

/**
 * US Right-Hand Traffic (RHT) Intersection Geometry Constants (PRD Section 12.3).
 *
 * Intersection center is (0, 0, 0).
 * Standard US lane width = 3.5 m.
 * Single-lane half-road width = 3.5 m (with curb/bike margin to 7.0 m).
 * Two-lane per direction half-road width = 7.0 m:
 *   - Lane 0 (Inner lane, adjacent to double-yellow centerline): offset = 1.75 m to the RIGHT of center
 *   - Lane 1 (Outer curb lane, adjacent to curb/stop sign): offset = 5.25 m to the RIGHT of center
 *
 * White Stop Limit Line (s = 0.0 m) is at 11.5 m from intersection center on each leg.
 */
export const INTERSECTION_HALF_BOX = 11.5; // Limit line distance from center (m)
export const LANE_WIDTH = 3.5;
export const INNER_LANE_OFFSET = 1.75;
export const OUTER_LANE_OFFSET = 5.25;
export const ROAD_EXTENT = 58.0; // Total road length from center on each leg (m)

// 3-Zone Spatial Thresholds along longitudinal coordinate s (m)
export const ZONE_1_STOP_MIN_S = -3.2; // Legal stop window starts 3.2m before limit line
export const ZONE_1_STOP_MAX_S = 0.25; // Slight bumper tolerance at white limit line (s = 0.0m)
export const ZONE_2_CREEP_MAX_S = 1.5; // Visibility creep buffer (0.0m, +1.5m]
export const CREEP_MAX_SPEED_MPS = 1.65; // ~3.7 mph max creep speed

export interface LegGeometrySpec {
  leg: ApproachLeg;
  displayName: string;
  directionLabel: string;
  /** Unit forward vector when approaching intersection */
  forwardVec: Vec2;
  /** Unit rightward vector (toward the US right-hand curb) when approaching intersection */
  rightVec: Vec2;
  /** Heading in radians (0 = Northbound/-Z, -PI/2 = Eastbound/+X, PI = Southbound/+Z, PI/2 = Westbound/-X) */
  approachHeadingRad: number;
  /** Stop sign world position on the right-hand corner of the approach */
  stopSignPos: Vec2;
  /** Approach leg to the immediate RIGHT of this driver (for Farthest-Right tiebreaker) */
  legToImmediateRight: ApproachLeg;
  /** Approach leg to the immediate LEFT of this driver */
  legToImmediateLeft: ApproachLeg;
  /** Opposing approach leg directly across the intersection */
  opposingLeg: ApproachLeg;
}

export const LEG_SPECS: Record<ApproachLeg, LegGeometrySpec> = {
  SOUTH: {
    leg: 'SOUTH',
    displayName: 'South Leg (You)',
    directionLabel: 'Northbound',
    forwardVec: { x: 0, z: -1 },
    rightVec: { x: 1, z: 0 }, // East half of road (x > 0)
    approachHeadingRad: 0,
    stopSignPos: { x: 8.2, z: 12.0 }, // SE corner
    legToImmediateRight: 'EAST',
    legToImmediateLeft: 'WEST',
    opposingLeg: 'NORTH',
  },
  NORTH: {
    leg: 'NORTH',
    displayName: 'North Leg (Opposing)',
    directionLabel: 'Southbound',
    forwardVec: { x: 0, z: 1 },
    rightVec: { x: -1, z: 0 }, // West half of road (x < 0)
    approachHeadingRad: Math.PI,
    stopSignPos: { x: -8.2, z: -12.0 }, // NW corner
    legToImmediateRight: 'WEST',
    legToImmediateLeft: 'EAST',
    opposingLeg: 'SOUTH',
  },
  WEST: {
    leg: 'WEST',
    displayName: 'West Leg (Left)',
    directionLabel: 'Eastbound',
    forwardVec: { x: 1, z: 0 },
    rightVec: { x: 0, z: 1 }, // South half of road (z > 0)
    approachHeadingRad: -Math.PI / 2,
    stopSignPos: { x: -12.0, z: 8.2 }, // SW corner
    legToImmediateRight: 'SOUTH',
    legToImmediateLeft: 'NORTH',
    opposingLeg: 'EAST',
  },
  EAST: {
    leg: 'EAST',
    displayName: 'East Leg (Right)',
    directionLabel: 'Westbound',
    forwardVec: { x: -1, z: 0 },
    rightVec: { x: 0, z: -1 }, // North half of road (z < 0)
    approachHeadingRad: Math.PI / 2,
    stopSignPos: { x: 12.0, z: -8.2 }, // NE corner
    legToImmediateRight: 'NORTH',
    legToImmediateLeft: 'SOUTH',
    opposingLeg: 'WEST',
  },
};

/**
 * Returns the lateral offset (m) to the right of the double-yellow centerline for a given lane index.
 * In 1-lane-per-direction scenarios, Lane 0 is centered at +2.35 m right of the yellow line.
 * In 2-lane-per-direction scenarios, Lane 0 (inner) is at +1.75 m and Lane 1 (outer) is at +5.25 m.
 */
export function getLaneLateralOffset(lane: LaneIndex, lanesPerApproach: 1 | 2 = 2): number {
  if (lanesPerApproach === 1) {
    return lane === 0 ? 2.35 : OUTER_LANE_OFFSET;
  }
  return lane === 0 ? INNER_LANE_OFFSET : OUTER_LANE_OFFSET;
}

/**
 * Computes the world (x, z) and heading on the straight approach up to the limit line (s <= 0).
 * At s = 0, the front bumper / reference point is at the White Stop Limit Line (11.5m from center).
 */
export function getApproachPoseAtS(
  leg: ApproachLeg,
  lane: LaneIndex,
  s: number,
  lanesPerApproach: 1 | 2 = 2
): Pose2D {
  const spec = LEG_SPECS[leg];
  const lateralOffset = getLaneLateralOffset(lane, lanesPerApproach);
  const distFromCenter = INTERSECTION_HALF_BOX - s; // s <= 0 => distFromCenter >= 11.5

  // Position = -forwardVec * distFromCenter + rightVec * lateralOffset
  const x = -spec.forwardVec.x * distFromCenter + spec.rightVec.x * lateralOffset;
  const z = -spec.forwardVec.z * distFromCenter + spec.rightVec.z * lateralOffset;

  return {
    x,
    z,
    headingRad: spec.approachHeadingRad,
  };
}

/**
 * Computes the world point on the exit leg after clearing the intersection box.
 * Note: An exiting vehicle drives away from the center on the RIGHT-HAND side of its destination road!
 * Specifically:
 * - Exiting toward NORTH (Northbound, away on North leg): East half of North leg (x > 0, z < -11.5)
 * - Exiting toward SOUTH (Southbound, away on South leg): West half of South leg (x < 0, z > +11.5)
 * - Exiting toward EAST (Eastbound, away on East leg): South half of East leg (z > 0, x > +11.5)
 * - Exiting toward WEST (Westbound, away on West leg): North half of West leg (z < 0, x < -11.5)
 */
export function getExitStartPose(
  originLeg: ApproachLeg,
  turnIntent: 'STRAIGHT' | 'LEFT' | 'RIGHT',
  receivingLane: LaneIndex,
  lanesPerApproach: 1 | 2 = 2
): { pose: Pose2D; exitForwardVec: Vec2 } {
  const spec = LEG_SPECS[originLeg];
  let exitForwardVec: Vec2;
  let exitRightVec: Vec2;
  let exitHeadingRad: number;

  if (turnIntent === 'STRAIGHT') {
    exitForwardVec = { ...spec.forwardVec };
    exitRightVec = { ...spec.rightVec };
    exitHeadingRad = spec.approachHeadingRad;
  } else if (turnIntent === 'RIGHT') {
    // Turning RIGHT means our new forward direction is our old rightVec
    exitForwardVec = { ...spec.rightVec };
    exitRightVec = { x: -spec.forwardVec.x, z: -spec.forwardVec.z };
    exitHeadingRad = Math.atan2(-exitForwardVec.x, -exitForwardVec.z);
  } else {
    // Turning LEFT means our new forward direction is -rightVec
    exitForwardVec = { x: -spec.rightVec.x, z: -spec.rightVec.z };
    exitRightVec = { ...spec.forwardVec };
    exitHeadingRad = Math.atan2(-exitForwardVec.x, -exitForwardVec.z);
  }

  const lateralOffset = getLaneLateralOffset(receivingLane, lanesPerApproach);
  const x = exitForwardVec.x * INTERSECTION_HALF_BOX + exitRightVec.x * lateralOffset;
  const z = exitForwardVec.z * INTERSECTION_HALF_BOX + exitRightVec.z * lateralOffset;

  return {
    pose: { x, z, headingRad: exitHeadingRad },
    exitForwardVec,
  };
}

/**
 * Verifies that any approach pose strictly obeys US Right-Hand Traffic (RHT) geometry
 * (i.e., strictly on the right side of the central solid double-yellow line).
 */
export function isStrictlyRightOfYellowLine(leg: ApproachLeg, x: number, z: number): boolean {
  switch (leg) {
    case 'SOUTH':
      return x > 0.2; // Northbound on South leg must be on East half (x > 0)
    case 'NORTH':
      return x < -0.2; // Southbound on North leg must be on West half (x < 0)
    case 'WEST':
      return z > 0.2; // Eastbound on West leg must be on South half (z > 0)
    case 'EAST':
      return z < -0.2; // Westbound on East leg must be on North half (z < 0)
  }
}
