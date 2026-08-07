"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Wand2,
  Network,
  BookOpen,
  Package,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";

const navItems = [
  { href: "/", label: "Dashboard", icon: Home },
  { href: "/generate", label: "Generator", icon: Wand2 },
  { href: "/architecture", label: "Architecture", icon: Network },
  { href: "/learn", label: "Learning Hub", icon: BookOpen },
  { href: "/modules", label: "Modules", icon: Package },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`fixed top-0 left-0 h-full bg-gray-900 border-r border-gray-800 flex flex-col transition-all duration-200 z-50 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      <div className="flex items-center gap-3 px-4 py-5 border-b border-gray-800">
        <div className="w-8 h-8 rounded-lg bg-sky-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
          NB
        </div>
        {!collapsed && (
          <div>
            <h1 className="text-sm font-semibold text-white">nestjs-boot</h1>
            <p className="text-xs text-gray-400">Admin Dashboard</p>
          </div>
        )}
      </div>

      <nav className="flex-1 py-4 space-y-1 px-2">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
              }`}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-center py-3 border-t border-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
      >
        {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </aside>
  );
}
