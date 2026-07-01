import db from "./db.js";
import { getCard, extractCardmarket } from "./tcgdex.js";
import { REFRESH_CONCURRENCY, PRICE_TTL_HOURS } from "./config.js";

let running = false;
let rerunRequested = false;
let lastResult = null;

export function isRefreshing() {
  return running;
}

export function getLastRefresh() {
  return lastResult;
}

const updatePriceStmt = db.prepare(`
  UPDATE cards SET
    name          = COALESCE(?, name),
    set_name      = COALESCE(?, set_name),
    set_id        = COALESCE(?, set_id),
    local_id      = COALESCE(?, local_id),
    rarity        = COALESCE(?, rarity),
    image         = COALESCE(?, image),
    price_avg     = ?,
    price_low     = ?,
    price_trend   = ?,
    price_avg7    = ?,
    price_avg30   = ?,
    price_updated = ?,
    price_status  = ?,
    price_checked = datetime('now')
  WHERE id = ?
`);

const markCheckedStmt = db.prepare(`
  UPDATE cards SET price_status = ?, price_checked = datetime('now') WHERE id = ?
`);

function isFresh(row, ttlHours) {
  if (row.price_status !== "ok" || !row.price_checked) return false;
  const checked = new Date(row.price_checked + "Z").getTime();
  if (Number.isNaN(checked)) return false;
  return Date.now() - checked < ttlHours * 3600 * 1000;
}

async function refreshOne(row) {
  const card = await getCard(row.card_id, row.lang);
  if (!card) {
    markCheckedStmt.run("error", row.id);
    return "error";
  }
  const set = card.set || {};
  const cm = extractCardmarket(card);
  if (!cm) {
    updatePriceStmt.run(
      card.name ?? null,
      set.name ?? null,
      set.id ?? null,
      card.localId != null ? String(card.localId) : null,
      card.rarity ?? null,
      card.image ?? null,
      null, null, null, null, null, null,
      "unavailable",
      row.id
    );
    return "unavailable";
  }
  updatePriceStmt.run(
    card.name ?? null,
    set.name ?? null,
    set.id ?? null,
    card.localId != null ? String(card.localId) : null,
    card.rarity ?? null,
    card.image ?? null,
    cm.avg, cm.low, cm.trend, cm.avg7, cm.avg30, cm.updated,
    "ok",
    row.id
  );
  return "ok";
}

/**
 * Rafraichit les prix de la collection.
 * @param {object} opts
 * @param {boolean} opts.force  Ignore le TTL et rafraichit tout.
 */
export async function refreshAll({ force = false } = {}) {
  // Si un rafraichissement tourne deja, on demande une nouvelle passe a la fin
  // pour que les cartes ajoutees entre-temps soient bien mises a jour.
  if (running) {
    rerunRequested = true;
    return { skipped: true, reason: "already-running" };
  }
  running = true;
  const startedAt = new Date().toISOString();
  const rows = db.prepare("SELECT * FROM cards").all();
  const targets = force ? rows : rows.filter((r) => !isFresh(r, PRICE_TTL_HOURS));

  const counts = { ok: 0, unavailable: 0, error: 0 };
  let index = 0;

  async function worker() {
    while (index < targets.length) {
      const row = targets[index++];
      try {
        const status = await refreshOne(row);
        counts[status] = (counts[status] || 0) + 1;
      } catch (err) {
        counts.error += 1;
        markCheckedStmt.run("error", row.id);
        console.error(`Erreur prix ${row.card_id} (${row.lang}):`, err.message);
      }
    }
  }

  try {
    const workers = Array.from(
      { length: Math.min(REFRESH_CONCURRENCY, targets.length || 1) },
      () => worker()
    );
    await Promise.all(workers);
  } finally {
    running = false;
  }

  lastResult = {
    startedAt,
    finishedAt: new Date().toISOString(),
    total: rows.length,
    refreshed: targets.length,
    skipped: rows.length - targets.length,
    counts,
  };

  if (rerunRequested) {
    rerunRequested = false;
    // Nouvelle passe (sans force) pour recuperer les cartes ajoutees pendant celle-ci.
    return refreshAll({ force: false });
  }
  return lastResult;
}
