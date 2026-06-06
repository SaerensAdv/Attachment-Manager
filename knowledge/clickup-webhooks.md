# ClickUp Webhooks — Event Triggers

How ClickUp pushes events to us in real time, so an automation reacts to a status change instead of polling the API. Webhooks are the **trigger** side of the brain-vs-executor model in `ARCHITECTURE.md`: a human moves a task to `Approved`, ClickUp fires an event, and the app (brain) decides what the executor should do next. The endpoints to read/act in response are in `knowledge/clickup-api.md`; the task/status concepts are in `knowledge/clickup-platform.md`.

## What a webhook is

A webhook subscribes a destination URL to one or more events in a location (Workspace, Space, Folder, or List). Instead of repeatedly asking "did anything change?", ClickUp sends a signed HTTP POST to our URL when a matching event happens. This is the efficient way to stay in sync under the 100 req/min rate limit.

## Creating a webhook

```
POST /team/{team_id}/webhook
{
  "endpoint": "https://our-app.example.com/clickup/webhook",
  "events": ["taskStatusUpdated", "taskCommentPosted"],
  "space_id": 123,        // optional: scope to a Space
  "list_id": 456          // optional: scope to a List
}
```

- Scope it as narrowly as possible (a specific List) to avoid noise.
- Use `["*"]` to subscribe to all events (only for discovery; too noisy for production).
- Manage with `GET /team/{team_id}/webhook`, `PUT /webhook/{id}`, `DELETE /webhook/{id}`.

## Events we care about

ClickUp exposes 30+ events. The ones relevant to our flows:

- `taskCreated`, `taskUpdated`, `taskDeleted`
- `taskStatusUpdated` — the approval lifecycle signal (e.g. moved to `Approved`).
- `taskAssigneeUpdated` — work handed to an agent or person.
- `taskCommentPosted` — a human replied / a result was posted.
- `taskPriorityUpdated`, `taskDueDateUpdated`, `taskMoved`.

Each delivery includes the `event` name, the affected `task_id` (or list/folder id), and a `history_items` array describing what changed; fetch full detail with `GET /task/{task_id}` if needed.

## Security — verify the signature

Every event is signed with a **shared secret unique to that webhook**, returned when the webhook is created. ClickUp sends an `X-Signature` header containing an HMAC-SHA256 of the raw request body keyed with that secret. We **must** recompute the HMAC over the raw body and compare before trusting any event — otherwise anyone who learns the URL could forge approvals.

- Store the per-webhook secret as a secret (environment-secrets flow), never in code or docs.
- ClickUp does **not** send from fixed IP addresses, so signature verification (not IP allow-listing) is the trust boundary.
- Treat every incoming payload as untrusted data until the signature checks out.

## Scope and caveats

- A webhook is **tied to the user** whose token created it. If that user is disabled, the webhook stays registered but stops firing — use a stable service account, not a personal login that might be deactivated.
- ClickUp retries failed deliveries and can disable a webhook after repeated failures; our endpoint must respond quickly (acknowledge, then process asynchronously) and be idempotent (the same event may arrive more than once).
- For local testing, a relay like `smee.io` forwards events to a dev machine.

## How we use it (Saerens)

- Subscribe a narrowly-scoped webhook (per client work List) to `taskStatusUpdated` and `taskCommentPosted`.
- On `Approved`, the brain validates and hands a **proposing/acting** job to the executor; on a read-only/reporting status it can proceed automatically (the two safety categories in `ARCHITECTURE.md`).
- Always log the decision and keep a human-visible trail in ClickUp (a status + comment), so approvals are auditable.

## Related

- `knowledge/clickup-api.md` — how to act once an event arrives.
- `knowledge/clickup-platform.md` — statuses and the approval lifecycle that drive these events.
- `knowledge/clickup-ai-agents.md` — agents that can be triggered or assigned by these events.
- `ARCHITECTURE.md` — the brain-vs-executor split webhooks plug into.
