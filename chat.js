/* NAL website chat widget — self-contained. Backend: nal-chat Worker (https://chat.naltx.com/chat).
 * Add to the page: <link rel="stylesheet" href="chat.css"> and <script src="chat.js" defer></script>
 * Optional: <script src="chat.js" data-endpoint="https://chat.naltx.com/chat" defer></script> */
(function () {
  "use strict";
  if (window.__nalChatLoaded) return;
  window.__nalChatLoaded = true;

  var script = document.currentScript || document.querySelector('script[src*="chat.js"]');
  var ENDPOINT = (script && script.getAttribute("data-endpoint")) || "https://chat.naltx.com/chat";
  var STORE_KEY = "nalChat.v2";
  var BASE = ENDPOINT.replace(/\/chat\/?$/, "");
  var MAX_LEN = 800;

  var L = {
    en: {
      title: "NAL Assistant", sub: "Products · pricing · orders",
      hello: "Hi! I'm the North America Lighting assistant. Ask me about our commercial LED products, prices, shipping, tax or warranty. Need a person? Tap “Talk to a person”.",
      ph: "Type your question…", send: "Send", human: "Talk to a person", open: "Chat with us", close: "Close chat",
      formTitle: "Connect with our team", name: "Name *", email: "Email", phone: "Phone", note: "What do you need? (optional)",
      need: "Please enter your name and an email or phone number.", submit: "Send to team", cancel: "Cancel",
      err: "Sorry, something went wrong. Please try again, or call (214) 631-6666.", typing: "Typing…",
      privacy: "AI assistant — answers may be imperfect. Final prices, tax and freight are confirmed on the invoice.", clear: "New chat",
      menu: "More options", liveNow: "Chat with a person now", callback: "Request a callback", leave: "Leave email/phone",
      cbTitle: "Request a callback", cbName: "Name *", cbPhone: "Phone *", cbTime: "Preferred time to call", cbIssue: "What can we help with?",
      cbTimes: ["As soon as possible", "Morning (9am–12pm CT)", "Afternoon (12–5pm CT)", "Evening (5–7pm CT)"], cbSubmit: "Request callback",
      badPhone: "Please enter a valid phone number (10 digits, or + and country code).", joined: "A team member has joined the chat.",
      left: "The team member has left. The AI assistant is back to help.", closed: "This chat was closed by our team. Thank you!",
      team: "NAL team", waitingSub: "Waiting for a team member…", agentSub: "Chatting with NAL team",
    },
    zh: {
      title: "NAL 在线助手", sub: "产品 · 价格 · 下单",
      hello: "您好！我是 North America Lighting 在线助手，可以解答商用 LED 产品、价格、运费、税费和保修等问题。需要人工？请点“联系人工客服”。",
      ph: "请输入您的问题…", send: "发送", human: "联系人工客服", open: "在线咨询", close: "关闭",
      formTitle: "联系我们的团队", name: "姓名 *", email: "邮箱", phone: "电话", note: "您的需求（选填）",
      need: "请填写姓名，以及邮箱或电话。", submit: "提交给团队", cancel: "取消",
      err: "抱歉，出了点问题。请重试，或致电 (214) 631-6666。", typing: "正在输入…",
      privacy: "AI 助手回答仅供参考，最终价格、税费和运费以发票为准。", clear: "新对话",
      menu: "更多选项", liveNow: "立即联系人工客服", callback: "申请电话回拨", leave: "留下邮箱/电话",
      cbTitle: "申请电话回拨", cbName: "姓名 *", cbPhone: "电话 *", cbTime: "方便接听的时间", cbIssue: "需要咨询的问题",
      cbTimes: ["尽快", "上午（9–12 点，美中时间）", "下午（12–5 点，美中时间）", "傍晚（5–7 点，美中时间）"], cbSubmit: "提交回拨申请",
      badPhone: "请输入有效的电话号码（10 位数字，或 + 国家代码）。", joined: "工作人员已加入对话。",
      left: "工作人员已离开，AI 助手将继续为您服务。", closed: "本次对话已由工作人员结束，谢谢！",
      team: "NAL 团队", waitingSub: "正在等待工作人员…", agentSub: "正在与 NAL 团队对话",
    },
    es: {
      title: "Asistente NAL", sub: "Productos · precios · pedidos",
      hello: "¡Hola! Soy el asistente de North America Lighting. Pregúnteme sobre nuestros productos LED comerciales, precios, envío, impuestos o garantía. ¿Prefiere una persona? Toque “Hablar con una persona”.",
      ph: "Escriba su pregunta…", send: "Enviar", human: "Hablar con una persona", open: "Chatee con nosotros", close: "Cerrar",
      formTitle: "Contactar a nuestro equipo", name: "Nombre *", email: "Correo", phone: "Teléfono", note: "¿Qué necesita? (opcional)",
      need: "Ingrese su nombre y un correo o teléfono.", submit: "Enviar al equipo", cancel: "Cancelar",
      err: "Lo siento, algo salió mal. Intente de nuevo o llame al (214) 631-6666.", typing: "Escribiendo…",
      privacy: "Asistente de IA: las respuestas pueden tener errores. Precios, impuestos y flete finales se confirman en la factura.", clear: "Nuevo chat",
      menu: "Más opciones", liveNow: "Hablar con una persona ahora", callback: "Solicitar una llamada", leave: "Dejar correo/teléfono",
      cbTitle: "Solicitar una llamada", cbName: "Nombre *", cbPhone: "Teléfono *", cbTime: "Hora preferida para llamar", cbIssue: "¿En qué podemos ayudarle?",
      cbTimes: ["Lo antes posible", "Mañana (9–12, hora del centro)", "Tarde (12–5, hora del centro)", "Noche (5–7, hora del centro)"], cbSubmit: "Solicitar llamada",
      badPhone: "Ingrese un teléfono válido (10 dígitos, o + y código de país).", joined: "Un miembro del equipo se unió al chat.",
      left: "El miembro del equipo salió. El asistente de IA sigue aquí para ayudarle.", closed: "Nuestro equipo cerró este chat. ¡Gracias!",
      team: "Equipo NAL", waitingSub: "Esperando a un miembro del equipo…", agentSub: "Chateando con el equipo NAL",
    },
  };
  function browserLang() {
    var list = [];
    try {
      if (navigator.languages && navigator.languages.length) {
        for (var i = 0; i < navigator.languages.length; i++) list.push(navigator.languages[i]);
      }
    } catch (e) {}
    if (navigator.language) list.push(navigator.language);
    if (navigator.userLanguage) list.push(navigator.userLanguage);
    for (var i = 0; i < list.length; i++) {
      var l = String(list[i] || "").toLowerCase().replace(/_/g, "-");
      if (!l) continue;
      // First preferred language wins: zh* Chinese, es* Spanish, otherwise English.
      if (l.indexOf("zh") === 0) return "zh";
      if (l.indexOf("es") === 0) return "es";
      return "en";
    }
    return "en";
  }

  var state = load() || { sessionId: newId(), messages: [], lang: "en", open: false, handedOff: false, mode: "ai", lastId: 0 };
  if (!state.mode) state.mode = "ai";
  if (!state.lastId) state.lastId = 0;
  // Always follow the current browser/system language for widget chrome (button, title, placeholder, greeting, forms).
  // Do not keep a previous session's lang, and do not let message-detected language lock the UI on Chinese.
  state.lang = browserLang();
  function t(k) { return (L[state.lang] || L.en)[k]; }
  function newId() {
    var a = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return "s" + Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  function load() { try { return JSON.parse(sessionStorage.getItem(STORE_KEY)); } catch (e) { return null; } }
  function save() { try { sessionStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {} }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  // Safe rendering: text nodes + links only for naltx.com URLs, phone and email.
  function renderRich(container, text) {
    var re = /(https:\/\/(?:www\.)?naltx\.com[^\s)）,，。]*)|(\(214\) 631-6666)|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
    var last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) container.appendChild(document.createTextNode(text.slice(last, m.index)));
      var a = document.createElement("a");
      if (m[1]) { a.href = m[1]; a.textContent = m[1].replace(/^https:\/\/(www\.)?naltx\.com\/?/, "naltx.com/").replace(/\/$/, "") || "naltx.com"; }
      else if (m[2]) { a.href = "tel:+12146316666"; a.textContent = m[2]; }
      else { a.href = "mailto:" + m[3]; a.textContent = m[3]; }
      if (m[1] && location.hostname.replace(/^www\./, "") === "naltx.com") a.href = m[1].replace(/^https:\/\/(www\.)?naltx\.com/, "");
      container.appendChild(a);
      last = re.lastIndex;
    }
    if (last < text.length) container.appendChild(document.createTextNode(text.slice(last)));
  }

  /* ---------- DOM ---------- */
  var ICON = {
    chat: '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.2 3.6c-.5.4-1.3.1-1.3-.6V16A2.5 2.5 0 0 1 4 13.5z" fill="currentColor"/></svg>',
    more: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><circle cx="5" cy="12" r="1.8" fill="currentColor"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/><circle cx="19" cy="12" r="1.8" fill="currentColor"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    send: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5z" fill="currentColor"/></svg>',
  };
  var root = el("div", "nalc-root");
  root.setAttribute("data-open", state.open ? "1" : "0");
  var bubble = el("button", "nalc-bubble");
  bubble.type = "button";
  bubble.innerHTML = ICON.chat + '<span class="nalc-bubble-label"></span><span class="nalc-dot" hidden></span>';
  var panel = el("section", "nalc-panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");

  var head = el("header", "nalc-head");
  var headText = el("div", "nalc-head-text");
  var hTitle = el("div", "nalc-title"), hSub = el("div", "nalc-sub");
  headText.appendChild(hTitle); headText.appendChild(hSub);
  var menuBtn = el("button", "nalc-icon-btn"); menuBtn.type = "button"; menuBtn.innerHTML = ICON.more;
  menuBtn.setAttribute("aria-haspopup", "menu"); menuBtn.setAttribute("aria-expanded", "false");
  var closeBtn = el("button", "nalc-icon-btn"); closeBtn.type = "button"; closeBtn.innerHTML = ICON.close;
  head.appendChild(headText); head.appendChild(menuBtn); head.appendChild(closeBtn);

  var menu = el("div", "nalc-menu"); menu.setAttribute("role", "menu"); menu.hidden = true;
  function menuItem(key, fn) {
    var b = el("button", "nalc-menu-item"); b.type = "button"; b.setAttribute("role", "menuitem"); b.dataset.k = key;
    b.onclick = function () { closeMenu(); fn(); };
    menu.appendChild(b); return b;
  }

  var log = el("div", "nalc-log");
  log.setAttribute("aria-live", "polite");

  var formWrap = el("div", "nalc-form-wrap");
  var foot = el("div", "nalc-foot");
  var chips = el("div", "nalc-chips");
  var form = el("form", "nalc-input");
  var ta = el("textarea"); ta.rows = 1; ta.maxLength = MAX_LEN;
  var sendBtn = el("button", "nalc-send"); sendBtn.type = "submit"; sendBtn.innerHTML = ICON.send;
  form.appendChild(ta); form.appendChild(sendBtn);
  var note = el("div", "nalc-note");
  foot.appendChild(chips); foot.appendChild(form); foot.appendChild(note);

  panel.appendChild(head); panel.appendChild(menu); panel.appendChild(log); panel.appendChild(formWrap); panel.appendChild(foot);
  root.appendChild(panel); root.appendChild(bubble);

  function chip(key, fn, primary) {
    var b = el("button", "nalc-chip" + (primary ? " nalc-chip-primary" : "")); b.type = "button"; b.dataset.k = key;
    b.textContent = t(key); b.onclick = fn; return b;
  }
  // Which quick actions to show under the log.
  function renderChips(kind) {
    chips.innerHTML = "";
    if (kind === "handoff") {
      if (state.mode !== "agent" && state.mode !== "waiting") chips.appendChild(chip("liveNow", requestLive, true));
      chips.appendChild(chip("callback", function () { showCallbackForm(); }));
      chips.appendChild(chip("leave", function () { showContactForm(""); }));
    } else if (kind === "waiting") {
      chips.appendChild(chip("callback", function () { showCallbackForm(); }));
      chips.appendChild(chip("leave", function () { showContactForm(""); }));
    } else {
      chips.appendChild(chip("human", requestLive));
    }
  }

  function applyLabels() {
    bubble.setAttribute("aria-label", t("open"));
    bubble.querySelector(".nalc-bubble-label").textContent = t("open");
    panel.setAttribute("aria-label", t("title"));
    hTitle.textContent = t("title");
    hSub.textContent = state.mode === "agent" ? t("agentSub") : state.mode === "waiting" ? t("waitingSub") : t("sub");
    menuBtn.setAttribute("aria-label", t("menu")); menuBtn.title = t("menu");
    closeBtn.setAttribute("aria-label", t("close"));
    menu.querySelectorAll(".nalc-menu-item").forEach(function (b) { b.textContent = t(b.dataset.k); });
    chips.querySelectorAll(".nalc-chip").forEach(function (b) { b.textContent = t(b.dataset.k); });
    ta.placeholder = t("ph"); ta.setAttribute("aria-label", t("ph"));
    sendBtn.setAttribute("aria-label", t("send"));
    note.textContent = t("privacy");
    root.setAttribute("data-mode", state.mode);
  }

  function addMsg(role, text) {
    var cls = role === "user" ? "user" : role === "system" ? "system" : role === "agent" ? "agent" : role === "notice" ? "notice" : "bot";
    var row = el("div", "nalc-msg nalc-" + cls);
    if (role === "agent") row.appendChild(el("div", "nalc-who", t("team")));
    var b = el("div", "nalc-text");
    if (role === "user") b.textContent = text; else renderRich(b, text);
    row.appendChild(b);
    log.appendChild(row);
    log.scrollTop = log.scrollHeight;
    return row;
  }
  function renderLog() {
    log.innerHTML = "";
    addMsg("assistant", t("hello"));
    state.messages.forEach(function (m) { addMsg(m.role, m.content); });
  }
  function push(role, content) {
    state.messages.push({ role: role, content: content });
    if (state.messages.length > 60) state.messages = state.messages.slice(-60);
    addMsg(role, content); save();
  }

  var busy = false, typingRow = null;
  function setBusy(b) {
    busy = b; sendBtn.disabled = b; ta.disabled = b;
    if (b) { typingRow = addMsg("system", ""); typingRow.classList.add("nalc-typing"); typingRow.firstChild.innerHTML = "<span></span><span></span><span></span>"; typingRow.setAttribute("aria-label", t("typing")); }
    else if (typingRow) { typingRow.remove(); typingRow = null; }
  }

  // Server only accepts user/assistant roles; team replies count as assistant context.
  function wireMessages() {
    return state.messages.filter(function (m) { return m.role === "user" || m.role === "assistant" || m.role === "agent"; })
      .map(function (m) { return { role: m.role === "user" ? "user" : "assistant", content: m.content }; }).slice(-20);
  }
  function post(path, payload) {
    payload.sessionId = state.sessionId;
    payload.page = location.href.slice(0, 300);
    if (!payload.lang) payload.lang = state.lang;
    payload.messages = wireMessages();
    return fetch(BASE + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { d.__status = r.status; return d; }); });
  }
  // UI language stays on the visitor's browser/system language; AI replies may still use a detected language.
  function setMode(m) {
    if (!m || m === state.mode) return;
    state.mode = m; save(); applyLabels();
    if (m === "waiting") renderChips("waiting");
    else if (m === "agent") chips.innerHTML = "";
    else renderChips("");
    schedulePoll(true);
  }

  function send(text) {
    text = String(text || "").trim().slice(0, MAX_LEN);
    if (!text || busy) return;
    push("user", text);
    var agentMode = state.mode === "agent";
    if (!agentMode) setBusy(true);
    post("/chat", {}).then(function (d) {
      if (!agentMode) setBusy(false);
      if (d.status) setMode(d.status === "closed" ? "ai" : d.status);
      if (d.mode === "agent" || d.reply === null) return; // a team member will answer
      push("assistant", d.reply || d.error || t("err"));
      if ((d.handoff || d.suggestCallback) && state.mode !== "agent") renderChips("handoff");
    }).catch(function () { if (!agentMode) setBusy(false); addMsg("assistant", t("err")); });
  }

  function requestLive() {
    if (busy) return;
    setBusy(true);
    post("/chat/handoff", { lang: state.lang }).then(function (d) {
      setBusy(false);
      push("assistant", d.reply || d.error || t("err"));
      if (d.status) setMode(d.status);
    }).catch(function () { setBusy(false); addMsg("assistant", t("err")); });
  }

  /* ---------- forms ---------- */
  function field(label, type, name, auto, max) {
    var wrap = el("label", "nalc-field");
    wrap.appendChild(el("span", null, label));
    var inp = type === "textarea" ? el("textarea") : type === "select" ? el("select") : el("input");
    if (type !== "textarea" && type !== "select") inp.type = type;
    inp.name = name; if (auto) inp.autocomplete = auto;
    if (type !== "select") inp.maxLength = max || (type === "textarea" ? 1000 : 160);
    if (type === "textarea") inp.rows = 2;
    wrap.appendChild(inp);
    return wrap;
  }
  function formShell(title, submitLabel, onSubmit) {
    formWrap.innerHTML = "";
    var f = el("form", "nalc-contact");
    f.appendChild(el("div", "nalc-form-title", title));
    var body = el("div", "nalc-form-body"); f.appendChild(body);
    var err = el("div", "nalc-form-err"); err.hidden = true; f.appendChild(err);
    var actions = el("div", "nalc-actions");
    var cancel = el("button", "nalc-btn-ghost", t("cancel")); cancel.type = "button";
    var ok = el("button", "nalc-btn-gold", submitLabel); ok.type = "submit";
    actions.appendChild(cancel); actions.appendChild(ok); f.appendChild(actions);
    cancel.onclick = function () { formWrap.innerHTML = ""; };
    f.onsubmit = function (ev) { ev.preventDefault(); err.hidden = true; onSubmit(f, ok, function (msg) { err.textContent = msg; err.hidden = false; }); };
    formWrap.appendChild(f);
    return { f: f, body: body };
  }
  function validPhone(p) {
    var s = String(p || "").trim(), d = s.replace(/\D/g, "");
    if (s.charAt(0) === "+") return d.length >= 8 && d.length <= 15;
    return d.length === 10 || (d.length === 11 && d.charAt(0) === "1");
  }
  function showContactForm(reason) {
    var x = formShell(t("formTitle"), t("submit"), function (f, ok, fail) {
      var E = f.elements;
      var c = { name: E.namedItem("name").value.trim(), email: E.namedItem("email").value.trim(), phone: E.namedItem("phone").value.trim(), note: E.namedItem("note").value.trim() };
      if (!c.name || (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.email) && (c.phone.match(/\d/g) || []).length < 7)) return fail(t("need"));
      ok.disabled = true;
      post("/chat/handoff", { contact: c, reason: reason, lang: state.lang }).then(function (d) {
        ok.disabled = false;
        if (d.__status >= 400 && !d.reply) return fail(d.error || t("err"));
        formWrap.innerHTML = ""; state.handedOff = true;
        push("assistant", d.reply || t("err"));
        if (d.status) setMode(d.status);
      }).catch(function () { ok.disabled = false; fail(t("err")); });
    });
    x.body.appendChild(field(t("name"), "text", "name", "name"));
    var two = el("div", "nalc-two");
    two.appendChild(field(t("email"), "email", "email", "email"));
    two.appendChild(field(t("phone"), "tel", "phone", "tel", 40));
    x.body.appendChild(two);
    x.body.appendChild(field(t("note"), "textarea", "note"));
    focusFirst(x.f);
  }
  function showCallbackForm() {
    var x = formShell(t("cbTitle"), t("cbSubmit"), function (f, ok, fail) {
      var E = f.elements;
      var cb = { name: E.namedItem("name").value.trim(), phone: E.namedItem("phone").value.trim(), prefTime: E.namedItem("prefTime").value, issue: E.namedItem("issue").value.trim() };
      if (!cb.name) return fail(t("need"));
      if (!validPhone(cb.phone)) return fail(t("badPhone"));
      ok.disabled = true;
      post("/chat/callback", { callback: cb, lang: state.lang }).then(function (d) {
        ok.disabled = false;
        if (d.error) return fail(d.error);
        formWrap.innerHTML = "";
        push("assistant", d.reply || t("err"));
      }).catch(function () { ok.disabled = false; fail(t("err")); });
    });
    x.body.appendChild(field(t("cbName"), "text", "name", "name"));
    x.body.appendChild(field(t("cbPhone"), "tel", "phone", "tel", 40));
    var sel = field(t("cbTime"), "select", "prefTime");
    t("cbTimes").forEach(function (o) { var op = el("option", null, o); op.value = o; sel.querySelector("select").appendChild(op); });
    x.body.appendChild(sel);
    x.body.appendChild(field(t("cbIssue"), "textarea", "issue"));
    focusFirst(x.f);
  }
  function focusFirst(f) { setTimeout(function () { try { f.elements.namedItem("name").focus(); } catch (e) {} }, 50); }

  /* ---------- live polling (team replies) ---------- */
  var pollTimer = null, polling = false;
  var SYS = { agent_joined: "joined", agent_left: "left", chat_closed: "closed" };
  function schedulePoll(now) {
    clearTimeout(pollTimer);
    if (state.mode !== "waiting" && state.mode !== "agent") return;
    var delay = now ? 300 : (document.visibilityState === "visible" ? (state.open ? 3000 : 6000) : 15000);
    pollTimer = setTimeout(poll, delay);
  }
  function poll() {
    if (polling) return;
    polling = true;
    fetch(BASE + "/chat/poll?sessionId=" + encodeURIComponent(state.sessionId) + "&after=" + (state.lastId || 0))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        polling = false;
        (d.messages || []).forEach(function (m) {
          state.lastId = Math.max(state.lastId || 0, m.id);
          if (m.role === "agent") { push("agent", m.content); notifyUnread(); }
          else if (m.role === "system" && SYS[m.content]) push("notice", t(SYS[m.content]));
        });
        save();
        if (d.status) setMode(d.status === "closed" ? "ai" : d.status);
        schedulePoll(false);
      })
      .catch(function () { polling = false; schedulePoll(false); });
  }
  function notifyUnread() {
    if (state.open && document.visibilityState === "visible") return;
    bubble.querySelector(".nalc-dot").hidden = false;
  }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible") schedulePoll(true); });

  /* ---------- open / close / menu ---------- */
  function setOpen(o) {
    state.open = o; save();
    root.setAttribute("data-open", o ? "1" : "0");
    bubble.setAttribute("aria-expanded", o ? "true" : "false");
    if (o) { bubble.querySelector(".nalc-dot").hidden = true; log.scrollTop = log.scrollHeight; setTimeout(function () { ta.focus(); }, 60); }
    else closeMenu();
  }
  function closeMenu() { menu.hidden = true; menuBtn.setAttribute("aria-expanded", "false"); }
  menuItem("human", requestLive);
  menuItem("callback", function () { showCallbackForm(); });
  menuItem("leave", function () { showContactForm(""); });
  menuItem("clear", function () {
    state = { sessionId: newId(), messages: [], lang: state.lang, open: true, handedOff: false, mode: "ai", lastId: 0 };
    formWrap.innerHTML = ""; save(); renderLog(); renderChips(""); applyLabels(); schedulePoll();
  });
  menuBtn.onclick = function () { menu.hidden = !menu.hidden; menuBtn.setAttribute("aria-expanded", menu.hidden ? "false" : "true"); };
  document.addEventListener("click", function (e) { if (!menu.hidden && !menu.contains(e.target) && !menuBtn.contains(e.target)) closeMenu(); });

  bubble.onclick = function () { setOpen(root.getAttribute("data-open") !== "1"); };
  closeBtn.onclick = function () { setOpen(false); bubble.focus(); };
  form.onsubmit = function (e) { e.preventDefault(); var v = ta.value; ta.value = ""; autosize(); send(v); };
  ta.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.onsubmit(e); } });
  function autosize() { ta.style.height = "auto"; ta.style.height = Math.min(ta.scrollHeight, 120) + "px"; }
  ta.addEventListener("input", autosize);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && state.open) { if (!menu.hidden) closeMenu(); else setOpen(false); } });

  function mount() {
    document.body.appendChild(root);
    renderChips(state.mode === "waiting" ? "waiting" : state.mode === "agent" ? "none" : "");
    if (state.mode === "agent") chips.innerHTML = "";
    applyLabels(); renderLog(); setOpen(!!state.open && window.innerWidth > 640);
    schedulePoll(true);
  }
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
})();
