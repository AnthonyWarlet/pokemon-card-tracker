# Pokémon Card Tracker

Application web **locale** pour gérer une collection de cartes Pokémon (anglaises 🇬🇧 et japonaises 🇯🇵)
et suivre leur **cote Cardmarket (MKM)**, mise à jour **automatiquement à chaque lancement**.

Conçue pour des collections importantes (2 000+ cartes). Les données de cartes et les prix
proviennent de l'API publique et gratuite [TCGdex](https://tcgdex.dev/), qui fournit la cote
Cardmarket en euros (`trend`, `avg`, `low`, moyennes 7 j / 30 j) pour l'anglais **et** le japonais.

## Fonctionnalités

- 🔎 Recherche de cartes par nom, en anglais ou en japonais (avec image)
- ➕ Ajout à la collection (langue, variante, quantité)
- 💶 Cote Cardmarket affichée par carte + **valeur totale** de la collection
- 🔄 Mise à jour automatique des prix **au démarrage** + bouton « Rafraîchir » manuel
- 🗂️ Tri et filtres (nom, set, langue, valeur)
- 📥/📤 Import & export **CSV** pour saisir/sauvegarder des cartes en masse
- 💾 Stockage local dans une base **SQLite** (`data/collection.db`)

## Prérequis

- [Node.js](https://nodejs.org/) 20 ou plus

## Démarrage rapide sur Windows (débutant)

1. Installe **Node.js** : va sur https://nodejs.org, télécharge la version **LTS**,
   ouvre le fichier `.msi` et clique « Next » jusqu'à « Install ».
2. Décompresse le dossier de l'application (clic droit sur le `.zip` → « Extraire tout »).
3. Ouvre le dossier et **double-clique sur `start-windows.bat`**.
   - La première fois, il installe les composants (1-2 min) puis ouvre l'appli
     dans ton navigateur sur http://localhost:3000.
   - Les fois suivantes, il ouvre directement l'appli.
4. Pour arrêter l'appli, ferme la fenêtre noire (ou appuie sur `Ctrl + C` dedans).

## Installation (en ligne de commande)

```bash
npm install
```

> `better-sqlite3` compile un module natif à l'installation — c'est automatique.

## Lancement

```bash
npm start
```

Puis ouvrez **http://localhost:3000** dans votre navigateur.

À chaque lancement, l'application met à jour la cote Cardmarket de toutes les cartes déjà
en collection (les prix récents de moins de 6 h ne sont pas re-téléchargés, sauf via le
bouton « Rafraîchir » qui force la mise à jour).

## Import CSV en masse

Le CSV doit contenir au minimum une colonne `card_id` (identifiant TCGdex, ex. `swsh4-25`).
Colonnes reconnues :

```csv
card_id,lang,variant,quantity,notes
swsh4-25,en,normal,1,
sv2a-6,ja,holo,2,Charizard ex
base1-4,en,normal,1,
```

- `lang` : `en` ou `ja` (défaut `en`)
- `variant` : `normal`, `holo`, `reverse`, … (défaut `normal`)
- `quantity` : entier (défaut `1`)

Utilisez le bouton **Export CSV** pour récupérer un modèle à partir de votre collection.

## Configuration (variables d'environnement optionnelles)

| Variable              | Défaut                | Description                                        |
| --------------------- | --------------------- | -------------------------------------------------- |
| `PORT`                | `3000`                | Port du serveur web                                |
| `DB_PATH`             | `data/collection.db`  | Emplacement de la base SQLite                      |
| `REFRESH_ON_START`    | `true`                | Mettre à jour les prix au démarrage                |
| `PRICE_TTL_HOURS`     | `6`                   | Durée de fraîcheur d'un prix avant re-téléchargement |
| `REFRESH_CONCURRENCY` | `8`                   | Nombre de requêtes de prix en parallèle            |

## Notes

- Toutes les cotes sont exprimées en **euros (EUR)**, comme sur Cardmarket.
- Certaines cartes (souvent très récentes ou promos) n'ont pas encore de cote Cardmarket :
  elles apparaissent alors comme « non dispo ».
- Les données restent **100 % locales** ; rien n'est envoyé ailleurs que vers l'API TCGdex
  pour récupérer les prix.
