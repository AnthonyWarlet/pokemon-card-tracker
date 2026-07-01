import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT_DIR = path.resolve(__dirname, "..");
export const DATA_DIR = path.join(ROOT_DIR, "data");
export const PUBLIC_DIR = path.join(ROOT_DIR, "public");
export const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, "collection.db");

export const PORT = Number(process.env.PORT) || 3000;

// Langues supportees par TCGdex utilisees dans l'app.
export const SUPPORTED_LANGS = ["en", "ja"];

// Nombre de requetes de prix effectuees en parallele lors d'un rafraichissement.
export const REFRESH_CONCURRENCY = Number(process.env.REFRESH_CONCURRENCY) || 8;

// Ne pas rafraichir un prix plus recent que ce delai (en heures) sauf si force.
export const PRICE_TTL_HOURS = Number(process.env.PRICE_TTL_HOURS) || 6;

// Rafraichir automatiquement la collection au demarrage du serveur.
export const REFRESH_ON_START = process.env.REFRESH_ON_START !== "false";
