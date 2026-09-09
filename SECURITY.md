# Security

QuokkaPix MCP runs a local browser and selects user-provided image, video and optional music files in that browser page. For this reason the runner blocks arbitrary `appUrl` values by default.

Allowed app URLs:

- `https://quokkapix.com`
- `https://www.quokkapix.com`
- `https://video.quokkapix.com`
- `http://localhost`
- `http://127.0.0.1`
- `http://[::1]`

Set `QUOKKAPIX_ALLOW_CUSTOM_APP_URL=1` only for trusted development or staging pages you control.

Do not put wallet secrets, x402 payment credentials or private media files in recipes, issue reports or public logs. Pass paid unlock tokens at runtime and treat them as short-lived credentials.

Image and Video processing are available in local stdio and remote bridge modes in version 0.6.0. The remote control plane coordinates jobs but never receives source or output media bytes.

For bridge mode:

- configure the narrowest practical `--input-root` and a separate `--output-root`;
- treat `~/.quokkapix/bridge.json` as a credential and use `--reset` to revoke and replace it if it may have been exposed;
- do not bypass the path-root checks or expose the local config through synced/public folders;
- remember that relative file names, settings, status and result metadata pass through the control plane, while image, video, audio and output bytes do not;
- keep the bridge running only while remote execution is needed; each authorized cloud client can act on files inside the configured input root.

The hosted control plane is intentionally bounded: it limits OAuth registrations,
MCP sessions and queued jobs. The production service currently runs as one Node
process because live MCP sessions and jobs are memory-only. Do not place it behind
multiple active workers without first adding a shared session/job store.

Report security issues privately through the repository owner contact listed on `https://quokkapix.com`.
