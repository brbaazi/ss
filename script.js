/* نسخ اسم المستخدم إلى الحافظة */
(function () {
  "use strict";

  function init() {
    var btn    = document.getElementById("copyBtn");
    var user   = document.getElementById("tgUser");
    var status = document.getElementById("copyStatus");

    if (!btn || !user) {
      console.error("[copy] العنصر غير موجود:",
        { copyBtn: !!btn, tgUser: !!user });
      return;
    }

    console.log("[copy] v8 جاهز");
    var timer;

    /* الطريقة الاحتياطية — للمتصفحات القديمة أو الصفحات غير المؤمّنة */
    function fallbackCopy(text) {
      var ok = false;
      var field = document.createElement("textarea");
      field.value = text;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.top = "0";
      field.style.left = "0";
      field.style.width = "1px";
      field.style.height = "1px";
      field.style.padding = "0";
      field.style.border = "none";
      field.style.outline = "none";
      field.style.boxShadow = "none";
      field.style.background = "transparent";
      field.style.fontSize = "16px";      /* يمنع تكبير الشاشة على iOS */
      document.body.appendChild(field);

      var scrollY = window.pageYOffset;
      try {
        field.focus();
        field.select();
        if (field.setSelectionRange) {
          field.setSelectionRange(0, text.length);  /* لازم على iOS */
        }
        ok = document.execCommand("copy");
      } catch (err) {
        ok = false;
      }

      document.body.removeChild(field);
      window.scrollTo(0, scrollY);
      return ok;
    }

    /* تحديد الاسم على الشاشة ليتمكن المستخدم من نسخه يدويًا */
    function selectUsername() {
      try {
        var range = document.createRange();
        range.selectNodeContents(user);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (err) { /* تجاهل */ }
    }

    /* إظهار النتيجة على الزر وإعلانها لقارئ الشاشة */
    function showResult(ok) {
      btn.textContent = ok ? "تم النسخ" : "انسخ يدويًا";
      btn.classList.add("done");
      if (status) {
        status.textContent = ok
          ? "تم نسخ اسم المستخدم"
          : "تعذّر النسخ، حدّد الاسم وانسخه يدويًا";
      }
      if (!ok) selectUsername();

      clearTimeout(timer);
      timer = setTimeout(function () {
        btn.textContent = "نسخ";
        btn.classList.remove("done");
        if (status) status.textContent = "";
      }, 2000);
    }

    btn.addEventListener("click", function () {
      var text = (user.textContent || "").trim();
      if (!text) { showResult(false); return; }

      /* الطريقة الحديثة أولاً */
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(
          function () { showResult(true); },
          function () { showResult(fallbackCopy(text)); }
        );
      } else {
        showResult(fallbackCopy(text));
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();