import { describe,expect,it } from "vitest";
import { newCorrelationId, processStatus } from "./runtime-observability";
describe("Wave B observability",()=>{it("creates scoped unique correlations",()=>{const a=newCorrelationId("schedule-1"),b=newCorrelationId("schedule-1");expect(a).not.toBe(b);expect(a.startsWith("schedule-1:")).toBe(true)});it("reports safe process metadata",()=>{const p=processStatus();expect(p.status).toBe("healthy");expect(p.uptimeSeconds).toBeGreaterThanOrEqual(0)})});
