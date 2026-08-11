/* نسخ اسم المستخدم إلى الحافظة */
(function () {
  "use strict";

  function ready(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  ready(function () {
    var btn    = document.getElementById("copyBtn");
    var user   = document.getElementById("tgUser");
    var status = document.getElementById("copyStatus");
    if (!btn || !user) return;
    var timer;

    /* طريقة احتياطية للمتصفحات القديمة أو الصفحات غير المؤمّنة
       (متوافقة مع iOS/Safari) */
    function fallbackCopy(text) {
      var field = document.createElement("textarea");
      field.value = text;
      field.setAttribute("readonly", "");
      field.contentEditable = "true";
      field.style.position = "fixed";
      field.style.top = "0";
      field.style.left = "0";
      field.style.width = "1px";
      field.style.height = "1px";
      field.style.padding = "0";
      field.style.border = "none";
      field.style.opacity = "0";
      field.style.fontSize = "16px";   /* يمنع تكبير الشاشة على iOS */
      document.body.appendChild(field);

      var scrollY = window.pageYOffset;
      field.focus();
      field.select();
      /* iOS لا يكتفي بـ select() */
      if (field.setSelectionRange) {
        field.setSelectionRange(0, text.length);
      }

      var ok;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }

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
      } catch (e) { /* تجاهل */ }
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

    btn.addEventListener("click", function (e) {
      e.preventDefault();
      var text = (user.textContent || "").trim();
      if (!text) return;

      /* الطريقة الاحتياطية تُنفَّذ الآن داخل حدث النقر مباشرةً،
         لأن execCommand يفشل إذا استُدعي بعد انتهاء تفاعل المستخدم */
      var copied = fallbackCopy(text);

      if (copied) {
        showResult(true);
        return;
      }

      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(
          function () { showResult(true); },
          function () { showResult(false); }
        );
      } else {
        showResult(false);
      }
    });
  });
})();