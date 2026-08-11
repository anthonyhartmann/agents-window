import React, { useState, useEffect, useRef, KeyboardEvent } from "react";
import { useStreamContext } from "@/providers/Stream";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const PROVIDERS = [
  { id: "clinepass", name: "Clinepass" },
  { id: "cline-billing", name: "Cline billing" },
  { id: "jules", name: "Jules" },
];

const MODELS: Record<string, { id: string; name: string; maxTokens?: string }[]> = {
  "clinepass": [
    { id: "gpt-4o", name: "GPT-4o (current)", maxTokens: "128K" },
    { id: "gpt-4-turbo", name: "GPT-4 Turbo", maxTokens: "128K" },
    { id: "claude-3-sonnet", name: "Claude 3 Sonnet", maxTokens: "200K" },
  ],
  "cline-billing": [
    { id: "gpt-4o", name: "GPT-4o (current)", maxTokens: "128K" },
    { id: "gpt-4-turbo", name: "GPT-4 Turbo", maxTokens: "128K" },
    { id: "claude-3-sonnet", name: "Claude 3 Sonnet", maxTokens: "200K" },
  ],
  "jules": [
    { id: "gemini-pro", name: "Gemini Pro", maxTokens: "1.0M" },
    { id: "flash", name: "Flash", maxTokens: "1.0M" },
  ],
};

export function ModelSelector() {
  const { providerId, setProviderId, modelId, setModelId } = useStreamContext();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize defaults if not set
  useEffect(() => {
    if (!providerId) {
      setProviderId("cline-billing");
    }
    if (!modelId) {
      setModelId("gpt-4o");
    }
  }, [providerId, modelId, setProviderId, setModelId]);

  const activeProvider = providerId || "cline-billing";
  const activeModel = modelId || "gpt-4o";
  const currentProviderName = PROVIDERS.find(p => p.id === activeProvider)?.name || activeProvider;

  const models = MODELS[activeProvider] || [];
  const filteredModels = models.filter(m => m.name.toLowerCase().includes(search.toLowerCase()));

  // Reset selection when search changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [search, activeProvider]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const cycleProvider = () => {
    const currentIndex = PROVIDERS.findIndex(p => p.id === activeProvider);
    const nextIndex = (currentIndex + 1) % PROVIDERS.length;
    const nextProvider = PROVIDERS[nextIndex];
    setProviderId(nextProvider.id);

    // Automatically select the first model of the new provider
    const nextModels = MODELS[nextProvider.id] || [];
    if (nextModels.length > 0) {
      setModelId(nextModels[0].id);
    }
    setSearch("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      cycleProvider();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filteredModels.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredModels.length) % filteredModels.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredModels.length > 0) {
        setModelId(filteredModels[selectedIndex].id);
        setIsOpen(false);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <Button
        variant="ghost"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 hover:bg-gray-100 text-sm font-medium"
      >
        {currentProviderName} <ChevronRight className="h-4 w-4" />
      </Button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 mt-2 w-96 rounded-md bg-[#252526] text-white shadow-xl z-50 overflow-hidden border border-gray-700 font-mono text-sm"
          >
            <div className="p-4 flex flex-col gap-3">
              <div className="font-semibold text-lg text-gray-200">Select Model</div>

              <div className="flex items-center gap-2 text-sm text-gray-400">
                <span className="text-[#3b82f6]">Provider:</span>
                <span className="text-white">{currentProviderName}</span>
                <span className="text-gray-500">(tab to change provider)</span>
              </div>

              <div className="relative mt-1">
                <input
                  type="text"
                  placeholder="Search models..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoFocus
                  className="w-full bg-[#1e1e1e] border border-gray-600 rounded p-2 text-white outline-none focus:border-gray-400"
                />
              </div>

              <div className="mt-2 max-h-60 overflow-y-auto">
                {filteredModels.map((model, idx) => (
                  <div
                    key={model.id}
                    onClick={() => {
                      setModelId(model.id);
                      setIsOpen(false);
                    }}
                    className={cn(
                      "flex items-center gap-2 p-1.5 cursor-pointer rounded",
                      idx === selectedIndex ? "bg-[#264f78]" : "hover:bg-[#2a2d2e]",
                      activeModel === model.id && "bg-[#264f78]"
                    )}
                  >
                    <span className="w-4 flex justify-center">
                      {idx === selectedIndex ? <ChevronRight className="h-4 w-4" /> : ""}
                    </span>
                    <span className="flex-1 truncate">{model.name}</span>
                    {model.maxTokens && (
                      <span className="text-gray-500 text-xs">{model.maxTokens}</span>
                    )}
                  </div>
                ))}
                {filteredModels.length === 0 && (
                  <div className="text-gray-500 p-2 text-center">No models found.</div>
                )}
              </div>

              <div className="mt-2 text-xs text-gray-500 border-t border-gray-700 pt-2 flex items-center justify-between">
                Type to search, ↑/↓ navigate, Enter to select, Tab to change provider, Esc to close
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
