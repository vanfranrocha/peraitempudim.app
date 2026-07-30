import "@supabase/functions-js/edge-runtime.d.ts";

type WebhookPayload = {
  type?: "INSERT" | "UPDATE";
  table?: "orders" | "checkout_sessions";
  schema?: "public";
  record?: Record<string, unknown>;
  old_record?: Record<string, unknown> | null;
};

const jsonHeaders = { "Content-Type": "application/json" };

function asText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: unknown) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(asNumber(value));
}

function formatPhone(value: unknown) {
  const digits = asText(value).replace(/\D/g, "");
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return asText(value, "Não informado");
}

function formatOrderType(value: unknown) {
  if (value === "ready_delivery" || value === "ready") return "Pronta entrega";
  if (value === "scheduled") return "Encomenda";
  return "Não informado";
}

function formatFulfillment(value: unknown) {
  if (value === "delivery") return "Entrega";
  if (value === "pickup") return "Retirada";
  return "Não informado";
}

function formatProductKey(productKey: unknown) {
  const key = asText(productKey);
  if (!key) return "Pudim";
  const flavor = key.includes("_cafe_") ? "Café" : "Tradicional";
  const variant = key.startsWith("zero_") ? "Zero lactose" : "Normal";
  const size = key.endsWith("180ml")
    ? "180 ml"
    : key.endsWith("500ml")
      ? "500 ml"
      : key.endsWith("1kg")
        ? "1 kg"
        : "";
  return `Pudim ${flavor} • ${variant}${size ? ` • ${size}` : ""}`;
}

function formatCartItems(record: Record<string, unknown>) {
  const cartItems = Array.isArray(record.cart_items) ? record.cart_items : [];
  if (!cartItems.length) return "Itens não informados";

  return cartItems.map((item) => {
    if (!item || typeof item !== "object") return "- Pudim";
    const current = item as Record<string, unknown>;
    const promo = current.promotion_applied ? " (promoção)" : "";
    return `- ${asNumber(current.quantity) || 1}x ${formatProductKey(current.product_key)}${promo}`;
  }).join("\n");
}

function buildOrderMessage(record: Record<string, unknown>) {
  const number = record.order_number ? `#${record.order_number}` : "novo";
  return [
    "🍮 Novo pedido recebido",
    "",
    `Pedido: ${number}`,
    `Cliente: ${asText(record.customer_name, "Não informado")}`,
    `Telefone: ${formatPhone(record.customer_phone)}`,
    `Tipo: ${formatOrderType(record.order_type)}`,
    `Recebimento: ${formatFulfillment(record.fulfillment_type)}`,
    `Data: ${asText(record.requested_date, "Não informada")}`,
    record.requested_time ? `Período: ${record.requested_time}` : "",
    "",
    `Produtos: ${formatCurrency(record.subtotal)}`,
    `Entrega: ${asNumber(record.delivery_fee) > 0 ? formatCurrency(record.delivery_fee) : "A confirmar/grátis"}`,
    `Total: ${formatCurrency(record.total)}`,
  ].filter(Boolean).join("\n");
}

function buildCheckoutMessage(record: Record<string, unknown>) {
  return [
    "🛒 Cliente chegou aos dados do pedido",
    "",
    `Cliente: ${asText(record.customer_name, "Nome não informado")}`,
    `Telefone: ${formatPhone(record.customer_phone)}`,
    `Tipo: ${formatOrderType(record.order_mode)}`,
    `Recebimento: ${formatFulfillment(record.fulfillment_type)}`,
    `Subtotal: ${formatCurrency(record.cart_subtotal)}`,
    "",
    formatCartItems(record),
  ].join("\n");
}

function buildTelegramMessage(payload: WebhookPayload) {
  const record = payload.record ?? {};
  if (payload.table === "orders") return buildOrderMessage(record);
  if (payload.table === "checkout_sessions") return buildCheckoutMessage(record);
  return "Evento recebido sem tabela reconhecida.";
}

async function markNotificationAsSent(payload: WebhookPayload) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey || !payload.record) {
    console.log("telegram-notify: notification sent, database mark skipped");
    return;
  }

  const now = new Date().toISOString();
  const table = payload.table;
  const headers = {
    ...jsonHeaders,
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Prefer: "return=minimal",
  };

  if (table === "orders") {
    const id = asText(payload.record.id);
    if (!id) return;
    await fetch(`${supabaseUrl}/rest/v1/orders?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ order_notification_sent_at: now }),
    });
    return;
  }

  if (table === "checkout_sessions") {
    const sessionId = asText(payload.record.session_id);
    if (!sessionId) return;
    await fetch(`${supabaseUrl}/rest/v1/checkout_sessions?session_id=eq.${encodeURIComponent(sessionId)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ details_notification_sent_at: now }),
    });
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405, headers: jsonHeaders });
  }

  const configuredSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  const receivedSecret = req.headers.get("x-webhook-secret");

  console.log("telegram-notify debug: receivedSecret exists:", Boolean(receivedSecret));
  console.log("telegram-notify debug: receivedSecret length:", receivedSecret?.length ?? 0);
  console.log("telegram-notify debug: vaultSecret exists:", Boolean(configuredSecret));
  console.log("telegram-notify debug: vaultSecret length:", configuredSecret?.length ?? 0);
  console.log(
    "telegram-notify debug: secretMatch:",
    Boolean(receivedSecret && configuredSecret && receivedSecret === configuredSecret),
  );

  if (!configuredSecret) {
    console.error("telegram-notify: TELEGRAM_WEBHOOK_SECRET is not configured");
    return Response.json({ error: "Webhook not configured" }, { status: 500, headers: jsonHeaders });
  }

  if (!receivedSecret) {
    console.warn("telegram-notify: webhook secret missing");
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: jsonHeaders });
  }

  if (receivedSecret !== configuredSecret) {
    console.warn("telegram-notify: webhook secret invalid");
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: jsonHeaders });
  }

  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_CHAT_ID");

  if (!botToken || !chatId) {
    console.error("telegram-notify: Telegram env vars are not configured");
    return Response.json({ error: "Telegram not configured" }, { status: 500, headers: jsonHeaders });
  }

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400, headers: jsonHeaders });
  }

  const text = buildTelegramMessage(payload);
  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    console.error("telegram-notify: Telegram API request failed", response.status);
    return Response.json({ error: "Telegram request failed" }, { status: 502, headers: jsonHeaders });
  }

  await markNotificationAsSent(payload);

  return Response.json({ ok: true }, { headers: jsonHeaders });
});
