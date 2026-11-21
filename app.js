(function () {
  const CART_KEY = "nal-demo-cart";
  const ORDER_KEY = "nal-demo-orders";
  const SHIPPING_KEY = "nal-demo-shipping";
  const ORDER_EMAIL = "naltx75247@gmail.com";
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

  const WARRANTY_BADGE_TEXT = "1 Year Replacement Warranty";

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

  function isClearance(p) {
    if (!p) return false;
    const bits = [p.name, p.displayName, p.category].concat(p.badges || []);
    return bits.some((s) => String(s || "").toLowerCase().includes("clearance"));
  }
  function warrantyBadgeHtml(p) {
    if (!p || isClearance(p)) return "";
    return '<span class="warranty-badge">' + escapeHtml(WARRANTY_BADGE_TEXT) + "</span>";
  }
  function guaranteeBannerHtml() {
    return (
      '<div class="guarantee-banner" role="region" aria-label="Replacement guarantee">' +
      '<svg class="shield" viewBox="0 0 24 24" aria-hidden="true" fill="none">' +
      '<path d="M12 2.5 4.5 5.5v6.2c0 5 3.3 8.6 7.5 9.8 4.2-1.2 7.5-4.8 7.5-9.8V5.5L12 2.5z" stroke="currentColor" stroke-width="1.7" fill="rgba(201,162,74,0.18)"/>' +
      '<path d="M8.2 12.1 11 15l4.8-6" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>' +
      "</svg>" +
      "<div><strong>Premium Quality · 1-Year In-Store Replacement Guarantee</strong>" +
      "<p>Defective within 1 year? We replace it — bring it to our Dallas location or contact us.</p></div></div>"
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
        body: JSON.stringify({ email: key, password, company, name, phone, address }),
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

  function thumbHtml(product, className) {
    const src = (product.thumbs && product.thumbs[0]) || (product.images && product.images[0]);
    if (src) {
      return (
        '<img src="' +
        escapeHtml(src) +
        '" alt="' +
        escapeHtml(product.displayName) +
        '">'
      );
    }
    return placeholderSvg();
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
      if (hit.v.sku) line.sku = hit.v.sku;
      line.outOfStock = isVariationOos(hit.v);
    });
    saveCart();
  }

  function loadCatalog() {
    return fetch("products.json")
      .then((r) => {
        if (!r.ok) throw new Error("Could not load products.json (" + r.status + ")");
        return r.json();
      })
      .then((local) => {
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
        document.title = local.company.name + " — Commercial LED Wholesale";
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
      (productHasStock(p) ? "" : outOfStockLabel()) +
      "</div></a>"
    );
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
      (x) => x.categorySlug === slug && x.thumbs && x.thumbs[0]
    );
    return p ? p.thumbs[0] : "";
  }

  /* ---------- pages ---------- */

  function renderHome() {
    const c = company();
    const cats = state.catalog.categories;
    const featured = pickFeatured();
    const heroPref = [
      "high-bay-ufo-light",
      "wall-pack",
      "down-light",
      "flood-light",
      "panel-backlit",
      "canopy-15-inch",
      "corn-bulb",
      "flex-strip",
    ];
    const heroImgs = [];
    for (const slug of heroPref) {
      const p = state.catalog.products.find((x) => x.slug === slug && x.thumbs && x.thumbs[0]);
      if (p) heroImgs.push(p);
      if (heroImgs.length >= 4) break;
    }

    return (
      '<section class="hero"><div class="hero-inner">' +
      guaranteeBannerHtml() +
      "<div>" +
      '<div class="hero-kicker">Dallas, Texas · Wholesale · Commercial only</div>' +
      "<h1>Commercial LED lighting, built for trade.</h1>" +
      '<p class="hero-lead">' +
      escapeHtml(c.name) +
      " supplies contractors, sign shops, and facilities across the central United States. We ship nationwide.</p>" +
      '<div class="hero-actions">' +
      '<a class="btn btn-gold" href="#/catalog">Browse the catalog</a>' +
      '<a class="btn btn-ghost" href="#/about">About NAL</a>' +
      "</div>" +
      '<div class="hero-meta">Call <a href="tel:' +
      escapeHtml(c.phoneTel) +
      '">' +
      escapeHtml(c.phone) +
      '</a> &nbsp;·&nbsp; <a href="mailto:' +
      escapeHtml(c.email) +
      '">' +
      escapeHtml(c.email) +
      "</a></div>" +
      "</div>" +
      '<div class="hero-grid">' +
      heroImgs
        .map((p) => {
          const note =
            p.slug === "wall-pack"
              ? '<span class="hero-lens-note">Thick glass lens, same as traditional wall packs — won\'t be damaged by the sun</span>'
              : "";
          return (
            "<figure><a class=\"hero-tile\" href=\"#/product/" +
            encodeURIComponent(p.slug) +
            '" aria-label="' +
            escapeHtml(p.displayName) +
            '"><img src="' +
            escapeHtml(p.thumbs[0]) +
            '" alt="' +
            escapeHtml(p.displayName) +
            '">' +
            note +
            "</a></figure>"
          );
        })
        .join("") +
      "</div></div></section>" +
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
      '<div class="fact"><h3>Wholesale, B2B</h3><p>Trade pricing for contractors, property managers, and sign shops.</p></div>' +
      '<div class="fact"><h3>Commercial only</h3><p>LED fixtures and sign lighting for commercial spaces — not a consumer shop.</p></div>' +
      '<div class="fact"><h3>Dallas based</h3><p>North America Lighting is based in Dallas, Texas, and serves the central region.</p></div>' +
      '<div class="fact"><h3>Ships nationwide</h3><p>We ship across the United States. Call or email for lead times and freight.</p></div>' +
      "</div></section>"
    );
  }

  function renderAbout() {
    const c = company();
    return (
      '<section class="wrap about-page">' +
      '<div class="section-kicker">About</div>' +
      "<h1>North America Lighting LLC</h1>" +
      "<p>NAL is a Dallas wholesale supplier of commercial LED lighting. We work with contractors, sign shops, and facilities teams across the central United States, and we ship nationwide.</p>" +
      "<p>This website is a demo storefront so you can browse the catalog and send an order request. Submitting an order opens an email to us with your list. We then follow up with an invoice and payment instructions. No payment is collected on this site.</p>" +
      "<p><strong>Phone:</strong> <a href='tel:" +
      escapeHtml(c.phoneTel) +
      "'>" +
      escapeHtml(c.phone) +
      "</a><br><strong>Email:</strong> <a href='mailto:" +
      escapeHtml(c.email) +
      "'>" +
      escapeHtml(c.email) +
      "</a></p>" +
      '<p class="muted">Commercial fixtures only. Residential consumer sales are not offered.</p>' +
      '<p><a class="btn btn-navy" href="#/catalog">Browse the catalog</a></p>' +
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
    const img =
      (match && (match.image || match.thumb)) ||
      (p.images && p.images[0]) ||
      (p.thumbs && p.thumbs[0]);
    const price = match ? match.price : p.hasPrice ? p.priceMin : null;
    const hasFixed = match && match.price != null;
    const sku = match && match.sku ? match.sku : "";
    const comboOk = !p.options.length || !!match;

    let optionsHtml = "";
    p.options.forEach((opt) => {
      optionsHtml +=
        '<div class="option-group"><span class="opt-label">' +
        escapeHtml(opt.name) +
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
      "</div></div>" +
      '<div class="product-info">' +
      warrantyBadgeHtml(p) +
      badgesHtml(p.badges) +
      "<h1>" +
      escapeHtml(p.displayName) +
      "</h1>" +
      (p.description
        ? '<p class="product-desc">' + escapeHtml(p.description) + "</p>"
        : "") +
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
      '<p class="resale-link"><a href="#/exemption">Resale tax exemption</a></p>' +
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
    const img = line.thumb || line.image;
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
      (line.outOfStock ? outOfStockLabel() : "") +
      '<div class="line-actions"><input type="number" min="1" step="1" value="' +
      line.qty +
      '" data-qty>' +
      '<button type="button" data-remove>Remove</button></div></div>' +
      '<div class="line-price">' +
      (line.price == null ? "Quote" : money(line.price * line.qty)) +
      "</div></div>"
    );
  }

  function cartTotals() {
    let subtotal = 0;
    let hasQuote = false;
    state.cart.forEach((l) => {
      if (l.price == null) hasQuote = true;
      else subtotal += l.price * l.qty;
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
      "<label>Company name *<input name='company' required autocomplete='organization' value='" + v(acc && acc.company) + "'></label>" +
      "<label>Your name *<input name='name' required autocomplete='name' value='" + v(acc && acc.name) + "'></label>" +
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
        '<section class="wrap"><h1>Resale tax exemption</h1>' +
        '<p class="tax-exempt">This signed-in account is already tax exempt — permit #' +
        escapeHtml(acc.exemption.permitNumber || "on file") +
        ".</p>" +
        '<p><a href="#/account">My account</a></p></section>'
      );
    }
    const pending = acc && loadApplications().find((a) => a.email === acc.email && a.status === "pending");
    const pre = acc || {};
    return (
      '<section class="wrap"><h1>Resale tax exemption</h1>' +
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
    lines.push("Company: " + order.customer.company);
    lines.push("Name: " + order.customer.name);
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
      else subtotal += l.price * l.qty;
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

  function addToCart(product, variation, qty) {
    if (isVariationOos(variation)) return false;
    const key = variation.id;
    const existing = state.cart.find((l) => l.variationId === key);
    if (existing) existing.qty += qty;
    else {
      state.cart.push({
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
        image: variation.image || (product.images && product.images[0]) || "",
        thumb: variation.thumb || (product.thumbs && product.thumbs[0]) || "",
      });
    }
    saveCart();
    if (state.shipping.method === "ship") {
      state.shipping.estimate = null;
      saveShipping();
    }
  }

  /* ---------- router & events ---------- */

  function render() {
    if (!state.catalog) return;
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
    else html = '<section class="wrap"><h1>Page not found</h1><p><a href="#/">Home</a></p></section>';
    $app().innerHTML = html;
    updateCartCounts();
    updateAuthLinks();
    closeMenu();
    window.scrollTo(0, 0);
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
    const search = e.target.closest("[data-search-form]");
    if (search) {
      e.preventDefault();
      const q = (search.q.value || "").trim();
      const { parts } = parseRoute();
      const base = parts[1] ? "#/catalog/" + parts[1] : "#/catalog";
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
      addToCart(p, match, qty);
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
          body: JSON.stringify(application),
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
        subject: "Resale tax exemption application — " + application.legalName,
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
    };
  }

  function clearCartAndShipping() {
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
          customer: order.customer,
          items: order.items,
          shipping: order.shipping,
          accountEmail: order.accountEmail,
        }),
      }).catch(() => {});
    } catch (err) {
      /* ignore */
    }
  }

  async function submitEmailOrder(form) {
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
          customer: order.customer,
          items: order.items,
          shipping: order.shipping,
          tax: order.tax,
          accountEmail: order.accountEmail,
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
