import { Link, useSearch } from "wouter";
import { ArrowLeft } from "lucide-react";
import AtlasShell from "@/components/atlas/AtlasShell";
import CrawlUpload from "@/pages/CrawlUpload";
import Zoektermen from "@/pages/Zoektermen";
import "./AtlasClients.css";

export default function ClientToolRoute({ tool }: { tool: "crawl" | "search-terms" }) {
  const client = new URLSearchParams(useSearch()).get("client");
  const back = client ? `/clients?client=${client}` : "/clients";
  const title = tool === "crawl" ? "Technical SEO" : "Search Terms";
  const subtitle = tool === "crawl" ? "Client crawl intake and historical comparison" : "Google Ads review with guarded live writes";
  const actions = <Link href={back} className="atlas-action"><ArrowLeft />Back to client</Link>;
  return <AtlasShell title={title} subtitle={subtitle} actions={actions}><main className="client-tool-stage" data-lenis-prevent><div className="client-tool-boundary"><p>Client-context tool</p><span>{tool === "crawl" ? "Crawl snapshots are stored in the selected client dossier." : "Dry run first. Live writing remains disabled until explicitly enabled and reconfirmed."}</span></div><div className="client-tool-legacy">{tool === "crawl" ? <CrawlUpload /> : <Zoektermen />}</div></main></AtlasShell>;
}
