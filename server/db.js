import fs from "node:fs";
import Database from "better-sqlite3";
import { DATA_DIR, DB_PATH } from "./config.js";

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS cards (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id       TEXT NOT NULL,           -- id TCGdex, ex: swsh4-25
    lang          TEXT NOT NULL,           -- en | ja
    variant       TEXT NOT NULL DEFAULT 'normal',
    quantity      INTEGER NOT NULL DEFAULT 1,
    name          TEXT,
    set_name      TEXT,
    set_id        TEXT,
    local_id      TEXT,
    rarity        TEXT,
    image         TEXT,
    notes         TEXT,
    -- Prix Cardmarket (EUR) issus de TCGdex
    price_avg     REAL,
    price_low     REAL,
    price_trend   REAL,
    price_avg7    REAL,
    price_avg30   REAL,
    price_updated TEXT,                     -- ISO string fournie par la source
    price_status  TEXT DEFAULT 'pending',   -- pending | ok | unavailable | error
    price_checked TEXT,                     -- ISO string du dernier essai local
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(card_id, lang, variant)
  );

  CREATE INDEX IF NOT EXISTS idx_cards_lang ON cards(lang);
  CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name);
`);

export default db;
