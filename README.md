# Bethsaida Electronics POS

A browser-based point-of-sale and inventory app for Bethsaida Electronics, styled around the Rhema Mobile Technologies shop-floor POS reference. It uses Supabase for shared, account-isolated data, records stock changes with sales, and provides monthly CSV reports. Prices default to Kenyan shillings (KES).

## Included

- Email/password account sign-in and shop setup.
- Product catalogue with SKU, category, selling price, opening stock, and low-stock alert level.
- Stock receiving, corrections, returns, and write-offs recorded in an inventory movement ledger.
- Point of sale with receipt numbers, stock validation, and atomic checkout.
- Monthly sales dashboard and downloadable line-item CSV.
- Optional scheduled month-end email with a CSV attachment.
- Row Level Security and server-side stock/sale operations in Supabase.

## 1. Create the Supabase project

1. Create a project at [supabase.com](https://supabase.com/).
2. In the Supabase SQL Editor, run the complete contents of [`supabase-schema.sql`](./supabase-schema.sql).
3. In **Project Settings → API**, copy the Project URL and the publishable key (or legacy anon key). The app asks for these the first time it opens.
4. Keep email/password authentication enabled in **Authentication → Providers**. For a quick test, disable email confirmation in **Authentication → Providers → Email**; for a live shop, keep confirmation enabled and configure SMTP so account emails are delivered reliably.

The browser key is intended to be public. Row Level Security is enabled on all shop tables. Do not put the Supabase service-role key in the browser app.

## 2. Open the app

The app is static and does not require a build step. From this folder, start a local web server:

```powershell
py -m http.server 8000
```

Then open <http://localhost:8000>. (If `py` is unavailable, use another static web server.) Enter the Supabase Project URL and publishable/anon key, then create an account. The first account setup creates the shop profile automatically.

For use on more than one device, host these static files on an HTTPS static host and open the same hosted URL on each device. All devices connect to the same Supabase project; each signed-in account can only access its own shop data.

## 3. Publish with GitHub Pages

1. Create a **public, empty** repository on GitHub (do not initialize it with a README, license, or `.gitignore`). A public repository is needed for GitHub Pages on the free plan. The site itself is public, but shop data remains behind Supabase sign-in and Row Level Security.
2. In PowerShell, change to this app folder and connect it to the new repository. Replace the URL with your own GitHub repository URL:

   ```powershell
   git init
   git add .
   git commit -m "Create Bethsaida Electronics POS"
   git branch -M main
   git remote add origin https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPOSITORY.git
   git push -u origin main
   ```

3. In the repository on GitHub, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions**.
4. Open the **Actions** tab. The included workflow deploys the static app after a push to `main`. When it completes, the site is available at `https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPOSITORY/`.
5. Open the deployed site, enter the Supabase Project URL and publishable/anon key, and create your account.
6. In Supabase, open **Authentication → URL Configuration** and add the GitHub Pages URL to **Redirect URLs** (including the repository path and `/**`, for example `https://YOUR_GITHUB_USERNAME.github.io/YOUR_REPOSITORY/**`). This lets email confirmation and password recovery return to the hosted app.

Do not commit Supabase service-role keys, Resend API keys, or the monthly report secret. GitHub Pages hosts only the public static files; the database and scheduled email function remain on Supabase.

## 4. Set up month-end email (optional)

The Reports page and CSV download work without email configuration. To send an email report automatically:

1. Verify a sender domain with [Resend](https://resend.com/) and create an API key.
2. Install and link the Supabase CLI, then deploy the Edge Function:

   ```powershell
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase secrets set RESEND_API_KEY=re_xxxxxxxxx REPORT_FROM_EMAIL="Bethsaida Electronics <reports@your-verified-domain.com>" MONTHLY_REPORT_SECRET=YOUR_LONG_RANDOM_SECRET
   supabase functions deploy monthly-report --no-verify-jwt
   ```

   Set `MONTHLY_REPORT_SECRET` to a long random value and keep it private. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to the function. The service-role key is used only in the server-side function, never in the browser.

3. In the Supabase SQL Editor, enable the scheduler, HTTP extension, and Vault, then store the same random secret so the scheduled request can authenticate:

   ```sql
   create extension if not exists pg_cron with schema pg_catalog;
   create extension if not exists pg_net with schema extensions;
   create extension if not exists vault with schema vault;

   select vault.create_secret('YOUR_LONG_RANDOM_SECRET', 'monthly_report_secret');
   ```

4. Replace `YOUR_PROJECT_REF` below and schedule the function. It is checked daily at 23:59 in Kenya time and only sends on the last day of the month.

   ```sql
   select cron.schedule(
     'counterstock-monthly-report',
     '59 20 * * *',
     $$
       select net.http_post(
         url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/monthly-report',
         headers := jsonb_build_object(
           'Content-Type', 'application/json',
           'x-monthly-report-secret',
           (select decrypted_secret from vault.decrypted_secrets where name = 'monthly_report_secret')
         ),
         body := '{}'::jsonb
       );
     $$
   );
   ```

5. Sign in to the app, open **Settings**, save the shop name and the recipient email address. Reports are sent to this address at the end of each month. The attached CSV contains sale line items; the email summarizes revenue, transaction count, and units sold.

To inspect or remove the scheduled job, use the SQL Editor:

```sql
select jobid, schedule, command from cron.job where jobname = 'counterstock-monthly-report';
select cron.unschedule('counterstock-monthly-report');
```

The month-end schedule uses Africa/Nairobi time (UTC+3). Report data is bounded to the calendar month in that timezone.

## Operational notes

- Checkout is an atomic database operation. A sale is rejected if any product has insufficient stock; it does not partially complete.
- Stock is changed through the stock-adjustment operation or completed sales, with each change recorded in `inventory_movements`.
- A sale records product name, SKU, price, and quantity snapshots, so historical reports remain intact if catalogue details later change.
- Supabase's default project limits and backup policies apply. Configure production backups, account recovery, and email delivery for your needs before relying on the app for business records.
