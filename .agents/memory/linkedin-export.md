---
name: LinkedIn data export intake
description: What LinkedIn's Basic vs full archive contains, and where Axel's posts live
---

- LinkedIn's **Basic** ("first part") export has NO `Shares.csv` — posts/articles are only in the **full archive** (arrives ~24 h later as a second ZIP). Axel's #1 interest in this data is his **posts**.
- Posts that had an uploaded document/image are partially recoverable from `Rich_Media.csv` (`Media Description` column carries the full post copy; only 4 of 38 rows had real text in the Basic export). Axel confirmed those are genuine posts of his.
- `Connections.csv` has a 3-line "Notes:" preamble before the real header (`First Name,Last Name,URL,Email Address,Company,Position,Connected On`). Only ~4 % of connections expose an email (LinkedIn privacy setting) — profile URLs are the reliable contact handle.
- Network reality check: Axel's connections skew heavily to freelance/agency peers (Upwork, Fiverr, Google partners), not a clean BE/NL SME prospect pool; filter on founder/owner/e-commerce roles before using as prospects.
- **Why:** the full-archive ZIP will land in a later session; nothing was persisted from the Basic export by Axel's choice ("laat alles staan") — source ZIP stays in `attached_assets/`, /tmp extraction is ephemeral.
- **How to apply:** when the second ZIP arrives, go straight to `Shares.csv` for the full post history and REFRESH `knowledge/founder-voice.md` (first, provisional fill was done from the 4 Rich_Media posts on 2026-07-05; header records export date + sample size).
- The export replaces emoji/diacritics/€ with `?` (mojibake) — restore only linguistically unambiguous chars when quoting; mark the rest `[?]`, and treat emoji usage as unmeasurable.
- Measured voice finding that contradicted the built-in spec: Axel's real posts use **zero hashtags** — the linkedin-post deliverable prompt, workflow, and strategist agent now defer to the voice profile (default: no hashtags) instead of hard-coding "3–5".
