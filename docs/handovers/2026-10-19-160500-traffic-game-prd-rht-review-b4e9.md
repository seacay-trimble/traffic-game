# Handover: traffic-game PRD v1.1 Risk Mitigation, US Right-Hand Traffic Law Alignment & Concept Art

**Date:** 2026-10-19 16:05 (UTC-5)
**Project:** traffic-game (working title: *Four-Way Mastery*)
**Goal:** Review the v1.0 PRD for issues/risks, align all traffic rules and visual concepts with US Right-Hand Traffic (RHT) lane positioning and `docs/driving-practices-in-the-US.pdf` (U.S. Department of State Office of Foreign Missions guide), and update the marked-up concept visuals.

## Completed Work
- Reviewed `docs/driving-practices-in-the-US.pdf` (U.S. Department of State Bureau of Diplomatic Security / Office of Foreign Missions — *Driving Practices in the United States*) and extracted key moving violation categories, point penalties, defensive safety practices, and state regulations relevant to international drivers at intersections.
- Conducted a comprehensive risk and rule-engine review of `docs/PRD.md`, identifying and mitigating 8 key risks (including RHT vs. LHD lane orientation, the 3-car simultaneous + left-turn deadlock loop, the 0.51-second manual braking trap, Creep vs. Go input collision, concurrent non-conflicting shadowing, replay buffer truncation, hazard-aware hesitation timers, and state law variations).
- Regenerated and verified all three marked-up visual concept images (`concept-1-cockpit-pov-hud.png`, `concept-2-tactical-replay-citation.png`, `concept-3-chase-cam-creep-zones.png`) so that vehicles strictly drive on the **right-hand side of the road** (to the right of the double-yellow centerline from each driver's POV, with `STOP / ALL WAY` signs on the right curb).
- Updated `C:\Users\slowcay\Documents\Code\traffic-game\docs\PRD.md` to **v1.1**, adding Section 12.1 (Annotated Visual Design Concepts), Section 12.3 (Exact US Right-Hand Traffic Coordinate & Lane Table for the 3D Engine), and OFM Moving Violation Point integration.

## Key Decisions & Reasons
1. **Strict Separation of "Right-Hand Traffic (RHT)" vs. "Left-Hand Drive (LHD)":**
   - Early diffusion prompts that said "left-hand drive" caused the image generator to place vehicles on the *left side of the road* (UK/NZ style).
   - Updated the PRD (`REQ-01` and Section 12.3) with explicit mathematical coordinate bounds for all four approaches so that approaching lanes are strictly to the **right** of the double-yellow centerline (driver's left = double-yellow centerline; driver's right = curb and `STOP` sign).
2. **Integration of U.S. Dept. of State OFM Driving Practices (`docs/driving-practices-in-the-US.pdf`):**
   - Added the OFM Point System (pp. 6–8) to the rule engine (`REQ-05`, `REQ-10`, `REQ-11`): *Driving through a stop sign (3 pts)*, *Failure to yield at a posted sign (2 pts)*, *Improper turns (2 pts)*, *Failure to keep in proper lane (2 pts)*, *Following too closely (2 pts)*, and the *8-point review / 12-point suspension* threshold.
   - Incorporated OFM Safety Tips (pp. 15–16) and State Law tables (pp. 21–28): *"Look both ways at intersections — do not pull away from a sign until you are sure other drivers are stopping or yielding"*, weather/headlight-with-wipers rules, and `Move Over` emergency vehicle rules.
3. **3-Zone Intersection Entry Model (`REQ-02`):**
   - Solved the input collision between "Creep Forward" and "Proceed" by defining Zone 1 (`Legal Stop Zone`, $0\text{ mph}$ required behind the white line), Zone 2 (`Visibility Creep Buffer`, $0\text{ to }+1.5\text{ m}$ at $\le 3\text{ mph}$ for peeking past sightline occluders), and Zone 3 (`Conflict Entry Threshold`).

## Validation Performed
- Inspected all three regenerated PNG concept images in `C:\Users\slowcay\Documents\Code\traffic-game\docs\images\` to verify US right-side lane placement relative to the central double-yellow line.

## Files Created or Updated
- Updated PRD (v1.1): `C:\Users\slowcay\Documents\Code\traffic-game\docs\PRD.md`
- Updated Concept Art:
  - `C:\Users\slowcay\Documents\Code\traffic-game\docs\images\concept-1-cockpit-pov-hud.png`
  - `C:\Users\slowcay\Documents\Code\traffic-game\docs\images\concept-2-tactical-replay-citation.png`
  - `C:\Users\slowcay\Documents\Code\traffic-game\docs\images\concept-3-chase-cam-creep-zones.png`
- Handover Note: `C:\Users\slowcay\Documents\Code\traffic-game\docs\handovers\2026-10-19-160500-traffic-game-prd-rht-review-b4e9.md`
- Updated Vault Overview: `C:\Users\slowcay\Documents\Vaults\CursorCentral\Projects\traffic-game\overview.md`

## Next Steps
1. Review the updated concept images in `docs/images/` and `docs/PRD.md` (v1.1).
2. Scaffold the Vite + TypeScript + Three.js application and implement the unit-tested US 4-Way Stop & RHT Lane Rule Evaluator.
