import { LayoutDashboard, PlusCircle } from "lucide-react";
import { Link } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const items = [
  { title: "Servicios", url: "/", icon: LayoutDashboard },
  { title: "Registrar Servicio", url: "/create", icon: PlusCircle },
];

export function AppSidebar() {
  return (
    <Sidebar className="border-r border-sidebar-border">
      <SidebarHeader className="h-20 flex items-center px-6 border-b border-sidebar-border/50 bg-sidebar-background">
        <div className="flex items-center gap-3 w-full">
          <div className="bg-white rounded-lg p-2 w-full flex items-center justify-center shadow-sm">
            <img
              src="https://cltiene.com/wp-content/uploads/2025/10/logo-CL.png"
              alt="CL Tiene Logo"
              className="h-8 object-contain"
            />
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="pt-6">
          <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs font-semibold uppercase tracking-wider mb-2">
            Navegación
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild className="py-6">
                    <Link href={item.url} className="flex items-center gap-3">
                      <item.icon className="w-5 h-5 text-sidebar-foreground" />
                      <span className="font-medium text-[15px]">{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
