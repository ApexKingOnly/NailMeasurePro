import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-key';

export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Saves a completed measurement order to Supabase
 */
export const saveOrder = async (measurements) => {
  try {
    const { data, error } = await supabase
      .from('measurements')
      .insert([
        {
          sizes_json: measurements,
          created_at: new Date().toISOString()
        }
      ]);
      
    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error('Supabase save error:', err);
    return { success: false, error: err.message };
  }
};
