import { useEffect, useMemo, useRef, useState } from "react";
import { useGetDocGraph } from "@workspace/api-client-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2, Sparkles, Copy, Download, Check, Square } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { streamGenerate } from "@/lib/generate";

interface Option {
  path: string;
  title: string;
}

export default function Generate() {
  const { data: graphData, isLoading, error } = useGetDocGraph();

  const [clientPath, setClientPath] = useState("");
  const [workflowPath, setWorkflowPath] = useState("");
  const [agentPath, setAgentPath] = useState("");
  const [request, setRequest] = useState("");

  const [output, setOutput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const byCategory = (cat: string): Option[] =>
    (graphData?.nodes ?? [])
      .filter((n) => n.category === cat)
      .map((n) => ({ path: n.path, title: n.title }))
      .sort((a, b) => a.title.localeCompare(b.title));

  const clients = useMemo(() => byCategory("client"), [graphData]);
  const workflows = useMemo(() => byCategory("workflow"), [graphData]);

  const allAgents = useMemo(
    () => byCategory("agent").filter((a) => a.path !== "agents/orchestrator.md"),
    [graphData],
  );

  // Agents connected to the chosen workflow in the doc graph are surfaced as
  // recommendations, but the user can still pick any agent.
  const recommendedPaths = useMemo(() => {
    if (!workflowPath || !graphData) return new Set<string>();
    const ids = new Set<string>();
    for (const e of graphData.edges) {
      if (e.source === workflowPath && e.target.startsWith("agents/"))
        ids.add(e.target);
      if (e.target === workflowPath && e.source.startsWith("agents/"))
        ids.add(e.source);
    }
    return ids;
  }, [workflowPath, graphData]);

  const recommendedAgents = allAgents.filter((a) => recommendedPaths.has(a.path));
  const otherAgents = allAgents.filter((a) => !recommendedPaths.has(a.path));

  const canGenerate =
    !!clientPath && !!workflowPath && !!agentPath && request.trim().length > 0;

  const handleGenerate = async () => {
    if (!canGenerate || isStreaming) return;
    setOutput("");
    setStreamError(null);
    setIsStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    await streamGenerate(
      { agentPath, clientPath, workflowPath, request: request.trim() },
      {
        onDelta: (text) => setOutput((prev) => prev + text),
        onDone: () => {
          setIsStreaming(false);
          abortRef.current = null;
        },
        onError: (message) => {
          setStreamError(message);
          setIsStreaming(false);
          abortRef.current = null;
        },
        signal: controller.signal,
      },
    );
  };

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsStreaming(false);
  };

  // Abort any in-flight generation when leaving the page.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleDownload = () => {
    const blob = new Blob([output], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "saerens-output.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-4 animate-pulse">
          <Loader2 className="w-8 h-8 animate-spin text-cat-agent" />
          <p className="font-mono text-sm tracking-widest text-muted-foreground">
            LADEN...
          </p>
        </div>
      </div>
    );
  }

  if (error || !graphData) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background text-foreground">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-destructive">
            Kon de gegevens niet laden
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Controleer je verbinding of de API-status.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-6 pt-20 pb-10 grid grid-cols-1 lg:grid-cols-[26rem_1fr] gap-6">
        {/* Config panel */}
        <div className="flex flex-col gap-5">
          <div>
            <h1 className="font-mono font-bold tracking-tight text-2xl uppercase flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-cat-agent" />
              Genereren
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Kies klant, workflow en agent, beschrijf je opdracht en laat het
              team een eerste versie schrijven.
            </p>
          </div>

          <div className="flex flex-col gap-4 bg-card/60 border border-card-border rounded-lg p-5">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                Klant
              </label>
              <Select value={clientPath} onValueChange={setClientPath}>
                <SelectTrigger data-testid="select-client">
                  <SelectValue placeholder="Kies een klant" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.path} value={c.path}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                Workflow
              </label>
              <Select
                value={workflowPath}
                onValueChange={(v) => {
                  setWorkflowPath(v);
                  setAgentPath("");
                }}
              >
                <SelectTrigger data-testid="select-workflow">
                  <SelectValue placeholder="Kies een workflow" />
                </SelectTrigger>
                <SelectContent>
                  {workflows.map((w) => (
                    <SelectItem key={w.path} value={w.path}>
                      {w.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                Agent
              </label>
              <Select value={agentPath} onValueChange={setAgentPath}>
                <SelectTrigger data-testid="select-agent">
                  <SelectValue placeholder="Kies een agent" />
                </SelectTrigger>
                <SelectContent>
                  {recommendedAgents.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Aanbevolen voor deze workflow</SelectLabel>
                      {recommendedAgents.map((a) => (
                        <SelectItem key={a.path} value={a.path}>
                          {a.title}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  <SelectGroup>
                    {recommendedAgents.length > 0 && (
                      <SelectLabel>Overige agents</SelectLabel>
                    )}
                    {otherAgents.map((a) => (
                      <SelectItem key={a.path} value={a.path}>
                        {a.title}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                Opdracht
              </label>
              <Textarea
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                placeholder="Bv. Schrijf een maandelijkse update-mail over de Google Ads-resultaten van vorige maand."
                rows={6}
                className="resize-none"
                data-testid="input-request"
              />
            </div>

            {isStreaming ? (
              <Button
                variant="secondary"
                onClick={handleStop}
                data-testid="button-stop"
              >
                <Square className="w-4 h-4" />
                Stoppen
              </Button>
            ) : (
              <Button
                onClick={handleGenerate}
                disabled={!canGenerate}
                data-testid="button-generate"
              >
                <Sparkles className="w-4 h-4" />
                Genereer
              </Button>
            )}
          </div>
        </div>

        {/* Output panel */}
        <div className="flex flex-col gap-3 min-w-0">
          <div className="flex items-center justify-between gap-2 min-h-9">
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
              Resultaat
            </span>
            {output && (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  data-testid="button-copy"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-cat-knowledge" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                  {copied ? "Gekopieerd" : "Kopiëren"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDownload}
                  data-testid="button-download"
                >
                  <Download className="w-4 h-4" />
                  Downloaden
                </Button>
              </div>
            )}
          </div>

          <div className="flex-1 bg-card/60 border border-card-border rounded-lg p-6 min-h-[24rem]">
            {streamError && (
              <div className="text-sm text-destructive mb-4">
                ⚠️ {streamError}
              </div>
            )}
            {!output && !isStreaming && !streamError && (
              <div className="h-full flex items-center justify-center text-center text-muted-foreground">
                <p className="max-w-sm text-sm">
                  De gegenereerde output verschijnt hier. Output is altijd een
                  eerste versie — een teamlid moet ze nakijken voor publicatie.
                </p>
              </div>
            )}
            {(output || isStreaming) && (
              <article className="prose prose-invert prose-sm max-w-none prose-headings:font-mono prose-headings:tracking-tight prose-a:text-cat-agent">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {output}
                </ReactMarkdown>
                {isStreaming && (
                  <span className="inline-block w-2 h-4 bg-cat-agent animate-pulse align-middle ml-0.5" />
                )}
              </article>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
