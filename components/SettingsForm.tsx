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
  sms: {
    enabled: boolean;
    apiKey: string | null;
    from: string | null;
    brand: string | null;
    recipients: string[];
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

  const [smsEnabled, setSmsEnabled] = useState(initial.sms.enabled);
  const [smsKeyInput, setSmsKeyInput] = useState("");
  const [smsFrom, setSmsFrom] = useState(initial.sms.from ?? "");
  const [smsBrand, setSmsBrand] = useState(initial.sms.brand ?? "");
  const [smsRecipients, setSmsRecipients] = useState<string[]>(initial.sms.recipients);
  const [smsRecipientInput, setSmsRecipientInput] = useState("");
  const [smsCurrent, setSmsCurrent] = useState(initial.sms);
  const [testTo, setTestTo] = useState("");
  const [testState, setTestState] = useState<
    { kind: "idle" } | { kind: "sending" } | { kind: "ok"; id?: string } | { kind: "err"; message: string }
  >({ kind: "idle" });

  /** Discards unsaved edits and returns every field to its last saved value. */
  function reset() {
    setNewsSources(initial.newsSources);
    setNewSourceInput("");
    setKeyInputs({});
    setSmsEnabled(smsCurrent.enabled);
    setSmsFrom(smsCurrent.from ?? "");
    setSmsBrand(smsCurrent.brand ?? "");
    setSmsRecipients(smsCurrent.recipients);
    setSmsKeyInput("");
    setSmsRecipientInput("");
    setTestState({ kind: "idle" });
    setStatus("idle");
  }

  function addRecipient() {
    const v = smsRecipientInput.replace(/[^\d+]/g, "").trim();
    if (!v) return;
    setSmsRecipients((prev) => (prev.includes(v) ? prev : [...prev, v]));
    setSmsRecipientInput("");
  }

  const [keyCheck, setKeyCheck] = useState<
    | { kind: "idle" }
    | { kind: "checking" }
    | { kind: "ok"; remaining: number; total: number; usedToday: number }
    | { kind: "err"; message: string }
  >({ kind: "idle" });

  async function checkKey() {
    setKeyCheck({ kind: "checking" });
    try {
      const res = await fetch("/api/sms/balance");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setKeyCheck({ kind: "err", message: data.error || `Алдаа ${res.status}` });
        return;
      }
      setKeyCheck({
        kind: "ok",
        remaining: data.balance?.balance ?? 0,
        total: data.balance?.totalMessage ?? 0,
        usedToday: data.balance?.current ?? 0,
      });
    } catch (err) {
      setKeyCheck({ kind: "err", message: (err as Error).message });
    }
  }

  async function sendTest() {
    setTestState({ kind: "sending" });
    try {
      const res = await fetch("/api/sms/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testTo }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setTestState({ kind: "err", message: data.error || `Алдаа ${res.status}` });
        return;
      }
      setTestState({ kind: "ok", id: data.messageId });
    } catch (err) {
      setTestState({ kind: "err", message: (err as Error).message });
    }
  }

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
      const body: Record<string, unknown> = {
        newsSources,
        smsEnabled,
        smsFrom,
        smsBrand,
        smsRecipients,
      };
      for (const f of PROVIDER_FIELDS) {
        if (keyInputs[f.key]?.trim()) body[f.bodyKey] = keyInputs[f.key].trim();
      }
      if (smsKeyInput.trim()) body.smsApiKey = smsKeyInput.trim();

      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setCurrent(data.apiKeys);
      setSmsCurrent(data.sms);
      setKeyInputs({});
      setSmsKeyInput("");
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

      <section className="rounded-2xl border border-app-border bg-app-card p-4">
        <div className="flex items-start justify-between gap-3 mb-1">
          <div>
            <h2 className="text-sm font-semibold text-app-text">CallPro SMS</h2>
            <p className="text-xs text-app-muted mt-0.5">
              Дохио өөрчлөгдөхөд доорх дугаарууд руу SMS илгээнэ.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={smsEnabled}
            aria-label="SMS илгээх"
            onClick={() => setSmsEnabled((v) => !v)}
            className={`shrink-0 w-12 h-7 rounded-full p-0.5 transition-colors ${
              smsEnabled ? "bg-brand" : "bg-app-elevated"
            }`}
          >
            <span
              className={`block w-6 h-6 rounded-full bg-white transition-transform ${
                smsEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <div className={smsEnabled ? "space-y-3 mt-3" : "space-y-3 mt-3 opacity-50"}>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-app-text">API түлхүүр</label>
              <span
                className={`text-[10px] rounded-full px-2 py-0.5 font-medium ${
                  smsCurrent.apiKey
                    ? "bg-app-positive-bg text-app-positive"
                    : "bg-app-bg text-app-muted"
                }`}
              >
                {smsCurrent.apiKey ? "Идэвхтэй" : "Тохируулаагүй"}
              </span>
            </div>
            <div className="text-[11px] text-app-muted">
              api-text.callpro.mn дээрх x-api-key
            </div>
            <input
              type="password"
              disabled={!smsEnabled}
              placeholder={smsCurrent.apiKey ? `Одоогийн: ${smsCurrent.apiKey}` : "Түлхүүр оруулах"}
              value={smsKeyInput}
              onChange={(e) => setSmsKeyInput(e.target.value)}
              className="w-full rounded-xl border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text outline-none focus:border-brand"
            />
            <button
              type="button"
              onClick={checkKey}
              disabled={!smsEnabled || !smsCurrent.apiKey || keyCheck.kind === "checking"}
              className="w-full rounded-xl border border-app-border py-2 text-sm font-medium text-brand disabled:opacity-50"
            >
              {keyCheck.kind === "checking" ? "Шалгаж байна..." : "Түлхүүр шалгах"}
            </button>
            {keyCheck.kind === "ok" && (
              <p className="text-xs text-app-positive">
                Түлхүүр зөв. Үлдэгдэл {keyCheck.remaining} / {keyCheck.total} мессеж
                {keyCheck.usedToday > 0 && ` · өнөөдөр ${keyCheck.usedToday} илгээсэн`}
              </p>
            )}
            {keyCheck.kind === "err" && (
              <p className="text-xs text-app-negative break-words">{keyCheck.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-app-text">Илгээгч дугаар</label>
              <input
                inputMode="numeric"
                disabled={!smsEnabled}
                placeholder="72001234"
                value={smsFrom}
                onChange={(e) => setSmsFrom(e.target.value)}
                className="w-full rounded-xl border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text outline-none focus:border-brand"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-app-text">Брэнд</label>
              <input
                disabled={!smsEnabled}
                placeholder="Заавал биш"
                value={smsBrand}
                onChange={(e) => setSmsBrand(e.target.value)}
                className="w-full rounded-xl border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text outline-none focus:border-brand"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-app-text">Хүлээн авагчид</label>
            <div className="flex gap-2">
              <input
                inputMode="numeric"
                disabled={!smsEnabled}
                value={smsRecipientInput}
                onChange={(e) => setSmsRecipientInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addRecipient())}
                placeholder="99112233"
                className="flex-1 rounded-xl border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text outline-none focus:border-brand"
              />
              <button
                type="button"
                onClick={addRecipient}
                disabled={!smsEnabled}
                className="rounded-xl border border-app-border px-4 py-2 text-sm font-medium text-brand disabled:opacity-50"
              >
                Нэмэх
              </button>
            </div>
            <ul className="space-y-1.5">
              {smsRecipients.map((r) => (
                <li
                  key={r}
                  className="flex items-center justify-between rounded-xl bg-app-bg px-3 py-2 text-xs"
                >
                  <span className="text-app-text tabular-nums">{r}</span>
                  <button
                    type="button"
                    onClick={() => setSmsRecipients((prev) => prev.filter((x) => x !== r))}
                    className="text-app-negative text-[11px] font-medium"
                  >
                    Устгах
                  </button>
                </li>
              ))}
              {smsRecipients.length === 0 && (
                <li className="text-xs text-app-muted">Дугаар нэмээгүй байна.</li>
              )}
            </ul>
          </div>

          <div className="space-y-1.5 pt-2 border-t border-app-border">
            <label className="text-sm font-medium text-app-text">Туршилтын мессеж</label>
            <div className="flex gap-2">
              <input
                inputMode="numeric"
                disabled={!smsEnabled}
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="99112233"
                className="flex-1 rounded-xl border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text outline-none focus:border-brand"
              />
              <button
                type="button"
                onClick={sendTest}
                disabled={!smsEnabled || !testTo.trim() || testState.kind === "sending"}
                className="rounded-xl border border-app-border px-4 py-2 text-sm font-medium text-brand disabled:opacity-50"
              >
                {testState.kind === "sending" ? "Илгээж байна..." : "Илгээх"}
              </button>
            </div>
            {testState.kind === "ok" && (
              <p className="text-xs text-app-positive">
                Илгээгдлээ{testState.id ? ` (${testState.id})` : ""}
              </p>
            )}
            {testState.kind === "err" && (
              <p className="text-xs text-app-negative break-words">{testState.message}</p>
            )}
            <p className="text-[11px] text-app-muted">
              Туршихын өмнө тохиргоогоо хадгалсан байх шаардлагатай.
            </p>
          </div>
        </div>
      </section>

      <div className="space-y-2">
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={reset}
            disabled={status === "saving"}
            className="rounded-xl border border-app-border bg-app-card text-app-text text-sm font-semibold py-3 disabled:opacity-50"
          >
            Болих
          </button>
          <button
            onClick={save}
            disabled={status === "saving"}
            className="rounded-xl bg-brand text-black text-sm font-semibold py-3 disabled:opacity-50"
          >
            {status === "saving" ? "Хадгалж байна..." : "Хадгалах"}
          </button>
        </div>
        {status === "saved" && (
          <p className="text-xs text-app-positive text-center">Хадгалагдлаа</p>
        )}
        {status === "error" && (
          <p className="text-xs text-app-negative text-center">Алдаа гарлаа</p>
        )}
      </div>
    </div>
  );
}
