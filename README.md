# FedEx TIFF to PDF Converter

## Problem Statement
Team members were fetching invoices from ACCS (internal software) in bulk, but the downloaded files were in .tiff format. Customers requested invoices to be shared in .pdf format instead, which created a manual conversion bottleneck.

## Solution
A modern web application for converting TIFF files to PDF, featuring:
- Unified upload for TIFF files, entire folders, or ZIP files containing TIFFs
- Automatic single-file (PDF) or multi-file (ZIP of PDFs) downloads
- User authentication with Supabase
- Admin dashboard for tracking conversion analytics
- Client-side conversion — files never leave your browser
- Parallel batch processing with live per-file status
- Beautiful, easy-to-use interface

## Tech Stack
- **Frontend**: Next.js 14 (React), Tailwind CSS
- **Database & Auth**: Supabase
- **File Handling**: JSZip, pdf-lib, utif
- **Conversion**: Browser Canvas API (zero server uploads)

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
- Failed files are flagged with error details in the results summary
- Automatic conversion and download
- Simple, clean interface

### For Admin (admin@fedex.com)
- Access `/admin` dashboard
- View total number of conversions
- See date-wise conversion analytics
- Track which users converted how many files
- Graphical representations of conversion data
- Automatic redirect to `/admin/login` if not authenticated

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
