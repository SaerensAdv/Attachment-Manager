# Wave D: veilige ClickUp-webhooks

Endpoint: `POST /api/webhooks/clickup`. De route ontvangt de onbewerkte body, verifieert `X-Signature` met HMAC-SHA256 en antwoordt snel met 202. Verwerking gebeurt daarna via een persistente, idempotente databasequeue.

## Vereiste Replit Secrets

- `CLICKUP_WEBHOOK_SECRET`: secret dat ClickUp bij webhookregistratie teruggeeft.
- `CLICKUP_WEBHOOK_WORKSPACE_ID`: exact toegestane ClickUp Workspace/team ID.
- `CLICKUP_WEBHOOK_APPROVER_IDS`: komma-gescheiden ClickUp user IDs die mogen goedkeuren.
- `CLICKUP_WEBHOOK_LOCATION_IDS`: komma-gescheiden List IDs waarin approval tasks mogen staan.
- `CLICKUP_WEBHOOK_ID`: geregistreerde webhook ID, alleen voor status/observability.

Optioneel: `CLICKUP_WEBHOOK_APPROVAL_STATUS` (standaard `approved`), `CLICKUP_WEBHOOK_GENERATION_FIELD` (standaard `Atlas Generation ID`) en `CLICKUP_WEBHOOK_REPLAY_WINDOW_MINUTES` (standaard 30).

De approval task moet een custom field bevatten met het generation ID. Een geldige statuswijziging maakt alleen een Gmail-concept via de bestaande atomic approval claim. Er wordt nooit automatisch naar de klant verzonden. Events buiten workspace, actor, location, status of replay window worden blijvend genegeerd; tijdelijke ClickUp/Gmail-fouten krijgen maximaal vijf pogingen en gaan daarna naar dead letter plus alert.
