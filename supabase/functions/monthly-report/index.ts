import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const encoder = new TextEncoder();

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function htmlEscape(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function base64(value: string): string {
  const bytes = encoder.encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function nairobiMonth(date: Date): { year: number; month: number; day: number } {
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

function monthUtcBoundary(year: number, month: number): string {
  return new Date(Date.UTC(year, month - 1, 1) - 3 * 60 * 60 * 1000).toISOString();
}

async function fetchAll<T>(
  queryFactory: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await queryFactory(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const expectedSecret = Deno.env.get("MONTHLY_REPORT_SECRET");
  if (!expectedSecret || request.headers.get("x-monthly-report-secret") !== expectedSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  const now = new Date();
  const { year, month, day } = nairobiMonth(now);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day !== lastDay) {
    return Response.json({ status: "skipped", reason: "Not the last day of the month in Africa/Nairobi." });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const sender = Deno.env.get("REPORT_FROM_EMAIL");
  if (!supabaseUrl || !serviceRoleKey || !resendApiKey || !sender) {
    console.error("Missing required monthly report function configuration.");
    return new Response("Monthly report email is not configured.", { status: 500 });
  }

  const client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const start = monthUtcBoundary(year, month);
  const end = monthUtcBoundary(year, month + 1);
  const { data: shops, error: shopsError } = await client
    .from("shop_settings")
    .select("owner_id, shop_name, report_email, currency")
    .not("report_email", "is", null);

  if (shopsError) {
    console.error("Could not load monthly report recipients.", shopsError.message);
    return new Response("Could not load report recipients.", { status: 500 });
  }

  const errors: string[] = [];
  let sent = 0;
  for (const shop of shops || []) {
    if (!shop.report_email) continue;
    try {
      const sales = await fetchAll((from, to) => client
        .from("sales")
        .select("id, receipt_number, total, created_at")
        .eq("owner_id", shop.owner_id)
        .gte("created_at", start)
        .lt("created_at", end)
        .order("created_at", { ascending: true })
        .range(from, to));
      const saleIds = sales.map((sale) => sale.id);
      const salesById = new Map(sales.map((sale) => [sale.id, sale]));
      const items: Array<{
        sale_id: string;
        sku: string;
        product_name: string;
        quantity: number;
        unit_price: number;
        line_total: number;
      }> = [];
      for (let index = 0; index < saleIds.length; index += 100) {
        const { data, error } = await client
          .from("sale_items")
          .select("sale_id, sku, product_name, quantity, unit_price, line_total")
          .eq("owner_id", shop.owner_id)
          .in("sale_id", saleIds.slice(index, index + 100));
        if (error) throw new Error(error.message);
        items.push(...(data || []));
      }

      const revenue = sales.reduce((sum, sale) => sum + Number(sale.total), 0);
      const units = items.reduce((sum, item) => sum + Number(item.quantity), 0);
      const rows = [
        ["Date/time", "Receipt", "Product", "SKU", "Quantity", "Unit price", "Line total"],
        ...items.map((item) => {
          const sale = salesById.get(item.sale_id);
          return [
            sale?.created_at || "",
            sale?.receipt_number || "",
            item.product_name,
            item.sku,
            item.quantity,
            Number(item.unit_price).toFixed(2),
            Number(item.line_total).toFixed(2),
          ];
        }),
      ];
      const csv = "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
      const monthLabel = new Intl.DateTimeFormat("en-KE", {
        month: "long",
        year: "numeric",
        timeZone: "Africa/Nairobi",
      }).format(new Date(Date.UTC(year, month - 1, 15)));
      const currency = shop.currency || "KES";
      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: sender,
          to: [shop.report_email],
          subject: `${shop.shop_name} — ${monthLabel} sales report`,
          html: `<div style="font-family:Arial,sans-serif;color:#17251f;max-width:600px;margin:auto">
            <h1 style="font-size:22px">${htmlEscape(shop.shop_name)} monthly report</h1>
            <p style="color:#66736b">${htmlEscape(monthLabel)}</p>
            <table style="width:100%;border-collapse:collapse;margin:24px 0">
              <tr><td style="padding:12px;border-bottom:1px solid #e6eae6">Sales revenue</td><td style="padding:12px;border-bottom:1px solid #e6eae6;text-align:right"><strong>${htmlEscape(formatMoney(revenue, currency))}</strong></td></tr>
              <tr><td style="padding:12px;border-bottom:1px solid #e6eae6">Transactions</td><td style="padding:12px;border-bottom:1px solid #e6eae6;text-align:right"><strong>${sales.length}</strong></td></tr>
              <tr><td style="padding:12px;border-bottom:1px solid #e6eae6">Units sold</td><td style="padding:12px;border-bottom:1px solid #e6eae6;text-align:right"><strong>${units}</strong></td></tr>
            </table>
            <p>The attached CSV contains the month’s sale line items.</p>
          </div>`,
          attachments: [{
            filename: `sales-report-${year}-${String(month).padStart(2, "0")}.csv`,
            content: base64(csv),
          }],
        }),
      });

      if (!emailResponse.ok) {
        const responseBody = await emailResponse.text();
        throw new Error(`Email provider returned ${emailResponse.status}: ${responseBody}`);
      }
      sent += 1;
    } catch (error) {
      console.error(`Failed to send report for shop ${shop.owner_id}.`, error);
      errors.push(shop.owner_id);
    }
  }

  if (errors.length) {
    return Response.json({ status: "partial_failure", sent, failed: errors.length }, { status: 500 });
  }
  return Response.json({ status: "complete", sent, month: `${year}-${String(month).padStart(2, "0")}` });
});
