(function () {
  const CART_KEY = "nal-demo-cart";
  const ORDER_KEY = "nal-demo-orders";
  const ORDER_EMAIL = "naltx75247@gmail.com";

  const state = {
    catalog: null,
    cart: loadCart(),
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

  function productCard(p) {
    const quoteClass = p.hasPrice ? "" : " quote";
    return (
      '<a class="product-card" href="#/product/' +
      encodeURIComponent(p.slug) +
      '">' +
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
      '<div class="hero-grid" aria-hidden="true">' +
      heroImgs
        .map(
          (p) =>
            "<figure><img src=\"" +
            escapeHtml(p.thumbs[0]) +
            '" alt=""></figure>'
        )
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
      (comboOk
        ? '<form data-add-form>' +
          '<div class="qty-row"><label for="qty">Qty</label>' +
          '<input id="qty" name="qty" type="number" min="1" step="1" value="1">' +
          '<button class="btn btn-navy" type="submit">' +
          (hasFixed ? "Add to cart" : "Add quote request") +
          "</button></div></form>"
        : "") +
      '<p class="muted">Wholesale request. Invoice and payment instructions are sent after you place the order.</p>' +
      "</div></section>"
    );
  }

  function defaultSelected(p) {
    const first = p.variations[0];
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
      '<div class="summary"><div class="summary-row"><span>Subtotal</span><span>' +
      (hasQuote && subtotal === 0
        ? "Call for price / request quote"
        : money(subtotal) + (hasQuote ? " + items to quote" : "")) +
      "</span></div>" +
      '<p class="form-note">Taxes, freight, and payment terms are confirmed on the invoice.</p>' +
      '<a class="btn btn-navy btn-block" href="#/checkout">Continue to checkout</a></div></section>'
    );
  }

  function cartRow(line, idx) {
    const img = line.thumb || line.image;
    return (
      '<div class="cart-row" data-line="' +
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
    const { subtotal, hasQuote } = cartTotals();
    return (
      '<section class="wrap"><h1>Checkout</h1>' +
      '<p class="form-note">This is a demo checkout. Submitting opens an email to North America Lighting with your order. You will also get an on-page confirmation with an order number. Invoice and payment instructions follow by email. No payment is taken here.</p>' +
      '<div class="checkout-grid">' +
      '<form class="form" data-checkout-form novalidate>' +
      "<label>Company name *<input name='company' required autocomplete='organization'></label>" +
      "<label>Your name *<input name='name' required autocomplete='name'></label>" +
      "<label>Email *<input name='email' type='email' required autocomplete='email'></label>" +
      "<label>Phone *<input name='phone' type='tel' required autocomplete='tel'></label>" +
      "<label>Ship-to address *<textarea name='shipTo' required autocomplete='street-address' placeholder='Street, city, state, ZIP'></textarea></label>" +
      "<label>PO number / notes<span class='hint'>Purchase order, job name, or delivery notes</span><textarea name='notes' placeholder='Optional'></textarea></label>" +
      '<button class="btn btn-gold btn-block" type="submit">Submit order request</button>' +
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
      '<div class="summary-row"><span>Subtotal</span><span>' +
      (hasQuote && subtotal === 0
        ? "Call for price / request quote"
        : money(subtotal) + (hasQuote ? " + items to quote" : "")) +
      "</span></div></div></div></section>"
    );
  }

  function renderConfirmation(orderNo) {
    const orders = loadOrders();
    const order = orders.find((o) => o.orderNumber === orderNo);
    if (!order) {
      return (
        '<section class="wrap"><h1>Order not found</h1><p>This confirmation is stored only in this browser. <a href="#/admin">View local orders</a>.</p></section>'
      );
    }
    return (
      '<section class="wrap"><div class="confirm">' +
      "<h1>Order request received</h1>" +
      '<div class="order-no">' +
      escapeHtml(order.orderNumber) +
      "</div>" +
      "<p>Your request has been prepared for <strong>naltx75247@gmail.com</strong>. If your email app opened, send that message so we receive the order. If it did not, copy the details below and email them to us, or call (214) 631-6666.</p>" +
      "<p>An invoice and payment instructions will follow. No payment was taken on this website.</p>" +
      '<div class="order-block">' +
      escapeHtml(formatOrderText(order)) +
      "</div>" +
      '<p style="margin-top:1.2rem"><a class="btn btn-navy" href="#/catalog">Continue browsing</a> ' +
      '<a class="btn btn-outline" href="#/admin">View orders in this browser</a></p>' +
      "</div></section>"
    );
  }

  function renderAdmin() {
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
    lines.push("SHIP TO");
    lines.push(order.customer.shipTo);
    lines.push("");
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
    lines.push(
      "SUBTOTAL: " +
        (hasQuote && subtotal === 0
          ? "Call for price / request quote"
          : money(subtotal) + (hasQuote ? " + items to quote" : ""))
    );
    lines.push("");
    lines.push("This request was submitted from the NAL demo website.");
    lines.push("Please send an invoice and payment instructions.");
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
        image: variation.image || (product.images && product.images[0]) || "",
        thumb: variation.thumb || (product.thumbs && product.thumbs[0]) || "",
      });
    }
    saveCart();
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
    else if (root === "admin") html = renderAdmin();
    else if (root === "about") html = renderAbout();
    else html = '<section class="wrap"><h1>Page not found</h1><p><a href="#/">Home</a></p></section>';
    $app().innerHTML = html;
    updateCartCounts();
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
      render();
    }
  });

  document.addEventListener("change", (e) => {
    if (e.target.matches("[data-qty]")) {
      const row = e.target.closest("[data-line]");
      const idx = Number(row.getAttribute("data-line"));
      const qty = Math.max(1, parseInt(e.target.value, 10) || 1);
      state.cart[idx].qty = qty;
      saveCart();
      render();
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
      if (!match) return;
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
      if (!checkout.reportValidity()) return;
      if (!state.cart.length) return;
      const order = {
        orderNumber: newOrderNumber(),
        createdAt: new Date().toISOString(),
        customer: {
          company: checkout.company.value.trim(),
          name: checkout.name.value.trim(),
          email: checkout.email.value.trim(),
          phone: checkout.phone.value.trim(),
          shipTo: checkout.shipTo.value.trim(),
          notes: checkout.notes.value.trim(),
        },
        items: state.cart.map((l) => ({ ...l })),
      };
      const orders = loadOrders();
      orders.push(order);
      saveOrders(orders);
      const body = formatOrderText(order);
      const subject = "Order request " + order.orderNumber + " — North America Lighting";
      const mailto =
        "mailto:" +
        ORDER_EMAIL +
        "?subject=" +
        encodeURIComponent(subject) +
        "&body=" +
        encodeURIComponent(body);
      state.cart = [];
      saveCart();
      location.hash = "#/order/" + encodeURIComponent(order.orderNumber);
      setTimeout(() => {
        window.location.href = mailto;
      }, 250);
    }
  });

  window.addEventListener("hashchange", render);

  updateCartCounts();

  fetch("products.json")
    .then((r) => {
      if (!r.ok) throw new Error("Could not load products.json (" + r.status + ")");
      return r.json();
    })
    .then((data) => {
      state.catalog = data;
      document.title = data.company.name + " — Commercial LED Wholesale";
      render();
    })
    .catch((err) => {
      $app().innerHTML =
        '<section class="wrap page-error"><h1>Catalog could not load</h1><p>' +
        escapeHtml(err.message) +
        "</p><p>If you opened the file directly, serve the folder over HTTP instead (for example, <code>python3 -m http.server</code>).</p></section>";
    });
})();
