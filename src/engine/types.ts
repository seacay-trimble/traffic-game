export type ApproachLeg = 'SOUTH' | 'NORTH' | 'WEST' | 'EAST';

export type TurnIntent = 'STRAIGHT' | 'LEFT' | 'RIGHT';

export type LaneIndex = 0 | 1; // 0 = Inner (leftmost right-hand lane), 1 = Outer (curbside right-hand lane)

export type VehicleKind =
  | 'SEDAN'
  | 'SUV'
  | 'BOX_TRUCK'
  | 'POLICE'
  | 'AMBULANCE'
  | 'SCHOOL_BUS'
  | 'CYCLIST';

export type AIBehaviorTrait =
  | 'LAW_ABIDING'
  | 'ROLLING_STOPPER' // Tier 7: rolls through stop sign at ~12 mph without stopping
  | 'POLITE_WAVER' // Tier 7: flashes high-beams to wave player through out of turn
  | 'WAVE_TRAP_HIDDEN' // Tier 7: rushes in adjacent lane alongside a polite waver
  | 'PIGGYBACKER' // Follows closely behind preceding car
  | 'EMERGENCY_SIREN' // Tier 5: non-stopping emergency responder with active lights/siren
  | 'SCHOOL_BUS_RED_FLASH'; // Tier 5: stopped with flashing red lights and stop arm extended

export type SpatialZone = 'APPROACH' | 'ZONE_1_STOP' | 'ZONE_2_CREEP' | 'ZONE_3_COMMIT' | 'EXITED';

export type UXFlowStage =
  | 'STAGE_1_BRIEFING'
  | 'STAGE_2_APPROACH'
  | 'STAGE_3_STOP_SCAN_CREEP'
  | 'STAGE_4_COMMIT'
  | 'STAGE_5_OUTCOME_REPLAY';

export type CameraMode = 'COCKPIT_POV' | 'CHASE_CAM' | 'TACTICAL_OVERHEAD';

export type HeadLookDirection = 'CENTER' | 'LEFT' | 'RIGHT';

export type WeatherCondition = 'CLEAR_DAY' | 'DUSK' | 'RAIN_FOG';

export type JurisdictionMode = 'UNIVERSAL_US' | 'CALIFORNIA_OREGON';

export interface Vec2 {
  x: number;
  z: number;
}

export interface Pose2D {
  x: number;
  z: number;
  headingRad: number; // 0 = Northbound (-Z), PI/2 = Westbound (-X), etc.
}

export interface VehicleState {
  id: string;
  label: string;
  isPlayer: boolean;
  kind: VehicleKind;
  colorHex: number;
  leg: ApproachLeg;
  lane: LaneIndex;
  turnIntent: TurnIntent;
  receivingLane: LaneIndex;
  trait: AIBehaviorTrait;
  /** Longitudinal position in meters relative to the white stop limit line (s = 0.0m) */
  s: number;
  /** Speed in meters per second (1 mph = 0.44704 m/s) */
  speedMps: number;
  targetCruiseMps: number;
  accelMps2: number;
  zone: SpatialZone;
  /** Simulation timestamp (seconds) when legal complete stop was registered in Zone 1 */
  stopTimestamp: number | null;
  /** Stop order badge string (#1, #2, TIE, WAVE, EMERG, BUS) */
  stopOrderBadge: string | null;
  hasPriorityNow: boolean;
  turnSignal: 'LEFT' | 'RIGHT' | 'HAZARD' | 'OFF';
  brakeLightsOn: boolean;
  highBeamFlashOn: boolean;
  emergencyLightsOn: boolean;
  schoolBusStopArmOut: boolean;
  /** Suspension pitch in radians (positive = nose dive under braking) */
  pitchRad: number;
  worldX: number;
  worldZ: number;
  headingRad: number;
  /** Whether AI has yielded to player's horn or gesture */
  acknowledgedHorn: boolean;
}

export type CrosswalkSide = 'SOUTH' | 'NORTH' | 'WEST' | 'EAST';

export interface PedestrianState {
  id: string;
  crosswalk: CrosswalkSide;
  /** Progress across the roadway from -1.0 (curb A) to +1.0 (curb B) */
  progress: number;
  direction: 1 | -1;
  speedNormalizedPerSec: number;
  active: boolean;
  isJaywalker?: boolean;
  worldX: number;
  worldZ: number;
  /** Which half of the roadway the pedestrian currently occupies ('WEST_HALF' | 'EAST_HALF' | 'NORTH_HALF' | 'SOUTH_HALF' | 'CURB') */
  activeHalf: 'NEGATIVE_HALF' | 'POSITIVE_HALF' | 'CENTER_DIVIDER' | 'CURB';
}

export type ViolationCode =
  | 'NONE'
  | 'RAN_STOP_SIGN'
  | 'ROLLING_STOP'
  | 'PIGGYBACKING_FIFO'
  | 'FAILURE_TO_YIELD_FIFO'
  | 'FAILURE_TO_YIELD_RIGHT_TIEBREAKER'
  | 'LEFT_TURN_CONFLICT'
  | 'IMPROPER_LEFT_TURN_LANE'
  | 'IMPROPER_RIGHT_TURN_LANE'
  | 'PEDESTRIAN_CROSSWALK_VIOLATION'
  | 'CYCLIST_RIGHT_HOOK'
  | 'EMERGENCY_VEHICLE_VIOLATION'
  | 'SCHOOL_BUS_STOP_ARM_VIOLATION'
  | 'WAVE_TRAP_COLLISION'
  | 'ROLLING_STOPPER_HAZARD_COLLISION'
  | 'EXCESSIVE_HESITATION_DEADLOCK'
  | 'WRONG_WAY_LEFT_OF_YELLOW';

export interface ViolationCitation {
  code: ViolationCode;
  title: string;
  ofmCategory:
    | 'Driving through a stop sign'
    | 'Failure to yield at a posted sign'
    | 'Improper turns'
    | 'Failure to keep in proper lane'
    | 'Following too closely'
    | 'Traffic Flow Obstruction';
  ofmPoints: number;
  ruleSummary: string;
  handbookReference: string;
  conflictPartnerId?: string;
  conflictPoint?: Vec2;
}

export interface ScenarioEvaluationResult {
  passed: boolean;
  stars: 0 | 1 | 2 | 3;
  citation: ViolationCitation | null;
  complimentTitle: string;
  complimentBody: string;
  usedConcurrentShadowing: boolean;
  headChecksCompleted: boolean;
  completedStopAtLimitLine: boolean;
}

export interface ScenarioDefinition {
  id: string;
  tier: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  seedIndex: number;
  title: string;
  subtitle: string;
  lanesPerApproach: 1 | 2;
  weather: WeatherCondition;
  playerTurnIntent: TurnIntent;
  playerStartLane: LaneIndex;
  /** Whether this scenario requires player to select the correct approach lane before stopping */
  allowPlayerLaneSwitch: boolean;
  requiredStopMode: 'FIFO_GAP' | 'SIMULTANEOUS_TIE' | 'STANDARD';
  ruleHighlightTitle: string;
  ruleHighlightBody: string;
  rhtHighlightBody: string;
  requiresCreepForSightline: boolean;
  aiSpawns: Array<{
    id: string;
    label: string;
    kind: VehicleKind;
    colorHex: number;
    leg: ApproachLeg;
    lane: LaneIndex;
    turnIntent: TurnIntent;
    receivingLane?: LaneIndex;
    trait: AIBehaviorTrait;
    initialS: number;
    initialSpeedMps: number;
  }>;
  pedestrianSpawns: Array<{
    id: string;
    crosswalk: CrosswalkSide;
    initialProgress: number;
    direction: 1 | -1;
    speedNormalizedPerSec: number;
    isJaywalker?: boolean;
  }>;
}

export interface ReplayKeyframe {
  timestampSec: number;
  label: string;
  kind: 'STOP' | 'TIE' | 'CREEP' | 'COMMIT' | 'VIOLATION' | 'WAVE';
}

export interface ReplayFrameSnapshot {
  timestampSec: number;
  vehicles: Array<{
    id: string;
    label: string;
    isPlayer: boolean;
    kind: VehicleKind;
    colorHex: number;
    leg: ApproachLeg;
    turnIntent: TurnIntent;
    s: number;
    speedMps: number;
    worldX: number;
    worldZ: number;
    headingRad: number;
    pitchRad: number;
    stopTimestamp: number | null;
    stopOrderBadge: string | null;
    turnSignal: 'LEFT' | 'RIGHT' | 'HAZARD' | 'OFF';
    brakeLightsOn: boolean;
    highBeamFlashOn: boolean;
    emergencyLightsOn: boolean;
    schoolBusStopArmOut: boolean;
  }>;
  pedestrians: Array<{
    id: string;
    crosswalk: CrosswalkSide;
    worldX: number;
    worldZ: number;
    active: boolean;
  }>;
}
