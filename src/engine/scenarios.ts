import { ScenarioDefinition } from './types';

/**
 * Complete 7-Tier Progressive US 4-Way Stop Curriculum (PRD Section 6 & Section 7).
 * Every scenario uses strict US Right-Hand Traffic (RHT) coordinates and includes
 * multiple randomized seeds per tier.
 */
export const SCENARIO_CATALOG: ScenarioDefinition[] = [
  // ============================================================================
  // TIER 1: The Complete Stop & FIFO Queue (Plus Anti-Piggybacking)
  // ============================================================================
  {
    id: 'tier1-seed1-fifo-yield',
    tier: 1,
    seedIndex: 1,
    title: 'Tier 1.1 — Complete Stop & First-to-Stop (FIFO)',
    subtitle:
      'Brake to a full 0.0 mph stop behind the white limit line. Yield to the cross-traffic sedan that stopped 1.5s before you.',
    lanesPerApproach: 1,
    weather: 'CLEAR_DAY',
    playerTurnIntent: 'STRAIGHT',
    playerStartLane: 0,
    allowPlayerLaneSwitch: false,
    requiredStopMode: 'FIFO_GAP',
    ruleHighlightTitle: 'Mandatory 0 mph Stop & First-In, First-Out (FIFO)',
    ruleHighlightBody:
      'At an ALL WAY stop, every driver must come to a complete 0.0 mph stop before the white limit line. The driver who stops first (#1) has the right-of-way to proceed first.',
    rhtHighlightBody:
      'US Right-Hand Traffic: Keep right of the central solid double-yellow line. Your STOP sign is posted on the right-hand (Southeast) curb.',
    requiresCreepForSightline: false,
    aiSpawns: [
      {
        id: 'ai-west-1',
        label: 'West Blue Sedan (#1)',
        kind: 'SEDAN',
        colorHex: 0x3b82f6,
        leg: 'WEST',
        lane: 0,
        turnIntent: 'STRAIGHT',
        trait: 'LAW_ABIDING',
        initialS: -4.2,
        initialSpeedMps: 2.2,
      },
    ],
    pedestrianSpawns: [],
  },
  {
    id: 'tier1-seed2-anti-piggyback',
    tier: 1,
    seedIndex: 2,
    title: 'Tier 1.2 — Anti-Piggybacking & Second-in-Line Stop',
    subtitle:
      'Do not follow the lead car straight through! Pull up to the white limit line, make your own 0.0 mph stop, and yield to cross-traffic waiting its turn.',
    lanesPerApproach: 1,
    weather: 'CLEAR_DAY',
    playerTurnIntent: 'STRAIGHT',
    playerStartLane: 0,
    allowPlayerLaneSwitch: false,
    requiredStopMode: 'FIFO_GAP',
    ruleHighlightTitle: 'No Piggybacking Behind Lead Vehicles',
    ruleHighlightBody:
      'Stopping behind another car does NOT count as your stop at the limit line. Once the car ahead clears, you must pull up to the white bar, stop completely at 0 mph, and allow waiting cross-traffic (#1) to go.',
    rhtHighlightBody:
      'OFM Point Warning: Following a lead car through a stop sign without making your own stop carries 3 moving violation points.',
    requiresCreepForSightline: false,
    aiSpawns: [
      {
        id: 'ai-east-waiting',
        label: 'East Silver SUV (#1)',
        kind: 'SUV',
        colorHex: 0x94a3b8,
        leg: 'EAST',
        lane: 0,
        turnIntent: 'LEFT',
        trait: 'LAW_ABIDING',
        initialS: -3.5,
        initialSpeedMps: 1.8,
      },
    ],
    pedestrianSpawns: [],
  },
  {
    id: 'tier1-seed3-player-first',
    tier: 1,
    seedIndex: 3,
    title: 'Tier 1.3 — You Stop First (#1 Priority)',
    subtitle:
      'Stop cleanly at the white limit line before the late-arriving Northbound/Westbound traffic, then proceed promptly without hesitating.',
    lanesPerApproach: 1,
    weather: 'CLEAR_DAY',
    playerTurnIntent: 'RIGHT',
    playerStartLane: 0,
    allowPlayerLaneSwitch: false,
    requiredStopMode: 'FIFO_GAP',
    ruleHighlightTitle: 'Claiming Right-of-Way Promptly',
    ruleHighlightBody:
      'When you reach a complete 0.0 mph stop clearly before other approaching vehicles (#1), proceed promptly once your head-check confirms the intersection is clear.',
    rhtHighlightBody:
      'Turning RIGHT from the South leg enters the Eastbound right-hand lane (south of the double-yellow line).',
    requiresCreepForSightline: false,
    aiSpawns: [
      {
        id: 'ai-west-late',
        label: 'West Red Sedan (#2)',
        kind: 'SEDAN',
        colorHex: 0xef4444,
        leg: 'WEST',
        lane: 0,
        turnIntent: 'STRAIGHT',
        trait: 'LAW_ABIDING',
        initialS: -21.0,
        initialSpeedMps: 6.2,
      },
    ],
    pedestrianSpawns: [],
  },

  // ============================================================================
  // TIER 2: Simultaneous Arrivals & The "Vehicle on the Right" Tiebreaker
  // ============================================================================
  {
    id: 'tier2-seed1-yield-to-right',
    tier: 2,
    seedIndex: 1,
    title: 'Tier 2.1 — Simultaneous Arrival: Yield to the Right',
    subtitle:
      'You and the East Leg vehicle stop at the exact same moment (TIE). Since East is on your immediate RIGHT, yield to them first!',
    lanesPerApproach: 1,
    weather: 'CLEAR_DAY',
    playerTurnIntent: 'STRAIGHT',
    playerStartLane: 0,
    allowPlayerLaneSwitch: false,
    requiredStopMode: 'SIMULTANEOUS_TIE',
    ruleHighlightTitle: 'Simultaneous Stop Tiebreaker — Yield to the Right',
    ruleHighlightBody:
      'When two vehicles on perpendicular roads come to a complete stop at the same time (|Δt| ≤ 0.2s), the driver on the LEFT must yield to the driver on the RIGHT.',
    rhtHighlightBody:
      'From the South leg (facing North), the East leg is on your RIGHT-hand side.',
    requiresCreepForSightline: false,
    aiSpawns: [
      {
        id: 'ai-east-tie',
        label: 'East Gold SUV (On Your Right)',
        kind: 'SUV',
        colorHex: 0xf59e0b,
        leg: 'EAST',
        lane: 0,
        turnIntent: 'STRAIGHT',
        trait: 'LAW_ABIDING',
        initialS: -11.5,
        initialSpeedMps: 5.5,
      },
    ],
    pedestrianSpawns: [],
  },
  {
    id: 'tier2-seed2-you-are-on-right',
    tier: 2,
    seedIndex: 2,
    title: 'Tier 2.2 — Simultaneous Arrival: You Hold Right-Side Priority',
    subtitle:
      'You and the West Leg vehicle stop simultaneously (TIE). Because YOU are on their right, you hold the right-of-way—proceed after stopping!',
    lanesPerApproach: 1,
    weather: 'CLEAR_DAY',
    playerTurnIntent: 'STRAIGHT',
    playerStartLane: 0,
    allowPlayerLaneSwitch: false,
    requiredStopMode: 'SIMULTANEOUS_TIE',
    ruleHighlightTitle: 'Asserting Priority When You Are on the Right',
    ruleHighlightBody:
      'When a vehicle on your LEFT (West Leg) stops simultaneously with you, they must yield to you. After completing your 0.0 mph stop and head-check, accelerate smoothly.',
    rhtHighlightBody:
      'Waiting more than 6 seconds when you hold clear priority causes traffic confusion.',
    requiresCreepForSightline: false,
    aiSpawns: [
      {
        id: 'ai-west-tie',
        label: 'West Teal Sedan (On Your Left)',
        kind: 'SEDAN',
        colorHex: 0x14b8a6,
        leg: 'WEST',
        lane: 0,
        turnIntent: 'STRAIGHT',
        trait: 'LAW_ABIDING',
        initialS: -11.5,
        initialSpeedMps: 5.5,
      },
    ],
    pedestrianSpawns: [],
  },
  {
    id: 'tier2-seed3-three-car-chain',
    tier: 2,
    seedIndex: 3,
    title: 'Tier 2.3 — 3-Car Simultaneous Chain (Farthest Right)',
    subtitle:
      'West, South (You), and East all stop simultaneously! Trace the chain: West yields to You, and You yield to East (#1 Farthest Right).',
    lanesPerApproach: 1,
    weather: 'CLEAR_DAY',
    playerTurnIntent: 'STRAIGHT',
    playerStartLane: 0,
    allowPlayerLaneSwitch: false,
    requiredStopMode: 'SIMULTANEOUS_TIE',
    ruleHighlightTitle: '3-Car Simultaneous Farthest-Right Chain',
    ruleHighlightBody:
      'When three cars arrive together at West, South, and East, the East car has nobody to its right (North is empty). Order of progression: East goes 1st → You (South) go 2nd → West goes 3rd.',
    rhtHighlightBody:
      'Look Right [D] to watch East clear the conflict box, then claim your turn before West.',
    requiresCreepForSightline: false,
    aiSpawns: [
      {
        id: 'ai-east-chain1',
        label: 'East Emerald SUV (Farthest Right)',
        kind: 'SUV',
        colorHex: 0x10b981,
        leg: 'EAST',
        lane: 0,
        turnIntent: 'STRAIGHT',
        trait: 'LAW_ABIDING',
        initialS: -11.5,
        initialSpeedMps: 5.5,
      },
      {
        id: 'ai-west-chain3',
        label: 'West Purple Sedan (Yields to You)',
        kind: 'SEDAN',
        colorHex: 0xa855f7,
        leg: 'WEST',
        lane: 0,
        turnIntent: 'STRAIGHT',
        trait: 'LAW_ABIDING',
        initialS: -11.5,
        initialSpeedMps: 5.5,
      },
    ],
    pedestrianSpawns: [],
  },

  // ============================================================================
  // TIER 3: Turn Signals, Opposing Conflicts & Tangential Left Turns
  // ============================================================================
  {
    id: 'tier3-seed1-left-yields-opposing',
    tier: 3,
    seedIndex: 1,
    title: 'Tier 3.1 — Opposing Simultaneous Arrival: Left Yields to Straight',
    subtitle:
      'You are turning LEFT (Westbound) while the opposing North leg vehicle goes STRAIGHT. Both stop together—yield to opposing straight traffic!',
    lanesPerApproach: 1,
    weather: 'CLEAR_DAY',
    playerTurnIntent: 'LEFT',
    playerStartLane: 0,
    allowPlayerLaneSwitch: false,
    requiredStopMode: 'SIMULTANEOUS_TIE',
    ruleHighlightTitle: 'Straight & Right-Turn Priority Over Opposing Left Turn',
    ruleHighlightBody:
      'When two opposing vehicles stop simultaneously, a driver turning LEFT across oncoming lanes must yield to opposing traffic going straight or turning right.',
    rhtHighlightBody:
      'Wait for the Northbound/Southbound straight car to clear before turning left across its lane.',
    requiresCreepForSightline: false,
    aiSpawns: [
      {
        id: 'ai-north-straight',
        label: 'North Opposing Sedan (Straight)',
        kind: 'SEDAN',
        colorHex: 0x38bdf8,
        leg: 'NORTH',
        lane: 0,
        turnIntent: 'STRAIGHT',
        trait: 'LAW_ABIDING',
        initialS: -11.5,
        initialSpeedMps: 5.5,
      },
    ],
    pedestrianSpawns: [],
  },
  {
    id: 'tier3-seed2-mutual-left-turns',
    tier: 3,
    seedIndex: 2,
    title: 'Tier 3.2 — Mutual Opposing Left Turns (Pass in Front of Each Other)',
    subtitle:
      'You (South→West) and the opposing North car (North→East) are BOTH turning LEFT! In US RHT, your paths pass IN FRONT of each other—proceed concurrently!',
    lanesPerApproach: 1,
    weather: 'CLEAR_DAY',
    playerTurnIntent: 'LEFT',
    playerStartLane: 0,
    allowPlayerLaneSwitch: false,
    requiredStopMode: 'SIMULTANEOUS_TIE',
    ruleHighlightTitle: 'Opposing Left Turns Pass IN FRONT OF Each Other',
    ruleHighlightBody:
      'In US Right-Hand Traffic, two opposing vehicles both turning left turn tangentially in front of the intersection centerpoint without crossing paths. Both can proceed simultaneously!',
    rhtHighlightBody:
      'Notice the green spline guide curving cleanly into the North half of the West leg (right of the yellow line).',
    requiresCreepForSightline: false,
    aiSpawns: [
      {
        id: 'ai-north-left',
        label: 'North Opposing Left-Turner',
        kind: 'SEDAN',
        colorHex: 0xfbbf24,
        leg: 'NORTH',
        lane: 0,
        turnIntent: 'LEFT',
        trait: 'LAW_ABIDING',
        initialS: -11.5,
        initialSpeedMps: 5.5,
      },
    ],
    pedestrianSpawns: [],
  },
  {
    id: 'tier3-seed3-deadlock-breaker',
    tier: 3,
    seedIndex: 3,
    title: 'Tier 3.3 — 3-Car Simultaneous + Left-Turn Deadlock Breaker',
    subtitle:
      'South (You, Straight), East (Right of you, Straight), and North (Opposing, Turning Left) stop together. North is farthest-right but turning left across you!',
    lanesPerApproach: 1,
    weather: 'CLEAR_DAY',
    playerTurnIntent: 'STRAIGHT',
    playerStartLane: 0,
    allowPlayerLaneSwitch: false,
    requiredStopMode: 'SIMULTANEOUS_TIE',
    ruleHighlightTitle: 'Resolving the 3-Car Left-Turn Circular Deadlock',
    ruleHighlightBody:
      'North has no car to its right, but North is turning LEFT across your straight path! Under our deterministic US rule hierarchy, you (the opposing straight vehicle) break the deadlock and go first.',
    rhtHighlightBody:
      'Concurrent Shadowing Bonus: Proceed straight to unlock the intersection for East and North.',
    requiresCreepForSightline: false,
    aiSpawns: [
      {
        id: 'ai-north-deadlock-left',
        label: 'North Left-Turner (Yields to Straight)',
        kind: 'SUV',
        colorHex: 0xf43f5e,
        leg: 'NORTH',
        lane: 0,
        turnIntent: 'LEFT',
        trait: 'LAW_ABIDING',
        initialS: -11.5,
        initialSpeedMps: 5.5,
      },
      {
        id: 'ai-east-deadlock-wait',
        label: 'East Sedan (Yields to North)',
        kind: 'SEDAN',
        colorHex: 0x60a5fa,
        leg: 'EAST',
        lane: 0,
        turnIntent: 'STRAIGHT',
        trait: 'LAW_ABIDING',
        initialS: -11.5,
        initialSpeedMps: 5.5,
      },
    ],
    pedestrianSpawns: [],
  },

  // ============================================================================
  // TIER 4: Vulnerable Road Users (Pedestrians & Right-Side Cyclists)
  // ============================================================================
  {
    id: 'tier4-seed1-pedestrian-crosswalk',
    tier: 4,
    seedIndex: 1,
    title: 'Tier 4.1 — Pedestrian in Exit Crosswalk During Right Turn',
    subtitle:
      'You are turning RIGHT onto the East leg. Stop at the limit line, scan right [D], and wait for the pedestrian crossing the East crosswalk!',
    lanesPerApproach: 1,
    weather: 'CLEAR_DAY',
    playerTurnIntent: 'RIGHT',
    playerStartLane: 0,
    allowPlayerLaneSwitch: false,
    requiredStopMode: 'STANDARD',
    ruleHighlightTitle: 'Pedestrians in Marked & Unmarked Crosswalks Come First',
    ruleHighlightBody:
      'Before turning right or left, you must yield to pedestrians in both your entry crosswalk and the destination crosswalk you are turning across.',
    rhtHighlightBody:
      'Try toggling the State Law Selector (Universal US vs. CA/OR Full-Crosswalk Yield) in Settings!',
    requiresCreepForSightline: false,
    aiSpawns: [],
    pedestrianSpawns: [
      {
        id: 'ped-east-1',
        crosswalk: 'EAST',
        initialProgress: -0.55,
        direction: 1,
        speedNormalizedPerSec: 0.22,
      },
    ],
  },
  {
    id: 'tier4-seed2-cyclist-right-hook',
    tier: 4,
    seedIndex: 2,
    title: 'Tier 4.2 — Cyclist in Right-Hand Bike Lane (Anti-Right-Hook)',
    subtitle:
      'You are turning RIGHT, and a cyclist is approaching in the green right-side bike lane! Stop, Look Right [D], and let the cyclist pass straight through first.',
    lanesPerApproach: 1,
    weather: 'CLEAR_DAY',
    playerTurnIntent: 'RIGHT',
    playerStartLane: 0,
    allowPlayerLaneSwitch: false,
    requiredStopMode: 'STANDARD',
    ruleHighlightTitle: 'Never Right-Hook a Straight-Through Cyclist',
    ruleHighlightBody:
      'A bicycle traveling straight in the right-hand bike lane has the right-of-way over a motor vehicle turning right across that lane.',
    rhtHighlightBody:
      'Always check your right side-mirror and blind spot ([D]) before turning right across a curb bike lane.',
    requiresCreepForSightline: false,
    aiSpawns: [
      {
        id: 'ai-cyclist-south',
        label: 'Right Bike-Lane Cyclist',
        kind: 'CYCLIST',
        colorHex: 0x22c55e,
        leg: 'SOUTH',
        lane: 1,
        turnIntent: 'STRAIGHT',
        trait: 'LAW_ABIDING',
        initialS: -6.5,
        initialSpeedMps: 4.2,
      },
    ],
    pedestrianSpawns: [],
  },

  // ============================================================================
  // TIER 5: Emergency Vehicles & School Buses
  // ============================================================================
  {
    id: 'tier5-seed1-emergency-siren',
    tier: 5,
    seedIndex: 1,
    title: 'Tier 5.1 — Active Emergency Responder Override',
    subtitle:
      'You stopped first, but an Ambulance with flashing lights and siren is crossing from the West leg! Remain stopped at the limit line until it clears.',
    lanesPerApproach: 1,
    weather: 'DUSK',
    playerTurnIntent: 'STRAIGHT',
    playerStartLane: 0,
    allowPlayerLaneSwitch: false,
    requiredStopMode: 'STANDARD',
    ruleHighlightTitle: 'Emergency Vehicles Override All 4-Way Stop Priority',
    ruleHighlightBody:
      'When a police car, fire truck, or ambulance approaches with active flashing lights and siren, every direction at a 4-way stop must yield and remain stopped until it passes.',
    rhtHighlightBody:
      'Notice the red/blue peripheral directional strobe alerting you from the West approach.',
    requiresCreepForSightline: false,
    aiSpawns: [
      {
        id: 'ai-ambulance-west',
        label: 'West Emergency Ambulance 🚨',
        kind: 'AMBULANCE',
        colorHex: 0xf8fafc,
        leg: 'WEST',
        lane: 0,
        turnIntent: 'STRAIGHT',
        trait: 'EMERGENCY_SIREN',
        initialS: -26.0,
        initialSpeedMps: 10.5,
      },
    ],
    pedestrianSpawns: [],
  },
  {
    id: 'tier5-seed2-school-bus',
    tier: 5,
    seedIndex: 2,
    title: 'Tier 5.2 — Opposing School Bus with Extended Red Stop Arm',
    subtitle:
      'An opposing yellow US School Bus on the North leg has its red lights flashing and STOP arm out while a student crosses. Hold your stop until the arm retracts!',
    lanesPerApproach: 1,
    weather: 'CLEAR_DAY',
    playerTurnIntent: 'STRAIGHT',
    playerStartLane: 0,
    allowPlayerLaneSwitch: false,
    requiredStopMode: 'STANDARD',
    ruleHighlightTitle: 'US School Bus Red Flashing Lights & Stop Arm Law',
    ruleHighlightBody:
      'In all 50 US states, when a school bus stops on an undivided roadway and extends its flashing red STOP arm, both following AND opposing traffic must remain completely stopped until the arm retracts.',
    rhtHighlightBody:
      'Passing a stopped school bus is one of the most severe moving violations in US traffic law.',
    requiresCreepForSightline: false,
    aiSpawns: [
      {
        id: 'ai-school-bus-north',
        label: 'Opposing US School Bus 🛑',
        kind: 'SCHOOL_BUS',
        colorHex: 0xfacc15,
        leg: 'NORTH',
        lane: 0,
        turnIntent: 'STRAIGHT',
        trait: 'SCHOOL_BUS_RED_FLASH',
        initialS: -0.5,
        initialSpeedMps: 0,
      },
    ],
    pedestrianSpawns: [
      {
        id: 'ped-student-north',
        crosswalk: 'NORTH',
        initialProgress: -0.6,
        direction: 1,
        speedNormalizedPerSec: 0.25,
      },
    ],
  },

  // ============================================================================
  // TIER 6: Multi-Lane 4-Way Stops, Lane Selection & Sightline Occlusion
  // ============================================================================
  {
    id: 'tier6-seed1-multilane-left-lane',
    tier: 6,
    seedIndex: 1,
    title: 'Tier 6.1 — Multi-Lane Approach: Select Inner Lane for Left Turn',
    subtitle:
      'You are in the Outer Right Curb Lane (Lane 1), but your mission is a LEFT TURN! Press [Q] during approach to shift into the Inner Left Lane (Lane 0) before stopping.',
    lanesPerApproach: 2,
    weather: 'CLEAR_DAY',
    playerTurnIntent: 'LEFT',
    playerStartLane: 1,
    allowPlayerLaneSwitch: true,
    requiredStopMode: 'FIFO_GAP',
    ruleHighlightTitle: 'Multi-Lane Turn Positioning & Concurrent Shadowing',
    ruleHighlightBody:
      'On a 2-lane-per-direction approach (4 lanes total), Left Turns MUST be made from the inner lane next to the double-yellow line (Lane 0), entering the inner receiving lane.',
    rhtHighlightBody:
      'Broken white lines separate lanes moving in the SAME direction. Press [Q] to move into the inner left-turn lane before the solid white line.',
    requiresCreepForSightline: false,
    aiSpawns: [
      {
        id: 'ai-north-shadow-left',
        label: 'North Inner Left-Turner',
        kind: 'SEDAN',
        colorHex: 0x38bdf8,
        leg: 'NORTH',
        lane: 0,
        turnIntent: 'LEFT',
        receivingLane: 0,
        trait: 'LAW_ABIDING',
        initialS: -10.0,
        initialSpeedMps: 5.0,
      },
    ],
    pedestrianSpawns: [],
  },
  {
    id: 'tier6-seed2-box-truck-creep',
    tier: 6,
    seedIndex: 2,
    title: 'Tier 6.2 — Sightline Occlusion & Visibility Creep Buffer (+1.5m)',
    subtitle:
      'A tall White Box Truck stopped beside you blocks your view of the East leg! First stop at 0.0 mph, then tap [W] to creep into Zone 2 (+1.5m) and spot hidden traffic.',
    lanesPerApproach: 2,
    weather: 'CLEAR_DAY',
    playerTurnIntent: 'STRAIGHT',
    playerStartLane: 0,
    allowPlayerLaneSwitch: false,
    requiredStopMode: 'FIFO_GAP',
    ruleHighlightTitle: '3-Zone Stop & Creep Buffer Mechanics',
    ruleHighlightBody:
      'After registering your legal 0.0 mph stop in Zone 1, tap [W] gently to creep up to +1.5m past the limit line at ≤ 3 mph. Your stop timestamp is preserved while you check past the Box Truck!',
    rhtHighlightBody:
      'Watch out: hidden behind the Box Truck on the East leg is an SUV that stopped #1 before you!',
    requiresCreepForSightline: true,
    aiSpawns: [
      {
        id: 'ai-box-truck-occluder',
        label: 'Adjacent White Box Truck',
        kind: 'BOX_TRUCK',
        colorHex: 0xf1f5f9,
        leg: 'SOUTH',
        lane: 1,
        turnIntent: 'RIGHT',
        receivingLane: 1,
        trait: 'LAW_ABIDING',
        initialS: -0.2,
        initialSpeedMps: 0,
      },
      {
        id: 'ai-east-hidden-1',
        label: 'Hidden East Red SUV (#1)',
        kind: 'SUV',
        colorHex: 0xef4444,
        leg: 'EAST',
        lane: 0,
        turnIntent: 'STRAIGHT',
        receivingLane: 0,
        trait: 'LAW_ABIDING',
        initialS: -3.2,
        initialSpeedMps: 1.9,
      },
    ],
    pedestrianSpawns: [],
  },

  // ============================================================================
  // TIER 7: Unpredictable Real-World AI Hazards (Mastery Tier)
  // ============================================================================
  {
    id: 'tier7-seed1-rolling-stopper',
    tier: 7,
    seedIndex: 1,
    title: 'Tier 7.1 — Defensive Mastery: The "California Roll" Runner',
    subtitle:
      'You stopped first (#1), but look left [A]—a distracted red sports sedan on the West leg is rolling straight through its stop sign at 15 mph! Hold back until it clears.',
    lanesPerApproach: 2,
    weather: 'CLEAR_DAY',
    playerTurnIntent: 'STRAIGHT',
    playerStartLane: 0,
    allowPlayerLaneSwitch: false,
    requiredStopMode: 'STANDARD',
    ruleHighlightTitle: 'Duty of Care: Never Enforce Right-of-Way Through a Crash',
    ruleHighlightBody:
      'Having the legal right-of-way does not protect you from a distracted driver running a stop sign. Always verify cross-traffic is physically decelerating before entering Zone 3.',
    rhtHighlightBody:
      'Your hesitation timer automatically pauses while an active collision hazard crosses the box.',
    requiresCreepForSightline: false,
    aiSpawns: [
      {
        id: 'ai-west-runner',
        label: 'West Rolling-Stop Runner ⚠️',
        kind: 'SEDAN',
        colorHex: 0xe11d48,
        leg: 'WEST',
        lane: 0,
        turnIntent: 'STRAIGHT',
        receivingLane: 0,
        trait: 'ROLLING_STOPPER',
        initialS: -18.5,
        initialSpeedMps: 7.4,
      },
    ],
    pedestrianSpawns: [],
  },
  {
    id: 'tier7-seed2-wave-of-death-trap',
    tier: 7,
    seedIndex: 2,
    title: 'Tier 7.2 — Rain/Fog & The Multi-Lane "Wave of Death" Trap',
    subtitle:
      'Press [F] to turn on Wipers/Defogger! The East Inner SUV flashes its high-beams waving you through—but a hidden car is rushing in the East Outer lane! Honk [H] or wait.',
    lanesPerApproach: 2,
    weather: 'RAIN_FOG',
    playerTurnIntent: 'LEFT',
    playerStartLane: 0,
    allowPlayerLaneSwitch: false,
    requiredStopMode: 'STANDARD',
    ruleHighlightTitle: 'Never Trust a Courtesy Wave Across Multiple Lanes',
    ruleHighlightBody:
      'A polite waver’s headlight flash has zero legal weight and cannot clear an adjacent lane hidden behind them. Press [F] for wipers, tap [H] (Horn) or wait for the outer-lane hazard to clear, then proceed.',
    rhtHighlightBody:
      'Adverse weather increases stopping distances—brake early into Zone 1.',
    requiresCreepForSightline: true,
    aiSpawns: [
      {
        id: 'ai-east-polite-waver',
        label: 'East Polite Waver (Flashing High-Beams)',
        kind: 'SUV',
        colorHex: 0x64748b,
        leg: 'EAST',
        lane: 0,
        turnIntent: 'STRAIGHT',
        receivingLane: 0,
        trait: 'POLITE_WAVER',
        initialS: -0.3,
        initialSpeedMps: 0,
      },
      {
        id: 'ai-east-wave-trap-runner',
        label: 'East Outer-Lane Hidden Hazard ⚠️',
        kind: 'SEDAN',
        colorHex: 0xf97316,
        leg: 'EAST',
        lane: 1,
        turnIntent: 'STRAIGHT',
        receivingLane: 1,
        trait: 'WAVE_TRAP_HIDDEN',
        initialS: -22.0,
        initialSpeedMps: 7.0,
      },
    ],
    pedestrianSpawns: [],
  },
];

export function getScenariosByTier(tier: number): ScenarioDefinition[] {
  return SCENARIO_CATALOG.filter((s) => s.tier === tier);
}

export function getScenarioById(id: string): ScenarioDefinition {
  return SCENARIO_CATALOG.find((s) => s.id === id) ?? SCENARIO_CATALOG[0];
}
