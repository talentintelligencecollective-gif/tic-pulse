-- ═══════════════════════════════════════════════════════════════
--  TIC Pulse — User Profiles Schema
--  Run this in: Supabase Dashboard → SQL Editor → New Query
--  Run AFTER supabase-schema.sql
-- ═══════════════════════════════════════════════════════════════

-- ─── User Profiles ───
-- Extends Supabase auth.users with app-specific data
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT,
  full_name   TEXT,
  company     TEXT,
  job_title   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles (email);
CREATE INDEX IF NOT EXISTS idx_profiles_company ON profiles (company);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Users can insert their own profile (on signup)
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);


-- ─── Auto-create profile on signup ───
-- This trigger fires when a new user signs up via Supabase Auth
-- and automatically creates a profile row
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop trigger if exists (safe re-run)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();


-- ─── Update article policies for authenticated users ───
-- Now that we have auth, let's tighten the engagement policies

-- Drop the old anon update policy
DROP POLICY IF EXISTS "Anyone can update engagement" ON article_engagement;

-- Allow authenticated users to update engagement
CREATE POLICY "Authenticated users can update engagement"
  ON article_engagement
  FOR UPDATE
  TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

-- Also allow authenticated users to insert engagement rows
CREATE POLICY "Authenticated users can insert engagement"
  ON article_engagement
  FOR INSERT
  TO authenticated
  WITH CHECK (TRUE);

-- Keep read access open (both anon and authenticated can read)
-- The existing "Anyone can read" policies stay in place
