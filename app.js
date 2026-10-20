const app = document.querySelector("#app");
const toastRegion = document.querySelector("#toast-region");
const STORAGE_KEY = "bethsaida-electronics-local-v1";
const navItems = [
  ["dashboard", "Overview", "◫"],
  ["pos", "Checkout", "□"],
  ["inventory", "Inventory", "▦"],
  ["reports", "Reports", "▤"],
  ["settings", "Settings", "⚙"],
];
const DEFAULT_SETTINGS = { shop_name: "Bethsaida Electronics", currency: "KES" };
const STARTER_PRODUCTS = [
  ["SAM-A05S", "Samsung Galaxy A05s", "Phones"],
  ["SAM-A15", "Samsung Galaxy A15", "Phones"],
  ["SAM-A25-5G", "Samsung Galaxy A25 5G", "Phones"],
  ["SAM-A35-5G", "Samsung Galaxy A35 5G", "Phones"],
  ["SAM-S24-FE", "Samsung Galaxy S24 FE", "Phones"],
  ["TEC-SPARK-30C", "Tecno Spark 30C", "Phones"],
  ["TEC-CAMON-30", "Tecno Camon 30", "Phones"],
  ["TEC-CAMON-40-PRO", "Tecno Camon 40 Pro", "Phones"],
  ["INF-HOT-50I", "Infinix Hot 50i", "Phones"],
  ["INF-NOTE-40", "Infinix Note 40", "Phones"],
  ["RED-14C", "Redmi 14C", "Phones"],
  ["RED-NOTE-13", "Redmi Note 13", "Phones"],
  ["SAM-TV-43-CRYSTAL", "Samsung 43-inch Crystal UHD Smart TV", "Televisions"],
  ["HIS-TV-32-A4N", "Hisense 32-inch A4N Smart TV", "Televisions"],
  ["HIS-TV-55-U6N", "Hisense 55-inch U6N QLED Smart TV", "Televisions"],
  ["TCL-TV-43-S5K", "TCL 43-inch S5K Smart TV", "Televisions"],
  ["VIS-TV-32-FRAMELESS", "Vision Plus 32-inch Frameless Smart TV", "Televisions"],
  ["VIT-TV-43-ANDROID", "Vitron 43-inch Android Smart TV", "Televisions"],
  ["SAM-SOUNDBAR-C450", "Samsung HW-C450 Soundbar", "Sound systems"],
  ["HIS-SOUNDBAR-HS2100", "Hisense HS2100 Soundbar", "Sound systems"],
  ["SONY-MHC-V13", "Sony MHC-V13 High Power Audio System", "Sound systems"],
  ["JBL-PARTYBOX-ENCORE", "JBL PartyBox Encore Essential", "Sound systems"],
  ["ORAIMO-SPACEBOX-PRO", "Oraimo SpaceBox Pro Speaker", "Sound systems"],
  ["ORAIMO-FREEPODS-LITE", "Oraimo FreePods Lite Earbuds", "Accessories"],
  ["ORAIMO-POWERBOX-20", "Oraimo PowerBox 20 Power Bank", "Accessories"],
  ["ANKER-POWERCORE-20K", "Anker 20,000mAh Power Bank", "Accessories"],
  ["SAM-ADAPTER-25W", "Samsung 25W USB-C Charger", "Accessories"],
  ["TP-LINK-ARCHER-C6", "TP-Link Archer C6 Wi-Fi Router", "Networking"],
  ["HP-15S-LAPTOP", "HP 15s Laptop", "Computers"],
  ["LENOVO-IDEAPAD-SLIM3", "Lenovo IdeaPad Slim 3 Laptop", "Computers"],
  ["VON-REFRIGERATOR-260L", "Von 260L Double-Door Refrigerator", "Appliances"],
  ["RAMTONS-MICROWAVE-20L", "Ramtons 20L Microwave Oven", "Appliances"],
];

let page = "dashboard";
let store = {
  version: 1,
  starter_catalogue_initialized: false,
  settings: { ...DEFAULT_SETTINGS },
  products: [],
  sales: [],
  movements: [],
};
let cart = [];
let reportMonth = localMonth();
let reportData = null;
let mobileNavOpen = false;
let productSearch = "";
let paymentMethod = "Cash";

function localDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Nairobi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date instanceof Date ? date : new Date(date));
  return {
    year: parts.find((part) => part.type === "year")?.value,
    month: parts.find((part) => part.type === "month")?.value,
    day: parts.find((part) => part.type === "day")?.value,
  };
}

function localMonth(date = new Date()) {
  const { year, month } = localDateParts(date);
  return `${year}-${month}`;
}

function localDay(date = new Date()) {
  const { year, month, day } = localDateParts(date);
  return `${year}-${month}-${day}`;
}

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function money(value) {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: store.settings.currency || "KES",
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

function persist(nextStore) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextStore));
  } catch (error) {
    console.error("Could not save shop data in this browser.", error);
    throw new Error("Could not save data in this browser. Download a backup or free some browser storage, then try again.");
  }
  store = nextStore;
}

function loadStore() {
  const saved = localStorage.getItem(STORAGE_KEY);
  const parsed = saved ? JSON.parse(saved) : null;
  if (parsed && (
    parsed.version !== 1 || !parsed.settings ||
    !Array.isArray(parsed.products) || !Array.isArray(parsed.sales) ||
    !Array.isArray(parsed.movements)
  )) {
    throw new Error("Saved shop data is invalid. Do not clear browser storage; restore a valid backup or contact support.");
  }
  const nextStore = {
    version: 1,
    starter_catalogue_initialized: parsed?.starter_catalogue_initialized === true,
    settings: { ...DEFAULT_SETTINGS, ...(parsed?.settings || {}) },
    products: (parsed?.products || []).map((product) => ({
      ...product,
      buying_price: Number(product.buying_price) || 0,
    })),
    sales: parsed?.sales || [],
    movements: parsed?.movements || [],
  };
  if (!nextStore.starter_catalogue_initialized) {
    if (nextStore.products.length === 0) {
      nextStore.products.push(...createStarterProducts());
    }
    nextStore.starter_catalogue_initialized = true;
    persist(nextStore);
  } else {
    store = nextStore;
  }
}

function createId() {
  return crypto.randomUUID();
}

function createStarterProducts() {
  const now = new Date().toISOString();
  return STARTER_PRODUCTS.map(([sku, name, category]) => ({
    id: createId(),
    sku,
    name,
    category,
    unit_price: 0,
    buying_price: 0,
    stock: 0,
    reorder_level: 0,
    created_at: now,
  }));
}

function navMarkup() {
  return navItems.map(([id, label, icon]) =>
    `<button class="nav-item${page === id ? " active" : ""}" data-action="navigate" data-page="${id}"><span class="nav-icon">${icon}</span>${label}</button>`
  ).join("");
}

function renderApp() {
  const currentTitle = navItems.find(([id]) => id === page)?.[1] || "Overview";
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand"><div class="brand-mark">B</div><div><span>Bethsaida Electronics</span><div class="brand-subtitle">POS &amp; INVENTORY</div></div></div>
        <div class="nav-label">Workspace</div>
        <nav class="nav-list">${navMarkup()}</nav>
        <div class="sidebar-bottom"><div class="workspace-label">SAVED ON THIS DEVICE</div><div class="user-name">${esc(store.settings.shop_name)}</div><div class="user-email">Local browser storage</div></div>
      </aside>
      <section class="main-area">
        <header class="topbar">
          <div class="breadcrumb"><button class="mobile-menu" data-action="mobile-nav" aria-label="Toggle navigation">☰</button><strong>${esc(currentTitle)}</strong></div>
          <div class="topbar-right"><span class="local-badge"><span></span>LOCAL ONLY</span><div class="today">${new Intl.DateTimeFormat("en-KE", { dateStyle: "full", timeZone: "Africa/Nairobi" }).format(new Date())}</div></div>
        </header>
        <nav class="mobile-nav${mobileNavOpen ? " open" : ""}">${navMarkup()}</nav>
        <main class="content">${renderPage()}</main>
      </section>
    </div>`;
}

function renderPage() {
  if (page === "inventory") return renderInventory();
  if (page === "pos") return renderPos();
  if (page === "reports") return renderReports();
  if (page === "settings") return renderSettings();
  return renderDashboard();
}

function renderDashboard() {
  const today = localDay();
  const sales = store.sales.filter((sale) => localDay(sale.created_at) === today)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const lowStock = store.products.filter((item) =>
    item.stock <= item.reorder_level && (Number(item.unit_price) > 0 || item.stock > 0)
  );
  const unitsSold = sales.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0);
  const revenue = sales.reduce((sum, sale) => sum + Number(sale.total), 0);
  const lowStockRows = lowStock.slice(0, 6).map((item) => `
    <tr><td><div class="product-main">${esc(item.name)}</div><div class="product-sub">${esc(item.sku)}</div></td>
    <td>${item.stock}</td><td>${item.reorder_level}</td><td>${item.stock === 0 ? '<span class="pill danger">Out of stock</span>' : '<span class="pill warning">Reorder</span>'}</td></tr>`).join("");
  const recentRows = sales.slice(0, 6).map((sale) => `
    <tr><td>${esc(sale.receipt_number)}</td><td>${dateTime(sale.created_at)}</td><td>Retail</td><td>${esc(sale.payment_method)}</td><td>${money(sale.total)}</td></tr>`).join("");
  const hour = Number(new Intl.DateTimeFormat("en", { hour: "numeric", hourCycle: "h23", timeZone: "Africa/Nairobi" }).format(new Date()));
  const greeting = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  return `
    <div class="page-heading"><div><div class="eyebrow">${new Intl.DateTimeFormat("en-KE", { weekday: "long", month: "long", day: "numeric", timeZone: "Africa/Nairobi" }).format(new Date()).toUpperCase()}</div><h1>Good ${greeting}, ${esc(store.settings.shop_name.split(" ")[0])}</h1><p>Here’s what’s happening at your counter today.</p></div><div class="heading-actions"><button class="secondary" data-action="navigate" data-page="reports">Monthly report</button><button class="primary" data-action="navigate" data-page="pos">＋ New sale</button></div></div>
    <div class="notice local-notice">Your products and sales are saved only in this browser on this device. Download regular backups in Settings.</div>
    <section class="stats-grid">
      <article class="stat-card"><div class="stat-top">Today’s sales<span class="stat-icon">↗</span></div><div class="stat-value">${money(revenue)}</div><div class="stat-caption">Completed transactions</div></article>
      <article class="stat-card"><div class="stat-top">Items sold today<span class="stat-icon">▤</span></div><div class="stat-value">${unitsSold.toLocaleString("en-KE")}</div><div class="stat-caption">Across all sales</div></article>
      <article class="stat-card"><div class="stat-top">Products in stock<span class="stat-icon">▦</span></div><div class="stat-value">${store.products.reduce((sum, item) => sum + item.stock, 0).toLocaleString("en-KE")}</div><div class="stat-caption">Across ${store.products.length} products</div></article>
      <article class="stat-card"><div class="stat-top">Low stock<span class="stat-icon">!</span></div><div class="stat-value">${lowStock.length}</div><div class="stat-caption">At or below reorder point</div></article>
    </section>
    <section class="dashboard-grid">
      <article class="panel"><div class="panel-heading"><div><h2>Sales today</h2><div class="subtle">Completed counter transactions</div></div><button class="text-button" data-action="navigate" data-page="pos">Open checkout →</button></div>
        <div class="table-wrap"><table><thead><tr><th>Receipt</th><th>Time</th><th>Type</th><th>Payment</th><th>Total</th></tr></thead><tbody>${recentRows || '<tr><td colspan="5" class="empty-state">No sales yet. Your completed sales will appear here.</td></tr>'}</tbody></table></div>
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
  const filtered = store.products.filter((item) => `${item.name} ${item.sku} ${item.category || ""}`.toLowerCase().includes(productSearch.toLowerCase()));
  const rows = filtered.map((item) => `
    <tr><td><div class="product-main">${esc(item.name)}</div><div class="product-sub">${esc(item.category || "Uncategorised")}</div></td>
      <td>${esc(item.sku)}</td><td>${money(item.buying_price || 0)}</td><td>${Number(item.unit_price) > 0 ? money(item.unit_price) : '<span class="pill warning">Set price</span>'}</td><td><span class="pill${item.stock === 0 ? " danger" : item.stock <= item.reorder_level ? " warning" : ""}">${item.stock === 0 ? "Out of stock" : `${item.stock} units`}</span></td>
      <td>${item.reorder_level}</td><td><div class="inventory-actions"><button class="secondary" data-action="adjust-stock" data-id="${item.id}">Adjust stock</button><button class="secondary" data-action="edit-product" data-id="${item.id}">Edit</button>${item.stock > 0 ? `<button class="secondary" data-action="clear-stock" data-id="${item.id}">Clear stock</button>` : ""}<button class="danger-button" data-action="delete-product" data-id="${item.id}">Delete product</button></div></td></tr>`).join("");
  return `
    <div class="page-heading"><div><h1>Inventory</h1><p>Manage products, prices, and available stock.</p></div><div class="heading-actions"><button class="secondary" data-action="add-starter-products">Add popular products</button><button class="primary" data-action="add-product">＋ Add product</button></div></div>
    <div class="notice">Buying price shows the cost from the latest restock. Selling price is your usual asking price; you can change the agreed price for each sale at checkout.</div>
    <section class="panel">
      <div class="toolbar"><div class="search-box"><span>⌕</span><input id="product-search" type="search" placeholder="Search by product, SKU or category" value="${esc(productSearch)}"></div><span class="subtle">${filtered.length} of ${store.products.length} products</span></div>
      <div class="table-wrap"><table><thead><tr><th>Product</th><th>SKU</th><th>Buying price</th><th>Selling price</th><th>Stock</th><th>Alert level</th><th>Actions</th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="empty-state">No products found. Add your first product to get started.</td></tr>'}</tbody></table></div>
    </section>`;
}

function renderPos() {
  const available = store.products.filter((item) => `${item.name} ${item.sku}`.toLowerCase().includes(productSearch.toLowerCase()));
  const catalog = available.map((item) => {
    const needsPrice = Number(item.unit_price) <= 0;
    const outOfStock = item.stock <= 0;
    const status = needsPrice ? "Set price in inventory" : outOfStock ? "Out of stock" : `${item.stock} in stock`;
    return `<button class="pos-product" data-action="add-to-cart" data-id="${item.id}" ${outOfStock ? "disabled" : ""}><div class="product-main">${esc(item.name)}</div><div class="product-sub">${esc(item.sku)} · ${outOfStock ? status : needsPrice ? "Enter agreed price in sale" : status}</div><div class="pos-price">${needsPrice ? "Set price at checkout" : money(item.unit_price)}</div></button>`;
  }).join("");
  const cartMarkup = cart.map((entry) => `<div class="cart-row"><div><div class="cart-name">${esc(entry.product.name)}</div><label class="cart-price">Agreed selling price (${esc(store.settings.currency)})<input type="number" min="0.01" step="0.01" required data-sale-price-for="${entry.product.id}" value="${entry.sale_price || ""}" aria-label="Agreed selling price for ${esc(entry.product.name)}"></label></div><div class="cart-quantity"><div class="quantity-control"><button data-action="cart-minus" data-id="${entry.product.id}" aria-label="Decrease quantity">−</button><span>${entry.quantity}</span><button data-action="cart-plus" data-id="${entry.product.id}" aria-label="Increase quantity">+</button></div><div class="cart-line">${money(entry.quantity * entry.sale_price)}</div></div></div>`).join("");
  const total = cart.reduce((sum, entry) => sum + entry.quantity * Number(entry.sale_price), 0);
  return `
    <div class="page-heading"><div><h1>Checkout</h1><p>Add products to a sale and complete checkout.</p></div></div>
    <div class="pos-layout">
      <section class="panel"><div class="toolbar"><div class="search-box"><span>⌕</span><input id="product-search" type="search" placeholder="Find a product…" value="${esc(productSearch)}"></div><span class="subtle">${available.length} products</span></div><div class="product-grid">${catalog || '<div class="empty-state">No products available. Add products in Inventory first.</div>'}</div></section>
      <section class="panel"><div class="panel-heading"><div><h2>Current sale</h2><div class="subtle">${cart.length} item type${cart.length === 1 ? "" : "s"}</div></div><button class="text-button" data-action="clear-cart">Clear</button></div>
        ${cartMarkup || '<div class="empty-state">Your sale is empty.<br>Choose products to add them here.</div>'}
        <div class="field"><label for="payment-method">Payment method</label><select id="payment-method"><option ${paymentMethod === "Cash" ? "selected" : ""}>Cash</option><option ${paymentMethod === "M-Pesa" ? "selected" : ""}>M-Pesa</option><option ${paymentMethod === "Card" ? "selected" : ""}>Card</option><option ${paymentMethod === "Other" ? "selected" : ""}>Other</option></select></div>
        <div class="cart-total"><span>Total due</span><strong id="cart-total-value">${money(total)}</strong></div>
        <button id="checkout-button" class="primary wide" data-action="checkout" ${cart.length === 0 ? "disabled" : ""}>Complete sale · ${money(total)}</button>
      </section>
    </div>`;
}

function makeReport(month) {
  const sales = store.sales.filter((sale) => localMonth(sale.created_at) === month)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const lines = sales.flatMap((sale) => sale.items.map((item) => ({
    ...item,
    created_at: sale.created_at,
    receipt_number: sale.receipt_number,
    payment_method: sale.payment_method,
  })));
  return {
    sales,
    lines,
    revenue: sales.reduce((sum, sale) => sum + Number(sale.total), 0),
    units: lines.reduce((sum, item) => sum + Number(item.quantity), 0),
  };
}

function renderReports() {
  reportData = makeReport(reportMonth);
  const saleRows = reportData.sales.map((sale) => {
    const items = sale.items.map((item) => `${esc(item.product_name)} × ${item.quantity} @ ${money(item.unit_price)} = ${money(item.line_total)}`).join("<br>");
    const units = sale.items.reduce((sum, item) => sum + item.quantity, 0);
    return `<tr><td>${dateTime(sale.created_at)}</td><td>${esc(sale.receipt_number)}</td><td>${items}</td><td>${units}</td><td>${money(sale.total)}</td><td><button class="danger-button" data-action="delete-sale" data-id="${sale.id}">Delete sale</button></td></tr>`;
  }).join("");
  const summary = `
    <div class="report-summary">
      <div class="report-card"><span>Sales revenue</span><strong>${money(reportData.revenue)}</strong></div>
      <div class="report-card"><span>Transactions</span><strong>${reportData.sales.length.toLocaleString("en-KE")}</strong></div>
      <div class="report-card"><span>Units sold</span><strong>${reportData.units.toLocaleString("en-KE")}</strong></div>
    </div>
    <section class="panel"><div class="panel-heading"><div><h2>Sales detail</h2><div class="subtle">Line items for the selected month</div></div></div>
      <div class="table-wrap"><table><thead><tr><th>Date & time</th><th>Receipt</th><th>Items</th><th>Qty</th><th>Total</th><th>Actions</th></tr></thead><tbody>${saleRows || '<tr><td colspan="6" class="empty-state">No sales recorded for this month.</td></tr>'}</tbody></table></div>
    </section>`;
  return `
    <div class="page-heading"><div><h1>Reports</h1><p>Review monthly sales and download a spreadsheet for your records.</p></div></div>
    <section class="panel" style="margin-bottom:16px">
      <div class="toolbar"><div><label class="subtle" for="report-month">Report month</label><br><input id="report-month" type="month" value="${esc(reportMonth)}"></div><button class="primary" data-action="download-report">↓ Download CSV</button></div>
    </section>
    ${summary}`;
}

function renderSettings() {
  return `
    <div class="page-heading"><div><h1>Settings</h1><p>Manage the shop profile and protect your local data.</p></div></div>
    <section class="panel settings-panel">
      <div class="panel-heading"><div><h2>Shop profile</h2><div class="subtle">Used on your dashboard and reports</div></div></div>
      <form id="settings-form">
        <div class="form-grid">
          <div class="field"><label for="settings-shop-name">Shop name</label><input id="settings-shop-name" name="shop_name" maxlength="100" required value="${esc(store.settings.shop_name)}"></div>
          <div class="field"><label for="settings-currency">Currency</label><select id="settings-currency" name="currency"><option value="KES" ${store.settings.currency === "KES" ? "selected" : ""}>KES — Kenyan shilling</option><option value="USD" ${store.settings.currency === "USD" ? "selected" : ""}>USD — US dollar</option><option value="EUR" ${store.settings.currency === "EUR" ? "selected" : ""}>EUR — Euro</option><option value="GBP" ${store.settings.currency === "GBP" ? "selected" : ""}>GBP — Pound sterling</option></select></div>
        </div>
        <div class="notice warning-note">This app stores data in this browser only. It does not sync to other devices, and clearing browser data can erase your shop records. Download backups regularly.</div>
        <button class="primary" type="submit">Save settings</button>
      </form>
    </section>
    <section class="panel settings-panel" style="margin-top:16px">
      <div class="panel-heading"><div><h2>Data backup</h2><div class="subtle">Export or restore your products, sales, and stock history</div></div></div>
      <div class="heading-actions"><button class="secondary" data-action="export-backup">↓ Download backup</button><button class="secondary" data-action="choose-backup">↑ Restore backup</button><input id="backup-file" type="file" accept="application/json,.json" hidden></div>
      <p class="subtle">Keep backup files private because they contain your shop’s sales and inventory information.</p>
    </section>
    <section class="panel settings-panel" style="margin-top:16px">
      <div class="panel-heading"><div><h2>Monthly email reports</h2></div></div>
      <p class="subtle">Automatic email delivery requires a server-side email service. In browser-only mode, download the CSV from Reports and attach it to an email yourself.</p>
    </section>`;
}

function openModal(title, body) {
  const wrapper = document.createElement("div");
  wrapper.className = "modal-backdrop";
  wrapper.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-title"><h2>${esc(title)}</h2><button class="icon-button" data-action="close-modal" aria-label="Close">×</button></div><form id="modal-form">${body}<div class="modal-actions"><button class="secondary" type="button" data-action="close-modal">Cancel</button><button class="primary" type="submit">Save</button></div></form></section>`;
  app.append(wrapper);
}

function closeModal() {
  document.querySelector(".modal-backdrop")?.remove();
}

function showProductModal(product = null) {
  const body = `<div class="form-grid">
    <div class="field"><label for="product-sku">SKU</label><input id="product-sku" name="sku" required maxlength="60" value="${esc(product?.sku || "")}" placeholder="e.g. PHONE-001"></div>
    <div class="field"><label for="product-name">Product name</label><input id="product-name" name="name" required maxlength="120" value="${esc(product?.name || "")}"></div>
    <div class="field"><label for="product-category">Category</label><input id="product-category" name="category" maxlength="80" value="${esc(product?.category || "")}" placeholder="Phones, accessories…"></div>
    <div class="field"><label for="product-price">Usual selling price (${esc(store.settings.currency)})</label><input id="product-price" name="unit_price" type="number" min="0" step="0.01" required value="${esc(product?.unit_price ?? "")}"></div>
    ${product ? "" : `<div class="field"><label for="product-stock">Opening stock</label><input id="product-stock" name="initial_stock" type="number" min="0" step="1" required value="0"></div><div class="field"><label for="product-buying-price">Buying price per unit (${esc(store.settings.currency)})</label><input id="product-buying-price" name="buying_price" type="number" min="0" step="0.01" value="0"><span class="subtle">Required when opening stock is above zero.</span></div>`}
    <div class="field"><label for="product-reorder">Low-stock alert level</label><input id="product-reorder" name="reorder_level" type="number" min="0" step="1" required value="${esc(product?.reorder_level ?? 5)}"></div>
  </div>${product ? '<p class="subtle">Use “Adjust stock” to receive or remove units. Stock cannot be edited here.</p>' : ""}`;
  openModal(product ? "Edit product" : "Add product", body);
  document.querySelector("#modal-form").dataset.productId = product?.id || "";
}

function showStockModal(product) {
  openModal("Adjust stock", `<p class="subtle">${esc(product.name)} · Current stock: <strong>${product.stock}</strong></p>
    <div class="field"><label for="stock-delta">Quantity change</label><input id="stock-delta" name="delta" type="number" step="1" required placeholder="Use a positive number to receive stock"></div>
    <div class="field"><label for="stock-buying-price">Buying price per unit (${esc(store.settings.currency)})</label><input id="stock-buying-price" name="buying_price" type="number" min="0" step="0.01" placeholder="Required when receiving stock"><span class="subtle">Recorded as the cost for this restock. Only applies to added units.</span></div>
    <div class="field"><label for="stock-reason">Reason</label><select id="stock-reason" name="reason" required><option value="Restock">Restock / delivery</option><option value="Correction">Stock correction</option><option value="Return">Customer return</option><option value="Damaged">Damaged / write-off</option></select></div>
    <p class="subtle">Enter a negative number to reduce stock. Stock cannot go below zero.</p>`);
  document.querySelector("#modal-form").dataset.productId = product.id;
}

function downloadFile(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadReport() {
  const lines = makeReport(reportMonth).lines;
  const columns = ["Date/time", "Receipt", "Payment method", "Product", "SKU", "Quantity", "Unit price", "Line total"];
  const records = lines.map((line) => [
    new Date(line.created_at).toISOString(), line.receipt_number, line.payment_method,
    line.product_name, line.sku || "", line.quantity,
    Number(line.unit_price).toFixed(2), Number(line.line_total).toFixed(2),
  ]);
  const csv = [columns, ...records].map((row) => row.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  downloadFile(`sales-report-${reportMonth}.csv`, `\uFEFF${csv}`, "text/csv;charset=utf-8");
}

function exportBackup() {
  const backup = { ...store, exported_at: new Date().toISOString() };
  downloadFile(`bethsaida-backup-${localDay()}.json`, JSON.stringify(backup, null, 2), "application/json");
}

function validateBackup(value) {
  if (
    !value || value.version !== 1 || !value.settings ||
    !Array.isArray(value.products) || !Array.isArray(value.sales) ||
    !Array.isArray(value.movements)
  ) throw new Error("This file is not a valid Bethsaida backup.");
  const productIds = new Set();
  for (const product of value.products) {
    if (
      typeof product.id !== "string" || productIds.has(product.id) ||
      typeof product.sku !== "string" || typeof product.name !== "string" ||
      !Number.isFinite(Number(product.unit_price)) ||
      (product.buying_price !== undefined && (!Number.isFinite(Number(product.buying_price)) || Number(product.buying_price) < 0)) ||
      !Number.isInteger(product.stock) || product.stock < 0 ||
      !Number.isInteger(product.reorder_level) || product.reorder_level < 0
    ) throw new Error("Backup contains an invalid product record.");
    productIds.add(product.id);
  }
  for (const sale of value.sales) {
    if (
      typeof sale.receipt_number !== "string" || !Array.isArray(sale.items) ||
      !sale.items.every((item) => Number.isInteger(item.quantity) && item.quantity > 0)
    ) throw new Error("Backup contains an invalid sales record.");
  }
  return {
    version: 1,
    starter_catalogue_initialized: true,
    settings: { ...DEFAULT_SETTINGS, ...value.settings },
    products: value.products.map((product) => ({ ...product, buying_price: Number(product.buying_price) || 0 })),
    sales: value.sales,
    movements: value.movements,
  };
}

function checkout() {
  if (!cart.length) return;
  const next = structuredClone(store);
  const saleItems = [];
  for (const entry of cart) {
    const product = next.products.find((item) => item.id === entry.product.id);
    if (!product || product.stock < entry.quantity) {
      throw new Error(`Not enough stock for ${entry.product.name}. Review the quantity and try again.`);
    }
    if (!Number.isFinite(Number(entry.sale_price)) || Number(entry.sale_price) <= 0) {
      throw new Error(`Enter the agreed selling price for ${entry.product.name} before completing the sale.`);
    }
    product.stock -= entry.quantity;
    const lineTotal = Number((entry.quantity * Number(entry.sale_price)).toFixed(2));
    saleItems.push({
      product_id: product.id,
      sku: product.sku,
      product_name: product.name,
      quantity: entry.quantity,
      unit_price: Number(entry.sale_price),
      line_total: lineTotal,
    });
  }
  const now = new Date().toISOString();
  const receipt = `BE-${localDay().replace(/-/g, "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const total = Number(saleItems.reduce((sum, item) => sum + item.line_total, 0).toFixed(2));
  next.sales.push({
    id: createId(),
    receipt_number: receipt,
    total,
    payment_method: paymentMethod,
    created_at: now,
    items: saleItems,
  });
  for (const item of saleItems) {
    next.movements.push({
      id: createId(), product_id: item.product_id, sku: item.sku,
      product_name: item.product_name, quantity_change: -item.quantity,
      reason: `Sale ${receipt}`, created_at: now,
    });
  }
  persist(next);
  cart = [];
  renderApp();
  toast(`Sale completed. Receipt ${receipt}.`);
}

function clearProductStock(productId) {
  const product = store.products.find((item) => item.id === productId);
  if (!product || product.stock <= 0) return;
  if (!window.confirm(`Clear all ${product.stock} units of ${product.name} from stock? This will not delete any sales.`)) return;
  const next = structuredClone(store);
  const target = next.products.find((item) => item.id === productId);
  const clearedQuantity = target.stock;
  target.stock = 0;
  next.movements.push({
    id: createId(),
    product_id: target.id,
    sku: target.sku,
    product_name: target.name,
    quantity_change: -clearedQuantity,
    reason: "Stock cleared",
    created_at: new Date().toISOString(),
  });
  persist(next);
  renderApp();
  toast(`${product.name} stock cleared.`);
}

function deleteProduct(productId) {
  const product = store.products.find((item) => item.id === productId);
  if (!product) return;
  const warning = product.stock > 0 ? ` This also removes its ${product.stock} units from inventory.` : "";
  if (!window.confirm(`Delete ${product.name}? This cannot be undone.${warning} Existing sales and stock history will remain in reports/history.`)) return;
  const next = structuredClone(store);
  next.products = next.products.filter((item) => item.id !== productId);
  persist(next);
  cart = cart.filter((item) => item.product.id !== productId);
  renderApp();
  toast(`${product.name} deleted.`);
}

function deleteSale(saleId) {
  const sale = store.sales.find((item) => item.id === saleId);
  if (!sale) return;
  if (!window.confirm(`Delete sale ${sale.receipt_number} (${money(sale.total)})? This removes it from reports and restores sold quantities for products still in inventory.`)) return;
  const next = structuredClone(store);
  const deletedSale = next.sales.find((item) => item.id === saleId);
  const now = new Date().toISOString();
  for (const line of deletedSale.items) {
    const product = next.products.find((item) => item.id === line.product_id);
    if (!product) continue;
    product.stock += line.quantity;
    next.movements.push({
      id: createId(),
      product_id: product.id,
      sku: product.sku,
      product_name: product.name,
      quantity_change: line.quantity,
      reason: `Sale deleted ${deletedSale.receipt_number}`,
      created_at: now,
    });
  }
  next.sales = next.sales.filter((item) => item.id !== saleId);
  persist(next);
  renderApp();
  toast(`Sale ${sale.receipt_number} deleted and stock restored where possible.`);
}

app.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.target;
  const values = Object.fromEntries(new FormData(form));
  try {
    if (form.id === "settings-form") {
      const next = structuredClone(store);
      next.settings = {
        shop_name: String(values.shop_name).trim(),
        currency: String(values.currency),
      };
      persist(next);
      renderApp();
      toast("Shop settings saved.");
      return;
    }
    if (form.id !== "modal-form") return;
    const productId = form.dataset.productId;
    const next = structuredClone(store);
    if (productId && values.delta !== undefined) {
      const delta = Number(values.delta);
      if (!Number.isInteger(delta) || delta === 0) throw new Error("Enter a non-zero whole number.");
      const product = next.products.find((item) => item.id === productId);
      if (!product) throw new Error("Product not found.");
      if (product.stock + delta < 0) throw new Error("Stock cannot be reduced below zero.");
      let buyingPrice;
      if (delta > 0) {
        if (values.buying_price === "") throw new Error("Enter the buying price per unit for this restock.");
        buyingPrice = Number(values.buying_price);
        if (!Number.isFinite(buyingPrice) || buyingPrice < 0) throw new Error("Enter a valid non-negative buying price.");
        product.buying_price = buyingPrice;
      }
      product.stock += delta;
      next.movements.push({
        id: createId(), product_id: product.id, sku: product.sku, product_name: product.name,
        quantity_change: delta, reason: String(values.reason), ...(delta > 0 ? { unit_cost: buyingPrice } : {}),
        created_at: new Date().toISOString(),
      });
      persist(next);
      closeModal();
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
    if (!fields.sku || !fields.name) throw new Error("SKU and product name are required.");
    if (next.products.some((item) => item.sku.toLowerCase() === fields.sku.toLowerCase() && item.id !== productId)) {
      throw new Error("A product with this SKU already exists.");
    }
    if (!Number.isFinite(fields.unit_price) || fields.unit_price < 0 || !Number.isInteger(fields.reorder_level) || fields.reorder_level < 0) {
      throw new Error("Enter a valid price and whole-number alert level.");
    }
    if (productId) {
      const product = next.products.find((item) => item.id === productId);
      if (!product) throw new Error("Product not found.");
      Object.assign(product, fields, { updated_at: new Date().toISOString() });
    } else {
      const initialStock = Number(values.initial_stock);
      if (!Number.isInteger(initialStock) || initialStock < 0) throw new Error("Opening stock must be a non-negative whole number.");
      if (initialStock > 0 && values.buying_price === "") throw new Error("Enter the buying price per unit for the opening stock.");
      const buyingPrice = values.buying_price === "" ? 0 : Number(values.buying_price);
      if (!Number.isFinite(buyingPrice) || buyingPrice < 0) throw new Error("Enter a valid non-negative buying price.");
      const product = { id: createId(), ...fields, buying_price: buyingPrice, stock: initialStock, created_at: new Date().toISOString() };
      next.products.push(product);
      if (initialStock > 0) next.movements.push({
        id: createId(), product_id: product.id, sku: product.sku, product_name: product.name,
        quantity_change: initialStock, unit_cost: buyingPrice, reason: "Opening stock", created_at: product.created_at,
      });
    }
    persist(next);
    closeModal();
    renderApp();
    toast(productId ? "Product updated." : "Product added.");
  } catch (error) {
    reportError(error);
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
  if (event.target.matches("[data-sale-price-for]")) {
    const input = event.target;
    const entry = cart.find((item) => item.product.id === input.dataset.salePriceFor);
    const price = Number(input.value);
    if (!entry) return;
    if (input.value === "" || !Number.isFinite(price) || price <= 0 || !input.validity.valid) {
      reportError(new Error("Enter an agreed selling price greater than zero."));
      input.value = entry.sale_price > 0 ? String(entry.sale_price) : "";
      return;
    }
    entry.sale_price = price;
    input.closest(".cart-row").querySelector(".cart-line").textContent = money(entry.quantity * price);
    const total = cart.reduce((sum, item) => sum + item.quantity * Number(item.sale_price), 0);
    document.querySelector("#cart-total-value").textContent = money(total);
    document.querySelector("#checkout-button").textContent = `Complete sale · ${money(total)}`;
  } else if (event.target.id === "report-month") {
    reportMonth = event.target.value || localMonth();
    renderApp();
  } else if (event.target.id === "payment-method") {
    paymentMethod = event.target.value;
  } else if (event.target.id === "backup-file") {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = validateBackup(JSON.parse(await file.text()));
      if (!window.confirm("Restoring a backup replaces the shop data currently saved in this browser. Download a backup first if you want to keep it. Continue?")) return;
      persist(imported);
      cart = [];
      renderApp();
      toast("Backup restored.");
    } catch (error) {
      reportError(error);
    } finally {
      event.target.value = "";
    }
  }
});

app.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const { action, id } = button.dataset;
  try {
    if (action === "mobile-nav") {
      mobileNavOpen = !mobileNavOpen;
      renderApp();
    } else if (action === "navigate") {
      page = button.dataset.page;
      mobileNavOpen = false;
      productSearch = "";
      renderApp();
    } else if (action === "add-product") {
      showProductModal();
    } else if (action === "add-starter-products") {
      const knownSkus = new Set(store.products.map((product) => product.sku.toLowerCase()));
      const additions = STARTER_PRODUCTS.filter(([sku]) => !knownSkus.has(sku.toLowerCase()));
      if (!additions.length) {
        toast("The starter products are already in your inventory.");
        return;
      }
      if (!window.confirm(`Add ${additions.length} popular electronics products? Prices and stock will be set to 0 for you to fill in. Existing products and sales will not be changed.`)) return;
      const next = structuredClone(store);
      const additionSkus = new Set(additions.map(([sku]) => sku.toLowerCase()));
      next.products.push(...createStarterProducts().filter((product) => additionSkus.has(product.sku.toLowerCase())));
      next.starter_catalogue_initialized = true;
      persist(next);
      renderApp();
      toast(`${additions.length} starter products added. Set each selling price and stock in inventory.`);
    } else if (action === "edit-product") {
      const product = store.products.find((item) => item.id === id);
      if (product) showProductModal(product);
    } else if (action === "adjust-stock") {
      const product = store.products.find((item) => item.id === id);
      if (product) showStockModal(product);
    } else if (action === "clear-stock") {
      clearProductStock(id);
    } else if (action === "delete-product") {
      deleteProduct(id);
    } else if (action === "delete-sale") {
      deleteSale(id);
    } else if (action === "add-to-cart") {
      const product = store.products.find((item) => item.id === id);
      const line = cart.find((entry) => entry.product.id === id);
      if (product && (line?.quantity || 0) < product.stock) {
        if (line) line.quantity += 1;
        else cart.push({ product: { ...product }, quantity: 1, sale_price: Number(product.unit_price) || 0 });
        renderApp();
      } else if (product) toast("There is not enough stock to add another unit.", true);
    } else if (action === "cart-minus" || action === "cart-plus") {
      const line = cart.find((entry) => entry.product.id === id);
      const product = store.products.find((item) => item.id === id);
      if (line && action === "cart-minus") line.quantity -= 1;
      if (line && action === "cart-plus" && product && line.quantity < product.stock) line.quantity += 1;
      if (line && line.quantity <= 0) cart = cart.filter((entry) => entry.product.id !== id);
      renderApp();
    } else if (action === "clear-cart") {
      cart = [];
      renderApp();
    } else if (action === "checkout") {
      checkout();
    } else if (action === "download-report") {
      downloadReport();
    } else if (action === "export-backup") {
      exportBackup();
    } else if (action === "choose-backup") {
      document.querySelector("#backup-file")?.click();
    } else if (action === "close-modal") {
      closeModal();
    }
  } catch (error) {
    reportError(error);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeModal();
});

try {
  loadStore();
  renderApp();
} catch (error) {
  console.error(error);
  app.innerHTML = `<section class="auth-screen"><div class="auth-card"><div class="auth-brand"><div class="brand-mark">B</div><span>Bethsaida Electronics</span></div><h1>Could not load shop data</h1><p class="subtle">${esc(error.message)}</p><p class="subtle">Do not clear browser storage until you have checked for a backup.</p></div></section>`;
}
