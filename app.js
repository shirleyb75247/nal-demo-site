(function () {
  const CART_KEY = "nal-demo-cart";
  const ORDER_KEY = "nal-demo-orders";
  const SHIPPING_KEY = "nal-demo-shipping";
  const ORDER_EMAIL = "naltx75247@gmail.com";
  const SITE_TITLE = "NAL-Commercial LED Wholesaler";
  const ORIGIN_ZIP = "75247";
  // Empty keeps the email-only order flow. Set to a Cloudflare Worker URL
  // (see /worker) to show "Pay with card (Square)". Never put a Square token here.
  // Primary API is the first-party custom domain; workers.dev remains deployed.
  const PAYMENT_PROXY_URL = "https://api.naltx.com";
  // When set to the Worker origin (see /worker), auth, tax exemption, and tax
  // calculation use the server API instead of this browser-only demo.
  const API_BASE_URL = "https://api.naltx.com";

  const ACCOUNT_KEY = "nal-demo-accounts";
  const SESSION_KEY = "nal-demo-session";
  const APPLY_KEY = "nal-demo-applications";

  // All sales-tax rates and nexus rules live in this one config object.
  const TAX_CONFIG = {
    originState: "TX",
    originZip: "75247",
    originCity: "Dallas",
    // NAL is assumed to have sales-tax nexus only in Texas unless updated here.
    nexusStates: ["TX"],
    texas: {
      stateRate: 0.0625,
      localRate: 0.02, // Dallas local portion
      combinedRate: 0.0825,
      // In Texas, delivery charges on taxable items are taxable.
      shippingTaxable: true,
    },
  };

  const WARRANTY_BADGE_TEXT = "1 Year Free Replacement";

  // Homepage Promotion area. Swap, add, or remove entries to change
  // currently promoted products. `image` and `label` override the catalog
  // thumbnail and name when set; `badge` is an optional on-image label.
  const HOME_PROMOS = [
    { slug: "high-bay-ufo-light" },
    { slug: "wall-pack", badge: "Tempered Glass Lens" },
    { slug: "down-light" },
    { slug: "flood-light" },
  ];
  const PROMO_INTERVAL_MS = 3000;

  // Installation page YouTube how-tos.
  // To swap a video later (e.g. when NAL records its own), edit ONLY this object.
  // The page embeds via youtube-nocookie; do not download or rehost the files.
  // Note: ToolboxDIY's 2020 "UPDATED" video (VKEQ1HCLW5c) is not used for
  // single-ended wiring — that video itself points back to SCWoI0X4jw0.
  const INSTALL_VIDEOS = {
    singleEnded: {
      id: "SCWoI0X4jw0",
      title: "How to easily convert fluorescent Lights to LED –Easy Ways to Save Money",
      channel: "ToolboxDIY",
      url: "https://www.youtube.com/watch?v=SCWoI0X4jw0",
    },
    doubleEnded: {
      id: "QMcT9jdhK9w",
      title: "Rewire Fluorescent to Led Lights - Using Double-Ended Tubes",
      channel: "Mr. Hardware",
      url: "https://www.youtube.com/watch?v=QMcT9jdhK9w",
    },
  };
  const INSTALL_PRODUCT_SLUG = "tube-4ft-bypass-compatible";

  const state = {
    catalog: null,
    cart: loadCart(),
    shipping: loadShipping(),
  };

  const $app = () => document.getElementById("app");

  function loadCart() {
    try {
      const raw = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }
  function saveCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
    updateCartCounts();
  }

  function defaultShipping() {
    return { method: "", zip: "", estimate: null };
  }

  function loadShipping() {
    try {
      const raw = JSON.parse(localStorage.getItem(SHIPPING_KEY) || "null");
      if (!raw || typeof raw !== "object") return defaultShipping();
      return Object.assign(defaultShipping(), raw);
    } catch {
      return defaultShipping();
    }
  }

  function saveShipping() {
    localStorage.setItem(SHIPPING_KEY, JSON.stringify(state.shipping));
  }
  function loadOrders() {
    try {
      const raw = JSON.parse(localStorage.getItem(ORDER_KEY) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }
  function saveOrders(orders) {
    localStorage.setItem(ORDER_KEY, JSON.stringify(orders));
  }

  /* ---------- tax, accounts, warranty (demo, browser-only unless API_BASE_URL is set) ---------- */

  function loadJson(key, fallback) {
    try {
      const raw = JSON.parse(localStorage.getItem(key) || "null");
      return raw == null ? fallback : raw;
    } catch {
      return fallback;
    }
  }
  function saveJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
  function loadAccounts() {
    const raw = loadJson(ACCOUNT_KEY, []);
    return Array.isArray(raw) ? raw : [];
  }
  function saveAccounts(list) {
    saveJson(ACCOUNT_KEY, list);
  }
  function loadApplications() {
    const raw = loadJson(APPLY_KEY, []);
    return Array.isArray(raw) ? raw : [];
  }
  function saveApplications(list) {
    saveJson(APPLY_KEY, list);
  }
  function sessionEmail() {
    const s = loadJson(SESSION_KEY, null);
    return s && s.email ? String(s.email).toLowerCase() : "";
  }
  function isSignedIn() {
    return !!currentAccount();
  }
  function currentAccount() {
    const email = sessionEmail();
    if (!email) return null;
    return findAccountByEmail(email);
  }
  function findAccountByEmail(email) {
    const key = String(email || "").trim().toLowerCase();
    if (!key) return null;
    return loadAccounts().find((a) => a.email === key) || null;
  }
  function setSession(email, token) {
    if (!email) {
      localStorage.removeItem(SESSION_KEY);
      return;
    }
    const prev = loadJson(SESSION_KEY, null) || {};
    const next = {
      email: String(email).toLowerCase(),
      createdAt: prev.createdAt || new Date().toISOString(),
    };
    const tok = token || prev.token || "";
    if (tok) next.token = tok;
    saveJson(SESSION_KEY, next);
  }

  function sessionToken() {
    const s = loadJson(SESSION_KEY, null);
    return s && s.token ? String(s.token) : "";
  }

  function authHeaders(extra) {
    const headers = Object.assign({}, extra || {});
    const token = sessionToken();
    if (token && !headers.Authorization) headers.Authorization = "Bearer " + token;
    return headers;
  }
  // Customer language for the back office (zh / es / en), same rule as chat.js:
  // the visitor's first preferred browser language wins; anything else is English.
  function siteLang() {
    var list = [];
    try {
      if (navigator.languages && navigator.languages.length) list = list.concat(Array.from(navigator.languages));
    } catch (e) {}
    if (navigator.language) list.push(navigator.language);
    for (var i = 0; i < list.length; i++) {
      var l = String(list[i] || "").toLowerCase();
      if (!l) continue;
      if (l.indexOf("zh") === 0) return "zh";
      if (l.indexOf("es") === 0) return "es";
      return "en";
    }
    return "en";
  }
  function upsertAccount(account) {
    const list = loadAccounts();
    const i = list.findIndex((a) => a.email === account.email);
    if (i >= 0) list[i] = account;
    else list.push(account);
    saveAccounts(list);
    return account;
  }
  function newId(prefix) {
    return (
      prefix +
      "-" +
      Date.now().toString(36).toUpperCase() +
      "-" +
      Math.random().toString(36).slice(2, 8).toUpperCase()
    );
  }

  async function hashPassword(password, saltB64) {
    const enc = new TextEncoder();
    const salt = saltB64
      ? Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0))
      : crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
      key,
      256
    );
    const hash = btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(bits))));
    const saltOut = btoa(String.fromCharCode.apply(null, Array.from(salt)));
    return { hash, salt: saltOut, iterations: 100000 };
  }
  async function verifyPassword(password, record) {
    if (!record || !record.hash || !record.salt) return false;
    const { hash } = await hashPassword(password, record.salt);
    return hash === record.hash;
  }

  function apiEnabled() {
    return !!(API_BASE_URL && String(API_BASE_URL).trim());
  }
  async function apiFetch(path, opts) {
    const base = String(API_BASE_URL).replace(/\/$/, "");
    const options = Object.assign({ credentials: "include" }, opts || {});
    options.headers = authHeaders(options.headers);
    const res = await fetch(base + path, options);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed (" + res.status + ")");
    return data;
  }

  function isTexasZip(zip) {
    const z = normalizeZip(zip);
    if (!z) return false;
    const n = parseInt(z, 10);
    if (n >= 75000 && n <= 79999) return true;
    if (n >= 88500 && n <= 88599) return true;
    if (z.slice(0, 3) === "733") return true;
    return false;
  }

  function isTaxExemptAccount(account) {
    return !!(account && account.exemption && account.exemption.status === "approved");
  }

  function computeTax({ subtotal, shippingAmount, method, destZip, account }) {
    const cfg = TAX_CONFIG;
    if (isTaxExemptAccount(account)) {
      return {
        amount: 0,
        rate: 0,
        label: "Tax exempt — permit #" + (account.exemption.permitNumber || "on file"),
        appliesToShipping: cfg.texas.shippingTaxable,
        jurisdiction: "exempt",
        estimated: false,
        exempt: true,
        taxableBase: 0,
        pending: false,
        note: "A signed-in, approved resale exemption is on this account. Sales tax is not charged.",
      };
    }
    if (!method || (method === "ship" && shippingAmount == null && !normalizeZip(destZip))) {
      return { amount: null, rate: null, label: "Sales tax", pending: true, exempt: false };
    }
    const inTX = method === "pickup" || isTexasZip(destZip);
    const inNexus = inTX && cfg.nexusStates.indexOf("TX") >= 0;
    if (!inNexus) {
      return {
        amount: 0,
        rate: 0,
        label: "Sales tax (out of state — no nexus)",
        appliesToShipping: false,
        jurisdiction: "none",
        estimated: false,
        exempt: false,
        taxableBase: 0,
        pending: false,
        note: "No sales tax is collected on shipments outside Texas. NAL is assumed to have nexus only in Texas. Shipping charges are also not taxed on out-of-state orders.",
      };
    }
    const rate = cfg.texas.combinedRate;
    const ship = cfg.texas.shippingTaxable ? shippingAmount || 0 : 0;
    const base = (subtotal || 0) + ship;
    const amount = Math.round(base * rate);
    const pickup = method === "pickup";
    return {
      amount,
      rate,
      label: pickup ? "Sales tax (Dallas, TX 8.25%)" : "Sales tax (TX estimate, 8.25%)",
      appliesToShipping: true,
      jurisdiction: pickup ? "Dallas, TX" : "Texas",
      estimated: !pickup,
      exempt: false,
      taxableBase: base,
      pending: false,
      note: pickup
        ? "Dallas combined rate of 8.25% (6.25% state + 2% local). In Texas, delivery charges on taxable items are taxable. Warehouse pickup is taxed at the Dallas location rate."
        : "Estimated at the 8.25% origin combined rate. Texas generally sources sales tax for in-state sellers to the origin. Final tax is confirmed on the invoice. In Texas, delivery charges on taxable items are taxable, so this estimate includes tax on shipping.",
    };
  }

  function currentTax() {
    const { subtotal } = cartTotals();
    const method = state.shipping.method;
    const destZip =
      method === "pickup"
        ? TAX_CONFIG.originZip
        : (state.shipping.estimate && state.shipping.estimate.destZip) || state.shipping.zip;
    const signedIn = currentAccount();
    return computeTax({
      subtotal,
      shippingAmount: shippingReady() ? shippingAmount() : null,
      method,
      destZip,
      account: signedIn,
    });
  }

  // Sold AS IS (no warranty, no returns, no Extended Warranty). The two [SALE] items count as
  // clearance per Shirley (2026-11-23). Keep in step with isClearanceVariation() in the nal-api Worker.
  const CLEARANCE_SLUGS = ["flood-light", "parking-street-decorative-hg"];
  function isClearance(p) {
    if (!p) return false;
    if (CLEARANCE_SLUGS.indexOf(p.slug) >= 0) return true;
    const bits = [p.name, p.displayName, p.category, p.description].concat(p.badges || []);
    return bits.some((s) => String(s || "").toLowerCase().includes("clearance"));
  }
  const CLEARANCE_NOTE_TEXT = "Clearance — sold AS IS, no warranty, no returns.";
  function clearanceNoteHtml(p, compact) {
    if (!isClearance(p)) return "";
    return compact
      ? '<div class="clearance-note compact">Sold AS IS · No warranty</div>'
      : '<p class="clearance-note">' + escapeHtml(CLEARANCE_NOTE_TEXT) + ' <a href="#/warranty-returns">Details</a></p>';
  }
  // Square text on some clearance items still says "1 yr exchange warranty"; clearance is AS IS, so hide that phrase.
  function productDescription(p) {
    const d = String((p && p.description) || "");
    if (!isClearance(p)) return d;
    return d
      .replace(/,?\s*\b(1|one)[ -]?(yr|year)\.?\s+(exchange\s+|replacement\s+)?warranty\b/gi, "")
      .replace(/[ \t]+$/gm, "")
      .trim();
  }
  function warrantyBadgeHtml(p) {
    if (!p || isClearance(p)) return "";
    return '<span class="warranty-badge">' + escapeHtml(WARRANTY_BADGE_TEXT) + "</span>";
  }

  const LENS_BADGE_TEXT = "Tempered Glass Lens";
  const PRODUCT_FEATURES = {
    "wall-pack": [
      "Thick tempered glass lens, same construction as traditional wall packs — impact-resistant and UV-stable; will not yellow, haze, or degrade from sun exposure.",
    ],
  };

  function hasLensBadge(p) {
    return !!(p && p.slug === "wall-pack");
  }

  function lensBadgeHtml(p) {
    if (!hasLensBadge(p)) return "";
    return '<span class="lens-badge">' + escapeHtml(LENS_BADGE_TEXT) + "</span>";
  }

  function productFeatures(p) {
    if (p && Array.isArray(p.features) && p.features.length) return p.features;
    return (p && PRODUCT_FEATURES[p.slug]) || [];
  }

  function featuresHtml(p) {
    const items = productFeatures(p);
    if (!items.length) return "";
    return (
      '<div class="product-features">' +
      "<h2>Features</h2>" +
      "<ul>" +
      items.map((item) => "<li>" + escapeHtml(item) + "</li>").join("") +
      "</ul></div>"
    );
  }
  function guaranteeBannerHtml() {
    return (
      '<div class="guarantee-banner" role="region" aria-label="Replacement guarantee">' +
      '<svg class="shield" viewBox="0 0 24 24" aria-hidden="true" fill="none">' +
      '<path d="M12 2.5 4.5 5.5v6.2c0 5 3.3 8.6 7.5 9.8 4.2-1.2 7.5-4.8 7.5-9.8V5.5L12 2.5z" stroke="currentColor" stroke-width="1.7" fill="rgba(201,162,74,0.18)"/>' +
      '<path d="M8.2 12.1 11 15l4.8-6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>' +
      "</svg>" +
      "<div><strong>Premium Quality · 1-Year In-Store Replacement Guarantee</strong>" +
      "<p>Defective within 1 year? We replace it — bring it to our Dallas location or contact us. Clearance items are sold AS IS and are not covered.</p></div></div>"
    );
  }

  function updateAuthLinks() {
    const acc = currentAccount();
    document.querySelectorAll("[data-auth-link]").forEach((a) => {
      if (acc) {
        a.setAttribute("href", "#/account");
        a.textContent = "My account";
      } else {
        a.setAttribute("href", "#/signin");
        a.textContent = "Sign in";
      }
    });
  }

  function formErrorHtml(msg) {
    return msg ? '<p class="checkout-error" data-form-error>' + escapeHtml(msg) + "</p>" : "";
  }

  function emailPreviewHtml(mail) {
    if (!mail) return "";
    return (
      '<div class="email-preview" data-email-preview>' +
      "<h3>" +
      escapeHtml(mail.title || "Email preview (demo — not sent)") +
      "</h3>" +
      '<div class="mail-meta"><strong>To:</strong> ' +
      escapeHtml(mail.to) +
      "<br><strong>Subject:</strong> " +
      escapeHtml(mail.subject) +
      "</div>" +
      "<pre>" +
      escapeHtml(mail.body) +
      "</pre></div>"
    );
  }

  function lastMail() {
    return loadJson("nal-demo-last-mail", null);
  }
  function setLastMail(mail) {
    saveJson("nal-demo-last-mail", mail);
  }

  function validTexasPermit(num) {
    return /^\d{11}$/.test(String(num || "").replace(/\s+/g, ""));
  }

  async function registerAccount({ email, password, company, name, phone, address }) {
    const key = String(email || "").trim().toLowerCase();
    if (!key || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key)) throw new Error("Enter a valid email address.");
    if (!password || String(password).length < 8) throw new Error("Password must be at least 8 characters.");
    if (findAccountByEmail(key)) throw new Error("An account with this email already exists. Sign in instead.");
    if (apiEnabled()) {
      const data = await apiFetch("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: key, password, company, name, phone, address, lang: siteLang() }),
      });
      if (data.account) upsertAccount(data.account);
      setSession(key, data.sessionToken);
      return findAccountByEmail(key) || data.account || { email: key, company, name, phone, address };
    }
    const passwordRecord = await hashPassword(password);
    const account = {
      id: newId("ACC"),
      email: key,
      password: passwordRecord,
      company: (company || "").trim(),
      name: (name || "").trim(),
      phone: (phone || "").trim(),
      address: (address || "").trim(),
      createdAt: new Date().toISOString(),
      exemption: null,
    };
    upsertAccount(account);
    setSession(key);
    return account;
  }

  async function signIn(email, password) {
    const key = String(email || "").trim().toLowerCase();
    if (apiEnabled()) {
      const data = await apiFetch("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: key, password }),
      });
      if (data.account) upsertAccount(data.account);
      setSession(key, data.sessionToken);
      return true;
    }
    const acc = findAccountByEmail(key);
    if (!acc) throw new Error("No account found for that email.");
    const ok = await verifyPassword(password, acc.password);
    if (!ok) throw new Error("That password is not correct.");
    setSession(key);
    return acc;
  }

  async function signOut() {
    if (apiEnabled()) {
      try {
        await apiFetch("/logout", { method: "POST" });
      } catch (err) {
        /* local session is still cleared below */
      }
    }
    setSession("");
  }

  async function hydrateApiSession() {
    if (!apiEnabled() || (!sessionToken() && !sessionEmail())) return;
    try {
      const data = await apiFetch("/me");
      if (data && data.account) {
        upsertAccount(data.account);
        setSession(data.account.email, sessionToken());
        updateAuthLinks();
      }
    } catch (err) {
      if (sessionToken()) setSession("");
    }
  }

  function approveApplication(appId) {
    const apps = loadApplications();
    const app = apps.find((a) => a.id === appId);
    if (!app) return { error: "Application not found." };
    app.status = "approved";
    app.approvedAt = new Date().toISOString();
    saveApplications(apps);
    const acc = findAccountByEmail(app.email);
    if (acc) {
      acc.exemption = {
        status: "approved",
        permitNumber: app.permitNumber,
        permitState: app.permitState,
        legalName: app.legalName,
        applicationId: app.id,
        approvedAt: app.approvedAt,
      };
      upsertAccount(acc);
    }
    const mail = {
      title: "Customer approval email (demo — not sent)",
      to: app.email,
      subject: "Your NAL resale tax exemption was approved",
      body:
        "Hello " +
        (app.contactName || app.legalName || "") +
        ",\n\n" +
        "Your resale tax exemption application has been approved.\n" +
        "Permit / resale ID: " +
        app.permitNumber +
        " (" +
        app.permitState +
        ")\n\n" +
        "Sign in to the NAL site and check out — sales tax will show as $0.00 with your permit number.\n\n" +
        "North America Lighting LLC\n(214) 631-6666",
    };
    setLastMail(mail);
    return { app, mail };
  }


  function updateCartCounts() {
    const n = state.cart.reduce((s, l) => s + (l.qty || 0), 0);
    document.querySelectorAll("[data-cart-count]").forEach((el) => {
      el.textContent = String(n);
    });
  }

  /* Optional 1-year extended warranty add-on. The per-unit price comes from the
     nal-api Worker (/catalog -> extendedWarranty.prices); the Worker also prices
     it again at checkout, so the server is the source of truth. */
  const EW_LABEL = "1-Year Extended Warranty";
  const EW_LINE_LABEL = "Extended Warranty (1 yr)";
  function ewUnitPrice(variation) {
    const p = variation && variation.ewPrice;
    return typeof p === "number" && p > 0 ? p : null;
  }
  function lineWarrantyTotal(l) {
    return l && l.extendedWarranty && l.ewUnitPrice != null ? l.ewUnitPrice * l.qty : 0;
  }
  function lineTotal(l) {
    return l.price == null ? null : l.price * l.qty + lineWarrantyTotal(l);
  }
  function warrantySummaryLines(items) {
    const out = [];
    (items || []).forEach((l) => {
      if (!l.extendedWarranty || l.ewUnitPrice == null) return;
      out.push(
        EW_LINE_LABEL + " — " + l.name + (l.variationName ? " — " + l.variationName : "") +
        (l.sku ? " (SKU " + l.sku + ")" : "") +
        ": Qty " + l.qty + " x " + money(l.ewUnitPrice) + " = " + money(lineWarrantyTotal(l))
      );
    });
    return out;
  }
  const ewMemory = {};

  function money(cents) {
    if (cents == null) return "Call for price / request quote";
    return (cents / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });
  }

  function priceLabel(product) {
    if (!product.hasPrice) return "Call for price / request quote";
    if (product.priceMin === product.priceMax) return money(product.priceMin);
    return money(product.priceMin) + " – " + money(product.priceMax);
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function badgeClass(b) {
    const t = b.toLowerCase();
    if (t === "sale" || t.includes("sale")) return "sale";
    if (t === "clearance") return "clearance";
    if (t === "display") return "display";
    if (t === "ms35") return "ms35";
    return "";
  }

  function badgesHtml(badges) {
    if (!badges || !badges.length) return "";
    return (
      '<div class="badge-row">' +
      badges
        .map(
          (b) =>
            '<span class="badge ' +
            badgeClass(b) +
            '">' +
            escapeHtml(b) +
            "</span>"
        )
        .join("") +
      "</div>"
    );
  }

  function placeholderSvg() {
    return (
      '<svg class="placeholder-art" viewBox="0 0 120 120" fill="none" aria-hidden="true">' +
      '<rect x="34" y="18" width="52" height="8" rx="2" fill="currentColor" opacity="0.35"/>' +
      '<rect x="56" y="26" width="8" height="22" fill="currentColor" opacity="0.35"/>' +
      '<circle cx="60" cy="70" r="28" stroke="currentColor" stroke-width="6" opacity="0.45"/>' +
      '<circle cx="60" cy="70" r="10" fill="currentColor" opacity="0.3"/>' +
      "</svg>"
    );
  }

  let processedImages = {};

  function loadProcessedManifest() {
    return fetch("img/products/manifest.json")
      .then((r) => (r.ok ? r.json() : {}))
      .catch(function () { return {}; });
  }

  function processedImagePath(productId) {
    if (!productId || !processedImages[productId]) return "";
    const rec = processedImages[productId];
    if (typeof rec === "string") return rec;
    return (rec && rec.file) || "";
  }

  function remoteProductImage(product, variation) {
    if (variation && (variation.image || variation.thumb)) return variation.image || variation.thumb;
    if (!product) return "";
    return (product.thumbs && product.thumbs[0]) || (product.images && product.images[0]) || "";
  }

  function productImageUrl(product, variation) {
    return processedImagePath(product && product.id) || remoteProductImage(product, variation);
  }

  function thumbHtml(product, className) {
    const src = productImageUrl(product);
    if (src) {
      return (
        '<img src="' +
        escapeHtml(src) +
        '" alt="' +
        escapeHtml(product.displayName) +
        '">' +
        lensBadgeHtml(product)
      );
    }
    return placeholderSvg() + lensBadgeHtml(product);
  }

  function isVariationOos(v) {
    return !!(v && v.inventoryTracked && (v.available === false || !(Number(v.quantity) > 0)));
  }

  function isVariationSellable(v) {
    return !isVariationOos(v);
  }

  function productHasStock(p) {
    const vars = (p && p.variations) || [];
    if (!vars.length) return true;
    return vars.some(isVariationSellable);
  }

  function cartHasOutOfStock() {
    return (state.cart || []).some((l) => l.outOfStock);
  }

  function outOfStockLabel() {
    return '<div class="stock-flag">Out of stock</div>';
  }

  function isExcludedStorefrontItem(item, variations) {
    const name = String((item && (item.name || item.itemName)) || "").trim().toLowerCase();
    if (name === "shipping" || name === "delivery" || name === "freight" || name === "shipping fee") return true;
    const vars = variations || [];
    if (vars.some((v) => String(v.sku || "") === "8304455") && name === "shipping") return true;
    return false;
  }

  function slugifyName(value) {
    const s = String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
    return s || "item";
  }

  function refreshProductPricing(p) {
    const prices = (p.variations || []).map((v) => v.price).filter((x) => x != null);
    p.hasPrice = prices.length > 0;
    p.priceMin = prices.length ? Math.min.apply(null, prices) : null;
    p.priceMax = prices.length ? Math.max.apply(null, prices) : null;
    p.variationCount = (p.variations || []).length;
    return p;
  }

  function applyLiveVariation(localVar, live) {
    if (!live) return localVar;
    localVar.price = live.price != null ? live.price : localVar.price;
    if (live.name) localVar.name = live.name;
    if (live.sku) localVar.sku = live.sku;
    localVar.inventoryTracked = !!live.inventoryTracked;
    localVar.quantity = live.inventoryTracked ? live.quantity : null;
    localVar.available = live.available !== false;
    if (live.imageUrl && !localVar.image && !localVar.thumb) {
      localVar.image = live.imageUrl;
      localVar.thumb = live.imageUrl;
    }
    return localVar;
  }

  function newProductFromSquare(item, variations) {
    const name = item.name || "Untitled";
    const vars = variations.map((v) => ({
      id: v.id,
      name: v.name || "",
      sku: v.sku || "",
      price: v.price,
      pricingType: v.price != null ? "FIXED_PRICING" : "VARIABLE_PRICING",
      options: {},
      image: v.imageUrl || item.imageUrl || "",
      thumb: v.imageUrl || item.imageUrl || "",
      inventoryTracked: !!v.inventoryTracked,
      quantity: v.inventoryTracked ? v.quantity : null,
      available: v.available !== false,
    }));
    const img = item.imageUrl || (vars[0] && vars[0].image) || "";
    const category = item.category || "Uncategorized";
    return refreshProductPricing({
      id: item.id,
      name: name,
      displayName: name,
      description: item.description || "",
      category: category,
      categorySlug: item.categorySlug || slugifyName(category),
      currency: "USD",
      badges: [],
      images: img ? [img] : [],
      thumbs: img ? [img] : [],
      options: [],
      variations: vars,
      source: "square",
    });
  }

  function mergeLiveCatalog(local, snap) {
    const catalog = {
      company: local.company,
      categories: (local.categories || []).slice(),
      products: (local.products || []).map((p) => ({
        ...p,
        variations: (p.variations || []).map((v) => ({ ...v, options: v.options ? { ...v.options } : {} })),
      })),
    };
    if (!snap || !Array.isArray(snap.variations)) {
      catalog.products.forEach(refreshProductPricing);
      return catalog;
    }
    const byId = {};
    const bySku = {};
    const byItem = {};
    (snap.variations || []).forEach((v) => {
      byId[v.id] = v;
      if (v.sku) bySku[v.sku] = v;
      if (v.itemId) {
        if (!byItem[v.itemId]) byItem[v.itemId] = [];
        byItem[v.itemId].push(v);
      }
    });
    const matchedVarIds = new Set();
    catalog.products.forEach((p) => {
      (p.variations || []).forEach((v) => {
        const live = (v.id && byId[v.id]) || (v.sku && bySku[v.sku]) || null;
        if (!live) return;
        applyLiveVariation(v, live);
        matchedVarIds.add(live.id);
      });
      const liveItem = (snap.items || []).find((it) => it.id === p.id);
      if (liveItem && liveItem.name) p.name = liveItem.name;
      refreshProductPricing(p);
    });
    (snap.items || []).forEach((item) => {
      const vars = (item.variations || []).map((id) => byId[id]).filter(Boolean);
      if (isExcludedStorefrontItem(item, vars)) return;
      const already = catalog.products.some(
        (p) => p.id === item.id || (p.variations || []).some((v) => vars.some((lv) => lv.id === v.id || (lv.sku && v.sku === lv.sku)))
      );
      if (already) return;
      if (!vars.length) return;
      const product = newProductFromSquare(item, vars);
      catalog.products.push(product);
      vars.forEach((v) => matchedVarIds.add(v.id));
      if (product.categorySlug && !catalog.categories.some((c) => c.slug === product.categorySlug)) {
        catalog.categories.push({ name: product.category, slug: product.categorySlug });
      }
    });
    const ewPrices = (snap.extendedWarranty && snap.extendedWarranty.prices) || {};
    catalog.products.forEach((p) =>
      (p.variations || []).forEach((v) => {
        const ew = v.id && ewPrices[v.id];
        if (typeof ew === "number" && ew > 0) v.ewPrice = ew;
      })
    );
    return catalog;
  }

  function refreshCartFromCatalog() {
    if (!state.catalog || !state.cart) return;
    const allVars = [];
    (state.catalog.products || []).forEach((p) => (p.variations || []).forEach((v) => allVars.push({ p, v })));
    state.cart.forEach((line) => {
      const hit = allVars.find((x) => x.v.id === line.variationId || (line.sku && x.v.sku === line.sku));
      if (!hit) return;
      if (hit.v.price != null) line.price = hit.v.price;
      if (line.extendedWarranty && isClearance(hit.p)) {
        line.extendedWarranty = false;
        line.ewUnitPrice = null;
      } else if (line.extendedWarranty && ewUnitPrice(hit.v) != null) line.ewUnitPrice = ewUnitPrice(hit.v);
      if (hit.v.sku) line.sku = hit.v.sku;
      line.outOfStock = isVariationOos(hit.v);
    });
    saveCart();
  }

  function loadCatalog() {
    return Promise.all([
      fetch("products.json").then((r) => {
        if (!r.ok) throw new Error("Could not load products.json (" + r.status + ")");
        return r.json();
      }),
      loadProcessedManifest(),
    ]).then(([local, manifest]) => {
        processedImages = manifest || {};
        const live = apiEnabled()
          ? fetch(String(API_BASE_URL).replace(/\/$/, "") + "/catalog")
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null)
          : Promise.resolve(null);
        return Promise.all([local, live]);
      })
      .then(([local, snap]) => {
        state.catalog = mergeLiveCatalog(local, snap && snap.ok === false ? null : snap);
        state.catalogSource = snap && snap.updatedAt ? "square" : "bundle";
        document.title = SITE_TITLE;
        refreshCartFromCatalog();
        render();
      });
  }

  function productCard(p) {
    const quoteClass = p.hasPrice ? "" : " quote";
    return (
      '<a class="product-card' +
      (productHasStock(p) ? "" : " out-of-stock") +
      '" href="#/product/' +
      encodeURIComponent(p.slug) +
      '">' +
      warrantyBadgeHtml(p) +
      '<div class="thumb">' +
      thumbHtml(p) +
      "</div>" +
      '<div class="body">' +
      badgesHtml(p.badges) +
      '<div class="cat">' +
      escapeHtml(p.category) +
      "</div>" +
      "<h3>" +
      escapeHtml(p.displayName) +
      "</h3>" +
      '<div class="price' +
      quoteClass +
      '">' +
      escapeHtml(priceLabel(p)) +
      "</div>" +
      clearanceNoteHtml(p, true) +
      (productHasStock(p) ? "" : outOfStockLabel()) +
      "</div></a>"
    );
  }

  const SUPPORT_MAX_BYTES = 5 * 1024 * 1024;
  const SUPPORT_ACCEPT = ".jpg,.jpeg,.png,.pdf,.heic,.heif,image/jpeg,image/png,application/pdf,image/heic,image/heif";
  const SUPPORT_I18N = {
    en: {
      title: "Customer Service",
      kicker: "Support",
      crumbsHome: "Home",
      intro: "Send a complaint or suggestion, or start a warranty return. We read these at the company email and will follow up with you.",
      tabFeedback: "Complaint & Feedback",
      tabWarranty: "Warranty Return",
      name: "Name",
      email: "Email",
      phone: "Phone",
      phoneOptional: "Phone (optional)",
      orderNo: "Order number",
      orderOptional: "Order number (optional)",
      category: "Category",
      catComplaint: "Complaint",
      catSuggestion: "Suggestion",
      catOther: "Other",
      message: "Message",
      attachment: "Attachment (optional)",
      attachHint: "One file, up to 5 MB. JPG, PNG, PDF, or HEIC.",
      photo: "Photo of the issue",
      photoHint: "One photo, up to 5 MB. JPG, PNG, PDF, or HEIC.",
      model: "Product model",
      qty: "Quantity",
      purchaseDate: "Purchase date",
      issue: "Description of the issue",
      submit: "Submit",
      sending: "Sending…",
      successFeedback: "Thank you. Your message has been sent. We will follow up by email.",
      successWarranty: "Thank you. Your warranty return request has been sent. We will follow up by email.",
      errRequired: "Please fill in the required fields.",
      errEmail: "Enter a valid email address.",
      errFileType: "File type must be JPG, PNG, PDF, or HEIC.",
      errFileSize: "File is too large (max 5 MB).",
      errFileCount: "Please attach only one file.",
      errFileRequired: "Please attach one photo of the issue (max 5 MB).",
      errNetwork: "Could not send. Please try again or email naltx75247@gmail.com.",
      errRate: "Too many submissions. Please try again later.",
      footer: "Customer Service",
    },
    zh: {
      title: "客户服务",
      kicker: "支持",
      crumbsHome: "首页",
      intro: "您可以提交投诉或建议，或申请保修退货。我们会在公司邮箱查收，并尽快与您联系。",
      tabFeedback: "投诉与意见",
      tabWarranty: "保修退货",
      name: "姓名",
      email: "电子邮箱",
      phone: "电话",
      phoneOptional: "电话（选填）",
      orderNo: "订单号",
      orderOptional: "订单号（选填）",
      category: "类别",
      catComplaint: "投诉",
      catSuggestion: "建议",
      catOther: "其他",
      message: "留言内容",
      attachment: "附件（选填）",
      attachHint: "仅限 1 个文件，不超过 5 MB。支持 JPG、PNG、PDF 或 HEIC。",
      photo: "故障照片",
      photoHint: "请上传 1 张照片，不超过 5 MB。支持 JPG、PNG、PDF 或 HEIC。",
      model: "产品型号",
      qty: "数量",
      purchaseDate: "购买日期",
      issue: "问题描述",
      submit: "提交",
      sending: "提交中…",
      successFeedback: "感谢您的反馈，我们已收到您的留言，会通过邮件与您联系。",
      successWarranty: "感谢您的申请，我们已收到您的保修退货请求，会通过邮件与您联系。",
      errRequired: "请填写必填项。",
      errEmail: "请输入有效的电子邮箱。",
      errFileType: "附件仅限 JPG、PNG、PDF 或 HEIC。",
      errFileSize: "文件过大（上限 5 MB）。",
      errFileCount: "只能上传 1 个附件。",
      errFileRequired: "请上传 1 张故障照片（不超过 5 MB）。",
      errNetwork: "发送失败。请重试，或直接发邮件至 naltx75247@gmail.com。",
      errRate: "提交过于频繁，请稍后再试。",
      footer: "客户服务",
    },
    es: {
      title: "Servicio al cliente",
      kicker: "Soporte",
      crumbsHome: "Inicio",
      intro: "Envíe una queja o sugerencia, o inicie una devolución por garantía. Leemos estos mensajes en el correo de la empresa y le responderemos.",
      tabFeedback: "Quejas y comentarios",
      tabWarranty: "Devolución por garantía",
      name: "Nombre",
      email: "Correo electrónico",
      phone: "Teléfono",
      phoneOptional: "Teléfono (opcional)",
      orderNo: "Número de pedido",
      orderOptional: "Número de pedido (opcional)",
      category: "Categoría",
      catComplaint: "Queja",
      catSuggestion: "Sugerencia",
      catOther: "Otro",
      message: "Mensaje",
      attachment: "Archivo adjunto (opcional)",
      attachHint: "Un solo archivo, de hasta 5 MB. JPG, PNG, PDF o HEIC.",
      photo: "Foto del problema",
      photoHint: "Una foto, de hasta 5 MB. JPG, PNG, PDF o HEIC.",
      model: "Modelo del producto",
      qty: "Cantidad",
      purchaseDate: "Fecha de compra",
      issue: "Descripción del problema",
      submit: "Enviar",
      sending: "Enviando…",
      successFeedback: "Gracias. Hemos recibido su mensaje y le contactaremos por correo.",
      successWarranty: "Gracias. Hemos recibido su solicitud de garantía y le contactaremos por correo.",
      errRequired: "Complete los campos obligatorios.",
      errEmail: "Introduzca un correo electrónico válido.",
      errFileType: "El archivo debe ser JPG, PNG, PDF o HEIC.",
      errFileSize: "El archivo es demasiado grande (máximo 5 MB).",
      errFileCount: "Adjunte solo un archivo.",
      errFileRequired: "Adjunte una foto del problema (máximo 5 MB).",
      errNetwork: "No se pudo enviar. Inténtelo de nuevo o escriba a naltx75247@gmail.com.",
      errRate: "Demasiados envíos. Inténtelo más tarde.",
      footer: "Servicio al cliente",
    },
  };

  function supportCopy() {
    return SUPPORT_I18N[siteLang()] || SUPPORT_I18N.en;
  }

  function updateSupportFooter() {
    const t = supportCopy().footer;
    document.querySelectorAll("[data-support-link]").forEach(function (a) {
      a.textContent = t;
    });
  }

  function supportTabFromRoute(parts) {
    const root = (parts[0] || "").toLowerCase();
    const sub = (parts[1] || "").toLowerCase();
    if (root === "warranty" || sub === "warranty" || sub === "return") return "warranty";
    return "feedback";
  }

  function isAllowedSupportFile(file) {
    if (!file) return { ok: true };
    if (file.size > SUPPORT_MAX_BYTES) return { ok: false, code: "file_size" };
    var name = String(file.name || "").toLowerCase();
    var ext = "";
    var m = name.match(/(\.[a-z0-9]+)$/);
    if (m) ext = m[1];
    var type = String(file.type || "").toLowerCase();
    var typeOk = /^(image\/(jpeg|jpg|pjpeg|png|x-png|heic|heif|heic-sequence|heif-sequence)|application\/pdf)$/.test(type);
    var extOk = /^\.(jpe?g|png|pdf|heic|heif)$/.test(ext);
    if (typeOk || extOk) return { ok: true };
    return { ok: false, code: "file_type" };
  }

  function supportErrorText(t, code, fallback) {
    if (code === "file_size") return t.errFileSize;
    if (code === "file_type") return t.errFileType;
    if (code === "file_count") return t.errFileCount;
    if (code === "file_required") return t.errFileRequired;
    if (code === "email") return t.errEmail;
    if (code === "required") return t.errRequired;
    if (code === "rate_limit") return t.errRate;
    return fallback || t.errNetwork;
  }

  function renderSupport() {
    const t = supportCopy();
    const { parts } = parseRoute();
    const tab = supportTabFromRoute(parts);
    const isWarranty = tab === "warranty";
    const notice = state.supportNotice;
    const err = state.supportError;
    let body;
    if (notice && notice.tab === tab) {
      body =
        '<p class="support-success">' +
        escapeHtml(isWarranty ? t.successWarranty : t.successFeedback) +
        "</p>";
    } else if (isWarranty) {
      body =
        '<form class="form support-form" data-support-form="warranty" novalidate>' +
        formErrorHtml(err && err.tab === "warranty" ? err.message : "") +
        "<label>" + escapeHtml(t.name) + " *<input name='name' required autocomplete='name'></label>" +
        "<label>" + escapeHtml(t.email) + " *<input name='email' type='email' required autocomplete='email'></label>" +
        "<label>" + escapeHtml(t.phone) + " *<input name='phone' type='tel' required autocomplete='tel'></label>" +
        "<label>" + escapeHtml(t.orderNo) + " *<input name='orderNumber' required></label>" +
        "<label>" + escapeHtml(t.model) + " *<input name='model' required></label>" +
        "<label>" + escapeHtml(t.qty) + " *<input name='quantity' type='number' min='1' max='10000' step='1' value='1' required></label>" +
        "<label>" + escapeHtml(t.purchaseDate) + " *<input name='purchaseDate' type='date' required></label>" +
        "<label>" + escapeHtml(t.issue) + " *<textarea name='issue' required></textarea></label>" +
        "<label>" + escapeHtml(t.photo) + " *<span class='hint'>" + escapeHtml(t.photoHint) + "</span>" +
        "<input name='attachment' type='file' required accept='" + SUPPORT_ACCEPT + "' data-support-file></label>" +
        '<p class="support-file-name" data-file-name></p>' +
        '<div class="hp-field" aria-hidden="true"><label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>' +
        '<input type="hidden" name="lang" value="' + escapeHtml(siteLang()) + '">' +
        '<button class="btn btn-gold" type="submit">' + escapeHtml(t.submit) + "</button></form>";
    } else {
      body =
        '<form class="form support-form" data-support-form="feedback" novalidate>' +
        formErrorHtml(err && err.tab === "feedback" ? err.message : "") +
        "<label>" + escapeHtml(t.name) + " *<input name='name' required autocomplete='name'></label>" +
        "<label>" + escapeHtml(t.email) + " *<input name='email' type='email' required autocomplete='email'></label>" +
        "<label>" + escapeHtml(t.phoneOptional) + "<input name='phone' type='tel' autocomplete='tel'></label>" +
        "<label>" + escapeHtml(t.orderOptional) + "<input name='orderNumber'></label>" +
        "<label>" + escapeHtml(t.category) + " *<select name='category' required>" +
        "<option value='complaint'>" + escapeHtml(t.catComplaint) + "</option>" +
        "<option value='suggestion'>" + escapeHtml(t.catSuggestion) + "</option>" +
        "<option value='other'>" + escapeHtml(t.catOther) + "</option>" +
        "</select></label>" +
        "<label>" + escapeHtml(t.message) + " *<textarea name='message' required></textarea></label>" +
        "<label>" + escapeHtml(t.attachment) + "<span class='hint'>" + escapeHtml(t.attachHint) + "</span>" +
        "<input name='attachment' type='file' accept='" + SUPPORT_ACCEPT + "' data-support-file></label>" +
        '<p class="support-file-name" data-file-name></p>' +
        '<div class="hp-field" aria-hidden="true"><label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>' +
        '<input type="hidden" name="lang" value="' + escapeHtml(siteLang()) + '">' +
        '<button class="btn btn-gold" type="submit">' + escapeHtml(t.submit) + "</button></form>";
    }
    return (
      '<section class="wrap support-page">' +
      '<div class="crumbs"><a href="#/">' + escapeHtml(t.crumbsHome) + "</a> / " + escapeHtml(t.title) + "</div>" +
      '<div class="section-kicker">' + escapeHtml(t.kicker) + "</div>" +
      "<h1>" + escapeHtml(t.title) + "</h1>" +
      '<p class="support-intro">' + escapeHtml(t.intro) + "</p>" +
      '<div class="support-tabs" role="tablist">' +
      '<button type="button" role="tab" data-support-tab="feedback" aria-selected="' +
      (isWarranty ? "false" : "true") +
      '"' +
      (isWarranty ? "" : ' class="active"') +
      ">" +
      escapeHtml(t.tabFeedback) +
      "</button>" +
      '<button type="button" role="tab" data-support-tab="warranty" aria-selected="' +
      (isWarranty ? "true" : "false") +
      '"' +
      (isWarranty ? ' class="active"' : "") +
      ">" +
      escapeHtml(t.tabWarranty) +
      "</button>" +
      "</div>" +
      body +
      "</section>"
    );
  }

  async function submitSupportForm(form) {
    const t = supportCopy();
    const tab = form.getAttribute("data-support-form") === "warranty" ? "warranty" : "feedback";
    const fileInput = form.querySelector("[data-support-file]");
    const files = fileInput && fileInput.files ? Array.from(fileInput.files) : [];
    if (files.length > 1) {
      state.supportError = { tab: tab, message: t.errFileCount };
      state.supportNotice = null;
      $app().innerHTML = renderSupport();
      return;
    }
    if (files.length === 1) {
      const allowed = isAllowedSupportFile(files[0]);
      if (!allowed.ok) {
        state.supportError = { tab: tab, message: supportErrorText(t, allowed.code) };
        state.supportNotice = null;
        $app().innerHTML = renderSupport();
        return;
      }
    }
    if (tab === "warranty" && files.length !== 1) {
      state.supportError = { tab: tab, message: t.errFileRequired };
      state.supportNotice = null;
      $app().innerHTML = renderSupport();
      return;
    }
    if (!form.reportValidity()) {
      state.supportError = { tab: tab, message: t.errRequired };
      state.supportNotice = null;
      const errEl = form.querySelector("[data-form-error]");
      if (errEl) errEl.textContent = t.errRequired;
      else $app().innerHTML = renderSupport();
      return;
    }
    const btn = form.querySelector('button[type="submit"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = t.sending;
    }
    try {
      const fd = new FormData(form);
      if (fd.get("lang")) fd.set("lang", siteLang());
      else fd.append("lang", siteLang());
      const path = tab === "warranty" ? "/warranty" : "/feedback";
      const res = await fetch(String(API_BASE_URL).replace(/\/$/, "") + path, {
        method: "POST",
        body: fd,
      });
      let data = {};
      try {
        data = await res.json();
      } catch (e) {
        data = {};
      }
      if (!res.ok || !data.ok) {
        state.supportNotice = null;
        state.supportError = {
          tab: tab,
          message: supportErrorText(t, data.code, data.error || t.errNetwork),
        };
        $app().innerHTML = renderSupport();
        return;
      }
      state.supportError = null;
      state.supportNotice = { tab: tab };
      $app().innerHTML = renderSupport();
    } catch (err) {
      state.supportNotice = null;
      state.supportError = { tab: tab, message: t.errNetwork };
      $app().innerHTML = renderSupport();
    }
  }

  function parseRoute() {
    const raw = (location.hash || "#/").replace(/^#/, "") || "/";
    const qIndex = raw.indexOf("?");
    const path = (qIndex >= 0 ? raw.slice(0, qIndex) : raw) || "/";
    const qs = new URLSearchParams(qIndex >= 0 ? raw.slice(qIndex + 1) : "");
    const parts = path.split("/").filter(Boolean);
    return { parts, qs, path: "/" + parts.join("/") };
  }

  function company() {
    return state.catalog.company;
  }

  function findProduct(slug) {
    return state.catalog.products.find((p) => p.slug === slug);
  }

  function categoryImage(slug) {
    const p = state.catalog.products.find(
      (x) => x.categorySlug === slug && productImageUrl(x)
    );
    return p ? productImageUrl(p) : "";
  }

  /* ---------- pages ---------- */

  function renderHome() {
    const c = company();
    const cats = state.catalog.categories;
    const featured = pickFeatured();
    const promos = resolveHomePromos();

    return (
      '<section class="hero"><div class="hero-inner">' +
      guaranteeBannerHtml() +
      "<div>" +
      '<div class="hero-kicker">Dallas, Texas · Wholesale · Commercial Grade</div>' +
      "<h1>Commercial LED Lighting<br><span class=\"hero-emphasis\">BUILT TO LAST</span></h1>" +
      '<p class="hero-lead">Our LED lights are designed with the highest industry standards to save up to 65% energy costs with hassle-free maintenance and a five-year warranty.</p>' +
      '<div class="hero-actions">' +
      '<a class="btn btn-gold" href="#/catalog">Browse the catalog</a>' +
      '<a class="btn btn-ghost" href="#/about">About NAL</a>' +
      "</div>" +
      "</div>" +
      promoCarouselHtml(promos) +
      "</div></section>" +
      '<section class="wrap">' +
      '<div class="section-head"><div><div class="section-kicker">Shop by type</div><h2>Categories</h2></div></div>' +
      '<div class="cat-grid">' +
      cats
        .map((cat) => {
          const img = categoryImage(cat.slug);
          return (
            '<a class="cat-card" href="#/catalog/' +
            encodeURIComponent(cat.slug) +
            '"><h3>' +
            escapeHtml(cat.name) +
            '</h3><div class="count">' +
            cat.count +
            (cat.count === 1 ? " product" : " products") +
            "</div>" +
            (img
              ? '<img src="' + escapeHtml(img) + '" alt="">'
              : "") +
            "</a>"
          );
        })
        .join("") +
      "</div></section>" +
      '<section class="wrap" style="padding-top:0">' +
      '<div class="section-head"><div><div class="section-kicker">From the catalog</div><h2>Featured fixtures</h2></div>' +
      '<a href="#/catalog">View all ' +
      state.catalog.products.length +
      " products</a></div>" +
      '<div class="product-grid">' +
      featured.map(productCard).join("") +
      "</div></section>" +
      factsBand()
    );
  }

  function resolveHomePromos() {
    const products = (state.catalog && state.catalog.products) || [];
    const items = [];
    const seen = new Set();
    for (const entry of HOME_PROMOS) {
      if (!entry || !entry.slug) continue;
      const p = products.find((x) => x.slug === entry.slug);
      if (!p) continue;
      addPromoItem(items, seen, p, entry.badge || "", entry.image, entry.label);
    }
    const rest = products
      .filter((p) => isClearance(p) || isSaleProduct(p))
      .slice()
      .sort(function (a, b) {
        const ac = isClearance(a) ? 0 : 1;
        const bc = isClearance(b) ? 0 : 1;
        if (ac !== bc) return ac - bc;
        return String(a.displayName || a.name || "").localeCompare(String(b.displayName || b.name || ""));
      });
    rest.forEach((p) => addPromoItem(items, seen, p, "", "", ""));
    return items;
  }

  function isSaleProduct(p) {
    if (!p) return false;
    return (p.badges || []).some((b) => /sale/i.test(String(b || "")));
  }

  function promoPriceText(p) {
    if (!p || !p.hasPrice || p.priceMin == null) return "";
    if (p.priceMin === p.priceMax) return money(p.priceMin);
    return money(p.priceMin) + " – " + money(p.priceMax);
  }

  function addPromoItem(items, seen, p, badge, imageOverride, labelOverride) {
    if (!p || seen.has(p.slug)) return;
    const image = imageOverride || productImageUrl(p);
    if (!image) return;
    seen.add(p.slug);
    items.push({
      slug: p.slug,
      label: labelOverride || p.displayName || p.name || "",
      image: image,
      badge: badge || "",
      priceLabel: promoPriceText(p),
    });
  }

  function promoCarouselHtml(promos) {
    if (!promos.length) return "";
    const slides = promos
      .map((item, i) => {
        const badge = item.badge
          ? '<span class="lens-badge">' + escapeHtml(item.badge) + "</span>"
          : "";
        return (
          '<a class="promo-slide" href="#/product/' +
          encodeURIComponent(item.slug) +
          '" data-promo-index="' +
          i +
          '"' +
          (i === 0 ? "" : ' aria-hidden="true"') +
          ' aria-label="' +
          escapeHtml(item.label) +
          '">' +
          '<span class="promo-frame">' +
          '<img src="' +
          escapeHtml(item.image) +
          '" alt="' +
          escapeHtml(item.label) +
          '">' +
          badge +
          (item.priceLabel
            ? '<span class="promo-price">' + escapeHtml(item.priceLabel) + "</span>"
            : "") +
          "</span>" +
          '<span class="promo-caption">' +
          escapeHtml(item.label) +
          "</span>" +
          "</a>"
        );
      })
      .join("");
    const dots = promos
      .map((item, i) => {
        return (
          '<button type="button" class="promo-dot' +
          (i === 0 ? " is-active" : "") +
          '" data-promo-dot="' +
          i +
          '" aria-label="Show ' +
          escapeHtml(item.label) +
          " (" +
          (i + 1) +
          " of " +
          promos.length +
          ')"' +
          (i === 0 ? ' aria-current="true"' : "") +
          "></button>"
        );
      })
      .join("");
    const nav =
      promos.length > 1
        ? '<div class="promo-controls">' +
          '<button type="button" class="promo-nav promo-prev" data-promo-prev aria-label="Previous promotion">' +
          '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          "</button>" +
          '<div class="promo-dots" role="tablist" aria-label="Promotion slides">' +
          dots +
          "</div>" +
          '<button type="button" class="promo-nav promo-next" data-promo-next aria-label="Next promotion">' +
          '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          "</button>" +
          "</div>"
        : "";
    return (
      '<div class="promo-carousel" data-promo-carousel data-promo-active="0">' +
      '<div class="promo-kicker">Promotion</div>' +
      '<div class="promo-viewport" tabindex="0" aria-roledescription="carousel" aria-label="Promoted products">' +
      '<div class="promo-track">' +
      slides +
      "</div></div>" +
      nav +
      "</div>"
    );
  }

  let promoCarousel = null;

  function stopPromoCarousel() {
    if (!promoCarousel) return;
    if (promoCarousel.timer) {
      clearInterval(promoCarousel.timer);
      promoCarousel.timer = null;
    }
    if (promoCarousel.cleanup) promoCarousel.cleanup();
    promoCarousel = null;
  }

  function initPromoCarousel() {
    stopPromoCarousel();
    const root = document.querySelector("[data-promo-carousel]");
    if (!root) return;
    const viewport = root.querySelector(".promo-viewport");
    const track = root.querySelector(".promo-track");
    const originals = Array.from(root.querySelectorAll(".promo-slide"));
    const dots = Array.from(root.querySelectorAll("[data-promo-dot]"));
    const prevBtn = root.querySelector("[data-promo-prev]");
    const nextBtn = root.querySelector("[data-promo-next]");
    if (!viewport || !track || !originals.length) return;

    const n = originals.length;
    const reduce =
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const loop = n > 1 && !reduce;

    if (loop) {
      const lastClone = originals[n - 1].cloneNode(true);
      const firstClone = originals[0].cloneNode(true);
      lastClone.classList.add("is-clone");
      firstClone.classList.add("is-clone");
      lastClone.setAttribute("aria-hidden", "true");
      firstClone.setAttribute("aria-hidden", "true");
      lastClone.removeAttribute("data-promo-index");
      firstClone.removeAttribute("data-promo-index");
      lastClone.setAttribute("tabindex", "-1");
      firstClone.setAttribute("tabindex", "-1");
      track.insertBefore(lastClone, originals[0]);
      track.appendChild(firstClone);
    }

    let index = 0;
    let pos = loop ? 1 : 0;
    let paused = false;
    let animating = false;
    let swiped = false;
    let pointerActive = false;
    let pointerStartX = 0;
    let pointerStartY = 0;

    function applyPos(instant) {
      if (instant || reduce) {
        track.style.transition = "none";
      } else {
        track.style.transition = "";
      }
      track.style.transform = "translateX(" + -pos * 100 + "%)";
      if (instant || reduce) {
        track.offsetHeight;
        if (!reduce) track.style.transition = "";
      }
    }

    function syncUi() {
      root.setAttribute("data-promo-active", String(index));
      originals.forEach((slide, i) => {
        const on = i === index;
        slide.setAttribute("aria-hidden", on ? "false" : "true");
        if (on) slide.removeAttribute("tabindex");
        else slide.setAttribute("tabindex", "-1");
      });
      dots.forEach((dot, i) => {
        const on = i === index;
        dot.classList.toggle("is-active", on);
        if (on) dot.setAttribute("aria-current", "true");
        else dot.removeAttribute("aria-current");
      });
    }

    function goTo(next, instant) {
      if (n < 2) return;
      const target = ((next % n) + n) % n;
      if (loop && !instant && !reduce) {
        if (index === n - 1 && target === 0) {
          pos = n + 1;
          index = 0;
          animating = true;
        } else if (index === 0 && target === n - 1) {
          pos = 0;
          index = n - 1;
          animating = true;
        } else {
          index = target;
          pos = index + 1;
          animating = true;
        }
        applyPos(false);
      } else {
        index = target;
        pos = loop ? index + 1 : index;
        applyPos(true);
        animating = false;
      }
      syncUi();
    }

    function onTransitionEnd(e) {
      if (e.target !== track) return;
      if (!loop) {
        animating = false;
        return;
      }
      if (pos === n + 1) {
        pos = 1;
        applyPos(true);
      } else if (pos === 0) {
        pos = n;
        applyPos(true);
      }
      animating = false;
    }

    function play() {
      if (promoCarousel.timer) {
        clearInterval(promoCarousel.timer);
        promoCarousel.timer = null;
      }
      if (reduce || paused || n < 2 || document.hidden) return;
      promoCarousel.timer = setInterval(function () {
        goTo(index + 1);
      }, PROMO_INTERVAL_MS);
    }

    function pause() {
      if (promoCarousel.timer) {
        clearInterval(promoCarousel.timer);
        promoCarousel.timer = null;
      }
    }

    function onEnter() {
      paused = true;
      pause();
    }
    function onLeave() {
      paused = false;
      play();
    }
    function onFocusOut(e) {
      if (!root.contains(e.relatedTarget)) onLeave();
    }
    function onVisibility() {
      if (document.hidden) pause();
      else if (!paused) play();
    }
    function onPrev(e) {
      e.preventDefault();
      e.stopPropagation();
      goTo(index - 1);
      play();
    }
    function onNext(e) {
      e.preventDefault();
      e.stopPropagation();
      goTo(index + 1);
      play();
    }
    function onDot(e) {
      const i = Number(e.currentTarget.getAttribute("data-promo-dot"));
      if (Number.isFinite(i)) goTo(i);
      play();
    }
    function onKey(e) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goTo(index - 1);
        play();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goTo(index + 1);
        play();
      }
    }
    function onPointerDown(e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      pointerActive = true;
      pointerStartX = e.clientX;
      pointerStartY = e.clientY;
      swiped = false;
      paused = true;
      pause();
    }
    function onPointerUp(e) {
      if (!pointerActive) return;
      pointerActive = false;
      const dx = e.clientX - pointerStartX;
      const dy = e.clientY - pointerStartY;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
        swiped = true;
        if (dx < 0) goTo(index + 1);
        else goTo(index - 1);
      }
      paused = false;
      play();
    }
    function onPointerCancel() {
      pointerActive = false;
      paused = false;
      play();
    }
    function onClickCapture(e) {
      if (swiped) {
        e.preventDefault();
        e.stopPropagation();
        swiped = false;
      }
    }

    track.addEventListener("transitionend", onTransitionEnd);
    root.addEventListener("mouseenter", onEnter);
    root.addEventListener("mouseleave", onLeave);
    root.addEventListener("focusin", onEnter);
    root.addEventListener("focusout", onFocusOut);
    viewport.addEventListener("keydown", onKey);
    viewport.addEventListener("pointerdown", onPointerDown);
    viewport.addEventListener("click", onClickCapture, true);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    document.addEventListener("visibilitychange", onVisibility);
    if (prevBtn) prevBtn.addEventListener("click", onPrev);
    if (nextBtn) nextBtn.addEventListener("click", onNext);
    dots.forEach(function (dot) {
      dot.addEventListener("click", onDot);
    });

    promoCarousel = {
      timer: null,
      cleanup: function () {
        track.removeEventListener("transitionend", onTransitionEnd);
        root.removeEventListener("mouseenter", onEnter);
        root.removeEventListener("mouseleave", onLeave);
        root.removeEventListener("focusin", onEnter);
        root.removeEventListener("focusout", onFocusOut);
        viewport.removeEventListener("keydown", onKey);
        viewport.removeEventListener("pointerdown", onPointerDown);
        viewport.removeEventListener("click", onClickCapture, true);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerCancel);
        document.removeEventListener("visibilitychange", onVisibility);
        if (prevBtn) prevBtn.removeEventListener("click", onPrev);
        if (nextBtn) nextBtn.removeEventListener("click", onNext);
        dots.forEach(function (dot) {
          dot.removeEventListener("click", onDot);
        });
      },
    };

    applyPos(true);
    syncUi();
    play();
  }

  function pickFeatured() {
    const products = state.catalog.products;
    const wanted = [
      "panel-backlit",
      "high-bay-ufo-light",
      "parking-street-shoe-box",
      "wall-pack",
      "canopy-15-inch",
      "flood-light",
      "corn-bulb",
      "flex-strip",
    ];
    const picked = [];
    for (const slug of wanted) {
      const p = products.find((x) => x.slug === slug);
      if (p) picked.push(p);
    }
    const sales = products.filter(
      (p) =>
        p.badges.some((b) => /sale|clearance/i.test(b)) &&
        !picked.includes(p)
    );
    for (const p of sales) {
      if (picked.length >= 8) break;
      picked.push(p);
    }
    return picked.slice(0, 8);
  }

  function factsBand() {
    return (
      '<section class="facts"><div class="facts-inner">' +
      '<div class="fact"><h3>Quality Lights to Suit Your Needs</h3><p>Volume pricing for contractors, property managers, and sign shops, and single units for any customer.</p></div>' +
      '<div class="fact"><h3>Commercial Grade Built to Last</h3><p>Durable LED fixtures and sign lighting made for demanding commercial use, backed by a 1-year replacement guarantee.</p></div>' +
      '<div class="fact"><h3>Dallas Based</h3><p>North America Lighting is based in Dallas, Texas, and serves the central region.</p></div>' +
      '<div class="fact"><h3>Ships Nationwide</h3><p>We ship across the United States. Call or email for lead times and freight.</p></div>' +
      "</div></section>"
    );
  }


  function installCtaHtml(p) {
    if (!p || p.slug !== INSTALL_PRODUCT_SLUG) return "";
    const type = (getSelectedOptions(p) || {}).Type || "";
    let href = "#/installation";
    let title = "Installation Guide";
    let body =
      "Guides for Compatible (Type A) plug-and-play, single-ended Type B, and double-ended Type B 4 ft retrofit tubes.";
    if (type === "Compatible") {
      href = "#/installation/compatible";
      title = "Installation Guide — Compatible (Type A)";
      body =
        "Plug-and-play: no rewiring. Uses about 40–50% less energy than fluorescent. These tubes run on the existing ballast, so if that ballast fails the tube stops working too, like a fluorescent lamp. A ballast-bypass upgrade is an option at that point.";
    } else if (type === "Bypass") {
      href = "#/installation/single-ended";
      title = "Installation Guide — Single-ended Type B";
      body =
        "Ballast-bypass, single-ended. UL certified, with a high level of safety. Line and neutral land on one end; the far end has no line voltage, which makes relamping simpler and safer. Requires bypass wiring and non-shunted tombstones on the powered end.";
    } else if (type === "Double End") {
      href = "#/installation/double-ended";
      title = "Installation Guide — Double-ended Type B";
      body =
        "Ballast-bypass, double-ended. Fast for electricians: the tube can go in either way. Typically no tombstone replacement — remove the ballast, run line to one end and neutral to the other.";
    } else if (type === "B/C") {
      title = "Installation Guide";
      body =
        "This lamp can be installed as plug-and-play (Compatible) or as ballast-bypass. See both methods in the installation guide.";
    }
    return (
      '<div class="install-product-cta">' +
      '<a href="' +
      href +
      '">' +
      escapeHtml(title) +
      "</a>" +
      "<p>" +
      escapeHtml(body) +
      (type === "B/C"
        ? ' <a href="#/installation/compatible">Compatible (Type A)</a> · <a href="#/installation/single-ended">Single-ended Type B</a> · <a href="#/installation/double-ended">Double-ended Type B</a>.'
        : "") +
      "</p></div>"
    );
  }

  function installVideoHtml(video) {
    if (!video || !video.id) return "";
    const embedSrc = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(video.id);
    const credit = "Video: " + video.title + " by " + video.channel + " (YouTube)";
    return (
      '<div class="install-video">' +
      '<div class="install-video-frame">' +
      '<iframe src="' +
      escapeHtml(embedSrc) +
      '" title="' +
      escapeHtml(video.title) +
      '" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>' +
      "</div></div>" +
      '<p class="install-credit"><a href="' +
      escapeHtml(video.url) +
      '" target="_blank" rel="noopener noreferrer">' +
      escapeHtml(credit) +
      "</a></p>"
    );
  }

  function installWiringDiagramSvg() {
    return (
      '<svg class="install-diagram-svg" viewBox="0 0 800 390" role="img" aria-labelledby="install-diag-title install-diag-desc" xmlns="http://www.w3.org/2000/svg">' +
      '<title id="install-diag-title">Single-ended Type B ballast-bypass wiring diagram</title>' +
      '<desc id="install-diag-desc">Line and neutral land only on a non-shunted tombstone at the tube’s labeled input end. The opposite end is mechanical support only, with no line voltage. The fluorescent ballast is removed from the circuit.</desc>' +
      '<rect width="800" height="390" fill="#fbfaf6"/>' +
      '<text x="400" y="26" text-anchor="middle" font-family="Manrope, Segoe UI, sans-serif" font-size="16" font-weight="700" fill="#011337">Single-ended Type B (ballast bypass) — typical wiring</text>' +
      '<text x="400" y="46" text-anchor="middle" font-family="Manrope, Segoe UI, sans-serif" font-size="12" fill="#3d4753">Follow the L / N markings on the tube if they differ from this diagram</text>' +
      '<rect x="90" y="78" width="620" height="230" rx="6" fill="#ece7dc" stroke="#011337" stroke-width="1.5"/>' +
      '<text x="400" y="100" text-anchor="middle" font-family="Manrope, Segoe UI, sans-serif" font-size="11" font-weight="700" letter-spacing="0.1em" fill="#3d4753">FIXTURE WIREWAY</text>' +
      '<g transform="translate(330 114)">' +
      '<rect x="0" y="0" width="140" height="34" rx="2" fill="#d7d2c6" stroke="#6b7280" stroke-width="1" stroke-dasharray="4 3"/>' +
      '<line x1="8" y1="5" x2="132" y2="29" stroke="#8c2d1c" stroke-width="2"/>' +
      '<line x1="132" y1="5" x2="8" y2="29" stroke="#8c2d1c" stroke-width="2"/>' +
      '<text x="70" y="50" text-anchor="middle" font-family="Manrope, Segoe UI, sans-serif" font-size="12" font-weight="700" fill="#8c2d1c">Ballast removed</text>' +
      "</g>" +
      '<text x="18" y="196" font-family="Manrope, Segoe UI, sans-serif" font-size="12" font-weight="700" fill="#111">LINE</text>' +
      '<text x="18" y="211" font-family="Manrope, Segoe UI, sans-serif" font-size="11" fill="#111">(hot)</text>' +
      '<text x="18" y="258" font-family="Manrope, Segoe UI, sans-serif" font-size="12" font-weight="700" fill="#3d4753">NEUTRAL</text>' +
      '<path d="M64 200 H126" fill="none" stroke="#111" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M64 250 H126" fill="none" stroke="#6b7c93" stroke-width="3" stroke-linecap="round"/>' +
      '<g transform="translate(116 186)">' +
      '<rect x="0" y="0" width="66" height="78" rx="3" fill="#fbfaf6" stroke="#011337" stroke-width="1.8"/>' +
      '<rect x="10" y="10" width="46" height="22" rx="1.5" fill="#011337"/>' +
      '<text x="33" y="26" text-anchor="middle" font-family="Manrope, Segoe UI, sans-serif" font-size="13" font-weight="700" fill="#e4c36a">L</text>' +
      '<rect x="10" y="46" width="46" height="22" rx="1.5" fill="#011337"/>' +
      '<text x="33" y="62" text-anchor="middle" font-family="Manrope, Segoe UI, sans-serif" font-size="13" font-weight="700" fill="#fbfaf6">N</text>' +
      "</g>" +
      '<rect x="194" y="202" width="412" height="46" rx="23" fill="#011337"/>' +
      '<rect x="210" y="210" width="380" height="30" rx="15" fill="#14305f"/>' +
      '<text x="400" y="231" text-anchor="middle" font-family="Manrope, Segoe UI, sans-serif" font-size="13" font-weight="700" fill="#e4c36a">4 ft LED tube (single-ended Type B)</text>' +
      '<line x1="182" y1="214" x2="194" y2="214" stroke="#c9a24a" stroke-width="3.2" stroke-linecap="round"/>' +
      '<line x1="182" y1="236" x2="194" y2="236" stroke="#c9a24a" stroke-width="3.2" stroke-linecap="round"/>' +
      '<line x1="606" y1="214" x2="618" y2="214" stroke="#9aa3ad" stroke-width="3.2" stroke-linecap="round"/>' +
      '<line x1="606" y1="236" x2="618" y2="236" stroke="#9aa3ad" stroke-width="3.2" stroke-linecap="round"/>' +
      '<g transform="translate(618 186)">' +
      '<rect x="0" y="0" width="66" height="78" rx="3" fill="#fbfaf6" stroke="#6b7280" stroke-width="1.8" stroke-dasharray="5 4"/>' +
      '<rect x="10" y="10" width="46" height="22" rx="1.5" fill="#d7d2c6"/>' +
      '<rect x="10" y="46" width="46" height="22" rx="1.5" fill="#d7d2c6"/>' +
      "</g>" +
      '<text x="149" y="336" text-anchor="middle" font-family="Manrope, Segoe UI, sans-serif" font-size="13" font-weight="700" fill="#011337">Powered end</text>' +
      '<text x="149" y="354" text-anchor="middle" font-family="Manrope, Segoe UI, sans-serif" font-size="12" fill="#3d4753">Non-shunted tombstone</text>' +
      '<text x="149" y="372" text-anchor="middle" font-family="Manrope, Segoe UI, sans-serif" font-size="12" fill="#3d4753">L and N per tube label</text>' +
      '<text x="651" y="336" text-anchor="middle" font-family="Manrope, Segoe UI, sans-serif" font-size="13" font-weight="700" fill="#011337">Opposite end</text>' +
      '<text x="651" y="354" text-anchor="middle" font-family="Manrope, Segoe UI, sans-serif" font-size="12" fill="#3d4753">Mechanical support only</text>' +
      '<text x="651" y="372" text-anchor="middle" font-family="Manrope, Segoe UI, sans-serif" font-size="12" fill="#3d4753">No line voltage</text>' +
      "</svg>"
    );
  }

  function installDoubleEndedDiagramSvg() {
    return (
      '<svg class="install-diagram-svg" viewBox="0 0 800 360" role="img" aria-labelledby="install-de-title install-de-desc" xmlns="http://www.w3.org/2000/svg">' +
      '<title id="install-de-title">Double-ended Type B ballast-bypass wiring diagram</title>' +
      '<desc id="install-de-desc">After the ballast is removed, line (hot) is connected to the sockets at one end of the fixture and neutral to the sockets at the other end. The tube can typically be installed either way. Always follow the tube’s label.</desc>' +
      '<rect width="800" height="360" fill="#fbfaf6"/>' +
      '<text x="400" y="26" text-anchor="middle" font-family="Manrope, Segoe UI, sans-serif" font-size="16" font-weight="700" fill="#011337">Double-ended Type B (ballast bypass) — typical wiring</text>' +
      '<text x="400" y="46" text-anchor="middle" font-family="Manrope, Segoe UI, sans-serif" font-size="12" fill="#3d4753">Follow the markings on the tube if they differ from this diagram</text>' +
      '<rect x="90" y="70" width="620" height="200" rx="6" fill="#ece7dc" stroke="#011337" stroke-width="1.5"/>' +
      '<text x="400" y="92" text-anchor="middle" font-family="Manrope, Segoe UI, sans-serif" font-size="11" font-weight="700" letter-spacing="0.1em" fill="#3d4753">FIXTURE WIREWAY</text>' +
      '<g transform="translate(330 102)">' +
      '<rect x="0" y="0" width="140" height="30" rx="2" fill="#d7d2c6" stroke="#6b7280" stroke-width="1" stroke-dasharray="4 3"/>' +
      '<line x1="8" y1="4" x2="132" y2="26" stroke="#8c2d1c" stroke-width="2"/>' +
      '<line x1="132" y1="4" x2="8" y2="26" stroke="#8c2d1c" stroke-width="2"/>' +
      '<text x="70" y="46" text-anchor="middle" font-family="Manrope, Segoe UI, sans-serif" font-size="12" font-weight="700" fill="#8c2d1c">Ballast removed</text>' +
      "</g>" +
      '<text x="18" y="200" font-family="Manrope, Segoe UI, sans-serif" font-size="12" font-weight="700" fill="#111">LINE</text>' +
      '<text x="18" y="215" font-family="Manrope, Segoe UI, sans-serif" font-size="11" fill="#111">(hot)</text>' +
      '<path d="M64 204 H126" fill="none" stroke="#111" stroke-width="3" stroke-linecap="round"/>' +
      '<g transform="translate(116 166)">' +
      '<rect x="0" y="0" width="66" height="78" rx="3" fill="#fbfaf6" stroke="#011337" stroke-width="1.8"/>' +
      '<rect x="10" y="10" width="46" height="22" rx="1.5" fill="#011337"/>' +
      '<rect x="10" y="46" width="46" height="22" rx="1.5" fill="#011337"/>' +
      "</g>" +
      '<rect x="194" y="182" width="412" height="46" rx="23" fill="#011337"/>' +
      '<rect x="210" y="190" width="380" height="30" rx="15" fill="#14305f"/>' +
      '<text x="400" y="211" text-anchor="middle" font-family="Manrope, Segoe UI, sans-serif" font-size="13" font-weight="700" fill="#e4c36a">4 ft LED tube (double-ended Type B)</text>' +
      '<line x1="182" y1="194" x2="194" y2="194" stroke="#c9a24a" stroke-width="3.2" stroke-linecap="round"/>' +
      '<line x1="182" y1="216" x2="194" y2="216" stroke="#c9a24a" stroke-width="3.2" stroke-linecap="round"/>' +
      '<line x1="606" y1="194" x2="618" y2="194" stroke="#c9a24a" stroke-width="3.2" stroke-linecap="round"/>' +
      '<line x1="606" y1="216" x2="618" y2="216" stroke="#c9a24a" stroke-width="3.2" stroke-linecap="round"/>' +
      '<g transform="translate(618 166)">' +
      '<rect x="0" y="0" width="66" height="78" rx="3" fill="#fbfaf6" stroke="#011337" stroke-width="1.8"/>' +
      '<rect x="10" y="10" width="46" height="22" rx="1.5" fill="#011337"/>' +
      '<rect x="10" y="46" width="46" height="22" rx="1.5" fill="#011337"/>' +
      "</g>" +
      '<path d="M736 204 H684" fill="none" stroke="#6b7c93" stroke-width="3" stroke-linecap="round"/>' +
      '<text x="748" y="200" font-family="Manrope, Segoe UI, sans-serif" font-size="12" font-weight="700" fill="#3d4753">NEUTRAL</text>' +
      '<text x="149" y="308" text-anchor="middle" font-family="Manrope, Segoe UI, sans-serif" font-size="13" font-weight="700" fill="#011337">One end — line (hot)</text>' +
      '<text x="149" y="326" text-anchor="middle" font-family="Manrope, Segoe UI, sans-serif" font-size="12" fill="#3d4753">Typically no tombstone change</text>' +
      '<text x="651" y="308" text-anchor="middle" font-family="Manrope, Segoe UI, sans-serif" font-size="13" font-weight="700" fill="#011337">Opposite end — neutral</text>' +
      '<text x="651" y="326" text-anchor="middle" font-family="Manrope, Segoe UI, sans-serif" font-size="12" fill="#3d4753">Tube can go in either way</text>' +
      "</svg>"
    );
  }

  function renderInstallation() {
    const c = company();
    const videos = INSTALL_VIDEOS;
    return (
      '<section class="wrap install-page">' +
      '<div class="crumbs"><a href="#/">Home</a> / Installation Guide</div>' +
      '<div class="section-kicker">Installation</div>' +
      "<h1>Installation Guide</h1>" +
      '<p class="install-lead">4-foot T8/T10 fluorescent retrofit LED tubes. Use the section that matches the Type marked on your tube: Compatible (Type A, plug-and-play), single-ended Type B (ballast bypass), or double-ended Type B.</p>' +
      '<nav class="install-jump" aria-label="Tube types">' +
      '<a href="#/installation/compatible">Compatible (Type A)</a>' +
      '<a href="#/installation/single-ended">Single-ended Type B</a>' +
      '<a href="#/installation/double-ended">Double-ended Type B</a>' +
      '<a href="#/installation/why-bypass">Why bypass</a>' +
      "</nav>" +
      '<div class="install-safety" role="note">' +
      "<strong>Safety.</strong> Always follow the wiring diagram printed on the tube and in its instructions — that label governs if it differs from this page. Ballast-bypass (Type B) work involves fixture rewiring: turn off power at the circuit breaker, verify the fixture is de-energized with a properly rated meter, comply with the National Electrical Code (NEC) and any applicable local amendments, and have a licensed electrician do the work." +
      "</div>" +

      '<h2 id="install-compatible">Compatible (Type A, plug-and-play)</h2>' +
      "<p>Compatible, or Type A, tubes are the easiest install: they are plug-and-play. Anyone can take out the fluorescent lamp and plug the LED tube into the existing fixture — no rewiring and no ballast work.</p>" +
      "<p>These tubes use about 40–50% less energy than a fluorescent lamp (up to about 40–50%, depending on the fixture and the lamp being replaced).</p>" +
      "<p>A Compatible tube runs on the existing ballast. If that ballast later fails, the tube stops working too, just as a fluorescent lamp would. A ballast-bypass upgrade is an option at that point — see the Type B sections below and <a href=\"#/installation/why-bypass\">Why bypass the ballast</a>.</p>" +

      '<h2 id="install-single-ended">Single-ended Type B (ballast bypass)</h2>' +
      "<p>Our single-ended Type B tubes are UL certified, with a high level of safety. Line and neutral enter at one end only, as marked on the lamp. The far end of the fixture has no line voltage — it provides mechanical support only — which makes relamping simpler and safer.</p>" +
      "<p>Installation requires bypassing the existing fluorescent ballast and rewiring so that line (hot) and neutral land only on the sockets at the tube’s labeled input end. The powered-end tombstones must be non-shunted.</p>" +
      '<ol class="install-steps">' +
      "<li><strong>Turn off power at the breaker</strong> that supplies the fixture. Apply lockout/tagout if required by site procedure.</li>" +
      "<li><strong>Verify the fixture is dead</strong> with a voltage tester or multimeter at the supply leads and lampholders.</li>" +
      "<li><strong>Remove the fluorescent tubes</strong> and the lens or diffuser, if present.</li>" +
      "<li><strong>Open the wireway</strong> or ballast cover to expose the ballast and lampholder leads.</li>" +
      "<li><strong>Cut or disconnect all ballast leads.</strong> Remove the ballast (and any starter) and dispose of it in accordance with local regulations. Do not leave the ballast in the circuit.</li>" +
      "<li><strong>Wire line (hot) and neutral to the single-ended input.</strong> Connect both conductors only to the non-shunted tombstones at one end of the fixture — the end that will receive the tube’s labeled input (typically marked L and N). Do not apply line voltage to the opposite end; those sockets provide mechanical support only.</li>" +
      "<li><strong>Replace shunted tombstones where required.</strong> Instant-start fluorescent fixtures often use shunted holders. For single-ended Type B lamps, the powered-end holders must be non-shunted. Confirm the type against the tube’s instructions and replace them before landing the new connections.</li>" +
      "<li><strong>Apply the retrofit / relamping label</strong> supplied with the tubes to a visible location on the fixture so future service knows it has been rewired for Type B lamps only.</li>" +
      "<li><strong>Reinstall the cover and tubes.</strong> Insert each LED tube with the labeled input end in the powered sockets, restore power, and test.</li>" +
      "</ol>" +
      '<figure class="install-diagram">' +
      installWiringDiagramSvg() +
      "<figcaption>Typical single-ended Type B wiring. Line and neutral land on one end only. Always follow the tube’s own label.</figcaption>" +
      "<p>If existing tombstones are shunted (typical of instant-start fluorescent fixtures), replace the powered-end holders with non-shunted tombstones. Multiple lamps in one fixture are typically wired in parallel to the same line and neutral.</p>" +
      "</figure>" +
      "<p>The video below is a third-party demonstration of converting a fluorescent fixture for single-ended, ballast-bypass LED tubes. Use it as a visual walkthrough. If anything in the video conflicts with the label or instructions on the tubes you received, follow the tube’s label.</p>" +
      '<div class="install-video-row">' +
      '<div class="install-video-col">' + installVideoHtml(videos.singleEnded) + "</div>" +
      '<aside class="install-notice" role="note">' +
      "<p>For installation, follow the manufacturer’s instructions for your exact model and all applicable electrical codes. Installation must be performed by a qualified, licensed electrician; products not installed by a licensed electrician are not covered by our warranty. See our <a href=\"#/warranty-returns\">Warranty and Return Policy</a> for details.</p>" +
      "</aside></div>" +

      '<h2 id="install-double-ended">Double-ended Type B</h2>' +
      "<p>Double-ended Type B tubes are fast for electricians: there is no orientation to worry about — the tube can go in either way. Installation still requires a ballast bypass and fixture rewiring, but the rewiring can be simpler. Typically no tombstone replacement is needed: remove the ballast, run line (hot) to one end of the fixture and neutral to the other. Always follow the tube’s label.</p>" +
      '<figure class="install-diagram">' +
      installDoubleEndedDiagramSvg() +
      "<figcaption>Typical double-ended Type B wiring. Line at one end, neutral at the other. Always follow the tube’s own label.</figcaption>" +
      "</figure>" +
      "<p>The video below is a third-party demonstration of rewiring a fluorescent fixture for double-ended LED tubes. If anything in the video conflicts with the label on the tubes you received, follow the tube’s label.</p>" +
      installVideoHtml(videos.doubleEnded) +

      '<h2 id="install-why-bypass">Why bypass the ballast</h2>' +
      "<p>Leaving the ballast in the circuit may look like less work on day one, but it leaves a wear item in place. If that ballast fails, the lamp goes out with it, just as a fluorescent tube would. You are then back to diagnosing or replacing a ballast. Bypassing the ballast removes that failure point.</p>" +
      "<p>Bypassing the ballast is a one-time wiring job. After that:</p>" +
      '<ul class="install-bullets">' +
      "<li>The LED tube is powered directly from the branch circuit, so ballast life no longer matters.</li>" +
      "<li>LED tubes typically last far longer than fluorescent lamps, so relamping is less frequent — and when a tube is replaced, no further rewiring is required.</li>" +
      "<li>The fixture no longer carries the ballast’s own energy draw.</li>" +
      "</ul>" +

      '<div class="install-actions">' +
      '<a class="btn btn-navy" href="#/product/' +
      encodeURIComponent(INSTALL_PRODUCT_SLUG) +
      '">View 4 ft retrofit tubes</a>' +
      '<a class="btn btn-outline" href="tel:' +
      escapeHtml(c.phoneTel) +
      '">' +
      escapeHtml(c.phone) +
      "</a>" +
      '<a class="btn btn-outline" href="mailto:' +
      escapeHtml(c.email) +
      '">' +
      escapeHtml(c.email) +
      "</a>" +
      "</div>" +
      "</section>" +
      factsBand()
    );
  }

  function renderAbout() {
    const c = company();
    return (
      '<section class="wrap about-page">' +
      "<h1>About Us</h1>" +
      "<p>Headquartered in Dallas, Texas, North America Lighting supplies commercial and industrial LED lighting to contractors, facility managers, and nonprofit organizations. We work with you to understand how your space is used and recommend fixtures that fit your project and budget.</p>" +
      "<p>Our LED fixtures are designed for reliable performance, energy efficiency, and low maintenance at a fair price. We stock a large inventory in our Texas warehouse and ship directly to job sites nationwide to help you meet tight project deadlines.</p>" +
      "<p>Before you order, we review your space and prepare a lighting plan at no additional cost, with recommended fixture locations and quantities.</p>" +
      '<p>During installation, our team can help you find product specifications, mounting details, and installation instructions for your fixture model. You can also browse our <a href="#/installation">installation guides</a> and YouTube videos for general reference.</p>' +
      "<p>After your purchase, we help troubleshoot product issues and guide you through the warranty process.</p>" +
      '<p class="about-contact"><strong>Phone:</strong> <a href="tel:' +
      escapeHtml(c.phoneTel) +
      '">' +
      escapeHtml(c.phone) +
      '</a><br><strong>Email:</strong> <a href="mailto:NALtx75247@gmail.com">NALtx75247@gmail.com</a></p>' +
      "</section>" +
      factsBand()
    );
  }

  function renderCatalog(catSlug, query) {
    const q = (query || "").trim().toLowerCase();
    let list = state.catalog.products.slice();
    const cat = state.catalog.categories.find((c) => c.slug === catSlug);
    if (cat) list = list.filter((p) => p.categorySlug === cat.slug);
    if (q) {
      list = list.filter((p) => {
        const hay = [
          p.name,
          p.displayName,
          p.description,
          productFeatures(p).join(" "),
          p.category,
          (p.badges || []).join(" "),
          p.variations.map((v) => (v.sku || "") + " " + (v.name || "")).join(" "),
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    const title = cat ? cat.name : "Catalog";
    return (
      '<section class="wrap">' +
      '<div class="section-kicker">Products</div>' +
      "<h1>" +
      escapeHtml(title) +
      "</h1>" +
      '<form class="toolbar" data-search-form>' +
      '<div class="cat-pills">' +
      '<a class="pill' +
      (!cat ? " active" : "") +
      '" href="#/catalog' +
      (q ? "?q=" + encodeURIComponent(query) : "") +
      '">All</a>' +
      state.catalog.categories
        .map((c) => {
          const href =
            "#/catalog/" +
            encodeURIComponent(c.slug) +
            (q ? "?q=" + encodeURIComponent(query) : "");
          return (
            '<a class="pill' +
            (cat && cat.slug === c.slug ? " active" : "") +
            '" href="' +
            href +
            '">' +
            escapeHtml(c.name) +
            "</a>"
          );
        })
        .join("") +
      "</div>" +
      '<div class="search"><input type="search" name="q" placeholder="Search fixtures, SKUs, wattage…" value="' +
      escapeHtml(query || "") +
      '" aria-label="Search catalog"><button type="submit">Search</button></div>' +
      "</form>" +
      '<div class="result-meta">' +
      list.length +
      (list.length === 1 ? " product" : " products") +
      (q ? " matching “" + escapeHtml(query) + "”" : "") +
      "</div>" +
      (list.length
        ? '<div class="product-grid">' + list.map(productCard).join("") + "</div>"
        : '<div class="empty">No products match this search. Try another term or <a href="#/catalog">view the full catalog</a>.</div>') +
      "</section>"
    );
  }

  function variationMatches(v, selected) {
    return Object.keys(selected).every((k) => (v.options || {})[k] === selected[k]);
  }

  function optionAvailable(product, selected, optionName, value) {
    const trial = Object.assign({}, selected, { [optionName]: value });
    return product.variations.some((v) => variationMatches(v, trial));
  }

  function renderProduct(slug) {
    const p = findProduct(slug);
    if (!p) {
      return '<section class="wrap"><h1>Product not found</h1><p><a href="#/catalog">Back to catalog</a></p></section>';
    }
    const selected = getSelectedOptions(p);
    const match = p.variations.find((v) => variationMatches(v, selected)) || null;
    const img = productImageUrl(p, match);
    const price = match ? match.price : p.hasPrice ? p.priceMin : null;
    const hasFixed = match && match.price != null;
    const sku = match && match.sku ? match.sku : "";
    const comboOk = !p.options.length || !!match;

    let optionsHtml = "";
    p.options.forEach((opt) => {
      optionsHtml +=
        '<div class="option-group"><span class="opt-label">' +
        escapeHtml(opt.name === "Brand" ? "Series" : opt.name) +
        "</span><div class=\"opt-values\">";
      opt.values.forEach((val) => {
        const active = selected[opt.name] === val;
        const avail = optionAvailable(p, selected, opt.name, val);
        optionsHtml +=
          '<button type="button" class="' +
          (active ? "active" : "") +
          (avail ? "" : " unavailable") +
          '" data-option="' +
          escapeHtml(opt.name) +
          '" data-value="' +
          escapeHtml(val) +
          '"' +
          (avail ? "" : " disabled") +
          ">" +
          escapeHtml(val) +
          "</button>";
      });
      optionsHtml += "</div></div>";
    });

    return (
      '<section class="wrap product-page" data-product-page data-slug="' +
      escapeHtml(p.slug) +
      '">' +
      "<div>" +
      '<div class="crumbs"><a href="#/catalog">Catalog</a> / <a href="#/catalog/' +
      encodeURIComponent(p.categorySlug) +
      '">' +
      escapeHtml(p.category) +
      "</a></div>" +
      '<div class="gallery">' +
      (img
        ? '<img src="' + escapeHtml(img) + '" alt="' + escapeHtml(p.displayName) + '">'
        : placeholderSvg()) +
      lensBadgeHtml(p) +
      "</div></div>" +
      '<div class="product-info">' +
      warrantyBadgeHtml(p) +
      badgesHtml(p.badges) +
      "<h1>" +
      escapeHtml(p.displayName) +
      "</h1>" +
      (productDescription(p)
        ? '<p class="product-desc">' + escapeHtml(productDescription(p)) + "</p>"
        : "") +
      clearanceNoteHtml(p) +
      optionsHtml +
      (comboOk
        ? '<div class="price-lg' +
          (hasFixed ? "" : " quote") +
          '">' +
          escapeHtml(hasFixed ? money(price) : "Call for price / request quote") +
          "</div>" +
          (sku ? '<div class="sku">SKU ' + escapeHtml(sku) + (match && match.name && p.variations.length > 1 ? " · " + escapeHtml(match.name) : "") + "</div>" : (match && match.name ? '<div class="sku">' + escapeHtml(match.name) + "</div>" : ""))
        : '<p class="unavailable-note">That combination is not available. Choose another option.</p>') +
      (comboOk && match && isVariationOos(match) ? outOfStockLabel() : "") +
      (comboOk
        ? '<form data-add-form>' +
          (hasFixed && !isClearance(p) && ewUnitPrice(match) != null && !(match && isVariationOos(match))
            ? '<label class="ew-option"><input type="checkbox" name="extendedWarranty" data-ew-toggle' +
              (ewMemory[p.slug] ? " checked" : "") +
              '><span>' + EW_LABEL + ' (+' + escapeHtml(money(ewUnitPrice(match))) + ')</span></label>'
            : "") +
          '<div class="qty-row"><label for="qty">Qty</label>' +
          '<input id="qty" name="qty" type="number" min="1" step="1" value="1"' +
          (match && isVariationOos(match) ? " disabled" : "") +
          '>' +
          '<button class="btn btn-navy" type="submit"' +
          (match && isVariationOos(match) ? " disabled" : "") +
          '>' +
          (match && isVariationOos(match)
            ? "Out of stock"
            : hasFixed
            ? "Add to cart"
            : "Add quote request") +
          "</button></div></form>"
        : "") +
      '<p class="muted">Wholesale request. Invoice and payment instructions are sent after you place the order.</p>' +
      featuresHtml(p) +
      installCtaHtml(p) +
      "</div></section>"
    );
  }

  function defaultSelected(p) {
    const first = p.variations.find(isVariationSellable) || p.variations[0];
    if (first && first.options && Object.keys(first.options).length) {
      return Object.assign({}, first.options);
    }
    const sel = {};
    p.options.forEach((o) => {
      sel[o.name] = o.values[0];
    });
    return sel;
  }

  const optionMemory = {};
  function getSelectedOptions(p) {
    if (optionMemory[p.slug]) return optionMemory[p.slug];
    optionMemory[p.slug] = defaultSelected(p);
    return optionMemory[p.slug];
  }

  /* ---------- shipping ---------- */

  const DEFAULT_WEIGHT_LB = {
    Panel: 8,
    "Down Light": 1.5,
    "Indoor Area": 6,
    Tube: 1.2,
    "High Bay": 12,
    "Outdoor Area": 8,
    Canopy: 10,
    "Corn Bulb": 1.5,
    Sign: 2.5,
  };

  // Zone table used by the client-side estimate (cents).
  // amount = base + perLb * billableLb, plus $0.40/lb over 70 lb.
  const SHIP_ZONES = [
    { maxMiles: 150, id: 1, name: "Zone 1 (local)", base: 995, perLb: 45 },
    { maxMiles: 300, id: 2, name: "Zone 2", base: 1295, perLb: 55 },
    { maxMiles: 600, id: 3, name: "Zone 3", base: 1695, perLb: 70 },
    { maxMiles: 1000, id: 4, name: "Zone 4", base: 2195, perLb: 90 },
    { maxMiles: 1400, id: 5, name: "Zone 5", base: 2695, perLb: 110 },
    { maxMiles: 1800, id: 6, name: "Zone 6", base: 3295, perLb: 130 },
    { maxMiles: Infinity, id: 7, name: "Zone 7", base: 3895, perLb: 150 },
  ];

  const ESTIMATE_NOTE = "Estimated — final freight confirmed on invoice";
  const PICKUP_NOTE = "Dallas, TX — address provided with order confirmation";

  let zip3Cache = null;
  let zip3Loading = null;

  function loadZip3() {
    if (zip3Cache) return Promise.resolve(zip3Cache);
    if (zip3Loading) return zip3Loading;
    zip3Loading = fetch("zip3.json")
      .then((r) => {
        if (!r.ok) throw new Error("Could not load ZIP data");
        return r.json();
      })
      .then((data) => {
        zip3Cache = data;
        return data;
      })
      .finally(() => {
        zip3Loading = null;
      });
    return zip3Loading;
  }

  function weightForLine(line) {
    if (line.weightLb != null && line.weightLb > 0) return line.weightLb;
    return DEFAULT_WEIGHT_LB[line.category] || 5;
  }

  function cartWeightLb() {
    let productLb = 0;
    let units = 0;
    state.cart.forEach((l) => {
      productLb += weightForLine(l) * l.qty;
      units += l.qty;
    });
    // Packing allowance: 1 lb plus 0.3 lb per unit.
    return Math.ceil(productLb + 1 + 0.3 * units);
  }

  function haversineMiles(a, b) {
    const R = 3958.8;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  function normalizeZip(raw) {
    const digits = String(raw || "").replace(/\D/g, "");
    if (digits.length < 5) return "";
    return digits.slice(0, 5);
  }

  function estimateShippingRate({ destZip, weightLb, zipData }) {
    const zip = normalizeZip(destZip);
    if (!zip) {
      return { ok: false, error: "Enter a valid 5-digit US ZIP code." };
    }
    const origin = (zipData && zipData.origin) || {
      zip: ORIGIN_ZIP,
      lat: 32.814402,
      lon: -96.878295,
    };
    const prefix = zip.slice(0, 3);
    const dest = zipData && zipData.zip3 && zipData.zip3[prefix];
    if (!dest) {
      return {
        ok: false,
        error: "We could not locate that ZIP. Check the code, or call (214) 631-6666 for a freight quote.",
      };
    }
    const miles = Math.round(
      haversineMiles({ lat: origin.lat, lon: origin.lon }, { lat: dest[0], lon: dest[1] })
    );
    const zone = SHIP_ZONES.find((z) => miles <= z.maxMiles) || SHIP_ZONES[SHIP_ZONES.length - 1];
    const lb = Math.max(1, Math.ceil(weightLb || 1));
    let amount = zone.base + zone.perLb * lb;
    if (lb > 70) amount += 40 * (lb - 70);
    return {
      ok: true,
      source: "estimate",
      method: "ship",
      destZip: zip,
      originZip: ORIGIN_ZIP,
      weightLb: lb,
      miles,
      zone: zone.id,
      zoneName: zone.name,
      amount,
      currency: "USD",
      label: "Estimated shipping",
      note: ESTIMATE_NOTE,
    };
  }

  // Single plug-in point for a future carrier-rate API (via a serverless proxy).
  // Swap the body to call that proxy; keep the same return shape.
  async function getShippingRate({ destZip, weightLb, items }) {
    const zipData = await loadZip3();
    return estimateShippingRate({ destZip, weightLb, items, zipData });
  }

  function pickupRate() {
    return {
      ok: true,
      source: "pickup",
      method: "pickup",
      destZip: "",
      originZip: ORIGIN_ZIP,
      amount: 0,
      currency: "USD",
      label: "Pickup at Dallas warehouse",
      note: PICKUP_NOTE,
    };
  }

  function shippingReady() {
    const s = state.shipping;
    if (s.method === "pickup") return true;
    if (s.method === "ship" && s.estimate && s.estimate.ok) return true;
    return false;
  }

  function shippingAmount() {
    const s = state.shipping;
    if (s.method === "pickup") return 0;
    if (s.method === "ship" && s.estimate && s.estimate.ok) return s.estimate.amount;
    return null;
  }

  function shippingLabel() {
    const s = state.shipping;
    if (s.method === "pickup") return "Pickup (Dallas, TX) — FREE";
    if (s.method === "ship" && s.estimate && s.estimate.ok) {
      return "Shipping to " + s.estimate.destZip;
    }
    return "Shipping";
  }

  function orderShippingSnapshot() {
    if (state.shipping.method === "pickup") return pickupRate();
    if (state.shipping.method === "ship" && state.shipping.estimate) {
      return Object.assign({}, state.shipping.estimate);
    }
    return null;
  }

  function shippingTotalsHtml(subtotal, hasQuote) {
    const shipAmt = shippingAmount();
    const shipReady = shippingReady();
    const shipLine = shipReady
      ? shipAmt === 0
        ? "FREE"
        : money(shipAmt)
      : "Select a method";
    const tax = currentTax();
    const taxReady = shipReady && tax && !tax.pending && tax.amount != null;
    const canTotal = shipReady && !(hasQuote && subtotal === 0) && taxReady;
    const total = canTotal && shipAmt != null ? subtotal + shipAmt + tax.amount : null;
    const taxAmountLabel = !shipReady || tax.pending
      ? "Select a method"
      : money(tax.amount);
    const taxClass = "summary-row tax" + (tax.exempt ? " tax-exempt" : "");
    return (
      '<div class="summary-row"><span>Subtotal</span><span>' +
      (hasQuote && subtotal === 0
        ? "Call for price / request quote"
        : money(subtotal) + (hasQuote ? " + items to quote" : "")) +
      '</span></div>' +
      '<div class="summary-row subtle"><span>' +
      escapeHtml(shippingLabel()) +
      "</span><span>" +
      escapeHtml(shipLine) +
      "</span></div>" +
      '<div class="' +
      taxClass +
      '"><span>' +
      escapeHtml(tax.label || "Sales tax") +
      "</span><span>" +
      escapeHtml(taxAmountLabel) +
      "</span></div>" +
      '<p class="resale-link"><a href="#/exemption">Tax Exemption</a></p>' +
      (total != null
        ? '<div class="summary-row total"><span>Total</span><span>' +
          money(total) +
          (hasQuote ? " + items to quote" : "") +
          "</span></div>"
        : "") +
      (tax.note ? '<p class="form-note">' + escapeHtml(tax.note) + "</p>" : "") +
      '<p class="form-note">Final freight is confirmed on the invoice. ' +
      escapeHtml(ESTIMATE_NOTE) +
      ".</p>"
    );
  }

  function shippingFormHtml() {
    const s = state.shipping;
    const method = s.method || "";
    const zipVal = s.zip || "";
    const shipOn = method === "ship";
    let result = "";
    if (method === "pickup") {
      result =
        '<div class="ship-result"><strong>FREE pickup</strong>' +
        escapeHtml(PICKUP_NOTE) +
        "</div>";
    } else if (s.estimate && s.estimate.ok) {
      const e = s.estimate;
      result =
        '<div class="ship-result"><strong>' +
        escapeHtml(money(e.amount)) +
        "</strong>" +
        escapeHtml(e.zoneName) +
        " · about " +
        e.miles +
        " miles · " +
        e.weightLb +
        " lb billable<br>" +
        escapeHtml(ESTIMATE_NOTE) +
        "</div>";
    } else if (s.estimate && s.estimate.error) {
      result = '<div class="ship-result error">' + escapeHtml(s.estimate.error) + "</div>";
    }
    return (
      '<div class="shipping-box" data-shipping>' +
      "<h2>Shipping</h2>" +
      '<label class="ship-option"><input type="radio" name="ship-method" value="pickup"' +
      (method === "pickup" ? " checked" : "") +
      '><span><span class="opt-title">Pickup at Dallas warehouse — FREE</span>' +
      '<span class="hint">' +
      escapeHtml(PICKUP_NOTE) +
      "</span></span></label>" +
      '<label class="ship-option"><input type="radio" name="ship-method" value="ship"' +
      (method === "ship" ? " checked" : "") +
      '><span><span class="opt-title">Ship to me</span>' +
      '<span class="hint">Enter your ZIP to estimate shipping from our Dallas warehouse (ZIP ' +
      ORIGIN_ZIP +
      ").</span></span></label>" +
      '<div class="ship-calc" data-ship-calc' +
      (shipOn ? "" : " hidden") +
      ">" +
      '<label>Destination ZIP *<input type="text" name="ship-zip" inputmode="numeric" maxlength="10" placeholder="e.g. 78701" value="' +
      escapeHtml(zipVal) +
      '" autocomplete="postal-code"></label>' +
      '<button type="button" class="btn btn-outline" data-calc-ship>Calculate</button>' +
      "</div>" +
      '<div data-ship-result>' +
      result +
      "</div></div>"
    );
  }

  function renderCart() {
    if (!state.cart.length) {
      return (
        '<section class="wrap"><h1>Cart</h1>' +
        '<div class="empty">Your cart is empty. <a href="#/catalog">Browse the catalog</a>.</div></section>'
      );
    }
    const { subtotal, hasQuote } = cartTotals();
    return (
      '<section class="wrap"><h1>Cart</h1>' +
      '<div class="cart-list">' +
      state.cart.map(cartRow).join("") +
      "</div>" +
      '<div class="summary">' +
      shippingTotalsHtml(subtotal, hasQuote) +
      (cartHasOutOfStock()
        ? '<p class="checkout-error">Remove out-of-stock items before checkout.</p>' +
          '<a class="btn btn-navy btn-block" href="#/checkout" data-checkout-link aria-disabled="true">Continue to checkout</a>'
        : '<a class="btn btn-navy btn-block" href="#/checkout" data-checkout-link>Continue to checkout</a>') +
      '<p class="checkout-error" data-ship-gate hidden>Choose pickup or calculate shipping before checkout.</p>' +
      shippingFormHtml() +
      "</div></section>"
    );
  }

  function cartRow(line, idx) {
    const img = processedImagePath(line.productId) || line.thumb || line.image;
    return (
      '<div class="cart-row' +
      (line.outOfStock ? " out-of-stock" : "") +
      '" data-line="' +
      idx +
      '">' +
      (img
        ? '<img src="' + escapeHtml(img) + '" alt="">'
        : '<div class="ph">' + placeholderSvg() + "</div>") +
      "<div><h3>" +
      escapeHtml(line.name) +
      "</h3>" +
      (line.variationName
        ? '<div class="var">' + escapeHtml(line.variationName) + "</div>"
        : "") +
      (line.sku ? '<div class="line-sku">SKU ' + escapeHtml(line.sku) + "</div>" : "") +
      (line.extendedWarranty && line.ewUnitPrice != null
        ? '<div class="line-ew">+ ' + EW_LINE_LABEL + " · " + escapeHtml(money(line.ewUnitPrice)) + " each · " +
          escapeHtml(money(lineWarrantyTotal(line))) + "</div>"
        : "") +
      (line.outOfStock ? outOfStockLabel() : "") +
      '<div class="line-actions"><input type="number" min="1" step="1" value="' +
      line.qty +
      '" data-qty>' +
      '<button type="button" data-remove>Remove</button></div></div>' +
      '<div class="line-price">' +
      (line.price == null ? "Quote" : money(lineTotal(line))) +
      "</div></div>"
    );
  }

  function cartTotals() {
    let subtotal = 0;
    let hasQuote = false;
    state.cart.forEach((l) => {
      if (l.price == null) hasQuote = true;
      else subtotal += lineTotal(l);
    });
    return { subtotal, hasQuote };
  }

  function renderCheckout() {
    if (!state.cart.length) {
      location.hash = "#/cart";
      return renderCart();
    }
    if (!shippingReady()) {
      location.hash = "#/cart";
      return renderCart();
    }
    if (cartHasOutOfStock()) {
      location.hash = "#/cart";
      return renderCart();
    }
    const { subtotal, hasQuote } = cartTotals();
    const pickup = state.shipping.method === "pickup";
    const zip = (state.shipping.estimate && state.shipping.estimate.destZip) || state.shipping.zip || "";
    const shipPlaceholder = pickup
      ? ""
      : "Street, city, state, " + (zip || "ZIP");
    const payBtn = PAYMENT_PROXY_URL
      ? '<button class="btn btn-pay btn-block" type="button" data-pay-square>Pay with card (Square)</button>' +
        '<p class="form-note">Card payments are taken on Square’s secure checkout page. Quote-only items cannot be charged online.</p>'
      : "";
    const acc = currentAccount();
    const v = (s) => escapeHtml(s || "");
    const registerBox = acc
      ? '<p class="form-note">Signed in as <strong>' +
        escapeHtml(acc.email) +
        '</strong>. <a href="#/account">My account</a></p>'
      : '<div class="register-box">' +
        '<label class="chk"><input type="checkbox" name="createAccount" data-create-account>' +
        "<span>Create an account with this info" +
        '<span class="hint">Only a password is needed. An account makes after-sales service easier.</span></span></label>' +
        '<label data-reg-pass hidden>Password *<input type="password" name="newPassword" minlength="8" autocomplete="new-password"></label>' +
        "</div>";
    return (
      '<section class="wrap"><h1>Checkout</h1>' +
      '<p class="form-note">This is a demo checkout. Submitting opens an email to North America Lighting with your order. You will also get an on-page confirmation with an order number. Invoice and payment instructions follow by email. No payment is taken on this page unless you use Pay with card and a payment proxy has been configured.</p>' +
      '<div class="checkout-grid">' +
      '<form class="form" data-checkout-form novalidate>' +
      "<label>Company/Organization Name (optional)<input name='company' autocomplete='organization' value='" + v(acc && acc.company) + "'></label>" +
      "<label>Recipient Name *<input name='name' required autocomplete='name' value='" + v(acc && acc.name) + "'></label>" +
      "<label>Email *<input name='email' type='email' required autocomplete='email' value='" + v(acc && acc.email) + "'></label>" +
      "<label>Phone *<input name='phone' type='tel' required autocomplete='tel' value='" + v(acc && acc.phone) + "'></label>" +
      (pickup
        ? "<p class='form-note'><strong>Pickup at Dallas warehouse — FREE.</strong> " +
          escapeHtml(PICKUP_NOTE) +
          "</p><input type='hidden' name='shipTo' value='" +
          escapeHtml(PICKUP_NOTE) +
          "'>"
        : "<label>Ship-to address *<textarea name='shipTo' required autocomplete='street-address' placeholder='" +
          escapeHtml(shipPlaceholder) +
          "'></textarea></label>") +
      "<label>PO number / notes<span class='hint'>Purchase order, job name, or delivery notes</span><textarea name='notes' placeholder='Optional'></textarea></label>" +
      registerBox +
      '<p class="checkout-error" data-reg-error hidden></p>' +
      '<label class="chk terms-agree"><input type="checkbox" name="agreeTerms" required data-agree-terms' +
      (state.termsAccepted ? " checked" : "") +
      '><span>I have read and agree to the <a href="#/terms" data-open-agreements>Terms &amp; Conditions</a> *' +
      '<span class="hint">Includes our Warranty and Return Policy, Privacy Policy, and Data Sharing terms.</span></span></label>' +
      '<p class="checkout-error" data-terms-error hidden>Please read and acknowledge the Terms &amp; Conditions before placing your order.</p>' +
      '<button class="btn btn-gold btn-block" type="submit" name="submitEmail">Submit order request</button>' +
      payBtn +
      '<p class="checkout-error" data-pay-error hidden></p>' +
      "</form>" +
      '<div class="summary"><h2>Order summary</h2>' +
      state.cart
        .map(
          (l) =>
            "<p><strong>" +
            escapeHtml(l.name) +
            "</strong>" +
            (l.variationName ? " — " + escapeHtml(l.variationName) : "") +
            "<br>Qty " +
            l.qty +
            " · " +
            (l.price == null ? "Call for price / request quote" : money(l.price * l.qty)) +
            (l.extendedWarranty && l.ewUnitPrice != null
              ? '<br><span class="line-ew">+ ' + EW_LINE_LABEL + " · " + escapeHtml(money(lineWarrantyTotal(l))) + "</span>"
              : "") +
            "</p>"
        )
        .join("") +
      shippingTotalsHtml(subtotal, hasQuote) +
      '<p><a href="#/cart">Change shipping</a></p>' +
      "</div></div></section>"
    );
  }

  function renderConfirmation(orderNo) {
    const orders = loadOrders();
    const order = orders.find((o) => o.orderNumber === orderNo);
    if (!order) {
      return (
        '<section class="wrap"><div class="confirm"><h1>Thanks — we have your order number</h1>' +
        '<div class="order-no">' +
        escapeHtml(orderNo || "") +
        "</div>" +
        "<p>If you just finished Square checkout, the payment was processed in Square Sandbox or live Square, depending on the link you used. Full line-item details appear here when you start checkout from this site in the same browser.</p>" +
        '<p><a class="btn btn-navy" href="#/catalog">Continue browsing</a></p></div></section>'
      );
    }
    return (
      '<section class="wrap"><div class="confirm">' +
      "<h1>Order request received</h1>" +
      '<div class="order-no">' +
      escapeHtml(order.orderNumber) +
      "</div>" +
      "<p>Your request has been prepared for <strong>naltx75247@gmail.com</strong>. If you paid with card, Square has the payment. If you sent an email request, we will follow up with an invoice.</p>" +
      '<div class="order-block">' +
      escapeHtml(formatOrderText(order)) +
      "</div>" +
      '<p style="margin-top:1.2rem"><a class="btn btn-navy" href="#/catalog">Continue browsing</a> ' +
      '<a class="btn btn-outline" href="#/account">View orders in this browser</a></p>' +
      "</div></section>"
    );
  }

  function renderLocalOrders() {
    const orders = loadOrders();
    return (
      '<section class="wrap"><h1>Orders in this browser</h1>' +
      '<p class="form-note">These are demo orders saved on this device only. They are not a live back office.</p>' +
      (orders.length
        ? orders
            .slice()
            .reverse()
            .map(
              (o) =>
                '<article class="order-card"><h3><a href="#/order/' +
                encodeURIComponent(o.orderNumber) +
                '">' +
                escapeHtml(o.orderNumber) +
                "</a></h3>" +
                '<div class="muted">' +
                escapeHtml(formatLocal(o.createdAt)) +
                " · " +
                escapeHtml(o.customer.company || o.customer.name) +
                " · " +
                o.items.length +
                (o.items.length === 1 ? " item" : " items") +
                "</div></article>"
            )
            .join("")
        : '<div class="empty">No orders have been placed in this browser yet.</div>') +
      "</section>"
    );
  }

  function renderSignIn(err) {
    if (isSignedIn()) {
      location.hash = "#/account";
      return renderAccount();
    }
    return (
      '<section class="wrap"><h1>Sign in</h1>' +
      '<p class="demo-callout">This is a browser-only demo. Accounts and passwords stay on this device. Passwords are hashed with PBKDF2 in your browser, but this is not a secure production system.</p>' +
      '<form class="form" data-signin-form style="max-width:28rem">' +
      formErrorHtml(err) +
      "<label>Email *<input name='email' type='email' required autocomplete='username'></label>" +
      "<label>Password *<input name='password' type='password' required autocomplete='current-password'></label>" +
      '<button class="btn btn-navy" type="submit">Sign in</button></form>' +
      '<p class="form-note">Regular customers can check out as guests. You can also create an account at checkout with one click. Need a resale tax exemption? <a href="#/exemption">Apply here</a> — exemption requires a registered, signed-in account.</p>' +
      "</section>"
    );
  }

  function renderAccount() {
    const acc = currentAccount();
    if (!acc) {
      location.hash = "#/signin";
      return renderSignIn();
    }
    const ex = acc.exemption;
    let exHtml = '<p>No resale exemption is on this account. <a href="#/exemption">Apply for a resale tax exemption</a>.</p>';
    if (ex && ex.status === "pending") {
      exHtml = "<p>Your exemption application is pending review.</p>";
    } else if (ex && ex.status === "approved") {
      exHtml =
        '<p class="tax-exempt"><strong>Tax exempt</strong> — permit #' +
        escapeHtml(ex.permitNumber || "on file") +
        (ex.permitState ? " (" + escapeHtml(ex.permitState) + ")" : "") +
        ".</p>";
    }
    const mine = loadOrders().filter((o) => o.accountEmail && o.accountEmail.toLowerCase() === acc.email);
    const alsoLocal = loadOrders();
    return (
      '<section class="wrap"><h1>My account</h1>' +
      '<p class="demo-callout">Demo account stored only in this browser.</p>' +
      "<p><strong>" +
      escapeHtml(acc.name || acc.email) +
      "</strong><br>" +
      escapeHtml(acc.email) +
      (acc.company ? "<br>" + escapeHtml(acc.company) : "") +
      '</p>' +
      "<h2>Tax exemption</h2>" +
      exHtml +
      '<p><button type="button" class="btn btn-outline" data-sign-out>Sign out</button></p>' +
      "<h2>Orders on this account</h2>" +
      (mine.length
        ? mine
            .slice()
            .reverse()
            .map(
              (o) =>
                '<article class="order-card"><h3><a href="#/order/' +
                encodeURIComponent(o.orderNumber) +
                '">' +
                escapeHtml(o.orderNumber) +
                "</a></h3>" +
                '<div class="muted">' +
                escapeHtml(formatLocal(o.createdAt)) +
                " · " +
                o.items.length +
                (o.items.length === 1 ? " item" : " items") +
                "</div></article>"
            )
            .join("")
        : '<div class="empty">No orders on this account yet.</div>') +
      (alsoLocal.length && alsoLocal.length !== mine.length
        ? '<p class="form-note">Other demo orders placed as a guest in this browser are listed below.</p>' +
          alsoLocal
            .filter((o) => !o.accountEmail || o.accountEmail.toLowerCase() !== acc.email)
            .reverse()
            .map(
              (o) =>
                '<article class="order-card"><h3><a href="#/order/' +
                encodeURIComponent(o.orderNumber) +
                '">' +
                escapeHtml(o.orderNumber) +
                "</a></h3>" +
                '<div class="muted">' +
                escapeHtml(formatLocal(o.createdAt)) +
                " · guest</div></article>"
            )
            .join("")
        : "") +
      "</section>"
    );
  }

  function renderExemption(err, notice) {
    const acc = currentAccount();
    if (acc && isTaxExemptAccount(acc)) {
      return (
        '<section class="wrap"><h1>Tax Exemption</h1>' +
        '<p class="tax-exempt">This signed-in account is already tax exempt — permit #' +
        escapeHtml(acc.exemption.permitNumber || "on file") +
        ".</p>" +
        '<p><a href="#/account">My account</a></p></section>'
      );
    }
    const pending = acc && loadApplications().find((a) => a.email === acc.email && a.status === "pending");
    const pre = acc || {};
    return (
      '<section class="wrap"><h1>Tax Exemption</h1>' +
      '<p class="demo-callout">This is a demo application. It is stored only in this browser and is not sent to NAL. Tax-exempt checkout requires a registered account, and you must be signed in for the exemption to apply. Passwords are hashed in the browser (PBKDF2) but this is not secure for production.</p>' +
      (notice ? '<p class="form-note">' + escapeHtml(notice) + "</p>" : "") +
      (pending
        ? "<p>You already have a pending application (" +
          escapeHtml(pending.id) +
          "). The demo admin can approve it at <a href=\"#/admin\">Admin (demo)</a>.</p>"
        : "") +
      '<form class="form" data-exemption-form style="max-width:36rem">' +
      formErrorHtml(err) +
      (acc
        ? "<p>Signed in as <strong>" + escapeHtml(acc.email) + "</strong>. Your exemption will be attached to this account.</p>"
        : "<p><strong>Create an account</strong> (required for exemption). Email and password will be your sign-in.</p>") +
      "<label>Business legal name *<input name='legalName' required value='" +
      escapeHtml(pre.company || "") +
      "'></label>" +
      "<label>DBA (if different)<input name='dba'></label>" +
      "<label>Contact name *<input name='contactName' required autocomplete='name' value='" +
      escapeHtml(pre.name || "") +
      "'></label>" +
      "<label>Email *<input name='email' type='email' required autocomplete='email' value='" +
      escapeHtml(pre.email || "") +
      "'" +
      (acc ? " readonly" : "") +
      "></label>" +
      (acc
        ? ""
        : "<label>Password *<span class='hint'>At least 8 characters. Required to register this account.</span><input name='password' type='password' required minlength='8' autocomplete='new-password'></label>") +
      "<label>Phone *<input name='phone' type='tel' required autocomplete='tel' value='" +
      escapeHtml(pre.phone || "") +
      "'></label>" +
      "<label>Business address *<textarea name='address' required>" +
      escapeHtml(pre.address || "") +
      "</textarea></label>" +
      "<label>State of resale permit *<input name='permitState' required maxlength='2' placeholder='TX' value='TX' style='text-transform:uppercase'></label>" +
      "<label>Texas Sales and Use Tax Permit number (11 digits) or other state resale ID *<input name='permitNumber' required placeholder='11-digit Texas permit or other state ID'></label>" +
      "<label>Texas Form 01-339 resale certificate (upload)<span class='hint'>Demo stores only the file name, not the file. In production the certificate is kept on file.</span><input name='certificate' type='file' accept='.pdf,.jpg,.jpeg,.png'></label>" +
      "<p class='file-name' data-file-name></p>" +
      "<label class='chk'><input type='checkbox' name='attest' required> <span>I certify that I am authorized to sign, that the merchandise will be resold or incorporated into taxable services for resale, and that this information is true. I understand a valid resale certificate must be kept on file.</span></label>" +
      '<button class="btn btn-gold" type="submit">Submit application</button></form>' +
      (lastMail() && lastMail().kind === "apply" ? emailPreviewHtml(lastMail()) : "") +
      "</section>"
    );
  }

  function renderAdminDemo() {
    const apps = loadApplications().slice().reverse();
    const mail = lastMail();
    return (
      '<section class="wrap"><h1>Admin (demo)</h1>' +
      '<p class="demo-callout">Hidden demo page for reviewing resale exemption applications stored in this browser. Approving marks the account tax-exempt and shows a customer email preview — no real email is sent.</p>' +
      (mail ? emailPreviewHtml(mail) : "") +
      (apps.length
        ? apps
            .map((a) => {
              const pending = a.status === "pending";
              return (
                '<article class="app-card" data-app="' +
                escapeHtml(a.id) +
                '"><span class="status-pill ' +
                escapeHtml(a.status) +
                '">' +
                escapeHtml(a.status) +
                "</span>" +
                "<h3>" +
                escapeHtml(a.legalName) +
                (a.dba ? " (DBA " + escapeHtml(a.dba) + ")" : "") +
                "</h3>" +
                "<p>" +
                escapeHtml(a.contactName) +
                " · " +
                escapeHtml(a.email) +
                " · " +
                escapeHtml(a.phone) +
                "<br>" +
                escapeHtml(a.address) +
                "<br>Permit: " +
                escapeHtml(a.permitNumber) +
                " (" +
                escapeHtml(a.permitState) +
                ")" +
                (a.certificateFileName ? "<br>Certificate on file (name only): " + escapeHtml(a.certificateFileName) : "") +
                "<br>Submitted " +
                escapeHtml(formatLocal(a.submittedAt)) +
                "</p>" +
                (pending
                  ? '<p><button type="button" class="btn btn-navy" data-approve-app="' +
                    escapeHtml(a.id) +
                    '">Approve</button> <a class="btn btn-outline" href="#/approve/' +
                    encodeURIComponent(a.id) +
                    '">Approve link</a></p>'
                  : "<p>Approved " + escapeHtml(formatLocal(a.approvedAt || "")) + ".</p>") +
                "</article>"
              );
            })
            .join("")
        : '<div class="empty">No exemption applications in this browser yet.</div>') +
      "</section>"
    );
  }

  function renderApprove(appId) {
    const result = approveApplication(decodeURIComponent(appId || ""));
    if (result.error) {
      return (
        '<section class="wrap"><h1>Approve exemption</h1>' +
        "<p>" +
        escapeHtml(result.error) +
        '</p><p><a href="#/admin">Admin (demo)</a></p></section>'
      );
    }
    return (
      '<section class="wrap"><h1>Exemption approved</h1>' +
      "<p>The account <strong>" +
      escapeHtml(result.app.email) +
      "</strong> is now tax exempt (permit #" +
      escapeHtml(result.app.permitNumber) +
      "). The customer would be emailed automatically in production.</p>" +
      emailPreviewHtml(result.mail) +
      '<p><a class="btn btn-navy" href="#/admin">Back to Admin (demo)</a></p></section>'
    );
  }

  function formatLocal(iso) {
    try {
      return new Date(iso).toLocaleString("en-US", {
        timeZone: "America/Chicago",
        dateStyle: "medium",
        timeStyle: "short",
      }) + " CT";
    } catch {
      return iso;
    }
  }

  function formatOrderText(order) {
    const lines = [];
    lines.push("North America Lighting — demo order request");
    lines.push("Order number: " + order.orderNumber);
    lines.push("Date: " + formatLocal(order.createdAt));
    lines.push("");
    lines.push("BILL TO");
    lines.push("Company/Organization: " + (order.customer.company || ""));
    lines.push("Recipient Name: " + order.customer.name);
    lines.push("Email: " + order.customer.email);
    lines.push("Phone: " + order.customer.phone);
    lines.push("");
    const ship = order.shipping;
    if (ship && ship.method === "pickup") {
      lines.push("SHIPPING / PICKUP");
      lines.push("Pickup at Dallas warehouse — FREE");
      lines.push(PICKUP_NOTE);
      lines.push("");
    } else {
      lines.push("SHIP TO");
      lines.push(order.customer.shipTo || "");
      lines.push("");
      if (ship && ship.method === "ship") {
        lines.push("SHIPPING");
        lines.push(
          "Ship to ZIP " +
            (ship.destZip || "") +
            (ship.zoneName ? " — " + ship.zoneName : "") +
            (ship.miles != null ? ", about " + ship.miles + " miles" : "") +
            (ship.weightLb != null ? ", " + ship.weightLb + " lb billable" : "")
        );
        lines.push(
          "Shipping: " +
            (ship.amount == null ? "Quote" : money(ship.amount)) +
            (ship.source === "estimate" ? " (estimate)" : "")
        );
        if (ship.note) lines.push(ship.note);
        lines.push("");
      }
    }
    if (termsAcceptanceLine(order)) {
      lines.push("TERMS");
      lines.push(termsAcceptanceLine(order));
      lines.push("");
    }
    if (order.customer.notes) {
      lines.push("PO / NOTES");
      lines.push(order.customer.notes);
      lines.push("");
    }
    lines.push("ITEMS");
    order.items.forEach((l, i) => {
      const unit = l.price == null ? "Call for price / request quote" : money(l.price);
      const lineTot = l.price == null ? "Quote" : money(l.price * l.qty);
      lines.push(
        i + 1 + ". " + l.name + (l.variationName ? " — " + l.variationName : "")
      );
      if (l.sku) lines.push("   SKU: " + l.sku);
      lines.push("   Qty: " + l.qty + "  x  " + unit + "  =  " + lineTot);
      if (l.extendedWarranty && l.ewUnitPrice != null) {
        lines.push(
          "   + " + EW_LINE_LABEL + ": Qty " + l.qty + "  x  " + money(l.ewUnitPrice) + "  =  " + money(lineWarrantyTotal(l))
        );
      }
    });
    lines.push("");
    const { subtotal, hasQuote } = totalsFromItems(order.items);
    const shipAmt = ship && ship.method === "pickup" ? 0 : ship && ship.amount != null ? ship.amount : null;
    lines.push(
      "SUBTOTAL: " +
        (hasQuote && subtotal === 0
          ? "Call for price / request quote"
          : money(subtotal) + (hasQuote ? " + items to quote" : ""))
    );
    if (ship && ship.method === "pickup") {
      lines.push("SHIPPING: FREE (warehouse pickup)");
    } else if (shipAmt != null) {
      lines.push("SHIPPING: " + money(shipAmt) + (ship && ship.source === "estimate" ? " (estimate)" : ""));
    }
    const tax = order.tax || null;
    if (tax) {
      lines.push(
        "SALES TAX: " +
          (tax.amount == null ? "TBD" : money(tax.amount)) +
          (tax.label ? " — " + tax.label : "") +
          (tax.estimated ? " (estimate)" : "")
      );
      if (tax.exempt && tax.label) {
        /* already in the label */
      } else if (tax.appliesToShipping) {
        lines.push("Tax applies to merchandise and to shipping (Texas rule for delivery charges on taxable items).");
      } else if (tax.jurisdiction === "none") {
        lines.push("No sales tax collected (shipment outside Texas; no nexus assumed outside TX).");
      }
    }
    const taxAmt = tax && tax.amount != null ? tax.amount : 0;
    if (shipAmt != null && !(hasQuote && subtotal === 0) && tax && tax.amount != null) {
      lines.push(
        "TOTAL: " +
          money(subtotal + shipAmt + taxAmt) +
          (hasQuote ? " + items to quote" : "")
      );
    } else if (shipAmt != null && !(hasQuote && subtotal === 0)) {
      lines.push(
        "ESTIMATED TOTAL (before tax): " +
          money(subtotal + shipAmt) +
          (hasQuote ? " + items to quote" : "")
      );
    }
    if (order.accountEmail) {
      lines.push("Account: " + order.accountEmail);
    }
    lines.push("");
    if (order.payment && order.payment === "square-pending") {
      lines.push("Payment: customer sent to Square Checkout (card).");
    } else {
      lines.push("This request was submitted from the NAL demo website.");
      lines.push("Please send an invoice and payment instructions.");
    }
    return lines.join("\n");
  }

  function totalsFromItems(items) {
    let subtotal = 0;
    let hasQuote = false;
    items.forEach((l) => {
      if (l.price == null) hasQuote = true;
      else subtotal += lineTotal(l);
    });
    return { subtotal, hasQuote };
  }

  function newOrderNumber() {
    const d = new Date();
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);
    const get = (t) => parts.find((p) => p.type === t).value;
    const stamp = get("year") + get("month") + get("day");
    const existing = new Set(loadOrders().map((o) => o.orderNumber));
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    for (let i = 0; i < 20; i++) {
      let suf = "";
      for (let j = 0; j < 4; j++) suf += chars[Math.floor(Math.random() * chars.length)];
      const num = "NAL-" + stamp + "-" + suf;
      if (!existing.has(num)) return num;
    }
    return "NAL-" + stamp + "-" + Date.now().toString(36).toUpperCase();
  }

  /* ---------- cart ops ---------- */

  function addToCart(product, variation, qty, withWarranty) {
    if (isVariationOos(variation)) return false;
    const key = variation.id;
    const ew = !!withWarranty && !isClearance(product) && ewUnitPrice(variation) != null;
    const existing = state.cart.find((l) => l.variationId === key && !!l.extendedWarranty === ew);
    if (existing) existing.qty += qty;
    else {
      state.cart.push({
        extendedWarranty: ew,
        ewUnitPrice: ew ? ewUnitPrice(variation) : null,
        productId: product.id,
        variationId: variation.id,
        slug: product.slug,
        name: product.displayName,
        variationName: variation.name,
        sku: variation.sku || "",
        price: variation.price,
        qty,
        category: product.category || "",
        weightLb: product.weightLb != null ? product.weightLb : (DEFAULT_WEIGHT_LB[product.category] || 5),
        image: productImageUrl(product, variation),
        thumb: productImageUrl(product, variation),
      });
    }
    saveCart();
    if (state.shipping.method === "ship") {
      state.shipping.estimate = null;
      saveShipping();
    }
  }


  function setPageTitle(root) {
    const c = state.catalog && state.catalog.company;
    const name = (c && c.name) || "North America Lighting";
    const pageTitles = {
      contact: "Contact Us",
      terms: "Terms & Conditions",
      "warranty-returns": "Warranty and Return Policy",
      privacy: "Privacy Policy",
      "data-sharing": "Data Sharing",
      installation: "Installation Guide",
      "installation-instructions": "Installation Guide",
    };
    if (pageTitles[root]) document.title = pageTitles[root] + " — " + name;
    else document.title = SITE_TITLE;
  }

  /* Contact page. Address + map stay hidden until company.address is set
     in the catalog (optional company.mapEmbedUrl for an embed iframe src). */
  function renderContact() {
    const c = company();
    const address = String((c && c.address) || "").trim();
    const mapEmbedUrl = String((c && c.mapEmbedUrl) || "").trim();
    let locationHtml = "";
    if (address) {
      locationHtml =
        '<section class="contact-location">' +
        "<h2>Address</h2>" +
        '<p class="contact-address">' +
        escapeHtml(address) +
        "</p>" +
        (mapEmbedUrl
          ? '<div class="contact-map"><iframe title="Map" src="' +
            escapeHtml(mapEmbedUrl) +
            '" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>'
          : "") +
        "</section>";
    }
    return (
      '<section class="wrap contact-page">' +
      '<div class="crumbs"><a href="#/">Home</a> / Contact Us</div>' +
      '<div class="section-kicker">Get in touch</div>' +
      "<h1>Contact Us</h1>" +
      '<p class="contact-intro">Call or email us. We are a Dallas wholesale supplier serving the central United States, and we ship nationwide.</p>' +
      '<div class="contact-cards">' +
      '<a class="contact-card" href="tel:' +
      escapeHtml(c.phoneTel) +
      '"><div class="contact-card-label">Phone</div><div class="contact-card-value">' +
      escapeHtml(c.phone) +
      "</div></a>" +
      '<a class="contact-card" href="mailto:' +
      escapeHtml(c.email) +
      '"><div class="contact-card-label">Email</div><div class="contact-card-value">' +
      escapeHtml(c.email) +
      "</div></a>" +
      "</div>" +
      locationHtml +
      '<p class="contact-note muted">For a complaint or warranty return, use <a href="#/support">Customer Service</a>. You can also message us with the chat button on this site.</p>' +
      "</section>"
    );
  }

  /* ---------- policy pages (round 32) ---------- */

  const POLICY_UPDATED = "November 22, 2026";

  function policyShell(crumb, kicker, title, dateLabel, body) {
    return (
      '<section class="wrap policy-page">' +
      '<div class="crumbs"><a href="#/">Home</a> / ' + crumb + "</div>" +
      '<div class="section-kicker">' + kicker + "</div>" +
      "<h1>" + title + "</h1>" +
      '<p class="policy-updated">' + dateLabel + ": " + POLICY_UPDATED + "</p>" +
      body +
      "</section>"
    );
  }

  function policyContact() {
    const c = company();
    return {
      name: escapeHtml(c.name),
      phone: escapeHtml(c.phone),
      tel: escapeHtml(c.phoneTel),
      email: escapeHtml(c.email),
      site: "naltx.com",
      city: "Dallas, Texas",
    };
  }

  function renderTerms() {
    const k = policyContact();
    const N = k.name;
    const body = `
<h2>Overview</h2>
<p>${N} operates this website. Wherever the words “we,” “us,” and “our” appear on this site, they mean ${N}. We make this website, together with all of the information, tools, and services on it, available to you, the user, on the condition that you accept every term, condition, policy, and notice set out here.</p>
<p>When you visit our site or buy something from us, you are using our “Service,” and you agree to be bound by these terms and conditions (“Terms of Service” or “Terms”), including any additional terms, conditions, and policies referred to here or linked from here. These Terms of Service apply to every user of the site, including, without limitation, browsers, vendors, customers, merchants, and anyone who contributes content.</p>
<p>Please read these Terms of Service carefully before you access or use our website. By accessing or using any part of the site, you agree to be bound by them. If you do not agree with all of the terms and conditions of this agreement, you may not access the website or use any of our services. If these Terms of Service are considered an offer, acceptance is expressly limited to these Terms of Service.</p>
<p>Any new features or tools added to the current store will also be subject to these Terms of Service. You can review the most current version at any time on this page. We reserve the right to update, change, or replace any part of these Terms of Service by posting updates or changes on our website. It is your responsibility to check this page from time to time for changes. If you continue to use or access the website after changes are posted, you accept those changes.</p>
<p>Our store is hosted by third-party service providers. They supply the online e-commerce platform that allows us to sell our products and services to you.</p>

<h2>Section 1 – Online Store Terms</h2>
<p>By agreeing to these Terms of Service, you confirm that you are at least the age of majority in your state or province of residence, or that you are the age of majority in your state or province of residence and have given us your consent to let any of your minor dependents use this site.</p>
<p>You may not use our products for any illegal or unauthorized purpose, and in using the Service you may not violate any laws in your jurisdiction (including, but not limited to, copyright laws).</p>
<p>You must not transmit any worms, viruses, or other code of a destructive nature.</p>
<p>Any breach or violation of these Terms will result in the immediate termination of your Services.</p>

<h2>Section 2 – General Conditions</h2>
<p>We reserve the right to refuse service to anyone, for any reason, at any time.</p>
<p>You understand that your content (not including credit card information) may be transferred unencrypted and may involve (a) transmission over various networks and (b) changes made to conform and adapt to the technical requirements of connecting networks or devices. Credit card information is always encrypted when it is transferred over networks.</p>
<p>You agree not to reproduce, duplicate, copy, sell, resell, or exploit any portion of the Service, use of the Service, or access to the Service or any contact on the website through which the Service is provided, without our express written permission.</p>
<p>The headings in this agreement are included only for convenience and do not limit or otherwise affect these Terms.</p>

<h2>Section 3 – Accuracy, Completeness and Timeliness of Information</h2>
<p>We are not responsible if information made available on this site is not accurate, complete, or current. Material on this site is provided for general information only and should not be relied on or used as the sole basis for decisions without consulting primary, more accurate, more complete, or more timely sources of information. You rely on the material on this site at your own risk.</p>
<p>This site may contain certain historical information. Historical information is, by its nature, not current and is provided for your reference only. We reserve the right to modify the contents of this site at any time, but we have no obligation to update any information on it. You agree that it is your responsibility to monitor changes to our site.</p>

<h2>Section 4 – Modifications to the Service and Prices</h2>
<p>Prices for our products may change without notice.</p>
<p>We reserve the right, at any time, to modify or discontinue the Service (or any part or content of it) without notice.</p>
<p>We will not be liable to you or to any third party for any modification, price change, suspension, or discontinuance of the Service.</p>

<h2>Section 5 – Products or Services</h2>
<p>Certain products or services may be available only online through the website. These products or services may be available in limited quantities and may be returned or exchanged only under our <a href="#/warranty-returns">Warranty and Return Policy</a>. Clearance items are sold AS IS, carry no warranty, and cannot be returned or exchanged.</p>
<p>We have made every effort to display the colors and images of our products in the store as accurately as possible. We cannot guarantee that your computer monitor will display any color accurately.</p>
<p>We reserve the right, but are not obligated, to limit sales of our products or Services to any person, geographic region, or jurisdiction, and we may exercise this right case by case. We reserve the right to limit the quantities of any products or services we offer. All product descriptions and pricing may change at any time without notice, at our sole discretion. We reserve the right to discontinue any product at any time. Any offer for any product or service made on this site is void where prohibited.</p>
<p>We do not warrant that the quality of any products, services, information, or other material you purchase or obtain will meet your expectations, or that any errors in the Service will be corrected.</p>

<h2>Section 6 – Accuracy of Billing and Account Information</h2>
<p>We reserve the right to refuse any order you place with us. We may, in our sole discretion, limit or cancel quantities purchased per person, per household, or per order. These restrictions may include orders placed by or under the same customer account, the same credit card, and/or orders that use the same billing and/or shipping address. If we change or cancel an order, we may try to notify you by contacting the email and/or billing address/phone number provided when the order was placed. We reserve the right to limit or prohibit orders that, in our sole judgment, appear to be placed by dealers, resellers, or distributors.</p>
<p>You agree to provide current, complete, and accurate purchase and account information for every purchase made at our store. You agree to promptly update your account and other information, including your email address, credit card numbers, and expiration dates, so that we can complete your transactions and contact you as needed.</p>
<p>For more detail, please review our <a href="#/warranty-returns">Warranty and Return Policy</a>.</p>

<h2>Section 7 – Optional Tools</h2>
<p>We may give you access to third-party tools that we do not monitor and over which we have no control or input.</p>
<p>You acknowledge and agree that we provide access to such tools “as is” and “as available,” without any warranties, representations, or conditions of any kind and without any endorsement. We have no liability whatsoever arising from or relating to your use of optional third-party tools.</p>
<p>Any use you make of optional tools offered through the site is entirely at your own risk and discretion, and you should make sure you are familiar with and approve of the terms on which the relevant third-party provider(s) supply those tools.</p>
<p>To the extent permitted by law, the purchaser assigns to ${N} the rights to offer any electric demand savings, energy-efficiency or demand-response capacity credits, and related capacity market rights achieved through the products purchased into any U.S. regional transmission organization, independent system operator, or utility program (for example, ERCOT, PJM, ISO-NE, MISO, or CAISO).</p>
<p>We may also offer new services and/or features through the website in the future (including new tools and resources). Those new features and/or services will also be subject to these Terms of Service.</p>

<h2>Section 8 – Third-Party Links</h2>
<p>Certain content, products, and services available through our Service may include material from third parties.</p>
<p>Third-party links on this site may take you to third-party websites that are not affiliated with us. We are not responsible for examining or evaluating their content or accuracy, and we do not warrant, and will have no liability or responsibility for, any third-party materials or websites, or any other materials, products, or services of third parties.</p>
<p>We are not liable for any harm or damages related to the purchase or use of goods, services, resources, content, or any other transactions made in connection with any third-party website. Please review the third party’s policies and practices carefully and make sure you understand them before you engage in any transaction. Complaints, claims, concerns, or questions about third-party products should be directed to the third party.</p>

<h2>Section 9 – User Comments, Feedback and Other Submissions</h2>
<p>If, at our request, you send certain specific submissions (for example, contest entries), or if without a request from us you send creative ideas, suggestions, proposals, plans, or other materials, whether online, by email, by postal mail, or otherwise (collectively, “comments”), you agree that we may, at any time and without restriction, edit, copy, publish, distribute, translate, and otherwise use in any medium any comments you send us. We are and will be under no obligation (1) to keep any comments confidential; (2) to pay compensation for any comments; or (3) to respond to any comments.</p>
<p>We may, but have no obligation to, monitor, edit, or remove content that we determine in our sole discretion is unlawful, offensive, threatening, libelous, defamatory, pornographic, obscene, or otherwise objectionable, or that violates any party’s intellectual property or these Terms of Service.</p>
<p>You agree that your comments will not violate any right of any third party, including copyright, trademark, privacy, personality, or other personal or proprietary rights. You further agree that your comments will not contain libelous or otherwise unlawful, abusive, or obscene material, or any computer virus or other malware that could in any way affect the operation of the Service or any related website. You may not use a false email address, pretend to be someone other than yourself, or otherwise mislead us or third parties about the origin of any comments. You are solely responsible for any comments you make and for their accuracy. We take no responsibility and assume no liability for any comments posted by you or any third party.</p>

<h2>Section 10 – Personal Information</h2>
<p>Your submission of personal information through the store is governed by our <a href="#/privacy">Privacy Policy</a>.</p>

<h2>Section 11 – Errors, Inaccuracies and Omissions</h2>
<p>From time to time, information on our site or in the Service may contain typographical errors, inaccuracies, or omissions relating to product descriptions, pricing, promotions, offers, product shipping charges, transit times, and availability. We reserve the right to correct any errors, inaccuracies, or omissions, and to change or update information or cancel orders if any information in the Service or on any related website is inaccurate at any time, without prior notice (including after you have submitted your order).</p>
<p>We have no obligation to update, amend, or clarify information in the Service or on any related website, including, without limitation, pricing information, except as required by law. No specified update or refresh date applied in the Service or on any related website should be taken to mean that all information in the Service or on any related website has been modified or updated.</p>

<h2>Section 12 – Prohibited Uses</h2>
<p>In addition to the other prohibitions in these Terms of Service, you may not use the site or its content: (a) for any unlawful purpose; (b) to solicit others to perform or take part in any unlawful acts; (c) to violate any international, federal, provincial, or state regulations, rules, laws, or local ordinances; (d) to infringe or violate our intellectual property rights or the intellectual property rights of others; (e) to harass, abuse, insult, harm, defame, slander, disparage, intimidate, or discriminate based on gender, sexual orientation, religion, ethnicity, race, age, national origin, or disability; (f) to submit false or misleading information; (g) to upload or transmit viruses or any other malicious code that will or may be used in any way that affects the functionality or operation of the Service, any related website, other websites, or the Internet; (h) to collect or track the personal information of others; (i) to spam, phish, pharm, pretext, spider, crawl, or scrape; (j) for any obscene or immoral purpose; or (k) to interfere with or circumvent the security features of the Service, any related website, other websites, or the Internet. We reserve the right to end your use of the Service or any related website for violating any of these prohibited uses.</p>

<h2>Section 13 – Disclaimer of Warranties; Limitation of Liability</h2>
<p>We do not guarantee, represent, or warrant that your use of our service will be uninterrupted, timely, secure, or error-free.</p>
<p>We do not warrant that the results that may be obtained from using the service will be accurate or reliable.</p>
<p>You agree that we may remove the service for indefinite periods of time, or cancel the service at any time, without notice to you.</p>
<p>You expressly agree that your use of, or inability to use, the service is at your sole risk. The service and all products and services delivered to you through it are (except as we expressly state) provided “as is” and “as available” for your use, without any representation, warranties, or conditions of any kind, express or implied, including all implied warranties or conditions of merchantability, merchantable quality, fitness for a particular purpose, durability, title, and non-infringement.</p>
<p>In no case will ${N}, or our directors, officers, employees, affiliates, agents, contractors, interns, suppliers, service providers, or licensors, be liable for any injury, loss, claim, or any direct, indirect, incidental, punitive, special, or consequential damages of any kind, including, without limitation, lost profits, lost revenue, lost savings, loss of data, replacement costs, or any similar damages, whether based in contract, tort (including negligence), strict liability, or otherwise, arising from your use of the service or of any products obtained through the service, or for any other claim related in any way to your use of the service or any product, including, but not limited to, any errors or omissions in any content, or any loss or damage of any kind incurred as a result of using the service or any content (or product) posted, transmitted, or otherwise made available through the service, even if advised of their possibility. Because some states or jurisdictions do not allow the exclusion or limitation of liability for consequential or incidental damages, in those states or jurisdictions our liability will be limited to the maximum extent permitted by law.</p>

<h2>Section 14 – Indemnification</h2>
<p>You agree to indemnify, defend, and hold harmless ${N} and our parent, subsidiaries, affiliates, partners, officers, directors, agents, contractors, licensors, service providers, subcontractors, suppliers, interns, and employees from any claim or demand, including reasonable attorneys’ fees, made by any third party because of or arising out of your breach of these Terms of Service or the documents they incorporate by reference, or your violation of any law or of the rights of a third party.</p>

<h2>Section 15 – Severability</h2>
<p>If any provision of these Terms of Service is found to be unlawful, void, or unenforceable, that provision will still be enforceable to the fullest extent permitted by applicable law, and the unenforceable portion will be treated as severed from these Terms of Service. Such a finding will not affect the validity and enforceability of any other remaining provisions.</p>

<h2>Section 16 – Termination</h2>
<p>The obligations and liabilities of the parties incurred before the termination date will survive the termination of this agreement for all purposes.</p>
<p>These Terms of Service remain in effect unless and until either you or we terminate them. You may terminate these Terms of Service at any time by telling us you no longer wish to use our Services, or when you stop using our site.</p>
<p>If, in our sole judgment, you fail, or we suspect that you have failed, to comply with any term or provision of these Terms of Service, we may also terminate this agreement at any time without notice. You will remain liable for all amounts due up to and including the date of termination, and/or we may deny you access to our Services (or any part of them).</p>

<h2>Section 17 – Entire Agreement</h2>
<p>Our failure to exercise or enforce any right or provision of these Terms of Service will not be a waiver of that right or provision.</p>
<p>These Terms of Service, together with any policies or operating rules we post on this site or in respect of the Service, make up the entire agreement and understanding between you and us and govern your use of the Service. They supersede any prior or contemporaneous agreements, communications, and proposals, whether oral or written, between you and us (including, but not limited to, any earlier versions of the Terms of Service).</p>
<p>Any ambiguities in interpreting these Terms of Service will not be construed against the drafting party.</p>

<h2>Section 18 – Governing Law</h2>
<p>These Terms of Service, and any separate agreements under which we provide you Services, are governed by and will be interpreted in accordance with the laws of the State of Texas.</p>

<h2>Section 19 – Changes to Terms of Service</h2>
<p>You can review the most current version of the Terms of Service on this page at any time.</p>
<p>We reserve the right, at our sole discretion, to update, change, or replace any part of these Terms of Service by posting updates and changes on our website. It is your responsibility to check our website from time to time for changes. If you continue to use or access our website or the Service after any changes to these Terms of Service are posted, you accept those changes.</p>

<h2>Section 20 – Contact Information</h2>
<p>Please send questions about the Terms of Service to us at <a href="mailto:${k.email}">${k.email}</a>, call <a href="tel:${k.tel}">${k.phone}</a>, or visit our <a href="#/contact">Contact Us</a> page. ${N}, ${k.city}.</p>
<p class="policy-also">Also see: <a href="#/privacy">Privacy Policy</a> · <a href="#/warranty-returns">Warranty and Return Policy</a></p>`;
    return policyShell("Terms &amp; Conditions", "Policies", "Terms &amp; Conditions", "Last updated", body);
  }

  function renderWarrantyReturns() {
    const k = policyContact();
    const N = k.name;
    const body = `
<h2>Returns</h2>
<p>In some situations, we may be able to accept a return within 30 days of purchase that falls outside our standard terms. When we do, the following conditions apply:</p>
<ul>
<li>In-stock items that are in new condition, in their original box, and complete with all packing material, manuals, and accessories are subject to a 25% restocking fee.</li>
<li>Custom and built-to-order products cannot be returned.</li>
<li>Orders for which a project sample was originally purchased are not eligible.</li>
<li>Clearance items are sold AS IS and cannot be returned or exchanged.</li>
</ul>

<h3>How Do I Request a Sample Order Return?</h3>
<ul>
<li>Submit the form on our <a href="#/support/warranty">Customer Service</a> page.</li>
<li>Our customer service team will contact you with the next steps.</li>
</ul>

<h3>7-Day Inspection for Damaged or Incorrect Shipments</h3>
<p>If an item we shipped arrives damaged or is the wrong product, ${N} will replace it or refund it, along with any applicable shipping costs. The customer is responsible for documenting any error or damage at the time of delivery, before signing for the shipment. To be eligible for a refund, every claim must be reported within 7 days of delivery.</p>
<p>Any damage that was not documented at delivery must be recorded right away and reported to customer service. We recommend that customers photograph any error or damage and keep all of the original packaging.</p>
<p>${N} may, at any time, limit the number of delivery attempts based on an unfavorable delivery history caused by, but not limited to, damage, loss, or theft.</p>

<h3>Who Pays for Return Shipping?</h3>
<p>When a product is determined to be non-defective, the customer pays the return shipping costs. We recommend that every customer ship returns with an insured ground carrier and keep the tracking information. Lost or stolen packages will not be counted as completed returns.</p>
<p><strong>Store drop-off:</strong> Instead of shipping, you may drop off a return or warranty item at our Dallas store for inspection, so you do not have to pay return shipping. Returns dropped off at the store follow the same 30-day and restocking-fee terms above; please contact customer service before you visit.</p>

<h3>Cancellation Policy</h3>
<p>If you want to cancel an order that has not shipped yet, please let your sales representative know as soon as possible. Special orders and custom-made orders marked as shipped cannot be canceled once the order has been processed.</p>

<h2>Warranties</h2>
<p>Warranty terms differ from product to product, but we stand behind everything we sell and are glad to work directly with our customers to resolve any issue with product performance. We have the right to inspect returned items to confirm that the problem is a product failure and was not caused by faulty installation.</p>
<p>This limited warranty is provided by ${N}, referred to here as “NAL,” to you as the original purchaser of the LED lighting product. It may be transferred to later purchasers of the Product, as long as the Product is resold in new condition and in its original packaging. The seller warrants that the Product, when delivered in new condition and in its original packaging, will be free of defects in material and workmanship for the warranty period identified for the specific product(s) purchased, starting from the date of original purchase. NAL decides, in its sole discretion and with consideration of the Product’s overall performance, whether the Product is defective. A luminaire may be considered defective under this warranty only if more than 20% of its LEDs show defects, including burnout, loosening, or a broken PC board, or technical and material defects, or defects in workmanship. Driver defects, including functional problems with the IP system, power factor, and similar issues that affect how the LED fixture works, will be treated as defects under this warranty.</p>
<p><strong>Clearance Items — Sold AS IS:</strong> The 5-year warranty on lights and the 3-year warranty on drivers do not apply to clearance items. Any product sold as clearance, including any item labeled “Clearance” or listed in a clearance sale, is sold AS IS, with no warranty of any kind, and is not eligible for return, exchange, or the Extended Warranty. All clearance sales are final.</p>
<p>This warranty does not cover any product or part that has been subject to misuse, negligence, accidents, Acts of God, use outside the product’s design intent, or attempted repair or modification by anyone other than NAL. NAL’s sole liability for defects or breach of warranty is replacement of the parts involved, and NAL will in no case be liable for special or consequential damages or losses, including property damage or any other loss related directly or indirectly to the use of NAL luminaires. NAL is never liable for consequential damages or personal injury caused by installation, or by negligence during installation or adjustment of the LED lighting fixture. NAL accepts no liability for installation costs or any other costs incurred while using products supplied by NAL. No representative is authorized to take on additional liability on behalf of NAL.</p>
<p><strong>Factory Return Warranty:</strong> Every return must be factory authorized, and NAL must issue a Return Material Authorization (RMA) before anything is shipped. Returns are shipped at the buyer’s expense, or you may drop off the item at our Dallas store for inspection at no shipping cost.</p>
<p>NAL reserves the right to use new, reconditioned, refurbished, repaired, or re-manufactured products or parts in the warranty repair or replacement process. These products and parts will be comparable in function and performance to an original product or part, as NAL determines in its sole discretion, and will be warranted for the rest of the original warranty period. To make a warranty claim, you must notify NAL in writing within fifteen (15) days of discovering the defect and provide proof of purchase, such as the invoice.</p>
<p>If NAL finds that the product is working properly, the buyer may be billed for testing, repackaging, and shipping. If the warranty has expired, NAL will provide a repair quote before doing any repairs. If the product was under warranty and NAL repairs or replaces it, NAL will cover the return shipping to the customer. NAL will in no case be liable for any cost of removing or installing the product, even if the product failed under a covered warranty.</p>
<p class="policy-caps">THE WARRANTY PROVISIONS ABOVE ARE EXCLUSIVE AND ARE GIVEN AND ACCEPTED IN PLACE OF ANY AND ALL OTHER WARRANTIES, EXPRESS OR IMPLIED, INCLUDING, WITHOUT LIMITATION, ANY WARRANTY AGAINST INFRINGEMENT AND ANY IMPLIED WARRANTIES OF MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. NAL WILL IN NO EVENT BE LIABLE FOR INCIDENTAL DAMAGES.</p>

<h2>Frequently Asked Questions</h2>
<h3>How is the Extended Warranty different from the standard product warranty?</h3>
<p>The Extended Warranty adds one (1) more year of warranty coverage for your product.</p>
<h3>How long are products covered under your standard warranty?</h3>
<p>Every light we sell carries a warranty of at least 5 years from the date of purchase. Drivers carry a 3-year warranty. Clearance items are sold AS IS and are not covered.</p>
<h3>How can I find out whether my product is still under warranty?</h3>
<p>Check your order confirmation or invoice, or ask your sales representative. ${N} reserves the right to verify the purchase date for warranty claims.</p>
<h3>What protection does the Extended Warranty include?</h3>
<p>The coverage matches our standard warranty, including product failure.</p>
<h3>What does the Extended Warranty not cover?</h3>
<p>We do not cover product damage other than damage that occurred before delivery or was caused by product failure; damage from abuse, maintenance, acts of God, and other issues outside normal operating conditions is not covered.</p>
<h3>When must the Extended Warranty be purchased?</h3>
<p>The Extended Warranty has to be purchased when you place your order. It is not available for clearance items.</p>
<h3>Is the warranty coverage transferable?</h3>
<p>The coverage applies to the purchased product.</p>
<h3>Will my covered product be repaired or replaced?</h3>
<p>That depends on the issue we identify. Rest assured that we will do our best to get your product back up and running.</p>
<h3>After my covered product is replaced, what coverage does the replacement have?</h3>
<p>The warranty (and any extended warranty) continues from your original purchase date.</p>
<h3>How many times can a product be repaired?</h3>
<p>We will support the product until its warranty expires.</p>
<p class="policy-also">Questions? Call <a href="tel:${k.tel}">${k.phone}</a>, email <a href="mailto:${k.email}">${k.email}</a>, or use our <a href="#/support/warranty">Customer Service</a> page.</p>`;
    return policyShell("Warranty and Return Policy", "Policies", "Warranty and Return Policy", "Last updated", body);
  }

  function renderPrivacy() {
    const k = policyContact();
    const N = k.name;
    const body = `
<h2>Summary</h2>
<ul>
<li>We collect the information you provide when you place an order, call, chat, or complete a form, along with information gathered automatically through cookies and similar tools.</li>
<li>Where we use a cookie banner, analytics and marketing tools wait for your choice on it, and we may offer a Cookie Preferences link in our footer so you can change that choice at any time.</li>
<li>You can opt out of the sale or sharing of your information by emailing us, through Global Privacy Control, or through a Your Privacy Choices link or cookie banner where we offer them.</li>
<li>For questions or requests, see “How to make a request” below or the contact details at the end of this policy.</li>
</ul>
<p><strong>Contents</strong></p>
<ol class="policy-toc">
<li>Introduction</li>
<li>Information we collect</li>
<li>How we use information</li>
<li>Cookies, pixels, and your choices</li>
<li>Who we share information with</li>
<li>Sale, sharing, and targeted advertising</li>
<li>Phone calls, chat, email, and forms</li>
<li>Your privacy rights</li>
<li>Retention, security, children, changes, and contact</li>
</ol>

<h2>1. Introduction</h2>
<p>${N} (“NAL,” “we,” “us”) operates ${k.site} (the “Site”). This Privacy Policy describes the personal information we collect when you visit the Site, buy from us, call us, chat with us, or submit a form; how we use and share that information; and the choices and rights available to you.</p>
<p>This policy covers the Site, our checkout, our phone lines, our live chat, and our marketing emails. It applies to visitors in the United States. If you have questions, reach us using the details in Section 9.</p>

<h2>2. Information we collect</h2>
<div class="policy-table-wrap"><table class="policy-table">
<thead><tr><th>Category</th><th>Examples</th><th>Source</th></tr></thead>
<tbody>
<tr><td>Identifiers and contact details</td><td>Name, email, phone number, billing and shipping address, company name</td><td>You, when you place an order, create an account, submit a form, chat, or call</td></tr>
<tr><td>Commercial information</td><td>Products viewed, added to the cart, and purchased; order history; quote requests</td><td>Your activity on the Site and at checkout</td></tr>
<tr><td>Payment information</td><td>Card details</td><td>You, at checkout. Payments are handled by our payment processors; we do not keep full card numbers.</td></tr>
<tr><td>Device and online identifiers</td><td>IP address, browser and device type, cookie IDs, advertising IDs</td><td>Automatically, through cookies, pixels, and similar tools (Section 4)</td></tr>
<tr><td>Internet activity</td><td>Pages viewed, clicks, searches on the Site, the site or ad that referred you</td><td>Automatically, through cookies, pixels, and similar tools</td></tr>
<tr><td>Approximate location</td><td>City, state, or region based on your IP address</td><td>Automatically</td></tr>
<tr><td>Audio and communications</td><td>Phone call recordings (where calls are recorded); chat messages; emails you send us</td><td>You, when you call, chat with, or email us (Section 7)</td></tr>
<tr><td>Business information</td><td>Your company name and related business details</td><td>You, and business data providers</td></tr>
<tr><td>Inferences</td><td>Interests or product preferences based on your activity</td><td>Created by us or our advertising partners</td></tr>
</tbody></table></div>
<p>We do not intentionally collect sensitive personal information such as Social Security numbers, health data, or precise geolocation.</p>

<h2>3. How we use information</h2>
<p>We use personal information to:</p>
<ul>
<li>Process and deliver orders, send confirmations and invoices, and handle returns and warranty claims.</li>
<li>Respond to questions and quote requests by phone, chat, email, and form.</li>
<li>Train our staff and review service quality using call recordings, where calls are recorded.</li>
<li>Send marketing emails, if we offer them, only to people who have subscribed (you may unsubscribe at any time).</li>
<li>Learn how the Site is used and make it better.</li>
<li>Measure and improve our advertising, and show you relevant ads on other sites, only where you have allowed this or have not opted out (Sections 4 and 6).</li>
<li>Detect and prevent fraud, spam, and security threats.</li>
<li>Comply with the law, respond to lawful requests, and protect our rights.</li>
</ul>

<h2>4. Cookies, pixels, and your choices</h2>
<p>We and our partners use, or may use, cookies, pixels, tags, and similar tools to operate the Site, understand how it is used, and measure and target advertising. We sort them into four categories:</p>
<ul>
<li><strong>Necessary:</strong> required for the Site, cart, checkout, security, and forms to work (which may include Google reCAPTCHA on our forms). These cannot be switched off.</li>
<li><strong>Preferences:</strong> remember your settings.</li>
<li><strong>Analytics:</strong> help us understand how visitors use the Site.</li>
<li><strong>Marketing:</strong> measure and personalize advertising, identify visiting businesses, and, where we use call tracking, track which ad or page led to a phone call.</li>
</ul>
<p><strong>Cookie banner.</strong> In states with consumer privacy laws, we may display a cookie banner on your first visit. Where we do, analytics and marketing tools do not run until you click Accept or allow them under Preferences, and if you click Reject, only necessary tools run. Where we offer a Cookie Preferences link in our footer, you can use it to change your choice at any time.</p>
<p><strong>Your Privacy Choices.</strong> We may offer a Your Privacy Choices link in our footer. Visitors anywhere in the United States can opt out of the sale or sharing of personal information and of targeted advertising through that link where it is offered, or by contacting us as described on our <a href="#/data-sharing">Data Sharing</a> page.</p>
<p><strong>Global Privacy Control (GPC).</strong> We honor the GPC signal. If your browser sends it, we treat it as a request to opt out of the sale or sharing of your personal information and of targeted advertising for that browser. Because there is no agreed standard for other “Do Not Track” signals, we rely on GPC and the choices you make with us (including in a cookie banner, where one is shown).</p>
<p>You can also block or delete cookies in your browser settings. Some parts of the Site may not work properly if you block necessary cookies.</p>

<h2>5. Who we share information with</h2>
<p>We share personal information with the following kinds of companies, and only as needed for the purposes in this policy:</p>
<ul>
<li>Service providers that operate our store, checkout, and payments, and that provide our forms, live chat, phone service, and email.</li>
<li>Consent management providers that may operate a cookie banner for us and record your choices.</li>
<li>Analytics providers that help us understand how the Site is used.</li>
<li>Advertising partners that measure our ads and show you relevant ads on other websites.</li>
<li>Business data providers that identify companies visiting the Site.</li>
<li>Others when necessary: shipping carriers, professional advisors, a buyer if our business is sold, and authorities when required by law.</li>
</ul>

<h2>6. Sale, sharing, and targeted advertising</h2>
<p>We do not sell personal information for money. However, when our advertising partners and business data providers collect information through our Site, some state laws may consider this a “sale,” “sharing,” or “targeted advertising.”</p>
<p>The information involved may include identifiers (cookie IDs, IP address, and a hashed email for signed-in customers), internet activity, commercial information, and inferences. We use it to measure and improve our ads and to show you relevant ads on other sites.</p>
<p>You can opt out at any time by:</p>
<ul>
<li>Clicking Reject on a cookie banner, or turning off marketing under Preferences, where a banner is shown.</li>
<li>Using a Your Privacy Choices link in our footer, where offered, or following the steps on our <a href="#/data-sharing">Data Sharing</a> page.</li>
<li>Turning on Global Privacy Control in your browser.</li>
</ul>
<p>You can also manage ad personalization directly with the major platforms and industry groups: <a href="https://adssettings.google.com" target="_blank" rel="noopener">Google</a>, <a href="https://www.facebook.com/adpreferences" target="_blank" rel="noopener">Meta</a>, <a href="https://account.microsoft.com/privacy/ad-settings" target="_blank" rel="noopener">Microsoft</a>, the <a href="https://optout.aboutads.info" target="_blank" rel="noopener">Digital Advertising Alliance</a>, and the <a href="https://optout.networkadvertising.org" target="_blank" rel="noopener">Network Advertising Initiative</a>. These tools apply to the browser or account in which you use them.</p>
<p>We do not knowingly sell or share the personal information of anyone under 16.</p>

<h2>7. Phone calls, chat, email, and forms</h2>
<p><strong>Phone calls.</strong> Calls to our phone numbers may be recorded for quality and training purposes. If you would rather not be recorded, you can email us instead. Our call provider processes your phone number and the time and length of the call, and may also process a recording and, if we use call tracking and you allowed marketing cookies, the page or ad that led to the call. If we use call-tracking numbers and you have not allowed marketing cookies, the Site displays our standard phone number rather than a tracking number.</p>
<p><strong>Live chat.</strong> When you use chat, your messages and any details you share are stored by our support provider so that our team can help you.</p>
<p><strong>Marketing email.</strong> We may send marketing emails, and if we do, we send them only to subscribers. Our emails may use tracking pixels and links to measure opens and clicks. Every marketing email will include an unsubscribe link.</p>
<p><strong>Forms.</strong> Our contact and quote forms, and any distributor form we may offer, may be run by a form provider and protected by Google reCAPTCHA. Where used, reCAPTCHA collects device and usage information to tell people apart from bots, under Google’s <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Privacy Policy</a> and <a href="https://policies.google.com/terms" target="_blank" rel="noopener">Terms of Service</a>.</p>

<h2 id="privacy-rights">8. Your privacy rights</h2>
<p>Depending on your state, including California, Colorado, Connecticut, Virginia, Texas, Oregon, and other states with consumer privacy laws, you may have the right to:</p>
<ul>
<li>Know and access the personal information we hold about you, including a portable copy.</li>
<li>Correct inaccurate personal information.</li>
<li>Delete personal information we collected from you, subject to legal exceptions (for example, records we must keep for taxes or warranties).</li>
<li>Opt out of the sale or sharing of your personal information, targeted advertising, and profiling (Section 6).</li>
<li>Not be discriminated against for exercising these rights. We will not deny you service or charge you different prices because you used them.</li>
</ul>
<p><strong>How to make a request.</strong> Email <a href="mailto:${k.email}">${k.email}</a> or call <a href="tel:${k.tel}">${k.phone}</a>. For opt-outs, you can also turn on GPC or use a Your Privacy Choices link where we offer one. We will confirm your request and respond within 45 days, or let you know if we need more time as the law permits. To protect your information, we may ask you to confirm details such as your email address and a recent order before we act on an access, correction, or deletion request.</p>
<p><strong>Authorized agents.</strong> You may have an authorized agent make a request on your behalf. We may ask the agent for proof of your written permission and ask you to verify your identity with us.</p>
<p><strong>Appeals.</strong> If we deny your request, you may appeal by emailing us with “Privacy Appeal” in the subject line. We will respond within the time required by your state’s law. If you are not satisfied with the outcome, you may contact your state attorney general.</p>

<h3>Additional information for California residents</h3>
<p>This section applies to California residents and adds to the rest of this policy, as required by the California Consumer Privacy Act (CCPA) and the California Online Privacy Protection Act (CalOPPA).</p>
<p><strong>What we collected and disclosed in the past 12 months.</strong> Section 2 lists the categories of personal information we collect and their sources, and Section 3 lists the purposes for which we use them. The table below shows to whom we disclosed each category for business purposes, and whether it may have been “sold” or “shared” (for targeted advertising) as California defines those terms.</p>
<div class="policy-table-wrap"><table class="policy-table">
<thead><tr><th>Category (CCPA)</th><th>Disclosed for business purposes to</th><th>Sold or shared?</th></tr></thead>
<tbody>
<tr><td>Identifiers (name, email, phone, IP address, cookie and advertising IDs)</td><td>Service providers, consent management, analytics providers</td><td>Yes, with advertising partners and business data providers</td></tr>
<tr><td>Customer records (name, address, phone, payment details)</td><td>Service providers</td><td>No</td></tr>
<tr><td>Commercial information (products viewed and purchased)</td><td>Service providers, analytics providers</td><td>Yes, with advertising partners</td></tr>
<tr><td>Internet activity (pages viewed, clicks, searches)</td><td>Service providers, analytics providers</td><td>Yes, with advertising partners and business data providers</td></tr>
<tr><td>Approximate location (from IP address)</td><td>Service providers, analytics providers</td><td>Yes, with advertising partners and business data providers</td></tr>
<tr><td>Audio and electronic information (call recordings where calls are recorded, chat messages)</td><td>Service providers</td><td>No</td></tr>
<tr><td>Professional information (company name, business details)</td><td>Service providers</td><td>No</td></tr>
<tr><td>Inferences (interests and product preferences)</td><td>Analytics providers</td><td>Yes, with advertising partners</td></tr>
</tbody></table></div>
<p><strong>Sensitive personal information.</strong> We do not collect or use sensitive personal information to infer characteristics about you. Payment card details are handled only by our payment processors to complete your order.</p>
<p><strong>Your California rights.</strong> Beyond the rights listed above, you have the right to know the categories of personal information we collected, where it came from, why we use it, the categories of third parties we disclose it to, and the specific pieces of personal information we hold about you. You can also opt out of the sale or sharing of your personal information by contacting us, through Global Privacy Control, or through a Your Privacy Choices link or cookie banner where we offer them. We honor GPC as a valid opt-out request.</p>
<p><strong>How to make a request.</strong> Use any of the methods under “How to make a request” above. Authorized agents may submit requests as described above.</p>
<p><strong>Minors.</strong> We do not sell or share the personal information of consumers we know to be under 16.</p>
<p><strong>Retention.</strong> We keep each category as described in Section 9.</p>
<p><strong>Do Not Track.</strong> As explained in Section 4, we honor Global Privacy Control. We do not respond differently to other Do Not Track signals because there is no agreed standard for them.</p>
<p><strong>Shine the Light.</strong> California residents may ask whether we disclosed personal information to third parties for those third parties’ own direct marketing purposes during the previous calendar year. Email us with “California Shine the Light” in the subject line.</p>

<h2>9. Retention, security, children, changes, and contact</h2>
<p><strong>How long we keep information.</strong> We keep personal information only for as long as we need it for the purposes in this policy. For example, we keep order and warranty records for as long as needed to meet tax, accounting, and warranty obligations; any call recordings and chat and email conversations for as long as they are useful for customer service and training; analytics data according to our analytics provider’s retention settings; and any marketing email information until you unsubscribe or ask us to delete it.</p>
<p><strong>Security.</strong> We use reasonable safeguards to protect personal information. No method of transmission or storage is completely secure.</p>
<p><strong>Children.</strong> The Site is not intended for children under 13, and we do not knowingly collect their personal information. If you believe a child has given us personal information, contact us and we will delete it.</p>
<p><strong>Changes.</strong> We may update this policy. When we do, we will post the new version here and change the effective date at the top. For significant changes, we may also let you know by email or on the Site.</p>
<p>Contact us with questions, requests, or complaints:</p>
<ul>
<li>Email: <a href="mailto:${k.email}">${k.email}</a></li>
<li>Phone: <a href="tel:${k.tel}">${k.phone}</a></li>
<li>Mail: ${N}, ${k.city}</li>
</ul>`;
    return policyShell("Privacy Policy", "Policies", "Privacy Policy", "Effective date", body);
  }

  function renderDataSharing() {
    const k = policyContact();
    const body = `
<p>As explained in our <a href="#/privacy">Privacy Policy</a>, we collect personal information from your interactions with us and with our website, including through cookies and similar technologies. We may also share this personal information with third parties, including advertising partners. We do this so that the ads you see on other websites are more relevant to your interests, and for the other reasons described in our Privacy Policy.</p>
<p>Under certain U.S. state privacy laws, sharing personal information for targeted advertising based on your activity across different websites may be considered a “sale,” “sharing,” or “targeted advertising.” Depending on where you live, you may have the right to opt out of these activities. If you want to use this opt-out right, please follow the instructions below.</p>
<p>If you visit our website with the Global Privacy Control opt-out preference signal turned on, then, depending on your location, we will treat it as a request to opt out of activity that may be considered a “sale” or “sharing” of personal information, or of other uses that may be considered targeted advertising, for the device and browser you used to visit our website.</p>
<h2>How to opt out</h2>
<p>To ask us to stop selling or sharing your personal information, or using it for targeted advertising, email <a href="mailto:${k.email}?subject=Privacy%20Opt-Out%20Request">${k.email}</a> with the subject line “Privacy Opt-Out Request.” If applicable, please include the email address linked to your account or orders so that we can find your information and process your request.</p>`;
    return policyShell("Data Sharing", "Policies", "Data Sharing", "Last updated", body);
  }

  /* ---------- checkout agreements (Terms acknowledgement) ---------- */

  const TERMS_VERSION = "v2026-11-22";

  function termsAcceptanceLine(order) {
    const t = order && order.termsAcceptance;
    if (!t || !t.at) return "";
    let ct = "";
    try {
      ct = new Date(t.at).toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" }) + " CT";
    } catch (e) { ct = ""; }
    return "Agreed to Terms " + (t.version || TERMS_VERSION) + " — " + t.at + (ct ? " (" + ct + ")" : "");
  }

  function agreementsPlainText() {
    const box = document.createElement("div");
    box.innerHTML = renderTerms() + renderWarrantyReturns() + renderPrivacy() + renderDataSharing();
    const out = [];
    box.querySelectorAll("h1, h2, h3, p, li, tr").forEach((el) => {
      if (el.closest("li") && el.tagName !== "LI") return;
      let t = el.tagName === "TR"
        ? Array.from(el.children).map((c) => c.textContent.trim()).join(" | ")
        : el.textContent.replace(/\s+/g, " ").trim();
      if (!t) return;
      if (el.tagName === "H1") out.push((out.length ? "\n\n" : "") + t.toUpperCase() + "\n" + "=".repeat(Math.min(t.length, 40)));
      else if (el.tagName === "H2") out.push("\n" + t.toUpperCase());
      else if (el.tagName === "H3") out.push("\n" + t);
      else if (el.tagName === "LI") out.push("  • " + t);
      else out.push(t);
    });
    return out.join("\n");
  }

  function agreementsDialog() {
    let dlg = document.getElementById("agreements-dialog");
    if (dlg) return dlg;
    dlg = document.createElement("dialog");
    dlg.id = "agreements-dialog";
    dlg.className = "agreements-dialog";
    dlg.setAttribute("aria-labelledby", "agreements-title");
    dlg.setAttribute("aria-describedby", "agreements-hint");
    dlg.innerHTML =
      '<div class="agreements-head"><h2 id="agreements-title">Terms &amp; Conditions</h2>' +
      '<button type="button" class="agreements-close" data-agreements-close aria-label="Close without agreeing">×</button></div>' +
      '<p class="agreements-hint" id="agreements-hint">Please scroll to the end to continue. Terms &amp; Conditions · Warranty and Return Policy · Privacy Policy · Data Sharing</p>' +
      '<div class="agreements-body" tabindex="0" data-agreements-body role="document" aria-label="Agreement text"></div>' +
      '<div class="agreements-foot">' +
      '<button type="button" class="btn btn-gold btn-block" data-agreements-confirm disabled>I have read and acknowledge the above agreements</button>' +
      "</div>";
    document.body.appendChild(dlg);
    const body = dlg.querySelector("[data-agreements-body]");
    const btn = dlg.querySelector("[data-agreements-confirm]");
    const check = () => {
      if (body.scrollTop + body.clientHeight >= body.scrollHeight - 4) btn.disabled = false;
    };
    body.addEventListener("scroll", check, { passive: true });
    dlg._check = check;
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      state.termsAccepted = { at: new Date().toISOString(), version: TERMS_VERSION };
      dlg._confirmed = true;
      dlg.close();
    });
    dlg.querySelector("[data-agreements-close]").addEventListener("click", () => dlg.close());
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener("close", () => {
      const box = document.querySelector("[data-agree-terms]");
      if (!dlg._confirmed) state.termsAccepted = null;
      if (box) {
        box.checked = !!state.termsAccepted;
        box.focus();
      }
      const err = document.querySelector("[data-terms-error]");
      if (err && state.termsAccepted) err.hidden = true;
      document.body.classList.remove("agreements-open");
    });
    return dlg;
  }

  function openAgreements() {
    const dlg = agreementsDialog();
    const body = dlg.querySelector("[data-agreements-body]");
    const btn = dlg.querySelector("[data-agreements-confirm]");
    body.textContent = agreementsPlainText();
    body.scrollTop = 0;
    btn.disabled = true;
    dlg._confirmed = false;
    document.body.classList.add("agreements-open");
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.setAttribute("open", "");
    body.focus();
    requestAnimationFrame(dlg._check);
  }

  function termsGate(form) {
    const box = form.querySelector("[data-agree-terms]");
    const err = form.querySelector("[data-terms-error]");
    const ok = !!(state.termsAccepted && box && box.checked);
    if (err) err.hidden = ok;
    if (!ok) {
      if (box) box.checked = false;
      if (err) err.scrollIntoView({ block: "center" });
      if (box) box.focus();
    }
    return ok;
  }

  /* ---------- router & events ---------- */

  function render() {
    if (!state.catalog) return;
    stopPromoCarousel();
    const { parts, qs } = parseRoute();
    const root = parts[0] || "";
    let html;
    if (!root) html = renderHome();
    else if (root === "catalog") html = renderCatalog(parts[1] || "", qs.get("q") || "");
    else if (root === "product") html = renderProduct(decodeURIComponent(parts[1] || ""));
    else if (root === "cart") html = renderCart();
    else if (root === "checkout") html = renderCheckout();
    else if (root === "order") html = renderConfirmation(decodeURIComponent(parts[1] || ""));
    else if (root === "admin") html = renderAdminDemo();
    else if (root === "signin") html = renderSignIn();
    else if (root === "account") html = renderAccount();
    else if (root === "exemption") html = renderExemption();
    else if (root === "approve") html = renderApprove(parts[1] || "");
    else if (root === "about") html = renderAbout();
    else if (root === "installation" || root === "installation-instructions") html = renderInstallation();
    else if (root === "support" || root === "feedback" || root === "warranty") html = renderSupport();
    else if (root === "contact") html = renderContact();
    else if (root === "terms" || root === "terms-and-conditions") html = renderTerms();
    else if (root === "warranty-returns" || root === "return-policy") html = renderWarrantyReturns();
    else if (root === "privacy" || root === "privacy-policy") html = renderPrivacy();
    else if (root === "data-sharing") html = renderDataSharing();
    else html = '<section class="wrap"><h1>Page not found</h1><p><a href="#/">Home</a></p></section>';
    $app().innerHTML = html;
    setPageTitle(root);
    updateCartCounts();
    updateAuthLinks();
    updateSupportFooter();
    closeMenu();
    window.scrollTo(0, 0);
    initPromoCarousel();
    if ((root === "installation" || root === "installation-instructions") && parts[1]) {
      const el = document.getElementById("install-" + parts[1]);
      if (el) requestAnimationFrame(function () { el.scrollIntoView({ block: "start" }); });
    }
  }

  function closeMenu() {
    const menu = document.getElementById("mobile-menu");
    const btn = document.getElementById("menu-toggle");
    if (menu) {
      menu.hidden = true;
      menu.classList.remove("is-open");
    }
    if (btn) btn.setAttribute("aria-expanded", "false");
  }

  function openMenu() {
    const menu = document.getElementById("mobile-menu");
    const btn = document.getElementById("menu-toggle");
    if (menu) {
      menu.hidden = false;
      menu.classList.add("is-open");
    }
    if (btn) btn.setAttribute("aria-expanded", "true");
  }

  function isMenuOpen() {
    const menu = document.getElementById("mobile-menu");
    return !!(menu && !menu.hidden);
  }

  function isHoverDevice() {
    return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  }

  const menuWrap = document.getElementById("menu-wrap");
  if (menuWrap) {
    menuWrap.addEventListener("mouseleave", () => {
      if (isHoverDevice()) closeMenu();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });

  document.addEventListener("click", (e) => {
    const toggle = e.target.closest("#menu-toggle");
    if (toggle) {
      if (isMenuOpen()) closeMenu();
      else openMenu();
      return;
    }

    if (e.target.closest("#mobile-menu a")) {
      closeMenu();
    } else if (isMenuOpen() && !e.target.closest("#menu-wrap")) {
      closeMenu();
    }

    const supportTab = e.target.closest("[data-support-tab]");
    if (supportTab) {
      const next = supportTab.getAttribute("data-support-tab") === "warranty" ? "warranty" : "feedback";
      location.hash = "#/support/" + next;
      return;
    }

    const optBtn = e.target.closest("[data-option]");
    if (optBtn && $app().contains(optBtn)) {
      const page = document.querySelector("[data-product-page]");
      if (!page) return;
      const slug = page.getAttribute("data-slug");
      const p = findProduct(slug);
      if (!p) return;
      const selected = getSelectedOptions(p);
      selected[optBtn.getAttribute("data-option")] = optBtn.getAttribute("data-value");
      optionMemory[slug] = selected;
      $app().innerHTML = renderProduct(slug);
      return;
    }

    const remove = e.target.closest("[data-remove]");
    if (remove) {
      const row = remove.closest("[data-line]");
      const idx = Number(row.getAttribute("data-line"));
      state.cart.splice(idx, 1);
      saveCart();
      if (state.shipping.method === "ship") {
        state.shipping.estimate = null;
        saveShipping();
      }
      render();
      return;
    }

    const checkoutLink = e.target.closest("[data-checkout-link]");
    if (checkoutLink) {
      if (cartHasOutOfStock()) {
        e.preventDefault();
        return;
      }
      if (!shippingReady()) {
        e.preventDefault();
        const gate = document.querySelector("[data-ship-gate]");
        if (gate) {
          gate.hidden = false;
          document.querySelector("[data-shipping]")?.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
      return;
    }

    const calc = e.target.closest("[data-calc-ship]");
    if (calc) {
      e.preventDefault();
      runShippingCalc();
      return;
    }

    const agreeLink = e.target.closest("[data-open-agreements]");
    if (agreeLink) {
      e.preventDefault();
      const box = document.querySelector("[data-agree-terms]");
      if (box && !box.checked) box.checked = true;
      openAgreements();
      return;
    }

    const payBtn = e.target.closest("[data-pay-square]");
    if (payBtn) {
      e.preventDefault();
      const form = document.querySelector("[data-checkout-form]");
      if (form) startSquarePayment(form);
      return;
    }

    const out = e.target.closest("[data-sign-out]");
    if (out) {
      e.preventDefault();
      signOut().finally(() => {
        updateAuthLinks();
        location.hash = "#/signin";
        render();
      });
      return;
    }

    const approveBtn = e.target.closest("[data-approve-app]");
    if (approveBtn) {
      e.preventDefault();
      const id = approveBtn.getAttribute("data-approve-app");
      location.hash = "#/approve/" + encodeURIComponent(id);
    }
  });

  document.addEventListener("change", (e) => {
    if (e.target.matches("[data-agree-terms]")) {
      if (e.target.checked) openAgreements();
      else state.termsAccepted = null;
      return;
    }
    if (e.target.matches("[data-ew-toggle]")) {
      const page = document.querySelector("[data-product-page]");
      if (page) ewMemory[page.getAttribute("data-slug")] = e.target.checked;
      return;
    }
    if (e.target.matches("[data-support-file]")) {
      const t = supportCopy();
      const form = e.target.closest("form");
      const nameEl = form && form.querySelector("[data-file-name]");
      const files = e.target.files ? Array.from(e.target.files) : [];
      if (nameEl && files.length === 0) nameEl.textContent = "";
      if (files.length > 1) {
        e.target.value = "";
        if (nameEl) nameEl.textContent = t.errFileCount;
        return;
      }
      if (files.length === 1) {
        const allowed = isAllowedSupportFile(files[0]);
        if (!allowed.ok) {
          e.target.value = "";
          if (nameEl) nameEl.textContent = supportErrorText(t, allowed.code);
          return;
        }
        if (nameEl) nameEl.textContent = files[0].name;
      }
      return;
    }
    if (e.target.matches("[data-qty]")) {
      const row = e.target.closest("[data-line]");
      const idx = Number(row.getAttribute("data-line"));
      const qty = Math.max(1, parseInt(e.target.value, 10) || 1);
      state.cart[idx].qty = qty;
      saveCart();
      if (state.shipping.method === "ship" && state.shipping.zip) {
        runShippingCalc().then(() => render());
      } else {
        render();
      }
      return;
    }
    if (e.target.matches("[data-create-account]")) {
      const wrap = document.querySelector("[data-reg-pass]");
      if (wrap) {
        wrap.hidden = !e.target.checked;
        const input = wrap.querySelector("input");
        if (input) input.required = e.target.checked;
      }
      return;
    }
    if (e.target.matches("input[name='certificate']")) {
      const el = document.querySelector("[data-file-name]");
      const file = e.target.files && e.target.files[0];
      if (el) el.textContent = file ? "Selected: " + file.name : "";
      return;
    }
    if (e.target.matches("input[name='ship-method']")) {
      const method = e.target.value;
      state.shipping.method = method;
      if (method === "pickup") {
        state.shipping.estimate = pickupRate();
      } else {
        state.shipping.estimate = null;
      }
      saveShipping();
      render();
      return;
    }
  });

  document.addEventListener("submit", (e) => {
    const headerSearch = e.target.closest("[data-header-search]");
    if (headerSearch) {
      e.preventDefault();
      const q = (headerSearch.q.value || "").trim();
      location.hash = q ? "#/catalog?q=" + encodeURIComponent(q) : "#/catalog";
      return;
    }

    const search = e.target.closest("[data-search-form]");
    if (search) {
      e.preventDefault();
      const q = (search.q.value || "").trim();
      const { parts } = parseRoute();
      const onCatalog = parts[0] === "catalog";
      const base = onCatalog && parts[1] ? "#/catalog/" + parts[1] : "#/catalog";
      location.hash = q ? base + "?q=" + encodeURIComponent(q) : base;
      return;
    }

    const add = e.target.closest("[data-add-form]");
    if (add) {
      e.preventDefault();
      const page = document.querySelector("[data-product-page]");
      const p = findProduct(page.getAttribute("data-slug"));
      const selected = getSelectedOptions(p);
      const match = p.variations.find((v) => variationMatches(v, selected));
      if (!match || isVariationOos(match)) return;
      const qty = Math.max(1, parseInt(add.qty.value, 10) || 1);
      const ewBox = add.querySelector("[data-ew-toggle]");
      addToCart(p, match, qty, !!(ewBox && ewBox.checked));
      const btn = add.querySelector("button[type=submit]");
      const prev = btn.textContent;
      btn.textContent = "Added to cart";
      setTimeout(() => {
        if (btn.isConnected) btn.textContent = prev;
      }, 1200);
      return;
    }

    const checkout = e.target.closest("[data-checkout-form]");
    if (checkout) {
      e.preventDefault();
      submitEmailOrder(checkout);
      return;
    }

    const signin = e.target.closest("[data-signin-form]");
    if (signin) {
      e.preventDefault();
      handleSignIn(signin);
      return;
    }

    const apply = e.target.closest("[data-exemption-form]");
    if (apply) {
      e.preventDefault();
      handleExemption(apply);
      return;
    }

    const supportForm = e.target.closest("[data-support-form]");
    if (supportForm) {
      e.preventDefault();
      submitSupportForm(supportForm);
    }
  });

  async function handleSignIn(form) {
    if (!form.reportValidity()) return;
    try {
      await signIn(form.email.value.trim(), form.password.value);
      updateAuthLinks();
      location.hash = "#/account";
    } catch (err) {
      $app().innerHTML = renderSignIn(err.message || "Could not sign in.");
    }
  }

  async function handleExemption(form) {
    if (!form.reportValidity()) return;
    const permitState = (form.permitState.value || "").trim().toUpperCase();
    const rawPermit = (form.permitNumber.value || "").trim();
    const permitNumber = permitState === "TX" ? rawPermit.replace(/\D/g, "") : rawPermit.replace(/\s+/g, "");
    if (permitState === "TX" && !validTexasPermit(permitNumber)) {
      $app().innerHTML = renderExemption("A Texas Sales and Use Tax Permit number must be 11 digits.");
      return;
    }
    if (!form.attest.checked) {
      $app().innerHTML = renderExemption("You must attest that the information is true.");
      return;
    }
    try {
      if (!isSignedIn()) {
        await registerAccount({
          email: form.email.value.trim(),
          password: form.password.value,
          company: form.legalName.value.trim(),
          name: form.contactName.value.trim(),
          phone: form.phone.value.trim(),
          address: form.address.value.trim(),
        });
      }
      const acc = currentAccount();
      const file = form.certificate && form.certificate.files && form.certificate.files[0];
      const application = {
        id: newId("APP"),
        accountId: acc && acc.id,
        email: acc ? acc.email : form.email.value.trim().toLowerCase(),
        legalName: form.legalName.value.trim(),
        dba: form.dba.value.trim(),
        contactName: form.contactName.value.trim(),
        phone: form.phone.value.trim(),
        address: form.address.value.trim(),
        permitState,
        permitNumber,
        certificateFileName: file ? file.name : "",
        submittedAt: new Date().toISOString(),
        status: "pending",
      };
      if (apiEnabled()) {
        await apiFetch("/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.assign({}, application, { lang: siteLang() })),
        });
      }
      const apps = loadApplications();
      apps.push(application);
      saveApplications(apps);
      if (acc) {
        acc.exemption = {
          status: "pending",
          permitNumber,
          permitState,
          legalName: application.legalName,
          applicationId: application.id,
        };
        upsertAccount(acc);
      }
      const approveUrl = location.origin + location.pathname + "#/approve/" + encodeURIComponent(application.id);
      const mail = {
        kind: "apply",
        title: "Admin notification (demo — not sent)",
        to: "naltx75247@gmail.com",
        subject: "Tax exemption application — " + application.legalName,
        body:
          "A resale tax exemption application was submitted.\n\n" +
          "Application ID: " + application.id + "\n" +
          "Business legal name: " + application.legalName + "\n" +
          "DBA: " + (application.dba || "(none)") + "\n" +
          "Contact: " + application.contactName + "\n" +
          "Email: " + application.email + "\n" +
          "Phone: " + application.phone + "\n" +
          "Address: " + application.address + "\n" +
          "Permit / resale ID: " + application.permitNumber + " (" + application.permitState + ")\n" +
          "Certificate file name: " + (application.certificateFileName || "(not uploaded)") + "\n" +
          "Attestation: signed\n\n" +
          "Approve this application:\n" +
          approveUrl + "\n",
      };
      setLastMail(mail);
      updateAuthLinks();
      $app().innerHTML =
        '<section class="wrap"><h1>Application submitted</h1>' +
        '<p class="demo-callout">Demo only — this email was not sent. In production, NAL would receive this message with an Approve link.</p>' +
        "<p>Your account is registered and signed in. Exemption will apply at checkout after approval, while you are signed in.</p>" +
        emailPreviewHtml(mail) +
        '<p><a class="btn btn-navy" href="#/admin">Open Admin (demo)</a> <a class="btn btn-outline" href="#/account">My account</a></p></section>';
    } catch (err) {
      $app().innerHTML = renderExemption(err.message || "Could not submit the application.");
    }
  }

  function collectOrder(form, payment) {
    return {
      orderNumber: newOrderNumber(),
      createdAt: new Date().toISOString(),
      customer: {
        company: form.company.value.trim(),
        name: form.name.value.trim(),
        email: form.email.value.trim(),
        phone: form.phone.value.trim(),
        shipTo: (form.shipTo && form.shipTo.value.trim()) || (state.shipping.method === "pickup" ? PICKUP_NOTE : ""),
        notes: form.notes.value.trim(),
      },
      items: state.cart.map((l) => Object.assign({}, l)),
      shipping: orderShippingSnapshot(),
      tax: currentTax(),
      accountEmail: isSignedIn() ? currentAccount().email : "",
      payment: payment || "email",
      termsAcceptance: state.termsAccepted ? Object.assign({}, state.termsAccepted) : null,
    };
  }

  function clearCartAndShipping() {
    state.termsAccepted = null;
    state.cart = [];
    saveCart();
    state.shipping = defaultShipping();
    saveShipping();
  }

  function showRegError(msg) {
    const el = document.querySelector("[data-reg-error]");
    if (el) {
      el.hidden = !msg;
      el.textContent = msg || "";
    }
  }

  async function maybeCreateAccountFromCheckout(form) {
    showRegError("");
    if (!form.createAccount || !form.createAccount.checked) return;
    if (isSignedIn()) return;
    const pw = (form.newPassword && form.newPassword.value) || "";
    try {
      await registerAccount({
        email: form.email.value.trim(),
        password: pw,
        company: form.company.value.trim(),
        name: form.name.value.trim(),
        phone: form.phone.value.trim(),
        address: (form.shipTo && form.shipTo.value.trim()) || "",
      });
      updateAuthLinks();
    } catch (err) {
      showRegError(err.message || "Could not create an account.");
      throw err;
    }
  }

  // Order notes sent to the nal-api Worker: the Terms acceptance line first.
  // (The Worker adds the Extended Warranty as its own priced line item.)
  function customerWithWarrantyNote(order) {
    const c = Object.assign({}, order.customer);
    const terms = termsAcceptanceLine(order);
    if (!terms) return c;
    c.notes = terms + (c.notes ? "\n\nCustomer notes: " + c.notes : "");
    return c;
  }

  // Records email order requests on the server (Google Sheet, Quo/Square contacts, admin email).
  // Fire-and-forget: the mailto still opens even if this fails.
  function notifyOrderRequest(order) {
    if (!apiEnabled()) return;
    try {
      fetch(String(API_BASE_URL).replace(/\/$/, "") + "/order-request", {
        method: "POST",
        credentials: "include",
        keepalive: true,
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          orderNumber: order.orderNumber,
          customer: customerWithWarrantyNote(order),
          items: order.items,
          extendedWarranty: warrantySummaryLines(order.items),
          shipping: order.shipping,
          accountEmail: order.accountEmail,
          lang: siteLang(),
        }),
      }).catch(() => {});
    } catch (err) {
      /* ignore */
    }
  }

  async function submitEmailOrder(form) {
    if (!termsGate(form)) return;
    if (!form.reportValidity()) return;
    if (!state.cart.length) return;
    if (!shippingReady() || cartHasOutOfStock()) {
      location.hash = "#/cart";
      return;
    }
    try {
      await maybeCreateAccountFromCheckout(form);
    } catch {
      return;
    }
    const order = collectOrder(form, "email");
    const orders = loadOrders();
    orders.push(order);
    saveOrders(orders);
    notifyOrderRequest(order);
    const body = formatOrderText(order);
    const subject = "Order request " + order.orderNumber + " — North America Lighting";
    const mailto =
      "mailto:" +
      ORDER_EMAIL +
      "?subject=" +
      encodeURIComponent(subject) +
      "&body=" +
      encodeURIComponent(body);
    clearCartAndShipping();
    location.hash = "#/order/" + encodeURIComponent(order.orderNumber);
    setTimeout(() => {
      window.location.href = mailto;
    }, 250);
  }

  async function startSquarePayment(form) {
    const errEl = document.querySelector("[data-pay-error]");
    const showErr = (msg) => {
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = msg;
      }
    };
    if (!PAYMENT_PROXY_URL) {
      showErr("Card payment is not configured on this demo.");
      return;
    }
    if (!termsGate(form)) return;
    if (!form.reportValidity()) return;
    if (!state.cart.length || !shippingReady() || cartHasOutOfStock()) {
      location.hash = "#/cart";
      return;
    }
    if (state.cart.some((l) => l.price == null)) {
      showErr("This cart has items that need a quote. Submit an order request by email instead.");
      return;
    }
    try {
      await maybeCreateAccountFromCheckout(form);
    } catch (err) {
      showErr(err.message || "Could not create an account.");
      return;
    }
    const order = collectOrder(form, "square-pending");
    const btn = form.querySelector("[data-pay-square]");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Connecting to Square…";
    }
    try {
      const res = await fetch(PAYMENT_PROXY_URL, {
        method: "POST",
        credentials: "include",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          orderNumber: order.orderNumber,
          customer: customerWithWarrantyNote(order),
          items: order.items,
          shipping: order.shipping,
          tax: order.tax,
          accountEmail: order.accountEmail,
          lang: siteLang(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Could not start Square checkout (" + res.status + ").");
      }
      const orders = loadOrders();
      orders.push(order);
      saveOrders(orders);
      clearCartAndShipping();
      window.location.href = data.url;
    } catch (err) {
      showErr(err.message || "Could not start Square checkout.");
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Pay with card (Square)";
      }
    }
  }

  async function runShippingCalc() {
    const input = document.querySelector("input[name='ship-zip']");
    const zip = normalizeZip(input ? input.value : state.shipping.zip);
    if (input) state.shipping.zip = input.value.trim();
    state.shipping.method = "ship";
    const resultEl = document.querySelector("[data-ship-result]");
    if (!zip) {
      state.shipping.estimate = { ok: false, error: "Enter a valid 5-digit US ZIP code." };
      saveShipping();
      if (resultEl) {
        resultEl.innerHTML = '<div class="ship-result error">' + escapeHtml(state.shipping.estimate.error) + "</div>";
      }
      return state.shipping.estimate;
    }
    if (resultEl) resultEl.innerHTML = '<div class="ship-result">Calculating…</div>';
    try {
      const estimate = await getShippingRate({
        destZip: zip,
        weightLb: cartWeightLb(),
        items: state.cart,
      });
      state.shipping.zip = zip;
      state.shipping.estimate = estimate;
      saveShipping();
      render();
      return estimate;
    } catch (err) {
      state.shipping.estimate = {
        ok: false,
        error: err.message || "Could not calculate shipping.",
      };
      saveShipping();
      render();
      return state.shipping.estimate;
    }
  }

  function fillWatermark() {
    const inner = document.querySelector(".demo-watermark-inner");
    if (!inner || inner.childElementCount) return;
    for (let i = 0; i < 48; i++) {
      const s = document.createElement("span");
      s.textContent = "Demo Site, Coming Soon";
      inner.appendChild(s);
    }
  }

  window.addEventListener("hashchange", render);

  updateCartCounts();
  updateAuthLinks();
  updateSupportFooter();
  fillWatermark();
  loadZip3().catch(() => {});
  hydrateApiSession().then(() => updateAuthLinks()).catch(() => {});

  loadCatalog().catch((err) => {
    $app().innerHTML =
      '<section class="wrap page-error"><h1>Catalog could not load</h1><p>' +
      escapeHtml(err.message) +
      "</p><p>If you opened the file directly, serve the folder over HTTP instead (for example, <code>python3 -m http.server</code>).</p></section>";
  });
})();
