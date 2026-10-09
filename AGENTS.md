# Campus Shuttle Tracking System

Read Context.md first for architecture and current state.

## Decision policy
- For design choices, pick the industry-standard, simplest option that meets
  the requirement. Do not present options or ask for confirmation.
- State your assumption in one line, then implement.
- Log every non-trivial decision in DECISIONS.md (date, choice, why,
  alternative rejected).
- ONLY stop and ask before: deleting or migrating data, changing auth or
  permissions, anything touching money or deployment, or changing behavior
  users or the client will see.
- Commit after each decision so it can be reverted individually.
- Never read or reference .env files.