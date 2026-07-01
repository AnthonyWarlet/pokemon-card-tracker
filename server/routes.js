import express from "express";
import db from "./db.js";
import { searchCards, getCard, extractCardmarket, imageUrl } from "./tcgdex.js";
import { refreshAll, isRefreshing, getLastRefresh } from "./refresh.js";
import { SUPPORTED_LANGS } from "./config.js";

const router = express.Router();

const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function normalizeLang(lang) {
  const l = String(lang || "en").toLowerCase();
  return SUPPORTED_LANGS.includes(l) ? l : "en";
}

// --- Recherche de cartes ---
router.get(
  "/search",
  asyncH(async (req, res) => {
    const lang = normalizeLang(req.query.lang);
    const results = await searchCards(req.query.q, lang, 40);
    res.json(
      results.map((c) => ({
        card_id: c.id,
        local_id: c.localId != null ? String(c.localId) : null,
        name: c.name,
        image: imageUrl(c.image, "low"),
        image_base: c.image || null,
      }))
    );
  })
);

// --- Detail d'une carte (avant ajout) ---
router.get(
  "/card/:lang/:cardId",
  asyncH(async (req, res) => {
    const lang = normalizeLang(req.params.lang);
    const card = await getCard(req.params.cardId, lang);
    if (!card) return res.status(404).json({ error: "Carte introuvable" });
    res.json({
      card_id: card.id,
      lang,
      name: card.name,
      set_name: card.set?.name || null,
      set_id: card.set?.id || null,
      local_id: card.localId != null ? String(card.localId) : null,
      rarity: card.rarity || null,
      image: imageUrl(card.image, "high"),
      variants: card.variants || null,
      cardmarket: extractCardmarket(card),
    });
  })
);

// --- Collection : liste ---
router.get("/collection", (req, res) => {
  const rows = db.prepare("SELECT * FROM cards ORDER BY created_at DESC").all();
  res.json(rows.map(withImageUrl));
});

// --- Collection : statistiques ---
router.get("/stats", (req, res) => {
  const rows = db.prepare("SELECT * FROM cards").all();
  let totalCards = 0;
  let totalValue = 0;
  let priced = 0;
  const byLang = {};
  for (const r of rows) {
    totalCards += r.quantity;
    byLang[r.lang] = (byLang[r.lang] || 0) + r.quantity;
    const unit = r.price_trend ?? r.price_avg;
    if (typeof unit === "number") {
      totalValue += unit * r.quantity;
      priced += 1;
    }
  }
  res.json({
    entries: rows.length,
    totalCards,
    totalValue: Math.round(totalValue * 100) / 100,
    pricedEntries: priced,
    byLang,
    lastRefresh: getLastRefresh(),
    refreshing: isRefreshing(),
  });
});

const insertStmt = db.prepare(`
  INSERT INTO cards (card_id, lang, variant, quantity, name, set_name, set_id, local_id, rarity, image, notes)
  VALUES (@card_id, @lang, @variant, @quantity, @name, @set_name, @set_id, @local_id, @rarity, @image, @notes)
  ON CONFLICT(card_id, lang, variant) DO UPDATE SET quantity = quantity + excluded.quantity
`);

async function buildCardRow({ card_id, lang, variant, quantity, notes }) {
  const detail = await getCard(card_id, lang);
  if (!detail) return null;
  return {
    card_id,
    lang,
    variant: variant || "normal",
    quantity: Math.max(1, parseInt(quantity, 10) || 1),
    name: detail.name || null,
    set_name: detail.set?.name || null,
    set_id: detail.set?.id || null,
    local_id: detail.localId != null ? String(detail.localId) : null,
    rarity: detail.rarity || null,
    image: detail.image || null,
    notes: notes || null,
  };
}

// --- Collection : ajout ---
router.post(
  "/collection",
  asyncH(async (req, res) => {
    const lang = normalizeLang(req.body.lang);
    const card_id = String(req.body.card_id || "").trim();
    if (!card_id) return res.status(400).json({ error: "card_id requis" });
    const row = await buildCardRow({
      card_id,
      lang,
      variant: req.body.variant,
      quantity: req.body.quantity,
      notes: req.body.notes,
    });
    if (!row) return res.status(404).json({ error: "Carte introuvable sur TCGdex" });
    insertStmt.run(row);
    const saved = db
      .prepare("SELECT * FROM cards WHERE card_id = ? AND lang = ? AND variant = ?")
      .get(row.card_id, row.lang, row.variant);
    // Rafraichit le prix de cette carte en arriere-plan
    refreshAll({ force: false }).catch(() => {});
    res.status(201).json(withImageUrl(saved));
  })
);

// --- Collection : mise a jour quantite / notes ---
router.patch("/collection/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare("SELECT * FROM cards WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Entree introuvable" });
  const quantity =
    req.body.quantity != null
      ? Math.max(0, parseInt(req.body.quantity, 10) || 0)
      : existing.quantity;
  if (quantity === 0) {
    db.prepare("DELETE FROM cards WHERE id = ?").run(id);
    return res.json({ deleted: true, id });
  }
  const notes = req.body.notes != null ? String(req.body.notes) : existing.notes;
  db.prepare("UPDATE cards SET quantity = ?, notes = ? WHERE id = ?").run(quantity, notes, id);
  res.json(withImageUrl(db.prepare("SELECT * FROM cards WHERE id = ?").get(id)));
});

// --- Collection : suppression ---
router.delete("/collection/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const info = db.prepare("DELETE FROM cards WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ error: "Entree introuvable" });
  res.json({ deleted: true, id });
});

// --- Rafraichissement manuel ---
router.post(
  "/refresh",
  asyncH(async (req, res) => {
    const force = req.query.force === "true" || req.body?.force === true;
    const result = await refreshAll({ force });
    res.json(result);
  })
);

router.get("/refresh/status", (req, res) => {
  res.json({ refreshing: isRefreshing(), last: getLastRefresh() });
});

// --- Export CSV ---
router.get("/export.csv", (req, res) => {
  const rows = db.prepare("SELECT * FROM cards ORDER BY set_id, local_id").all();
  const headers = [
    "card_id", "lang", "variant", "quantity", "name", "set_name", "local_id",
    "rarity", "price_trend", "price_avg", "price_low", "price_updated", "notes",
  ];
  const escape = (v) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push(headers.map((h) => escape(r[h])).join(","));
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="collection.csv"');
  res.send(lines.join("\n"));
});

// --- Import CSV (card_id,lang,variant,quantity minimum) ---
router.post(
  "/import",
  express.text({ type: "*/*", limit: "10mb" }),
  asyncH(async (req, res) => {
    const text = String(req.body || "");
    const parsed = parseCsv(text);
    if (parsed.length === 0) return res.status(400).json({ error: "CSV vide ou invalide" });
    let added = 0;
    const errors = [];
    for (const entry of parsed) {
      const card_id = (entry.card_id || "").trim();
      if (!card_id) continue;
      const lang = normalizeLang(entry.lang);
      try {
        const row = await buildCardRow({
          card_id,
          lang,
          variant: entry.variant,
          quantity: entry.quantity,
          notes: entry.notes,
        });
        if (!row) {
          errors.push(`${card_id} (${lang}): introuvable`);
          continue;
        }
        insertStmt.run(row);
        added += 1;
      } catch (err) {
        errors.push(`${card_id}: ${err.message}`);
      }
    }
    refreshAll({ force: false }).catch(() => {});
    res.json({ added, errors });
  })
);

function withImageUrl(row) {
  if (!row) return row;
  return { ...row, image_url: imageUrl(row.image, "high") };
}

function parseCsv(text) {
  const rows = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return rows;
  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const obj = {};
    header.forEach((h, idx) => {
      obj[h] = cells[idx];
    });
    rows.push(obj);
  }
  return rows;
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export default router;
