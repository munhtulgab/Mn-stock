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
    <div className="space-y-6">
      <section className="rounded-2xl border border-app-border bg-app-card p-4">
        <h2 className="text-sm font-semibold text-app-text mb-1">AI үйлчилгээний түлхүүр</h2>
        <p className="text-xs text-app-muted mb-3">
          Дор хаяж нэг түлхүүр тохируулагдсан бол компанийн дэлгэрэнгүй хуудсан дээрх
          &quot;AI дүн шинжилгээ&quot; идэвхжинэ. Хэд хэдэн түлхүүр тохируулсан бол бүх
          үйлчилгээнээс дүгнэлт авч нэгтгэн харуулна.
        </p>
        <div className="space-y-3">
          {PROVIDER_FIELDS.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-app-text">{f.label}</div>
                <span
                  className={`text-[10px] rounded-full px-2 py-0.5 font-medium ${current[f.key] ? "bg-app-positive-bg text-app-positive" : "bg-app-bg text-app-muted"}`}
                >
                  {current[f.key] ? "Идэвхтэй" : "Тохируулаагүй"}
                </span>
              </div>
              <div className="text-[11px] text-app-muted">{f.help}</div>
              <input
                type="password"
                placeholder={current[f.key] ? `Одоогийн: ${current[f.key]}` : "Түлхүүр оруулах"}
                value={keyInputs[f.key] ?? ""}
                onChange={(e) =>
                  setKeyInputs((prev) => ({ ...prev, [f.key]: e.target.value }))
                }
                className="w-full rounded-xl border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text outline-none focus:border-brand"
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-app-border bg-app-card p-4">
        <h2 className="text-sm font-semibold text-app-text mb-1">Мэдээллийн сайтууд</h2>
        <p className="text-xs text-app-muted mb-3">
          Энд нэмсэн мэдээний сайтуудаас AI дүн шинжилгээ хийхдээ тухайн үед агуулгыг
          татаж, сэтгэл хөдлөлийн (sentiment) шинжилгээнд нэмэлт эх сурвалж болгон ашиглана.
        </p>
        <div className="flex gap-2 mb-3">
          <input
            value={newSourceInput}
            onChange={(e) => setNewSourceInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSource())}
            placeholder="https://ikon.mn/..."
            className="flex-1 rounded-xl border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text outline-none focus:border-brand"
          />
          <button
            onClick={addSource}
            className="rounded-xl border border-app-border px-4 py-2 text-sm font-medium text-brand"
          >
            Нэмэх
          </button>
        </div>
        <ul className="space-y-1.5">
          {newsSources.map((s, i) => (
            <li
              key={i}
              className="flex items-center justify-between rounded-xl bg-app-bg px-3 py-2 text-xs"
            >
              <span className="truncate text-app-text">{s}</span>
              <button
                onClick={() => removeSource(i)}
                className="text-app-negative text-[11px] ml-3 font-medium"
              >
                Устгах
              </button>
            </li>
          ))}
          {newsSources.length === 0 && (
            <li className="text-xs text-app-muted">Одоогоор линк нэмээгүй байна.</li>
          )}
        </ul>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={status === "saving"}
          className="rounded-xl bg-brand text-white text-sm font-semibold px-5 py-2.5 disabled:opacity-50"
        >
          {status === "saving" ? "Хадгалж байна..." : "Хадгалах"}
        </button>
        {status === "saved" && <span className="text-xs text-app-positive">Хадгалагдлаа</span>}
        {status === "error" && <span className="text-xs text-app-negative">Алдаа гарлаа</span>}
      </div>
    </div>
  );
}
