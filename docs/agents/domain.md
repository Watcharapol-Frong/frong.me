# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in.

If these files don't exist, proceed silently. The `/domain-modeling` skill creates them only when useful terms or decisions are actually resolved.

## File structure

This is a single-context repository:

/
├── CONTEXT.md
├── docs/adr/
└── src/

## Use the glossary's vocabulary

When naming a domain concept in an issue, proposal, test, or code change, use the term defined in `CONTEXT.md`. If the concept is missing, reconsider the wording or note the gap for `/domain-modeling`.

## Flag ADR conflicts

If a proposed change contradicts an existing ADR, surface the conflict explicitly instead of silently overriding it.
