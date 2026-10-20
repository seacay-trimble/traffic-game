import { ZONE_2_CREEP_MAX_S } from '../engine/roadGeometry';
import { getScenariosByTier, SCENARIO_CATALOG } from '../engine/scenarios';
import { IntersectionSimulation, PlayerInputState } from '../engine/simulation';
import { CameraMode, HeadLookDirection, ScenarioDefinition } from '../engine/types';
import { AccessibilityStore } from './accessibilityStore';

export class AppUIController {
  private sim: IntersectionSimulation;
  private prefs: AccessibilityStore;
  private metaLayer: HTMLElement;
  private hudSafeArea: HTMLElement;

  public activeCameraMode: CameraMode;
  public isInspectingReplayOnPass = false;
  public replayPlayheadSec = 0;
  public replayPlaying = true;
  private settingsModalOpen = false;

  // Callbacks to main controller
  private onScenarioChange: (scenario: ScenarioDefinition, showBriefing: boolean) => void;

  // Live DOM elements for fast 60fps updates without full re-render
  private speedValueEl: HTMLElement | null = null;
  private stopBadgeEl: HTMLElement | null = null;
  private rhtLaneEl: HTMLElement | null = null;
  private transientBannerEl: HTMLElement | null = null;
  private lookLeftBtnEl: HTMLElement | null = null;
  private lookRightBtnEl: HTMLElement | null = null;
  private chkStopEl: HTMLElement | null = null;
  private chkScanEl: HTMLElement | null = null;
  private chkGoEl: HTMLElement | null = null;
  private brakeBtnEl: HTMLElement | null = null;
  private goBtnEl: HTMLElement | null = null;
  private lanePillEl: HTMLElement | null = null;
  private weatherPillEl: HTMLElement | null = null;
  private creepPillEl: HTMLElement | null = null;
  private sirenLeftEl: HTMLElement | null = null;
  private sirenRightEl: HTMLElement | null = null;
  private hesitationMetaEl: HTMLElement | null = null;
  private weatherGlassEl: HTMLElement | null = null;
  private replayScrubberInput: HTMLInputElement | null = null;
  private replayTimeReadout: HTMLElement | null = null;

  private lastRenderedStage: string = '';

  constructor(
    sim: IntersectionSimulation,
    prefs: AccessibilityStore,
    metaLayer: HTMLElement,
    hudSafeArea: HTMLElement,
    onScenarioChange: (scenario: ScenarioDefinition, showBriefing: boolean) => void
  ) {
    this.sim = sim;
    this.prefs = prefs;
    this.metaLayer = metaLayer;
    this.hudSafeArea = hudSafeArea;
    this.activeCameraMode = prefs.state.preferredCamera;
    this.onScenarioChange = onScenarioChange;

    this.buildMetaLayerDOM();
    this.renderCurrentStageDOM(true);
  }

  private buildMetaLayerDOM(): void {
    this.metaLayer.innerHTML = `
      <div class="meta-weather-glass" id="meta-weather-glass"></div>
      <div class="meta-siren-edge left" id="meta-siren-left"></div>
      <div class="meta-siren-edge right" id="meta-siren-right"></div>
      <div class="meta-hesitation" id="meta-hesitation"></div>
    `;
    this.weatherGlassEl = document.getElementById('meta-weather-glass');
    this.sirenLeftEl = document.getElementById('meta-siren-left');
    this.sirenRightEl = document.getElementById('meta-siren-right');
    this.hesitationMetaEl = document.getElementById('meta-hesitation');
  }

  public notifyScenarioLoaded(): void {
    this.isInspectingReplayOnPass = false;
    this.replayPlaying = true;
    this.lastRenderedStage = '';
    this.renderCurrentStageDOM(true);
  }

  public updateFrame(dt: number, input: PlayerInputState): void {
    // Update Meta UI Layer (Siren edges, Hesitation vignette, Weather glass)
    this.updateMetaEffects();

    const stageKey = `${this.sim.stage}_${this.isInspectingReplayOnPass}_${this.settingsModalOpen}`;
    if (stageKey !== this.lastRenderedStage) {
      this.lastRenderedStage = stageKey;
      if (this.sim.stage === 'STAGE_5_OUTCOME_REPLAY') {
        this.replayPlayheadSec = Math.max(0, this.sim.replayBuffer.getEndTimeSec() - 5.5);
        this.replayPlaying = true;
      }
      this.renderCurrentStageDOM(false);
    }

    if (
      this.sim.stage === 'STAGE_2_APPROACH' ||
      this.sim.stage === 'STAGE_3_STOP_SCAN_CREEP' ||
      this.sim.stage === 'STAGE_4_COMMIT'
    ) {
      this.updateActiveDrivingHUD(input);
    } else if (this.sim.stage === 'STAGE_5_OUTCOME_REPLAY') {
      this.updateReplayScrubber(dt);
    }
  }

  private updateMetaEffects(): void {
    const leftSiren = this.sim.aiVehicles.some(
      (v) => v.emergencyLightsOn && v.leg === 'WEST' && v.zone !== 'EXITED'
    );
    const rightSiren = this.sim.aiVehicles.some(
      (v) => v.emergencyLightsOn && v.leg === 'EAST' && v.zone !== 'EXITED'
    );
    this.sirenLeftEl?.classList.toggle('active', leftSiren);
    this.sirenRightEl?.classList.toggle('active', rightSiren);

    const hesitateWarn =
      this.sim.isPlayerHoldRightOfWay &&
      this.sim.hesitationTimerSec > 3.8 &&
      this.sim.stage === 'STAGE_3_STOP_SCAN_CREEP';
    this.hesitationMetaEl?.classList.toggle('active', hesitateWarn);

    if (this.weatherGlassEl) {
      const isRain = this.sim.scenario.weather === 'RAIN_FOG';
      this.weatherGlassEl.classList.toggle('foggy-unwiped', isRain && !this.sim.wipersActive);
      this.weatherGlassEl.classList.toggle('rain-wiped', isRain && this.sim.wipersActive);
    }
  }

  private renderCurrentStageDOM(_force: boolean): void {
    if (this.settingsModalOpen) {
      this.renderSettingsModal();
      return;
    }

    if (this.sim.stage === 'STAGE_1_BRIEFING') {
      this.renderStage1Briefing();
      return;
    }

    if (this.sim.stage === 'STAGE_5_OUTCOME_REPLAY') {
      if (this.sim.evaluationResult?.passed && !this.isInspectingReplayOnPass) {
        this.renderPassSummaryModal();
      } else {
        this.renderTacticalReplayHUD();
      }
      return;
    }

    // Stages 2, 3, 4: Active Driving HUD
    this.renderDrivingHUDTemplate();
  }

  private renderStage1Briefing(): void {
    const sc = this.sim.scenario;
    const tierScenarios = getScenariosByTier(sc.tier);

    const tierTabsHtml = [1, 2, 3, 4, 5, 6, 7]
      .map(
        (t) => `
        <button class="tier-tab-btn ${sc.tier === t ? 'active' : ''}" data-tier="${t}">
          Tier ${t}
        </button>
      `
      )
      .join('');

    const seedButtonsHtml = tierScenarios
      .map(
        (item) => `
        <button class="tier-tab-btn ${item.id === sc.id ? 'active' : ''}" data-scenario-id="${item.id}">
          ${item.seedIndex}: ${item.title.split('—')[1]?.trim() ?? item.title}
          ${this.sim.completedScenarioIds.has(item.id) ? ' ✓' : ''}
        </button>
      `
      )
      .join('');

    const turnBadge =
      sc.playerTurnIntent === 'LEFT'
        ? '↰ TURN LEFT (Westbound)'
        : sc.playerTurnIntent === 'RIGHT'
        ? '↱ TURN RIGHT (Eastbound)'
        : '↑ GO STRAIGHT (Northbound)';

    this.hudSafeArea.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card">
          <div class="modal-header">
            <div>
              <span class="tier-pill">US 4-Way Stop Curriculum · Tier ${sc.tier} of 7</span>
              <h1 class="modal-title" style="margin-top:8px;">${sc.title}</h1>
            </div>
            <button class="icon-btn" id="btn-open-settings" title="Accessibility & State Law Settings">
              ⚙ Settings
            </button>
          </div>

          <div class="tier-selector-strip">${tierTabsHtml}</div>
          <div class="tier-selector-strip">${seedButtonsHtml}</div>

          <p class="modal-subtitle">${sc.subtitle}</p>

          <div class="rule-box">
            <div class="rule-box-title">US Traffic Rule Focus — ${sc.ruleHighlightTitle}</div>
            <div class="rule-box-body">${sc.ruleHighlightBody}</div>
          </div>

          <div class="rule-box rht-box">
            <div class="rule-box-title">US Right-Hand Traffic (RHT) & OFM Orientation</div>
            <div class="rule-box-body">
              <strong>Mission Maneuver:</strong> ${turnBadge}<br/>
              ${sc.rhtHighlightBody}
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; font-size:12.5px; color:var(--text-secondary);">
            <div>
              <strong>Controls:</strong>
              Hold <kbd>[S]</kbd>/<kbd>[Space]</kbd> Brake to 0 mph ·
              <kbd>[A]</kbd>/<kbd>[D]</kbd> Look Left/Right ·
              <kbd>[W]</kbd> Creep / Accelerate ·
              <kbd>[C]</kbd> Chase Cam
            </div>
            <div class="tabular-nums">
              OFM Points: <strong>${this.sim.ofmTotalPoints} / 12 pts</strong>
            </div>
          </div>

          <div class="cta-row">
            <button class="secondary-btn" id="btn-random-seed">🎲 Randomize Scenario</button>
            <button class="primary-btn" id="btn-start-driving">Start Approach [Enter]</button>
          </div>

          <div class="disclaimer-footer">
            Educational training simulator based on the U.S. Department of State OFM Driving Guide & Uniform Vehicle Code. Not official legal advice.
          </div>
        </div>
      </div>
    `;

    this.hudSafeArea.querySelectorAll('[data-tier]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = Number((btn as HTMLElement).dataset.tier);
        const list = getScenariosByTier(t);
        if (list.length > 0) this.onScenarioChange(list[0], true);
      });
    });

    this.hudSafeArea.querySelectorAll('[data-scenario-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.scenarioId!;
        const found = SCENARIO_CATALOG.find((s) => s.id === id);
        if (found) this.onScenarioChange(found, true);
      });
    });

    document.getElementById('btn-random-seed')?.addEventListener('click', () => {
      const others = SCENARIO_CATALOG.filter((s) => s.id !== sc.id);
      const pick = others[Math.floor(Math.random() * others.length)] ?? sc;
      this.onScenarioChange(pick, true);
    });

    document.getElementById('btn-start-driving')?.addEventListener('click', () => {
      this.sim.startDrivingFromBriefing();
    });

    document.getElementById('btn-open-settings')?.addEventListener('click', () => {
      this.settingsModalOpen = true;
      this.renderCurrentStageDOM(true);
    });
  }

  private renderDrivingHUDTemplate(): void {
    const sc = this.sim.scenario;
    const turnArrow =
      sc.playerTurnIntent === 'LEFT' ? '↰' : sc.playerTurnIntent === 'RIGHT' ? '↱' : '↑';
    const turnText =
      sc.playerTurnIntent === 'LEFT'
        ? 'LEFT TURN'
        : sc.playerTurnIntent === 'RIGHT'
        ? 'RIGHT TURN'
        : 'STRAIGHT';

    const ofmClass =
      this.sim.ofmTotalPoints >= 8
        ? 'danger'
        : this.sim.ofmTotalPoints >= 4
        ? 'warn'
        : '';

    this.hudSafeArea.innerHTML = `
      <!-- Top Header Cluster (Cluster 1) -->
      <div class="hud-top-bar scrim-panel hud-interactive">
        <div class="hud-top-left">
          <span class="tier-pill">Tier ${sc.tier}.${sc.seedIndex}</span>
          <span class="scenario-title-text">${sc.title.split('—')[1]?.trim() ?? sc.title}</span>
          <span class="ofm-record-pill tabular-nums ${ofmClass}" title="US Dept. of State OFM 2-Year Point Record (8 pts = Review, 12 pts = Suspension)">
            OFM Record: ${this.sim.ofmTotalPoints} / 12 pts
          </span>
        </div>

        <div class="hud-top-right">
          <div class="mission-objective-pill">
            <span class="mission-arrow">${turnArrow}</span>
            <span>${turnText}</span>
          </div>
          <button class="icon-btn" id="btn-hud-briefing" title="Open Scenario Briefing & Tier Picker">📋 Scenarios</button>
          <button class="icon-btn" id="btn-hud-reset" title="Restart Scenario [R]">↺ Retry [R]</button>
          <button class="icon-btn" id="btn-hud-settings" title="Settings & Accessibility">⚙</button>
        </div>
      </div>

      <!-- Transient Upper-Peripheral Toast Banner -->
      <div class="hud-transient-banner hidden" id="hud-transient-banner"></div>

      <!-- Middle Foveal Windshield Zone (Center 65% Clear; Left/Right Edge Head-Check Prompts) -->
      <div class="hud-peripheral-band">
        <button class="head-check-prompt" id="btn-look-left">
          <span>◀ Look Left</span>
          <kbd>[A]</kbd>
        </button>
        <button class="head-check-prompt" id="btn-look-right">
          <kbd>[D]</kbd>
          <span>Look Right ▶</span>
        </button>
      </div>

      <!-- Bottom HUD Row: Contextual Sub-Pills (Left) + Consolidated Dashboard (Center) + Pedals (Right) -->
      <div class="hud-bottom-row">
        <div class="hud-bottom-left">
          <div class="contextual-pill lane-select scrim-panel hud-interactive hidden" id="pill-lane-select">
            <span>Multi-Lane Approach:</span>
            <button class="icon-btn" id="btn-lane-0">[Q] Inner Left Lane</button>
            <button class="icon-btn" id="btn-lane-1">[E] Outer Curb Lane</button>
          </div>
          <div class="contextual-pill weather-alert scrim-panel hud-interactive hidden" id="pill-weather-wipers">
            <span>🌧 Rain/Fog Glare:</span>
            <button class="icon-btn" id="btn-toggle-wipers">[F] Toggle Wipers</button>
          </div>
          <div class="contextual-pill creep-gauge scrim-panel tabular-nums hidden" id="pill-creep-gauge">
            Creep Buffer: +0.0m / +1.5m max
          </div>
        </div>

        <!-- Consolidated Bottom-Center Dashboard Cluster (Cluster 2) -->
        <div class="hud-dashboard-cluster scrim-panel">
          <div class="stop-status-badge" id="hud-stop-badge">
            🛑 BRAKE AT WHITE LIMIT LINE (0.0 MPH)
          </div>
          <div class="dashboard-gauges">
            <div>
              <span class="speed-readout tabular-nums" id="hud-speed-value">14.0</span>
              <span class="speed-unit">MPH</span>
            </div>
            <span class="gear-badge">D · LHD</span>
          </div>
          <div class="rht-lane-indicator" id="hud-rht-lane">
            US Right-Hand Lane (Right of Double-Yellow)
          </div>
        </div>

        <!-- Bottom-Right Pedals & Checklist (Cluster 3) -->
        <div class="hud-bottom-right hud-interactive">
          <div class="checklist-card scrim-panel">
            <div class="checklist-item" id="chk-stop">○ 1. Complete 0.0 mph Stop at White Line</div>
            <div class="checklist-item" id="chk-scan">○ 2. Head-Check Left [A] & Right [D]</div>
            <div class="checklist-item" id="chk-go">○ 3. Yield / Proceed in Legal Order</div>
          </div>

          <div class="pedals-row">
            <button class="pedal-btn camera" id="btn-pedal-cam" title="Toggle 1st-Person Cockpit / 3rd-Person Chase Cam [C]">
              <span>CAM</span>
              <span class="key-hint">[C]</span>
            </button>
            <button class="pedal-btn horn" id="btn-pedal-horn" title="Sound Horn [H]">
              <span>HORN</span>
              <span class="key-hint">[H]</span>
            </button>
            <button class="pedal-btn brake" id="btn-pedal-brake">
              <span>BRAKE</span>
              <span class="key-hint">[S / Space]</span>
            </button>
            <button class="pedal-btn go" id="btn-pedal-go">
              <span>CREEP / GO</span>
              <span class="key-hint">[W / ↑]</span>
            </button>
          </div>
        </div>
      </div>
    `;

    this.speedValueEl = document.getElementById('hud-speed-value');
    this.stopBadgeEl = document.getElementById('hud-stop-badge');
    this.rhtLaneEl = document.getElementById('hud-rht-lane');
    this.transientBannerEl = document.getElementById('hud-transient-banner');
    this.lookLeftBtnEl = document.getElementById('btn-look-left');
    this.lookRightBtnEl = document.getElementById('btn-look-right');
    this.chkStopEl = document.getElementById('chk-stop');
    this.chkScanEl = document.getElementById('chk-scan');
    this.chkGoEl = document.getElementById('chk-go');
    this.brakeBtnEl = document.getElementById('btn-pedal-brake');
    this.goBtnEl = document.getElementById('btn-pedal-go');
    this.lanePillEl = document.getElementById('pill-lane-select');
    this.weatherPillEl = document.getElementById('pill-weather-wipers');
    this.creepPillEl = document.getElementById('pill-creep-gauge');

    document.getElementById('btn-hud-briefing')?.addEventListener('click', () => {
      this.sim.stage = 'STAGE_1_BRIEFING';
      this.renderCurrentStageDOM(true);
    });
    document.getElementById('btn-hud-reset')?.addEventListener('click', () => {
      this.onScenarioChange(this.sim.scenario, false);
    });
    document.getElementById('btn-hud-settings')?.addEventListener('click', () => {
      this.settingsModalOpen = true;
      this.renderCurrentStageDOM(true);
    });
    document.getElementById('btn-pedal-cam')?.addEventListener('click', () => {
      this.toggleCameraMode();
    });
    document.getElementById('btn-pedal-horn')?.addEventListener('click', () => {
      this.sim.honkHorn();
    });
    document.getElementById('btn-lane-0')?.addEventListener('click', () => {
      this.sim.switchPlayerApproachLane(0);
    });
    document.getElementById('btn-lane-1')?.addEventListener('click', () => {
      this.sim.switchPlayerApproachLane(1);
    });
    document.getElementById('btn-toggle-wipers')?.addEventListener('click', () => {
      this.sim.toggleWipers();
    });
  }

  private updateActiveDrivingHUD(input: PlayerInputState): void {
    const p = this.sim.player;
    const mph = p.speedMps * 2.23694;

    if (this.speedValueEl) {
      this.speedValueEl.textContent = mph < 0.15 ? '0.0' : mph.toFixed(1);
    }

    if (this.stopBadgeEl) {
      if (p.stopTimestamp === null) {
        const dist = Math.max(0, -p.s).toFixed(1);
        this.stopBadgeEl.className = 'stop-status-badge tabular-nums';
        this.stopBadgeEl.textContent = `🛑 STOP LINE IN ${dist}m — HOLD [S]/[SPACE] FOR 0.0 MPH`;
      } else if (p.zone === 'ZONE_2_CREEP') {
        this.stopBadgeEl.className = 'stop-status-badge creeping tabular-nums';
        this.stopBadgeEl.textContent = `👀 CREEPING (+${p.s.toFixed(1)}m / 1.5m) — STOP PRESERVED`;
      } else {
        this.stopBadgeEl.className = 'stop-status-badge registered tabular-nums';
        this.stopBadgeEl.textContent = this.sim.isPlayerHoldRightOfWay
          ? `✓ STOP REGISTERED (${p.stopOrderBadge ?? '#1'}) — YOUR TURN: PRESS [W]`
          : `✓ STOP REGISTERED (T=${p.stopTimestamp.toFixed(1)}s) — YIELDING TO PRIORITY TRAFFIC`;
      }
    }

    if (this.rhtLaneEl) {
      if (this.sim.scenario.lanesPerApproach === 2) {
        this.rhtLaneEl.textContent =
          p.lane === 0
            ? 'Lane 0: Inner Left-Turn/Straight Lane (Right of Double-Yellow)'
            : 'Lane 1: Outer Right Curb Lane';
      } else {
        this.rhtLaneEl.textContent = 'US Right-Hand Traffic (East Half of South Leg, x > 0)';
      }
    }

    // Transient Banner
    if (this.transientBannerEl) {
      if (this.sim.transientBanner) {
        this.transientBannerEl.className = `hud-transient-banner ${this.sim.transientBanner.tone}`;
        this.transientBannerEl.textContent = this.sim.transientBanner.text;
      } else {
        this.transientBannerEl.className = 'hud-transient-banner hidden';
      }
    }

    // Head-check peripheral buttons
    if (this.lookLeftBtnEl) {
      this.lookLeftBtnEl.classList.toggle('checked', this.sim.lookedLeftAfterStop);
      this.lookLeftBtnEl.classList.toggle('active-look', input.lookDirection === 'LEFT');
      this.lookLeftBtnEl.innerHTML = this.sim.lookedLeftAfterStop
        ? `<span>✓ Left Checked</span> <kbd>[A]</kbd>`
        : `<span>◀ Look Left</span> <kbd>[A]</kbd>`;
    }
    if (this.lookRightBtnEl) {
      this.lookRightBtnEl.classList.toggle('checked', this.sim.lookedRightAfterStop);
      this.lookRightBtnEl.classList.toggle('active-look', input.lookDirection === 'RIGHT');
      this.lookRightBtnEl.innerHTML = this.sim.lookedRightAfterStop
        ? `<kbd>[D]</kbd> <span>Right Checked ✓</span>`
        : `<kbd>[D]</kbd> <span>Look Right ▶</span>`;
    }

    // Checklist items
    if (this.chkStopEl) {
      const done = p.stopTimestamp !== null;
      this.chkStopEl.classList.toggle('done', done);
      this.chkStopEl.textContent = `${done ? '✓' : '○'} 1. Complete 0.0 mph Stop at White Line`;
    }
    if (this.chkScanEl) {
      const done = this.sim.lookedLeftAfterStop || this.sim.lookedRightAfterStop;
      this.chkScanEl.classList.toggle('done', done);
      this.chkScanEl.textContent = `${done ? '✓' : '○'} 2. Head-Check Left [A] & Right [D]`;
    }
    if (this.chkGoEl) {
      const done = this.sim.isPlayerHoldRightOfWay && p.stopTimestamp !== null;
      this.chkGoEl.classList.toggle('done', done);
      this.chkGoEl.textContent = done
        ? '✓ 3. Priority Clear — Press [W] to Proceed!'
        : '○ 3. Yield Until Your Legal Turn';
    }

    // Pedal active visuals
    this.brakeBtnEl?.classList.toggle('pressed', input.brake);
    this.goBtnEl?.classList.toggle('pressed', input.accelerate);

    // Contextual bottom-left pills
    this.lanePillEl?.classList.toggle(
      'hidden',
      !(this.sim.scenario.allowPlayerLaneSwitch && p.s < -2.0)
    );
    this.weatherPillEl?.classList.toggle(
      'hidden',
      this.sim.scenario.weather !== 'RAIN_FOG'
    );
    if (this.creepPillEl) {
      const showCreep =
        p.stopTimestamp !== null &&
        (p.zone === 'ZONE_2_CREEP' || this.sim.scenario.requiresCreepForSightline) &&
        p.s <= ZONE_2_CREEP_MAX_S;
      this.creepPillEl.classList.toggle('hidden', !showCreep);
      if (showCreep) {
        const creepDist = Math.max(0, p.s).toFixed(2);
        this.creepPillEl.textContent = `👀 Creep Sightline Buffer: +${creepDist}m / +1.50m max (≤ 3 mph)`;
      }
    }
  }

  private renderPassSummaryModal(): void {
    const res = this.sim.evaluationResult!;
    const sc = this.sim.scenario;
    const idx = SCENARIO_CATALOG.findIndex((s) => s.id === sc.id);
    const nextScenario = SCENARIO_CATALOG[(idx + 1) % SCENARIO_CATALOG.length];

    const starsHtml = [1, 2, 3]
      .map(
        (n) =>
          `<span class="star-icon ${n <= res.stars ? 'earned' : ''}">★</span>`
      )
      .join('');

    this.hudSafeArea.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card">
          <div class="modal-header">
            <div>
              <span class="tier-pill">Scenario Complete · Tier ${sc.tier}.${sc.seedIndex}</span>
              <h2 class="modal-title" style="margin-top:6px; color:#6ee7b7;">✓ ${res.complimentTitle}</h2>
            </div>
            <div class="star-row">${starsHtml}</div>
          </div>

          <p class="modal-subtitle">${res.complimentBody}</p>

          <div class="rule-box">
            <div class="rule-box-title">Why This Succeeded Under US Traffic Law</div>
            <div class="rule-box-body">
              • <strong>Complete Stop at White Limit Line:</strong> Registered at T = ${
                this.sim.player.stopTimestamp?.toFixed(2) ?? '0.00'
              }s (0.0 mph).<br/>
              • <strong>Right-of-Way & RHT Compliance:</strong> ${sc.ruleHighlightBody}
              ${
                res.usedConcurrentShadowing
                  ? '<br/>• <strong>Concurrent Shadowing Bonus:</strong> You efficiently proceeded alongside a non-conflicting trajectory!'
                  : ''
              }
            </div>
          </div>

          <div class="cta-row">
            <button class="secondary-btn" id="btn-pass-inspect-replay">🎥 Inspect 3D Tactical Replay</button>
            <button class="secondary-btn" id="btn-pass-retry">↺ Replay Scenario</button>
            <button class="primary-btn" id="btn-pass-next">Next: ${nextScenario.title.split('—')[0]} →</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('btn-pass-inspect-replay')?.addEventListener('click', () => {
      this.isInspectingReplayOnPass = true;
      this.renderCurrentStageDOM(true);
    });
    document.getElementById('btn-pass-retry')?.addEventListener('click', () => {
      this.onScenarioChange(sc, false);
    });
    document.getElementById('btn-pass-next')?.addEventListener('click', () => {
      this.onScenarioChange(nextScenario, true);
    });
  }

  /**
   * Renders Stage 5: Total HUD Context Swap into the 3D Overhead Tactical Replay & OFM Citation View.
   */
  private renderTacticalReplayHUD(): void {
    const res = this.sim.evaluationResult!;
    const cit = res.citation;
    const sc = this.sim.scenario;

    const allVeh = [this.sim.player, ...this.sim.aiVehicles];
    const stopTimelineHtml = allVeh
      .map((v) => {
        const tStr =
          v.stopTimestamp !== null
            ? `Stopped T=${v.stopTimestamp.toFixed(2)}s`
            : 'Did Not Stop at Line';
        const cls =
          v.stopOrderBadge === '#1' || v.stopOrderBadge === 'TIE #1'
            ? 'priority'
            : v.stopTimestamp === null && v.isPlayer
            ? 'violation'
            : '';
        return `
          <div class="stop-order-item tabular-nums ${cls}">
            <span><strong>${v.label}</strong> (${v.turnIntent})</span>
            <span>${v.stopOrderBadge ? `[${v.stopOrderBadge}] ` : ''}${tStr}</span>
          </div>
        `;
      })
      .join('');

    const keyframesHtml = this.sim.replayBuffer
      .getKeyframes()
      .map(
        (kf) => `
        <button class="icon-btn tabular-nums" data-kf-time="${kf.timestampSec}">
          ${kf.label} (${kf.timestampSec.toFixed(1)}s)
        </button>
      `
      )
      .join('');

    const startSec = this.sim.replayBuffer.getStartTimeSec();
    const endSec = Math.max(startSec + 0.5, this.sim.replayBuffer.getEndTimeSec());

    this.hudSafeArea.innerHTML = `
      <div class="replay-layout">
        <!-- Top Replay Header -->
        <div class="replay-header scrim-panel hud-interactive">
          <div style="display:flex; align-items:center; gap:12px;">
            <span class="tier-pill" style="background:rgba(239,68,68,0.25); border-color:#ef4444; color:#fecaca;">
              3D OVERHEAD TACTICAL REPLAY
            </span>
            <span class="scenario-title-text">${sc.title}</span>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="icon-btn" id="btn-replay-scenarios">📋 All Tiers</button>
            <button class="primary-btn" id="btn-replay-retry">↺ Retry Scenario [R]</button>
          </div>
        </div>

        <!-- Left Stop-Order & Trajectory Legend -->
        <div class="replay-left-panel scrim-panel hud-interactive">
          <div style="font-size:12px; font-weight:800; text-transform:uppercase; color:var(--color-gold);">
            Stop Timestamp & Queue Ledger
          </div>
          ${stopTimelineHtml}

          <div style="font-size:11.5px; color:var(--text-secondary); margin-top:6px; line-height:1.45;">
            <strong>3D Ribbon Legend:</strong><br/>
            • <span style="color:#38bdf8;">■ Cyan Ribbon:</span> Your Trajectory<br/>
            • <span style="color:#ef4444;">⭕ Red Ring:</span> Right-of-Way Conflict Point<br/>
            • <span style="color:#facc15;">═ Double Yellow:</span> Keep Right (US RHT)
          </div>
        </div>

        <!-- Right OFM Moving Violation Citation Card -->
        <div class="replay-right-sidebar scrim-panel hud-interactive">
          ${
            cit
              ? `
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="tier-pill" style="background:rgba(239,68,68,0.28); border-color:#ef4444; color:#fecaca;">
                US TRAFFIC VIOLATION CITATION
              </span>
              <span class="tabular-nums" style="font-weight:900; color:var(--color-danger);">
                +${cit.ofmPoints} OFM Pts
              </span>
            </div>
            <h2 style="font-size:19px; font-weight:900; color:#fecaca;">${cit.title}</h2>
            <div class="rule-box" style="border-left-color:var(--color-danger);">
              <div class="rule-box-title" style="color:#fca5a5;">What Happened</div>
              <div class="rule-box-body">${cit.ruleSummary}</div>
            </div>
            <div class="rule-box rht-box">
              <div class="rule-box-title">US Dept. of State OFM Point Schedule</div>
              <div class="rule-box-body tabular-nums">
                <strong>Category:</strong> ${cit.ofmCategory} (${cit.ofmPoints} pts)<br/>
                <strong>Your Cumulative Record:</strong> ${this.sim.ofmTotalPoints} / 12 pts
                ${
                  this.sim.ofmTotalPoints >= 12
                    ? '<br/><span style="color:var(--color-danger); font-weight:800;">⚠️ 12-Point License Suspension Threshold Reached!</span>'
                    : this.sim.ofmTotalPoints >= 8
                    ? '<br/><span style="color:var(--color-warn); font-weight:800;">⚠️ 8-Point Administrative Review Warning</span>'
                    : ''
                }
              </div>
            </div>
            <div style="font-size:12px; color:var(--text-secondary);">
              <strong>Reference:</strong> ${cit.handbookReference}
            </div>
          `
              : `
            <h2 style="font-size:19px; font-weight:900; color:#6ee7b7;">✓ Clean Pass Replay</h2>
            <p style="font-size:13.5px; color:var(--text-secondary);">${res.complimentBody}</p>
          `
          }

          <div class="cta-row" style="margin-top:auto;">
            ${
              this.sim.ofmTotalPoints >= 8
                ? `<button class="secondary-btn" id="btn-reset-ofm">Reset OFM Points</button>`
                : ''
            }
            <button class="primary-btn" id="btn-replay-retry-2" style="width:100%;">
              ↺ Try Scenario Again [R]
            </button>
          </div>

          <div class="disclaimer-footer">
            Educational training simulator based on the U.S. Dept. of State OFM Guide. State traffic codes may vary.
          </div>
        </div>

        <!-- Bottom 60-Second Replay Scrubber & Keyframe Bar -->
        <div class="replay-bottom-scrubber scrim-panel hud-interactive">
          <button class="icon-btn" id="btn-replay-toggle-play">⏸ Pause</button>
          <input
            type="range"
            class="scrubber-slider"
            id="replay-scrubber-slider"
            min="${startSec.toFixed(2)}"
            max="${endSec.toFixed(2)}"
            step="0.05"
            value="${this.replayPlayheadSec.toFixed(2)}"
          />
          <span class="tabular-nums" id="replay-time-readout" style="font-size:12.5px; font-weight:700; min-width:95px;">
            ${this.replayPlayheadSec.toFixed(1)}s / ${endSec.toFixed(1)}s
          </span>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">${keyframesHtml}</div>
        </div>
      </div>
    `;

    this.replayScrubberInput = document.getElementById(
      'replay-scrubber-slider'
    ) as HTMLInputElement | null;
    this.replayTimeReadout = document.getElementById('replay-time-readout');

    const playBtn = document.getElementById('btn-replay-toggle-play');
    playBtn?.addEventListener('click', () => {
      this.replayPlaying = !this.replayPlaying;
      playBtn.textContent = this.replayPlaying ? '⏸ Pause' : '▶ Play';
    });

    this.replayScrubberInput?.addEventListener('input', () => {
      this.replayPlaying = false;
      if (playBtn) playBtn.textContent = '▶ Play';
      this.replayPlayheadSec = Number(this.replayScrubberInput!.value);
    });

    this.hudSafeArea.querySelectorAll('[data-kf-time]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const t = Number((btn as HTMLElement).dataset.kfTime);
        this.replayPlayheadSec = Math.max(0, t - 0.4);
        this.replayPlaying = true;
        if (playBtn) playBtn.textContent = '⏸ Pause';
      });
    });

    document.getElementById('btn-replay-retry')?.addEventListener('click', () => {
      this.onScenarioChange(sc, false);
    });
    document.getElementById('btn-replay-retry-2')?.addEventListener('click', () => {
      this.onScenarioChange(sc, false);
    });
    document.getElementById('btn-replay-scenarios')?.addEventListener('click', () => {
      this.sim.stage = 'STAGE_1_BRIEFING';
      this.renderCurrentStageDOM(true);
    });
    document.getElementById('btn-reset-ofm')?.addEventListener('click', () => {
      this.sim.ofmTotalPoints = 0;
      this.renderCurrentStageDOM(true);
    });
  }

  private updateReplayScrubber(dt: number): void {
    const startSec = this.sim.replayBuffer.getStartTimeSec();
    const endSec = Math.max(startSec + 0.5, this.sim.replayBuffer.getEndTimeSec());

    if (this.replayPlaying) {
      // Auto-time-warp 2x through stationary dead air if enabled
      const isDeadAir =
        this.prefs.state.autoTimeWarpReplay &&
        this.sim.replayBuffer.isDeadAirAtTime(this.replayPlayheadSec);
      const speedMult = isDeadAir ? 2.0 : 1.0;

      this.replayPlayheadSec += dt * speedMult;
      if (this.replayPlayheadSec > endSec) {
        this.replayPlayheadSec = startSec;
      }
    }

    if (this.replayScrubberInput) {
      this.replayScrubberInput.value = this.replayPlayheadSec.toFixed(2);
    }
    if (this.replayTimeReadout) {
      this.replayTimeReadout.textContent = `${this.replayPlayheadSec.toFixed(1)}s / ${endSec.toFixed(1)}s`;
    }
  }

  private renderSettingsModal(): void {
    const st = this.prefs.state;

    this.hudSafeArea.innerHTML = `
      <div class="modal-backdrop">
        <div class="modal-card">
          <div class="modal-header">
            <h2 class="modal-title">⚙ Accessibility, HUD & US State Law Settings</h2>
            <button class="icon-btn" id="btn-close-settings">✕ Close</button>
          </div>

          <div class="rule-box">
            <div class="rule-box-title">HUD Scale & Opacity (REQ-09)</div>
            <div class="rule-box-body" style="display:flex; flex-direction:column; gap:10px; margin-top:6px;">
              <label style="display:flex; justify-content:space-between; align-items:center;">
                <span>HUD Text & Widget Scale (${Math.round(st.hudScale * 100)}%)</span>
                <input type="range" id="inp-hud-scale" min="0.85" max="1.25" step="0.05" value="${st.hudScale}" />
              </label>
              <label style="display:flex; justify-content:space-between; align-items:center;">
                <span>HUD Scrim Opacity (${Math.round(st.hudOpacity * 100)}%)</span>
                <input type="range" id="inp-hud-opacity" min="0.6" max="1.0" step="0.05" value="${st.hudOpacity}" />
              </label>
              <label style="display:flex; justify-content:space-between; align-items:center;">
                <span>Colorblind-Safe High-Contrast Mode (Cyan / Gold / Magenta)</span>
                <input type="checkbox" id="inp-cvd-mode" ${st.colorblindMode ? 'checked' : ''} />
              </label>
              <label style="display:flex; justify-content:space-between; align-items:center;">
                <span>Mute Synthesizer Audio</span>
                <input type="checkbox" id="inp-mute-audio" ${st.soundMuted ? 'checked' : ''} />
              </label>
            </div>
          </div>

          <div class="rule-box rht-box">
            <div class="rule-box-title">US State Crosswalk Jurisdiction Selector (Risk #8)</div>
            <div class="rule-box-body" style="margin-top:6px;">
              <select id="sel-jurisdiction" class="icon-btn" style="width:100%; padding:10px;">
                <option value="UNIVERSAL_US" ${st.jurisdiction === 'UNIVERSAL_US' ? 'selected' : ''}>
                  Universal US Standard (Uniform Vehicle Code — Yield on Your Half + Approaching Half)
                </option>
                <option value="CALIFORNIA_OREGON" ${st.jurisdiction === 'CALIFORNIA_OREGON' ? 'selected' : ''}>
                  Strict Full-Crosswalk Yield (California / Oregon — Wait Until Curb-to-Curb Clear)
                </option>
              </select>
            </div>
          </div>

          <div class="cta-row">
            <button class="primary-btn" id="btn-save-settings">Done</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('inp-hud-scale')?.addEventListener('input', (e) => {
      this.prefs.update({ hudScale: Number((e.target as HTMLInputElement).value) });
    });
    document.getElementById('inp-hud-opacity')?.addEventListener('input', (e) => {
      this.prefs.update({ hudOpacity: Number((e.target as HTMLInputElement).value) });
    });
    document.getElementById('inp-cvd-mode')?.addEventListener('change', (e) => {
      this.prefs.update({ colorblindMode: (e.target as HTMLInputElement).checked });
    });
    document.getElementById('inp-mute-audio')?.addEventListener('change', (e) => {
      const muted = (e.target as HTMLInputElement).checked;
      this.prefs.update({ soundMuted: muted });
      this.sim.audio.muted = muted;
    });
    document.getElementById('sel-jurisdiction')?.addEventListener('change', (e) => {
      const mode = (e.target as HTMLSelectElement).value as 'UNIVERSAL_US' | 'CALIFORNIA_OREGON';
      this.prefs.update({ jurisdiction: mode });
      this.sim.jurisdiction = mode;
    });

    const close = () => {
      this.settingsModalOpen = false;
      this.renderCurrentStageDOM(true);
    };
    document.getElementById('btn-close-settings')?.addEventListener('click', close);
    document.getElementById('btn-save-settings')?.addEventListener('click', close);
  }

  public toggleCameraMode(): void {
    this.activeCameraMode =
      this.activeCameraMode === 'COCKPIT_POV' ? 'CHASE_CAM' : 'COCKPIT_POV';
    this.prefs.update({ preferredCamera: this.activeCameraMode });
    this.sim.showBanner(
      this.activeCameraMode === 'COCKPIT_POV'
        ? 'Camera [C]: 1st-Person US Left-Hand-Drive Cockpit POV'
        : 'Camera [C]: 3rd-Person Chase Cam (3-Zone Ground Bands Visible)',
      'info',
      2.2
    );
  }

  public getLookDirectionFromButtons(): HeadLookDirection | null {
    return null;
  }
}
