// ==================================================================
//  Bézier Tabanlı Generatif Grafik Uygulaması
//
//  MOD 1: Bézier DEMO
//   - Sol: Quadratic (3 noktalı) Bézier eğrisi.
//   - Sağ: Cubic (4 noktalı) Bézier eğrisi.
//   - R: Kontrol noktalarını ve hızları rastgeleleştir.
//
//  MOD 2: Fraktal Bézier Ağaç
//   - Tohumdan büyüyen fraktal ağaç (tamamen cubic Bézier dallar).
//   - Dallar: Rüzgârda salınan, derinliğe göre renk geçişli.
//   - Yapraklar: Bézier ile çizilen organik form, uçlarda salınım.
//   - Bazı yapraklar sararıp aşağı doğru dönerek düşer.
//   - R: Ağacı tohumdan yeniden başlat.
//   - S: PNG olarak sahnenin ekran görüntüsünü kaydet.
//   - Z: Ağaca doğru yakınlaştırma (zoom animasyonu).
// ==================================================================

// ------------------------
// Genel Ayarlar ve Canvas
// ------------------------

const CONFIG = {
  maxDepth: 9,          // Fraktal derinliği.
  growthSpeed: 0.0006,  // Ağacın büyüme hızı.

  colors: {
    trunk: { r: 70, g: 40, b: 20 },        // Gövde için temel kahverengi.
    leafGreen: { r: 144, g: 238, b: 144 }, // Yaprak için açık yeşil.
    leafAutumn: { r: 184, g: 134, b: 11 }  // Sonbahar yaprağı için koyu sarı.
  },

  zoomDuration: 7.0,    // Z tuşuna basıldığında zoom süresi (saniye).
  zoomScale: 0.35,      // Zoom miktarı (1 + zoomScale).

  maxFallingLeaves: 45,       // Ekranda aynı anda bulunabilecek maksimum düşen yaprak sayısı.
  fallingLeafGravity: 0.6,    // Düşen yapraklara etki eden yerçekimi katsayısı.
  fallingLeafFadeRate: 0.0008 // Yaprakların görünürlüğünün azalması.
};

// HTML canvas referansı ve context.
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

// Ekran boyutu.
let width = window.innerWidth;
let height = window.innerHeight;
canvas.width = width;
canvas.height = height;

// Ekran yeniden boyutlanınca canvas'ı güncelle.
window.addEventListener("resize", () => {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;
  initScene(); // Ağaç sahnesini yeniden başlat.
});

// -----------------------------------------
// Mod Yönetimi ve Bézier DEMO Değişkenleri
// -----------------------------------------

// MODE = 1 → Bézier DEMO, MODE = 2 → Ağaç
let MODE = 2;

// DEMO animasyon fazları ve hızları.
let demoPhaseQuad = 0;
let demoPhaseCubic = 0;
let demoSpeedQuad = 0.01;
let demoSpeedCubic = 0.008;

// Quadratic Bézier (3 nokta: Q0, Q1, Q2)
let qPoints = {
  Q0: { x: -200, y: 100 },
  Q1: { x: 0, y: -150 },
  Q2: { x: 200, y: 100 }
};

// Cubic Bézier (4 nokta: P0, P1, P2, P3)
let cPoints = {
  P0: { x: -220, y: 140 },
  P1: { x: -120, y: -180 },
  P2: { x: 120, y: 180 },
  P3: { x: 220, y: -140 }
};

// DEMO modunda kontrol noktalarını rastgele konumlandıran fonksiyon.
function randomizeBezierPoints() {
  const spread = Math.min(width, height) * 0.35;

  // Quadratic eğri için kontrol noktaları.
  qPoints.Q0 = { x: -spread * 0.8, y: spread * (0.2 + Math.random() * 0.4) };
  qPoints.Q2 = { x: spread * 0.8, y: spread * (0.2 + Math.random() * 0.4) };
  qPoints.Q1 = {
    x: (Math.random() - 0.5) * spread * 0.4,
    y: -spread * (0.2 + Math.random() * 0.8)
  };

  // Cubic eğri için kontrol noktaları.
  cPoints.P0 = { x: -spread * 0.9, y: spread * (0.25 + Math.random() * 0.2) };
  cPoints.P3 = { x: spread * 0.9, y: -spread * (0.25 + Math.random() * 0.2) };
  cPoints.P1 = {
    x: -spread * (0.2 + Math.random() * 0.3),
    y: -spread * (0.2 + Math.random() * 0.8)
  };
  cPoints.P2 = {
    x: spread * (0.2 + Math.random() * 0.3),
    y: spread * (0.2 + Math.random() * 0.8)
  };

  // Eğri üzerinde gezinen noktanın hızlarını da rastgeleleştir.
  demoSpeedQuad = 0.006 + Math.random() * 0.02;
  demoSpeedCubic = 0.005 + Math.random() * 0.018;
  demoPhaseQuad = 0;
  demoPhaseCubic = 0;
}

// ----------------------------------------
// Yardımcı Fonksiyonlar ve Renk Sınıfları
// ----------------------------------------

// Lineer map fonksiyonu: [a,b] aralığındaki v değerini [c,d] aralığına taşır.
const mapValue = (v, a, b, c, d) => c + ((v - a) * (d - c)) / (b - a);

// Clamp: değeri [lo, hi] aralığında sınırlar.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Basit RGB renk sınıfı.
class ColorRGB {
  constructor(r, g, b) {
    this.r = r;
    this.g = g;
    this.b = b;
  }
  toCss(a = 1) {
    return `rgba(${this.r},${this.g},${this.b},${a})`;
  }
}

// İki renk arasında lineer geçişli (gradient) renk listesi.
class ColorGradient {
  constructor(start, end, steps) {
    this.gradient = [];
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      this.gradient.push(
        new ColorRGB(
          start.r * (1 - t) + end.r * t,
          start.g * (1 - t) + end.g * t,
          start.b * (1 - t) + end.b * t
        )
      );
    }
  }
}

// ---------------------------------------------
// Ağaç İçin Parametreler ve Global Değişkenler
// ---------------------------------------------

const maxDepth = CONFIG.maxDepth;
const growthSpeed = CONFIG.growthSpeed;

const trunkColor = new ColorRGB(
  CONFIG.colors.trunk.r,
  CONFIG.colors.trunk.g,
  CONFIG.colors.trunk.b
);

const leafColor = new ColorRGB(
  CONFIG.colors.leafGreen.r,
  CONFIG.colors.leafGreen.g,
  CONFIG.colors.leafGreen.b
);

const autumnColor = new ColorRGB(
  CONFIG.colors.leafAutumn.r,
  CONFIG.colors.leafAutumn.g,
  CONFIG.colors.leafAutumn.b
);

// Gövdeden yapraklara doğru yumuşak geçiş sağlayan gradient.
const treeGradient = new ColorGradient(trunkColor, leafColor, maxDepth + 1);

// Ağaç ve animasyon durum değişkenleri.
let tree;
let globalTime = 0;        // Animasyon zamanı.
let growthProgress = 0;    // 0 → tohum, 1 → tam büyümüş ağaç.

// Zoom kontrolü.
let zoomActive = false;
let zoomTime = 0;
const zoomDuration = CONFIG.zoomDuration;

// Düşen yapraklar için liste.
let fallingLeaves = [];

// ---------------------------
// Fraktal Bézier Ağaç Sınıfı
// ---------------------------

class FractalTree {
  constructor(x, y, grad) {
    this.x0 = x;       // Gövdenin ekrandaki X konumu.
    this.y0 = y;       // Gövdenin ekrandaki Y konumu.
    this.grad = grad;  // Renk geçişi (gövde → yaprak).
  }

  // Ağacın tamamını çizen fonksiyon.
  draw() {
    // Büyüme ilerlemesini artır (0 → 1).
    growthProgress = Math.min(1, growthProgress + growthSpeed);

    // Ağacın ana gövde uzunluğu, ekran yüksekliğine göre ölçekleniyor.
    const baseHeight = height * 0.33 * growthProgress;
    const sway = Math.sin(globalTime * 0.5) * (Math.PI / 90);
    ctx.save();
    ctx.translate(this.x0, this.y0); // Gövdeyi ekranın alt ortasına yerleştir.

    // Tohum fazı: henüz dal yok, küçük bir kahverengi nokta.
    if (growthProgress < 0.12) {
      const r = mapValue(growthProgress, 0, 0.12, 2, 6);
      ctx.fillStyle = trunkColor.toCss(1);
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    // Tohumdan gövde ve dalların çıkması.
    this.drawBranch(baseHeight, sway, 0, globalTime, growthProgress);

    ctx.restore();
  }

  // Rekürsif dal çizimi (her dal bir cubic Bézier eğrisi).
  drawBranch(len, angle, depth, t, grow) {
    const currentMaxDepth = Math.floor(maxDepth * grow);
    if (depth > currentMaxDepth) return;

    const depthRatio = depth / maxDepth;

    // Her derinlik için dalın "görünme aralığı" (kademeli büyüme).
    const appearStart = depthRatio * 0.6;
    const appearEnd = appearStart + 0.45;
    let appear = (grow - appearStart) / (appearEnd - appearStart);
    appear = clamp(appear, 0, 1);
    if (appear <= 0) return;

    let lenEff = len * appear;

    // En alttaki gövdeyi biraz kısaltma (daha kompakt ve dengeli bir gövde).
    if (depth === 0) {
      lenEff *= 0.85;
    }

    // Derinliğe bağlı ana renk (gövde → yeşil geçiş).
    let col = this.grad.gradient[depth];
    if (depth === 0) {
      col = new ColorRGB(40, 22, 10);
    }

    // Çizgi kalınlığı: dipte kalın, yukarıda ince.
    const lineW = mapValue(depth, 0, maxDepth, 14, 1);
    const alpha = mapValue(depth, 0, maxDepth, 1, 0.35) * appear;

    ctx.strokeStyle = col.toCss(alpha);
    ctx.lineWidth = lineW * appear;

    // Dalın eğriliği ve rüzgâr.
    const curve = lenEff * (0.18 + depthRatio * 0.5);
    const localPhase = t * (0.65 + depth * 0.07);
    const swayCurve = Math.sin(localPhase) * curve;

    // Cubic Bézier kontrol noktaları.
    const x0 = 0, y0 = 0;
    const x3 = swayCurve * 0.15, y3 = -lenEff;
    const cp1x = swayCurve * 0.55, cp1y = -lenEff * 0.3;
    const cp2x = -swayCurve * 0.45, cp2y = -lenEff * 0.8;

    ctx.save();
    ctx.rotate(angle);

    // Dal eğrisini çiz.
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x3, y3);
    ctx.stroke();

    // Çocuk dallar için dalın ucuna ilerle.
    ctx.translate(x3, y3);

    // En üst seviye dallarda yaprak çiz.
    if (depthRatio > 0.85 && appear > 0.6) {
      this.drawLeaf(t, appear, depth);
    }

    // Çocuk dallar: her dal kendisinden daha kısa iki dal üretir (sağ / sol).
    if (depth < currentMaxDepth && appear > 0.3) {
      const childLen = lenEff * 0.7;
      const spread = mapValue(depthRatio, 0, 1, Math.PI / 9, Math.PI / 3.5);
      const jitter = Math.sin(depth * 8.8 + t * 0.45) * (Math.PI / 70);

      // Sağ dal.
      ctx.save();
      ctx.rotate(spread + jitter);
      this.drawBranch(childLen, angle, depth + 1, t + 0.2, grow);
      ctx.restore();

      // Sol dal.
      ctx.save();
      ctx.rotate(-spread + jitter);
      this.drawBranch(childLen, angle, depth + 1, t + 0.3, grow);
      ctx.restore();
    }

    ctx.restore();
  }

  // Dal ucundaki yaprak (Bézier ile çizilen organik form).
  drawLeaf(t, appear, depth) {
    const depthRatio = depth / maxDepth;
    const baseSize = 22;
    const depthFactor = 0.8 + 0.4 * depthRatio;
    const size = baseSize * depthFactor;
    const widthLeaf = size * 0.55;

    const swing = Math.sin(t * 1.2 + depth * 0.4) * (Math.PI / 45);
    const offsetX = Math.sin(t * 0.7 + depth * 0.8) * 5;

    ctx.save();
    ctx.translate(offsetX * appear, 0);
    ctx.rotate(swing * appear);
    ctx.rotate(-Math.PI / 20);

    const green = leafColor;
    const darkEdge = new ColorRGB(40, 110, 60);

    // Yaprak formu: iki cubic Bézier ile kapalı organik yaprak şekli.
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(
      widthLeaf, -size * 0.20,
      widthLeaf * 0.9, -size * 0.9,
      0, -size
    );
    ctx.bezierCurveTo(
      -widthLeaf * 0.9, -size * 0.9,
      -widthLeaf, -size * 0.20,
      0, 0
    );

    // Dolgu ve kenar çizgisi.
    ctx.fillStyle = green.toCss(0.85 * appear);
    ctx.fill();

    ctx.strokeStyle = darkEdge.toCss(0.9 * appear);
    ctx.lineWidth = 1;
    ctx.stroke();

    // Orta damar.
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -size);
    ctx.strokeStyle = `rgba(255,255,255,${0.22 * appear})`;
    ctx.lineWidth = 0.7;
    ctx.stroke();

    // Sararıp düşmeye başlayacak yaprakları üret.
    if (
      growthProgress > 0.97 &&                     // Ağaç tamamen büyümeye yaklaştığında.
      Math.random() < 0.0008 &&                    // Düşen yaprak üretme olasılığı.
      typeof ctx.getTransform === "function" &&
      fallingLeaves.length < CONFIG.maxFallingLeaves
    ) {
      const m = ctx.getTransform(); // O anki dünya transformu.
      const worldX = m.e;
      const worldY = m.f;

      fallingLeaves.push({
        x: worldX,
        y: worldY,
        size: size,
        angle: 0,
        angularVel: (Math.random() * 2 - 1) * 0.03,
        vx: (Math.random() * 2 - 1) * 0.25,
        vy: Math.random() * 0.05 - 0.02,
        life: 1   // 1 → tamamen görünür, 0 → kaybolmuş.
      });
    }

    ctx.restore();
  }
}

// ------------------------------------------
// Düşen Yaprakların Güncellenmesi ve Çizimi
// ------------------------------------------

function updateAndDrawFallingLeaves() {
  const dt = 0.016; // Sabit zaman adımı, animasyon kararlılığı için.

  for (let i = fallingLeaves.length - 1; i >= 0; i--) {
    const fl = fallingLeaves[i];

    fl.vy += CONFIG.fallingLeafGravity * dt;
    fl.x += fl.vx * 0.6;
    fl.y += fl.vy;
    fl.angle += fl.angularVel * 0.55;

    // Yaprağın görünürlüğünü azalt.
    fl.life -= CONFIG.fallingLeafFadeRate;

    // Ekran altından çıktıysa veya tamamen solduysa listeden sil.
    if (fl.y > height + 120 || fl.life <= 0) {
      fallingLeaves.splice(i, 1);
      continue;
    }

    // Ekranda düşen yaprağı çiz.
    drawFallingLeaf(fl);
  }
}

// Tek bir düşen yaprağı çizen fonksiyon.
function drawFallingLeaf(fl) {
  const size = fl.size;
  const widthLeaf = size * 0.6;

  // Yeşilimsi sarıdan, parlak sarıya doğru renk geçişi.
  const t = 1 - fl.life;
  const r = 255 * t + autumnColor.r * (1 - t);
  const g = 215 * t + autumnColor.g * (1 - t);
  const b = 0 * t + autumnColor.b * (1 - t);
  const fillCol = new ColorRGB(r, g, b);

  ctx.save();
  ctx.translate(fl.x, fl.y);
  ctx.rotate(fl.angle);

  // Yaprak formu.
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(
    widthLeaf, -size * 0.22,
    widthLeaf * 0.9, -size * 0.9,
    0, -size
  );
  ctx.bezierCurveTo(
    -widthLeaf * 0.9, -size * 0.9,
    -widthLeaf, -size * 0.22,
    0, 0
  );

  ctx.fillStyle = fillCol.toCss(0.9 * fl.life);
  ctx.fill();

  ctx.strokeStyle = "rgba(134, 86, 32, 0.9)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Orta damar.
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -size);
  ctx.strokeStyle = `rgba(255,255,255,${0.18 * fl.life})`;
  ctx.lineWidth = 0.7;
  ctx.stroke();

  ctx.restore();
}

// -----------------------------
// Sahneyi Başlatma (Ağaç için)
// -----------------------------

function initScene() {
  growthProgress = 0;
  globalTime = 0;
  zoomActive = false;
  zoomTime = 0;
  fallingLeaves = [];
  tree = new FractalTree(width / 2, height, treeGradient);
}

// --------------------------------------------------
// Bézier Eğrisi Değerleme Fonksiyonları (DEMO için)
// --------------------------------------------------

// Quadratic Bézier (3 nokta)
const evalQuadratic = (p0, p1, p2, t) => ({
  x: (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * p1.x + (t * t) * p2.x,
  y: (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * p1.y + (t * t) * p2.y
});

// Cubic Bézier (4 nokta)
function evalCubic(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return {
    x:
      u ** 3 * p0.x +
      3 * u * u * t * p1.x +
      3 * u * t * t * p2.x +
      t ** 3 * p3.x,
    y:
      u ** 3 * p0.y +
      3 * u * u * t * p1.y +
      3 * u * t * t * p2.y +
      t ** 3 * p3.y
  };
}

// --------------------------
// Mod 1: Bézier DEMO Çizimi
// --------------------------

function drawBezierDemo() {
  demoPhaseQuad += demoSpeedQuad;
  demoPhaseCubic += demoSpeedCubic;

  // Arka plan.
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(width / 2, height / 2);

  // Quadratic (solda).
  ctx.save();
  ctx.translate(-width * 0.22, 0);
  const { Q0, Q1, Q2 } = qPoints;

  // Kontrol poligonu.
  ctx.strokeStyle = "rgba(200,200,255,0.5)";
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(Q0.x, Q0.y);
  ctx.lineTo(Q1.x, Q1.y);
  ctx.lineTo(Q2.x, Q2.y);
  ctx.stroke();

  // Bézier eğrisi.
  ctx.beginPath();
  ctx.moveTo(Q0.x, Q0.y);
  ctx.quadraticCurveTo(Q1.x, Q1.y, Q2.x, Q2.y);
  ctx.strokeStyle = "rgba(120,255,200,0.9)";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Parametrik noktayı hesapla ve çiz.
  const tq = (Math.sin(demoPhaseQuad) + 1) / 2;
  const curQ = evalQuadratic(Q0, Q1, Q2, tq);
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.arc(curQ.x, curQ.y, 7, 0, Math.PI * 2);
  ctx.fill();

  // Etiket.
  ctx.font = "bold 16px Arial";
  ctx.fillStyle = "rgba(120,255,200,0.9)";
  ctx.textAlign = "center";
  ctx.fillText("Quadratic", 0, height * 0.35);
  ctx.restore();

  // Cubic (sağda).
  ctx.save();
  ctx.translate(width * 0.12, 0);
  const { P0, P1, P2, P3 } = cPoints;

  // Kontrol poligonu.
  ctx.beginPath();
  ctx.moveTo(P0.x, P0.y);
  ctx.lineTo(P1.x, P1.y);
  ctx.lineTo(P2.x, P2.y);
  ctx.lineTo(P3.x, P3.y);
  ctx.strokeStyle = "rgba(200,200,255,0.5)";
  ctx.stroke();

  // Bézier eğrisi.
  ctx.beginPath();
  ctx.moveTo(P0.x, P0.y);
  ctx.bezierCurveTo(P1.x, P1.y, P2.x, P2.y, P3.x, P3.y);
  ctx.strokeStyle = "rgba(120,255,220,0.9)";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Parametrik nokta.
  const tc = (Math.cos(demoPhaseCubic) + 1) / 2;
  const curC = evalCubic(P0, P1, P2, P3, tc);
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.arc(curC.x, curC.y, 7, 0, Math.PI * 2);
  ctx.fill();

  // Etiket.
  ctx.font = "bold 16px Arial";
  ctx.fillStyle = "rgba(120,255,220,0.9)";
  ctx.textAlign = "center";
  ctx.fillText("Cubic", 0, height * 0.35);

  ctx.restore();
  ctx.restore();
}

// --------------------------------------------
// HUD (HTML tarafındaki mod ve FPS gösterimi)
// --------------------------------------------

let lastFpsTime = 0;
let frameCount = 0;
let currentFps = 0;

function updateHUD() {
  frameCount++;
  const now = performance.now();

  // FPS hesapla (her 1 saniyede bir).
  if (now - lastFpsTime >= 1000) {
    currentFps = frameCount;
    frameCount = 0;
    lastFpsTime = now;
  }

  const modeDisplay = document.getElementById("modeDisplay");
  const fpsDisplay = document.getElementById("fpsDisplay");

  if (modeDisplay) {
    modeDisplay.textContent =
      MODE === 1 ? "Modu: Bézier DEMO" : "Modu: Ağaç";
  }
  if (fpsDisplay) {
    fpsDisplay.textContent = `FPS: ${currentFps}`;
  }
}

// Canvas üzerine değil, HTML tarafında gösterdiğimiz için.
function drawHUD() {
  updateHUD();
}

// -------------------
// Klavye Kontrolleri
// -------------------

window.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();

  if (key === "1") {
    MODE = 1;
    randomizeBezierPoints();
    zoomActive = false; // Zoom sadece ağaç modundayken anlamlı.
  }

  if (key === "2") {
    MODE = 2;
    initScene();
  }

  if (key === "r") {
    if (MODE === 2) initScene();
    else randomizeBezierPoints();
  }

  if (key === "s") {
    const link = document.createElement("a");
    link.download = MODE === 2 ? "growing_tree.png" : "bezier_demo.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  // Z: Ağaç modunda büyüme tamamlanınca zoom.
  if (key === "z") {
    if (MODE === 2 && growthProgress >= 1.0) {
      zoomActive = true;
      zoomTime = 0;
    }
  }
});

// ----------------------
// Ana Animasyon Döngüsü
// ----------------------

function loop() {
  // Sabit zaman adımı (globalTime, animasyon fazları için kullanılıyor).
  globalTime += 0.016;

  // Her karede canvas transformunu sıfırla.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);

  // Eğer zoom aktifse, kamerayı ağaca doğru yakınlaştır.
  if (zoomActive) {
    zoomTime += 0.016;
    const alpha = clamp(zoomTime / zoomDuration, 0, 1);
    const cyc = Math.sin(alpha * Math.PI);
    const z = 1 + CONFIG.zoomScale * cyc;  // Zoom miktarı (1 → 1+zoomScale).

    const baseY = height / 2;
    const topY = height * 0.25;
    const focusY = baseY + (topY - baseY) * cyc;

    ctx.translate(width / 2, height / 2);
    ctx.scale(z, z);
    ctx.translate(-width / 2, -focusY);

    if (alpha >= 1) {
      zoomActive = false;
    }
  }

  if (MODE === 2) {
    // Ağaç sahnesi.
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, width, height);

    tree.draw();
    updateAndDrawFallingLeaves();
  } else {
    // Bézier DEMO sahnesi.
    drawBezierDemo();
  }

  // HTML tabanlı HUD'i güncelle.
  drawHUD();

  requestAnimationFrame(loop);
}

// ---------
// Başlatma
// ---------

initScene();
randomizeBezierPoints();
loop();
