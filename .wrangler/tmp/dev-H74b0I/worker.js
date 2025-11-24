var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-8HlAwq/strip-cf-connecting-ip-header.js
function stripCfConnectingIPHeader(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
__name(stripCfConnectingIPHeader, "stripCfConnectingIPHeader");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    return Reflect.apply(target, thisArg, [
      stripCfConnectingIPHeader.apply(null, argArray)
    ]);
  }
});

// src/worker.js
var worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    try {
      if (pathname.startsWith("/api/attributes")) {
        return await handleAttributes(request, env, url);
      }
      if (pathname.startsWith("/api/products")) {
        return await handleProducts(request, env, url);
      }
      if (pathname.startsWith("/api/movements")) {
        return await handleMovements(request, env, url);
      }
      if (pathname === "/api/upload-image") {
        return await handleUploadImage(request, env, url);
      }
      if (pathname.startsWith("/api/images")) {
        return await handleImages(request, env, url);
      }
      if (pathname.startsWith("/uploads/")) {
        return await handleServeUpload(request, env, url);
      }
      return json({ error: "Not found" }, 404);
    } catch (err) {
      console.error("Worker error:", err);
      return json({ error: "Internal server error" }, 500);
    }
  }
};
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    // khi xong có thể giới hạn theo domain của bạn
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
__name(corsHeaders, "corsHeaders");
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders()
    }
  });
}
__name(json, "json");
async function readJson(request) {
  const text = await request.text();
  if (!text)
    return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}
__name(readJson, "readJson");
async function handleAttributes(request, env, url) {
  const db = env.DB;
  const { pathname, searchParams } = url;
  const parts = pathname.split("/").filter(Boolean);
  const id = parts.length === 3 ? Number(parts[2]) : null;
  if (request.method === "GET" && !id) {
    const type = searchParams.get("type");
    const onlyActive = searchParams.get("onlyActive");
    let sql = "SELECT id,type,name,color_code,status FROM attributes";
    const conds = [];
    const binds = [];
    if (type && ["color", "size", "category"].includes(type)) {
      conds.push("type = ?");
      binds.push(type);
    }
    if (onlyActive === "1") {
      conds.push("status = 1");
    }
    if (conds.length) {
      sql += " WHERE " + conds.join(" AND ");
    }
    sql += " ORDER BY type,name ASC";
    const res = await db.prepare(sql).bind(...binds).all();
    return json(res.results || []);
  }
  if (request.method === "POST" && !id) {
    const body = await readJson(request);
    let { type, name, color_code, status } = body || {};
    if (!type || !["color", "size", "category"].includes(type)) {
      return json({ error: "Lo\u1EA1i ph\xE2n lo\u1EA1i kh\xF4ng h\u1EE3p l\u1EC7" }, 400);
    }
    if (!name || !String(name).trim()) {
      return json({ error: "T\xEAn ph\xE2n lo\u1EA1i kh\xF4ng \u0111\u01B0\u1EE3c \u0111\u1EC3 tr\u1ED1ng" }, 400);
    }
    const cleanType = String(type).trim();
    const cleanName = String(name).trim();
    const cleanColor = color_code ? String(color_code).trim() : null;
    const cleanStatus = status != null ? Number(status) : 1;
    try {
      const info = await db.prepare(
        "INSERT INTO attributes (type,name,color_code,status) VALUES (?,?,?,?)"
      ).bind(cleanType, cleanName, cleanColor, cleanStatus).run();
      return json(
        {
          id: info.lastInsertRowId,
          type: cleanType,
          name: cleanName,
          color_code: cleanColor,
          status: cleanStatus
        },
        201
      );
    } catch (err) {
      const msg = String(err.message || "");
      if (msg.includes("UNIQUE")) {
        return json({ error: "Ph\xE2n lo\u1EA1i n\xE0y \u0111\xE3 t\u1ED3n t\u1EA1i" }, 409);
      }
      console.error("INSERT attributes error:", err);
      return json({ error: "L\u1ED7i m\xE1y ch\u1EE7 khi t\u1EA1o ph\xE2n lo\u1EA1i" }, 500);
    }
  }
  if (request.method === "PUT" && id) {
    const body = await readJson(request);
    let { name, color_code, status } = body || {};
    if (!name || !String(name).trim()) {
      return json({ error: "T\xEAn ph\xE2n lo\u1EA1i kh\xF4ng \u0111\u01B0\u1EE3c \u0111\u1EC3 tr\u1ED1ng" }, 400);
    }
    const cleanName = String(name).trim();
    const cleanColor = color_code ? String(color_code).trim() : null;
    const cleanStatus = status != null ? Number(status) : 1;
    try {
      const result = await db.prepare(
        "UPDATE attributes SET name=?,color_code=?,status=? WHERE id=?"
      ).bind(cleanName, cleanColor, cleanStatus, id).run();
      if (result.rowsAffected === 0) {
        return json({ error: "Kh\xF4ng t\xECm th\u1EA5y ph\xE2n lo\u1EA1i" }, 404);
      }
      return json({ ok: true });
    } catch (err) {
      console.error("UPDATE attributes error:", err);
      return json({ error: "L\u1ED7i m\xE1y ch\u1EE7 khi s\u1EEDa ph\xE2n lo\u1EA1i" }, 500);
    }
  }
  if (request.method === "DELETE" && id) {
    try {
      const result = await db.prepare("DELETE FROM attributes WHERE id=?").bind(id).run();
      if (result.rowsAffected === 0) {
        return json({ error: "Kh\xF4ng t\xECm th\u1EA5y ph\xE2n lo\u1EA1i" }, 404);
      }
      return json({ ok: true, deleted: result.rowsAffected });
    } catch (err) {
      console.error("DELETE attributes error:", err);
      return json({ error: "L\u1ED7i m\xE1y ch\u1EE7 khi xo\xE1 ph\xE2n lo\u1EA1i" }, 500);
    }
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(handleAttributes, "handleAttributes");
async function handleProducts(request, env, url) {
  const db = env.DB;
  const { pathname } = url;
  const parts = pathname.split("/").filter(Boolean);
  const masp = parts.length === 3 ? decodeURIComponent(parts[2]) : null;
  if (request.method === "GET" && !masp) {
    const productsRes = await db.prepare("SELECT * FROM products ORDER BY id DESC").all();
    const variantsRes = await db.prepare("SELECT * FROM product_variants ORDER BY id ASC").all();
    const products = productsRes.results || [];
    const variants = variantsRes.results || [];
    const byProduct = {};
    for (const v of variants) {
      (byProduct[v.product_id] ||= []).push(v);
    }
    const result = products.map((p) => ({
      ...p,
      variants: byProduct[p.id] || []
    }));
    return json(result);
  }
  if (request.method === "POST" && !masp) {
    const body = await readJson(request);
    const { name, cost, note, category, variants } = body || {};
    if (!name || !String(name).trim()) {
      return json({ error: "T\xEAn s\u1EA3n ph\u1EA9m kh\xF4ng \u0111\u01B0\u1EE3c \u0111\u1EC3 tr\u1ED1ng" }, 400);
    }
    const cleanName = String(name).trim();
    const cleanNote = note && String(note).trim() ? String(note).trim() : null;
    const cleanCost = cost != null && String(cost) !== "" ? Number(cost) : null;
    const cleanCategory = category && String(category).trim() ? String(category).trim() : null;
    const variantList = Array.isArray(variants) ? variants : [];
    const maSP = crypto.randomUUID();
    const info = await db.prepare(
      "INSERT INTO products (MaSP,name,cost,note,category) VALUES (?,?,?,?,?)"
    ).bind(maSP, cleanName, cleanCost, cleanNote, cleanCategory).run();
    const productId = info.lastInsertRowId;
    const createdVariants = [];
    for (const v of variantList) {
      const color = v.color ? String(v.color).trim() : null;
      const size = v.size ? String(v.size).trim() : null;
      const qty = v.quantity != null ? Number(v.quantity) : 0;
      const img = v.img ? String(v.img).trim() : null;
      const r = await db.prepare(
        "INSERT INTO product_variants (product_id,color,size,quantity,img) VALUES (?,?,?,?,?)"
      ).bind(productId, color, size, qty, img).run();
      createdVariants.push({
        id: r.lastInsertRowId,
        product_id: productId,
        color,
        size,
        quantity: qty,
        img
      });
    }
    return json(
      {
        id: productId,
        MaSP: maSP,
        name: cleanName,
        cost: cleanCost,
        note: cleanNote,
        category: cleanCategory,
        variants: createdVariants
      },
      201
    );
  }
  if (!masp) {
    return json({ error: "Thi\u1EBFu m\xE3 s\u1EA3n ph\u1EA9m" }, 400);
  }
  if (request.method === "PUT") {
    const body = await readJson(request);
    const { name, cost, note, category, variants } = body || {};
    if (!name || !String(name).trim()) {
      return json({ error: "T\xEAn s\u1EA3n ph\u1EA9m kh\xF4ng \u0111\u01B0\u1EE3c \u0111\u1EC3 tr\u1ED1ng" }, 400);
    }
    const cleanName = String(name).trim();
    const cleanNote = note && String(note).trim() ? String(note).trim() : null;
    const cleanCost = cost != null && String(cost) !== "" ? Number(cost) : null;
    const cleanCategory = category && String(category).trim() ? String(category).trim() : null;
    const variantList = Array.isArray(variants) ? variants : [];
    const prod = await db.prepare("SELECT id FROM products WHERE MaSP = ?").bind(masp).get();
    if (!prod) {
      return json({ error: "Kh\xF4ng t\xECm th\u1EA5y s\u1EA3n ph\u1EA9m" }, 404);
    }
    const productId = prod.id;
    await db.prepare(
      "UPDATE products SET name=?,cost=?,note=?,category=? WHERE id=?"
    ).bind(cleanName, cleanCost, cleanNote, cleanCategory, productId).run();
    await db.prepare("DELETE FROM product_variants WHERE product_id = ?").bind(productId).run();
    const updatedVariants = [];
    for (const v of variantList) {
      const color = v.color ? String(v.color).trim() : null;
      const size = v.size ? String(v.size).trim() : null;
      const qty = v.quantity != null ? Number(v.quantity) : 0;
      const img = v.img ? String(v.img).trim() : null;
      const r = await db.prepare(
        "INSERT INTO product_variants (product_id,color,size,quantity,img) VALUES (?,?,?,?,?)"
      ).bind(productId, color, size, qty, img).run();
      updatedVariants.push({
        id: r.lastInsertRowId,
        product_id: productId,
        color,
        size,
        quantity: qty,
        img
      });
    }
    return json({ ok: true });
  }
  if (request.method === "DELETE") {
    const prod = await db.prepare("SELECT id FROM products WHERE MaSP = ?").bind(masp).get();
    if (!prod) {
      return json({ error: "Kh\xF4ng t\xECm th\u1EA5y s\u1EA3n ph\u1EA9m" }, 404);
    }
    const productId = prod.id;
    await db.prepare("DELETE FROM product_variants WHERE product_id=?").bind(productId).run();
    await db.prepare("DELETE FROM products WHERE id=?").bind(productId).run();
    return json({ ok: true });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(handleProducts, "handleProducts");
async function handleMovements(request, env, url) {
  const db = env.DB;
  if (request.method === "GET") {
    const sql = `
      SELECT
        m.*,
        p.name AS productName,
        TRIM(
          COALESCE(v.color, '') ||
          CASE WHEN v.color IS NOT NULL AND v.size IS NOT NULL THEN ' / ' ELSE '' END ||
          COALESCE(v.size, '')
        ) AS variant
      FROM movements m
      LEFT JOIN products p ON p.id = m.product_id
      LEFT JOIN product_variants v ON v.id = m.variant_id
      ORDER BY m.time DESC, m.id DESC
    `;
    const res = await db.prepare(sql).all();
    return json(res.results || []);
  }
  if (request.method === "POST") {
    const body = await readJson(request);
    let { variantId, type, quantity, user, note } = body || {};
    const variant_id = Number(variantId);
    const qty = Number(quantity || 0);
    const cleanType = String(type || "").toUpperCase() === "OUT" ? "OUT" : "IN";
    const cleanUser = user && String(user).trim() ? String(user).trim() : null;
    const cleanNote = note && String(note).trim() ? String(note).trim() : null;
    if (!variant_id || !qty || qty <= 0) {
      return json({ error: "D\u1EEF li\u1EC7u kh\xF4ng h\u1EE3p l\u1EC7" }, 400);
    }
    const row = await db.prepare(
      `SELECT v.*, p.id AS productId
         FROM product_variants v
         JOIN products p ON p.id = v.product_id
         WHERE v.id = ?`
    ).bind(variant_id).get();
    if (!row) {
      return json({ error: "Kh\xF4ng t\xECm th\u1EA5y bi\u1EBFn th\u1EC3" }, 404);
    }
    let newQty = row.quantity || 0;
    if (cleanType === "IN") {
      newQty = newQty + qty;
    } else {
      if (qty > newQty) {
        return json({ error: "Xu\u1EA5t v\u01B0\u1EE3t qu\xE1 t\u1ED3n hi\u1EC7n t\u1EA1i" }, 400);
      }
      newQty = newQty - qty;
    }
    await db.prepare("UPDATE product_variants SET quantity = ? WHERE id = ?").bind(newQty, variant_id).run();
    const time = (/* @__PURE__ */ new Date()).toISOString();
    await db.prepare(
      "INSERT INTO movements (product_id,variant_id,type,quantity,user,time,note) VALUES (?,?,?,?,?,?,?)"
    ).bind(row.productId, variant_id, cleanType, qty, cleanUser, time, cleanNote).run();
    return json({ ok: true });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(handleMovements, "handleMovements");
async function handleUploadImage(request, env, url) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  if (!env.BUCKET) {
    return json({ error: "Bucket ch\u01B0a \u0111\u01B0\u1EE3c c\u1EA5u h\xECnh" }, 500);
  }
  const formData = await request.formData();
  const files = formData.getAll("image");
  if (!files || files.length === 0) {
    return json({ error: "Kh\xF4ng c\xF3 file n\xE0o \u0111\u01B0\u1EE3c g\u1EEDi l\xEAn" }, 400);
  }
  const uploaded = [];
  for (const file of files) {
    if (typeof file === "string")
      continue;
    const extMatch = /\.[a-zA-Z0-9]+$/.exec(file.name || "");
    const ext = extMatch ? extMatch[0] : "";
    const key = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    await env.BUCKET.put(key, file.stream());
    uploaded.push({
      key,
      url: `/uploads/${encodeURIComponent(key)}`,
      filename: file.name || key
    });
  }
  return json(
    {
      ok: true,
      count: uploaded.length,
      files: uploaded
    },
    201
  );
}
__name(handleUploadImage, "handleUploadImage");
async function handleImages(request, env, url) {
  if (!env.BUCKET) {
    return json({ error: "Bucket ch\u01B0a \u0111\u01B0\u1EE3c c\u1EA5u h\xECnh" }, 500);
  }
  if (request.method === "GET") {
    const list = await env.BUCKET.list();
    const images = (list.objects || []).map((obj) => ({
      url: `/uploads/${encodeURIComponent(obj.key)}`,
      filename: obj.key
    }));
    return json(images);
  }
  if (request.method === "DELETE") {
    const body = await readJson(request);
    const { urls } = body || {};
    const toDelete = Array.isArray(urls) ? urls : [];
    const deleted = [];
    const notFound = [];
    for (const u of toDelete) {
      try {
        const uObj = new URL(u, "http://dummy");
        const key = decodeURIComponent(
          uObj.pathname.replace(/^\/uploads\//, "")
        );
        await env.BUCKET.delete(key);
        deleted.push(u);
      } catch (err) {
        console.error("DELETE image error:", err);
        notFound.push(u);
      }
    }
    return json({
      ok: true,
      deletedCount: deleted.length,
      deleted,
      notFound
    });
  }
  return json({ error: "Method not allowed" }, 405);
}
__name(handleImages, "handleImages");
async function handleServeUpload(request, env, url) {
  if (!env.BUCKET) {
    return new Response("Bucket not configured", { status: 500 });
  }
  const key = decodeURIComponent(url.pathname.replace(/^\/uploads\//, ""));
  const obj = await env.BUCKET.get(key);
  if (!obj) {
    return new Response("Not found", { status: 404 });
  }
  const headers = new Headers();
  headers.set(
    "Content-Type",
    obj.httpMetadata && obj.httpMetadata.contentType || "image/jpeg"
  );
  headers.set("Cache-Control", "public, max-age=31536000");
  return new Response(obj.body, { status: 200, headers });
}
__name(handleServeUpload, "handleServeUpload");

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-8HlAwq/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-8HlAwq/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
__name(__Facade_ScheduledController__, "__Facade_ScheduledController__");
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
