# Microsoft Graph Email Integration — Complete Setup Guide

## Overview

Two ways to send email:

| Approach | How it works | Best for |
|---|---|---|
| **App-only** (client credentials) | Backend has a secret, calls Graph API directly — no user needed | Bulk/pre-alert emails from a shared mailbox like `prealert@fedex.com` |
| **Delegated (popup)** | User clicks "Connect Outlook", a popup asks for permission, app sends as **that user** | Per-user sending, quick setup, no shared mailbox needed |

The **popup flow** is what you want for a quick demo. Each teammate clicks "Connect Outlook" once, and the app can send emails as them.

---

## Step 1 — Create an Azure AD App Registration

1. Go to https://entra.microsoft.com
2. Sign in with a **FedEx corporate account** that has admin privileges (or ask your IT admin)
3. In the left sidebar, go to **Applications → App registrations**
4. Click **+ New registration**
5. Fill in:
   - **Name**: `Cargo-PAF-SendEngine` (or any name you like)
   - **Supported account types**: Select **"Accounts in this organizational directory only (FedEx only - Single tenant)"**
   - **Redirect URI**: Leave blank — not needed for this flow
6. Click **Register**

> ⚠️ **Important:** If you already created an app for the app-only flow, you can
> **reuse the same app**. Just add the SPA platform + delegated permissions below.

**→ You are now on the app's Overview page. Copy these two values:**

| Variable | Where to find it | Example |
|---|---|---|
| `AZURE_AD_TENANT_ID` | **Directory (tenant) ID** | `72f988bf-86f1-41af-91ab-2d7cd011db47` |
| `AZURE_AD_CLIENT_ID` | **Application (client) ID** | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` |

Save these in a temporary text file — you'll need them later.

---

## Step 2 — Create a Client Secret

1. In your app's page, click **Certificates & secrets** (left menu)
2. Go to the **Client secrets** tab
3. Click **+ New client secret**
4. Fill in:
   - **Description**: `SendEngine-secret`
   - **Expires**: Choose **12 months** or **24 months**
5. Click **Add**
6. **IMMEDIATELY copy the "Value" column** (it looks like a long random string)

> ⚠️ Azure shows the secret value only once. If you close the page without copying it,
> you'll have to delete and create a new one.

| Variable | Source |
|---|---|
| `AZURE_AD_CLIENT_SECRET` | The secret value you just copied |

---

## Step 3 — Add Microsoft Graph API Permissions

1. In your app's page, click **API permissions** (left menu)
2. Click **+ Add a permission**
3. Click **Microsoft Graph**
4. Click **Application permissions** (NOT Delegated — this is important!)
5. In the search box, type `Mail.Send`
6. Check the box next to **Mail.Send**
7. Click **Add permissions** at the bottom

---

## Step 4 — Grant Admin Consent

This is the step where most people get stuck. **Normal users cannot do this.**

1. On the **API permissions** page, you should now see:
   - `Microsoft Graph (1)` → `Mail.Send`
   - Status: **Not granted for FedEx**
2. Click the button **Grant admin consent for FedEx** (or similar name)
3. A dialog appears — click **Yes**
4. The status changes to: **Granted for FedEx** ✅

> ❗ **If you don't see the "Grant admin consent" button**, you don't have admin rights.
> You have two options:
> - **Option A**: Ask your IT admin to sign in and grant consent (they just need to visit
>   your app's API permissions page and click the button — takes 10 seconds)
> - **Option B**: If you can't find an admin, the app registration itself can be done by
>   anyone, but you'll need to pause at this step until admin consent is granted

Without admin consent, the token request will fail with:
`400 Bad Request: consent_required`

---

## 🆕 For the Popup Demo — Configure Delegated Permissions

If you want the **"Connect Outlook" popup** experience instead of the app-only flow,
add these extra steps. You can reuse the same app registration.

### 5a. Add a SPA Platform (for popup)

1. In your app's page, go to **Authentication** (left menu)
2. Click **+ Add a platform**
3. Choose **Single-page application (SPA)**
4. In **Redirect URIs**, enter: `http://localhost:3001`
5. Under **Implicit grant and hybrid flows**, make sure **Access tokens** is **unchecked**
   (MSAL.js uses the authorization code flow with PKCE, not implicit)
6. Click **Configure**

### 5b. Add Delegated Mail.Send Permission

1. Go to **API permissions** (left menu)
2. Click **+ Add a permission** → **Microsoft Graph**
3. This time, click **Delegated permissions** (NOT Application)
4. Search for `Mail.Send`
5. Check the box → **Add permissions**
6. Also add **User.Read** (Delegated) — this lets the popup show the user's name/email —
   search for `User.Read` and check it too

### 5c. Handle Admin Consent

**If your FedEx tenant allows user consent** (most do for basic permissions):
- When a teammate clicks "Connect Outlook", a popup shows asking:
  - "Allow this app to send emails as you?"
- They click **Accept** → done. No admin needed.

**If user consent is blocked** (common in enterprises):
- You'll see: *"Need admin approval"* in the popup
- Ask your Global Admin to grant admin consent for the delegated `Mail.Send`:
  - Same button as Step 4 — "Grant admin consent for FedEx"
  - Now it will consent to ALL permissions (Application + Delegated)

### 5d. No Client Secret Needed

For the popup flow, the browser uses MSAL.js directly. No client secret is required.
The `.env` file only needs `AZURE_AD_TENANT_ID` and `AZURE_AD_CLIENT_ID`.

---

## Step 5 (Alternative) — Restrict the App to Your Shared Mailbox

Without this step, if someone steals your client secret, they can send email as **any**
mailbox in FedEx. This step locks it down to one specific mailbox.

Ask your **Exchange Admin** to run this in Exchange Online PowerShell:

```powershell
Connect-ExchangeOnline  # sign in with admin account

New-ApplicationAccessPolicy `
  -AppId "a1b2c3d4-e5f6-7890-abcd-ef1234567890" `   # your CLIENT_ID
  -PolicyScopeGroupId "sharedmailbox@fedex.com" `     # the mailbox you'll send FROM
  -AccessRight RestrictAccess `
  -Description "Cargo PAF send engine"
```

> If you don't have an Exchange Admin handy, you can skip this step for testing.
> Just know the app can send as **any** mailbox until this policy is applied.

---

## Step 6 — Get a Shared Mailbox to Send From

Microsoft Graph needs a **sender** mailbox when you call `sendMail`. This should be a
**shared mailbox** (like `cargo-paf@fedex.com`), not your personal email.

- If you don't have a shared mailbox, ask your Exchange Admin to create one:
  ```powershell
  New-Mailbox -Shared -Name "Cargo PAF" -DisplayName "Cargo PAF" `
    -PrimarySmtpAddress "cargo-paf@fedex.com"
  ```
- For **testing only**, you can use your own `bipul.sikder@fedex.com` as the sender
  mailbox (though the app access policy won't be scoped yet)

---

## Step 7 — Run the Test Script

You already have the test script at:
```
/Users/bipulsikder16/Desktop/Fedex/Phase 1 /web-app/test outlook/test-graph-api.js
```

### 7a. Set your environment variables

Open your terminal and run:

```bash
cd "/Users/bipulsikder16/Desktop/Fedex/Phase 1 /web-app/test outlook"

export AZURE_AD_TENANT_ID="72f988bf-86f1-41af-91ab-2d7cd011db47"
export AZURE_AD_CLIENT_ID="a1b2c3d4-e5f6-7890-abcd-ef1234567890"
export AZURE_AD_CLIENT_SECRET="your-secret-value-here"
export MAILBOX="cargo-paf@fedex.com"
export RECIPIENT="bipul.sikder@fedex.com"
```

Replace the values with:
- `AZURE_AD_TENANT_ID` → The Directory (tenant) ID from Step 1
- `AZURE_AD_CLIENT_ID` → The Application (client) ID from Step 1
- `AZURE_AD_CLIENT_SECRET` → The secret value from Step 2
- `MAILBOX` → The shared mailbox email address (Step 6), or your own email for testing
- `RECIPIENT` → `bipul.sikder@fedex.com` (the email that will receive the test)

### 7b. Run the test

```bash
node test-graph-api.js
```

### What to expect:

**✅ Success:**
```
🔐 Requesting access token...
✓ Token obtained

📧 Sending test email from cargo-paf@fedex.com to bipul.sikder@fedex.com...
✓ Email sent successfully

✅ All tests passed.
```
Check bipul.sikder@fedex.com inbox — you should see the test email.

**❌ Failure — common errors:**

| Error | Likely cause | Fix |
|---|---|---|
| `Token request failed (400)` | Client ID/Secret/Tenant ID wrong | Double-check the values |
| `Token request failed (400): consent_required` | Admin consent not granted | Go back to Step 4 |
| `Send mail failed (403) Access denied` | Mail.Send permission missing or app not scoped to mailbox | Check Step 3; try removing the access policy temporarily |
| `Send mail failed (404) Resource not found` | Mailbox doesn't exist | Check that MAILBOX is a real mailbox |

---

### Popup Demo — Running the Web App

This is the demo I already built in `test outlook/`. It has the **"Connect Outlook"** button
experience.

1. First, make sure your `.env` file has:
   ```
   AZURE_AD_TENANT_ID=your-tenant-id
   AZURE_AD_CLIENT_ID=your-client-id
   AZURE_AD_CLIENT_SECRET=your-client-secret
   ```
   (Client secret is optional for the popup flow, but needed for the app-only send endpoint)

2. Start the server:
   ```bash
   cd "/Users/bipulsikder16/Desktop/Fedex/Phase 1 /web-app/test outlook"
   npm start
   ```

3. Open http://localhost:3001

4. Click **"Connect Outlook"** → a Microsoft popup appears:
   - You see: *"This app needs permission to send emails as you"*
   - Click **Accept**

5. Fill in recipient email (e.g. `bipul.sikder@fedex.com`) → **Send Email**

---

## Step 8 — What's Next? Integrating into the Web App

Once the test passes, the architecture for bulk email in your Next.js app is:

```
Your Browser         Next.js App (server)          Microsoft Graph API
    │                       │                             │
    │  upload xlsx         │                             │
    │─────────────────────►│                             │
    │                       │  ┌──────────────────────┐  │
    │                       │  │  API Route            │  │
    │                       │  │  /api/send-bulk       │  │
    │                       │  │                       │  │
    │                       │  │  1. Parse rows        │  │
    │                       │  │  2. Get access token  │──► POST /token
    │                       │  │  3. Loop rows         │  │
    │                       │  │  4. Send each email   │──► POST /users/{mailbox}/sendMail
    │                       │  │  5. Return results    │  │
    │                       │  └──────────────────────┘  │
    │◄──────────────────────│                             │
    │  "Sent 47 of 50"      │                             │
```

Key points:
- The token and secrets live **only on the server** (Next.js API route)
- The client never sees the Azure credentials
- Rate limiting: ~4 emails/second per mailbox, so 10,000 emails takes ~45 min
- Batching can be added with `Promise.all()` and chunking

Want me to build this bulk-send API route into your app once the test passes? Just say the word.
