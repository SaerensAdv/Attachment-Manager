# Bounded Workspace Graph Collector

The graph sync now imports only a controlled, content-free working set. Default budgets are intentionally conservative:

- active tasks updated in the last 90 days;
- maximum 25 tasks per List;
- maximum 500 tasks total;
- maximum 75 Docs;
- maximum 100 Pages per Doc and 500 Pages total;
- maximum 250 recent ClickUp push records;
- closed tasks, subtasks, archived hierarchy, descriptions, comments, attachments and custom-field values remain excluded.

## Explicit scope controls

Use comma-separated IDs in Replit Secrets:

```plain
GRAPH_WORKSPACE_ID=9015913612
GRAPH_ALLOWED_SPACE_IDS=space-id-1,space-id-2
GRAPH_ALLOWED_LIST_IDS=list-id-1,list-id-2
GRAPH_ALLOWED_DOC_IDS=doc-id-1,doc-id-2
```

When a Space allowlist is set, excluded Spaces are not crawled. When a List allowlist is set, only selected Lists and their ancestor Spaces/Folders enter the graph, and only those Lists receive task calls. When a Doc allowlist is set, only selected Docs receive Page calls.

Optional numeric controls:

```plain
GRAPH_TASK_LOOKBACK_DAYS=90
GRAPH_MAX_TASKS_PER_LIST=25
GRAPH_MAX_TASKS_TOTAL=500
GRAPH_MAX_DOCS=75
GRAPH_MAX_PAGES_PER_DOC=100
GRAPH_MAX_PAGES_TOTAL=500
GRAPH_MAX_PUSH_RECORDS=250
```

Every sync logs a structured, content-free report with discovered, included and excluded counts. The sync response also states how many nodes were included and how many source items were intentionally excluded. A failed required workspace/space crawl still preserves the previous valid snapshot.
