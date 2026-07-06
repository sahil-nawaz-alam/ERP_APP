// ============================================================
//  Supabase connection config
//  1. Go to your Supabase project → Settings → API
//  2. Copy "Project URL" and "anon public" key below
//  3. That's it — every page shares this one client.
// ============================================================
const SUPABASE_URL = 'https://qbhceczehsdxbzkunhde.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_r4y4Hc4-nMEhx0oovcLGKA_1an-XIuw';

// Loaded via CDN script tag in every HTML page (see <head>):
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
