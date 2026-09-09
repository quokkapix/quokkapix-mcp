# Cloud-to-local bridge

Start the same `quokkapix-mcp` package in bridge mode:

```bash
npx -y quokkapix-mcp bridge \
  --input-root /absolute/path/to/media \
  --output-root /absolute/path/to/quokkapix-output
```

Approve the printed pairing URL, then add this remote MCP URL to the cloud client:

```text
https://quokkapix.com/mcp
```

The remote client authenticates with OAuth authorization code plus PKCE. Read tools use `mcp:tools`; Image and Video processing plus staged product unlocks additionally require `bridge:execute`. Tool calls may contain settings and relative file names, but image, video, audio and output bytes stay in the local browser workflow. Paths outside the configured roots are rejected.

The existing local mode is unchanged:

```bash
npx -y quokkapix-mcp
```

Use `0.7.0` or newer for the unified Image/Video quote and one-time token flow. Run without a token for the exact local quote, then retry unchanged with its product unlock. The bridge adds no fee, keeps a bounded local queue and
retries lifecycle/result delivery across transient control-plane failures.
