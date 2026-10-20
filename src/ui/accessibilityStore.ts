import { CameraMode, JurisdictionMode } from '../engine/types';

export interface UserPreferencesState {
  hudScale: number;
  hudOpacity: number;
  colorblindMode: boolean;
  jurisdiction: JurisdictionMode;
  preferredCamera: CameraMode;
  soundMuted: boolean;
  autoTimeWarpReplay: boolean;
}

const STORAGE_KEY = 'us_4way_stop_preferences_v1';

export class AccessibilityStore {
  public state: UserPreferencesState = {
    hudScale: 1.0,
    hudOpacity: 0.94,
    colorblindMode: false,
    jurisdiction: 'UNIVERSAL_US',
    preferredCamera: 'COCKPIT_POV',
    soundMuted: false,
    autoTimeWarpReplay: true,
  };

  constructor() {
    this.load();
    this.applyToDOM();
  }

  public load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<UserPreferencesState>;
        this.state = { ...this.state, ...parsed };
      }
    } catch {
      // Ignore storage errors
    }
  }

  public update(patch: Partial<UserPreferencesState>): void {
    this.state = { ...this.state, ...patch };
    this.applyToDOM();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Ignore storage errors
    }
  }

  public applyToDOM(): void {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    root.style.setProperty('--hud-scale', String(this.state.hudScale));
    root.style.setProperty('--hud-opacity', String(this.state.hudOpacity));
    document.body.classList.toggle('cvd-mode', this.state.colorblindMode);
  }
}
