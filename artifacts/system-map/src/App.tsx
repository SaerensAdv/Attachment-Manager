import { Switch, Route, Redirect, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Dashboard from "@/pages/Dashboard";
import Team from "@/pages/Team";
import Clients from "@/pages/Clients";
import CrawlUpload from "@/pages/CrawlUpload";
import History from "@/pages/History";
import Controle from "@/pages/Controle";
import Planning from "@/pages/Planning";
import TabNav from "@/components/TabNav";
import CommandPalette from "@/components/CommandPalette";
import SmoothScroll from "@/components/SmoothScroll";
import { pageTransition } from "@/lib/motion";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      {/* The standalone Genereren page now lives as a command bar on the Kaart. */}
      <Route path="/generate">
        <Redirect to="/" />
      </Route>
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/team" component={Team} />
      <Route path="/clients" component={Clients} />
      <Route path="/crawl" component={CrawlUpload} />
      <Route path="/history" component={History} />
      <Route path="/planning" component={Planning} />
      <Route path="/controle" component={Controle} />
      <Route component={NotFound} />
    </Switch>
  );
}

// Quick, opacity-only transition between routes. Keyed on location so each page
// fades cleanly; reduced-motion users get an instant swap with no animation.
function AnimatedRoutes() {
  const [location] = useLocation();
  const reduce = useReducedMotion();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={reduce ? { opacity: 1 } : { opacity: 0 }}
        transition={pageTransition}
      >
        <Router />
      </motion.div>
    </AnimatePresence>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <SmoothScroll>
            <TabNav />
            <CommandPalette />
            <AnimatedRoutes />
          </SmoothScroll>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
