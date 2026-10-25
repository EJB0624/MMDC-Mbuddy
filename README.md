# MBuddy

A student-pairing website built with HTML, CSS, JavaScript, and Express.js.

## Course Project

**Group 26 - Web Systems and Technology H3101**

### Members

- Edward Joseph Basilonia
- Danielle Sophia Pasion
- Juan Paolo Dente
- James Angeles

## Run locally

Install Node.js 22 or newer, then run:

```sh
npm ci
npm start
```

Open http://localhost:3000. Express serves the frontend and API together. Use this server instead of opening `index.html`, VS Code Live Server, or GitHub Pages, which cannot run the Express backend.

The default listener is local to your computer. A hosting service that runs Node.js can use `HOST=0.0.0.0` and its assigned `PORT`. Use HTTPS for an online deployment. Hosting is a separate step; pushing to GitHub only updates the source files.

## Vercel preview

The repository includes `vercel.json` and `api/index.js`. Vercel routes `/api/*` to the Express function and publishes only the listed frontend assets. Keep the Vercel project's Root Directory at this repository's root, then redeploy the latest commit. If you use another repository, copy both deployment files along with the updated frontend adapter. No Supabase key is needed.

The Vercel entry writes its demo JSON file under `/tmp` because the deployed source is read-only. This is temporary, instance-local storage: new accounts, profiles, and sessions can disappear on a cold start or redeployment, and separate instances do not share them. This preview is not a durable multi-user deployment. Use `npm start` locally, or a Node host with persistent disk, to demonstrate the milestone's restart-persistence requirement. Do not use a Vercel preview as evidence that information survives a server restart.

## Backend-supported feature

Profiles are loaded, validated, created, edited, and deleted through the Express API. `object-store.js` now uses `fetch()` for accounts and profiles. The server checks profile ownership; an administrator can delete another profile but cannot edit it.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/profiles` | Retrieve profiles |
| POST | `/api/profiles` | Create the signed-in user's profile |
| PUT | `/api/profiles/:id` | Edit the owner's profile |
| DELETE | `/api/profiles/:id` | Delete a profile as owner or admin |
| POST | `/api/accounts` | Create a classroom demo account |
| POST | `/api/session` | Sign in |
| DELETE | `/api/session` | Sign out |

## Data and scope

No database or Supabase setup is required. The server creates `storage/mbuddy.json` from `data.js` on its first run. Accounts and profiles remain in this JSON file after page reloads and server restarts. Writes are serialized and replace the file atomically. Existing storage is never reseeded automatically. Keep a backup of this file if you need to retain demo data; it is ignored by Git.

`data.js` is the initial seed, including Edward's example profile and demonstration account. The server does not expose this file or stored credential hashes as public assets. Email addresses are stored as normalized SHA-256 hashes and passwords as salted PBKDF2 hashes. Sessions expire after eight hours and reset on server restart. Sign in again after reloading the page.

Saved buddies and BuddyUp requests are still browser-memory demonstrations. They reset on refresh and are not synchronized between separate browsers. The Gmail link becomes available when both accounts have signed in during the same page session and their request is accepted.

This is a lightweight course implementation. It has no email verification, password recovery, or production account administration. The original seeded demo credentials are known to the group. Run one server process against the JSON file; a host with temporary disk storage may lose the file during redeployment.

## Testing

```sh
npm test
```

The integration tests use the real Express server, HTTP requests, and the frontend data adapter. They cover valid and invalid inputs, repeated and concurrent submissions, ownership, admin deletion, private files, and data persistence across a server restart. Each run uses isolated temporary files and removes them afterward.

See [Milestone 2 implementation and testing notes](docs/milestone-2.md) for evidence and the remaining team documentation tasks.


