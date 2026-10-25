# Milestone 2 - implementation and testing notes

Repository: https://github.com/EJB0624/MMDC-Mbuddy 

These are implementation notes for updating the team's existing Browser-Based Application Development Workflow Worksheet. They do not represent a completed team meeting or individual contribution declarations.

## Backend-supported features analysis

Selected feature: persistent student profiles. Students need to find classmates after reopening the application, so profiles must remain available beyond browser memory. The frontend sends JSON to Express using `fetch()`. Express validates the information and stores it in a local JSON file. Subsequent requests read the server's current profile collection.

The implementation uses a JSON file because the project does not require a database. A small account/session layer supports ownership of profile changes and administrator deletion. Saved profiles and BuddyUp requests remain session-only demonstrations. A complete authentication service and a synchronized messaging platform are outside this milestone's implementation.

## Implementation updates and dependencies

- Added Express routes for profile retrieval, creation, editing, and deletion.
- Changed the frontend adapter to send HTTP requests instead of modifying profiles in browser memory.
- Added server validation for names, study goals, specialization, year, term, work time, class selection, and class time slots.
- Allow classes from any year/term within the selected specialization to support the existing advanced/petitioned option. The frontend applies the normal year/term filter.
- Added persistent hashed demo accounts and temporary server sessions to check ownership.
- Kept administrator access limited to deleting other users' profiles; editing remains owner-only.
- Serialized file writes and used atomic file replacement to avoid overwriting changes from simultaneous submissions.
- Disabled submission buttons while requests are pending and displayed API errors through the existing feedback interface.
- Required dependencies: Node.js 22+, npm, Express, writable local storage, and the supplied curriculum catalog.
- Runtime files: `storage/mbuddy.json`; do not commit classroom runtime data.

## Testing evidence

Automated command: `npm test`.

Implementation run date: October 22, 2026 (Philippines).

Result: nine scenario subtests and their parent test passed, ten tests reported by Node's test runner. Tests exercise the actual HTTP API and the browser data adapter in a JavaScript VM. They are not a visual browser test.

| Scenario | Expected and observed result |
| --- | --- |
| Initial load and account creation | Seeded profiles retrieved; account created through frontend adapter |
| Invalid requests | Missing session, malformed JSON, outside email, wrong password, blank name, invalid year, empty classes, invalid class/slot, and duplicate class rejected |
| Valid profile | Profile stored with trimmed name and goal, generated ID, and server-assigned owner |
| Repeated submission | Second POST rejected with 409; one profile retained |
| Editing and ownership | Owner updated own profile; another account received 403 for edit/delete; forged token rejected |
| Concurrent submissions | One request succeeded, one returned 409, existing records retained |
| Private data | Seed, storage path, server source, and package file not served; plaintext credentials absent from stored file and hashes absent from public profile responses |
| Server restart | Accounts and edited profiles retained; old sessions rejected; user signed in again and deleted own profile |
| Administrator | Admin deleted another account's profile but could not edit it |

## Refinements supported by testing

Repeated submissions are rejected on the server, independently of the disabled form button. Concurrent file changes are processed in order. Invalid data does not reach storage. Ownership checks use a server-issued session rather than a user ID supplied with the profile. Storage and server files are excluded from the public asset routes.

## Manual review before submission

Run `npm ci`, `npm start`, and open http://localhost:3000. Create a demo account, create a profile, edit it, refresh, sign in again, and confirm the updated profile remains. Restart Express and repeat the check. Check the layout and error messages on a phone-sized and desktop browser. Review saved buddies and requests with their documented session-only limitations.

The team still needs to record its actual discussion, challenges, reflections, member contributions, and final manual observations in the official worksheet. No team discussion or contribution outcome has been invented in these notes. Include the repository URL, confirm all members can access it, and submit the same finalized worksheet link individually.
