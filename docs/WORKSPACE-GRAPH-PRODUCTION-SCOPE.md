# Workspace Graph production scope

Atlas intentionally imports a narrow operational slice instead of the full ClickUp workspace.

## Workspace and Space

- Workspace: `Saerens Advertising` (`9015913612`)
- Space: `01 Saerens HQ` (`901511402568`)

Legacy `Saerens HQ`, partner Spaces, Client Delivery, Products & Tools, Procedures, archives, billing-only spaces and personal/private structures are excluded from the structural crawl. They remain available in ClickUp itself.

## Lists

- `Companies` (`901524400055`), under `01 Saerens HQ / CRM`
- `Internal Work` (`901524400063`), under `01 Saerens HQ / Internal Operations`

Companies provides the canonical customer-master records. Internal Work provides actionable agency operations, alerts and review work. No other List receives task crawl calls.

## Docs

- `Saerens Operating System v2` (`8cp7v4c-71935`)
- `Saerens AI Team Knowledge Base` (`8cp7v4c-73895`)

The Operating System supplies governance, active project/customer context and standards. The AI Team Knowledge Base is the human-readable ClickUp projection of the canonical GitHub configuration. Other Docs, legacy snapshots, project knowledge bases, client credentials pages and archives are excluded.

## Runtime and GitHub additions

The ClickUp allowlists do not limit these independent sources:

- active GitHub agents, workflows and knowledge standards;
- Replit client cache and explicit Company links;
- the 100 most recent successful/retryable ClickUp push records and linked runs.

Paused/deprecated agents are excluded from the operational graph.

## Budgets

- tasks updated in the last 90 days;
- 25 tasks per List;
- 100 ClickUp tasks total;
- 2 Docs;
- 150 Pages per Doc and 250 Pages total;
- 100 recent push records.

A Graph sync is required after deployment. The previous snapshot remains active until the new bounded snapshot is built successfully.
