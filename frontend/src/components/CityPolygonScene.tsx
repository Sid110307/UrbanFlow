import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

interface CityPolygonSceneProps {
  interactive?: boolean;
  className?: string;
}

export function CityPolygonScene({
  interactive = true,
  className = "",
}: CityPolygonSceneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Micro-HUD state for UI controls
  const [isAuto, setIsAuto] = useState(true);
  const [waterDepthCm, setWaterDepthCm] = useState(0);
  const [floodLevel, setFloodLevel] = useState<"clear" | "watch" | "warning" | "severe">("clear");

  // Mutable refs to communicate with the Three.js animation loop without re-triggering effects
  const controlsRef = useRef({
    auto: true,
    manualWater: 0,
    currentWater: 0,
    setHud: (depth: number, level: "clear" | "watch" | "warning" | "severe") => {
      setWaterDepthCm(depth);
      setFloodLevel(level);
    },
  });

  // Sync ref with React state
  useEffect(() => {
    controlsRef.current.auto = isAuto;
  }, [isAuto]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    let isDisposed = false;
    let animationFrameId: number;

    /* ---------- Helpers & Math ---------- */
    const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
    const sstep = (a: number, b: number, x: number) => {
      const t = clamp((x - a) / (b - a), 0, 1);
      return t * t * (3 - 2 * t);
    };
    const easeIO = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));
    const easeOut = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
    const fract = (x: number) => x - Math.floor(x);
    const damp = (dt: number, r: number) => 1 - Math.exp(-dt * r);
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    let seed = 11;
    const srand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    const V3 = THREE.Vector3;

    /* ---------- Renderer ---------- */
    const isCoarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isCoarse ? 1.75 : 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.localClippingEnabled = true;

    /* ---------- Scene & Camera ---------- */
    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-10, 10, 10, -10, -300, 600);
    cam.position.set(40, 41.2, 40);
    cam.lookAt(0, 1.2, 0);

    const ambient = new THREE.AmbientLight(0xffffff, 0.9);
    scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0xffffff, 0xe8f0fe, 0.9);
    scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfffaee, 1.3);
    sun.position.set(-6, 30, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(isCoarse ? 1024 : 2048, isCoarse ? 1024 : 2048);
    Object.assign(sun.shadow.camera, {
      left: -22,
      right: 22,
      top: 22,
      bottom: -22,
      near: 1,
      far: 80,
    });
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.03;
    scene.add(sun);

    const fill = new THREE.DirectionalLight(0xfff6ea, 0.75);
    fill.position.set(24, 20, -18);
    scene.add(fill);

    const topFill = new THREE.DirectionalLight(0xffffff, 0.5);
    topFill.position.set(0, 36, 0);
    scene.add(topFill);

    const world = new THREE.Group();
    scene.add(world);

    /* ---------- Materials & Mesh Helpers ---------- */
    const matCache = new Map<string, THREE.Material>();
    function M(color: number, o?: THREE.MeshStandardMaterialParameters) {
      const k = color + (o ? JSON.stringify(o) : "");
      let m = matCache.get(k);
      if (!m) {
        m = new THREE.MeshStandardMaterial({
          color,
          flatShading: true,
          roughness: 0.48,
          metalness: 0.04,
          ...o,
        });
        matCache.set(k, m);
      }
      return m;
    }

    function mk(
      geo: THREE.BufferGeometry,
      mat: THREE.Material | THREE.Material[],
      x = 0,
      y = 0,
      z = 0,
      parent: THREE.Object3D = world,
      cast = true,
      recv = true,
    ) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = cast;
      m.receiveShadow = recv;
      parent.add(m);
      return m;
    }

    const B = (
      w: number,
      h: number,
      d: number,
      c: number,
      x = 0,
      y = 0,
      z = 0,
      p?: THREE.Object3D,
      ca = true,
      re = true,
    ) => mk(new THREE.BoxGeometry(w, h, d), M(c), x, y, z, p, ca, re);

    const Cy = (
      rt: number,
      rb: number,
      h: number,
      s: number,
      c: number,
      x = 0,
      y = 0,
      z = 0,
      p?: THREE.Object3D,
      ca = true,
      re = true,
    ) => mk(new THREE.CylinderGeometry(rt, rb, h, s), M(c), x, y, z, p, ca, re);

    const Ic = (
      r: number,
      c: number,
      x = 0,
      y = 0,
      z = 0,
      p?: THREE.Object3D,
      ca = true,
      re = true,
    ) => mk(new THREE.IcosahedronGeometry(r, 0), M(c), x, y, z, p, ca, re);

    function tGeo(w: number, h: number, d: number, tx: number, tz: number) {
      const g = new THREE.BoxGeometry(w, h, d);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) > 0) {
          p.setX(i, p.getX(i) * tx);
          p.setZ(i, p.getZ(i) * tz);
        }
      }
      p.needsUpdate = true;
      return g;
    }

    /* ---------- Island Base ---------- */
    const C = {
      asphalt: 0x6a758d,
      earth: 0x9b90c9,
      earth2: 0x766a9e,
      curb: 0xf7f5fc,
      grass: 0x82d68c,
      dash: 0xffd559,
      white: 0xffffff,
    };

    B(24, 1.2, 24, C.earth, 0, -1.0, 0);
    B(24, 0.4, 24, C.asphalt, 0, -0.2, 0);

    {
      const m = mk(new THREE.CylinderGeometry(16.97, 4.5, 4.6, 4, 1), M(C.earth2), 0, -3.9, 0);
      m.rotation.y = Math.PI / 4;
    }

    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        B(9.5, 0.3, 9.5, C.curb, sx * 7.25, 0.15, sz * 7.25, world, false, true);
        B(8.5, 0.06, 8.5, C.grass, sx * 7.25, 0.33, sz * 7.25, world, false, true);
      }
    }

    const mark = (w: number, d: number, x: number, z: number, c: number) =>
      B(w, 0.02, d, c, x, 0.01, z, world, false, true);

    for (let k = 0; k < 6; k++) {
      const a = 5 + 1.2 * k;
      [a, -a].forEach((v) => {
        mark(0.7, 0.14, v, 0, C.dash);
        mark(0.14, 0.7, 0, v, C.dash);
      });
    }
    for (const sg of [-1, 1]) {
      for (let k = 0; k < 6; k++) {
        const o = -2 + 0.8 * k;
        mark(1.2, 0.4, sg * 3.4, o, C.white);
        mark(0.4, 1.2, o, sg * 3.4, C.white);
      }
    }

    /* ---------- Buildings & Windows ---------- */
    const wins: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number }> = [];
    const winMat = new THREE.MeshStandardMaterial({
      color: 0xafd4f7,
      emissive: 0xffdf80,
      emissiveIntensity: 0.35,
      flatShading: true,
      roughness: 0.3,
    });

    function building(
      x: number,
      z: number,
      w: number,
      d: number,
      h: number,
      color: number,
      o?: { tank?: [number, number] },
    ) {
      const g = new THREE.Group();
      g.position.set(x, 0.36, z);
      world.add(g);
      B(w, h, d, color, 0, h / 2, 0, g);
      B(w + 0.28, 0.22, d + 0.28, 0xffffff, 0, h + 0.11, 0, g);

      if (o?.tank) {
        Cy(0.5, 0.5, 0.7, 8, 0x6ea8ff, o.tank[0], h + 0.57, o.tank[1], g);
        Cy(0.52, 0.4, 0.14, 8, 0xdfe6f5, o.tank[0], h + 0.98, o.tank[1], g);
      }

      const nz = Math.max(1, Math.floor((d - 0.5) / 0.95));
      const nx = Math.max(1, Math.floor((w - 0.5) / 0.95));
      for (let y = 1.0; y + 0.7 < h; y += 1.2) {
        for (let i = 0; i < nz; i++) {
          wins.push({
            x: x + w / 2 + 0.02,
            y: 0.36 + y,
            z: z - d / 2 + ((i + 0.5) * d) / nz,
            sx: 0.06,
            sy: 0.62,
            sz: 0.5,
          });
        }
        for (let i = 0; i < nx; i++) {
          wins.push({
            x: x - w / 2 + ((i + 0.5) * w) / nx,
            y: 0.36 + y,
            z: z + d / 2 + 0.02,
            sx: 0.5,
            sy: 0.62,
            sz: 0.06,
          });
        }
      }
    }

    building(-8.4, -8.0, 3.4, 3.2, 7.8, 0xd0c2ff, { tank: [0.8, 0.6] });
    building(-4.9, -9.0, 2.6, 2.6, 4.6, 0xffd2b0);
    building(-9.4, -4.6, 2.8, 2.6, 3.4, 0xafd9ff);
    building(8.6, -8.4, 3.4, 3.4, 5.6, 0xffeab3);
    building(5.4, -9.6, 2.4, 2.4, 3.6, 0xffcde0);
    building(10.2, -4.3, 2.6, 2.2, 2.4, 0xbfeede);
    building(-4.6, 10.0, 2.6, 2.4, 3.4, 0xadeee0);
    building(-10.3, 4.6, 2.2, 2.2, 2.6, 0xffdeb3);

    {
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), winMat, wins.length);
      const dm = new THREE.Object3D();
      wins.forEach((w, i) => {
        dm.position.set(w.x, w.y, w.z);
        dm.scale.set(w.sx, w.sy, w.sz);
        dm.updateMatrix();
        im.setMatrixAt(i, dm.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
      world.add(im);
    }

    /* ---------- Trees, Bushes & Bus Shelter ---------- */
    const trees: Array<{ g: THREE.Group; ph: number }> = [];
    function tree(x: number, z: number, s: number, col: number) {
      const g = new THREE.Group();
      g.position.set(x, 0.36, z);
      g.scale.setScalar(s);
      world.add(g);
      Cy(0.1, 0.15, 0.8, 5, 0x8d6e58, 0, 0.4, 0, g);
      const a = Ic(0.75, col, 0, 1.25, 0, g);
      a.scale.y = 1.15;
      Ic(0.5, col, 0.15, 1.9, 0.05, g);
      trees.push({ g, ph: srand() * 6.28 });
    }

    [
      [-5.8, -5.8, 1.0, 0x6cd88f],
      [5.6, -6.2, 1.1, 0x5bc87e],
      [-4.8, 6.0, 1.0, 0x82e29e],
      [-11, 8.6, 0.9, 0x5bc87e],
      [8.4, 8.6, 1.5, 0x6cd88f],
      [3.9, 7.6, 1.1, 0x82e29e],
      [11, 3.8, 0.9, 0x5bc87e],
      [10.4, -11, 0.9, 0x6cd88f],
      [-11, -11, 0.9, 0x82e29e],
    ].forEach((t) => tree(t[0], t[1], t[2], t[3]));

    [[-6.3, 6.5], [-9.8, 10], [11, 11], [4.2, 11]].forEach((b) =>
      Ic(0.42, 0x6cd88f, b[0], 0.55, b[1]),
    );

    {
      const g = new THREE.Group();
      g.position.set(5.6, 0.36, 4.4);
      world.add(g);
      [[-1, -0.45], [1, -0.45], [-1, 0.45], [1, 0.45]].forEach((p) =>
        Cy(0.05, 0.05, 1.7, 5, 0x5b6479, p[0], 0.85, p[1], g),
      );
      B(2.4, 0.1, 1.2, 0x3b82f6, 0, 1.75, 0, g);
      B(2.2, 1.0, 0.05, 0xb6def7, 0, 1.1, -0.45, g);
      B(1.6, 0.08, 0.4, 0x9a7b5c, 0, 0.5, -0.2, g);
    }

    /* ---------- Bengaluru Signboard ---------- */
    const SIGN_KN = "ನಮ್ಮ ಬೆಂಗಳೂರು";
    const SIGN_EN = "NAMMA BENGALURU";
    const signCanvas = document.createElement("canvas");
    signCanvas.width = 1024;
    signCanvas.height = 512;
    const signTex = new THREE.CanvasTexture(signCanvas);
    signTex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() || 1);

    function drawSign() {
      const ctx = signCanvas.getContext("2d");
      if (!ctx) return;
      const rr = (x: number, y: number, w: number, h: number, r: number) => {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
      };

      ctx.clearRect(0, 0, 1024, 512);
      rr(0, 0, 1024, 512, 56);
      ctx.fillStyle = "#fff8ea";
      ctx.fill();

      ctx.save();
      rr(16, 16, 992, 480, 44);
      ctx.clip();
      const g1 = ctx.createLinearGradient(0, 0, 0, 300);
      g1.addColorStop(0, "#ffdc5c");
      g1.addColorStop(1, "#ffc21a");
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, 1024, 300);

      const g2 = ctx.createLinearGradient(0, 300, 0, 512);
      g2.addColorStop(0, "#dc2b3e");
      g2.addColorStop(1, "#b81f30");
      ctx.fillStyle = g2;
      ctx.fillRect(0, 300, 1024, 212);
      ctx.fillStyle = "#fff8ea";
      ctx.fillRect(0, 296, 1024, 8);
      ctx.restore();

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const fit = (t: string, f: (s: number) => string, maxW: number, size: number) => {
        let s = size;
        ctx.font = f(s);
        while (ctx.measureText(t).width > maxW && s > 24) {
          s -= 4;
          ctx.font = f(s);
        }
      };

      ctx.fillStyle = "#a4101f";
      fit(SIGN_KN, (s) => `800 ${s}px "Noto Sans Kannada", "Nirmala UI", sans-serif`, 880, 150);
      ctx.fillText(SIGN_KN, 512, 158);

      ctx.fillStyle = "#ffe27a";
      fit(SIGN_EN, (s) => `800 ${s}px "Manrope", sans-serif`, 880, 92);
      ctx.fillText(SIGN_EN, 512, 400);

      signTex.needsUpdate = true;
    }

    drawSign();
    if (document.fonts && document.fonts.load) {
      Promise.race([
        Promise.all([
          document.fonts.load('800 60px "Noto Sans Kannada"', SIGN_KN),
          document.fonts.load('800 60px "Manrope"', SIGN_EN),
        ]),
        new Promise((r) => setTimeout(r, 2500)),
      ])
        .then(drawSign)
        .catch(() => {});
    }

    {
      const g = new THREE.Group();
      g.position.set(-8.2, 0.36, 8.2);
      g.rotation.y = Math.PI / 4;
      world.add(g);
      [-2.4, 2.4].forEach((x) => {
        B(0.28, 2.0, 0.28, 0x2b2f42, x, 1.0, 0, g);
        B(0.7, 0.2, 0.7, 0xcfc8e2, x, 0.1, 0, g);
      });
      B(6.9, 3.5, 0.3, 0x2b2f42, 0, 3.65, 0, g);
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(6.6, 3.3),
        new THREE.MeshBasicMaterial({ map: signTex, transparent: true }),
      );
      face.position.set(0, 3.65, 0.16);
      g.add(face);
    }

    /* ---------- Utility Poles & Wires ---------- */
    function buildPole(x: number, z: number, withTr: boolean) {
      const g = new THREE.Group();
      g.position.set(x, 0.3, z);
      world.add(g);
      Cy(0.1, 0.15, 4.6, 6, 0x8d6e58, 0, 2.3, 0, g);
      B(0.14, 0.13, 1.5, 0x6e5545, 0, 4.15, 0, g);
      [-0.6, 0, 0.6].forEach((zz) => Cy(0.045, 0.06, 0.22, 6, 0xe4e9f3, 0, 4.34, zz, g));
      if (withTr) {
        Cy(0.3, 0.3, 0.66, 8, 0x7f93a3, 0.32, 3.35, 0, g);
        Cy(0.32, 0.32, 0.08, 8, 0x5d6f7d, 0.32, 3.7, 0, g);
      }
      return g;
    }

    const poleA = buildPole(3.4, -3.4, true);
    buildPole(-3.4, -3.4, false);
    const WIRE_LEN = 6.95;
    const WN = 12;
    const wireA = [new V3(0, 4.45, -0.6), new V3(0, 4.45, 0), new V3(0, 4.45, 0.6)];
    const wireB = [new V3(-3.4, 4.75, -4.0), new V3(-3.4, 4.75, -3.4), new V3(-3.4, 4.75, -2.8)];
    const wires = wireA.map(() =>
      Array.from({ length: WN }, () =>
        mk(new THREE.BoxGeometry(0.05, 0.05, 1), M(0x20242f), 0, 0, 0, world, false, false),
      ),
    );

    const Zaxis = new V3(0, 0, 1);
    const tmpA = new V3();
    const tmpP = new V3();
    const tmpQ = new V3();
    const tmpD = new V3();

    function updateWires() {
      poleA.updateMatrix();
      wireA.forEach((la, i) => {
        tmpA.copy(la).applyMatrix4(poleA.matrix);
        const b = wireB[i];
        const c = tmpA.distanceTo(b);
        const sag = c < WIRE_LEN ? Math.sqrt((3 * c * (WIRE_LEN - c)) / 8) : 0;
        for (let k = 0; k < WN; k++) {
          const t0 = k / WN;
          const t1 = (k + 1) / WN;
          tmpP.lerpVectors(tmpA, b, t0);
          tmpP.y -= sag * 4 * t0 * (1 - t0);
          tmpQ.lerpVectors(tmpA, b, t1);
          tmpQ.y -= sag * 4 * t1 * (1 - t1);
          tmpD.subVectors(tmpQ, tmpP);
          const len = tmpD.length() || 0.001;
          const s = wires[i][k];
          s.position.copy(tmpP).addScaledVector(tmpD, 0.5);
          s.quaternion.setFromUnitVectors(Zaxis, tmpD.multiplyScalar(1 / len));
          s.scale.z = len;
        }
      });
    }

    /* ---------- Traffic Signals ---------- */
    const sigMat = (c: number) =>
      new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.05, flatShading: true });
    const sig = {
      x: { r: sigMat(0xff4d4d), y: sigMat(0xffc933), g: sigMat(0x35d07f), st: 0, t: 0, li: { r: 0, y: 0, g: 0 } },
      z: { r: sigMat(0xff4d4d), y: sigMat(0xffc933), g: sigMat(0x35d07f), st: 0, t: 0, li: { r: 0, y: 0, g: 0 } },
    };

    function buildSignal(x: number, z: number) {
      const g = new THREE.Group();
      g.position.set(x, 0.36, z);
      world.add(g);
      Cy(0.08, 0.11, 2.9, 6, 0x39415a, 0, 1.45, 0, g);
      B(0.5, 1.25, 0.5, 0x1f2536, 0, 3.15, 0, g);
      (["x", "z"] as const).forEach((ax) =>
        ([["r", 0.38], ["y", 0], ["g", -0.38]] as const).forEach(([l, yOffset]) =>
          mk(
            new THREE.SphereGeometry(0.13, 8, 6),
            sig[ax][l],
            ax === "x" ? 0.27 : 0,
            3.15 + yOffset,
            ax === "z" ? 0.27 : 0,
            g,
            false,
            false,
          ),
        ),
      );
    }
    buildSignal(-3.4, 3.4);
    buildSignal(3.4, 3.4);

    /* ---------- Namma Metro Viaduct & Train ---------- */
    [-8, 0, 8].forEach((x) => {
      Cy(0.55, 0.72, 5.0, 8, 0x9b70f8, x, 2.5, -11.3);
      B(3.0, 0.5, 1.7, 0x8347e8, x, 5.25, -11.3);
    });
    B(24.4, 0.5, 1.6, 0xede6ff, 0, 5.75, -11.3);
    [-0.75, 0.75].forEach((o) => B(24.4, 0.28, 0.14, 0xc7b0ff, 0, 6.14, -11.3 + o, world, false));
    [-0.35, 0.35].forEach((o) => B(24.4, 0.06, 0.08, 0x646985, 0, 6.03, -11.3 + o, world, false, false));

    const clipBase = [new THREE.Plane(new V3(1, 0, 0), 12.2), new THREE.Plane(new V3(-1, 0, 0), 12.2)];
    const clipPl = [new THREE.Plane(), new THREE.Plane()];
    const tMat = (c: number) =>
      new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.6, clippingPlanes: clipPl });
    const train = new THREE.Group();
    train.position.set(-30, 6.06, -11.3);
    world.add(train);

    [-2.65, 0, 2.65].forEach((x, i) => {
      const add = (w: number, h: number, d: number, c: number, y: number) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), tMat(c));
        m.position.set(x, y, 0);
        train.add(m);
        return m;
      };
      add(2.5, 1.0, 1.2, 0xfcfbff, 0.55);
      add(2.52, 0.22, 1.22, 0x8b5cf6, 0.3);
      add(2.3, 0.34, 1.23, 0x3a4563, 0.78);
      if (i === 2) {
        const h = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.16, 0.7),
          new THREE.MeshBasicMaterial({ color: 0xfff2b0 }),
        );
        h.material.clippingPlanes = clipPl;
        h.position.set(x + 1.26, 0.5, 0);
        train.add(h);
      }
    });

    /* ---------- Clouds ---------- */
    const cloudMat = new THREE.MeshStandardMaterial({ color: 0xdfe7f7, flatShading: true, roughness: 1 });
    function cloud(x: number, y: number, z: number, s: number) {
      const g = new THREE.Group();
      g.position.set(x, y, z);
      world.add(g);
      [
        [0, 0, 0, 1.6],
        [-1.7, -0.25, 0.3, 1.2],
        [1.8, -0.2, -0.2, 1.3],
        [-0.4, 0.5, -0.9, 1.15],
        [0.8, 0.35, 1.0, 1.1],
        [-3.0, -0.45, 0.2, 0.9],
        [3.1, -0.4, 0.3, 0.9],
      ].forEach((d) => {
        const m = mk(new THREE.IcosahedronGeometry(d[3], 0), cloudMat, d[0], d[1], d[2], g, false, false);
        m.scale.y = 0.78;
      });
      return { g, s, y };
    }
    const clouds = [cloud(-9, 10, 6, 1.35), cloud(10, 11, -7, 1.15)];

    /* ---------- Vehicles & Floaters ---------- */
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xfff4c8,
      emissive: 0xffe6a0,
      emissiveIntensity: 0.4,
      flatShading: true,
    });
    const tailMat = new THREE.MeshStandardMaterial({
      color: 0xff4b4b,
      emissive: 0xff2a2a,
      emissiveIntensity: 0.35,
      flatShading: true,
    });
    const glass = M(0x26324f, { roughness: 0.35 });

    function addWheel(g: THREE.Group, x: number, z: number, r: number, w: number) {
      const wg = new THREE.Group();
      wg.position.set(x, r, z);
      g.add(wg);
      mk(new THREE.CylinderGeometry(r, r, w, 10).rotateX(Math.PI / 2), M(0x252a38), 0, 0, 0, wg);
      mk(
        new THREE.CylinderGeometry(r * 0.5, r * 0.5, w + 0.02, 6).rotateX(Math.PI / 2),
        M(0xd8dcea),
        0,
        0,
        0,
        wg,
        false,
        false,
      );
      wg.userData.r = r;
      return wg;
    }

    function lights(g: THREE.Group, L: number, W: number, y: number, sp: number) {
      [-1, 1].forEach((sd) => {
        mk(
          new THREE.CylinderGeometry(0.13, 0.13, 0.06, 8).rotateZ(Math.PI / 2),
          headMat,
          L / 2 + 0.01,
          y,
          sd * W * sp,
          g,
          false,
          false,
        );
        mk(new THREE.BoxGeometry(0.05, 0.12, 0.24), tailMat, -L / 2 - 0.005, y + 0.01, sd * W * sp, g, false, false);
      });
    }

    function buildCar(o: { len: number; wid: number; color: number; cab: number; cabX: number; roof?: number; taxi?: boolean }) {
      const g = new THREE.Group();
      g.rotation.order = "YXZ";
      const L = o.len;
      const W = o.wid;
      const wheels: THREE.Group[] = [];
      mk(new THREE.BoxGeometry(L, 0.5, W), M(o.color), 0, 0.5, 0, g);
      mk(new THREE.BoxGeometry(L + 0.02, 0.14, W + 0.02), M(0x2a3043), 0, 0.32, 0, g, false);
      mk(
        tGeo(o.cab, 0.48, W * 0.84, 0.7, 0.74),
        [glass, glass, M(o.roof || o.color), M(o.color), glass, glass],
        o.cabX,
        0.99,
        0,
        g,
      );
      lights(g, L, W, 0.55, 0.3);
      [L * 0.32, -L * 0.32].forEach((x) =>
        [W / 2, -W / 2].forEach((z) => wheels.push(addWheel(g, x, z, 0.3, 0.24))),
      );
      if (o.taxi) B(0.42, 0.14, 0.22, 0xffffff, o.cabX, 1.32, 0, g);
      return { g, wheels, len: L, wid: W };
    }

    function buildBus() {
      const g = new THREE.Group();
      g.rotation.order = "YXZ";
      const L = 3.9;
      const W = 1.36;
      const wheels: THREE.Group[] = [];
      B(L, 1.05, W, 0x3b82f6, 0, 0.83, 0, g);
      B(L * 0.94, 0.42, W + 0.02, 0x1e2a48, 0, 1.06, 0, g, false);
      B(L + 0.02, 0.1, W + 0.03, 0xffffff, 0, 0.62, 0, g, false);
      B(L + 0.04, 0.12, W + 0.04, 0xffffff, 0, 1.41, 0, g);
      B(0.04, 0.5, W * 0.86, 0x26324f, L / 2 + 0.005, 1.05, 0, g, false);
      B(0.03, 0.16, 0.7, 0xffd166, L / 2 + 0.01, 1.3, 0, g, false);
      lights(g, L, W, 0.55, 0.36);
      [1.3, -1.3].forEach((x) => [W / 2, -W / 2].forEach((z) => wheels.push(addWheel(g, x, z, 0.34, 0.26))));
      return { g, wheels, len: L, wid: W };
    }

    function buildAuto() {
      const g = new THREE.Group();
      g.rotation.order = "YXZ";
      const wheels: THREE.Group[] = [];
      const green = 0x27ae60;
      B(1.35, 0.4, 1.02, green, -0.1, 0.55, 0, g);
      mk(tGeo(0.75, 0.45, 0.8, 0.7, 0.8), M(green), 0.8, 0.55, 0, g);
      B(0.55, 0.3, 0.86, 0x4a3b4f, -0.35, 0.85, 0, g);
      B(0.1, 0.5, 0.86, 0x4a3b4f, -0.62, 1.1, 0, g);
      B(1.45, 0.1, 1.1, 0xffcb2b, -0.1, 1.62, 0, g);
      [[0.5, -0.5], [0.5, 0.5], [-0.7, -0.5], [-0.7, 0.5]].forEach((p) =>
        Cy(0.035, 0.035, 0.8, 5, 0x3a455a, p[0], 1.2, p[1], g, false, false),
      );
      mk(
        new THREE.BoxGeometry(0.04, 0.7, 0.9),
        M(0xbfe2ff, { transparent: true, opacity: 0.55 }),
        0.58,
        1.12,
        0,
        g,
        false,
        false,
      );
      mk(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 8).rotateZ(Math.PI / 2), headMat, 1.17, 0.68, 0, g, false, false);
      B(0.05, 0.12, 0.24, 0xff4b4b, -0.78, 0.6, 0, g, false, false);
      wheels.push(
        addWheel(g, -0.5, 0.58, 0.27, 0.22),
        addWheel(g, -0.5, -0.58, 0.27, 0.22),
        addWheel(g, 0.95, 0, 0.25, 0.22),
      );
      return { g, wheels, len: 2.1, wid: 1.2 };
    }

    const buildCone = () => {
      const g = new THREE.Group();
      g.rotation.order = "YXZ";
      B(0.7, 0.06, 0.7, 0x2b2f42, 0, 0.03, 0, g);
      Cy(0.06, 0.28, 0.75, 8, 0xff7a2f, 0, 0.4, 0, g);
      Cy(0.14, 0.18, 0.12, 8, 0xffffff, 0, 0.36, 0, g, false);
      return g;
    };
    const buildBarrel = () => {
      const g = new THREE.Group();
      g.rotation.order = "YXZ";
      Cy(0.32, 0.32, 0.85, 10, 0x2f7de1, 0, 0.43, 0, g);
      [0.2, 0.65].forEach((y) => Cy(0.335, 0.335, 0.06, 10, 0x1d4f9c, 0, y, 0, g, false));
      return g;
    };
    const buildBox = () => {
      const g = new THREE.Group();
      g.rotation.order = "YXZ";
      B(0.75, 0.6, 0.75, 0xd9a86c, 0, 0.3, 0, g);
      B(0.14, 0.02, 0.76, 0xf0d2a0, 0, 0.61, 0, g, false);
      return g;
    };
    const buildBin = () => {
      const g = new THREE.Group();
      g.rotation.order = "YXZ";
      Cy(0.3, 0.26, 0.75, 8, 0x2e9e6a, 0, 0.38, 0, g);
      Cy(0.33, 0.33, 0.1, 8, 0x1f7a50, 0, 0.8, 0, g);
      return g;
    };

    /* ---------- Floaters, Cars & Timeline ---------- */
    interface Floater {
      g: THREE.Group;
      wheels?: THREE.Group[];
      path?: { axis: "x" | "z"; dir: number; lane: number };
      ustop?: number;
      u0?: number;
      u?: number;
      thr: number;
      draft: number;
      r: number;
      sp: number;
      maxD: number;
      tilt: number;
      sc: number;
      spin: number;
      fl: number;
      floating: boolean;
      off: { x: number; z: number };
      vel: { x: number; z: number };
      yaw: number;
      ph: number;
      baseY: number;
      byaw: number;
      bx: number;
      bz: number;
      dd: { x: number; z: number };
      wake: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
    }

    const CYC = { calm: 4.5, rise: 9.5, hold: 5.5, recede: 5, rest: 1.5, total: 26 };
    const pAuto = (t: number) => {
      if (t < CYC.calm) return 0;
      t -= CYC.calm;
      if (t < CYC.rise) return easeIO(t / CYC.rise);
      t -= CYC.rise;
      if (t < CYC.hold) return 1;
      t -= CYC.hold;
      if (t < CYC.recede) return 1 - easeIO(t / CYC.recede);
      return 0;
    };
    const sfOf = (pVal: number) => 1 - sstep(0.03, 0.26, pVal);

    let Dtotal = 0;
    let Dstop = 0;
    for (let t = 0, st = 1 / 240; t < CYC.total; t += st) {
      const v = sfOf(pAuto(t)) * st;
      Dtotal += v;
      if (t < CYC.calm + CYC.rise + CYC.hold) Dstop += v;
    }
    const S_STOP = Dstop / Dtotal;
    const LANE = 24;

    const floaters: Floater[] = [];
    const cars: Floater[] = [];
    const PATH = {
      E1: { axis: "x" as const, dir: 1, lane: -1.25 },
      E2: { axis: "x" as const, dir: -1, lane: 1.25 },
      N1: { axis: "z" as const, dir: 1, lane: 1.25 },
      N2: { axis: "z" as const, dir: -1, lane: -1.25 },
    };

    const ringGeo = new THREE.RingGeometry(0.86, 1, 32);
    const wakeMat = () =>
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });

    function addFloater(o: Partial<Floater> & { g: THREE.Group; thr: number; draft: number; r: number; dd: { x: number; z: number } }) {
      const wake = new THREE.Mesh(ringGeo, wakeMat());
      wake.rotation.x = -Math.PI / 2;
      wake.visible = false;
      wake.renderOrder = 3;
      world.add(wake);

      const f: Floater = {
        fl: 0,
        floating: false,
        off: { x: 0, z: 0 },
        vel: { x: 0, z: 0 },
        yaw: 0,
        ph: srand() * 6.28,
        baseY: 0,
        byaw: 0,
        bx: 0,
        bz: 0,
        tilt: 1,
        sc: 1,
        spin: 0.35,
        sp: 0.14,
        maxD: 1.7,
        wake,
        ...o,
      };

      world.add(f.g);
      f.g.traverse((m) => {
        if ((m as THREE.Mesh).isMesh) {
          m.castShadow = true;
          m.receiveShadow = true;
        }
      });
      floaters.push(f);
      if (f.path && f.ustop !== undefined) {
        f.u0 = fract(f.ustop - S_STOP);
        cars.push(f);
      }
      return f;
    }

    function addVehicle(
      b: { g: THREE.Group; wheels: THREE.Group[]; len: number; wid: number },
      path: keyof typeof PATH,
      ustop: number,
      thr: number,
      o: { dd: [number, number]; maxD?: number },
    ) {
      const dd = o.dd;
      const n = Math.hypot(dd[0], dd[1]);
      addFloater({
        g: b.g,
        wheels: b.wheels,
        path: PATH[path],
        ustop,
        thr,
        draft: thr - 0.14,
        r: b.len * 0.42,
        sp: 0.14,
        maxD: o.maxD ?? 1.7,
        dd: { x: dd[0] / n, z: dd[1] / n },
      });
    }

    addVehicle(
      buildCar({ len: 2.0, wid: 1.15, color: 0xff5454, cab: 1.25, cabX: -0.1 }),
      "E1",
      0.7,
      0.55,
      { dd: [0.9, 0.4] },
    );
    addVehicle(
      buildCar({ len: 2.5, wid: 1.2, color: 0xffca28, cab: 1.3, cabX: -0.15, taxi: true }),
      "E2",
      0.74,
      0.6,
      { dd: [-0.6, 0.8] },
    );
    addVehicle(buildAuto(), "N1", 0.26, 0.5, { dd: [-0.7, -0.5] });
    addVehicle(buildBus(), "N2", 0.22, 0.85, { dd: [0.6, 0.5], maxD: 1.3 });
    addVehicle(
      buildCar({ len: 1.9, wid: 1.1, color: 0xffffff, roof: 0xe2e7f5, cab: 1.2, cabX: -0.08 }),
      "N1",
      0.13,
      0.52,
      { dd: [0.9, -0.3] },
    );

    function addDebris(g: THREE.Group, x: number, z: number, baseY: number, thr: number, dd: [number, number], r: number) {
      g.position.set(x, baseY, z);
      addFloater({
        g,
        bx: x,
        bz: z,
        baseY,
        thr,
        draft: thr - 0.1,
        r,
        dd: { x: dd[0], z: dd[1] },
        sp: 0.26,
        maxD: 2.6,
        tilt: 1.6,
        byaw: srand() * 6.28,
      });
    }
    addDebris(buildCone(), 0.1, 4.9, 0, 0.16, [-0.5, 0.6], 0.4);
    addDebris(buildBox(), -6, -3.4, 0.36, 0.5, [0.6, 0.3], 0.45);
    addDebris(buildBarrel(), 9, 3.2, 0.36, 0.62, [-0.7, -0.4], 0.4);
    addDebris(buildBin(), -5.6, 3.3, 0.36, 0.68, [0.7, -0.2], 0.4);

    /* ---------- Water Simulation ---------- */
    const WS = 23.7;
    const waterGrp = new THREE.Group();
    world.add(waterGrp);
    const sideMat = new THREE.MeshStandardMaterial({
      color: 0x087f75,
      transparent: true,
      opacity: 0.45,
      roughness: 0.25,
      flatShading: true,
      depthWrite: false,
    });
    const hiddenMat = new THREE.MeshBasicMaterial({ visible: false });
    const waterBody = new THREE.Mesh(
      new THREE.BoxGeometry(WS, 1, WS).translate(0, 0.5, 0),
      [sideMat, sideMat, hiddenMat, hiddenMat, sideMat, sideMat],
    );
    waterBody.renderOrder = 1;
    waterGrp.add(waterBody);

    const topGeo = new THREE.PlaneGeometry(WS, WS, 22, 22).rotateX(-Math.PI / 2);
    const topBase = Float32Array.from(topGeo.attributes.position.array);
    const waterTop = new THREE.Mesh(
      topGeo,
      new THREE.MeshStandardMaterial({
        color: 0x22d3ee,
        transparent: true,
        opacity: 0.65,
        roughness: 0.18,
        metalness: 0.1,
        flatShading: true,
        depthWrite: false,
      }),
    );
    waterTop.renderOrder = 2;
    waterGrp.add(waterTop);
    waterGrp.visible = false;

    /* ---------- Rain, Ripples & Particles ---------- */
    const RN = 260;
    const rainPos = new Float32Array(RN * 6);
    const rainY = new Float32Array(RN);
    const rainX = new Float32Array(RN);
    const rainZ = new Float32Array(RN);
    for (let i = 0; i < RN; i++) {
      rainX[i] = rnd(-10, 10);
      rainZ[i] = rnd(-10, 10);
      rainY[i] = rnd(0, 10);
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
    const rainMat = new THREE.LineBasicMaterial({ color: 0x5ea4f8, transparent: true, opacity: 0.6 });
    const rain = new THREE.LineSegments(rainGeo, rainMat);
    rain.frustumCulled = false;
    rain.renderOrder = 4;
    world.add(rain);

    const rip = Array.from({ length: 22 }, () => {
      const m = new THREE.Mesh(ringGeo, wakeMat());
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      m.renderOrder = 3;
      world.add(m);
      return { m, age: 0, life: 0, max: 1 };
    });
    function ripple(x: number, y: number, z: number, max: number, life: number) {
      const r = rip.find((q) => q.life <= 0);
      if (!r) return;
      r.age = 0;
      r.life = life;
      r.max = max;
      r.m.position.set(x, y, z);
      r.m.visible = true;
    }

    const parts = Array.from({ length: 70 }, () => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), new THREE.MeshBasicMaterial({ color: 0xffe27a }));
      m.visible = false;
      world.add(m);
      return { m, v: new V3(), life: 0, max: 1, g: 9 };
    });
    function emit(x: number, y: number, z: number, n: number, spd: number, up: number, col: number, life: number, grav: number) {
      let c = 0;
      for (const p of parts) {
        if (p.life > 0) continue;
        p.life = p.max = life * (0.6 + Math.random() * 0.7);
        p.m.position.set(x, y, z);
        const a = Math.random() * 6.283;
        const r = spd * (0.4 + Math.random());
        p.v.set(Math.cos(a) * r, up * (0.5 + Math.random()), Math.sin(a) * r);
        p.g = grav;
        p.m.material.color.setHex(col);
        p.m.visible = true;
        if (++c >= n) break;
      }
    }

    const flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 10, 8),
      new THREE.MeshBasicMaterial({
        color: 0xfff2a8,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    flash.renderOrder = 5;
    world.add(flash);

    /* ---------- Ambient Shadow Blob ---------- */
    const blobCv = document.createElement("canvas");
    blobCv.width = blobCv.height = 128;
    {
      const c = blobCv.getContext("2d");
      if (c) {
        const g = c.createRadialGradient(64, 64, 4, 64, 64, 62);
        g.addColorStop(0, "rgba(23, 59, 54, 0.16)");
        g.addColorStop(1, "rgba(23, 59, 54, 0)");
        c.fillStyle = g;
        c.fillRect(0, 0, 128, 128);
      }
    }
    const blob = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(blobCv),
        transparent: true,
        depthWrite: false,
        opacity: 0.22,
      }),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = -9;
    blob.renderOrder = -1;
    scene.add(blob);

    /* ---------- Sun / Moon Orb ---------- */
    const orbG = new THREE.Group();
    orbG.position.set(-14.5, 6.6, 3.6);
    world.add(orbG);
    orbG.lookAt(new V3(40, 41.2, 40));
    const orbMat = new THREE.MeshBasicMaterial({ color: 0xffd45a });
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 1), orbMat);
    orbG.add(orb);
    const haloMat = new THREE.MeshBasicMaterial({ color: 0xffe8a0, transparent: true, opacity: 0.3, depthWrite: false });
    const halo = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4, 1), haloMat);
    orbG.add(halo);
    const rays = new THREE.Group();
    orbG.add(rays);
    const rayMat = new THREE.MeshBasicMaterial({ color: 0xffc94a });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.85, 0.1), rayMat);
      r.position.set(Math.cos(a) * 3.2, Math.sin(a) * 3.2, 0);
      r.rotation.z = a - Math.PI / 2;
      rays.add(r);
    }

    /* ---------- Animation Engine State ---------- */
    let tc = -1.0;
    let p = 0;
    let pPrev = 0;
    let dpS = 0;
    let s = -1.0 / Dtotal;
    let tAbs = 0;
    let rainA = 0;
    let storm = 0;
    let intro = 0;
    let hudTimer = 0;
    const POLE_MAX = 1.36;
    const LMAX = 1.5;
    const pole = { s: "up" as "up" | "spark" | "fall" | "down" | "reset", a: 0, v: 0, t: 0, sp: 0, splash: false, crackle: 0 };
    const trLocal = new V3(0.32, 3.35, 0);
    const tipLocal = new V3(0, 4.6, 0);
    const trW = new V3();
    const tipW = new V3();

    function updateFloaters(dt: number, L: number, t: number) {
      for (const f of floaters) {
        if (!f.floating && L > f.thr) f.floating = true;
        else if (f.floating && L < f.thr - 0.1) f.floating = false;
        f.fl += ((f.floating ? 1 : 0) - f.fl) * damp(dt, f.floating ? 2.4 : 3.2);
        const fl = f.fl;
        if (f.floating) {
          const tx = f.dd.x * f.sp + 0.09 * Math.sin(t * 0.45 + f.ph);
          const tz = f.dd.z * f.sp + 0.09 * Math.cos(t * 0.37 + f.ph * 1.3);
          f.vel.x += (tx - f.vel.x) * damp(dt, 0.9);
          f.vel.z += (tz - f.vel.z) * damp(dt, 0.9);
          f.off.x += f.vel.x * dt * fl;
          f.off.z += f.vel.z * dt * fl;
          const r = Math.hypot(f.off.x, f.off.z);
          if (r > f.maxD) {
            const k = lerp(1, f.maxD / r, damp(dt, 3));
            f.off.x *= k;
            f.off.z *= k;
          }
          f.yaw += f.spin * Math.sin(t * 0.3 + f.ph * 2) * dt * fl;
        } else {
          const k = Math.exp(-dt * 2.2);
          f.off.x *= k;
          f.off.z *= k;
          f.vel.x *= Math.exp(-dt * 3);
          f.vel.z *= Math.exp(-dt * 3);
          f.yaw *= Math.exp(-dt * 2.5);
        }
      }
    }

    function drive(dt: number, sf: number) {
      const ds = (sf * dt) / Dtotal;
      for (const f of cars) {
        if (!f.path || f.u0 === undefined) continue;
        const u = fract(f.u0 + s);
        const c = f.path.dir > 0 ? -12 + LANE * u : 12 - LANE * u;
        f.u = u;
        if (f.path.axis === "x") {
          f.bx = c;
          f.bz = f.path.lane;
          f.byaw = f.path.dir > 0 ? 0 : Math.PI;
        } else {
          f.bx = f.path.lane;
          f.bz = c;
          f.byaw = f.path.dir > 0 ? -Math.PI / 2 : Math.PI / 2;
        }
        f.sc = lerp(sstep(0, 0.075, u) * sstep(0, 0.075, 1 - u), 1, f.fl);
        f.g.scale.setScalar(Math.max(0.001, f.sc));
        f.g.visible = f.sc > 0.02;
        f.wheels?.forEach((w) => {
          w.rotation.z -= (ds * LANE) / w.userData.r;
        });
      }
    }

    function separate(dt: number) {
      for (let i = 0; i < floaters.length; i++) {
        for (let j = i + 1; j < floaters.length; j++) {
          const a = floaters[i];
          const b = floaters[j];
          if (a.fl < 0.4 || b.fl < 0.4) continue;
          const dx = b.bx + b.off.x - (a.bx + a.off.x);
          const dz = b.bz + b.off.z - (a.bz + a.off.z);
          const d = Math.hypot(dx, dz);
          const m = a.r + b.r;
          if (d < m && d > 1e-4) {
            const k = ((m - d) * 0.5 * Math.min(1, dt * 4)) / d;
            a.off.x -= dx * k;
            a.off.z -= dz * k;
            b.off.x += dx * k;
            b.off.z += dz * k;
          }
        }
      }
    }

    function applyFloaters(L: number, t: number) {
      for (const f of floaters) {
        const fl = f.fl;
        const lift = fl * Math.max(0, L - f.draft - f.baseY);
        const bob = Math.sin(t * 1.7 + f.ph) * 0.05 * fl;
        f.g.position.set(f.bx + f.off.x, f.baseY + lift + bob, f.bz + f.off.z);
        f.g.rotation.set(
          Math.sin(t * 1.3 + f.ph) * 0.08 * fl * f.tilt,
          f.byaw + f.yaw,
          Math.sin(t * 1.05 + f.ph * 1.7) * 0.06 * fl * f.tilt,
        );
        const on = fl > 0.05 && L > 0.05;
        f.wake.visible = on;
        if (on) {
          const pu = 0.5 + 0.5 * Math.sin(t * 1.4 + f.ph);
          const r = f.r * (1.25 + 0.3 * pu);
          f.wake.position.set(f.g.position.x, L + 0.07, f.g.position.z);
          f.wake.scale.set(r, r, 1);
          f.wake.material.opacity = 0.5 * fl * (1 - 0.6 * pu);
        }
      }
    }

    function updatePole(dt: number, L: number) {
      if (L < 0.18 && (pole.s === "down" || pole.s === "fall" || pole.s === "spark")) pole.s = "reset";
      switch (pole.s) {
        case "up":
          if (L > 0.95) {
            pole.s = "spark";
            pole.t = 0;
            pole.sp = 0;
          }
          break;
        case "spark":
          pole.t += dt;
          pole.sp -= dt;
          if (pole.sp <= 0) {
            pole.sp = 0.06 + Math.random() * 0.07;
            poleA.updateMatrix();
            trW.copy(trLocal).applyMatrix4(poleA.matrix);
            emit(trW.x, trW.y, trW.z, 6, 2.2, 3.2, 0xffe27a, 0.6, 9);
          }
          pole.a = Math.sin(pole.t * 46) * 0.014 * sstep(0, 0.3, pole.t);
          if (pole.t > 1.15) {
            pole.s = "fall";
            pole.v = 0.05;
          }
          break;
        case "fall":
          pole.v += 3.4 * Math.sin(pole.a + 0.18) * dt;
          pole.a += pole.v * dt;
          if (pole.a >= POLE_MAX) {
            pole.a = POLE_MAX;
            pole.v = -pole.v * 0.22;
            pole.s = "down";
            pole.crackle = 0.3;
          }
          break;
        case "down":
          pole.v += (POLE_MAX - pole.a) * 70 * dt;
          pole.v *= Math.exp(-dt * 5);
          pole.a += pole.v * dt;
          if (pole.a > POLE_MAX) {
            pole.a = POLE_MAX;
            if (pole.v > 0) pole.v = 0;
          }
          break;
        case "reset":
          pole.a = Math.max(0, pole.a - dt * 0.95);
          if (pole.a <= 0) {
            pole.s = "up";
            pole.v = 0;
          }
          break;
      }
      poleA.rotation.z = pole.a;
      poleA.updateMatrix();
      tipW.copy(tipLocal).applyMatrix4(poleA.matrix);
      if (pole.s === "down") {
        if (!pole.splash && tipW.y <= L) {
          pole.splash = true;
          emit(tipW.x, L, tipW.z, 16, 2.4, 4.5, 0xbdf4ff, 0.9, 10);
          emit(tipW.x, L, tipW.z, 10, 2, 3, 0xffe27a, 0.5, 9);
          ripple(tipW.x, L + 0.08, tipW.z, 2.2, 1.6);
        }
        if (pole.splash && tipW.y > L + 0.25) pole.splash = false;
        pole.crackle -= dt;
        if (pole.crackle <= 0 && tipW.y < L + 0.2) {
          pole.crackle = 0.5 + Math.random() * 1.2;
          emit(tipW.x, L + 0.05, tipW.z, 5, 1.6, 2.6, 0xffe27a, 0.4, 9);
          ripple(tipW.x, L + 0.08, tipW.z, 1.1, 0.9);
        }
      }
      if (pole.s !== "down" && pole.s !== "fall") pole.splash = false;
      updateWires();
      const sparking = pole.s === "spark";
      flash.visible = sparking;
      if (sparking) {
        trW.copy(trLocal).applyMatrix4(poleA.matrix);
        flash.position.copy(trW);
        flash.material.opacity = Math.random() < 0.55 ? rnd(0.4, 0.95) : 0.05;
        flash.scale.setScalar(rnd(0.7, 1.5));
      }
    }

    function updateSignals(dt: number) {
      const act = { x: false, z: false };
      const nxt = { x: 9, z: 9 };
      for (const f of cars) {
        if (!f.path) continue;
        const a = f.path.axis;
        const u = f.u || 0;
        if (u > 0.34 && u < 0.66) act[a] = true;
        nxt[a] = Math.min(nxt[a], fract(0.5 - u));
      }
      const want = { x: act.x, z: act.z && !act.x };
      if (!act.x && !act.z) {
        if (nxt.x < nxt.z && nxt.x < 0.2) want.x = true;
        else if (nxt.z < 0.2) want.z = true;
      }
      (["x", "z"] as const).forEach((a) => {
        const S = sig[a];
        if (want[a]) {
          S.st = 2;
          S.t = 0;
        } else if (S.st === 2) {
          S.st = 1;
          S.t = 0;
        } else if (S.st === 1) {
          S.t += dt;
          if (S.t > 0.7) S.st = 0;
        }
        (["r", "y", "g"] as const).forEach((k) => {
          const on = (k === "r" && S.st === 0) || (k === "y" && S.st === 1) || (k === "g" && S.st === 2);
          S.li[k] += ((on ? 1.9 : 0.04) - S.li[k]) * damp(dt, 14);
          S[k].emissiveIntensity = S.li[k];
        });
      });
    }

    function update(dt: number) {
      tAbs += dt;
      intro = Math.min(1, intro + dt / 1.7);

      // Handle water cycle: auto loop vs manual override
      if (controlsRef.current.auto) {
        tc += dt;
        if (tc >= CYC.total) {
          tc -= CYC.total;
          s = Math.round(s);
        }
        p = pAuto(tc);
        controlsRef.current.currentWater = p;
      } else {
        p += (controlsRef.current.manualWater - p) * damp(dt, 6);
        controlsRef.current.currentWater = p;
      }

      const dp = (p - pPrev) / Math.max(dt, 1e-4);
      dpS += (dp - dpS) * damp(dt, 4);
      pPrev = p;
      const sf = sfOf(p);
      s += (sf * dt) / Dtotal;
      const L = LMAX * p;

      // Weather & Storm intensity
      const rainT = p > 0.03 && dpS > -0.04 ? 1 : 0;
      rainA += (rainT - rainA) * damp(dt, rainT ? 1.2 : 1.6);
      storm += ((rainA * 0.7 + 0.3 * sstep(0.1, 0.9, p) * (rainT ? 1 : 0.6)) - storm) * damp(dt, 1.5);

      // Water mesh updates
      waterGrp.visible = L > 0.012;
      if (waterGrp.visible) {
        waterBody.scale.y = L;
        waterTop.position.y = L;
        const amp = 0.04 + 0.05 * storm;
        const pos = topGeo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const x = topBase[i * 3];
          const z = topBase[i * 3 + 2];
          pos.setY(
            i,
            amp *
              (Math.sin(x * 0.6 + tAbs * 1.4) +
                0.85 * Math.cos(z * 0.7 - tAbs * 1.15) +
                0.45 * Math.sin((x + z) * 0.9 + tAbs * 2.1)),
          );
        }
        pos.needsUpdate = true;
      }

      // Vehicles, debris & signals
      drive(dt, sf);
      updateFloaters(dt, L, tAbs);
      separate(dt);
      applyFloaters(L, tAbs);
      updatePole(dt, L);
      updateSignals(dt);

      headMat.emissiveIntensity = 0.35 + 1.2 * storm;
      tailMat.emissiveIntensity = 0.3 + 0.6 * storm + (1 - sf) * 1.2;
      winMat.emissiveIntensity = Math.max(0.15, 0.9 * storm);

      // Rain particles
      const nRain = Math.floor(RN * rainA);
      rainGeo.setDrawRange(0, nRain * 2);
      rain.visible = nRain > 0;
      if (nRain > 0) {
        for (let i = 0; i < nRain; i++) {
          rainY[i] -= 20 * dt;
          if (rainY[i] < 0.3) {
            rainY[i] = 10 + Math.random() * 2;
            rainX[i] = rnd(-10, 10);
            rainZ[i] = rnd(-10, 10);
          }
          const o = i * 6;
          rainPos[o] = rainX[i];
          rainPos[o + 1] = rainY[i];
          rainPos[o + 2] = rainZ[i];
          rainPos[o + 3] = rainX[i] + 0.1;
          rainPos[o + 4] = rainY[i] + 0.9;
          rainPos[o + 5] = rainZ[i];
        }
        rainGeo.attributes.position.needsUpdate = true;
        if (L > 0.05 && Math.random() < dt * 24 * rainA) {
          ripple(rnd(-10.5, 10.5), L + 0.08, rnd(-10.5, 10.5), rnd(0.5, 0.95), rnd(0.9, 1.4));
        }
      }
      rainMat.opacity = 0.6 * Math.min(1, rainA * 1.5);

      // Ripples & Particles
      for (const r of rip) {
        if (r.life > 0) {
          r.age += dt;
          const k = r.age / r.life;
          if (k >= 1) {
            r.life = 0;
            r.m.visible = false;
            continue;
          }
          const sc = 0.05 + r.max * easeOut(k);
          r.m.scale.set(sc, sc, 1);
          r.m.material.opacity = 0.75 * Math.pow(1 - k, 1.5);
        }
      }
      for (const q of parts) {
        if (q.life > 0) {
          q.life -= dt;
          if (q.life <= 0) {
            q.m.visible = false;
            continue;
          }
          q.v.y -= q.g * dt;
          q.m.position.addScaledVector(q.v, dt);
          q.m.scale.setScalar(0.3 + q.life / q.max);
        }
      }

      // Scenery: trees sway & train runs
      trees.forEach((t) => {
        t.g.rotation.z = Math.sin(tAbs * 1.2 + t.ph) * 0.03 * (1 + storm * 2.5);
      });
      const cA = easeOut(sstep(0.02, 0.5, storm));
      cloudMat.color.setRGB(lerp(0.96, 0.6, storm), lerp(0.98, 0.65, storm), lerp(1.0, 0.76, storm));
      clouds.forEach((c, i) => {
        const k = Math.max(0.001, cA * c.s);
        c.g.scale.setScalar(k);
        c.g.visible = cA > 0.01;
        c.g.position.y = c.y + Math.sin(tAbs * 0.5 + i * 2) * 0.35;
      });
      train.position.x = -30 + ((tAbs * 3.0) % 60);

      // Sun / Moon reaction
      const oK = 1 - sstep(0.12, 0.55, storm);
      orbG.scale.setScalar(Math.max(0.001, oK));
      orbG.visible = oK > 0.01;
      halo.scale.setScalar(1 + 0.05 * Math.sin(tAbs * 1.2));
      rays.rotation.z = tAbs * 0.12;

      // Mouse Parallax & Island Levitation
      const e = easeOut(intro);
      mx += (tmx - mx) * damp(dt, 3);
      my += (tmy - my) * damp(dt, 3);
      world.position.y = Math.sin(tAbs * 0.7) * 0.16 + (1 - e) * 7;
      world.rotation.y = mx * 0.07 - (1 - e) * 0.6;
      world.rotation.x = my * 0.02;
      blob.scale.setScalar(0.85 + 0.15 * e - Math.sin(tAbs * 0.7) * 0.02);
      blob.material.opacity = 0.22 * e;
      world.updateMatrixWorld(true);
      clipPl[0].copy(clipBase[0]).applyMatrix4(world.matrixWorld);
      clipPl[1].copy(clipBase[1]).applyMatrix4(world.matrixWorld);

      // Update React HUD status periodically
      hudTimer -= dt;
      if (hudTimer <= 0) {
        hudTimer = 0.12;
        const cm = Math.round(p * 120);
        const lvl: "clear" | "watch" | "warning" | "severe" =
          p < 0.08 ? "clear" : p < 0.3 ? "watch" : p < 0.6 ? "warning" : "severe";
        controlsRef.current.setHud(cm, lvl);
      }
    }

    /* ---------- Resizing & Camera Frustum ---------- */
    function fit() {
      if (!container || !canvas || isDisposed) return;
      const W = container.clientWidth;
      const H = container.clientHeight;
      if (!W || !H) return;

      renderer.setSize(W, H, false);

      // Frame the 3D scene cleanly within the container bounds
      const wpp = Math.max(34 / W, 25 / H);
      const hw = (W * wpp) / 2;
      const hh = (H * wpp) / 2;
      cam.left = -hw;
      cam.right = hw;
      cam.top = hh;
      cam.bottom = -hh;
      cam.updateProjectionMatrix();
    }

    const resizeObserver = new ResizeObserver(fit);
    resizeObserver.observe(container);
    fit();

    /* ---------- Cursor Parallax Handling ---------- */
    let mx = 0;
    let my = 0;
    let tmx = 0;
    let tmy = 0;

    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      tmx = clamp(x * 2, -1, 1);
      tmy = clamp(y * 2, -1, 1);
    };

    const onPointerLeave = () => {
      tmx = 0;
      tmy = 0;
    };

    container.addEventListener("pointermove", onPointerMove, { passive: true });
    container.addEventListener("pointerleave", onPointerLeave, { passive: true });

    /* ---------- Render Loop & Intersection Observer ---------- */
    let last = performance.now();
    let isVisible = true;

    function frame(now: number) {
      if (isDisposed) return;
      if (isVisible) {
        const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
        last = now;
        update(dt);
        renderer.render(scene, cam);
      } else {
        last = now;
      }
      animationFrameId = requestAnimationFrame(frame);
    }
    animationFrameId = requestAnimationFrame(frame);

    // Pause rendering when scrolled out of view to save battery & GPU
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          isVisible = entry.isIntersecting;
        }
      },
      { threshold: 0.05 },
    );
    intersectionObserver.observe(container);

    /* ---------- Cleanup ---------- */
    return () => {
      isDisposed = true;
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerleave", onPointerLeave);

      // Dispose Three.js resources
      renderer.dispose();
      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.geometry?.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else if (mesh.material) {
            mesh.material.dispose();
          }
        }
      });
      signTex.dispose();
    };
  }, []);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value) / 100;
    setIsAuto(false);
    controlsRef.current.auto = false;
    controlsRef.current.manualWater = val;
  };

  const handleToggleAuto = () => {
    setIsAuto((prev) => {
      const next = !prev;
      controlsRef.current.auto = next;
      if (!next) {
        controlsRef.current.manualWater = controlsRef.current.currentWater;
      }
      return next;
    });
  };

  return (
    <div className={`city-3d-wrapper ${className}`} ref={containerRef}>
      {/* 3D WebGL Canvas */}
      <canvas
        ref={canvasRef}
        className="city-3d-canvas"
        role="img"
        aria-label="Interactive 3D low-poly simulation of Bengaluru intersection with drains, vehicles, and Namma Metro"
      />

      {/* Sleek, low-profile micro-HUD */}
      {interactive && (
        <div className="city-3d-hud" role="group" aria-label="Micro-simulation flood controls">
          <div className="city-3d-stat">
            <span className="city-3d-label">Water Depth</span>
            <div className="city-3d-val-row">
              <strong className="city-3d-val">
                {waterDepthCm} <small>cm</small>
              </strong>
              <span className={`city-3d-pill level-${floodLevel}`}>
                {floodLevel === "clear"
                  ? "Clear"
                  : floodLevel === "watch"
                    ? "Watch"
                    : floodLevel === "warning"
                      ? "Warning"
                      : "Severe"}
              </span>
            </div>
          </div>

          <div className="city-3d-controls">
            <label htmlFor="city-water-slider" className="sr-only">
              Simulate flood water depth
            </label>
            <input
              id="city-water-slider"
              type="range"
              min="0"
              max="100"
              step="1"
              value={isAuto ? Math.round(controlsRef.current.currentWater * 100) : undefined}
              defaultValue={0}
              onChange={handleSliderChange}
              className="city-3d-slider"
              title="Raise or lower water depth"
            />
            <button
              type="button"
              className={`city-3d-toggle${isAuto ? " is-active" : ""}`}
              onClick={handleToggleAuto}
              title={isAuto ? "Pause auto monsoon cycle" : "Resume auto monsoon cycle"}
            >
              <span className="city-3d-toggle-knob" />
              <span>Auto</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
