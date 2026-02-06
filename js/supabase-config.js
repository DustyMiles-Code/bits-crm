// Supabase Configuration
var SUPABASE_URL = 'https://bfxfcluoytfrmuhomhzr.supabase.co';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmeGZjbHVveXRmcm11aG9taHpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA0MDAyNTMsImV4cCI6MjA4NTk3NjI1M30.l-IA8huXUSIbnzFn3iYjE70uf56Gs0pI3813FI30Ov8';

// Initialize Supabase client (supabase.min.js must be loaded first)
var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
