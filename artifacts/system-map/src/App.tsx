import { Switch, Route, Redirect, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import WorkspaceGraph from "@/pages/WorkspaceGraph";
import SystemHealth from "@/pages/SystemHealth";
import AtlasAgents from "@/pages/AtlasAgents";
import AtlasClients from "@/pages/AtlasClients";
import ClientToolRoute from "@/pages/ClientToolRoute";
import RunsHub from "@/pages/RunsHub";
import Knowledge from "@/pages/Knowledge";
import Operations from "@/pages/Operations";
import OperationsSchedules from "@/pages/OperationsSchedules";
import SmoothScroll from "@/components/SmoothScroll";
import AuthGate from "@/components/AuthGate";
import AtlasCommandDock from "@/components/atlas/AtlasCommandDock";
import { AtlasGenerationProvider } from "@/components/atlas/AtlasGenerationProvider";
import { AtlasThemeProvider } from "@/components/atlas/AtlasThemeProvider";
import { pageTransition } from "@/lib/motion";
import "@/components/atlas/AtlasTheme.css";
import "@/components/atlas/AtlasDarkPolish.css";

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: (count, error) => (error as { status?: number })?.status === 401 ? false : count < 2 } } });
const CrawlTool = () => <ClientToolRoute tool="crawl" />;
const SearchTermsTool = () => <ClientToolRoute tool="search-terms" />;

function Router() {
  return <Switch>
    <Route path="/" component={WorkspaceGraph} /><Route path="/graph"><Redirect to="/" /></Route><Route path="/atlas"><Redirect to="/" /></Route><Route path="/legacy"><Redirect to="/" /></Route><Route path="/generate"><Redirect to="/" /></Route>
    <Route path="/dashboard" component={SystemHealth} /><Route path="/health"><Redirect to="/dashboard" /></Route><Route path="/team" component={AtlasAgents} /><Route path="/agents"><Redirect to="/team" /></Route>
    <Route path="/clients/crawl" component={CrawlTool} /><Route path="/clients/search-terms" component={SearchTermsTool} /><Route path="/clients" component={AtlasClients} /><Route path="/crawl"><Redirect to="/clients/crawl" /></Route><Route path="/zoektermen"><Redirect to="/clients/search-terms" /></Route>
    <Route path="/history" component={RunsHub} /><Route path="/runs"><Redirect to="/history" /></Route><Route path="/visuals"><Redirect to="/history" /></Route>
    <Route path="/todo/schedules" component={OperationsSchedules} /><Route path="/todo" component={Operations} /><Route path="/operations"><Redirect to="/todo" /></Route><Route path="/planning"><Redirect to="/todo/schedules" /></Route>
    <Route path="/controle" component={Knowledge} /><Route path="/knowledge"><Redirect to="/controle" /></Route><Route component={NotFound} />
  </Switch>;
}

function AnimatedRoutes() { const [location] = useLocation(); const reduce = useReducedMotion(); return <AnimatePresence mode="wait" initial={false}><motion.div key={location} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduce ? { opacity: 1 } : { opacity: 0 }} transition={pageTransition}><Router /></motion.div></AnimatePresence>; }
function App() { return <AtlasThemeProvider><QueryClientProvider client={queryClient}><TooltipProvider><AuthGate><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}><AtlasGenerationProvider><SmoothScroll><AnimatedRoutes /><AtlasCommandDock /></SmoothScroll></AtlasGenerationProvider></WouterRouter></AuthGate><Toaster /></TooltipProvider></QueryClientProvider></AtlasThemeProvider>; }
export default App;
