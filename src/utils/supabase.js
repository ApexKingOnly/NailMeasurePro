import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Table Schema Reference (For User's SQL Editor):
/*
CREATE TABLE submissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT,
  email TEXT,
  measurements JSONB, -- { "left": [mm, mm, mm, mm], "right": [...], "thumbs": [...] }
  sizes JSONB,        -- { "left": [0,1,2,3], ... }
  photos JSONB,       -- { "left": "storage_url", ... }
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);
*/
