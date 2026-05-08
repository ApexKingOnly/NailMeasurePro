# Training Data Capture Setup

## What The App Saves

When a user taps `USE MEASUREMENT`, the app now sends a human-corrected training label to `POST /api/training-labels`.

Each accepted label includes:

- Frozen camera image.
- Finger name and shot number.
- Quarter circle: `x`, `y`, `r`.
- Nail width guide: `left` and `right` points.
- Final measurement: millimeters, nail size, quarter pixels, nail pixels.
- AI suggestion metadata when available.
- Session id and timestamp.

This does not train the model live. It stores reviewed examples that can be cleaned, exported, and used to retrain Roboflow or another model version.

## Required Vercel Env Vars

Keep these server-side only. Do not prefix them with `VITE_`.

```bash
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_TRAINING_BUCKET=nail-training-images
SUPABASE_TRAINING_TABLE=nail_training_labels
```

If these are not set, `/api/training-labels` returns `configured:false` and the app continues normally.

## Supabase Setup

Create a private storage bucket named `nail-training-images`.

Then run this SQL in Supabase SQL Editor:

```sql
create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public)
values ('nail-training-images', 'nail-training-images', false)
on conflict (id) do nothing;

create table if not exists public.nail_training_labels (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  captured_at timestamptz,
  session_id text not null,
  finger_name text not null,
  shot_number integer not null,
  hand_side text,
  measurement_mm numeric not null,
  nail_size text not null,
  measurement_method text,
  image_bucket text not null,
  image_path text not null,
  image_mime text,
  frame jsonb not null,
  guide jsonb not null,
  ai jsonb,
  measurement jsonb not null,
  source text,
  app_version text,
  reviewed boolean not null default false,
  exported_at timestamptz
);

alter table public.nail_training_labels enable row level security;
```

The Vercel function uses the Supabase service role key, so browser users never receive database credentials.

## Training Workflow

1. Collect accepted labels from real app sessions.
2. Review and remove bad examples, blurry frames, wrong finger labels, and bad guide placements.
3. Export images from Supabase Storage and labels from `nail_training_labels`.
4. Convert labels into the format needed by Roboflow or the selected training pipeline.
5. Train a new model version.
6. Test against held-out app frames before setting the new Roboflow model env var in production.

## Label Quality Note

The current labels are strong for measuring nail width because the user sets the nail left and right edge points. For full nail-shape detection, add a future outline or mask tool so the model can learn the complete nail plate, not only its width.
