# Cloud-to-local bridge

Start the same `quokkapix-mcp` package in bridge mode:

```bash
npx -y quokkapix-mcp bridge \
  --input-root /absolute/path/to/images \
  --output-root /absolute/path/to/quokkapix-output
```

Approve the printed pairing URL, then add this remote MCP URL to the cloud client:

```text
https://quokkapix.com/mcp
```

The remote client authenticates with OAuth authorization code plus PKCE. Read tools use `mcp:tools`; processing and staged unlocks additionally require `bridge:execute`. Tool calls may contain settings and relative file names, but image bytes stay in the local browser workflow. Paths outside the configured roots are rejected.

The existing local mode is unchanged:

```bash
npx -y quokkapix-mcp
```

Use `0.4.1` or newer for bridge mode. The bridge keeps a bounded local queue and
retries lifecycle/result delivery across transient control-plane failures.
