/**
 * supabase.js - Backend Configuration
 * Replace with your Supabase URL and Anon Key
 */

// import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'YOUR_SUPABASE_URL'
const supabaseAnonKey = 'YOUR_SUPABASE_ANON_KEY'

// export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const mockSubmitOrder = async (order) => {
  console.log("Submitting Order to Backend:", order);
  return new Promise(resolve => setTimeout(() => resolve({ success: true }), 1000));
}
