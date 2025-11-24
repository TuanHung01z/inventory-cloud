PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  MaSP     TEXT UNIQUE,
  name     TEXT NOT NULL,
  cost     INTEGER,
  note     TEXT,
  category TEXT
);

CREATE TABLE IF NOT EXISTS product_variants (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  color      TEXT,
  size       TEXT,
  quantity   INTEGER NOT NULL DEFAULT 0,
  img        TEXT,
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS movements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER,
  variant_id INTEGER,
  type       TEXT NOT NULL,
  quantity   INTEGER NOT NULL,
  user       TEXT,
  time       TEXT,
  note       TEXT,
  FOREIGN KEY(product_id) REFERENCES products(id),
  FOREIGN KEY(variant_id) REFERENCES product_variants(id)
);

CREATE TABLE IF NOT EXISTS attributes (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL,
  name        TEXT NOT NULL,
  color_code  TEXT,
  status      INTEGER NOT NULL DEFAULT 1,
  UNIQUE(type, name)
);
