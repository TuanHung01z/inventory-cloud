export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    // CORS preflight
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
  },
};

// ===== Helpers chung =====

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*", // khi xong có thể giới hạn theo domain của bạn
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(),
    },
  });
}

async function readJson(request) {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

// ======================================================
//  /api/attributes  (Màu / Size / Danh mục + trạng thái)
// ======================================================
async function handleAttributes(request, env, url) {
  const db = env.DB;
  const { pathname, searchParams } = url;
  const parts = pathname.split("/").filter(Boolean); // ["api","attributes",":id?"]
  const id = parts.length === 3 ? Number(parts[2]) : null;

  // GET /api/attributes?type=color&onlyActive=1
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

  // POST /api/attributes
  if (request.method === "POST" && !id) {
    const body = await readJson(request);
    let { type, name, color_code, status } = body || {};

    if (!type || !["color", "size", "category"].includes(type)) {
      return json({ error: "Loại phân loại không hợp lệ" }, 400);
    }
    if (!name || !String(name).trim()) {
      return json({ error: "Tên phân loại không được để trống" }, 400);
    }

    const cleanType = String(type).trim();
    const cleanName = String(name).trim();
    const cleanColor = color_code ? String(color_code).trim() : null;
    const cleanStatus = status != null ? Number(status) : 1;

    try {
      const info = await db
        .prepare(
          "INSERT INTO attributes (type,name,color_code,status) VALUES (?,?,?,?)"
        )
        .bind(cleanType, cleanName, cleanColor, cleanStatus)
        .run();

      return json(
        {
          id: info.lastInsertRowId,
          type: cleanType,
          name: cleanName,
          color_code: cleanColor,
          status: cleanStatus,
        },
        201
      );
    } catch (err) {
      const msg = String(err.message || "");
      if (msg.includes("UNIQUE")) {
        return json({ error: "Phân loại này đã tồn tại" }, 409);
      }
      console.error("INSERT attributes error:", err);
      return json({ error: "Lỗi máy chủ khi tạo phân loại" }, 500);
    }
  }

  // PUT /api/attributes/:id
  if (request.method === "PUT" && id) {
    const body = await readJson(request);
    let { name, color_code, status } = body || {};

    if (!name || !String(name).trim()) {
      return json({ error: "Tên phân loại không được để trống" }, 400);
    }

    const cleanName = String(name).trim();
    const cleanColor = color_code ? String(color_code).trim() : null;
    const cleanStatus = status != null ? Number(status) : 1;

    try {
      const result = await db
        .prepare(
          "UPDATE attributes SET name=?,color_code=?,status=? WHERE id=?"
        )
        .bind(cleanName, cleanColor, cleanStatus, id)
        .run();

      if (result.rowsAffected === 0) {
        return json({ error: "Không tìm thấy phân loại" }, 404);
      }
      return json({ ok: true });
    } catch (err) {
      console.error("UPDATE attributes error:", err);
      return json({ error: "Lỗi máy chủ khi sửa phân loại" }, 500);
    }
  }

  // DELETE /api/attributes/:id
  if (request.method === "DELETE" && id) {
    try {
      const result = await db
        .prepare("DELETE FROM attributes WHERE id=?")
        .bind(id)
        .run();

      if (result.rowsAffected === 0) {
        return json({ error: "Không tìm thấy phân loại" }, 404);
      }
      return json({ ok: true, deleted: result.rowsAffected });
    } catch (err) {
      console.error("DELETE attributes error:", err);
      return json({ error: "Lỗi máy chủ khi xoá phân loại" }, 500);
    }
  }

  return json({ error: "Method not allowed" }, 405);
}

// =======================================
//  /api/products  (Sản phẩm + biến thể)
// =======================================
async function handleProducts(request, env, url) {
  const db = env.DB;
  const { pathname } = url;
  const parts = pathname.split("/").filter(Boolean); // ["api","products",":masp?"]
  const masp = parts.length === 3 ? decodeURIComponent(parts[2]) : null;

  // GET /api/products
  if (request.method === "GET" && !masp) {
    const productsRes = await db
      .prepare("SELECT * FROM products ORDER BY id DESC")
      .all();
    const variantsRes = await db
      .prepare("SELECT * FROM product_variants ORDER BY id ASC")
      .all();

    const products = productsRes.results || [];
    const variants = variantsRes.results || [];
    const byProduct = {};

    for (const v of variants) {
      (byProduct[v.product_id] ||= []).push(v);
    }

    const result = products.map((p) => ({
      ...p,
      variants: byProduct[p.id] || [],
    }));

    return json(result);
  }

  // POST /api/products
  if (request.method === "POST" && !masp) {
    const body = await readJson(request);
    const { name, cost, note, category, variants } = body || {};

    if (!name || !String(name).trim()) {
      return json({ error: "Tên sản phẩm không được để trống" }, 400);
    }

    const cleanName = String(name).trim();
    const cleanNote =
      note && String(note).trim() ? String(note).trim() : null;
    const cleanCost =
      cost != null && String(cost) !== "" ? Number(cost) : null;
    const cleanCategory =
      category && String(category).trim() ? String(category).trim() : null;
    const variantList = Array.isArray(variants) ? variants : [];

    const maSP = crypto.randomUUID();

    const info = await db
      .prepare(
        "INSERT INTO products (MaSP,name,cost,note,category) VALUES (?,?,?,?,?)"
      )
      .bind(maSP, cleanName, cleanCost, cleanNote, cleanCategory)
      .run();

    const productId = info.lastInsertRowId;

    const createdVariants = [];
    for (const v of variantList) {
      const color = v.color ? String(v.color).trim() : null;
      const size = v.size ? String(v.size).trim() : null;
      const qty = v.quantity != null ? Number(v.quantity) : 0;
      const img = v.img ? String(v.img).trim() : null;

      const r = await db
        .prepare(
          "INSERT INTO product_variants (product_id,color,size,quantity,img) VALUES (?,?,?,?,?)"
        )
        .bind(productId, color, size, qty, img)
        .run();

      createdVariants.push({
        id: r.lastInsertRowId,
        product_id: productId,
        color,
        size,
        quantity: qty,
        img,
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
        variants: createdVariants,
      },
      201
    );
  }

  if (!masp) {
    return json({ error: "Thiếu mã sản phẩm" }, 400);
  }

  // PUT /api/products/:masp
  if (request.method === "PUT") {
    const body = await readJson(request);
    const { name, cost, note, category, variants } = body || {};

    if (!name || !String(name).trim()) {
      return json({ error: "Tên sản phẩm không được để trống" }, 400);
    }

    const cleanName = String(name).trim();
    const cleanNote =
      note && String(note).trim() ? String(note).trim() : null;
    const cleanCost =
      cost != null && String(cost) !== "" ? Number(cost) : null;
    const cleanCategory =
      category && String(category).trim() ? String(category).trim() : null;
    const variantList = Array.isArray(variants) ? variants : [];

    const prod = await db
      .prepare("SELECT id FROM products WHERE MaSP = ?")
      .bind(masp)
      .get();

    if (!prod) {
      return json({ error: "Không tìm thấy sản phẩm" }, 404);
    }

    const productId = prod.id;

    await db
      .prepare(
        "UPDATE products SET name=?,cost=?,note=?,category=? WHERE id=?"
      )
      .bind(cleanName, cleanCost, cleanNote, cleanCategory, productId)
      .run();

    // Đơn giản: xoá hết biến thể cũ rồi thêm lại (nếu bạn muốn giữ history variant id thì logic sẽ phức tạp hơn)
    await db
      .prepare("DELETE FROM product_variants WHERE product_id = ?")
      .bind(productId)
      .run();

    const updatedVariants = [];
    for (const v of variantList) {
      const color = v.color ? String(v.color).trim() : null;
      const size = v.size ? String(v.size).trim() : null;
      const qty = v.quantity != null ? Number(v.quantity) : 0;
      const img = v.img ? String(v.img).trim() : null;

      const r = await db
        .prepare(
          "INSERT INTO product_variants (product_id,color,size,quantity,img) VALUES (?,?,?,?,?)"
        )
        .bind(productId, color, size, qty, img)
        .run();

      updatedVariants.push({
        id: r.lastInsertRowId,
        product_id: productId,
        color,
        size,
        quantity: qty,
        img,
      });
    }

    return json({ ok: true });
  }

  // DELETE /api/products/:masp
  if (request.method === "DELETE") {
    const prod = await db
      .prepare("SELECT id FROM products WHERE MaSP = ?")
      .bind(masp)
      .get();

    if (!prod) {
      return json({ error: "Không tìm thấy sản phẩm" }, 404);
    }

    const productId = prod.id;
    await db
      .prepare("DELETE FROM product_variants WHERE product_id=?")
      .bind(productId)
      .run();
    await db.prepare("DELETE FROM products WHERE id=?").bind(productId).run();

    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
}

// =======================================
//  /api/movements  (Nhập / xuất kho)
// =======================================
async function handleMovements(request, env, url) {
  const db = env.DB;

  // GET /api/movements
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

  // POST /api/movements
  if (request.method === "POST") {
    const body = await readJson(request);
    let { variantId, type, quantity, user, note } = body || {};

    const variant_id = Number(variantId);
    const qty = Number(quantity || 0);
    const cleanType =
      String(type || "").toUpperCase() === "OUT" ? "OUT" : "IN";
    const cleanUser =
      user && String(user).trim() ? String(user).trim() : null;
    const cleanNote =
      note && String(note).trim() ? String(note).trim() : null;

    if (!variant_id || !qty || qty <= 0) {
      return json({ error: "Dữ liệu không hợp lệ" }, 400);
    }

    const row = await db
      .prepare(
        `SELECT v.*, p.id AS productId
         FROM product_variants v
         JOIN products p ON p.id = v.product_id
         WHERE v.id = ?`
      )
      .bind(variant_id)
      .get();

    if (!row) {
      return json({ error: "Không tìm thấy biến thể" }, 404);
    }

    let newQty = row.quantity || 0;
    if (cleanType === "IN") {
      newQty = newQty + qty;
    } else {
      if (qty > newQty) {
        return json({ error: "Xuất vượt quá tồn hiện tại" }, 400);
      }
      newQty = newQty - qty;
    }

    await db
      .prepare("UPDATE product_variants SET quantity = ? WHERE id = ?")
      .bind(newQty, variant_id)
      .run();

    const time = new Date().toISOString();

    await db
      .prepare(
        "INSERT INTO movements (product_id,variant_id,type,quantity,user,time,note) VALUES (?,?,?,?,?,?,?)"
      )
      .bind(row.productId, variant_id, cleanType, qty, cleanUser, time, cleanNote)
      .run();

    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, 405);
}

// =======================================
//  Upload ảnh + danh sách ảnh (R2)
// =======================================
async function handleUploadImage(request, env, url) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  if (!env.BUCKET) {
    return json({ error: "Bucket chưa được cấu hình" }, 500);
  }

  const formData = await request.formData();
  const files = formData.getAll("image"); // input name="image" multiple

  if (!files || files.length === 0) {
    return json({ error: "Không có file nào được gửi lên" }, 400);
  }

  const uploaded = [];

  for (const file of files) {
    if (typeof file === "string") continue;

    const extMatch = /\.[a-zA-Z0-9]+$/.exec(file.name || "");
    const ext = extMatch ? extMatch[0] : "";
    const key = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}${ext}`;

    await env.BUCKET.put(key, file.stream());

    uploaded.push({
      key,
      url: `/uploads/${encodeURIComponent(key)}`,
      filename: file.name || key,
    });
  }

  return json(
    {
      ok: true,
      count: uploaded.length,
      files: uploaded,
    },
    201
  );
}

async function handleImages(request, env, url) {
  if (!env.BUCKET) {
    return json({ error: "Bucket chưa được cấu hình" }, 500);
  }

  // GET /api/images
  if (request.method === "GET") {
    const list = await env.BUCKET.list();
    const images = (list.objects || []).map((obj) => ({
      url: `/uploads/${encodeURIComponent(obj.key)}`,
      filename: obj.key,
    }));
    return json(images);
  }

  // DELETE /api/images
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
      notFound,
    });
  }

  return json({ error: "Method not allowed" }, 405);
}

// Serve ảnh từ R2: GET /uploads/:key
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
    (obj.httpMetadata && obj.httpMetadata.contentType) || "image/jpeg"
  );
  headers.set("Cache-Control", "public, max-age=31536000");

  return new Response(obj.body, { status: 200, headers });
}
