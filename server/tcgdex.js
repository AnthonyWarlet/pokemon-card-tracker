import { SUPPORTED_LANGS } from "./config.js";

const BASE_URL = "https://api.tcgdex.net/v2";

function assertLang(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) {
    throw new Error(`Langue non supportee: ${lang}`);
  }
}

async function tcgdexFetch(url) {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`TCGdex ${res.status} ${res.statusText} pour ${url}`);
  }
  return res.json();
}

/**
 * Recherche de cartes par nom dans une langue donnee.
 * Retourne une liste allegee: { id, localId, name, image }.
 */
export async function searchCards(query, lang = "en", limit = 30) {
  assertLang(lang);
  const q = String(query || "").trim();
  if (!q) return [];
  const params = new URLSearchParams();
  params.set("name", `like:${q}`);
  params.set("pagination:page", "1");
  params.set("pagination:itemsPerPage", String(limit));
  const url = `${BASE_URL}/${lang}/cards?${params.toString()}`;
  const data = await tcgdexFetch(url);
  return Array.isArray(data) ? data : [];
}

/**
 * Detail complet d'une carte, incluant le set et le pricing Cardmarket.
 */
export async function getCard(cardId, lang = "en") {
  assertLang(lang);
  const url = `${BASE_URL}/${lang}/cards/${encodeURIComponent(cardId)}`;
  return tcgdexFetch(url);
}

/**
 * Extrait la cote Cardmarket (EUR) depuis un objet carte TCGdex.
 * Retourne null si aucune donnee de prix n'est disponible.
 */
export function extractCardmarket(card) {
  const cm = card?.pricing?.cardmarket;
  if (!cm) return null;
  const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    avg: num(cm.avg),
    low: num(cm.low),
    trend: num(cm.trend),
    avg7: num(cm.avg7),
    avg30: num(cm.avg30),
    updated: cm.updated || null,
  };
}

/**
 * Construit l'URL d'une image TCGdex a partir de la base fournie.
 * quality: low | high ; extension: png | jpg | webp
 */
export function imageUrl(base, quality = "low", extension = "webp") {
  if (!base) return null;
  return `${base}/${quality}.${extension}`;
}
