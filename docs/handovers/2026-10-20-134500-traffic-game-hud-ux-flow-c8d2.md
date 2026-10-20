# Handover: traffic-game PRD v1.3 — Game HUD, UX Principles & Player Interaction Flow

**Date:** 2026-10-20 13:45 (UTC+13 / NZDT)
**Project:** traffic-game (working title: *Four-Way Mastery*)
**Goal:** Research Game Heads-Up Display (HUD) and Core Game UX design principles on the web, synthesize how they apply to a real-time 3D driving law simulator, and update `docs/PRD.md` with comprehensive UX, UI, HUD taxonomy, and player interaction flow specifications.

## Completed Work
- Conducted web research on Game HUD & UX design principles (covering Fagerholt & Lorentzon's 2009 *Beyond the HUD* 4-Quadrant Taxonomy, Celia Hodent's *The Gamer's Brain* cognitive load & attention budget principles, Player Research peripheral-vision studies, and adaptive HUD state-machine patterns).
- Updated `C:\Users\slowcay\Documents\Code\traffic-game\docs\PRD.md` to **v1.3**:
  - Added **`REQ-12` (Immersion-Preserving Adaptive HUD & Context-Driven UX Flow)** to Section 4 (Group 4) and Section 6 (Requirements Summary).
  - Expanded **Section 12.4 (`Game HUD, UX Architecture & Player Interaction Flow Specification`)** into five detailed subsections:
    - `12.4.1`: Core Game UX Principles Applied to *Four-Way Mastery* (Unobstructed $60\%$ Foveal Windshield Zone, 3-Cluster Consolidation to minimize eye saccades, Peripheral Vision luminance/motion cues, Local Blur Scrims + Tabular Numerals + Colorblind-Safe Redundant Encoding, and Hysteresis + Competence-Based Onboarding Decay).
    - `12.4.2`: The Four-Layer HUD Taxonomy (**Diegetic**, **Spatial**, **Meta**, and **Non-Diegetic** layers mapped to specific game elements).
    - `12.4.3`: Information Hierarchy & Adaptive Visibility Matrix (**Persistent**, **Contextual**, **Transient**, and **On-Demand** lifecycles).
    - `12.4.4`: End-to-End Player Interaction Flow (**5-Stage UX State Machine** with Mermaid state diagram covering `State1_Briefing`, `State2_Approach`, `State3_StopScanCreep`, `State4_CommitExecute`, and `State5_TacticalReplay / PassSummary`).
    - `12.4.5`: Controls, Ergonomics & Accessibility Specification (`--hud-scale` slider, CVD-safe palettes, Training Helper toggles, Reduced Motion mode).
  - Added **Phase 5 (`Adaptive 4-Layer HUD & 5-Stage UX State Machine`)** to Section 12.5 (`Engineering Implementation Plan`).

## Key Decisions & Reasons
1. **Unobstructed Foveal Horizon (Inner $60\%$ Viewport Rule):** Players must continuously track AI vehicle blinkers, braking nose-dives, and crosswalk pedestrians across four approaches; keeping persistent 2D UI out of the center windshield prevents visual occlusion and reduces cognitive load.
2. **Complementary 4-Layer HUD Taxonomy:** Pure diegetic UI can cost extra camera lookups, whereas pure non-diegetic UI breaks driving immersion. Combining Diegetic cabin cues (speedometer, blinker click, mirror, AI brake pitch), Spatial 3D road overlays (Zone 1–3 bands, occlusion cones, turn chevrons), Meta screen-edge alerts (off-screen siren A-pillar glow, Tier 7 windshield rain/fog), and Non-Diegetic peripheral clusters achieves both high immersion and instant clarity.
3. **Competence-Based Onboarding Decay:** Floating spatial arrival-order badges (`#1`, `#2`) and verbose keybind hints assist novices in Tiers 1–2, then automatically decay in Tiers 3–7 during live driving (while remaining available in the post-action Tactical Replay) so players internalize real-world observation skills.

## Files Created or Updated
- Updated PRD (v1.3): `C:\Users\slowcay\Documents\Code\traffic-game\docs\PRD.md`
- Handover Note: `C:\Users\slowcay\Documents\Code\traffic-game\docs\handovers\2026-10-20-134500-traffic-game-hud-ux-flow-c8d2.md`
- Updated Vault Overview: `C:\Users\slowcay\Documents\Vaults\CursorCentral\Projects\traffic-game\overview.md`

## Next Steps
1. Scaffold the Vite + TypeScript + Three.js project and implement Phases 1–5 from `docs/PRD.md` Section 12.5.
