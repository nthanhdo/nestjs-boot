"use client";

import { useState } from "react";
import { Package, Search, X, Code, Layers, Tag } from "lucide-react";
import {
  modules,
  categories,
  categoryColors,
  kanoColors,
  type ModuleInfo,
} from "@/lib/modules-data";

function ModuleDetail({ module, onClose }: { module: ModuleInfo; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-6 border-b border-gray-800">
          <div>
            <h2 className="text-xl font-semibold text-white">{module.name}</h2>
            <div className="flex items-center gap-2 mt-2">
              <span className={`px-2 py-0.5 text-xs rounded border ${categoryColors[module.category]}`}>
                {module.category}
              </span>
              <span className={`px-2 py-0.5 text-xs rounded ${kanoColors[module.kano]}`}>
                {module.kano}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-gray-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-2">Description</h3>
            <p className="text-sm text-gray-400">{module.description}</p>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-2">Configuration</h3>
            <pre className="bg-gray-950 border border-gray-800 rounded-lg p-4 text-sm text-sky-300 font-mono overflow-x-auto">
              {module.config}
            </pre>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-2">Methods</h3>
            <div className="flex flex-wrap gap-2">
              {module.methods.map((m) => (
                <code key={m} className="px-2 py-1 text-xs bg-gray-800 text-amber-400 rounded font-mono">
                  {m}
                </code>
              ))}
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-300 mb-2">Exports</h3>
            <div className="flex flex-wrap gap-2">
              {module.exports.map((e) => (
                <code key={e} className="px-2 py-1 text-xs bg-gray-800 text-emerald-400 rounded font-mono">
                  {e}
                </code>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ModulesPage() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [selectedModule, setSelectedModule] = useState<ModuleInfo | null>(null);

  const filtered = modules.filter((m) => {
    const matchSearch = !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.description.toLowerCase().includes(search.toLowerCase());
    const matchCategory = !activeCategory || m.category === activeCategory;
    return matchSearch && matchCategory;
  });

  return (
    <div className="max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-1">Module Explorer</h1>
      <p className="text-gray-400 mb-6">{modules.length} modules across {categories.length} categories</p>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search modules..."
            className="w-full pl-9 pr-3 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm text-white focus:outline-none focus:border-sky-500"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setActiveCategory(null)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              !activeCategory ? "bg-sky-500/10 text-sky-400 border-sky-500/20" : "bg-gray-900 text-gray-400 border-gray-800 hover:border-gray-700"
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                activeCategory === cat
                  ? categoryColors[cat]
                  : "bg-gray-900 text-gray-400 border-gray-800 hover:border-gray-700"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Module Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {filtered.map((mod) => (
          <button
            key={mod.name}
            onClick={() => setSelectedModule(mod)}
            className="text-left bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition-all group"
          >
            <div className="flex items-center gap-2 mb-2">
              <Package className="w-4 h-4 text-sky-400" />
              <span className="text-sm font-medium text-white group-hover:text-sky-400 transition-colors truncate">
                {mod.name}
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-3 line-clamp-2">{mod.description}</p>
            <div className="flex items-center gap-2">
              <span className={`px-1.5 py-0.5 text-[10px] rounded border ${categoryColors[mod.category]}`}>
                {mod.category}
              </span>
              <span className={`px-1.5 py-0.5 text-[10px] rounded ${kanoColors[mod.kano]}`}>
                {mod.kano}
              </span>
            </div>
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No modules match your search.
        </div>
      )}

      {/* Detail Modal */}
      {selectedModule && (
        <ModuleDetail module={selectedModule} onClose={() => setSelectedModule(null)} />
      )}
    </div>
  );
}
