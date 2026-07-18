import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import AtlasShell from "@/components/atlas/AtlasShell";
import ScheduleManager from "@/components/atlas/ScheduleManager";
export default function OperationsSchedules(){const actions=<Link href="/todo" className="atlas-action"><ArrowLeft/>Attention queue</Link>;return <AtlasShell title="Operations" subtitle="Schedules and recurring execution" actions={actions}><main className="operations-stage" data-lenis-prevent style={{display:"block"}}><ScheduleManager/></main></AtlasShell>}
