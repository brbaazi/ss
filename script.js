/* نسخ اسم المستخدم إلى الحافظة */
(function () {
  "use strict";

  var btn    = document.getElementById("copyBtn");
  var user   = document.getElementById("tgUser");
  var status = document.getElementById("copyStatus");
  var timer;

  /* طريقة احتياطية للمتصفحات القديمة أو الصفحات غير المؤمّنة */
  function fallbackCopy(text) {
    var field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();

    var ok;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }

    document.body.removeChild(field);
    return ok;
  }

  /* إظهار النتيجة على الزر وإعلانها لقارئ الشاشة */
  function showResult(ok) {
    btn.textContent = ok ? "تم النسخ" : "انسخ يدويًا";
    btn.classList.add("done");
    status.textContent = ok ? "تم نسخ اسم المستخدم" : "تعذّر النسخ، حدّد الاسم وانسخه يدويًا";

    clearTimeout(timer);
    timer = setTimeout(function () {
      btn.textContent = "نسخ";
      btn.classList.remove("done");
      status.textContent = "";
    }, 2000);
  }

  btn.addEventListener("click", function () {
    var text = user.textContent.trim();

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(
        function () { showResult(true); },
        function () { showResult(fallbackCopy(text)); }
      );
    } else {
      showResult(fallbackCopy(text));
    }
  });
})();