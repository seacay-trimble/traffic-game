import * as THREE from 'three';
import {
  INTERSECTION_HALF_BOX,
  LEG_SPECS,
  ROAD_EXTENT,
} from '../engine/roadGeometry';
import { sampleIntersectionPath } from '../engine/turnSplines';
import {
  ApproachLeg,
  CameraMode,
  HeadLookDirection,
  PedestrianState,
  ReplayFrameSnapshot,
  ScenarioDefinition,
  Vec2,
  VehicleKind,
  VehicleState,
  WeatherCondition,
} from '../engine/types';

interface VehicleMeshBundle {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  blinkerFL: THREE.Mesh;
  blinkerFR: THREE.Mesh;
  blinkerRL: THREE.Mesh;
  blinkerRR: THREE.Mesh;
  brakeLightL: THREE.Mesh;
  brakeLightR: THREE.Mesh;
  highBeamConeL: THREE.Mesh;
  highBeamConeR: THREE.Mesh;
  sirenBar?: THREE.Group;
  stopArm?: THREE.Mesh;
  cockpitGroup?: THREE.Group;
  steeringWheel?: THREE.Group;
}

export class SceneManager {
  private container: HTMLElement;
  private spatialLabelsLayer: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  private environmentGroup = new THREE.Group();
  private markingsGroup = new THREE.Group();
  private splineGuideMesh: THREE.Mesh | null = null;
  private replayConflictGroup = new THREE.Group();
  private rainLines: THREE.LineSegments | null = null;

  private vehicleBundles = new Map<string, VehicleMeshBundle>();
  private pedestrianMeshes = new Map<string, THREE.Group>();
  private badgeElements = new Map<string, HTMLDivElement>();

  private currentYawOffsetRad = 0;
  private blinkerClockSec = 0;

  constructor(container: HTMLElement, spatialLabelsLayer: HTMLElement) {
    this.container = container;
    this.spatialLabelsLayer = spatialLabelsLayer;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87b8e8);
    this.scene.fog = new THREE.FogExp2(0x87b8e8, 0.005);

    this.camera = new THREE.PerspectiveCamera(
      64,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.15,
      190
    );

    this.setupLights();
    this.buildStaticEnvironment();
    this.scene.add(this.environmentGroup);
    this.scene.add(this.markingsGroup);
    this.scene.add(this.replayConflictGroup);

    window.addEventListener('resize', () => this.onResize());
  }

  private onResize(): void {
    const w = this.container.clientWidth;
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private setupLights(): void {
    const hemi = new THREE.HemisphereLight(0xdbeafe, 0x334155, 0.95);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfffbeb, 1.35);
    sun.position.set(28, 46, 24);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -45;
    sun.shadow.camera.right = 45;
    sun.shadow.camera.top = 45;
    sun.shadow.camera.bottom = -45;
    this.scene.add(sun);
  }

  private buildStaticEnvironment(): void {
    // Grass ground plane
    const grassGeo = new THREE.PlaneGeometry(240, 240);
    const grassMat = new THREE.MeshLambertMaterial({ color: 0x2d4f38 });
    const grass = new THREE.Mesh(grassGeo, grassMat);
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.06;
    grass.receiveShadow = true;
    this.environmentGroup.add(grass);

    // Asphalt roadways (North-South and East-West)
    const roadWidth = 14.8; // 7.4m each side of centerline
    const asphaltMat = new THREE.MeshStandardMaterial({
      color: 0x262b33,
      roughness: 0.88,
      metalness: 0.05,
    });

    const nsRoad = new THREE.Mesh(
      new THREE.PlaneGeometry(roadWidth, ROAD_EXTENT * 2),
      asphaltMat
    );
    nsRoad.rotation.x = -Math.PI / 2;
    nsRoad.receiveShadow = true;
    this.environmentGroup.add(nsRoad);

    const ewRoad = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_EXTENT * 2, roadWidth),
      asphaltMat
    );
    ewRoad.rotation.x = -Math.PI / 2;
    ewRoad.position.y = 0.002;
    ewRoad.receiveShadow = true;
    this.environmentGroup.add(ewRoad);

    // Sidewalks & Curbs on all 4 quadrants
    const curbMat = new THREE.MeshLambertMaterial({ color: 0x94a3b8 });
    const quadrantSigns = [
      { sx: 1, sz: 1 },
      { sx: -1, sz: 1 },
      { sx: 1, sz: -1 },
      { sx: -1, sz: -1 },
    ];
    for (const q of quadrantSigns) {
      const sw = new THREE.Mesh(new THREE.BoxGeometry(44, 0.16, 44), curbMat);
      sw.position.set(q.sx * 29.5, 0.04, q.sz * 29.5);
      sw.receiveShadow = true;
      this.environmentGroup.add(sw);

      // Suburban low-poly building set back on each corner so sightlines are realistic
      const bldgColor =
        q.sx > 0 && q.sz > 0
          ? 0x64748b
          : q.sx < 0 && q.sz > 0
          ? 0x78716c
          : q.sx > 0 && q.sz < 0
          ? 0x475569
          : 0x57534e;
      const bldg = new THREE.Mesh(
        new THREE.BoxGeometry(16, 7.5, 16),
        new THREE.MeshLambertMaterial({ color: bldgColor })
      );
      bldg.position.set(q.sx * 24.5, 3.75, q.sz * 24.5);
      bldg.castShadow = true;
      bldg.receiveShadow = true;
      this.environmentGroup.add(bldg);

      // Trees along parkway
      for (let t = 0; t < 2; t++) {
        const tree = this.createTreeMesh();
        tree.position.set(q.sx * (15.5 + t * 12), 0, q.sz * 15.2);
        this.environmentGroup.add(tree);
      }
    }

    // Build 4 US Octagonal STOP + ALL WAY Signs on the Right-Hand Corner of each approach
    const legs: ApproachLeg[] = ['SOUTH', 'NORTH', 'WEST', 'EAST'];
    for (const leg of legs) {
      const spec = LEG_SPECS[leg];
      const stopSign = this.createStopAllWaySignMesh();
      stopSign.position.set(spec.stopSignPos.x, 0, spec.stopSignPos.z);
      // Face the approaching driver!
      stopSign.rotation.y = spec.approachHeadingRad;
      this.environmentGroup.add(stopSign);
    }

    // Rain particle system (toggled visible in RAIN_FOG weather)
    const rainCount = 900;
    const rainPositions = new Float32Array(rainCount * 6);
    for (let i = 0; i < rainCount; i++) {
      const rx = (Math.random() - 0.5) * 60;
      const ry = Math.random() * 22;
      const rz = (Math.random() - 0.5) * 60;
      rainPositions[i * 6 + 0] = rx;
      rainPositions[i * 6 + 1] = ry;
      rainPositions[i * 6 + 2] = rz;
      rainPositions[i * 6 + 3] = rx - 0.2;
      rainPositions[i * 6 + 4] = ry - 1.1;
      rainPositions[i * 6 + 5] = rz;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    const rainMat = new THREE.LineBasicMaterial({
      color: 0xcbd5e1,
      transparent: true,
      opacity: 0.45,
    });
    this.rainLines = new THREE.LineSegments(rainGeo, rainMat);
    this.rainLines.visible = false;
    this.scene.add(this.rainLines);
  }

  private createTreeMesh(): THREE.Group {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.3, 2.2, 8),
      new THREE.MeshLambertMaterial({ color: 0x5c4033 })
    );
    trunk.position.y = 1.1;
    g.add(trunk);

    const crown = new THREE.Mesh(
      new THREE.ConeGeometry(1.8, 3.8, 9),
      new THREE.MeshLambertMaterial({ color: 0x15803d })
    );
    crown.position.y = 3.6;
    crown.castShadow = true;
    g.add(crown);
    return g;
  }

  private createStopAllWaySignMesh(): THREE.Group {
    const group = new THREE.Group();

    // Steel post
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 3.0, 8),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.6, roughness: 0.4 })
    );
    post.position.y = 1.5;
    group.add(post);

    // Crisp CanvasTexture for Octagonal STOP + ALL WAY plaque
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 256, 320);
      // Draw Octagon
      const cx = 128;
      const cy = 115;
      const r = 104;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const ang = ((i + 0.5) * Math.PI) / 4;
        const x = cx + r * Math.cos(ang);
        const y = cy + r * Math.sin(ang);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#dc2626';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const ang = ((i + 0.5) * Math.PI) / 4;
        const x = cx + (r - 9) * Math.cos(ang);
        const y = cy + (r - 9) * Math.sin(ang);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = '900 68px Inter, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('STOP', cx, cy + 3);

      // ALL WAY supplemental plaque underneath
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(36, 232, 184, 58);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(41, 237, 174, 48);
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 32px Inter, Arial, sans-serif';
      ctx.fillText('ALL WAY', cx, 262);
    }

    const tex = new THREE.CanvasTexture(canvas);
    const signPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.15, 1.44),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide })
    );
    signPlane.position.set(0, 2.55, 0.08);
    group.add(signPlane);

    return group;
  }

  /**
   * Rebuilds the US Right-Hand Traffic road markings, lane dividers, stop bars,
   * and 3-Zone spatial ground bands for the active scenario.
   */
  public configureScenarioEnvironment(scenario: ScenarioDefinition): void {
    this.setWeather(scenario.weather);

    // Clear previous dynamic markings
    while (this.markingsGroup.children.length > 0) {
      this.markingsGroup.remove(this.markingsGroup.children[0]);
    }
    this.clearReplayConflictVisuals();

    const yellowMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
    const bikeMat = new THREE.MeshBasicMaterial({
      color: 0x16a34a,
      transparent: true,
      opacity: 0.45,
    });

    const stopEdge = INTERSECTION_HALF_BOX; // 11.5m
    const outerLen = ROAD_EXTENT - stopEdge;

    // 1. Central Solid Double-Yellow Lines on all 4 legs (separating opposing US RHT directions)
    const yellowOffsets = [-0.14, 0.14];
    for (const yo of yellowOffsets) {
      // South leg (z from +11.5 to +58)
      this.addFlatStrip(yo, stopEdge + outerLen / 2, 0.12, outerLen, yellowMat);
      // North leg (z from -58 to -11.5)
      this.addFlatStrip(yo, -(stopEdge + outerLen / 2), 0.12, outerLen, yellowMat);
      // East leg (x from +11.5 to +58)
      this.addFlatStrip(stopEdge + outerLen / 2, yo, outerLen, 0.12, yellowMat);
      // West leg (x from -58 to -11.5)
      this.addFlatStrip(-(stopEdge + outerLen / 2), yo, outerLen, 0.12, yellowMat);
    }

    // 2. White Stop Limit Lines (s = 0.0m) strictly on the RIGHT-HAND approaching half of each leg!
    // South leg approach: East half x in [0.2, 7.0], z = +11.5
    this.addFlatStrip(3.6, stopEdge, 6.8, 0.55, whiteMat);
    // North leg approach: West half x in [-7.0, -0.2], z = -11.5
    this.addFlatStrip(-3.6, -stopEdge, 6.8, 0.55, whiteMat);
    // West leg approach: South half z in [0.2, 7.0], x = -11.5
    this.addFlatStrip(-stopEdge, 3.6, 0.55, 6.8, whiteMat);
    // East leg approach: North half z in [-7.0, -0.2], x = +11.5
    this.addFlatStrip(stopEdge, -3.6, 0.55, 6.8, whiteMat);

    // 3. Same-direction White Lane Lines (when lanesPerApproach === 2)
    if (scenario.lanesPerApproach === 2) {
      const solidApproachLen = 8.0;
      for (const sign of [-1, 1]) {
        const laneDiv = sign * 3.5;
        // Solid white line for final 8m before limit line (discourages last-second lane change)
        this.addFlatStrip(laneDiv, sign * (stopEdge + solidApproachLen / 2), 0.12, solidApproachLen, whiteMat);
        this.addFlatStrip(sign * (stopEdge + solidApproachLen / 2), laneDiv, solidApproachLen, 0.12, whiteMat);

        // Broken white dashes further back
        for (let d = stopEdge + solidApproachLen + 2; d < ROAD_EXTENT - 2; d += 4.5) {
          this.addFlatStrip(laneDiv, sign * d, 0.12, 2.2, whiteMat);
          this.addFlatStrip(sign * d, laneDiv, 2.2, 0.12, whiteMat);
        }
      }
    } else {
      // In 1-lane-per-direction scenarios, render a green right-curb Bike Lane on South/North legs
      this.addFlatStrip(5.8, stopEdge + outerLen / 2, 1.4, outerLen, bikeMat);
      this.addFlatStrip(4.95, stopEdge + outerLen / 2, 0.1, outerLen, whiteMat);
    }

    // 4. Continental Zebra Crosswalk Bars on all 4 legs
    const cwDist = stopEdge - 1.35; // 10.15m from center
    for (let c = -6.2; c <= 6.2; c += 1.25) {
      this.addFlatStrip(c, cwDist, 0.55, 1.9, whiteMat);
      this.addFlatStrip(c, -cwDist, 0.55, 1.9, whiteMat);
      this.addFlatStrip(cwDist, c, 1.9, 0.55, whiteMat);
      this.addFlatStrip(-cwDist, c, 1.9, 0.55, whiteMat);
    }

    // 5. Subtle 3-Zone Spatial Ground Bands on Player's South Approach (Zone 1 Legal Stop & Zone 2 Creep Buffer)
    const zone1Mat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.18,
    });
    this.addFlatStrip(3.6, stopEdge + 1.5, 6.6, 3.0, zone1Mat, 0.012);

    const zone2Mat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      transparent: true,
      opacity: 0.22,
    });
    this.addFlatStrip(3.6, stopEdge - 0.75, 6.6, 1.5, zone2Mat, 0.012);

    // Clear old meshes and rebuild for current scenario
    for (const bundle of this.vehicleBundles.values()) {
      this.scene.remove(bundle.root);
    }
    this.vehicleBundles.clear();

    for (const pm of this.pedestrianMeshes.values()) {
      this.scene.remove(pm);
    }
    this.pedestrianMeshes.clear();

    this.spatialLabelsLayer.innerHTML = '';
    this.badgeElements.clear();
  }

  private addFlatStrip(
    x: number,
    z: number,
    widthX: number,
    lengthZ: number,
    material: THREE.Material,
    y = 0.01
  ): void {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(widthX, lengthZ), material);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, y, z);
    this.markingsGroup.add(m);
  }

  private setWeather(weather: WeatherCondition): void {
    if (weather === 'CLEAR_DAY') {
      this.scene.background = new THREE.Color(0x7dd3fc);
      this.scene.fog = new THREE.FogExp2(0x7dd3fc, 0.0045);
      if (this.rainLines) this.rainLines.visible = false;
    } else if (weather === 'DUSK') {
      this.scene.background = new THREE.Color(0x1e293b);
      this.scene.fog = new THREE.FogExp2(0x1e293b, 0.008);
      if (this.rainLines) this.rainLines.visible = false;
    } else {
      this.scene.background = new THREE.Color(0x475569);
      this.scene.fog = new THREE.FogExp2(0x475569, 0.018);
      if (this.rainLines) this.rainLines.visible = true;
    }
  }

  /**
   * Updates the player's rail-guided spline ribbon on the road surface.
   */
  public updatePlayerSplineGuide(
    player: VehicleState,
    lanesPerApproach: 1 | 2,
    hasPriority: boolean
  ): void {
    if (this.splineGuideMesh) {
      this.markingsGroup.remove(this.splineGuideMesh);
      this.splineGuideMesh = null;
    }

    const pts = sampleIntersectionPath(
      player.leg,
      player.lane,
      player.turnIntent,
      player.receivingLane,
      lanesPerApproach,
      24
    );

    const curvePts = pts.map((p) => new THREE.Vector3(p.x, 0.03, p.z));
    const curve = new THREE.CatmullRomCurve3(curvePts);
    const tubeGeo = new THREE.TubeGeometry(curve, 24, 0.22, 6, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color: hasPriority ? 0x10b981 : 0xf59e0b,
      transparent: true,
      opacity: 0.65,
    });
    this.splineGuideMesh = new THREE.Mesh(tubeGeo, tubeMat);
    this.markingsGroup.add(this.splineGuideMesh);
  }

  /**
   * Renders the 3D Tactical Replay trajectory ribbons and pulsing red/amber conflict ring.
   */
  public showReplayConflictVisuals(
    scenario: ScenarioDefinition,
    player: VehicleState,
    aiVehicles: VehicleState[],
    conflictPoint?: Vec2
  ): void {
    this.clearReplayConflictVisuals();

    const all = [player, ...aiVehicles];
    for (const v of all) {
      const pts = sampleIntersectionPath(
        v.leg,
        v.lane,
        v.turnIntent,
        v.receivingLane,
        scenario.lanesPerApproach,
        24
      );
      const curve = new THREE.CatmullRomCurve3(
        pts.map((p) => new THREE.Vector3(p.x, 0.08, p.z))
      );
      const color = v.isPlayer ? 0x38bdf8 : v.colorHex;
      const mesh = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 24, 0.28, 6, false),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8 })
      );
      this.replayConflictGroup.add(mesh);
    }

    if (conflictPoint) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.1, 1.85, 32),
        new THREE.MeshBasicMaterial({
          color: 0xef4444,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.9,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(conflictPoint.x, 0.12, conflictPoint.z);
      this.replayConflictGroup.add(ring);
    }
  }

  public clearReplayConflictVisuals(): void {
    while (this.replayConflictGroup.children.length > 0) {
      this.replayConflictGroup.remove(this.replayConflictGroup.children[0]);
    }
  }

  /**
   * Synchronizes all 3D vehicles, pedestrians, camera modes, and 2D projected spatial badges.
   */
  public renderFrame(
    dt: number,
    vehicles: VehicleState[],
    pedestrians: PedestrianState[],
    cameraMode: CameraMode,
    lookDirection: HeadLookDirection,
    player: VehicleState,
    lanesPerApproach: 1 | 2
  ): void {
    this.blinkerClockSec += dt;
    const blinkerOn = Math.floor(this.blinkerClockSec * 2.6) % 2 === 0;

    this.updatePlayerSplineGuide(player, lanesPerApproach, player.hasPriorityNow);

    // Animate rain if active
    if (this.rainLines && this.rainLines.visible) {
      this.rainLines.position.y = -((this.blinkerClockSec * 14) % 4);
    }

    // Sync vehicles
    for (const v of vehicles) {
      let bundle = this.vehicleBundles.get(v.id);
      if (!bundle) {
        bundle = this.createVehicleMeshBundle(v.kind, v.colorHex, v.isPlayer);
        this.vehicleBundles.set(v.id, bundle);
        this.scene.add(bundle.root);
      }

      bundle.root.position.set(v.worldX, 0, v.worldZ);
      bundle.root.rotation.y = v.headingRad;
      bundle.bodyGroup.rotation.x = -v.pitchRad; // Nose dive when braking

      // Hide player cockpit interior when in Chase or Overhead camera
      if (bundle.cockpitGroup) {
        bundle.cockpitGroup.visible = cameraMode === 'COCKPIT_POV';
      }

      // Update blinkers
      const leftActive = (v.turnSignal === 'LEFT' || v.turnSignal === 'HAZARD') && blinkerOn;
      const rightActive = (v.turnSignal === 'RIGHT' || v.turnSignal === 'HAZARD') && blinkerOn;
      (bundle.blinkerFL.material as THREE.MeshBasicMaterial).color.setHex(
        leftActive ? 0xfbbf24 : 0x332200
      );
      (bundle.blinkerRL.material as THREE.MeshBasicMaterial).color.setHex(
        leftActive ? 0xfbbf24 : 0x332200
      );
      (bundle.blinkerFR.material as THREE.MeshBasicMaterial).color.setHex(
        rightActive ? 0xfbbf24 : 0x332200
      );
      (bundle.blinkerRR.material as THREE.MeshBasicMaterial).color.setHex(
        rightActive ? 0xfbbf24 : 0x332200
      );

      // Update brake lights
      const brakeHex = v.brakeLightsOn ? 0xff1111 : 0x450a0a;
      (bundle.brakeLightL.material as THREE.MeshBasicMaterial).color.setHex(brakeHex);
      (bundle.brakeLightR.material as THREE.MeshBasicMaterial).color.setHex(brakeHex);

      // Update high-beam courtesy flash cones (Tier 7 Polite Waver)
      const flashVisible = v.highBeamFlashOn && blinkerOn;
      bundle.highBeamConeL.visible = flashVisible;
      bundle.highBeamConeR.visible = flashVisible;

      // Update Emergency lightbar & School Bus Stop Arm
      if (bundle.sirenBar) {
        bundle.sirenBar.visible = v.emergencyLightsOn;
        bundle.sirenBar.rotation.y += dt * 12;
      }
      if (bundle.stopArm) {
        bundle.stopArm.visible = v.schoolBusStopArmOut;
      }
    }

    // Sync pedestrians
    for (const p of pedestrians) {
      let pm = this.pedestrianMeshes.get(p.id);
      if (!pm) {
        pm = this.createPedestrianMesh();
        this.pedestrianMeshes.set(p.id, pm);
        this.scene.add(pm);
      }
      pm.visible = p.active;
      pm.position.set(p.worldX, 0, p.worldZ);
      pm.position.y = Math.abs(Math.sin(this.blinkerClockSec * 7)) * 0.08;
    }

    // Update Camera Pose
    this.updateCamera(dt, player, cameraMode, lookDirection);

    // Render 3D scene
    this.renderer.render(this.scene, this.camera);

    // Update 2D projected spatial badges (#1, #2, TIE)
    this.updateSpatialBadges(vehicles);
  }

  /**
   * Renders a historical snapshot from the 60-Second Replay Buffer during Stage 5.
   */
  public renderReplaySnapshot(
    dt: number,
    snapshot: ReplayFrameSnapshot
  ): void {
    this.blinkerClockSec += dt;
    const blinkerOn = Math.floor(this.blinkerClockSec * 2.6) % 2 === 0;

    for (const v of snapshot.vehicles) {
      let bundle = this.vehicleBundles.get(v.id);
      if (!bundle) {
        bundle = this.createVehicleMeshBundle(v.kind, v.colorHex, v.isPlayer);
        this.vehicleBundles.set(v.id, bundle);
        this.scene.add(bundle.root);
      }
      bundle.root.position.set(v.worldX, 0, v.worldZ);
      bundle.root.rotation.y = v.headingRad;
      bundle.bodyGroup.rotation.x = -v.pitchRad;
      if (bundle.cockpitGroup) bundle.cockpitGroup.visible = false;

      const leftActive = (v.turnSignal === 'LEFT' || v.turnSignal === 'HAZARD') && blinkerOn;
      const rightActive = (v.turnSignal === 'RIGHT' || v.turnSignal === 'HAZARD') && blinkerOn;
      (bundle.blinkerFL.material as THREE.MeshBasicMaterial).color.setHex(
        leftActive ? 0xfbbf24 : 0x332200
      );
      (bundle.blinkerRL.material as THREE.MeshBasicMaterial).color.setHex(
        leftActive ? 0xfbbf24 : 0x332200
      );
      (bundle.blinkerFR.material as THREE.MeshBasicMaterial).color.setHex(
        rightActive ? 0xfbbf24 : 0x332200
      );
      (bundle.blinkerRR.material as THREE.MeshBasicMaterial).color.setHex(
        rightActive ? 0xfbbf24 : 0x332200
      );

      const brakeHex = v.brakeLightsOn ? 0xff1111 : 0x450a0a;
      (bundle.brakeLightL.material as THREE.MeshBasicMaterial).color.setHex(brakeHex);
      (bundle.brakeLightR.material as THREE.MeshBasicMaterial).color.setHex(brakeHex);
    }

    for (const p of snapshot.pedestrians) {
      const pm = this.pedestrianMeshes.get(p.id);
      if (pm) {
        pm.visible = p.active;
        pm.position.set(p.worldX, 0, p.worldZ);
      }
    }

    // Overhead Tactical Camera
    this.camera.position.set(0, 34, 14);
    this.camera.lookAt(0, 0, 0);
    this.renderer.render(this.scene, this.camera);

    // Project spatial badges for replay
    this.updateSpatialBadgesFromReplay(snapshot);
  }

  private updateCamera(
    dt: number,
    player: VehicleState,
    cameraMode: CameraMode,
    lookDirection: HeadLookDirection
  ): void {
    const targetYaw =
      lookDirection === 'LEFT'
        ? 1.18 // ~68 degrees left head check
        : lookDirection === 'RIGHT'
        ? -1.18 // ~68 degrees right head check
        : 0;
    this.currentYawOffsetRad += (targetYaw - this.currentYawOffsetRad) * Math.min(1, dt * 11);

    if (cameraMode === 'TACTICAL_OVERHEAD') {
      this.camera.position.set(0, 34, 14);
      this.camera.lookAt(0, 0, 0);
      return;
    }

    if (cameraMode === 'CHASE_CAM') {
      // 3rd-Person Chase Camera behind and above the player vehicle
      const backDist = 8.8;
      const height = 4.6;
      const forwardX = -Math.sin(player.headingRad);
      const forwardZ = -Math.cos(player.headingRad);

      this.camera.position.set(
        player.worldX - forwardX * backDist,
        height,
        player.worldZ - forwardZ * backDist
      );

      const lookYaw = player.headingRad + this.currentYawOffsetRad * 0.55;
      const lookDirX = -Math.sin(lookYaw);
      const lookDirZ = -Math.cos(lookYaw);
      this.camera.lookAt(
        player.worldX + lookDirX * 12,
        1.0,
        player.worldZ + lookDirZ * 12
      );
      return;
    }

    // 1st-Person US Left-Hand-Drive (LHD) Cockpit POV:
    // Driver sits on the LEFT side of the cabin (-0.42m lateral offset from vehicle centerline)
    const forwardX = -Math.sin(player.headingRad);
    const forwardZ = -Math.cos(player.headingRad);
    const rightX = Math.cos(player.headingRad);
    const rightZ = -Math.sin(player.headingRad);

    const driverLeftOffset = -0.42; // LHD left seat!
    const driverForwardOffset = -0.15;
    const eyeHeight = 1.32;

    const camX =
      player.worldX + rightX * driverLeftOffset + forwardX * driverForwardOffset;
    const camZ =
      player.worldZ + rightZ * driverLeftOffset + forwardZ * driverForwardOffset;

    this.camera.position.set(camX, eyeHeight, camZ);

    const totalYaw = player.headingRad + this.currentYawOffsetRad;
    const lookX = camX - Math.sin(totalYaw) * 20;
    const lookZ = camZ - Math.cos(totalYaw) * 20;
    const lookY = eyeHeight - 0.55 - player.pitchRad * 14;

    this.camera.lookAt(lookX, lookY, lookZ);
  }

  private updateSpatialBadges(vehicles: VehicleState[]): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    for (const v of vehicles) {
      let el = this.badgeElements.get(v.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'spatial-badge';
        this.spatialLabelsLayer.appendChild(el);
        this.badgeElements.set(v.id, el);
      }

      if (v.isPlayer || !v.stopOrderBadge || v.zone === 'EXITED') {
        el.style.display = 'none';
        continue;
      }

      const worldPos = new THREE.Vector3(
        v.worldX,
        v.kind === 'BOX_TRUCK' || v.kind === 'SCHOOL_BUS' ? 3.5 : 2.3,
        v.worldZ
      );
      worldPos.project(this.camera);

      if (worldPos.z > 1.0) {
        el.style.display = 'none';
        continue;
      }

      const sx = (worldPos.x * 0.5 + 0.5) * width;
      const sy = (-worldPos.y * 0.5 + 0.5) * height;

      el.style.display = 'flex';
      el.style.left = `${sx}px`;
      el.style.top = `${sy}px`;

      const turnIcon =
        v.turnIntent === 'LEFT' ? '↰' : v.turnIntent === 'RIGHT' ? '↱' : '↑';
      el.textContent = `${v.stopOrderBadge} ${turnIcon}`;

      el.classList.toggle('priority-1', v.stopOrderBadge === '#1');
      el.classList.toggle('tie-badge', v.stopOrderBadge.includes('TIE'));
      el.classList.toggle(
        'hazard-badge',
        v.stopOrderBadge.includes('EMERG') ||
          v.stopOrderBadge.includes('FAST') ||
          v.stopOrderBadge.includes('STOP ARM')
      );
    }
  }

  private updateSpatialBadgesFromReplay(snapshot: ReplayFrameSnapshot): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    for (const v of snapshot.vehicles) {
      let el = this.badgeElements.get(v.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'spatial-badge';
        this.spatialLabelsLayer.appendChild(el);
        this.badgeElements.set(v.id, el);
      }

      const worldPos = new THREE.Vector3(v.worldX, 2.4, v.worldZ);
      worldPos.project(this.camera);

      if (worldPos.z > 1.0) {
        el.style.display = 'none';
        continue;
      }

      const sx = (worldPos.x * 0.5 + 0.5) * width;
      const sy = (-worldPos.y * 0.5 + 0.5) * height;

      el.style.display = 'flex';
      el.style.left = `${sx}px`;
      el.style.top = `${sy}px`;

      const timeStr =
        v.stopTimestamp !== null ? `T=${v.stopTimestamp.toFixed(2)}s` : 'NO STOP';
      el.textContent = `${v.isPlayer ? 'YOU' : v.label.split(' ')[0]} · ${
        v.stopOrderBadge ?? timeStr
      }`;
    }
  }

  private createVehicleMeshBundle(
    kind: VehicleKind,
    colorHex: number,
    isPlayer: boolean
  ): VehicleMeshBundle {
    const root = new THREE.Group();
    const bodyGroup = new THREE.Group();
    root.add(bodyGroup);

    const isTruck = kind === 'BOX_TRUCK';
    const isBus = kind === 'SCHOOL_BUS';
    const isCyclist = kind === 'CYCLIST';

    const width = isTruck || isBus ? 2.35 : isCyclist ? 0.55 : 1.92;
    const length = isBus ? 7.2 : isTruck ? 5.8 : isCyclist ? 1.75 : 4.35;
    const chassisHeight = isBus ? 2.4 : isTruck ? 2.85 : isCyclist ? 1.1 : 1.38;

    if (!isPlayer) {
      const chassisMat = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.35,
        metalness: 0.25,
      });

      if (isCyclist) {
        const rider = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 1.45, 0.9),
          chassisMat
        );
        rider.position.y = 0.85;
        rider.castShadow = true;
        bodyGroup.add(rider);
      } else {
        const lowerBody = new THREE.Mesh(
          new THREE.BoxGeometry(width, chassisHeight * 0.55, length),
          chassisMat
        );
        lowerBody.position.y = chassisHeight * 0.32;
        lowerBody.castShadow = true;
        bodyGroup.add(lowerBody);

        const cabinLength = isBus || isTruck ? length * 0.85 : length * 0.54;
        const cabin = new THREE.Mesh(
          new THREE.BoxGeometry(width * 0.9, chassisHeight * 0.5, cabinLength),
          new THREE.MeshStandardMaterial({
            color: isTruck ? 0xf8fafc : isBus ? 0xfacc15 : colorHex,
            roughness: 0.3,
          })
        );
        cabin.position.set(0, chassisHeight * 0.82, isTruck ? 0.35 : 0);
        cabin.castShadow = true;
        bodyGroup.add(cabin);
      }
    } else {
      // Player Exterior Mesh (visible in Chase Cam & Tactical Overhead Replay)
      const extChassis = new THREE.Mesh(
        new THREE.BoxGeometry(1.92, 0.85, 4.35),
        new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.3 })
      );
      extChassis.position.y = 0.5;
      bodyGroup.add(extChassis);

      // 1st-Person Left-Hand-Drive (LHD) Cockpit Interior (visible in COCKPIT_POV)
      const cockpitGroup = new THREE.Group();
      const dashMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
      const pillarMat = new THREE.MeshLambertMaterial({ color: 0x0f172a });

      // Hood visible out the front windshield
      const hood = new THREE.Mesh(
        new THREE.BoxGeometry(1.82, 0.12, 1.5),
        new THREE.MeshStandardMaterial({ color: 0x059669, roughness: 0.25 })
      );
      hood.position.set(0, 0.88, -1.55);
      cockpitGroup.add(hood);

      // Dashboard cowl
      const dash = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.36, 0.55), dashMat);
      dash.position.set(0, 0.88, -0.78);
      cockpitGroup.add(dash);

      // Left-Hand-Drive Steering Wheel (positioned at x = -0.42m on the LEFT side!)
      const steeringWheel = new THREE.Group();
      steeringWheel.position.set(-0.42, 1.04, -0.52);
      steeringWheel.rotation.x = 0.35;
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(0.17, 0.022, 10, 24),
        pillarMat
      );
      steeringWheel.add(rim);
      cockpitGroup.add(steeringWheel);

      // Slim A-Pillars (Left & Right)
      const leftPillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.045, 0.85, 8),
        pillarMat
      );
      leftPillar.position.set(-0.92, 1.32, -0.72);
      leftPillar.rotation.z = -0.18;
      cockpitGroup.add(leftPillar);

      const rightPillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.045, 0.85, 8),
        pillarMat
      );
      rightPillar.position.set(0.92, 1.32, -0.72);
      rightPillar.rotation.z = 0.18;
      cockpitGroup.add(rightPillar);

      bodyGroup.add(cockpitGroup);
      (bodyGroup as unknown as { _cockpit: THREE.Group; _wheel: THREE.Group })._cockpit =
        cockpitGroup;
      (bodyGroup as unknown as { _cockpit: THREE.Group; _wheel: THREE.Group })._wheel =
        steeringWheel;
    }

    // Blinkers (FL, FR, RL, RR) — Note: Vehicle forward in local space is -Z!
    const halfW = width * 0.46;
    const halfL = length * 0.5;
    const blinkerGeo = new THREE.SphereGeometry(0.13, 8, 8);
    const makeBlinker = (x: number, z: number) => {
      const m = new THREE.Mesh(
        blinkerGeo,
        new THREE.MeshBasicMaterial({ color: 0x332200 })
      );
      m.position.set(x, 0.65, z);
      bodyGroup.add(m);
      return m;
    };

    const blinkerFL = makeBlinker(-halfW, -halfL);
    const blinkerFR = makeBlinker(halfW, -halfL);
    const blinkerRL = makeBlinker(-halfW, halfL);
    const blinkerRR = makeBlinker(halfW, halfL);

    // Brake Lights (Rear Left & Rear Right at +halfL)
    const brakeGeo = new THREE.BoxGeometry(0.28, 0.14, 0.08);
    const brakeLightL = new THREE.Mesh(
      brakeGeo,
      new THREE.MeshBasicMaterial({ color: 0x450a0a })
    );
    brakeLightL.position.set(-halfW * 0.72, 0.72, halfL + 0.02);
    bodyGroup.add(brakeLightL);

    const brakeLightR = new THREE.Mesh(
      brakeGeo,
      new THREE.MeshBasicMaterial({ color: 0x450a0a })
    );
    brakeLightR.position.set(halfW * 0.72, 0.72, halfL + 0.02);
    bodyGroup.add(brakeLightR);

    // High-Beam Courtesy Flash Cones (for Tier 7 Polite Waver)
    const coneGeo = new THREE.ConeGeometry(0.65, 3.8, 12, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
    });
    const highBeamConeL = new THREE.Mesh(coneGeo, coneMat);
    highBeamConeL.rotation.x = Math.PI / 2;
    highBeamConeL.position.set(-halfW * 0.7, 0.65, -halfL - 1.9);
    highBeamConeL.visible = false;
    bodyGroup.add(highBeamConeL);

    const highBeamConeR = new THREE.Mesh(coneGeo, coneMat);
    highBeamConeR.rotation.x = Math.PI / 2;
    highBeamConeR.position.set(halfW * 0.7, 0.65, -halfL - 1.9);
    highBeamConeR.visible = false;
    bodyGroup.add(highBeamConeR);

    // Optional Emergency Lightbar (Police / Ambulance)
    let sirenBar: THREE.Group | undefined;
    if (kind === 'AMBULANCE' || kind === 'POLICE') {
      sirenBar = new THREE.Group();
      sirenBar.position.set(0, chassisHeight + 0.25, 0);
      const redOrb = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xef4444 })
      );
      redOrb.position.x = -0.35;
      const blueOrb = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x3b82f6 })
      );
      blueOrb.position.x = 0.35;
      sirenBar.add(redOrb, blueOrb);
      bodyGroup.add(sirenBar);
    }

    // Optional School Bus Red Octagonal Stop Arm (on the LEFT driver side of the bus!)
    let stopArm: THREE.Mesh | undefined;
    if (kind === 'SCHOOL_BUS') {
      stopArm = new THREE.Mesh(
        new THREE.BoxGeometry(0.75, 0.65, 0.08),
        new THREE.MeshBasicMaterial({ color: 0xef4444 })
      );
      stopArm.position.set(-width * 0.5 - 0.38, 1.35, -length * 0.2);
      bodyGroup.add(stopArm);
    }

    const customRefs = bodyGroup as unknown as {
      _cockpit?: THREE.Group;
      _wheel?: THREE.Group;
    };

    return {
      root,
      bodyGroup,
      blinkerFL,
      blinkerFR,
      blinkerRL,
      blinkerRR,
      brakeLightL,
      brakeLightR,
      highBeamConeL,
      highBeamConeR,
      sirenBar,
      stopArm,
      cockpitGroup: customRefs._cockpit,
      steeringWheel: customRefs._wheel,
    };
  }

  private createPedestrianMesh(): THREE.Group {
    const g = new THREE.Group();
    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.28, 1.15, 8),
      new THREE.MeshLambertMaterial({ color: 0x38bdf8 })
    );
    torso.position.y = 0.75;
    torso.castShadow = true;
    g.add(torso);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 10, 10),
      new THREE.MeshLambertMaterial({ color: 0xfde68a })
    );
    head.position.y = 1.52;
    g.add(head);
    return g;
  }
}
