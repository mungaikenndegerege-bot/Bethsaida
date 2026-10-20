# Bethsaida Electronics POS

A lightweight point-of-sale and inventory app for Bethsaida Electronics. GitHub Pages serves the app; the app saves its data in this browser using local storage. There is no Supabase or other online database.

## Features

- Product catalogue with SKU, category, last restock buying price, usual selling price, opening stock, and low-stock alerts.
- Starter catalogue of popular Kenyan-market phone, TV, sound, accessory, networking, computer, and appliance models, automatically added on first use when inventory is empty; enter your own prices and stock.
- Point of sale with receipt numbers, payment method, and stock checks.
- Record the buying cost for each restock and enter a negotiated selling price for each sale.
- Stock adjustments with a local movement history.
- Monthly sales summary and CSV download.
- JSON backup download and restore.
- Prices default to Kenyan shillings (KES).

## Important: browser-only data

Shop data is stored in local storage for the browser and website address where it was entered. It is **not uploaded, synced, or shared** with other devices or browsers. It may be lost if you clear browser/site data, use private browsing, or lose access to the device. Download backups regularly from **Settings → Data backup** and keep them somewhere safe. Restore a backup on another device by opening the same app there and choosing **Restore backup**.

The website itself is public on GitHub Pages. Shop records remain on the device and are not included in the public website files. Automatic email reports are not available in browser-only mode; download a monthly CSV from Reports to email it manually.

## Open the published app

Visit <https://mungaikenndegerege-bot.github.io/Bethsaida/>. The static app is deployed by the GitHub Actions workflow whenever changes are pushed to `main`.

On first use, the starter catalogue is automatically added when inventory is empty. It adds product names and SKUs only: selling prices and stock start at zero. Existing products and sales are preserved. In **Inventory**, choose **Add popular products** to add any starter items that are not already present. Set prices and receive stock before those products can be sold.

To run locally from this folder:

```powershell
py -m http.server 8000
```

Then visit <http://localhost:8000>. Note that the local URL and published URL have separate browser storage; use Settings backup/restore to move records between them.

## Publish updates

From the project folder, run:

```powershell
git add .
git commit -m "Describe your update"
git push
```

GitHub Actions deploys the update. Do not put customer data or backup JSON files in the repository.
