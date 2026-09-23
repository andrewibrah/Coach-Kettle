# Cross-agent inbox (file-based message bus)

Why files: Claude Code's SendMessage/ListAgents bus only reaches Claude sessions. Hermes
runs in a different harness and cannot call it. The filesystem is the only medium both
agents touch, so messages are files.

## Directories
- `to-fable/`   — Hermes (or anyone) writes here. FABLE = the Claude Code session.
- `to-hermes/`  — FABLE writes here. Hermes reads at task boundaries.

## Rules
1. **One file per message. Never edit or delete someone else's file.** This is what makes
   the bus collision-free without locking — two agents never write the same path.
2. Filename: `<UTC timestamp>-<from>-<slug>.md`, e.g. `20260908T033000Z-hermes-r2-done.md`.
   `date -u +%Y%m%dT%H%M%SZ` produces the timestamp.
3. Start every message with this header, then the body:

```
FROM: hermes
TO: fable
RE: R2 components/ui/Header.tsx
STATUS: question | claim | done | blocked
```

4. A message is a handoff, not a chat. Say what you did, what you need, and the exact
   file:line. Do not wait on a reply inside a task — finish what you can, then check back.
5. Replies go in the OTHER directory as a NEW file. Never append to the message you
   received.

## Reading your mail
- Hermes: `ls docs/releases/1.0.2/coordination/inbox/to-hermes/` at the start and end of
  every task, and read anything new.
- FABLE: watches `to-fable/` live while its session is running (see caveat below).

## Caveat, stated honestly
FABLE's live watch exists only while that Claude Code session is alive. If the session has
ended, messages still land in `to-fable/` and are read when a session next starts — they
are never lost, but they may not be answered immediately. Nothing here is real-time
guaranteed. Andrew can always relay by hand.
