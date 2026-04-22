import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ThemeColorProvider } from "./contexts/ThemeColorContext";
import { OCSyncProvider } from "./contexts/OCSyncContext";
import Home from "./pages/Home";
import ClientsManagement from "./pages/ClientsManagement";
import AdminLogin from "./pages/AdminLogin";
import MagicLinkCallback from "./pages/MagicLinkCallback";
import IntegrationLogs from "./pages/IntegrationLogs";
function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/clients"} component={ClientsManagement} />
      <Route path={"/admin/login"} component={AdminLogin} />
      <Route path={"/admin/callback"} component={MagicLinkCallback} />
      <Route path={"/logs"} component={IntegrationLogs} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <ThemeColorProvider>
          <OCSyncProvider>
            <TooltipProvider>
              <Toaster position="top-center" />
              <Router />
            </TooltipProvider>
          </OCSyncProvider>
        </ThemeColorProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
