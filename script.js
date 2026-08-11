/* ============================================================
   رسم متحرك ثلاثي الأبعاد: شموع + خط سعر + روبوت تداول (EA)
   Canvas 2D مع إسقاط منظوري — بدون أي مكتبات خارجية
   ============================================================ */
(function () {
  "use strict";

  var canvas = document.getElementById("eaCanvas");
  if (!canvas || !canvas.getContext) return;

  var ctx = canvas.getContext("2d");
  var reduced = window.matchMedia &&
                window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- الألوان ---------- */
  var GREEN = "126,217,87";        /* rgb الأخضر الرئيسي */
  var DIM   = "126,217,87";
  var BASE_W = 480;                /* عرض التصميم المرجعي */

  /* ---------- الكاميرا والعالم ---------- */
  var FOV = 900, CAM_Z = 900, CAM_Y = 6;
  var FLOOR = 58;                  /* أرضية المخطط */
  var CHART_H = 96;                /* ارتفاع منطقة الشموع */
  var SPACING = 26;                /* المسافة بين الشموع */
  var NUM = 12;                    /* عدد الشموع الظاهرة */
  var HALF_W = 7, HALF_D = 7;      /* أبعاد جسم الشمعة */

  var W = 0, H = 0, cx = 0, cy = 0, fit = 1, dpr = 1;
  var angle = 0, t0 = 0, raf = null, running = false;

  /* ---------- بيانات الشموع ---------- */
  var candles = [];
  var shift = 0;
  var price = 100, target = 100;
  var lo = 90, hi = 110;

  function makeCandle(open) {
    var move = (Math.random() - 0.46) * 5.2;
    var close = open + move;
    var pad = 0.6 + Math.random() * 2.2;
    return {
      o: open,
      c: close,
      h: Math.max(open, close) + pad,
      l: Math.min(open, close) - pad
    };
  }

  function seed() {
    candles = [];
    var p = 100;
    for (var i = 0; i < NUM + 1; i++) {
      var k = makeCandle(p);
      candles.push(k);
      p = k.c;
    }
    price = target = p;
  }

  /* ---------- الإسقاط المنظوري ---------- */
  function project(x, y, z) {
    var ca = Math.cos(angle), sa = Math.sin(angle);
    var rx = x * ca - z * sa;
    var rz = x * sa + z * ca;
    var s = FOV / (rz + CAM_Z);
    return {
      x: cx + rx * s * fit,
      y: cy + (y + CAM_Y) * s * fit,
      s: s * fit,
      z: rz
    };
  }

  /* تحويل السعر إلى إحداثي رأسي في العالم */
  function yOf(p) {
    var span = Math.max(hi - lo, 1);
    return FLOOR - ((p - lo) / span) * CHART_H;
  }

  function xOf(i) {
    return (i - shift - (NUM - 1) / 2) * SPACING;
  }

  /* ---------- الأرضية الشبكية ---------- */
  function drawGrid(time) {
    var step = 62;
    var scroll = (time * 0.018) % step;
    var i, a, p1, p2;

    ctx.lineWidth = 1;

    /* خطوط عرضية تتقدم نحو المشاهد */
    for (i = 0; i < 11; i++) {
      var z = -140 + i * step + scroll;
      a = 0.13 * (1 - Math.max(0, z) / 760);
      if (a <= 0.005) continue;
      p1 = project(-300, FLOOR + 2, z);
      p2 = project(300, FLOOR + 2, z);
      ctx.strokeStyle = "rgba(" + DIM + "," + a.toFixed(3) + ")";
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }

    /* خطوط طولية تتلاشى في العمق */
    for (i = -4; i <= 4; i++) {
      p1 = project(i * 68, FLOOR + 2, -140);
      p2 = project(i * 68, FLOOR + 2, 620);
      var g = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
      g.addColorStop(0, "rgba(" + DIM + ",0.14)");
      g.addColorStop(1, "rgba(" + DIM + ",0)");
      ctx.strokeStyle = g;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  }

  /* ---------- رسم صندوق ثلاثي الأبعاد (جسم الشمعة) ---------- */
  function quad(a, b, c, d, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }

  function drawCandle(x, yTop, yBot, glowLevel) {
    var corners = [
      [x - HALF_W, -HALF_D], [x + HALF_W, -HALF_D],
      [x + HALF_W, HALF_D], [x - HALF_W, HALF_D]
    ];
    var top = [], bot = [], i;
    for (i = 0; i < 4; i++) {
      top.push(project(corners[i][0], yTop, corners[i][1]));
      bot.push(project(corners[i][0], yBot, corners[i][1]));
    }

    /* ترتيب الأوجه من الأبعد إلى الأقرب */
    var faces = [];
    for (i = 0; i < 4; i++) {
      var j = (i + 1) % 4;
      faces.push({
        z: (top[i].z + top[j].z) / 2,
        pts: [top[i], top[j], bot[j], bot[i]]
      });
    }
    faces.sort(function (a, b) { return b.z - a.z; });

    var base = 0.10 + glowLevel * 0.16;
    for (i = 0; i < 4; i++) {
      var f = faces[i];
      var lit = base + (i / 3) * 0.16;
      quad(f.pts[0], f.pts[1], f.pts[2], f.pts[3],
           "rgba(" + GREEN + "," + lit.toFixed(3) + ")",
           "rgba(" + GREEN + "," + (0.32 + glowLevel * 0.4).toFixed(3) + ")");
    }

    /* الوجه العلوي المضيء */
    ctx.shadowColor = "rgba(" + GREEN + "," + (0.5 + glowLevel * 0.5).toFixed(2) + ")";
    ctx.shadowBlur = (10 + glowLevel * 16) * fit;
    quad(top[0], top[1], top[2], top[3],
         "rgba(" + GREEN + "," + (0.5 + glowLevel * 0.4).toFixed(3) + ")", null);
    ctx.shadowBlur = 0;
  }

  function drawCandles(beamX) {
    var order = [], i;
    for (i = 0; i < NUM + 1; i++) order.push(i);

    for (var n = 0; n < order.length; n++) {
      i = order[n];
      var k = candles[i];
      if (!k) continue;
      var x = xOf(i);
      if (x < -260 || x > 260) continue;

      var close = (i === candles.length - 1) ? price : k.c;
      var yO = yOf(k.o), yC = yOf(close);
      var yTop = Math.min(yO, yC), yBot = Math.max(yO, yC);
      if (yBot - yTop < 3) yBot = yTop + 3;

      /* قرب شعاع المسح => توهج أقوى */
      var d = Math.abs(x - beamX);
      var glow = Math.max(0, 1 - d / 30);

      /* الفتيل */
      var wt = project(x, yOf(k.h), 0);
      var wb = project(x, yOf(k.l), 0);
      ctx.strokeStyle = "rgba(" + GREEN + "," + (0.28 + glow * 0.45).toFixed(3) + ")";
      ctx.lineWidth = Math.max(1, 1.4 * wt.s);
      ctx.beginPath();
      ctx.moveTo(wt.x, wt.y);
      ctx.lineTo(wb.x, wb.y);
      ctx.stroke();

      drawCandle(x, yTop, yBot, glow);
    }
  }

  /* ---------- خط السعر المتحرك ---------- */
  function drawLine(time) {
    var pts = [], i;
    for (i = 0; i < NUM + 1; i++) {
      var k = candles[i];
      if (!k) continue;
      var x = xOf(i);
      if (x < -270 || x > 270) continue;
      var c = (i === candles.length - 1) ? price : k.c;
      pts.push(project(x, yOf(c) - 12, -16));
    }
    if (pts.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (i = 1; i < pts.length - 1; i++) {
      var mx = (pts[i].x + pts[i + 1].x) / 2;
      var my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);

    ctx.shadowColor = "rgba(" + GREEN + ",0.85)";
    ctx.shadowBlur = 14 * fit;
    ctx.strokeStyle = "rgba(" + GREEN + ",0.75)";
    ctx.lineWidth = Math.max(1.2, 2 * fit);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.shadowBlur = 0;

    /* نبضة تتحرك على الخط */
    var idx = (time * 0.00028) % 1;
    var f = idx * (pts.length - 1);
    var a = pts[Math.floor(f)], b = pts[Math.min(pts.length - 1, Math.floor(f) + 1)];
    var lt = f - Math.floor(f);
    var px = a.x + (b.x - a.x) * lt, py = a.y + (b.y - a.y) * lt;

    ctx.shadowColor = "rgba(" + GREEN + ",1)";
    ctx.shadowBlur = 16 * fit;
    ctx.fillStyle = "rgba(220,255,200,0.95)";
    ctx.beginPath();
    ctx.arc(px, py, Math.max(1.6, 2.6 * fit), 0, 6.2832);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  /* ---------- روبوت التداول الآلي (EA) ---------- */
  function drawRobot(time, beamX) {
    var bob = Math.sin(time * 0.0013) * 3.4;
    var ry = -FLOOR - 46 + bob;
    var r = project(beamX, ry, -30);
    var s = r.s;

    /* شعاع المسح */
    var landL = project(beamX - 16, FLOOR - 4, 0);
    var landR = project(beamX + 16, FLOOR - 4, 0);
    var grad = ctx.createLinearGradient(r.x, r.y, landL.x, landL.y);
    grad.addColorStop(0, "rgba(" + GREEN + ",0.20)");
    grad.addColorStop(1, "rgba(" + GREEN + ",0)");
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(r.x - 3 * s, r.y + 5 * s);
    ctx.lineTo(landL.x, landL.y);
    ctx.lineTo(landR.x, landR.y);
    ctx.lineTo(r.x + 3 * s, r.y + 5 * s);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.scale(s, s);

    /* هوائي مع مؤشر نبضي */
    ctx.strokeStyle = "rgba(" + GREEN + ",0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(0, -14);
    ctx.stroke();
    var blink = 0.45 + 0.55 * Math.abs(Math.sin(time * 0.0035));
    ctx.shadowColor = "rgba(" + GREEN + ",1)";
    ctx.shadowBlur = 8;
    ctx.fillStyle = "rgba(" + GREEN + "," + blink.toFixed(2) + ")";
    ctx.beginPath();
    ctx.arc(0, -15.5, 1.8, 0, 6.2832);
    ctx.fill();
    ctx.shadowBlur = 0;

    /* الجناحان الجانبيان */
    ctx.fillStyle = "rgba(" + GREEN + ",0.16)";
    ctx.strokeStyle = "rgba(" + GREEN + ",0.4)";
    [-1, 1].forEach(function (dir) {
      ctx.beginPath();
      ctx.moveTo(dir * 9, -3);
      ctx.lineTo(dir * 16, 0);
      ctx.lineTo(dir * 9, 3.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });

    /* جسم الروبوت */
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(-10, -9.5, 20, 18, 5);
    } else {
      ctx.rect(-10, -9.5, 20, 18);
    }
    ctx.fillStyle = "rgba(10,20,8,0.92)";
    ctx.fill();
    ctx.strokeStyle = "rgba(" + GREEN + ",0.55)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    /* الشاشة/العين مع مسح أفقي */
    var vg = ctx.createLinearGradient(-7, 0, 7, 0);
    vg.addColorStop(0, "rgba(" + GREEN + ",0.25)");
    vg.addColorStop(0.5, "rgba(" + GREEN + ",0.95)");
    vg.addColorStop(1, "rgba(" + GREEN + ",0.25)");
    ctx.shadowColor = "rgba(" + GREEN + ",0.9)";
    ctx.shadowBlur = 10;
    ctx.fillStyle = vg;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-7, -5, 14, 6, 3);
    else ctx.rect(-7, -5, 14, 6);
    ctx.fill();
    ctx.shadowBlur = 0;

    /* مؤشرات بيانات أسفل الجسم */
    for (var i = 0; i < 3; i++) {
      var a = 0.25 + 0.6 * Math.abs(Math.sin(time * 0.004 + i));
      ctx.fillStyle = "rgba(" + GREEN + "," + a.toFixed(2) + ")";
      ctx.fillRect(-5 + i * 4, 3.5, 2.2, 2.2);
    }

    ctx.restore();
  }

  /* ---------- التحديث ---------- */
  function update(dt, time) {
    angle = 0.17 * Math.sin(time * 0.00021);

    /* تمرير الشموع */
    shift += dt * 0.00042;
    if (shift >= 1) {
      shift -= 1;
      candles.shift();
      candles.push(makeCandle(price));
      target = candles[candles.length - 1].c;
    }

    /* حركة سعر ناعمة للشمعة الحالية */
    target += (Math.random() - 0.5) * 0.55;
    price += (target - price) * Math.min(1, dt * 0.004);

    /* نطاق سعري متدرج لتفادي القفزات */
    var mn = Infinity, mx = -Infinity;
    for (var i = 0; i < candles.length; i++) {
      if (candles[i].l < mn) mn = candles[i].l;
      if (candles[i].h > mx) mx = candles[i].h;
    }
    var pad = (mx - mn) * 0.12 + 1;
    lo += ((mn - pad) - lo) * Math.min(1, dt * 0.002);
    hi += ((mx + pad) - hi) * Math.min(1, dt * 0.002);
  }

  /* ---------- الرسم ---------- */
  function draw(time) {
    ctx.clearRect(0, 0, W, H);
    var beamX = Math.sin(time * 0.00034) * (SPACING * 3.6);
    drawGrid(time);
    drawCandles(beamX);
    drawLine(time);
    drawRobot(time, beamX);
  }

  /* ---------- الحلقة ---------- */
  var last = 0;
  function loop(now) {
    if (!running) return;
    if (!t0) { t0 = now; last = now; }
    var dt = Math.min(50, now - last);
    last = now;
    update(dt, now - t0);
    draw(now - t0);
    raf = requestAnimationFrame(loop);
  }

  function start() {
    if (running || reduced) return;
    running = true;
    last = 0; t0 = 0;
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  /* ---------- القياس والاستجابة ---------- */
  function resize() {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = rect.width; H = rect.height;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = W / 2;
    cy = H * 0.46;
    fit = W / BASE_W;
    if (reduced) draw(0);
  }

  seed();
  resize();

  if (window.ResizeObserver) {
    new ResizeObserver(resize).observe(canvas);
  } else {
    window.addEventListener("resize", resize);
  }

  /* إيقاف الرسم خارج الشاشة أو عند إخفاء التبويب — توفير للبطارية */
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) start(); else stop();
    }, { threshold: 0.05 }).observe(canvas);
  } else {
    start();
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop();
    else if (!reduced) start();
  });
})();