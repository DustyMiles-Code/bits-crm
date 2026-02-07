-- Migration: Add JSONB columns for multiple emails and phones
-- Run this in the Supabase SQL editor

-- Add JSONB columns for multiple emails and phones
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS emails JSONB DEFAULT '[]';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phones JSONB DEFAULT '[]';

-- Backfill: migrate existing email into new JSONB array
UPDATE contacts SET emails = jsonb_build_array(jsonb_build_object('value', email, 'label', 'personal'))
  WHERE email IS NOT NULL AND email != '' AND (emails IS NULL OR emails = '[]'::jsonb);

-- Backfill: migrate existing phone into new JSONB array
UPDATE contacts SET phones = jsonb_build_array(jsonb_build_object('value', phone, 'label', 'personal'))
  WHERE phone IS NOT NULL AND phone != '' AND (phones IS NULL OR phones = '[]'::jsonb);
