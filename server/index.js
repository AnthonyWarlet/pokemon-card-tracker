import express from "express";
import router from "./routes.js";
import { refreshAll } from "./refresh.js";
import { PORT, PUBLIC_DIR, REFRESH_ON_START } from "./config.js";
import db from "./db.js";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use("/api", router);
app.use(express.static(PUBLIC_DIR));

// Gestion centralisee des erreurs API
app.use((err, req, res, next) => {
  console.error("Erreur API:", err.message);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: err.message || "Erreur interne" });
});

app.listen(PORT, () => {
  const count = db.prepare("SELECT COUNT(*) AS n FROM cards").get().n;
  console.log(`\n  Pokemon Card Tracker`);
  console.log(`  -> http://localhost:${PORT}`);
  console.log(`  ${count} entree(s) en collection\n`);

  if (REFRESH_ON_START && count > 0) {
    console.log("  Mise a jour des cotes Cardmarket au demarrage...");
    refreshAll({ force: false })
      .then((r) =>
        console.log(
          `  Cotes mises a jour: ${r.counts?.ok || 0} ok, ` +
            `${r.counts?.unavailable || 0} indispo, ${r.counts?.error || 0} erreur(s)\n`
        )
      )
      .catch((e) => console.error("  Echec du rafraichissement au demarrage:", e.message));
  }
});
