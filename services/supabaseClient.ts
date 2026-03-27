import { createClient } from '@supabase/supabase-js';

// === STEP 1: Your Supabase URL is Correct ===
// This URL points to your new Supabase project.
const supabaseUrl = "https://lhylfmhwvugumlvftggt.supabase.co";

// === STEP 2: PASTE YOUR SUPABASE ANON KEY HERE ===
// This is your public 'anon' key. It is safe to use in a browser.
// You can find this in your Supabase project's dashboard under:
// Project Settings > API > Project API Keys > anon (public)
export const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxoeWxmbWh3dnVndW1sdmZ0Z2d0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI2NDU4OTksImV4cCI6MjA3ODIyMTg5OX0.3SyTdp7yraiVtZDoC_pwqVvnzq8q8ywcKT4GKPD49oM";

// The app will show an error message until the placeholder above is replaced.
// No need to edit below this line.

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
