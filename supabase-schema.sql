-- CRM Supabase Schema
-- Run this in the Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- CONTACTS
-- ============================================
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  company TEXT,
  title TEXT,
  notes TEXT,
  avatar_url TEXT,
  bio TEXT,
  birthday DATE,
  date_met DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contacts_user_id ON contacts(user_id);
CREATE INDEX idx_contacts_name ON contacts(user_id, first_name, last_name);
CREATE INDEX idx_contacts_email ON contacts(user_id, email);
CREATE INDEX idx_contacts_company ON contacts(user_id, company);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own contacts"
  ON contacts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own contacts"
  ON contacts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own contacts"
  ON contacts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own contacts"
  ON contacts FOR DELETE USING (auth.uid() = user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- GROUPS
-- ============================================
CREATE TABLE groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  emoji TEXT DEFAULT '📁',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_groups_user_id ON groups(user_id);

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own groups"
  ON groups FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own groups"
  ON groups FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own groups"
  ON groups FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own groups"
  ON groups FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- CONTACT_GROUPS (Junction)
-- ============================================
CREATE TABLE contact_groups (
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  PRIMARY KEY (contact_id, group_id)
);

CREATE INDEX idx_contact_groups_group ON contact_groups(group_id);
CREATE INDEX idx_contact_groups_contact ON contact_groups(contact_id);

ALTER TABLE contact_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own contact_groups"
  ON contact_groups FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM contacts WHERE contacts.id = contact_groups.contact_id AND contacts.user_id = auth.uid()
  ));
CREATE POLICY "Users can insert own contact_groups"
  ON contact_groups FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM contacts WHERE contacts.id = contact_groups.contact_id AND contacts.user_id = auth.uid()
  ));
CREATE POLICY "Users can delete own contact_groups"
  ON contact_groups FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM contacts WHERE contacts.id = contact_groups.contact_id AND contacts.user_id = auth.uid()
  ));

-- ============================================
-- INTERACTIONS
-- ============================================
CREATE TABLE interactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('call', 'email', 'meeting', 'text', 'social', 'other')),
  notes TEXT,
  interaction_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_interactions_user_id ON interactions(user_id);
CREATE INDEX idx_interactions_contact_id ON interactions(contact_id);
CREATE INDEX idx_interactions_date ON interactions(contact_id, interaction_date DESC);

ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own interactions"
  ON interactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own interactions"
  ON interactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own interactions"
  ON interactions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own interactions"
  ON interactions FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- CUSTOM FIELDS
-- ============================================
CREATE TABLE custom_fields (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'textarea', 'dropdown', 'date')),
  options JSONB DEFAULT '[]',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_custom_fields_user_id ON custom_fields(user_id);

ALTER TABLE custom_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own custom_fields"
  ON custom_fields FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own custom_fields"
  ON custom_fields FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own custom_fields"
  ON custom_fields FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own custom_fields"
  ON custom_fields FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- CUSTOM FIELD VALUES
-- ============================================
CREATE TABLE custom_field_values (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  custom_field_id UUID NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
  value TEXT,
  UNIQUE(contact_id, custom_field_id)
);

CREATE INDEX idx_cfv_contact ON custom_field_values(contact_id);
CREATE INDEX idx_cfv_field ON custom_field_values(custom_field_id);

ALTER TABLE custom_field_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own custom_field_values"
  ON custom_field_values FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM contacts WHERE contacts.id = custom_field_values.contact_id AND contacts.user_id = auth.uid()
  ));
CREATE POLICY "Users can insert own custom_field_values"
  ON custom_field_values FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM contacts WHERE contacts.id = custom_field_values.contact_id AND contacts.user_id = auth.uid()
  ));
CREATE POLICY "Users can update own custom_field_values"
  ON custom_field_values FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM contacts WHERE contacts.id = custom_field_values.contact_id AND contacts.user_id = auth.uid()
  ));
CREATE POLICY "Users can delete own custom_field_values"
  ON custom_field_values FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM contacts WHERE contacts.id = custom_field_values.contact_id AND contacts.user_id = auth.uid()
  ));

-- ============================================
-- REMINDERS
-- ============================================
CREATE TABLE reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_date TIMESTAMPTZ NOT NULL,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_interval INTEGER, -- days
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reminders_user_id ON reminders(user_id);
CREATE INDEX idx_reminders_contact ON reminders(contact_id);
CREATE INDEX idx_reminders_due ON reminders(user_id, due_date);

ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reminders"
  ON reminders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own reminders"
  ON reminders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own reminders"
  ON reminders FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own reminders"
  ON reminders FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- KEEP IN TOUCH GOALS
-- ============================================
CREATE TABLE keep_in_touch_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  frequency_days INTEGER NOT NULL,
  last_interaction_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, contact_id)
);

CREATE INDEX idx_kit_user_id ON keep_in_touch_goals(user_id);
CREATE INDEX idx_kit_contact ON keep_in_touch_goals(contact_id);

ALTER TABLE keep_in_touch_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own kit goals"
  ON keep_in_touch_goals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own kit goals"
  ON keep_in_touch_goals FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own kit goals"
  ON keep_in_touch_goals FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own kit goals"
  ON keep_in_touch_goals FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- FUNCTION: Auto-update keep_in_touch last_interaction_date
-- ============================================
CREATE OR REPLACE FUNCTION update_kit_on_interaction()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE keep_in_touch_goals
  SET last_interaction_date = NEW.interaction_date
  WHERE contact_id = NEW.contact_id
    AND user_id = NEW.user_id
    AND (last_interaction_date IS NULL OR NEW.interaction_date > last_interaction_date);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_interaction_insert
  AFTER INSERT ON interactions
  FOR EACH ROW EXECUTE FUNCTION update_kit_on_interaction();

-- ============================================
-- USER PREFERENCES
-- ============================================
CREATE TABLE user_preferences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, key)
);

CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own preferences"
  ON user_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own preferences"
  ON user_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own preferences"
  ON user_preferences FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own preferences"
  ON user_preferences FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- AVATARS STORAGE BUCKET
-- ============================================
-- Run in Supabase SQL Editor to create storage bucket and RLS policies:
--
-- INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);
--
-- CREATE POLICY "Authenticated users can upload avatars"
--   ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');
--
-- CREATE POLICY "Authenticated users can update own avatars"
--   ON storage.objects FOR UPDATE
--   USING (bucket_id = 'avatars' AND auth.role() = 'authenticated');
--
-- CREATE POLICY "Authenticated users can delete own avatars"
--   ON storage.objects FOR DELETE
--   USING (bucket_id = 'avatars' AND auth.role() = 'authenticated');
--
-- CREATE POLICY "Anyone can view avatars"
--   ON storage.objects FOR SELECT
--   USING (bucket_id = 'avatars');

-- ============================================
-- MIGRATIONS (run manually in Supabase SQL Editor)
-- ============================================
-- Add bio column to contacts (if upgrading from previous schema):
-- ALTER TABLE contacts ADD COLUMN IF NOT EXISTS bio TEXT;
--
-- Add date_met column to contacts:
-- ALTER TABLE contacts ADD COLUMN IF NOT EXISTS date_met DATE;
--
-- Add user_preferences table (if upgrading from previous schema):
-- Run the user_preferences CREATE TABLE block above in Supabase SQL Editor.
