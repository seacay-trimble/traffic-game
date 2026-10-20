# Handover: traffic-game PRD Discovery and Specification

**Date:** 2026-10-16 09:13 (UTC-5)
**Project:** traffic-game (working title: *Four-Way Mastery*)
**Goal:** Refine the product and game design vision through structured discovery questions and generate the v1.0 Product Requirements Document (PRD).

## Completed Work
- Conducted two rounds of structured product and gameplay discovery covering target audience, camera/player role, real-time vs. turn-based pacing, progressive difficulty variables, platform, feedback loops, vehicle controls, spatial observation, level progression structure, and business model.
- Authored the complete v1.0 PRD and Game Design Specification at `C:\Users\slowcay\Documents\Code\traffic-game\docs\PRD.md`.
- Created the central project overview in `CursorCentral` at `Projects/traffic-game/overview.md`.

## Key Decisions & Reasons
1. **Target Persona — International Drivers in the US:** Focuses on the real-world gap faced by newcomers from roundabout/left-side-driving countries who know the written DMV rules in 2D but struggle with real-time spatial tracking from the left-hand driver seat at US 4-way stops.
2. **Camera & Pacing — Real-Time Driver POV (1st-Person Cockpit + 3rd-Person Chase Toggle):** Simulates realistic driver-seat decision-making and head-checking (`Look Left / Right`) while providing an elevated 3rd-person toggle to overcome single-monitor FOV limitations.
3. **Controls — Rail-Guided Steering + Manual Brake/Stop/Go:** Eliminates clumsy keyboard/touch steering distractions so 100% of player attention is on complete stops at the white limit line, head-checking crosswalks/approaches, and right-of-way timing.
4. **Curriculum — 7 Progressive Tiers with Randomized Seeds:** Prevents rote memorization ("let the blue car go") while systematically layering rules:
   - Tier 1: Complete Stop, FIFO Arrival Order, Anti-Piggybacking
   - Tier 2: Simultaneous Arrivals & Farthest-Right Tiebreaker
   - Tier 3: Turn Signals & Opposing Traffic (Left Turn Yields to Straight/Right)
   - Tier 4: Pedestrians in Crosswalks & Cyclists
   - Tier 5: Emergency Vehicles (Sirens) & School Buses
   - Tier 6: Multi-Lane 4-Way Stops & Sightline Occlusion
   - Tier 7: Unpredictable AI Hazards (Rolling Stops, Polite Wavers, Defensive Saves)
5. **Pedagogical Feedback — Instant 3D Overhead Replay + US Law Citation:** On any error, the camera lifts to an overhead replay showing exact stop timestamps ($T_1, T_2$) and conflicting path ribbons alongside plain-English US traffic rule explanations and international driver contrast tips.
6. **Platform — Free-to-Play Web 3D (Browser / Three.js + TypeScript + Vite):** Zero-install accessibility across desktop and mobile browsers, with a decoupled, unit-testable TypeScript rule engine.

## Validation Performed
- Verified PRD compliance with the Pragmatic Framework (`pm-prd`) sections (Overview, Positioning, Personas, First-Person Market Problems, Prioritized Requirements, Use Scenarios, Metrics, Risks) plus an actionable Game Design & Functional Specification appendix.

## Unresolved Issues / Open Questions
- Confirm final product title (currently using working title *Four-Way Mastery*).
- Decide whether to include an optional "Left-Hand Drive / Right-Side Road Orientation" warmup module for drivers from NZ/AU/UK/JP/SG.

## Next Steps
1. Create a Release Plan / MVP implementation roadmap or scaffold the Vite + TypeScript + Three.js project in `C:\Users\slowcay\Documents\Code\traffic-game`.
2. Implement the pure TypeScript **US 4-Way Stop Rule Evaluator** state machine with unit tests covering Tiers 1–7.
3. Build the 3D intersection scene, rail-guided vehicle controller, cockpit/chase camera rig, and HUD.
