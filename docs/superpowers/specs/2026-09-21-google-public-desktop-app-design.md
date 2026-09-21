# WeekCal public Google Calendar application design — 2026-09-21

This document supersedes the earlier small-known-group OAuth design for WeekCal.

## Product goal

WeekCal is a standalone Windows desktop application that any user can install and connect to their own Google Calendar account.

End users must never:
- download or select an OAuth JSON file;
- create their own Google Cloud project;
- configure client IDs or client secrets;
- be pre-added as test users.

The normal end-user flow is:

1. Install WeekCal.
2. Open WeekCal.
3. Click **Conectar con Google**.
4. Choose any Google account.
5. Review Google's consent screen and authorize WeekCal.
6. WeekCal shows only calendars and events available to that Google account.

A disconnected installation shows no sample timetable and no data from any other user.

## OAuth architecture

WeekCal uses Google's installed/desktop-app OAuth flow.

- One Google Cloud production project represents WeekCal.
- One Desktop OAuth client identifies WeekCal.
- The OAuth Client ID is public application metadata and is bundled into the Windows application.
- WeekCal does not depend on a confidential client secret.
- Authorization opens in the user's system browser.
- The callback uses a loopback address on 127.0.0.1 with a random local port.
- Authorization Code + PKCE (S256) is used.
- OAuth state is validated.
- Tokens are stored only on the user's PC and require Electron safeStorage.
- There is one active Google account per installation.
- Switching accounts clears account-specific calendar selections before the next account is loaded.
- Disconnecting removes the local Google token without deleting Google Calendar data.

## Scopes

WeekCal currently needs:
- openid
- email
- https://www.googleapis.com/auth/calendar.events
- https://www.googleapis.com/auth/calendar.calendarlist.readonly

The Calendar scopes are user-data scopes and the production Google OAuth app must complete the applicable Google verification before unrestricted public release.

## Production Google configuration

The Google Cloud app must be configured for External users and published to Production, not left in Testing.

The production project must provide:
- a public application name;
- user support email;
- public home page;
- public privacy policy;
- optional Terms of Service;
- a verified domain controlled by the publisher;
- Google Calendar API enabled;
- a Desktop OAuth client;
- all scopes actually requested by WeekCal declared in the consent configuration;
- completed brand and sensitive-scope verification as required by Google.

There is no production test-user allowlist.

## Build configuration

The Windows build accepts one public repository variable:

- WEEKCAL_GOOGLE_CLIENT_ID

The build generates electron/google-app-config.generated.json containing only:
- client_id

No OAuth client secret is required by the WeekCal packaging flow.

## Public distribution follow-up

For broad Windows distribution, code signing should be treated separately from Google OAuth. A trusted Authenticode certificate should sign the installer and executable to reduce Windows publisher/reputation warnings.

## Acceptance criteria

1. A completely new PC can install the same WeekCal installer.
2. Before login, no events are displayed.
3. The user is never asked for an OAuth JSON file.
4. Any eligible Google Account can start the authorization flow without being manually added as a test user.
5. Account A only exposes data authorized by account A.
6. Account B on another PC only exposes data authorized by account B.
7. Changing accounts does not retain the prior account's calendar selection.
8. Tokens are encrypted locally and never committed to the repository.
9. The OAuth flow uses PKCE and state validation.
10. The production build contains only the public OAuth Client ID, not a confidential client secret.
