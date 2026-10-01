# Secret Lair: Worth It?

A static GitHub Pages application that compares Secret Lair products with the cheapest eligible paper printings of their cards. It reads current US shop availability from Wizards' StoreSearch feed and refreshes Scryfall group and price data during deployment.

## Local development

```bash
npm install
npm run generate:data
npm run dev
```

The data generator downloads Scryfall's daily bulk export, so the first run transfers a compressed file of roughly 75 MB.

To refresh only recent Secret Lair announcement metadata:

```bash
npm run generate:announcements
```

The command scans the first six announcement archive pages by default, which covers roughly the recent couple of months. Override the depth or output path when needed:

```bash
npm run generate:announcements -- --pages 4 --output ./public/data/announcements.json
```

## Validation

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## GitHub Pages

The deployment workflow runs on pushes to `main`, once per day, and through the GitHub Actions **Run workflow** control. Each deployment refreshes Scryfall data, shop availability, and recent Secret Lair announcement release metadata. Manual workflow dispatch requires repository write access; site visitors cannot trigger a refresh.

In the repository settings, configure **Pages → Build and deployment → Source** to **GitHub Actions**.

Scryfall bulk prices can be up to 24 hours old and are presented as estimates rather than storefront quotes.
