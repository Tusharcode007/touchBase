# DEPLOY: set up touchbase for real

About 30 minutes, once. Everything here is free.
Do the steps **in order**: some need a value from an earlier step.

You will create: a MongoDB Atlas database, a Google Cloud OAuth client, a Render web service, and two GitHub secrets.

---

## Step 1: MongoDB Atlas (the database)
1. Sign up at https://www.mongodb.com/cloud/atlas and create a **free M0** cluster (pick a region near you, e.g. Mumbai).
2. **Database Access** → Add new database user → choose a long random password (use the "Autogenerate" button). Role: *Read and write to any database*.
3. **Network Access** → Add IP address → `0.0.0.0/0`.
   *Why:* free Render servers don't have a fixed IP address. The database is still protected by the user's password, so keep that password long and secret.
4. **Connect** → Drivers → copy the connection string. It looks like
   `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/`
   Add the database name `touchbase` at the end:
   `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/touchbase`
   This is your **`MONGODB_URI`**.

## Step 2: Render (the server). First pass, to get your URL
1. Sign up at https://render.com with GitHub.
2. **New → Blueprint** → choose the `touchBase` repository. Render reads `render.yaml`.
3. It asks for the values marked `sync: false`. For now fill in:
   - `MONGODB_URI`: from step 1
   - `ALLOWED_EMAILS`: your Gmail address (the only account allowed to sign in)
   - `APP_URL`: leave a placeholder like `https://touchbase.onrender.com` (you'll fix it in step 4)
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: put `todo` for now
   - `ANTHROPIC_API_KEY`: leave empty (optional, see step 7)
4. Create it. When the service exists, copy its address from the top of the page, e.g. `https://touchbase-abcd.onrender.com`. This is your **app URL**.
   (The first deploy fails until step 4 is done. That's expected: the server refuses to start without real Google keys.)

## Step 3: Google Cloud (sign-in + calendar access)
1. Open https://console.cloud.google.com → create a new project called `touchbase`.
2. **APIs & Services → Library** → search "Google Calendar API" → **Enable**.
3. **Google Auth Platform → Branding** (older screens call this "OAuth consent screen"):
   - App name `touchbase`, your email as the support and developer contact.
   - Audience: **External**.
4. **Data Access → Add or remove scopes** → add these three (paste them into "Manually add scopes"):
   ```
   https://www.googleapis.com/auth/calendar.events.owned
   https://www.googleapis.com/auth/calendar.events.readonly
   https://www.googleapis.com/auth/calendar.calendarlist.readonly
   ```
   (`openid`, `email` and `profile` are added automatically.)
5. **Clients → Create client** → type **Web application**. Under **Authorized redirect URIs** add both:
   ```
   http://localhost:5173/api/auth/google/callback
   https://YOUR-APP.onrender.com/api/auth/google/callback
   ```
   Save, then copy the **Client ID** and **Client secret**.
6. **Audience → Publish app** → status **In production**.
   ⚠️ **Important:** while an app is in "Testing", Google expires its login after **7 days** and touchbase would stop working every week. "In production" fixes that.
   Because the app uses calendar scopes and isn't verified by Google, you'll see a **"Google hasn't verified this app"** screen when you sign in. That's expected for a personal app: click **Advanced → Go to touchbase (unsafe)**. Only you can sign in anyway (`ALLOWED_EMAILS`).

## Step 4: Render. Fill in the real values
In Render → your service → **Environment**:
- `APP_URL` = your app URL from step 2 (no slash at the end)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` = from step 3

Save → Render redeploys. Open the app URL: you should see the sign-in page.

## Step 5: GitHub Actions (the hourly wake-up)
1. In Render → Environment, click the eye icon next to `CRON_SECRET` and copy its value.
2. On GitHub: repository → **Settings → Secrets and variables → Actions → New repository secret**:
   - `TOUCHBASE_URL` = your app URL (no slash at the end)
   - `CRON_SECRET` = the value you just copied
3. **Actions** tab → "Hourly tick" → **Run workflow** once. It should end green with "Server replied with HTTP 200".

## Step 6: First use
1. Open the app → **Sign in with Google** → allow all three calendar permissions.
2. **People** → add the people you want to call.
3. **Settings** → check your call windows, active days, active period and morning run time → Save.
4. **Today** → **Run now**. A "📞 Call …" event should appear in your Google Calendar for today.
5. Open the event on your phone: try the call and WhatsApp links.

## Step 7 (optional): AI talking points
1. Create an API key at https://console.anthropic.com.
2. Render → Environment → `ANTHROPIC_API_KEY` = the key → Save.
Only first names, relations and your notes are sent. Never phone numbers.

---

## Running locally with your real Google account
```bash
cp .env.example .env      # then fill it in (use your local values)
npm run secrets           # paste the three secrets into .env
npm install
npm run dev               # opens http://localhost:5173
```
Use a **different** database (or a different Atlas database name) and different secrets from production.

## If something goes wrong
- **Render log says "Cannot start touchbase: …"**: the message names the missing or weak setting. Fix it in Environment.
- **The dashboard says "Please sign in with Google again"**: you revoked access, or the app was still in "Testing" (step 3.6).
- **No call appears in the morning**: check the Actions tab. GitHub pauses schedules after 60 days without commits in a public repo. Click "Enable workflow". You can always press **Run now**.
- More in [FAILURE.md](FAILURE.md) and [ROLLBACK.md](ROLLBACK.md).
