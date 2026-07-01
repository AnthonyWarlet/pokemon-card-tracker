"use strict";

const state = {
  searchLang: "en",
  collection: [],
  filterText: "",
  filterLang: "",
  sortBy: "created",
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const eur = (v) =>
  typeof v === "number"
    ? v.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })
    : "—";

function banner(msg, type = "info", timeout = 4000) {
  const el = $("#banner");
  el.textContent = msg;
  el.className = `banner ${type}`;
  el.hidden = false;
  if (timeout) setTimeout(() => (el.hidden = true), timeout);
}

async function api(path, options) {
  const res = await fetch(`/api${path}`, options);
  const ct = res.headers.get("content-type") || "";
  const body = ct.includes("json") ? await res.json() : await res.text();
  if (!res.ok) throw new Error(body?.error || res.statusText);
  return body;
}

// ---------- Recherche ----------
$("#search-lang").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-lang]");
  if (!btn) return;
  state.searchLang = btn.dataset.lang;
  $$("#search-lang button").forEach((b) => b.classList.toggle("active", b === btn));
});

$("#btn-search").addEventListener("click", doSearch);
$("#search-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") doSearch();
});

async function doSearch() {
  const q = $("#search-input").value.trim();
  if (!q) return;
  const grid = $("#search-results");
  grid.innerHTML = '<div class="empty"><span class="spinner"></span> Recherche…</div>';
  try {
    const results = await api(`/search?q=${encodeURIComponent(q)}&lang=${state.searchLang}`);
    if (results.length === 0) {
      grid.innerHTML = '<div class="empty">Aucun résultat.</div>';
      return;
    }
    grid.innerHTML = "";
    for (const c of results) {
      const div = document.createElement("div");
      div.className = "result-card";
      div.innerHTML = `
        <img src="${c.image || placeholder()}" alt="${escapeHtml(c.name)}" onerror="this.src='${placeholder()}'" />
        <div class="rc-name">${escapeHtml(c.name || "?")}</div>
        <div class="rc-id">${escapeHtml(c.card_id)}</div>`;
      div.addEventListener("click", () => openCardModal(c.card_id, state.searchLang));
      grid.appendChild(div);
    }
  } catch (err) {
    grid.innerHTML = `<div class="empty">Erreur : ${escapeHtml(err.message)}</div>`;
  }
}

function placeholder() {
  return (
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='245' height='337'%3E%3Crect width='245' height='337' rx='12' fill='%23222741'/%3E%3Ctext x='50%25' y='50%25' fill='%239aa0c3' font-size='16' text-anchor='middle'%3Epas d'image%3C/text%3E%3C/svg%3E"
  );
}

// ---------- Modal detail / ajout ----------
async function openCardModal(cardId, lang) {
  const modal = $("#modal");
  const card = $("#modal-card");
  modal.hidden = false;
  card.innerHTML = '<div class="empty"><span class="spinner"></span> Chargement…</div>';
  try {
    const c = await api(`/card/${lang}/${encodeURIComponent(cardId)}`);
    const cm = c.cardmarket;
    card.innerHTML = `
      <div class="modal-grid">
        <img src="${c.image || placeholder()}" onerror="this.src='${placeholder()}'" />
        <div class="modal-info">
          <h3>${escapeHtml(c.name || "?")}</h3>
          <div class="rc-id">${escapeHtml(c.set_name || "")} · N° ${escapeHtml(c.local_id || "?")} · ${escapeHtml(c.rarity || "")}</div>
          <span class="badge ${lang}">${lang.toUpperCase()}</span>
          <table class="price-table">
            <tr><td>Tendance (trend)</td><td class="num ${cm?.trend != null ? "price-ok" : "price-na"}">${eur(cm?.trend)}</td></tr>
            <tr><td>Prix moyen</td><td class="num">${eur(cm?.avg)}</td></tr>
            <tr><td>Prix bas (low)</td><td class="num">${eur(cm?.low)}</td></tr>
            <tr><td>Moyenne 7j</td><td class="num">${eur(cm?.avg7)}</td></tr>
            <tr><td>Moyenne 30j</td><td class="num">${eur(cm?.avg30)}</td></tr>
          </table>
          ${cm ? "" : '<p class="price-na">Cote Cardmarket non disponible pour cette carte.</p>'}
          <div class="modal-actions">
            <label>Qté <input type="number" id="modal-qty" class="qty-input" value="1" min="1" /></label>
            ${variantSelect(c.variants)}
            <button class="btn btn-primary" id="modal-add">＋ Ajouter à ma collection</button>
            <button class="btn" id="modal-close">Fermer</button>
          </div>
        </div>
      </div>`;
    $("#modal-close").addEventListener("click", closeModal);
    $("#modal-add").addEventListener("click", async () => {
      const quantity = parseInt($("#modal-qty").value, 10) || 1;
      const variant = $("#modal-variant") ? $("#modal-variant").value : "normal";
      try {
        await api("/collection", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ card_id: cardId, lang, quantity, variant }),
        });
        closeModal();
        banner(`« ${c.name} » ajoutée à la collection.`, "ok");
        await loadCollection();
        await loadStats();
      } catch (err) {
        banner("Erreur ajout : " + err.message, "err");
      }
    });
  } catch (err) {
    card.innerHTML = `<div class="empty">Erreur : ${escapeHtml(err.message)}<br><button class="btn" onclick="document.getElementById('modal').hidden=true">Fermer</button></div>`;
  }
}

function variantSelect(variants) {
  if (!variants) return "";
  const opts = Object.entries(variants)
    .filter(([, v]) => v)
    .map(([k]) => `<option value="${k}">${k}</option>`);
  if (opts.length <= 1) return "";
  return `<label>Variante <select id="modal-variant" class="qty-input" style="width:auto">${opts.join("")}</select></label>`;
}

function closeModal() {
  $("#modal").hidden = true;
}
$("#modal").addEventListener("click", (e) => {
  if (e.target === $("#modal")) closeModal();
});

// ---------- Collection ----------
async function loadCollection() {
  state.collection = await api("/collection");
  renderCollection();
}

function renderCollection() {
  const body = $("#collection-body");
  let rows = [...state.collection];

  if (state.filterLang) rows = rows.filter((r) => r.lang === state.filterLang);
  if (state.filterText) {
    const t = state.filterText.toLowerCase();
    rows = rows.filter(
      (r) =>
        (r.name || "").toLowerCase().includes(t) ||
        (r.set_name || "").toLowerCase().includes(t) ||
        (r.card_id || "").toLowerCase().includes(t)
    );
  }

  const unit = (r) => r.price_trend ?? r.price_avg ?? 0;
  rows.sort((a, b) => {
    switch (state.sortBy) {
      case "value":
        return unit(b) * b.quantity - unit(a) * a.quantity;
      case "name":
        return (a.name || "").localeCompare(b.name || "");
      case "set":
        return (a.set_id || "").localeCompare(b.set_id || "") || (Number(a.local_id) - Number(b.local_id));
      default:
        return b.id - a.id;
    }
  });

  $("#collection-empty").hidden = state.collection.length > 0;
  body.innerHTML = "";
  for (const r of rows) {
    const u = r.price_trend ?? r.price_avg;
    const total = typeof u === "number" ? u * r.quantity : null;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><img class="thumb" src="${r.image_url || placeholder()}" onerror="this.src='${placeholder()}'" /></td>
      <td>${escapeHtml(r.name || r.card_id)}<div class="rc-id">${escapeHtml(r.card_id)}${r.variant && r.variant !== "normal" ? " · " + escapeHtml(r.variant) : ""}</div></td>
      <td>${escapeHtml(r.set_name || "—")}<div class="rc-id">N° ${escapeHtml(r.local_id || "?")}</div></td>
      <td><span class="badge ${r.lang}">${r.lang.toUpperCase()}</span></td>
      <td><input type="number" class="qty-input" value="${r.quantity}" min="0" data-id="${r.id}" /></td>
      <td class="num ${u != null ? "price-ok" : "price-na"}">${priceCell(r)}</td>
      <td class="num">${eur(r.price_low)}</td>
      <td class="num">${eur(r.price_avg30)}</td>
      <td class="num">${eur(total)}</td>
      <td class="rc-id">${fmtDate(r.price_updated)}</td>
      <td><button class="btn btn-danger" data-del="${r.id}">✕</button></td>`;
    body.appendChild(tr);
  }

  body.querySelectorAll("input.qty-input").forEach((inp) =>
    inp.addEventListener("change", async () => {
      const id = inp.dataset.id;
      const quantity = parseInt(inp.value, 10);
      try {
        await api(`/collection/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity }),
        });
        await loadCollection();
        await loadStats();
      } catch (err) {
        banner("Erreur : " + err.message, "err");
      }
    })
  );

  body.querySelectorAll("button[data-del]").forEach((btn) =>
    btn.addEventListener("click", async () => {
      if (!confirm("Supprimer cette carte de la collection ?")) return;
      await api(`/collection/${btn.dataset.del}`, { method: "DELETE" });
      await loadCollection();
      await loadStats();
    })
  );

  body.querySelectorAll("img.thumb").forEach((img, i) => {
    const r = rows[i];
    img.addEventListener("click", () => openCardModal(r.card_id, r.lang));
  });
}

function priceCell(r) {
  if (r.price_status === "unavailable") return '<span class="price-na">non dispo</span>';
  const u = r.price_trend ?? r.price_avg;
  return eur(u);
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

// ---------- Stats ----------
async function loadStats() {
  const s = await api("/stats");
  $("#stat-cards").textContent = s.totalCards;
  $("#stat-entries").textContent = s.entries;
  $("#stat-value").textContent = eur(s.totalValue);
}

// ---------- Filtres ----------
$("#filter-text").addEventListener("input", (e) => {
  state.filterText = e.target.value;
  renderCollection();
});
$("#filter-lang").addEventListener("change", (e) => {
  state.filterLang = e.target.value;
  renderCollection();
});
$("#sort-by").addEventListener("change", (e) => {
  state.sortBy = e.target.value;
  renderCollection();
});

// ---------- Rafraichissement ----------
$("#btn-refresh").addEventListener("click", async () => {
  const btn = $("#btn-refresh");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Mise à jour…';
  try {
    const r = await api("/refresh?force=true", { method: "POST" });
    banner(
      `Cotes mises à jour : ${r.counts?.ok || 0} OK, ${r.counts?.unavailable || 0} indispo, ${r.counts?.error || 0} erreur(s).`,
      "ok"
    );
    await loadCollection();
    await loadStats();
  } catch (err) {
    banner("Erreur rafraîchissement : " + err.message, "err");
  } finally {
    btn.disabled = false;
    btn.innerHTML = "↻ Rafraîchir les cotes";
  }
});

// ---------- Import CSV ----------
$("#btn-import").addEventListener("click", () => $("#file-import").click());
$("#file-import").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  banner("Import en cours…", "info", 0);
  try {
    const r = await api("/import", {
      method: "POST",
      headers: { "Content-Type": "text/csv" },
      body: text,
    });
    banner(
      `${r.added} carte(s) importée(s).` + (r.errors?.length ? ` ${r.errors.length} erreur(s).` : ""),
      r.errors?.length ? "info" : "ok"
    );
    await loadCollection();
    await loadStats();
  } catch (err) {
    banner("Erreur import : " + err.message, "err");
  }
  e.target.value = "";
});

// ---------- Utils ----------
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// ---------- Init ----------
(async function init() {
  try {
    await loadCollection();
    await loadStats();
    const st = await api("/refresh/status");
    if (st.refreshing) banner("Mise à jour des cotes en cours au démarrage…", "info", 6000);
  } catch (err) {
    banner("Erreur au chargement : " + err.message, "err");
  }
})();
