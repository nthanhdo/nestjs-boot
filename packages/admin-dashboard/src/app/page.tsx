import Link from "next/link";
import { Wand2, Network, BookOpen, Package, ArrowRight, Zap, Shield, Layers } from "lucide-react";

const stats = [
  { label: "Modules", value: "28", icon: Package },
  { label: "Example Services", value: "10", icon: Layers },
  { label: "Tests", value: "222", icon: Shield },
  { label: "Zero Config", value: "Yes", icon: Zap },
];

const quickLinks = [
  {
    href: "/generate",
    title: "Project Generator",
    description: "Create a new nestjs-boot project with a visual form",
    icon: Wand2,
    color: "from-sky-500 to-blue-600",
  },
  {
    href: "/architecture",
    title: "Architecture Visualizer",
    description: "View the 10-service microservice architecture",
    icon: Network,
    color: "from-purple-500 to-indigo-600",
  },
  {
    href: "/learn",
    title: "Learning Hub",
    description: "12 interactive lessons from basics to production",
    icon: BookOpen,
    color: "from-emerald-500 to-teal-600",
  },
  {
    href: "/modules",
    title: "Module Explorer",
    description: "Browse all 28 nestjs-boot modules with examples",
    icon: Package,
    color: "from-amber-500 to-orange-600",
  },
];

export default function DashboardHome() {
  return (
    <div className="max-w-6xl mx-auto space-y-10">
      <div className="text-center py-12">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 text-sky-400 text-sm mb-6 border border-sky-500/20">
          <Zap className="w-3.5 h-3.5" />
          Production-ready in seconds
        </div>
        <h1 className="text-4xl font-bold text-white mb-4">
          nestjs-boot Admin Dashboard
        </h1>
        <p className="text-lg text-gray-400 max-w-2xl mx-auto">
          Visual interface for generating, exploring, and learning nestjs-boot microservice projects.
          Built for junior devs, interns, and students who prefer GUI over CLI.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
            <stat.icon className="w-5 h-5 text-sky-400 mx-auto mb-2" />
            <div className="text-2xl font-bold text-white">{stat.value}</div>
            <div className="text-sm text-gray-400">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {quickLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="group bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-all"
          >
            <div className="flex items-start gap-4">
              <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${link.color} flex items-center justify-center shrink-0`}>
                <link.icon className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-white font-semibold flex items-center gap-2">
                  {link.title}
                  <ArrowRight className="w-4 h-4 text-gray-600 group-hover:text-sky-400 group-hover:translate-x-1 transition-all" />
                </h3>
                <p className="text-sm text-gray-400 mt-1">{link.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-white mb-3">Quick Start</h2>
        <div className="bg-gray-950 rounded-lg p-4 font-mono text-sm">
          <span className="text-gray-500">$</span>{" "}
          <span className="text-sky-400">npx</span>{" "}
          <span className="text-white">nestjs-boot my-project --db mongodb --cache redis --auth jwt --docker</span>
        </div>
        <p className="text-sm text-gray-400 mt-3">
          Or use the{" "}
          <Link href="/generate" className="text-sky-400 hover:underline">
            Project Generator
          </Link>{" "}
          for a visual experience.
        </p>
      </div>
    </div>
  );
}
