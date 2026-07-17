# Workspace Atlas frontend migration checklist

## Before branch start

- [ ] Wave E codegen completed and generated diffs reviewed.
- [ ] Workspace typecheck green.
- [ ] API and system-map tests green.
- [ ] API and system-map production builds green.
- [ ] Controlled Companies sync inspected, with no silent client creation.
- [ ] Signed denied-workspace webhook smoke accepted then ignored, with no Gmail action.
- [ ] Approval UI copy fixed to Gmail draft semantics.

## Implementation order

1. Atlas shell, auth gate, tokens and route skeleton.
2. Workspace Graph with smooth force layout, drag, pan/zoom, search and inspector.
3. Operations and System Health using Wave E clients.
4. Runs, generation SSE, approvals and learning.
5. Clients, Agents and Knowledge.
6. Mobile hierarchy and reduced motion.
7. Parity testing and route-by-route cutover.

## Non-negotiable rollback rule

No legacy route or component is deleted in the migration PR. Removal happens only after the matching Atlas surface has contract tests, manual Replit validation and an explicit rollback point.
