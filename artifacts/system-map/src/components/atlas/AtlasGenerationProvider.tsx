import { createContext, useContext, type ReactNode } from "react";
import { useGetDocGraph } from "@workspace/api-client-react";
import { useGeneration, type GenerationController } from "@/hooks/useGeneration";

const AtlasGenerationContext = createContext<GenerationController | null>(null);

export function AtlasGenerationProvider({ children }: { children: ReactNode }) {
  const graph = useGetDocGraph();
  const generation = useGeneration(graph.data?.nodes, graph.data?.edges);
  return <AtlasGenerationContext.Provider value={generation}>{children}</AtlasGenerationContext.Provider>;
}

export function useAtlasGeneration() {
  const value = useContext(AtlasGenerationContext);
  if (!value) throw new Error("Atlas generation context is unavailable");
  return value;
}
