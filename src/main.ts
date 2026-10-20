import './styles/main.css';
import { SoundEffectsManager } from './engine/audio';
import { SCENARIO_CATALOG } from './engine/scenarios';
import { IntersectionSimulation, PlayerInputState } from './engine/simulation';
import { HeadLookDirection, ScenarioDefinition } from './engine/types';
import { SceneManager } from './render/sceneManager';
import { AccessibilityStore } from './ui/accessibilityStore';
import { AppUIController } from './ui/appUI';

class TrafficGameApp {
  private prefs = new AccessibilityStore();
  private audio = new SoundEffectsManager();
  private sim: IntersectionSimulation;
  private sceneManager: SceneManager;
  private ui: AppUIController;

  private keysDown = new Set<string>();
  private pointerBrake = false;
  private pointerGo = false;
  private pointerLook: HeadLookDirection = 'CENTER';
  private lastFrameTimeMs = performance.now();

  constructor() {
    this.audio.muted = this.prefs.state.soundMuted;

    const initialScenario = SCENARIO_CATALOG[0];
    this.sim = new IntersectionSimulation(initialScenario, this.audio);
    this.sim.jurisdiction = this.prefs.state.jurisdiction;

    const canvasContainer = document.getElementById('canvas-container')!;
    const spatialLayer = document.getElementById('spatial-labels-layer')!;
    const metaLayer = document.getElementById('meta-ui-layer')!;
    const hudSafeArea = document.getElementById('hud-safe-area')!;

    this.sceneManager = new SceneManager(canvasContainer, spatialLayer);
    this.sceneManager.configureScenarioEnvironment(initialScenario);

    this.ui = new AppUIController(
      this.sim,
      this.prefs,
      metaLayer,
      hudSafeArea,
      (nextScenario, showBriefing) => this.loadScenario(nextScenario, showBriefing)
    );

    this.bindInputListeners();
    requestAnimationFrame((now) => this.loop(now));
  }

  private loadScenario(scenario: ScenarioDefinition, showBriefing: boolean): void {
    this.sim.loadScenario(scenario, showBriefing);
    this.sceneManager.configureScenarioEnvironment(scenario);
    this.ui.notifyScenarioLoaded();
  }

  private bindInputListeners(): void {
    window.addEventListener('keydown', (e) => {
      const code = e.code;
      this.keysDown.add(code);

      if (this.sim.stage === 'STAGE_1_BRIEFING' && (code === 'Enter' || code === 'Space')) {
        e.preventDefault();
        this.sim.startDrivingFromBriefing();
        return;
      }

      if (code === 'KeyC') {
        this.ui.toggleCameraMode();
      } else if (code === 'KeyR') {
        this.loadScenario(this.sim.scenario, false);
      } else if (code === 'KeyH') {
        this.sim.honkHorn();
      } else if (code === 'KeyF') {
        this.sim.toggleWipers();
      } else if (code === 'KeyQ') {
        this.sim.switchPlayerApproachLane(0);
      } else if (code === 'KeyE') {
        this.sim.switchPlayerApproachLane(1);
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
    });

    // Delegate touch/mouse hold events on HUD pedals & head-check buttons
    document.addEventListener('pointerdown', (e) => {
      const target = (e.target as HTMLElement).closest('button');
      if (!target) return;
      if (target.id === 'btn-pedal-brake') this.pointerBrake = true;
      if (target.id === 'btn-pedal-go') this.pointerGo = true;
      if (target.id === 'btn-look-left') this.pointerLook = 'LEFT';
      if (target.id === 'btn-look-right') this.pointerLook = 'RIGHT';
    });

    const clearPointers = () => {
      this.pointerBrake = false;
      this.pointerGo = false;
      this.pointerLook = 'CENTER';
    };
    document.addEventListener('pointerup', clearPointers);
    document.addEventListener('pointercancel', clearPointers);
  }

  private gatherInput(): PlayerInputState {
    const brake =
      this.pointerBrake ||
      this.keysDown.has('KeyS') ||
      this.keysDown.has('ArrowDown') ||
      this.keysDown.has('Space');

    const accelerate =
      !brake &&
      (this.pointerGo ||
        this.keysDown.has('KeyW') ||
        this.keysDown.has('ArrowUp'));

    let lookDirection: HeadLookDirection = this.pointerLook;
    if (this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft')) {
      lookDirection = 'LEFT';
    } else if (this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight')) {
      lookDirection = 'RIGHT';
    }

    return { accelerate, brake, lookDirection };
  }

  private loop(nowMs: number): void {
    const dtSec = Math.min(0.05, (nowMs - this.lastFrameTimeMs) / 1000);
    this.lastFrameTimeMs = nowMs;

    const input = this.gatherInput();

    const prevStage = this.sim.stage;
    this.sim.step(dtSec, input);

    // If we just transitioned into Stage 5 Outcome Replay, populate 3D trajectory ribbons
    if (prevStage !== 'STAGE_5_OUTCOME_REPLAY' && this.sim.stage === 'STAGE_5_OUTCOME_REPLAY') {
      this.sceneManager.showReplayConflictVisuals(
        this.sim.scenario,
        this.sim.player,
        this.sim.aiVehicles,
        this.sim.evaluationResult?.citation?.conflictPoint
      );
    }

    this.ui.updateFrame(dtSec, input);

    if (
      this.sim.stage === 'STAGE_5_OUTCOME_REPLAY' &&
      (!this.sim.evaluationResult?.passed || this.ui.isInspectingReplayOnPass)
    ) {
      const snap = this.sim.replayBuffer.getSnapshotAtTime(this.ui.replayPlayheadSec);
      if (snap) {
        this.sceneManager.renderReplaySnapshot(dtSec, snap);
      }
    } else {
      this.sceneManager.renderFrame(
        dtSec,
        [this.sim.player, ...this.sim.aiVehicles],
        this.sim.pedestrians,
        this.ui.activeCameraMode,
        input.lookDirection,
        this.sim.player,
        this.sim.scenario.lanesPerApproach
      );
    }

    requestAnimationFrame((nextNow) => this.loop(nextNow));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new TrafficGameApp();
});
