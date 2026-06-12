# ADR 0004: Ambient CLI Inference

Context: The demo should show live AI-authored floors without requiring checked-in secrets or per-call API key setup.

Decision: Use the Codex CLI as the ambient Director provider. Local `codex login` supplies auth outside the repo, the provider runs as a subprocess with timeouts, and the gauntlet treats its output exactly like any other untrusted provider result.

Consequence: The path is costless for the repo and easy to run on a prepared host, but it is host-state dependent and must be serialized with other Codex work. Missing auth degrades to mock/fallback instead of blocking play.
