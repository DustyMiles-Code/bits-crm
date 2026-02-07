# CLAUDE.md

## Project Overview

**Domain CRM** — a personal CRM web app built with vanilla HTML/CSS/JS and Supabase backend.

## Project Structure

```
CRM/
  app.html              # Main app shell (authenticated)
  login.html            # Login/signup page
  css/styles.css        # All styles
  js/
    supabase.min.js     # Supabase client library
    supabase-config.js  # Supabase URL + anon key
    auth.js             # Authentication module
    contacts.js         # Contacts CRUD + group membership
    groups.js           # Groups CRUD
    interactions.js     # Interaction logging
    fields.js           # Custom fields CRUD
    reminders.js        # Reminders + keep-in-touch goals
    import-export.js    # CSV import/export + merge duplicates
    app.js              # Main app controller (state, rendering, modals)
  supabase-schema.sql   # Full database schema (run in Supabase SQL Editor)
```

## Architecture

- No build process. Static files served by nginx.
- Supabase for auth, database, and RLS policies.
- Each JS module is a global object (Contacts, Groups, Fields, etc.).
- App.js is the main controller with state management and rendering.

## Deployment

**IMPORTANT: After making any code changes, always do both steps:**

1. **Push to GitHub:**
   ```
   git add <changed files>
   git commit -m "description"
   git push origin main
   ```
   - Repo: https://github.com/DustyMiles-Code/bits-crm.git
   - Branch: main

2. **Restart the Docker container on Hostinger VPS:**
   - Use the `mcp__hostinger__VPS_restartProjectV1` tool
   - `virtualMachineId`: **1312438**
   - `projectName`: **"crm"**
   - The container runs nginx:alpine and pulls latest code on restart

Both steps are required for changes to go live.

## Supabase

- URL: `https://bfxfcluoytfrmuhomhzr.supabase.co`
- Database tables: contacts, groups, contact_groups, interactions, custom_fields, custom_field_values, reminders, keep_in_touch_goals
- The `contacts` table has `emails` and `phones` JSONB columns (added after initial schema)
- RLS is enabled on all tables scoped to `auth.uid() = user_id`

## Notes

- Mobile responsive with breakpoints at 1024px and 768px
- Checkboxes and drag-to-group are hidden on mobile
- Fonts: DM Sans from Google Fonts
- No external JS dependencies beyond Supabase client
