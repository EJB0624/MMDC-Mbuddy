# MBuddy

A student-pairing website built with HTML, CSS, JavaScript, and Supabase.

## Course Project

**Group 26 — Web Systems and Technology H3101**

### Members

- Edward Joseph Basilonia
- Danielle Sophia Pasion
- Juan Paolo Dente
- James Angeles

## Supabase setup

1. Create a Supabase project.
2. In **Authentication → Providers**, enable anonymous sign-ins.
3. Open the SQL editor and run [`supabase/schema.sql`](supabase/schema.sql).
4. Add the project URL and publishable/anon key to `config.js`.

The public browser key is protected by the row-level security policies in the schema. Never add a service-role key to this project.

## Run locally

Serve this directory with a local web server.