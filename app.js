const app = document.querySelector("#app");
const toastRegion = document.querySelector("#toast-region");
const STORAGE_KEY = "counterstock-supabase";
const navItems = [
  ["dashboard", "Overview", "◫"],
  ["pos", "Checkout", "□"],
  ["inventory", "Inventory", "▦"],
  ["reports", "Reports", "▤"],
  ["settings", "Settings", "⚙"],
];

let supabase;
let user;
let page = "dashboard";
let products = [];
let settings = { shop_name: "Bethsaida Electronics", report_email: "", currency: "KES" };
let cart = [];
let reportMonth = localMonth();
let reportData = null;
let reportRequestId = 0;
let mobileNavOpen = false;
let productSearch = "";
let authMode = "signin";
let busy = false;

function localMonth(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

function monthUtcBoundary(year, month) {
  return new Date(Date.UTC(year, month - 1, 1) - 3 * 60 * 60 * 1000).toISOString();
}

function nairobiDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

function nairobiDayUtcBoundary(date = new Date()) {
  const parts = nairobiDateParts(date);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day) - 3 * 60 * 60 * 1000).toISOString();
}

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function money(value) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: settings.currency || "KES",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function dateTime(value) {
  return new Intl.DateTimeFormat("en-KE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Nairobi",
  }).format(new Date(value));
}

function toast(message, error = false) {
  const item = document.createElement("div");
  item.className = `toast${error ? " error" : ""}`;
  item.textContent = message;
  toastRegion.append(item);
  window.setTimeout(() => item.remove(), 4200);
}

function reportError(error) {
  console.error(error);
  toast(error?.message || "Something went wrong. Please try again.", true);
}

function getClientConfig() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch (error) {
    console.error("Could not read saved Supabase settings.", error);
    return {};
  }
}

async function connect() {
  const config = getClientConfig();
  if (!config.url || !config.anonKey) {
    renderAuth();
    return;
  }
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  supabase = createClient(config.url, config.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  user = data.session?.user || null;
  if (user) {
    await loadData();
    renderApp();
  } else {
    renderAuth();
  }
  supabase.auth.onAuthStateChange((_event, session) => {
    user = session?.user || null;
    if (user) {
      loadData().then(renderApp).catch(reportError);
    } else {
      renderAuth();
    }
  });
}

async function loadData() {
  const productRows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const productResult = await supabase.from("products").select("*").order("name").range(offset, offset + pageSize - 1);
    if (productResult.error) throw productResult.error;
    productRows.push(...(productResult.data || []));
    if ((productResult.data || []).length < pageSize) break;
  }
  const settingsResult = await supabase.from("shop_settings").select("*").maybeSingle();
  if (settingsResult.error) throw settingsResult.error;
  products = productRows;
  settings = settingsResult.data || settings;
}

function renderAuth(errorMessage = "") {
  const config = getClientConfig();
  const setupNeeded = !config.url || !config.anonKey;
  app.innerHTML = `
    <section class="auth-screen">
      <div class="auth-card">
        <div class="auth-brand"><div class="brand-mark">B</div><span>Bethsaida Electronics</span></div>
        <h1>${setupNeeded ? "Connect your shop" : authMode === "signup" ? "Create your account" : "Welcome back"}</h1>
        <p class="subtle">${setupNeeded
          ? "Add your Supabase project details to securely connect your shared shop database."
          : authMode === "signup" ? "Set up your shop account to get started." : "Sign in to manage your shop."}</p>
        ${setupNeeded ? `
          <form id="config-form">
            <div class="field"><label for="project-url">Supabase project URL</label><input id="project-url" name="url" type="url" placeholder="https://your-project.supabase.co" required value="${esc(config.url || "")}"></div>
            <div class="field"><label for="anon-key">Supabase anon / publishable key</label><input id="anon-key" name="anonKey" type="password" autocomplete="off" required value="${esc(config.anonKey || "")}"></div>
            <div class="auth-error">${esc(errorMessage)}</div>
            <button class="primary wide" type="submit">Connect project</button>
          </form>
          <div class="config-note">You’ll find these values in Supabase → Project Settings → API. The publishable/anon key is safe for browser use when Row Level Security is enabled. Never enter your service-role key here.</div>
        ` : `
          <form id="auth-form">
            <div class="field"><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="email" required></div>
            <div class="field"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="${authMode === "signup" ? "new-password" : "current-password"}" minlength="8" required></div>
            ${authMode === "signup" ? `<div class="field"><label for="shop-name">Shop name</label><input id="shop-name" name="shopName" required maxlength="100" placeholder="My electronics shop"></div>` : ""}
            <div class="auth-error">${esc(errorMessage)}</div>
            <button class="primary wide" type="submit" ${busy ? "disabled" : ""}>${busy ? "Please wait…" : authMode === "signup" ? "Create shop account" : "Sign in"}</button>
          </form>
          <div class="auth-actions"><span>${authMode === "signup" ? "Already have an account?" : "New to Bethsaida POS?"}</span><button class="text-button" data-action="toggle-auth">${authMode === "signup" ? "Sign in" : "Create account"}</button></div>
          <div style="margin-top:18px;text-align:center"><button class="text-button" data-action="reset-config">Change Supabase project settings</button></div>
          <div class="config-note">Your inventory and sales are shared through Supabase and protected by account-level database policies.</div>
        `}
      </div>
    </section>`;
}

function navMarkup(mobile = false) {
  return navItems.map(([id, label, icon]) =>
    `<button class="nav-item${page === id ? " active" : ""}" data-action="navigate" data-page="${id}" ${mobile ? "tabindex='0'" : ""}><span class="nav-icon">${icon}</span>${label}</button>`
  ).join("");
}

function renderApp() {
  if (!user) return renderAuth();
  const currentTitle = navItems.find(([id]) => id === page)?.[1] || "Overview";
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand"><div class="brand-mark">B</div><div><span>Bethsaida Electronics</span><div class="brand-subtitle">POS &amp; INVENTORY</div></div></div>
        <div class="nav-label">Workspace</div>
        <nav class="nav-list">${navMarkup()}</nav>
        <div class="sidebar-bottom"><div class="workspace-label">CLOUD WORKSPACE</div><div class="user-name">${esc(settings.shop_name || "My shop")}</div><div class="user-email">${esc(user.email || "")}</div><button class="signout" data-action="signout">↗ &nbsp;Sign out</button></div>
      </aside>
      <section class="main-area">
        <header class="topbar">
          <div class="breadcrumb"><button class="mobile-menu" data-action="mobile-nav" aria-label="Toggle navigation">☰</button><strong>${esc(currentTitle)}</strong></div>
          <div class="today">${new Intl.DateTimeFormat("en-KE", { dateStyle: "full", timeZone: "Africa/Nairobi" }).format(new Date())}</div>
        </header>
        <nav class="mobile-nav${mobileNavOpen ? " open" : ""}">${navMarkup(true)}<button class="nav-item" data-action="signout">↗ Sign out</button></nav>
        <main class="content">${renderPage()}</main>
      </section>
    </div>`;
  if (page === "reports" && !reportData) loadReport().catch(reportError);
}

function renderPage() {
  if (page === "inventory") return renderInventory();
  if (page === "pos") return renderPos();
  if (page === "reports") return renderReports();
  if (page === "settings") return renderSettings();
  return renderDashboard();
}

async function salesForPeriod(start, end, limit) {
  const pageSize = 1000;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    let query = supabase.from("sales").select("*").gte("created_at", start).lt("created_at", end).order("created_at", { ascending: false });
    if (limit) query = query.limit(limit);
    else query = query.range(offset, offset + pageSize - 1);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if (limit || (data || []).length < pageSize) return rows;
  }
}

function renderDashboard() {
  const todayStart = nairobiDayUtcBoundary();
  const todayEnd = new Date(new Date(todayStart).getTime() + 24 * 60 * 60 * 1000).toISOString();
  const salesPromise = salesForPeriod(todayStart, todayEnd);
  const lowStock = products.filter((item) => item.stock <= item.reorder_level);
  const lowStockRows = lowStock.slice(0, 6).map((item) => `
    <tr><td><div class="product-main">${esc(item.name)}</div><div class="product-sub">${esc(item.sku)}</div></td>
    <td>${item.stock}</td><td>${item.reorder_level}</td><td>${item.stock === 0 ? '<span class="pill danger">Out of stock</span>' : '<span class="pill warning">Reorder</span>'}</td></tr>`).join("");
  setTimeout(async () => {
    try {
      const sales = await salesPromise;
      const total = sales.reduce((sum, sale) => sum + Number(sale.total), 0);
      const saleIds = sales.map((sale) => sale.id);
      const itemRows = [];
      for (let index = 0; index < saleIds.length; index += 100) {
        const { data, error } = await supabase.from("sale_items").select("sale_id, quantity").in("sale_id", saleIds.slice(index, index + 100));
        if (error) throw error;
        itemRows.push(...(data || []));
      }
      const revenue = document.querySelector("#dash-revenue");
      const count = document.querySelector("#dash-sales");
      const units = document.querySelector("#dash-units");
      const recent = document.querySelector("#recent-sales");
      if (revenue) revenue.textContent = money(total);
      if (count) count.textContent = String(itemRows.reduce((sum, row) => sum + Number(row.quantity), 0));
      if (units) units.textContent = String(sales.length);
      if (recent) recent.innerHTML = sales.length ? sales.slice(0, 6).map((sale) => `
        <tr><td>${esc(sale.receipt_number)}</td><td>${dateTime(sale.created_at)}</td><td>Retail</td><td>—</td><td>${money(sale.total)}</td></tr>`).join("") : '<tr><td colspan="5" class="empty-state">No sales yet. Your completed sales will appear here.</td></tr>';
    } catch (error) { reportError(error); }
  }, 0);
  return `
    <div class="page-heading"><div><div class="eyebrow">${new Intl.DateTimeFormat("en-KE", { weekday: "long", month: "long", day: "numeric", timeZone: "Africa/Nairobi" }).format(new Date()).toUpperCase()}</div><h1>Good ${new Intl.DateTimeFormat("en", { hour: "numeric", timeZone: "Africa/Nairobi" }).format(new Date()).includes("AM") ? "morning" : "day"}, ${esc((settings.shop_name || "operator").split(" ")[0])}</h1><p>Here’s what’s happening at your counter today.</p></div><div class="heading-actions"><button class="secondary" data-action="navigate" data-page="reports">Monthly report</button><button class="primary" data-action="navigate" data-page="pos">＋ New sale</button></div></div>
    <section class="stats-grid">
      <article class="stat-card"><div class="stat-top">Today’s sales<span class="stat-icon">↗</span></div><div class="stat-value" id="dash-revenue">—</div><div class="stat-caption">Completed transactions</div></article>
      <article class="stat-card"><div class="stat-top">Items sold today<span class="stat-icon">▤</span></div><div class="stat-value" id="dash-sales">—</div><div class="stat-caption">Across all sales</div></article>
      <article class="stat-card"><div class="stat-top">Transactions today<span class="stat-icon">▦</span></div><div class="stat-value" id="dash-units">—</div><div class="stat-caption">Receipts completed</div></article>
      <article class="stat-card"><div class="stat-top">Low stock<span class="stat-icon">!</span></div><div class="stat-value">${lowStock.length}</div><div class="stat-caption">At or below reorder point</div></article>
    </section>
    <section class="dashboard-grid">
      <article class="panel"><div class="panel-heading"><div><h2>Sales today</h2><div class="subtle">Completed counter transactions</div></div><button class="text-button" data-action="navigate" data-page="pos">Open checkout →</button></div>
        <div class="table-wrap"><table><thead><tr><th>Receipt</th><th>Time</th><th>Type</th><th>Payment</th><th>Total</th></tr></thead><tbody id="recent-sales"><tr><td colspan="5" class="empty-state">Loading sales…</td></tr></tbody></table></div>
      </article>
      <article class="panel"><div class="panel-heading"><div><h2>Quick actions</h2><div class="subtle">Common shop-floor tasks</div></div></div>
        <div class="quick-actions"><button class="quick-action" data-action="navigate" data-page="pos"><strong>Start a sale</strong><span>Ring up electronics and accessories.</span></button><button class="quick-action" data-action="navigate" data-page="inventory"><strong>Review stock</strong><span>See quantities and update your product catalog.</span></button><button class="quick-action" data-action="navigate" data-page="reports"><strong>Monthly reports</strong><span>Review and download your sales summary.</span></button></div>
      </article>
      <article class="panel"><div class="panel-heading"><div><h2>Stock watch</h2><div class="subtle">Products to keep an eye on</div></div><button class="text-button" data-action="navigate" data-page="inventory">Inventory →</button></div>
        <div class="table-wrap"><table><thead><tr><th>Product</th><th>In stock</th><th>Alert at</th><th>Status</th></tr></thead><tbody>${lowStockRows || '<tr><td colspan="4" class="empty-state">All products are well stocked.</td></tr>'}</tbody></table></div>
      </article>
    </section>`;
}

function renderInventory() {
  const filtered = products.filter((item) => `${item.name} ${item.sku} ${item.category || ""}`.toLowerCase().includes(productSearch.toLowerCase()));
  const rows = filtered.map((item) => `
    <tr><td><div class="product-main">${esc(item.name)}</div><div class="product-sub">${esc(item.category || "Uncategorised")}</div></td>
      <td>${esc(item.sku)}</td><td>${money(item.unit_price)}</td><td><span class="pill${item.stock === 0 ? " danger" : item.stock <= item.reorder_level ? " warning" : ""}">${item.stock} units</span></td>
      <td>${item.reorder_level}</td><td><div class="heading-actions"><button class="secondary" data-action="adjust-stock" data-id="${item.id}">Adjust stock</button><button class="secondary" data-action="edit-product" data-id="${item.id}">Edit</button></div></td></tr>`).join("");
  return `
    <div class="page-heading"><div><h1>Inventory</h1><p>Manage products, prices, and available stock.</p></div><div class="heading-actions"><button class="primary" data-action="add-product">＋ Add product</button></div></div>
    <section class="panel">
      <div class="toolbar"><div class="search-box"><span>⌕</span><input id="product-search" type="search" placeholder="Search by product, SKU or category" value="${esc(productSearch)}"></div><span class="subtle">${filtered.length} of ${products.length} products</span></div>
      <div class="table-wrap"><table><thead><tr><th>Product</th><th>SKU</th><th>Price</th><th>Stock</th><th>Alert level</th><th>Actions</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="empty-state">No products found. Add your first product to get started.</td></tr>'}</tbody></table></div>
    </section>`;
}

function renderPos() {
  const available = products.filter((item) => `${item.name} ${item.sku}`.toLowerCase().includes(productSearch.toLowerCase()));
  const catalog = available.map((item) => `<button class="pos-product" data-action="add-to-cart" data-id="${item.id}" ${item.stock <= 0 ? "disabled" : ""}><div class="product-main">${esc(item.name)}</div><div class="product-sub">${esc(item.sku)} · ${item.stock} in stock</div><div class="pos-price">${money(item.unit_price)}</div></button>`).join("");
  const cartMarkup = cart.map((entry) => `<div class="cart-row"><div><div class="cart-name">${esc(entry.product.name)}</div><div class="cart-unit">${money(entry.product.unit_price)} each</div></div><div class="quantity-control"><button data-action="cart-minus" data-id="${entry.product.id}" aria-label="Decrease quantity">−</button><span>${entry.quantity}</span><button data-action="cart-plus" data-id="${entry.product.id}" aria-label="Increase quantity">+</button></div><div class="cart-line">${money(entry.quantity * entry.product.unit_price)}</div></div>`).join("");
  const total = cart.reduce((sum, entry) => sum + entry.quantity * Number(entry.product.unit_price), 0);
  return `
    <div class="page-heading"><div><h1>Point of sale</h1><p>Add items to the sale and complete checkout.</p></div></div>
    <div class="pos-layout">
      <section class="panel"><div class="toolbar"><div class="search-box"><span>⌕</span><input id="product-search" type="search" placeholder="Find a product…" value="${esc(productSearch)}"></div><span class="subtle">${available.length} products</span></div><div class="product-grid">${catalog || '<div class="empty-state">No products available. Add products in Inventory first.</div>'}</div></section>
      <section class="panel"><div class="panel-heading"><div><h2>Current sale</h2><div class="subtle">${cart.length} item type${cart.length === 1 ? "" : "s"}</div></div><button class="text-button" data-action="clear-cart">Clear</button></div>
        ${cartMarkup || '<div class="empty-state">Your sale is empty.<br>Choose products to add them here.</div>'}
        <div class="cart-total"><span>Total due</span><strong>${money(total)}</strong></div>
        <button class="primary wide" data-action="checkout" ${cart.length === 0 || busy ? "disabled" : ""}>${busy ? "Processing…" : "Complete sale · " + money(total)}</button>
      </section>
    </div>`;
}

function renderReports() {
  const summary = reportData ? `
    <div class="report-summary">
      <div class="report-card"><span>Sales revenue</span><strong>${money(reportData.revenue)}</strong></div>
      <div class="report-card"><span>Transactions</span><strong>${reportData.sales.length.toLocaleString("en-KE")}</strong></div>
      <div class="report-card"><span>Units sold</span><strong>${reportData.units.toLocaleString("en-KE")}</strong></div>
    </div>
    <section class="panel"><div class="panel-heading"><div><h2>Sales detail</h2><div class="subtle">Line items for the selected month</div></div></div>
      <div class="table-wrap"><table><thead><tr><th>Date & time</th><th>Receipt</th><th>Product</th><th>Qty</th><th>Unit price</th><th>Line total</th></tr></thead><tbody>${reportData.lines.length ? reportData.lines.map((line) => `<tr><td>${dateTime(line.created_at)}</td><td>${esc(line.receipt_number)}</td><td>${esc(line.product_name)}</td><td>${line.quantity}</td><td>${money(line.unit_price)}</td><td>${money(line.line_total)}</td></tr>`).join("") : '<tr><td colspan="6" class="empty-state">No sales recorded for this month.</td></tr>'}</tbody></table></div>
    </section>` : `<section class="panel"><div class="empty-state">Loading monthly report…</div></section>`;
  return `
    <div class="page-heading"><div><h1>Reports</h1><p>Review monthly sales and download a spreadsheet for your records.</p></div></div>
    <section class="panel" style="margin-bottom:16px">
      <div class="toolbar"><div><label class="subtle" for="report-month">Report month</label><br><input id="report-month" type="month" value="${esc(reportMonth)}"></div><div class="heading-actions"><button class="secondary" data-action="refresh-report">Refresh</button><button class="primary" data-action="download-report" ${!reportData ? "disabled" : ""}>↓ Download CSV</button></div></div>
    </section>
    ${summary}`;
}

function renderSettings() {
  return `
    <div class="page-heading"><div><h1>Settings</h1><p>Update your shop profile and monthly report delivery.</p></div></div>
    <section class="panel settings-panel">
      <div class="panel-heading"><div><h2>Shop profile</h2><div class="subtle">Used on your dashboard and reports</div></div></div>
      <form id="settings-form">
        <div class="form-grid">
          <div class="field"><label for="settings-shop-name">Shop name</label><input id="settings-shop-name" name="shop_name" maxlength="100" required value="${esc(settings.shop_name || "")}"></div>
          <div class="field"><label for="settings-currency">Currency</label><select id="settings-currency" name="currency"><option value="KES" ${settings.currency === "KES" ? "selected" : ""}>KES — Kenyan shilling</option><option value="USD" ${settings.currency === "USD" ? "selected" : ""}>USD — US dollar</option><option value="EUR" ${settings.currency === "EUR" ? "selected" : ""}>EUR — Euro</option><option value="GBP" ${settings.currency === "GBP" ? "selected" : ""}>GBP — Pound sterling</option></select></div>
          <div class="field full"><label for="settings-report-email">Monthly report recipient email</label><input id="settings-report-email" name="report_email" type="email" value="${esc(settings.report_email || "")}" placeholder="owner@example.com"></div>
        </div>
        <div class="notice">Reports are available in the Reports page and can be downloaded as CSV at any time. To send the month-end report by email automatically, follow the one-time Resend and Supabase scheduler setup in README.md.</div>
        <button class="primary" type="submit" ${busy ? "disabled" : ""}>Save settings</button>
      </form>
    </section>`;
}

function openModal(title, body, submitLabel = "Save") {
  const wrapper = document.createElement("div");
  wrapper.className = "modal-backdrop";
  wrapper.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-title"><h2>${esc(title)}</h2><button class="icon-button" data-action="close-modal" aria-label="Close">×</button></div><form id="modal-form">${body}<div class="modal-actions"><button class="secondary" type="button" data-action="close-modal">Cancel</button><button class="primary" type="submit">${esc(submitLabel)}</button></div></form></section>`;
  document.body.append(wrapper);
}

function closeModal() {
  document.querySelector(".modal-backdrop")?.remove();
}

function showProductModal(product = null) {
  const editing = Boolean(product);
  const body = `<div class="form-grid">
    <div class="field"><label for="product-sku">SKU</label><input id="product-sku" name="sku" required maxlength="60" value="${esc(product?.sku || "")}" placeholder="e.g. PHONE-001"></div>
    <div class="field"><label for="product-name">Product name</label><input id="product-name" name="name" required maxlength="120" value="${esc(product?.name || "")}"></div>
    <div class="field"><label for="product-category">Category</label><input id="product-category" name="category" maxlength="80" value="${esc(product?.category || "")}" placeholder="Phones, accessories…"></div>
    <div class="field"><label for="product-price">Selling price (${esc(settings.currency)})</label><input id="product-price" name="unit_price" type="number" min="0" step="0.01" required value="${esc(product?.unit_price ?? "")}"></div>
    ${editing ? "" : `<div class="field"><label for="product-stock">Opening stock</label><input id="product-stock" name="initial_stock" type="number" min="0" step="1" required value="0"></div>`}
    <div class="field"><label for="product-reorder">Low-stock alert level</label><input id="product-reorder" name="reorder_level" type="number" min="0" step="1" required value="${esc(product?.reorder_level ?? 5)}"></div>
  </div>${editing ? '<p class="subtle">Use “Adjust stock” to receive or remove units. Stock cannot be edited here.</p>' : ""}`;
  openModal(editing ? "Edit product" : "Add product", body);
  document.querySelector("#modal-form").dataset.productId = product?.id || "";
}

function showStockModal(product) {
  openModal("Adjust stock", `<p class="subtle">${esc(product.name)} · Current stock: <strong>${product.stock}</strong></p>
    <div class="field"><label for="stock-delta">Quantity change</label><input id="stock-delta" name="delta" type="number" step="1" required placeholder="Use a positive number to receive stock"></div>
    <div class="field"><label for="stock-reason">Reason</label><select id="stock-reason" name="reason" required><option value="Restock">Restock / delivery</option><option value="Correction">Stock correction</option><option value="Return">Customer return</option><option value="Damaged">Damaged / write-off</option></select></div>
    <p class="subtle">Enter a negative number to reduce stock. The app will prevent stock from going below zero.</p>`);
  document.querySelector("#modal-form").dataset.productId = product.id;
}

async function loadReport() {
  const requestId = ++reportRequestId;
  reportData = null;
  if (!document.querySelector("#report-month")) {
    renderApp();
    return;
  }
  const selectedMonth = reportMonth;
  const [year, month] = selectedMonth.split("-").map(Number);
  const start = monthUtcBoundary(year, month);
  const end = monthUtcBoundary(year, month + 1);
  const sales = await salesForPeriod(start, end);
  if (requestId !== reportRequestId) return;
  const saleIds = sales.map((sale) => sale.id);
  const items = [];
  for (let index = 0; index < saleIds.length; index += 100) {
    const { data, error } = await supabase.from("sale_items").select("*").in("sale_id", saleIds.slice(index, index + 100));
    if (error) throw error;
    items.push(...(data || []));
  }
  if (requestId !== reportRequestId) return;
  const salesById = new Map(sales.map((sale) => [sale.id, sale]));
  const lines = items.map((item) => ({
    ...item,
    created_at: salesById.get(item.sale_id).created_at,
    receipt_number: salesById.get(item.sale_id).receipt_number,
  })).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  reportData = {
    sales,
    lines,
    revenue: sales.reduce((sum, sale) => sum + Number(sale.total), 0),
    units: items.reduce((sum, item) => sum + Number(item.quantity), 0),
  };
  renderApp();
}

async function checkout() {
  if (!cart.length || busy) return;
  busy = true;
  renderApp();
  const { data, error } = await supabase.rpc("process_sale", {
    p_items: cart.map((entry) => ({ product_id: entry.product.id, quantity: entry.quantity })),
  });
  busy = false;
  if (error) {
    renderApp();
    reportError(error);
    return;
  }
  cart = [];
  renderApp();
  toast(`Sale completed successfully. Receipt ${data}.`);
  try {
    await loadData();
    renderApp();
  } catch (refreshError) {
    reportError(refreshError);
  }
}

function downloadReport() {
  if (!reportData) return;
  const columns = ["Date/time", "Receipt", "Product", "SKU", "Quantity", "Unit price", "Line total"];
  const records = reportData.lines.map((line) => [
    new Date(line.created_at).toISOString(),
    line.receipt_number,
    line.product_name,
    line.sku || "",
    line.quantity,
    Number(line.unit_price).toFixed(2),
    Number(line.line_total).toFixed(2),
  ]);
  const csv = [columns, ...records].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `sales-report-${reportMonth}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

app.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const values = Object.fromEntries(new FormData(form));
  try {
    if (form.id === "config-form") {
      const url = String(values.url).trim().replace(/\/+$/, "");
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ url, anonKey: String(values.anonKey).trim() }));
      await connect();
      return;
    }
    if (form.id === "auth-form") {
      busy = true;
      renderAuth();
      const response = authMode === "signup"
        ? await supabase.auth.signUp({ email: values.email, password: values.password, options: { data: { shop_name: values.shopName } } })
        : await supabase.auth.signInWithPassword({ email: values.email, password: values.password });
      busy = false;
      if (response.error) {
        renderAuth(response.error.message);
        return;
      }
      if (authMode === "signup" && !response.data.session) {
        renderAuth("Check your email to confirm your account, then sign in.");
        toast("Confirmation email sent.");
      }
      return;
    }
    if (form.id === "settings-form") {
      busy = true;
      renderApp();
      const { error } = await supabase.from("shop_settings").upsert({
        owner_id: user.id,
        shop_name: String(values.shop_name).trim(),
        report_email: String(values.report_email).trim() || null,
        currency: values.currency,
      }, { onConflict: "owner_id" });
      busy = false;
      if (error) throw error;
      await loadData();
      renderApp();
      toast("Shop settings saved.");
      return;
    }
    if (form.id === "modal-form") {
      const productId = form.dataset.productId;
      if (productId && values.delta !== undefined) {
        const delta = Number(values.delta);
        if (!Number.isInteger(delta) || delta === 0) throw new Error("Enter a non-zero whole number.");
        const { error } = await supabase.rpc("adjust_stock", {
          p_product_id: productId,
          p_delta: delta,
          p_reason: values.reason,
        });
        if (error) throw error;
        closeModal();
        await loadData();
        renderApp();
        toast("Stock updated.");
        return;
      }
      const fields = {
        sku: String(values.sku).trim(),
        name: String(values.name).trim(),
        category: String(values.category).trim() || null,
        unit_price: Number(values.unit_price),
        reorder_level: Number(values.reorder_level),
      };
      if (!Number.isFinite(fields.unit_price) || fields.unit_price < 0 || !Number.isInteger(fields.reorder_level) || fields.reorder_level < 0) {
        throw new Error("Enter a valid price and whole-number alert level.");
      }
      if (!productId && (!Number.isInteger(Number(values.initial_stock)) || Number(values.initial_stock) < 0)) {
        throw new Error("Opening stock must be a non-negative whole number.");
      }
      if (productId) {
        const { error } = await supabase.from("products").update(fields).eq("id", productId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.rpc("create_product", {
          p_sku: fields.sku,
          p_name: fields.name,
          p_category: fields.category,
          p_unit_price: fields.unit_price,
          p_initial_stock: Number(values.initial_stock),
          p_reorder_level: fields.reorder_level,
        });
        if (error) throw error;
        if (!data) throw new Error("The product was not created.");
      }
      closeModal();
      await loadData();
      renderApp();
      toast(productId ? "Product updated." : "Product added.");
    }
  } catch (error) {
    busy = false;
    reportError(error);
    if (form.id === "settings-form") renderApp();
  }
});

app.addEventListener("input", (event) => {
  if (event.target.id === "product-search") {
    productSearch = event.target.value;
    const position = event.target.selectionStart;
    renderApp();
    const search = document.querySelector("#product-search");
    search?.focus();
    search?.setSelectionRange(position, position);
  }
});

app.addEventListener("change", async (event) => {
  if (event.target.id === "report-month") {
    reportMonth = event.target.value || localMonth();
    try { await loadReport(); } catch (error) { reportError(error); }
  }
});

app.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const { action, id } = button.dataset;
  try {
    if (action === "toggle-auth") {
      authMode = authMode === "signup" ? "signin" : "signup";
      renderAuth();
    } else if (action === "reset-config") {
      localStorage.removeItem(STORAGE_KEY);
      supabase = null;
      user = null;
      renderAuth();
    } else if (action === "mobile-nav") {
      mobileNavOpen = !mobileNavOpen;
      renderApp();
    } else if (action === "navigate") {
      page = button.dataset.page;
      mobileNavOpen = false;
      productSearch = "";
      reportData = null;
      renderApp();
    } else if (action === "signout") {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      user = null;
      cart = [];
      renderAuth();
    } else if (action === "add-product") {
      showProductModal();
    } else if (action === "edit-product") {
      showProductModal(products.find((item) => item.id === id));
    } else if (action === "adjust-stock") {
      showStockModal(products.find((item) => item.id === id));
    } else if (action === "add-to-cart") {
      const product = products.find((item) => item.id === id);
      const line = cart.find((entry) => entry.product.id === id);
      if (product && (line?.quantity || 0) < product.stock) {
        if (line) line.quantity += 1;
        else cart.push({ product, quantity: 1 });
        renderApp();
      } else if (product) toast("There is not enough stock to add another unit.", true);
    } else if (action === "cart-minus" || action === "cart-plus") {
      const line = cart.find((entry) => entry.product.id === id);
      const product = products.find((item) => item.id === id);
      if (line && action === "cart-minus") line.quantity -= 1;
      if (line && action === "cart-plus" && line.quantity < product.stock) line.quantity += 1;
      if (line && line.quantity <= 0) cart = cart.filter((entry) => entry.product.id !== id);
      renderApp();
    } else if (action === "clear-cart") {
      cart = [];
      renderApp();
    } else if (action === "checkout") {
      await checkout();
    } else if (action === "download-report") {
      downloadReport();
    } else if (action === "refresh-report") {
      try { await loadReport(); } catch (error) { reportError(error); }
    } else if (action === "close-modal") {
      closeModal();
    }
  } catch (error) { reportError(error); }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});

connect().catch((error) => {
  console.error(error);
  renderAuth(error.message || "Could not connect to Supabase.");
});
