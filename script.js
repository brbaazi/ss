/* ============================================================
   رسم متحرك ثلاثي الأبعاد خفيف (EA)
   - لا يبدأ إلا بعد تحميل الصفحة والصور بالكامل
   - جودة مخفّضة تلقائيًا على الهواتف
   - يتوقف تمامًا خارج الشاشة أو عند إخفاء التبويب
   ============================================================ */
(function () {
  "use strict";

  var canvas = document.getElementById("eaCanvas");
  if (!canvas || !canvas.getContext) return;

  var reduced = window.matchMedia &&
                window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- مستوى الجودة حسب الجهاز ---------- */
  var MOBILE = (window.innerWidth < 700) ||
               (navigator.maxTouchPoints > 0 && window.innerWidth < 900);

  var NUM      = MOBILE ? 7 : 10;      /* عدد الشموع */
  var ROWS     = MOBILE ? 4 : 6;       /* خطوط الأرضية */
  var COLS     = MOBILE ? 0 : 3;       /* خطوط العمق */
  var DPR_CAP  = MOBILE ? 1.25 : 1.75;
  var FPS      = MOBILE ? 30 : 45;
  var GLOW     = !MOBILE;              /* تعطيل shadowBlur على الهاتف */
  var MIN_DT   = 1000 / FPS;

  var ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });

  /* ---------- ثوابت ---------- */
  var G = "126,217,87";
  var BASE_W = 480;
  var FOV = 900, CAM_Z = 900, CAM_Y = 6;
  var FLOOR = 58, CHART_H = 96, SPACING = 26;
  var HALF_W = 7, HALF_D = 7;

  var W = 0, H = 0, cx = 0, cy = 0, fit = 1;
  var ca = 1, sa = 0;                  /* جيب/جيب تمام محسوبان مرة لكل إطار */
  var raf = null, running = false, started = false;
  var t0 = 0, last = 0;

  /* ---------- بيانات ---------- */
  var candles = [], shift = 0;
  var price = 100, target = 100;
  var lo = 90, hi = 110, loT = 90, hiT = 110;

  function makeCandle(open) {
    var close = open + (Math.random() - 0.46) * 5.2;
    var pad = 0.6 + Math.random() * 2.2;
    return {
      o: open, c: close,
      h: (open > close ? open : close) + pad,
      l: (open < close ? open : close) - pad
    };
  }

  /* يُحسب نطاق السعر عند إضافة شمعة فقط — لا في كل إطار */
  function recalcRange() {
    var mn = Infinity, mx = -Infinity;
    for (var i = 0; i < candles.length; i++) {
      if (candles[i].l < mn) mn = candles[i].l;
      if (candles[i].h > mx) mx = candles[i].h;
    }
    var pad = (mx - mn) * 0.12 + 1;
    loT = mn - pad;
    hiT = mx + pad;
  }

  function seed() {
    candles.length = 0;
    var p = 100;
    for (var i = 0; i < NUM + 1; i++) {
      var k = makeCandle(p);
      candles.push(k);
      p = k.c;
    }
    price = target = p;
    recalcRange();
    lo = loT; hi = hiT;
  }

  /* ---------- الإسقاط (بدون trig داخلي) ---------- */
  var _px = 0, _py = 0, _ps = 0, _pz = 0;
  function proj(x, y, z) {
    var rx = x * ca - z * sa;
    _pz = x * sa + z * ca;
    _ps = (FOV / (_pz + CAM_Z)) * fit;
    _px = cx + rx * _ps;
    _py = cy + (y + CAM_Y) * _ps;
  }

  function yOf(p) {
    return FLOOR - ((p - lo) / (hi - lo || 1)) * CHART_H;
  }
  function xOf(i) {
    return (i - shift - (NUM - 1) / 2) * SPACING;
  }

  /* مصفوفات معاد استخدامها — لا تخصيص ذاكرة داخل الحلقة */
  var tx = new Float32Array(4), ty = new Float32Array(4);
  var bx = new Float32Array(4), by = new Float32Array(4);
  var CX = [-HALF_W, HALF_W, HALF_W, -HALF_W];
  var CZ = [-HALF_D, -HALF_D, HALF_D, HALF_D];

  function drawGrid(time) {
    var step = 62, scroll = (time * 0.018) % step, i, a, z;

    ctx.lineWidth = 1;
    for (i = 0; i < ROWS; i++) {
      z = -120 + i * step * 1.6 + scroll;
      a = 0.13 * (1 - (z > 0 ? z : 0) / 760);
      if (a <= 0.008) continue;
      ctx.strokeStyle = "rgba(" + G + "," + a.toFixed(3) + ")";
      ctx.beginPath();
      proj(-300, FLOOR + 2, z); ctx.moveTo(_px, _py);
      proj(300, FLOOR + 2, z);  ctx.lineTo(_px, _py);
      ctx.stroke();
    }

    for (i = 0; i < COLS; i++) {
      var xx = (i - 1) * 86;
      proj(xx, FLOOR + 2, -120); var ax = _px, ay = _py;
      proj(xx, FLOOR + 2, 520);
      var g = ctx.createLinearGradient(ax, ay, _px, _py);
      g.addColorStop(0, "rgba(" + G + ",0.13)");
      g.addColorStop(1, "rgba(" + G + ",0)");
      ctx.strokeStyle = g;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(_px, _py);
      ctx.stroke();
    }
  }

  function face(i, j, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(tx[i], ty[i]);
    ctx.lineTo(tx[j], ty[j]);
    ctx.lineTo(bx[j], by[j]);
    ctx.lineTo(bx[i], by[i]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  function drawCandles(beamX) {
    var i, n;
    ctx.lineWidth = 1;

    for (n = 0; n < candles.length; n++) {
      var k = candles[n];
      var x = xOf(n);
      if (x < -250 || x > 250) continue;

      var close = (n === candles.length - 1) ? price : k.c;
      var yO = yOf(k.o), yC = yOf(close);
      var yTop = yO < yC ? yO : yC;
      var yBot = yO < yC ? yC : yO;
      if (yBot - yTop < 3) yBot = yTop + 3;

      var d = x - beamX; if (d < 0) d = -d;
      var glow = d < 30 ? 1 - d / 30 : 0;

      /* الفتيل */
      proj(x, yOf(k.h), 0); var wtx = _px, wty = _py, ws = _ps;
      proj(x, yOf(k.l), 0);
      ctx.strokeStyle = "rgba(" + G + "," + (0.26 + glow * 0.45).toFixed(3) + ")";
      ctx.lineWidth = ws * 1.4 > 1 ? ws * 1.4 : 1;
      ctx.beginPath();
      ctx.moveTo(wtx, wty);
      ctx.lineTo(_px, _py);
      ctx.stroke();
      ctx.lineWidth = 1;

      /* زوايا الصندوق */
      for (i = 0; i < 4; i++) {
        proj(x + CX[i], yTop, CZ[i]); tx[i] = _px; ty[i] = _py;
        proj(x + CX[i], yBot, CZ[i]); bx[i] = _px; by[i] = _py;
      }

      var edge = "rgba(" + G + "," + (0.3 + glow * 0.42).toFixed(3) + ")";
      /* الوجه الجانبي المرئي فقط (حسب اتجاه الدوران) — بدل أربعة أوجه */
      if (sa > 0) face(1, 2, "rgba(" + G + ",0.09)", null);
      else        face(3, 0, "rgba(" + G + ",0.09)", null);
      /* الوجه الأمامي */
      face(0, 1, "rgba(" + G + "," + (0.15 + glow * 0.14).toFixed(3) + ")", edge);

      /* الوجه العلوي المضيء */
      if (GLOW && glow > 0.02) {
        ctx.shadowColor = "rgba(" + G + ",0.8)";
        ctx.shadowBlur = 12 * glow * fit;
      }
      ctx.beginPath();
      ctx.moveTo(tx[0], ty[0]);
      ctx.lineTo(tx[1], ty[1]);
      ctx.lineTo(tx[2], ty[2]);
      ctx.lineTo(tx[3], ty[3]);
      ctx.closePath();
      ctx.fillStyle = "rgba(" + G + "," + (0.45 + glow * 0.45).toFixed(3) + ")";
      ctx.fill();
      if (ctx.shadowBlur) ctx.shadowBlur = 0;
    }
  }

  var lpx = new Float32Array(16), lpy = new Float32Array(16), lpn = 0;

  function drawLine(time) {
    var i;
    lpn = 0;
    for (i = 0; i < candles.length; i++) {
      var x = xOf(i);
      if (x < -260 || x > 260) continue;
      var c = (i === candles.length - 1) ? price : candles[i].c;
      proj(x, yOf(c) - 12, -16);
      lpx[lpn] = _px; lpy[lpn] = _py; lpn++;
    }
    if (lpn < 2) return;

    ctx.beginPath();
    ctx.moveTo(lpx[0], lpy[0]);
    for (i = 1; i < lpn - 1; i++) {
      ctx.quadraticCurveTo(lpx[i], lpy[i],
        (lpx[i] + lpx[i + 1]) / 2, (lpy[i] + lpy[i + 1]) / 2);
    }
    ctx.lineTo(lpx[lpn - 1], lpy[lpn - 1]);

    if (GLOW) {
      ctx.shadowColor = "rgba(" + G + ",0.8)";
      ctx.shadowBlur = 12 * fit;
    }
    ctx.strokeStyle = "rgba(" + G + ",0.72)";
    ctx.lineWidth = fit * 2 > 1.2 ? fit * 2 : 1.2;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
    ctx.shadowBlur = 0;

    /* نبضة متحركة */
    var f = ((time * 0.00028) % 1) * (lpn - 1);
    var i0 = f | 0, lt = f - i0, i1 = i0 + 1 < lpn ? i0 + 1 : i0;
    ctx.fillStyle = "rgba(215,255,195,0.95)";
    ctx.beginPath();
    ctx.arc(lpx[i0] + (lpx[i1] - lpx[i0]) * lt,
            lpy[i0] + (lpy[i1] - lpy[i0]) * lt,
            fit * 2.4 > 1.6 ? fit * 2.4 : 1.6, 0, 6.2832);
    ctx.fill();
  }

  function drawRobot(time, beamX) {
    var ry = -FLOOR - 46 + Math.sin(time * 0.0013) * 3.4;
    proj(beamX, ry, -30);
    var rx = _px, rry = _py, s = _ps;

    /* شعاع المسح */
    proj(beamX - 15, FLOOR - 4, 0); var l1x = _px, l1y = _py;
    proj(beamX + 15, FLOOR - 4, 0);
    var grad = ctx.createLinearGradient(rx, rry, l1x, l1y);
    grad.addColorStop(0, "rgba(" + G + ",0.18)");
    grad.addColorStop(1, "rgba(" + G + ",0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(rx - 3 * s, rry + 5 * s);
    ctx.lineTo(l1x, l1y);
    ctx.lineTo(_px, _py);
    ctx.lineTo(rx + 3 * s, rry + 5 * s);
    ctx.closePath();
    ctx.fill();

    ctx.save();
    ctx.translate(rx, rry);
    ctx.scale(s, s);

    /* هوائي + مؤشر نبضي */
    ctx.strokeStyle = "rgba(" + G + ",0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(0, -14);
    ctx.stroke();
    ctx.fillStyle = "rgba(" + G + "," +
      (0.45 + 0.55 * Math.abs(Math.sin(time * 0.0035))).toFixed(2) + ")";
    ctx.beginPath();
    ctx.arc(0, -15.5, 1.8, 0, 6.2832);
    ctx.fill();

    /* الجناحان */
    ctx.fillStyle = "rgba(" + G + ",0.16)";
    ctx.strokeStyle = "rgba(" + G + ",0.4)";
    ctx.beginPath();
    ctx.moveTo(-9, -3); ctx.lineTo(-16, 0); ctx.lineTo(-9, 3.5); ctx.closePath();
    ctx.moveTo(9, -3);  ctx.lineTo(16, 0);  ctx.lineTo(9, 3.5);  ctx.closePath();
    ctx.fill(); ctx.stroke();

    /* الجسم */
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-10, -9.5, 20, 18, 5);
    else ctx.rect(-10, -9.5, 20, 18);
    ctx.fillStyle = "rgba(10,20,8,0.92)";
    ctx.fill();
    ctx.strokeStyle = "rgba(" + G + ",0.55)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    /* الشاشة/العين */
    if (GLOW) {
      ctx.shadowColor = "rgba(" + G + ",0.9)";
      ctx.shadowBlur = 8;
    }
    ctx.fillStyle = "rgba(" + G + ",0.9)";
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-7, -5, 14, 6, 3);
    else ctx.rect(-7, -5, 14, 6);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();
  }

  /* ---------- التحديث ---------- */
  function update(dt, time) {
    var a = 0.17 * Math.sin(time * 0.00021);
    ca = Math.cos(a); sa = Math.sin(a);

    shift += dt * 0.00042;
    if (shift >= 1) {
      shift -= 1;
      candles.shift();
      candles.push(makeCandle(price));
      target = candles[candles.length - 1].c;
      recalcRange();
    }

    target += (Math.random() - 0.5) * 0.55;
    var e1 = dt * 0.004; if (e1 > 1) e1 = 1;
    price += (target - price) * e1;

    var e2 = dt * 0.002; if (e2 > 1) e2 = 1;
    lo += (loT - lo) * e2;
    hi += (hiT - hi) * e2;
  }

  function draw(time) {
    ctx.clearRect(0, 0, W, H);
    var beamX = Math.sin(time * 0.00034) * (SPACING * 3.2);
    drawGrid(time);
    drawCandles(beamX);
    drawLine(time);
    drawRobot(time, beamX);
  }

  /* ---------- الحلقة مع تحديد معدل الإطارات ---------- */
  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    var dt = now - last;
    if (dt < MIN_DT) return;          /* تخطي الإطار — توفير معالجة */
    last = now - (dt % MIN_DT);
    if (dt > 100) dt = 100;
    update(dt, now - t0);
    draw(now - t0);
  }

  function start() {
    if (running || reduced) return;
    running = true;
    var now = performance.now();
    if (!t0) t0 = now;
    last = now;
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    running = false;
    if (raf) { cancelAnimationFrame(raf); raf = null; }
  }

  /* ---------- القياس ---------- */
  function resize() {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      setTimeout(resize, 200);   /* لم يُحسب الحجم بعد — أعد المحاولة */
      return;
    }
    var d = window.devicePixelRatio || 1;
    if (d > DPR_CAP) d = DPR_CAP;
    W = rect.width; H = rect.height;
    canvas.width = (W * d) | 0;
    canvas.height = (H * d) | 0;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    cx = W / 2;
    cy = H * 0.46;
    fit = W / BASE_W;
    if (reduced || !running) draw(t0 ? performance.now() - t0 : 0);
  }

  /* ---------- التهيئة المؤجلة ---------- */
  function init() {
    if (started) return;
    started = true;

    seed();
    ca = 1; sa = 0;
    resize();
    canvas.classList.add("is-ready");

    if (reduced) return;

    var rt;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(resize, 150);
    }, { passive: true });

    if (window.IntersectionObserver) {
      new IntersectionObserver(function (e) {
        if (e[0].isIntersecting) start(); else stop();
      }, { threshold: 0, rootMargin: "120px" }).observe(canvas);
      /* أمان: إذا لم يعمل المراقب لأي سبب، شغّل الرسم يدويًا */
      setTimeout(function () {
        if (!running && !document.hidden) start();
      }, 1200);
    } else {
      start();
    }

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop(); else start();
    });
  }

  /* لا يبدأ أي عمل قبل اكتمال تحميل الصفحة والصور */
  function schedule() {
    if (window.requestIdleCallback) requestIdleCallback(init, { timeout: 1500 });
    else setTimeout(init, 250);
  }

  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
})();