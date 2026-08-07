"use client";

import { useState, useEffect } from "react";
import { BookOpen, Clock, CheckCircle, Circle, Copy, Check } from "lucide-react";
import { lessons } from "@/lib/lessons-data";

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative group">
      <pre className="bg-gray-950 border border-gray-800 rounded-lg p-4 text-sm text-gray-300 font-mono overflow-x-auto">
        {code}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1.5 bg-gray-800 rounded text-gray-400 hover:text-white transition-all"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

function renderContent(content: string) {
  const parts = content.split(/(```[\s\S]*?```)/g);
  return parts.map((part, i) => {
    if (part.startsWith("```")) {
      const lines = part.split("\n");
      const code = lines.slice(1, -1).join("\n");
      return <CodeBlock key={i} code={code} />;
    }
    // Render markdown-like text
    return (
      <div key={i} className="prose-invert">
        {part.split("\n").map((line, j) => {
          if (line.startsWith("# ")) return <h1 key={j} className="text-2xl font-bold text-white mt-6 mb-3">{line.slice(2)}</h1>;
          if (line.startsWith("## ")) return <h2 key={j} className="text-lg font-semibold text-white mt-5 mb-2">{line.slice(3)}</h2>;
          if (line.startsWith("### ")) return <h3 key={j} className="text-base font-medium text-gray-200 mt-4 mb-2">{line.slice(4)}</h3>;
          if (line.startsWith("- [ ] ")) return <div key={j} className="flex items-center gap-2 text-sm text-gray-400 ml-2"><Circle className="w-3.5 h-3.5" />{line.slice(6)}</div>;
          if (line.startsWith("- ")) return <div key={j} className="text-sm text-gray-400 ml-4 mb-1">&#8226; {line.slice(2)}</div>;
          if (line.trim() === "") return <div key={j} className="h-2" />;
          return <p key={j} className="text-sm text-gray-400 leading-relaxed">{line}</p>;
        })}
      </div>
    );
  });
}

export default function LearnPage() {
  const [activeLesson, setActiveLesson] = useState(1);
  const [completed, setCompleted] = useState<Set<number>>(new Set());

  useEffect(() => {
    const saved = localStorage.getItem("nestjs-boot-progress");
    if (saved) setCompleted(new Set(JSON.parse(saved)));
  }, []);

  const toggleComplete = (id: number) => {
    setCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      localStorage.setItem("nestjs-boot-progress", JSON.stringify([...next]));
      return next;
    });
  };

  const lesson = lessons.find((l) => l.id === activeLesson)!;

  return (
    <div className="max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-1">Learning Hub</h1>
      <p className="text-gray-400 mb-8">
        {completed.size}/{lessons.length} lessons completed
      </p>

      <div className="flex gap-6">
        {/* Sidebar */}
        <div className="w-72 shrink-0 space-y-1">
          {lessons.map((l) => (
            <button
              key={l.id}
              onClick={() => setActiveLesson(l.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all flex items-start gap-2.5 ${
                activeLesson === l.id
                  ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                  : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
              }`}
            >
              {completed.has(l.id) ? (
                <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-gray-600 mt-0.5 shrink-0" />
              )}
              <div>
                <div className="font-medium">{l.title}</div>
                <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                  <Clock className="w-3 h-3" />
                  {l.duration}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 bg-gray-900 border border-gray-800 rounded-xl p-6 min-h-[600px]">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <BookOpen className="w-5 h-5 text-sky-400" />
              <h2 className="text-lg font-semibold text-white">
                Lesson {lesson.id}: {lesson.title}
              </h2>
            </div>
            <button
              onClick={() => toggleComplete(lesson.id)}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                completed.has(lesson.id)
                  ? "bg-green-500/10 text-green-400 border-green-500/20"
                  : "bg-gray-800 text-gray-400 border-gray-700 hover:text-white"
              }`}
            >
              {completed.has(lesson.id) ? "Completed" : "Mark Complete"}
            </button>
          </div>
          <div className="space-y-3">{renderContent(lesson.content)}</div>
        </div>
      </div>
    </div>
  );
}
