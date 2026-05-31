import { X, FileText, ArrowRight, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useGetDocContent, type DocNode } from "@workspace/api-client-react";
import { getGetDocContentQueryKey } from "@workspace/api-client-react";

interface DocPanelProps {
  path: string;
  node: DocNode | null;
  onClose: () => void;
}

export default function DocPanel({ path, node, onClose }: DocPanelProps) {
  const { data: doc, isLoading, error } = useGetDocContent(
    { path },
    { query: { enabled: !!path, queryKey: getGetDocContentQueryKey({ path }) } }
  );

  return (
    <div className="h-full bg-card/95 backdrop-blur-xl border border-card-border shadow-2xl rounded-l-2xl overflow-hidden flex flex-col relative">
      {/* Header */}
      <div className="flex-none p-4 border-b border-card-border flex items-center justify-between bg-card/50">
        <div className="flex items-center gap-3 overflow-hidden">
          <div 
            className="w-3 h-3 rounded-full shrink-0" 
            style={{ backgroundColor: node ? `hsl(var(--cat-${node.category}))` : 'hsl(var(--muted))' }} 
          />
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider truncate">
              {node?.category || 'Loading...'}
            </span>
            <h2 className="text-sm font-semibold truncate" title={node?.title || path}>
              {node?.title || path.split('/').pop()}
            </h2>
          </div>
        </div>
        <button 
          onClick={onClose}
          className="p-2 hover:bg-muted rounded-full transition-colors text-muted-foreground hover:text-foreground shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-card/50 backdrop-blur-sm z-10">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-cat-agent" />
              <span className="font-mono text-xs text-muted-foreground">Reading Document...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="p-6 text-center text-destructive">
            <p>Failed to load document content.</p>
          </div>
        )}

        {doc && !isLoading && (
          <div className="p-6 prose prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {doc.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
