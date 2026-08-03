"use client";

import { useState } from "react";

interface MaskedSettings {
  newsSources: string[];
  apiKeys: {
    anthropic: string | null;
    gemini: string | null;
    groq: string | null;
    openrouter: string | null;
  };
}

const PROVIDER_FIELDS: {
  key: keyof MaskedSettings["apiKeys"];
  bodyKey: string;
  label: string;
  help: string;
}[] = [
  {
    key: "anthropic",
    bodyKey: "anthropicApiKey",
    label: "Anthropic (Claude)",
    help: "console.anthropic.com дээрх API key",
  },
  {
    key: "gemini",
    bodyKey: "geminiApiKey",
    label: "Google Gemini",
    help: "Google AI Studio-с авсан API key",
  },
  {
    key: "groq",
    bodyKey: "groqApiKey",
    label: "Groq",
    help: "console.groq.com дээрх API key",
  },
  {
    key: "openrouter",
    bodyKey: "openrouterApiKey",
    label: "OpenRouter",
    help: "openrouter.ai дээрх API key",
  },
];

export default function SettingsForm({
  initial,
}: {
  initial: MaskedSettings;
}) {
  const [newsSources, setNewsSources] = useState<string[]>(initial.newsSources);
  const [newSourceInput, setNewSourceInput] = useState("");
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [current, setCurrent] = useState(initial.apiKeys);

  function addSource() {
    const v = newSourceInput.trim();
    if (!v) return;
    if (!/^https?:\/\//i.test(v)) {
      alert("Линк http:// эсвэл https://-ээр эхэлсэн байх ёстой");
      return;
    }
    setNewsSources((prev) => [...prev, v]);
    setNewSourceInput("");
  }

  function removeSource(idx: number) {
    setNewsSources((prev) => prev.filter((_, i) => i !== idx));
  }

  async function save() {
    setStatus("saving");
    try {
      const body: Record<string, unknown> = { newsSources };
      for (const f of PROVIDER_FIELDS) {
        if (keyInputs[f.key]?.trim()) body[f.bodyKey] = keyInputs[f.key].trim();
      }
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setCurrent(data.apiKeys);
      setKeyInputs({});
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="space-y-8">
      <section className="border border-term-border bg-term-panel p-4">
        <h2 className="text-[11px] uppercase tracking-wider text-term-amber mb-1">
          AI Provider Keys
        </h2>
        <p className="text-[11px] text-term-muted mb-3">
          Дор хаяж нэг түлхүүр тохируулагдсан бол компанийн дэлгэрэнгүй хуудсан дээрх
          &quot;AI дүн шинжилгээ&quot; идэвхжинэ. Хэд хэдэн түлхүүр тохируулсан бол бүх
          үйлчилгээнээс дүгнэлт авч нэгтгэн харуулна.
        </p>
        <div className="space-y-3">
          {PROVIDER_FIELDS.map((f) => (
            <div key={f.key} className="flex items-center gap-3">
              <div className="w-40 shrink-0">
                <div className="text-xs text-term-text">{f.label}</div>
                <div className="text-[10px] text-term-muted">{f.help}</div>
              </div>
              <input
                type="password"
                placeholder={current[f.key] ? `Одоогийн: ${current[f.key]}` : "Тохируулаагүй"}
                value={keyInputs[f.key] ?? ""}
                onChange={(e) =>
                  setKeyInputs((prev) => ({ ...prev, [f.key]: e.target.value }))
                }
                className="flex-1 bg-black border border-term-border px-3 py-1.5 text-xs outline-none focus:border-term-amber placeholder:text-term-muted"
              />
              <span
                className={`text-[10px] w-20 text-right uppercase tracking-wide ${current[f.key] ? "text-term-green" : "text-term-muted"}`}
              >
                {current[f.key] ? "● active" : "○ empty"}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="border border-term-border bg-term-panel p-4">
        <h2 className="text-[11px] uppercase tracking-wider text-term-amber mb-1">
          News Sources
        </h2>
        <p className="text-[11px] text-term-muted mb-3">
          Энд нэмсэн мэдээний сайтуудаас AI дүн шинжилгээ хийхдээ тухайн үед агуулгыг
          татаж, сэтгэл хөдлөлийн (sentiment) шинжилгээнд нэмэлт эх сурвалж болгон ашиглана.
        </p>
        <div className="flex gap-2 mb-3">
          <input
            value={newSourceInput}
            onChange={(e) => setNewSourceInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSource())}
            placeholder="https://ikon.mn/..."
            className="flex-1 bg-black border border-term-border px-3 py-1.5 text-xs outline-none focus:border-term-amber placeholder:text-term-muted"
          />
          <button
            onClick={addSource}
            className="border border-term-border px-3 py-1.5 text-xs uppercase tracking-wide hover:border-term-amber hover:text-term-amber"
          >
            Нэмэх
          </button>
        </div>
        <ul className="space-y-1">
          {newsSources.map((s, i) => (
            <li
              key={i}
              className="flex items-center justify-between bg-black border border-term-border px-3 py-1.5 text-xs"
            >
              <span className="truncate text-term-text">{s}</span>
              <button
                onClick={() => removeSource(i)}
                className="text-term-muted hover:text-term-red text-[11px] ml-3 uppercase"
              >
                Устгах
              </button>
            </li>
          ))}
          {newsSources.length === 0 && (
            <li className="text-xs text-term-muted">Одоогоор линк нэмээгүй байна.</li>
          )}
        </ul>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={status === "saving"}
          className="border border-term-amber text-term-amber text-xs uppercase tracking-wide px-4 py-2 font-bold hover:bg-term-amber hover:text-black transition-colors disabled:opacity-50"
        >
          {status === "saving" ? "Хадгалж байна..." : "Хадгалах"}
        </button>
        {status === "saved" && <span className="text-xs text-term-green">Хадгалагдлаа</span>}
        {status === "error" && <span className="text-xs text-term-red">Алдаа гарлаа</span>}
      </div>
    </div>
  );
}
