# Security

QuokkaPix MCP runs a local browser and uploads user-selected local files into that browser page. For this reason the runner blocks arbitrary `appUrl` values by default.

Allowed app URLs:

- `https://quokkapix.com`
- `https://www.quokkapix.com`
- `http://localhost`
- `http://127.0.0.1`
- `http://[::1]`

Set `QUOKKAPIX_ALLOW_CUSTOM_APP_URL=1` only for trusted development or staging pages you control.

Do not put wallet secrets, x402 payment credentials or private image files in recipes, issue reports or public logs. Pass paid unlock tokens at runtime and treat them as short-lived credentials.

For bridge mode:

- configure the narrowest practical `--input-root` and a separate `--output-root`;
- treat `~/.quokkapix/bridge.json` as a credential and use `--reset` to revoke and replace it if it may have been exposed;
- do not bypass the path-root checks or expose the local config through synced/public folders;
- remember that relative file names, settings, status and result metadata pass through the control plane, while image bytes do not.

Report security issues privately through the repository owner contact listed on `https://quokkapix.com`.
