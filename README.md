# FedEx Cargo Operations Toolkit

Two internal tools built to remove two separate manual, error-prone, paperwork bottlenecks in day-to-day cargo operations — a TIFF-to-PDF converter and a bulk Arrival Notice generator — sharing one login and one admin analytics dashboard.

---

## Problem Statement

### 1. Invoices stuck in the wrong file format
Team members were fetching invoices from ACCS (internal software) in bulk, but the downloaded files were in `.tiff` format. Customers requested invoices to be shared in `.pdf` format instead, which created a manual conversion bottleneck — someone had to open each TIFF and convert/export it individually before it could be sent out.

### 2. Cargo Arrival Notices were being hand-typed into email, not generated as documents
Every day, the cargo team receives an Excel sheet with one row per inbound shipment — MAWB number, IGM number, flight, AWB, consignee, pieces, weight, origin, destination, value, contents, and more. For every single row, the team was:

- Manually reading the relevant fields out of the spreadsheet
- Copy-pasting them one at a time into the body of an Outlook email
- Typing up the IGM number, flight details, AWB, and charges by hand into free-form email text
- Sending that email directly to the consignee, with **no formal document attached at all**

This had several concrete problems:
- **No structured document** — customers received a plain email instead of a proper Cargo Arrival Notice, which looks unofficial and doesn't match how the rest of the industry (and FedEx's own branded paperwork) communicates arrivals.
- **Slow at volume** — a day's Excel sheet can have dozens of rows; copy-pasting each one into a new email individually does not scale.
- **Error-prone** — manually retyping/copy-pasting IGM numbers, AWB numbers, and flight details out of a spreadsheet cell by hand is exactly the kind of repetitive data entry that produces typos, especially under time pressure.
- **No validation** — there was nothing stopping an email from going out with a blank AWB, a missing weight, or a malformed shipment reference, because it was just free text.
- **No audit trail / consistency** — every agent wrote the email slightly differently, with no guarantee the same information appeared in the same place every time.

## Solution
A modern web application with two tools sharing a single login, both fully client-side:

**TIFF to PDF Converter**
- Unified upload for TIFF files, entire folders, or ZIP files containing TIFFs
- Automatic single-file (PDF) or multi-file (ZIP of PDFs) downloads
- Client-side conversion — files never leave your browser
- Parallel batch processing with live per-file status

**Arrival Notice Generator**
- Upload an Excel sheet (one row per shipment)
- Validates required fields per row up front and flags invalid rows before generation
- Generates a formatted "Cargo Arrival Notice" PDF per valid row (dynamic IGM/AWB/Flight/Origin/Destination/Weight fields parsed from the sheet)
- Downloads all generated PDFs as a single ZIP, each file named `<AWB>.pdf`

Both tools share:
- User authentication with Supabase
- Admin dashboard for tracking analytics per tool
- Beautiful, easy-to-use interface

## Tech Stack
- **Frontend**: Next.js 14 (React), Tailwind CSS
- **Database & Auth**: Supabase
- **File Handling**: JSZip, pdf-lib, utif, xlsx (SheetJS)
- **Conversion**: Browser Canvas API / pdf-lib (zero server uploads)

---

## How the Arrival Notice Problem Was Solved

The fix was to replace "read the spreadsheet → type an email" with a single upload:

1. **Upload the same Excel sheet the team already produces** — no new process, no new spreadsheet format to learn. The columns (MAWB No., AWB, Company Name, Pcs, WT(KG), ORG, DEST, VALUE, Contents, etc.) are read directly from the existing sheet layout.
2. **Every row is validated before anything is generated.** The app checks, per row, that the Date, MAWB No. (and everything embedded in it — Master AWB number, IGM number, flight number, flight date), AWB, Company Name, Pcs, WT(KG), ORG, DEST, VALUE and Contents are all present and well-formed. Any row that fails is listed immediately with the exact reason (e.g. *"Row 14: could not parse MAWB No."*), so bad data is caught **before** a single document is produced — not after it's already been emailed out.
3. **Every valid row becomes a real, branded PDF** — the same "Cargo Arrival Notice" format FedEx already uses, with the IGM number, AWB number, Master AWB, flight details, origin/destination, pieces/weight, value/contents, and standard charges laid out in a proper bordered document instead of free-form email text. Key operational details (arrival city, warehouse name, working-day deadlines, Customs Holiday rules) are bolded so they're impossible to miss when skimming.
4. **All the generated PDFs come back as one ZIP**, each file named after the shipment's AWB number, ready to be attached/forwarded — turning what used to be dozens of individually hand-typed emails into one upload and one download.

The net effect: the team keeps working from the same Excel sheet they already get every day, but instead of manually retyping shipment details into email bodies one at a time, they get a validated batch of correctly formatted, professional PDF documents in the time it takes to upload a file.

---

## Setup Guide

### 1. Create a Supabase Project
1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for your project to initialize
3. Note your Project URL and Project API Key (anon public) - you'll need these later!

### 2. Setup Database Tables
Run these SQL commands in your Supabase SQL Editor (https://supabase.com/dashboard/project/[your-project-id]/sql/new):

```sql
-- Create users table
CREATE TABLE users (
    id UUID DEFAULT auth.uid() PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create conversions table
CREATE TABLE conversions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    files_converted INT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversions ENABLE ROW LEVEL SECURITY;

-- Users can read their own data
CREATE POLICY "Users can view own profile" 
    ON users FOR SELECT 
    USING (auth.uid() = id);

-- Users can insert their own profile
CREATE POLICY "Users can insert own profile" 
    ON users FOR INSERT 
    WITH CHECK (auth.uid() = id);

-- Users can insert their own conversions
CREATE POLICY "Users can insert own conversions" 
    ON conversions FOR INSERT 
    WITH CHECK (auth.uid() = user_id);

-- Admin user policy (admin@fedex.com can view everything)
CREATE POLICY "Admins can view all users" 
    ON users FOR SELECT 
    USING (auth.email() = 'admin@fedex.com');

CREATE POLICY "Admins can view all conversions" 
    ON conversions FOR SELECT 
    USING (auth.email() = 'admin@fedex.com');

-- Create an_conversions table (Arrival Notice Generator analytics)
CREATE TABLE an_conversions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    rows_processed INT NOT NULL,
    rows_failed INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE an_conversions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own AN conversions"
    ON an_conversions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all AN conversions"
    ON an_conversions FOR SELECT
    USING (auth.email() = 'admin@fedex.com');
```

### 3. Setup Authentication
1. In your Supabase Dashboard, go to **Authentication** → **Providers**
2. Enable **Email** provider
3. Enable **Email OTP** (magic link) option
4. In **Authentication** → **URL Configuration**, set:
   - Site URL: `http://localhost:3000` (for development) or your Vercel domain
   - Redirect URLs: `http://localhost:3000/**` (for development) or your Vercel domain

### 4. Setup Environment Variables
Create a `.env.local` file in the `web-app` directory:
```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-public-key
```
Replace the placeholders with your actual Supabase credentials!

### 5. Create Admin User
1. In your Supabase Dashboard, go to **Authentication** → **Users**
2. Click "Add user" → "Create new user"
3. Enter email: `admin@fedex.com`
4. Enter password: `admin@fedex.com`
5. Check "Auto confirm user"
6. Click "Create user"
7. In the **SQL Editor**, run this to add the admin to our users table:
   ```sql
   INSERT INTO users (id, full_name, email) 
   VALUES (
       (SELECT id FROM auth.users WHERE email = 'admin@fedex.com'),
       'Admin User',
       'admin@fedex.com'
   );
   ```

### 6. Install Dependencies & Run the App
```bash
cd web-app
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app!

---

## Features

### For Regular Users
- Sign up with full name and email
- Upload TIFF files, entire folders, or ZIP files
- **Client-side conversion** — TIFFs are decoded and converted in your browser using Canvas API. No files are uploaded to any server.
- **Parallel batch processing** — multiple files are converted concurrently (4 at a time) for maximum speed
- Error-tolerant batch conversion — processing continues even if some files fail
- Per-file live status during conversion (converting ✓ / error ✗)
- Partial download — download successfully converted files even when others fail
- Failed files displayed in a separate "Failed Files" section at the top with filename and error message — no scrolling required
- Automatic conversion and download
- Simple, clean interface

### Arrival Notice Generator (`/arrival-notice`)
- Upload a single `.xlsx`/`.xls` sheet — no server upload, parsed entirely in the browser
- Each row is validated for required fields (Date, parseable MAWB No., AWB, Company Name, Pcs, WT(KG), ORG, DEST, VALUE, Contents) before any PDF work starts
- Invalid rows are shown in a "Failed Rows" section with the specific reason, mirroring the TIFF tool's failure UX
- Valid rows are generated into individual "Cargo Arrival Notice" PDFs (batches of 25, 4 concurrent workers) and zipped for download, each file named `<AWB>.pdf` (matching the sheet's own AWB column)
- Important operational details in the notice body (arrival city, warehouse name, working-day deadlines, Customs Holiday rules) are bolded for quick scanning

### For Admin (admin@fedex.com)
- Access `/admin` dashboard
- Toggle between "TIFF to PDF" and "Arrival Notice Generator" analytics
- View total number of conversions/uploads per tool
- See date-wise analytics
- Track which users converted/generated how much
- Graphical representations of the data
- Automatic redirect to `/admin/login` if not authenticated

---

## Technical Architecture

### Conversion Pipeline (Client-Side)

All TIFF-to-PDF conversion runs in the browser with zero server uploads:

```
TIFF file → utif.decode() → RGBA pixel data → Canvas API → toBlob('image/jpeg') → pdf-lib embedJpg() → PDF
```

1. **utif** — decodes TIFF (multi-page, Group4 Fax, LZW, etc.) into raw RGBA pixel arrays
2. **Canvas API** — renders pixels to an offscreen `<canvas>`, then exports as JPEG blob
3. **pdf-lib** — embeds the JPEG into a new PDF document, one page per TIFF page

JPEG at quality 0.92 is used as the intermediate format because browser `canvas.toBlob('image/jpeg')` is hardware-accelerated (GPU) and significantly faster than PNG encoding.

### Batch Processing & Concurrency

| Parameter | Value | Why |
|-----------|-------|-----|
| Batch size | 25 files | Limits peak memory; results update after each batch |
| Workers per batch | 4 concurrent | Overlaps canvas processing without saturating CPU |
| Memory per worker | ~24 MB | One A4-sized canvas (2000×3000 RGBA) |

```
Batch 1 (files 1-25) ─┬─ Worker 1 ── file 1 ── file 5 ── ...
                      ├─ Worker 2 ── file 2 ── file 6 ── ...
                      ├─ Worker 3 ── file 3 ── file 7 ── ...
                      └─ Worker 4 ── file 4 ── file 8 ── ...
                      ↓ await Promise.all(workers)
Batch 2 (files 26-50) ── repeat ──→
```

Canvas memory is freed by the garbage collector between files. Blob URLs are revoked after ZIP download via `URL.revokeObjectURL()`.

### Why No Server-Side Conversion

- **No upload bottleneck** — 200 files × 2 MB = 400 MB never leaves the browser
- **No cold starts** — Vercel serverless functions are not invoked per file
- **No CPU throttling** — Vercel Hobby plan limits CPU; browser uses local hardware
- **Instant start** — conversion begins immediately, no network round-trip

The `/api/convert` endpoint is preserved as a fallback but is not called by the frontend. Deploying to Vercel is purely serving static Next.js output — no serverless execution is required for conversion.

### Large Batch Handling

- Selecting >100 files shows an amber warning banner (non-blocking)
- Processing in batches of 25 prevents memory exhaustion
- Partial downloads are available if some files fail
- `URL.revokeObjectURL()` is called after ZIP download to release blob memory

---

### Arrival Notice Generation Pipeline (Client-Side)

Excel row → validated fields → a real, form-style PDF, entirely in the browser:

```
.xlsx file → SheetJS (xlsx) read → per-row field validation → pdf-lib (drawn form layout) → PDF per row → JSZip
```

1. **SheetJS (`xlsx`)** reads the uploaded workbook client-side (`XLSX.utils.sheet_to_json(sheet, { header: 1 })`) — chosen over `exceljs` because this app only ever *reads* rows and never needs to author/style a workbook, so a lighter, read-oriented parser fits the "nothing ever leaves the browser" design already used for TIFFs.
2. **MAWB No. parsing** — the sheet stores a single composite cell per row, e.g. `"MAWB-023 02961092 IGM- 3088962 Flight- FX5279t Dt - 04-07-2026"`. A tolerant regex (`lib/arrivalNotice.js`, `parseMawbCell`) extracts the Master AWB number, IGM number, flight number, and flight date out of that one cell — this is the trickiest piece of the whole feature, since the format has irregular spacing and mixed label styles (`IGM-`, `Flight-`, `Dt -`).
3. **Validation pass** runs over every row *before* any PDF is generated, checking Date, the parsed MAWB fields, AWB, Company Name, Pcs, WT(KG), ORG, DEST, VALUE and Contents. Rows that fail are collected with a specific reason and shown in a "Failed Rows" section — no PDF work is wasted on rows that are guaranteed to be wrong.
4. **pdf-lib** draws the Cargo Arrival Notice as a real document — not an image — using `drawText`/`drawRectangle`/`drawLine` for the header, bordered details table (IGM/Flight/AWB/Master AWB/Origin/Destination/Pieces/Weight/Value/Contents), static charges block, body paragraph (with bold spans for the important operational details), and the late-collection fee table.
5. **JSZip** bundles every generated PDF into one archive, each entry named `<AWB>.pdf` using the sheet's own AWB column value.

### Why the AWB Field Mapping Matters

The sheet has two different AWB-shaped values per row, and getting them mixed up produces a document with the wrong tracking number on it:
- The **`AWB` column** (e.g. `87359xxx1460`) is the shipment's actual AWB — this is what's printed as **AWB NO** on the generated PDF, and it's what the output filename is built from (`<AWB>.pdf`), so the document and its filename always agree with the source sheet.
- The **`MAWB No.` column** is a composite cell containing the Master AWB number embedded alongside the IGM/flight/date info — this is printed separately as **MAWB NO** on the generated PDF, since it's a distinct reference from the row's own AWB.

---

## Deployment to Vercel
1. Push your code to GitHub/GitLab/Bitbucket
2. Go to [vercel.com](https://vercel.com), sign in, and import your project
3. Set **Root Directory** to `web-app`
4. Add environment variables in Vercel project settings:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Deploy! 🚀

> **Note**: Conversion runs entirely client-side in the browser, so Vercel serverless timeouts and CPU limits don't affect conversion speed. The `/api/convert` endpoint exists as a fallback but is not used by the frontend.
