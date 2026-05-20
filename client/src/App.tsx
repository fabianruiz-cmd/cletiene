import { Switch, Route, useLocation, Link, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import CreateService from "@/pages/create-service";
import Login from "@/pages/login";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { LayoutDashboard, PlusCircle, LogOut } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { Button } from "@/components/ui/button";

const navItems = [
  { title: "Servicios", url: "/dashboard", icon: LayoutDashboard },
  { title: "Registrar", url: "/create", icon: PlusCircle },
];

function TopNav() {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  return (
    <header className="sticky top-0 z-50 w-full bg-white border-b border-gray-200 shadow-sm">
      <div className="flex items-center justify-between h-14 px-4 max-w-5xl mx-auto">
        <Link href="/dashboard">
          <img
            src="https://cltiene.com/wp-content/uploads/2025/10/logo-CL.png"
            alt="CL Tiene"
            className="h-8 object-contain cursor-pointer"
          />
        </Link>
        {user && (
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const active = location === item.url;
              return (
                <Link
                  key={item.url}
                  href={item.url}
                  data-testid={`nav-${item.url.replace(/\//g, "") || "home"}`}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors
                    ${active
                      ? "bg-[#FF8147] text-white"
                      : "text-gray-600 hover:bg-[#FF8147]/10 hover:text-[#FF8147]"
                    }`}
                >
                  <item.icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{item.title}</span>
                </Link>
              );
            })}
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              data-testid="button-logout"
              className="ml-2 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-xl"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline ml-1 text-sm font-semibold">Salir</span>
            </Button>
          </nav>
        )}
      </div>
    </header>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-56px)] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-[#FF8147] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return <>{children}</>;
}

function Router() {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;

  return (
    <Switch>
      <Route path="/login">
        {user ? <Redirect to="/dashboard" /> : <Login />}
      </Route>
      <Route path="/">
        <Redirect to="/dashboard" />
      </Route>
      <Route path="/dashboard">
        <ProtectedRoute><Dashboard /></ProtectedRoute>
      </Route>
      <Route path="/create">
        <ProtectedRoute><CreateService /></ProtectedRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <div className="min-h-screen flex flex-col bg-background">
            <TopNav />
            <main className="flex-1 overflow-y-auto relative scroll-smooth bg-background">
              <div className="absolute top-0 left-0 right-0 h-64 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none -z-10" />
              <Router />
            </main>
            <footer className="border-t border-border bg-background py-3 text-center text-xs text-muted-foreground">
              © 2026 CL Tiene Soluciones — Todos los derechos reservados
            </footer>
          </div>

          <a
            href="https://api.whatsapp.com/send/?phone=573185159138"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Ayuda por WhatsApp"
            data-testid="link-whatsapp"
            className="fixed bottom-6 right-6 z-50 flex items-center group"
          >
            <span className="mr-3 px-3 py-1.5 rounded-full bg-[#25D366] text-white text-sm font-semibold shadow-lg opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 whitespace-nowrap pointer-events-none">
              Ayuda
            </span>
            <div className="flex items-center justify-center w-14 h-14 rounded-full bg-[#25D366] hover:bg-[#1ebe5d] shadow-lg hover:shadow-xl transition-all duration-200 group-hover:scale-110">
              <SiWhatsapp className="w-7 h-7 text-white" />
            </div>
          </a>

          <Toaster />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
