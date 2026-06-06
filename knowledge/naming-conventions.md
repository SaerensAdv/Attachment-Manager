# Naming Conventions

Consistent naming makes accounts readable, reports clear, and automation possible later. Agents apply these conventions when building or auditing campaigns. Adjust only with a documented reason.

## Principles

- Names should be **self-explanatory** — readable at a glance in reports and dashboards.
- Use a **consistent order** of elements, separated by a delimiter.
- Prefer **clarity over brevity**, but avoid redundancy.
- Use the same casing and delimiters everywhere.

## Delimiter & casing

- Separate elements with a pipe with spaces: ` | `.
- Use clear Title Case or short uppercase codes for fixed values (e.g. `BE`, `NL`, `EN`).

## Campaign naming

Recommended pattern:

```
[Market] | [Channel] | [Type] | [Theme] | [Geo] | [Language]
```

Examples:

- `Ecom | Search | Brand | Core | BE | NL`
- `Ecom | Shopping | NonBrand | Catalog | BE | NL`
- `Leadgen | Search | NonBrand | RoofRepair | Antwerp | NL`
- `Leadgen | Search | NonBrand | Plumbing | Rotterdam | NL`
- `Leadgen | PMax | Leads | AllServices | BE | NL`

Element guide:
- **Market** — `Ecom` or `Leadgen`.
- **Channel** — `Search`, `Shopping`, `PMax`, `Display`, `Video`.
- **Type** — `Brand` / `NonBrand`, or objective like `Leads`, `Sales`, `Remarketing`.
- **Theme** — service line or product category.
- **Geo** — region or city when geo-split matters.
- **Language** — `NL`, `FR`, `EN`.

## Ad group naming

Pattern:

```
[Theme] | [Match/Intent]
```

Examples:
- `Roof Repair | Exact`
- `Flat Roofing | Phrase`
- `Gutter Replacement | Broad`

## Conversion action naming

Pattern:

```
[Type] | [Detail]
```

Examples:
- `Lead | Form Submit`
- `Lead | Phone Call`
- `Sale | Purchase`

## Assets & shared items

- Negative keyword lists: `Neg | [Scope]` (e.g. `Neg | Account Core`, `Neg | Leadgen Generic`).
- Audiences: `Aud | [Description]` (e.g. `Aud | Site Visitors 30d`).

## When auditing

Flag campaigns, ad groups, or conversions that don't follow these conventions as a finding, and propose corrected names.
