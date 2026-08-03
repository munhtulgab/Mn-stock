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
      <section>
        <h2 className="font-semibold text-sm mb-1">AI дүн шинжилгээний API түлхүүрүүд</h2>
        <p className="text-xs text-neutral-500 mb-3">
          Дор хаяж нэг түлхүүр тохируулагдсан бол компанийн дэлгэрэнгүй хуудсан дээрх
          &quot;AI дүн шинжилгээ&quot; идэвхжинэ. Хэд хэдэн түлхүүр тохируулсан бол бүх
          үйлчилгээнээс дүгнэлт авч нэгтгэн харуулна.
        </p>
        <div className="space-y-3">
          {PROVIDER_FIELDS.map((f) => (
            <div key={f.key} className="flex items-center gap-3">
              <div className="w-40 shrink-0">
                <div className="text-sm">{f.label}</div>
                <div className="text-[11px] text-neutral-500">{f.help}</div>
              </div>
              <input
                type="password"
                placeholder={current[f.key] ? `Одоогийн: ${current[f.key]}` : "Тохируулаагүй"}
                value={keyInputs[f.key] ?? ""}
                onChange={(e) =>
                  setKeyInputs((prev) => ({ ...prev, [f.key]: e.target.value }))
                }
                className="flex-1 rounded-md bg-neutral-900 border border-neutral-700 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
              />
              <span
                className={`text-xs w-16 text-right ${current[f.key] ? "text-emerald-400" : "text-neutral-600"}`}
              >
                {current[f.key] ? "тохирсон" : "хоосон"}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-semibold text-sm mb-1">Мэдээллийн эх сурвалжийн линк</h2>
        <p className="text-xs text-neutral-500 mb-3">
          Энд нэмсэн мэдээний сайтуудаас AI дүн шинжилгээ хийхдээ тухайн үед агуулгыг
          татаж, сэтгэл хөдлөлийн (sentiment) шинжилгээнд нэмэлт эх сурвалж болгон ашиглана.
        </p>
        <div className="flex gap-2 mb-3">
          <input
            value={newSourceInput}
            onChange={(e) => setNewSourceInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSource())}
            placeholder="https://ikon.mn/..."
            className="flex-1 rounded-md bg-neutral-900 border border-neutral-700 px-3 py-1.5 text-sm outline-none focus:border-neutral-500"
          />
          <button
            onClick={addSource}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm hover:border-neutral-500"
          >
            Нэмэх
          </button>
        </div>
        <ul className="space-y-1">
          {newsSources.map((s, i) => (
            <li
              key={i}
              className="flex items-center justify-between rounded-md bg-neutral-900 border border-neutral-800 px-3 py-1.5 text-sm"
            >
              <span className="truncate">{s}</span>
              <button
                onClick={() => removeSource(i)}
                className="text-neutral-500 hover:text-rose-400 text-xs ml-3"
              >
                Устгах
              </button>
            </li>
          ))}
          {newsSources.length === 0 && (
            <li className="text-sm text-neutral-600">Одоогоор линк нэмээгүй байна.</li>
          )}
        </ul>
      </section>

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={status === "saving"}
          className="rounded-md bg-neutral-100 text-neutral-900 text-sm px-4 py-2 font-medium hover:bg-white disabled:opacity-50"
        >
          {status === "saving" ? "Хадгалж байна..." : "Хадгалах"}
        </button>
        {status === "saved" && <span className="text-sm text-emerald-400">Хадгалагдлаа</span>}
        {status === "error" && <span className="text-sm text-rose-400">Алдаа гарлаа</span>}
      </div>
    </div>
  );
}
