import { ZONE_1_STOP_MAX_S, ZONE_1_STOP_MIN_S } from './roadGeometry';
import { ScenarioDefinition, VehicleState } from './types';

export const SIMULTANEOUS_TIE_THRESHOLD_SEC = 0.25; // |Delta t| <= 0.25s is treated as a simultaneous tie
export const FIFO_PERCEPTUAL_DEADBAND_SEC = 1.2; // |Delta t| >= 1.2s guaranteed on FIFO scenarios

/**
 * Dynamic AI Stop-Sync & Perceptual Deadband Controller (PRD Section 7 REQ-03 & Section 12.1 Phase 2).
 *
 * Solves the "0.51s Manual Braking Trap":
 * 1. On `SIMULTANEOUS_TIE` scenarios, as the player decelerates into Zone 1, AI vehicles designated
 *    to tie with the player smoothly modulate their final braking so their complete stop occurs
 *    within <= 0.08s of the player's stop timestamp, guaranteeing a simultaneous tiebreaker test.
 * 2. On `FIFO_GAP` scenarios, AI vehicles either stop at least 1.2s BEFORE the player (so AI is clearly #1)
 *    or hold slightly back so they stop at least 1.2s AFTER the player (so player is clearly #1),
 *    eliminating ambiguous 0.3s-0.8s disputes.
 */
export function applyDynamicStopSync(
  scenario: ScenarioDefinition,
  player: VehicleState,
  aiVehicles: VehicleState[],
  simTimeSec: number
): void {
  if (scenario.requiredStopMode === 'SIMULTANEOUS_TIE') {
    for (const ai of aiVehicles) {
      if (ai.trait !== 'LAW_ABIDING') continue;

      // If AI reaches the limit line before the player has stopped, hold AI at 0.35 m/s micro-roll
      // inside Zone 1 until the player also stops, then lock both timestamps together!
      if (
        ai.stopTimestamp === null &&
        ai.s >= ZONE_1_STOP_MIN_S &&
        ai.s <= ZONE_1_STOP_MAX_S
      ) {
        if (player.stopTimestamp !== null) {
          ai.speedMps = 0;
          ai.stopTimestamp = player.stopTimestamp + 0.04; // Guaranteed |Delta t| <= 0.2s TIE
          ai.zone = 'ZONE_1_STOP';
        } else if (player.s > -7.5 && player.speedMps < 5.0) {
          // Wait for player's manual braking to complete
          ai.speedMps = Math.min(ai.speedMps, 0.25);
          ai.s = Math.min(ai.s, -0.15);
        }
      }

      // Conversely, if AI stopped slightly earlier while player was already braking in Zone 1,
      // synchronize timestamps when player completes stop
      if (
        player.stopTimestamp !== null &&
        ai.stopTimestamp !== null &&
        Math.abs(player.stopTimestamp - ai.stopTimestamp) < 1.35 &&
        ai.zone === 'ZONE_1_STOP'
      ) {
        ai.stopTimestamp = player.stopTimestamp;
      }
    }
  } else if (scenario.requiredStopMode === 'FIFO_GAP') {
    // Enforce >= 1.2s perceptual deadband between stop timestamps
    for (const ai of aiVehicles) {
      if (ai.trait !== 'LAW_ABIDING') continue;
      if (ai.stopTimestamp !== null && player.stopTimestamp !== null) {
        const diff = player.stopTimestamp - ai.stopTimestamp;
        if (diff > 0 && diff < FIFO_PERCEPTUAL_DEADBAND_SEC) {
          // AI stopped first: ensure gap is at least 1.2s
          ai.stopTimestamp = Math.max(0.1, player.stopTimestamp - FIFO_PERCEPTUAL_DEADBAND_SEC);
        } else if (diff <= 0 && Math.abs(diff) < FIFO_PERCEPTUAL_DEADBAND_SEC) {
          // Player stopped first: ensure AI timestamp is at least 1.2s after player
          ai.stopTimestamp = player.stopTimestamp + FIFO_PERCEPTUAL_DEADBAND_SEC;
        }
      }
    }
  }

  // Assign human-readable Stop Order Badges (#1, #2, TIE, WAVE, EMERG, BUS)
  assignStopOrderBadges(player, aiVehicles, simTimeSec);
}

export function assignStopOrderBadges(
  player: VehicleState,
  aiVehicles: VehicleState[],
  _simTimeSec: number
): void {
  const all = [player, ...aiVehicles];

  for (const v of all) {
    if (v.trait === 'EMERGENCY_SIREN') {
      v.stopOrderBadge = 'EMERG 🚨';
      continue;
    }
    if (v.trait === 'SCHOOL_BUS_RED_FLASH') {
      v.stopOrderBadge = 'STOP ARM 🛑';
      continue;
    }
    if (v.trait === 'POLITE_WAVER' && v.highBeamFlashOn) {
      v.stopOrderBadge = 'WAVING 👋';
      continue;
    }
    if (v.trait === 'ROLLING_STOPPER' && v.s < 2.0) {
      v.stopOrderBadge = 'FAST ⚠️';
      continue;
    }
    if (v.stopTimestamp === null || v.zone === 'EXITED') {
      v.stopOrderBadge = null;
    }
  }

  const stoppedLawful = all
    .filter(
      (v) =>
        v.stopTimestamp !== null &&
        v.zone !== 'EXITED' &&
        v.trait !== 'EMERGENCY_SIREN' &&
        v.trait !== 'SCHOOL_BUS_RED_FLASH' &&
        !(v.trait === 'POLITE_WAVER' && v.highBeamFlashOn)
    )
    .sort((a, b) => (a.stopTimestamp ?? 999) - (b.stopTimestamp ?? 999));

  if (stoppedLawful.length === 0) return;

  // Group vehicles that stopped within SIMULTANEOUS_TIE_THRESHOLD_SEC of each other
  let rank = 1;
  let i = 0;
  while (i < stoppedLawful.length) {
    const group: VehicleState[] = [stoppedLawful[i]];
    let j = i + 1;
    while (
      j < stoppedLawful.length &&
      Math.abs((stoppedLawful[j].stopTimestamp ?? 0) - (stoppedLawful[i].stopTimestamp ?? 0)) <=
        SIMULTANEOUS_TIE_THRESHOLD_SEC
    ) {
      group.push(stoppedLawful[j]);
      j++;
    }

    if (group.length > 1) {
      for (const gv of group) {
        gv.stopOrderBadge = rank === 1 ? 'TIE #1' : `TIE #${rank}`;
      }
    } else {
      group[0].stopOrderBadge = `#${rank}`;
    }

    rank += group.length;
    i = j;
  }
}
