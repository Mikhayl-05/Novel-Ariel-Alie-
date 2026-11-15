# Panduan Konfigurasi Supabase — Novel Ariel & Alie (Novel Studio)

## 1. Environment Variables
Salin `.env.example` menjadi `.env` di root project:
```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-public-key>
```
> **Keamanan**: Jangan pernah menaruh `SUPABASE_SERVICE_ROLE_KEY` ke variabel `VITE_*` atau kode frontend.

## 2. Jalankan SQL Migrations & RLS Policies
Jalankan secara berurutan di Supabase SQL Editor (atau via Supabase CLI `supabase db push`):
1. `supabase/migrations/20261114000001_initial_novel_studio_schema.sql`
2. `supabase/migrations/20261114000002_rls_and_publish_rpc.sql`

## 3. Pengaturan Supabase Authentication
1. Buka **Authentication → Providers → Email** di Supabase Dashboard:
   - Aktifkan **Email** provider.
   - Buka **Authentication → Sign In / Up → Allow new users to sign up** dan **NONAKTIFKAN (disable public signups)** agar pengunjung publik tidak dapat mendaftar sendiri.
2. Buat **satu akun Administrator** secara manual di **Authentication → Users → Add User** (Email + Password).
3. Salin UUID `user_id` akun tersebut dan daftarkan ke tabel `public.admin_users`:
```sql
INSERT INTO public.admin_users (user_id, email, display_name, role, is_active)
VALUES ('<USER_UUID>', '<ADMIN_EMAIL>', 'Admin Ariel & Alie', 'super_admin', true)
ON CONFLICT (user_id) DO UPDATE SET is_active = true, role = 'super_admin';
```

## 4. Import / Seed 118 Chapter Lama
Anda bisa melakukan import melalui dua cara:
- **Via CLI (lokal/server)**:
  ```bash
  VITE_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... ADMIN_USER_EMAIL=... npx tsx scripts/seed-legacy-chapters.ts
  ```
- **Via In-App Admin Tool**:
  Login di `/editor`, lalu buka menu **File → Import 118 Legacy Chapters** (berjalan dengan sesi admin aktif tanpa `service_role` key).
