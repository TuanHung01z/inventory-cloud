// server.js - Backend: Express + SQLite + Upload ảnh + Phân loại + Sản phẩm/biến thể + Nhập/Xuất

const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const multer = require("multer");
const { randomUUID } = require("crypto");

const app = express();
const PORT = 3000;

// ===== MIDDLEWARE =====
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static: html/css/js trong ./public và thư mục hiện tại
app.use(express.static(__dirname));
app.use(express.static(path.join(__dirname, "public")));

// Thư mục uploads
const uploadDir = path.join(__dirname, "uploads");
fs.mkdirSync(uploadDir, { recursive: true });
app.use("/uploads", express.static(uploadDir));

// ===== SQLITE INIT =====
const dbPath = path.join(__dirname, "data.db");
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run("PRAGMA foreign_keys = ON");

    // Bảng sản phẩm: có MaSP dùng GUID
  db.run(
    `CREATE TABLE IF NOT EXISTS products (
       id       INTEGER PRIMARY KEY AUTOINCREMENT,
       MaSP     TEXT UNIQUE,
       name     TEXT NOT NULL,
       cost     INTEGER,
       note     TEXT,
       category TEXT
     )`
  );


  // Thêm cột MaSP nếu bảng cũ chưa có
  db.run("ALTER TABLE products ADD COLUMN MaSP TEXT UNIQUE", (err) => {
    if (err && !String(err.message).includes("duplicate column")) {
      console.error("ALTER TABLE products ADD COLUMN MaSP error:", err);
    }
  // Thêm cột category nếu bảng cũ chưa có
  db.run("ALTER TABLE products ADD COLUMN category TEXT", (err) => {
    if (err && !String(err.message).includes("duplicate column")) {
      console.error("ALTER TABLE products ADD COLUMN category error:", err);
    }
  });

    // Gán MaSP cho các dòng chưa có
    db.all("SELECT id, MaSP FROM products", (err2, rows) => {
      if (err2) {
        console.error("Backfill MaSP error:", err2);
        return;
      }
      rows.forEach((row) => {
        if (!row.MaSP) {
          db.run(
            "UPDATE products SET MaSP = ? WHERE id = ?",
            [randomUUID(), row.id],
            (err3) => {
              if (err3) {
                console.error("UPDATE products set MaSP error:", err3);
              }
            }
          );
        }
      });
    });
  });

  // Biến thể sản phẩm
  db.run(
    `CREATE TABLE IF NOT EXISTS product_variants (
       id         INTEGER PRIMARY KEY AUTOINCREMENT,
       product_id INTEGER NOT NULL,
       color      TEXT,
       size       TEXT,
       quantity   INTEGER NOT NULL DEFAULT 0,
       img        TEXT,
       FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
     )`
  );

  // Nhập / Xuất kho
  db.run(
    `CREATE TABLE IF NOT EXISTS movements (
       id         INTEGER PRIMARY KEY AUTOINCREMENT,
       product_id INTEGER,
       variant_id INTEGER,
       type       TEXT NOT NULL,     -- IN / OUT
       quantity   INTEGER NOT NULL,
       user       TEXT,
       time       TEXT,
       note       TEXT,
       FOREIGN KEY(product_id) REFERENCES products(id),
       FOREIGN KEY(variant_id) REFERENCES product_variants(id)
     )`
  );

  // Phân loại (Màu / Size / Danh mục) + mã màu + trạng thái
  db.run(
    `CREATE TABLE IF NOT EXISTS attributes (
       id          INTEGER PRIMARY KEY AUTOINCREMENT,
       type        TEXT NOT NULL,     -- 'color' / 'size' / 'category'
       name        TEXT NOT NULL,
       color_code  TEXT,
       status      INTEGER NOT NULL DEFAULT 1, -- 1 = hoạt động, 0 = không hoạt động
       UNIQUE(type, name)
     )`
  );

  // Thêm cột color_code nếu DB cũ chưa có
  db.run("ALTER TABLE attributes ADD COLUMN color_code TEXT", (err) => {
    if (err && !String(err.message).includes("duplicate column")) {
      console.error(
        "ALTER TABLE attributes ADD COLUMN color_code error:",
        err
      );
    }
  });

  // Thêm cột status nếu DB cũ chưa có
  db.run(
    "ALTER TABLE attributes ADD COLUMN status INTEGER NOT NULL DEFAULT 1",
    (err) => {
      if (err && !String(err.message).includes("duplicate column")) {
        console.error("ALTER TABLE attributes ADD COLUMN status error:", err);
      }
    }
  );
});

// ===== MULTER – UPLOAD ẢNH =====
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "");
    const base = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, base + ext);
  },
});
const upload = multer({ storage });

// POST /api/upload-image – upload 1 ảnh
app.post("/api/upload-image", upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Không có file upload" });
  }
  const url = "/uploads/" + req.file.filename;
  res.json({ url });
});

// GET /api/images – danh sách ảnh
app.get("/api/images", (req, res) => {
  fs.readdir(uploadDir, (err, files) => {
    if (err) {
      console.error("GET /api/images error:", err);
      return res
        .status(500)
        .json({ error: "Không đọc được thư mục uploads" });
    }

    const images = files
      .filter((f) => !f.startsWith("."))
      .map((f) => ({
        url: "/uploads/" + f,
        filename: f,
      }));

    res.json(images);
  });
});
// DELETE /api/images – xóa 1 hoặc nhiều ảnh được chọn
app.delete("/api/images", (req, res) => {
  const { urls } = req.body;

  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: "Danh sách ảnh cần xóa không hợp lệ." });
  }

  const deleted = [];
  const notFound = [];

  urls.forEach((u) => {
    const filename = path.basename(u || "");
    if (!filename) return;

    const filePath = path.join(uploadDir, filename);

    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        deleted.push(u);
      } else {
        notFound.push(u);
      }
    } catch (err) {
      console.error("DELETE /api/images unlink error:", err);
      notFound.push(u);
    }
  });

  res.json({
    ok: true,
    deletedCount: deleted.length,
    deleted,
    notFound,
  });
});


// ===== API PHÂN LOẠI (MÀU / SIZE / DANH MỤC) + TRẠNG THÁI =====

// GET /api/attributes?type=color&onlyActive=1
app.get("/api/attributes", (req, res) => {
  const { type, onlyActive } = req.query;

  let sql =
    "SELECT id, type, name, color_code, status FROM attributes";
  const params = [];
  const conditions = [];

  if (type && ["color", "size", "category"].includes(type)) {
    conditions.push("type = ?");
    params.push(type);
  }

  // onlyActive=1 hoặc onlyActive=true => chỉ lấy đang hoạt động
  if (onlyActive === "1" || onlyActive === "true") {
    conditions.push("status = 1");
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  sql += " ORDER BY type, name COLLATE NOCASE";

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error("GET /api/attributes error:", err);
      return res.status(500).json({ error: "Lỗi máy chủ" });
    }
    res.json(rows);
  });
});

// POST /api/attributes – tạo mới (mặc định hoạt động)
app.post("/api/attributes", (req, res) => {
  const { type, name, colorCode, status } = req.body || {};

  if (!type || !["color", "size", "category"].includes(type)) {
    return res
      .status(400)
      .json({ error: "type phải là 'color', 'size' hoặc 'category'" });
  }
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: "Tên không được để trống" });
  }

  const cleanName = String(name).trim();
  const cleanColorCode =
    colorCode && String(colorCode).trim()
      ? String(colorCode).trim()
      : null;

  // status: nếu không gửi thì mặc định = 1 (hoạt động)
  let cleanStatus = 1;
  if (status !== undefined) {
    if (
      status === 0 ||
      status === "0" ||
      status === false ||
      status === "false"
    ) {
      cleanStatus = 0;
    } else {
      cleanStatus = 1;
    }
  }

  db.run(
    "INSERT INTO attributes (type, name, color_code, status) VALUES (?, ?, ?, ?)",
    [type, cleanName, cleanColorCode, cleanStatus],
    function (err) {
      if (err) {
        const msg = String(err.message || "");
        console.error("POST /api/attributes error:", msg);
        if (msg.includes("UNIQUE")) {
          return res
            .status(400)
            .json({ error: "Tên đã tồn tại trong loại này" });
        }
        return res
          .status(500)
          .json({ error: "Lỗi máy chủ khi tạo phân loại" });
      }
      res.status(201).json({
        id: this.lastID,
        type,
        name: cleanName,
        color_code: cleanColorCode,
        status: cleanStatus,
      });
    }
  );
});

// PUT /api/attributes/:id – sửa tên / mã màu / trạng thái
app.put("/api/attributes/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { name, colorCode, status } = req.body || {};

  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "ID không hợp lệ" });
  }

  db.get(
    "SELECT * FROM attributes WHERE id = ?",
    [id],
    (err, row) => {
      if (err) {
        console.error("GET /api/attributes/:id error:", err);
        return res.status(500).json({ error: "Lỗi máy chủ" });
      }
      if (!row) {
        return res.status(404).json({ error: "Không tìm thấy phân loại" });
      }

      const finalName =
        name !== undefined && String(name).trim()
          ? String(name).trim()
          : row.name;

      if (!finalName) {
        return res.status(400).json({ error: "Tên không được để trống" });
      }

      const finalColorCode =
        colorCode !== undefined
          ? colorCode && String(colorCode).trim()
            ? String(colorCode).trim()
            : null
          : row.color_code;

      let finalStatus = row.status ?? 1;
      if (status !== undefined) {
        if (
          status === 0 ||
          status === "0" ||
          status === false ||
          status === "false"
        ) {
          finalStatus = 0;
        } else {
          finalStatus = 1;
        }
      }

      db.run(
        "UPDATE attributes SET name = ?, color_code = ?, status = ? WHERE id = ?",
        [finalName, finalColorCode, finalStatus, id],
        function (err2) {
          if (err2) {
            const msg = String(err2.message || "");
            console.error("PUT /api/attributes/:id error:", msg);
            if (msg.includes("UNIQUE")) {
              return res
                .status(400)
                .json({ error: "Tên đã tồn tại trong loại này" });
            }
            return res
              .status(500)
              .json({ error: "Lỗi máy chủ khi cập nhật phân loại" });
          }
          res.json({
            id,
            type: row.type,
            name: finalName,
            color_code: finalColorCode,
            status: finalStatus,
          });
        }
      );
    }
  );
});

// DELETE /api/attributes/:id – xoá hẳn
app.delete("/api/attributes/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ error: "ID không hợp lệ" });
  }

  db.run(
    "DELETE FROM attributes WHERE id = ?",
    [id],
    function (err) {
      if (err) {
        console.error("DELETE /api/attributes/:id error:", err);
        return res.status(500).json({ error: "Lỗi máy chủ khi xoá phân loại" });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: "Không tìm thấy phân loại" });
      }
      res.json({ ok: true, deleted: this.changes });
    }
  );
});



// ===== API PRODUCTS + VARIANTS (dùng MaSP) =====

// GET /api/products – trả về products + variants
app.get("/api/products", (req, res) => {
  db.all("SELECT * FROM products ORDER BY id DESC", [], (err, products) => {
    if (err) {
      console.error("GET /api/products error:", err);
      return res.status(500).json({ error: "Lỗi máy chủ" });
    }

    db.all(
      "SELECT * FROM product_variants ORDER BY id ASC",
      [],
      (err2, variants) => {
        if (err2) {
          console.error("GET /api/products variants error:", err2);
          return res.status(500).json({ error: "Lỗi máy chủ" });
        }

        const byProduct = {};
        variants.forEach((v) => {
          if (!byProduct[v.product_id]) byProduct[v.product_id] = [];
          byProduct[v.product_id].push(v);
        });

        const result = products.map((p) => ({
          ...p,
          variants: byProduct[p.id] || [],
        }));

        res.json(result);
      }
    );
  });
});

// POST /api/products – tạo mới (tự sinh MaSP = GUID)
app.post("/api/products", (req, res) => {
  const { name, cost, note, variants, category } = req.body || {};

  if (!name || !String(name).trim()) {
    return res
      .status(400)
      .json({ error: "Tên sản phẩm không được để trống" });
  }

  const cleanName = String(name).trim();
  const cleanNote =
    note && String(note).trim() ? String(note).trim() : null;
  const cleanCost =
    cost !== undefined && cost !== null && String(cost) !== ""
      ? Number(cost)
      : null;
  const cleanCategory =
    category && String(category).trim()
      ? String(category).trim()
      : null;

  const maSP = randomUUID();
  const variantList = Array.isArray(variants) ? variants : [];

  db.run(
    "INSERT INTO products (MaSP, name, cost, note, category) VALUES (?, ?, ?, ?, ?)",
    [maSP, cleanName, cleanCost, cleanNote, cleanCategory],
    function (err) {
      if (err) {
        console.error("POST /api/products error:", err);
        return res
          .status(500)
          .json({ error: "Lỗi máy chủ khi tạo sản phẩm" });
      }

      const productId = this.lastID;

      // Nếu không có biến thể → trả về luôn
      if (!variantList.length) {
        return res.status(201).json({
          id: productId,
          MaSP: maSP,
          name: cleanName,
          cost: cleanCost,
          note: cleanNote,
          category: cleanCategory,
          variants: [],
        });
      }

      // Có biến thể → insert lần lượt
      let createdVariants = [];
      let pending = variantList.length;
      let hasError = false;

      variantList.forEach((v) => {
        if (hasError) return;

        const color =
          v.color && String(v.color).trim()
            ? String(v.color).trim()
            : null;
        const size =
          v.size && String(v.size).trim() ? String(v.size).trim() : null;
        const quantity =
          v.quantity !== undefined && v.quantity !== null
            ? Number(v.quantity)
            : 0;
        const img =
          v.img && String(v.img).trim() ? String(v.img).trim() : null;

        db.run(
          `INSERT INTO product_variants (product_id, color, size, quantity, img)
           VALUES (?, ?, ?, ?, ?)`,
          [productId, color, size, quantity, img],
          function (err2) {
            if (err2) {
              console.error(
                "POST /api/products insert variant error:",
                err2
              );
              if (!hasError) {
                hasError = true;
                return res
                  .status(500)
                  .json({ error: "Lỗi máy chủ khi tạo biến thể" });
              }
              return;
            }

            createdVariants.push({
              id: this.lastID,
              product_id: productId,
              color,
              size,
              quantity,
              img,
            });

            pending--;
            if (!hasError && pending === 0) {
              return res.status(201).json({
                id: productId,
                MaSP: maSP,
                name: cleanName,
                cost: cleanCost,
                note: cleanNote,
                category: cleanCategory,
                variants: createdVariants,
              });
            }
          }
        );
      });
    }
  );
});


// PUT /api/products/:code – sửa theo MaSP
app.put("/api/products/:code", (req, res) => {
  const code = req.params.code;
  const { name, cost, note, variants, category } = req.body || {};

  if (!code || !name || !String(name).trim()) {
    return res
      .status(400)
      .json({ error: "Thiếu MaSP hoặc tên sản phẩm" });
  }

  const cleanName = String(name).trim();
  const cleanNote =
    note && String(note).trim() ? String(note).trim() : null;
  const cleanCost =
    cost !== undefined && cost !== null && String(cost) !== ""
      ? Number(cost)
      : null;
  const cleanCategory =
    category && String(category).trim()
      ? String(category).trim()
      : null;

  const variantList = Array.isArray(variants) ? variants : [];

  // Lấy productId từ MaSP
  db.get(
    "SELECT id FROM products WHERE MaSP = ?",
    [code],
    (err, row) => {
      if (err) {
        console.error("SELECT product by MaSP error:", err);
        return res.status(500).json({ error: "Lỗi máy chủ" });
      }
      if (!row) {
        return res
          .status(404)
          .json({ error: "Không tìm thấy sản phẩm" });
      }

      const productId = row.id;

      // Cập nhật thông tin sản phẩm
      db.run(
        "UPDATE products SET name = ?, cost = ?, note = ?, category = ? WHERE id = ?",
        [cleanName, cleanCost, cleanNote, cleanCategory, productId],
        function (err2) {
          if (err2) {
            console.error("Lỗi UPDATE products:", err2);
            return res
              .status(500)
              .json({ error: "Lỗi cập nhật sản phẩm" });
          }

          // Nếu không gửi biến thể → chỉ cập nhật thông tin sản phẩm
          if (!variantList.length) {
            return res.json({ success: true });
          }

          // Xoá toàn bộ biến thể cũ rồi insert lại (đơn giản, dễ kiểm soát)
          db.run(
            "DELETE FROM product_variants WHERE product_id = ?",
            [productId],
            (err3) => {
              if (err3) {
                console.error(
                  "Lỗi DELETE product_variants khi sửa sản phẩm:",
                  err3
                );
                return res.status(500).json({
                  error: "Lỗi xoá biến thể cũ",
                });
              }

              let pending = variantList.length;
              let hasError2 = false;

              variantList.forEach((v) => {
                if (hasError2) return;

                const color =
                  v.color && String(v.color).trim()
                    ? String(v.color).trim()
                    : null;
                const size =
                  v.size && String(v.size).trim()
                    ? String(v.size).trim()
                    : null;
                const quantity =
                  v.quantity !== undefined && v.quantity !== null
                    ? Number(v.quantity)
                    : 0;
                const img =
                  v.img && String(v.img).trim()
                    ? String(v.img).trim()
                    : null;

                db.run(
                  "INSERT INTO product_variants (product_id, color, size, quantity, img) VALUES (?, ?, ?, ?, ?)",
                  [productId, color, size, quantity, img],
                  (err5) => {
                    if (err5) {
                      console.error(
                        "Lỗi INSERT product_variants khi sửa sản phẩm:",
                        err5
                      );
                      if (!hasError2) {
                        hasError2 = true;
                        return res.status(500).json({
                          error: "Lỗi lưu biến thể sản phẩm",
                        });
                      }
                      return;
                    }

                    pending--;
                    if (!hasError2 && pending === 0) {
                      return res.json({ success: true });
                    }
                  }
                );
              });
            }
          );
        }
      );
    }
  );
});



// DELETE /api/products/:code – xoá theo MaSP
app.delete("/api/products/:code", (req, res) => {
  const code = req.params.code;

  if (!code) {
    return res.status(400).json({ error: "Thiếu MaSP" });
  }

  db.get(
    "SELECT id FROM products WHERE MaSP = ?",
    [code],
    (err, row) => {
      if (err) {
        console.error("SELECT product by MaSP error:", err);
        return res.status(500).json({ error: "Lỗi máy chủ" });
      }
      if (!row) {
        return res.status(404).json({ error: "Không tìm thấy sản phẩm" });
      }

      const productId = row.id;

      db.serialize(() => {
        db.run(
          "DELETE FROM movements WHERE product_id = ?",
          [productId],
          function (err0) {
            if (err0) {
              console.error("Lỗi xoá movements:", err0);
              return res
                .status(500)
                .json({ error: "Lỗi khi xoá lịch sử" });
            }

            db.run(
              "DELETE FROM product_variants WHERE product_id = ?",
              [productId],
              function (err1) {
                if (err1) {
                  console.error(
                    "Lỗi xoá product_variants:",
                    err1
                  );
                  return res
                    .status(500)
                    .json({ error: "Lỗi khi xoá biến thể" });
                }

                db.run(
                  "DELETE FROM products WHERE id = ?",
                  [productId],
                  function (err2) {
                    if (err2) {
                      console.error("Lỗi xoá products:", err2);
                      return res
                        .status(500)
                        .json({ error: "Lỗi khi xoá sản phẩm" });
                    }
                    return res.json({ success: true });
                  }
                );
              }
            );
          }
        );
      });
    }
  );
});

// ===== API MOVEMENTS (NHẬP / XUẤT) =====

app.get("/api/movements", (req, res) => {
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

  db.all(sql, [], (err, rows) => {
    if (err) {
      console.error("GET /api/movements error:", err);
      return res.status(500).json({ error: "Lỗi máy chủ" });
    }
    res.json(rows);
  });
});

app.post("/api/movements", (req, res) => {
  const { variantId, type, quantity, user, time, note } = req.body || {};

  if (!variantId) {
    return res.status(400).json({ error: "Thiếu variantId" });
  }
  if (!["IN", "OUT"].includes(type)) {
    return res.status(400).json({ error: "type phải là IN hoặc OUT" });
  }
  const qty = Number(quantity);
  if (!qty || qty <= 0) {
    return res.status(400).json({ error: "Số lượng phải > 0" });
  }
  if (!user || !String(user).trim()) {
    return res.status(400).json({ error: "Người thực hiện không được trống" });
  }
  if (!time) {
    return res.status(400).json({ error: "Thiếu thời gian" });
  }

  const cleanUser = String(user).trim();
  const cleanNote =
    note && String(note).trim() ? String(note).trim() : null;

  db.get(
    `SELECT v.*, p.id AS productId, p.name AS productName
     FROM product_variants v
     JOIN products p ON p.id = v.product_id
     WHERE v.id = ?`,
    [variantId],
    (err, row) => {
      if (err) {
        console.error("POST /api/movements select variant error:", err);
        return res.status(500).json({ error: "Lỗi máy chủ" });
      }
      if (!row) {
        return res.status(404).json({ error: "Biến thể không tồn tại" });
      }

      const currentQty = Number(row.quantity || 0);
      let newQty = currentQty;

      if (type === "IN") newQty = currentQty + qty;
      else {
        if (qty > currentQty) {
          return res
            .status(400)
            .json({ error: "Không đủ tồn kho để xuất" });
        }
        newQty = currentQty - qty;
      }

      db.run(
        "UPDATE product_variants SET quantity = ? WHERE id = ?",
        [newQty, variantId],
        (err2) => {
          if (err2) {
            console.error("POST /api/movements update qty error:", err2);
            return res.status(500).json({ error: "Lỗi khi cập nhật tồn" });
          }

          db.run(
            `INSERT INTO movements (product_id, variant_id, type, quantity, user, time, note)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              row.productId,
              row.id,
              type,
              qty,
              cleanUser,
              time,
              cleanNote,
            ],
            function (err3) {
              if (err3) {
                console.error(
                  "POST /api/movements insert movement error:",
                  err3
                );
                return res
                  .status(500)
                  .json({ error: "Lỗi khi lưu phiếu" });
              }

              const movementId = this.lastID;
              const variantText = [row.color, row.size]
                .filter(Boolean)
                .join(" / ");

              res.status(201).json({
                id: movementId,
                productId: row.productId,
                variantId: row.id,
                productName: row.productName,
                variant: variantText,
                type,
                quantity: qty,
                user: cleanUser,
                time,
                note: cleanNote,
              });
            }
          );
        }
      );
    }
  );
});

// ===== ROOT =====
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
