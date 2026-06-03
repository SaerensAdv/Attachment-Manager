import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import Generate from "@/pages/Generate";
import Team from "@/pages/Team";
import Clients from "@/pages/Clients";
import History from "@/pages/History";
import TabNav from "@/components/TabNav";
import SmoothScroll from "@/components/SmoothScroll";
import { pageTransition } from "@/lib/motion";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/generate" component={Generate} />
      <Route path="/team" component={Team} />
      <Route path="/clients" component={Clients} />
      <Route path="/history" component={History} />
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
            <AnimatedRoutes />
          </SmoothScroll>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
