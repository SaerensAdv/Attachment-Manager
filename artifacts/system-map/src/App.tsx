import { Switch, Route, Redirect, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import WorkspaceGraph from "@/pages/WorkspaceGraph";
import SystemHealth from "@/pages/SystemHealth";
import Team from "@/pages/Team";
import Clients from "@/pages/Clients";
import CrawlUpload from "@/pages/CrawlUpload";
import Zoektermen from "@/pages/Zoektermen";
import History from "@/pages/History";
import Knowledge from "@/pages/Knowledge";
import Planning from "@/pages/Planning";
import Operations from "@/pages/Operations";
import VisualStudio from "@/pages/VisualStudio";
import TabNav from "@/components/TabNav";
import CommandPalette from "@/components/CommandPalette";
import SmoothScroll from "@/components/SmoothScroll";
import AuthGate from "@/components/AuthGate";
import { pageTransition } from "@/lib/motion";
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: (count, error) => (error as { status?: number })?.status === 401 ? false : count < 2 } } });
function Router() { return <Switch><Route path="/" component={WorkspaceGraph} /><Route path="/graph"><Redirect to="/" /></Route><Route path="/atlas"><Redirect to="/" /></Route><Route path="/legacy" component={Home} /><Route path="/generate"><Redirect to="/legacy" /></Route><Route path="/dashboard" component={SystemHealth} /><Route path="/health"><Redirect to="/dashboard" /></Route><Route path="/team" component={Team} /><Route path="/clients" component={Clients} /><Route path="/crawl" component={CrawlUpload} /><Route path="/zoektermen" component={Zoektermen} /><Route path="/history" component={History} /><Route path="/todo" component={Operations} /><Route path="/operations"><Redirect to="/todo" /></Route><Route path="/planning" component={Planning} /><Route path="/controle" component={Knowledge} /><Route path="/knowledge"><Redirect to="/controle" /></Route><Route path="/visuals" component={VisualStudio} /><Route component={NotFound} /></Switch>; }
const atlasRoutes = new Set(["/", "/graph", "/atlas", "/todo", "/operations", "/dashboard", "/health", "/controle", "/knowledge"]);
function AppChrome() { const [location] = useLocation(); if (atlasRoutes.has(location)) return null; return <><TabNav /><CommandPalette /></>; }
function AnimatedRoutes() { const [location] = useLocation(); const reduce = useReducedMotion(); return <AnimatePresence mode="wait" initial={false}><motion.div key={location} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduce ? { opacity: 1 } : { opacity: 0 }} transition={pageTransition}><Router /></motion.div></AnimatePresence>; }
function App() { return <QueryClientProvider client={queryClient}><TooltipProvider><AuthGate><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}><SmoothScroll><AppChrome /><AnimatedRoutes /></SmoothScroll></WouterRouter></AuthGate><Toaster /></TooltipProvider></QueryClientProvider>; }
export default App;
