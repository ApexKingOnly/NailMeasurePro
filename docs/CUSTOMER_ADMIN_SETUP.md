# Customer And Admin Nail Set Setup

## Goal

This system stores customer nail measurements by email so an admin can search for a customer later, review saved nail sets, and edit sizes or millimeter values.

This is separate from AI detection and AI training data:

- Customer/admin data uses `/api/customer-nailsets`, `/api/admin-login`, and `/api/admin-nailsets`.
- AI guide suggestions still use `/api/vision-detect`.
- AI training labels still use `/api/training-labels`.

## App Flow

1. Customer enters an email address before starting the sizing flow.
2. Each accepted measurement is saved to a customer nail set session.
3. When all 10 fingers are measured, the same session is marked `complete`.
4. Admin visits `/admin`, logs in, searches by customer email, and edits saved sizes if needed.

If Supabase is not configured, the customer flow still works locally in the browser and the HUD shows `SAVE OFF`.

## Required Vercel Env Vars

Keep all of these server-side only.

```bash
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

CUSTOMER_NAIL_SESSIONS_TABLE=customer_nail_sessions
CUSTOMER_NAIL_MEASUREMENTS_TABLE=customer_nail_measurements

ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=strong_password_here
ADMIN_SESSION_SECRET=long_random_secret_here
```

`ADMIN_SESSION_SECRET` should be a long random string. It is used to sign admin sessions.

## Supabase SQL

Run this in Supabase SQL Editor.

```sql
create extension if not exists pgcrypto;

create table if not exists public.customer_nail_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  session_id text not null unique,
  customer_email text not null,
  customer_email_normalized text not null,
  status text not null default 'draft',
  measurement_count integer not null default 0,
  submitted_at timestamptz
);

create index if not exists customer_nail_sessions_email_idx
  on public.customer_nail_sessions (customer_email_normalized);

create table if not exists public.customer_nail_measurements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  session_id text not null references public.customer_nail_sessions(session_id) on delete cascade,
  finger_name text not null,
  shot_number integer not null,
  hand_side text,
  measurement_mm numeric not null,
  nail_size text not null,
  measurement_method text,
  quarter_pixels numeric,
  nail_pixels numeric,
  guide jsonb,
  admin_note text,
  admin_email text,
  admin_edited_at timestamptz,
  unique (session_id, finger_name)
);

create index if not exists customer_nail_measurements_session_idx
  on public.customer_nail_measurements (session_id, shot_number);

alter table public.customer_nail_sessions enable row level security;
alter table public.customer_nail_measurements enable row level security;
```

The Vercel functions use the Supabase service role key, so browser users and admins never receive database credentials.

## Admin UI

Admin URL:

```text
https://nail-measure-pro.vercel.app/admin
```

Admin can:

- Log in with `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
- Search a customer by exact email.
- View that customer's saved sessions.
- Edit each finger's millimeter value, nail size, and admin note.

## Notes

This is a pragmatic admin login, not a full multi-admin account system. Later, this can be upgraded to Supabase Auth roles or a dedicated admin users table.
