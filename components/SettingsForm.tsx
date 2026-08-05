"use client";

import { useState } from "react";
import { useToast } from "./Toast";
import {
  CloseIcon,
  PlusIcon,
  RefreshIcon,
  SaveIcon,
  SearchIcon,
  SendIcon,
  TrashIcon,
} from "./icons";

interface MaskedSettings {
  newsSources: string[];
  apifyToken: string | null;
  facebookToken: string | null;
  facebookCookie: string | null;
  extraCaCount: number;
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
  notifications: {
    pushEnabled: boolean;
    signals: string[];
  };
}

interface SourceCheckResult {
  url: string;
  status:
    | "ok"
    | "login_required"
    | "empty"
    | "http_error"
    | "tls_error"
    | "timeout"
    | "error";
  chars: number;
  reason: string | null;
  headlines: number;
  via: "feed" | "html" | "payload" | "api" | null;
  /** How many of this source's headlines name the symbol being checked. */
  matched: number | null;
  matchedTitles: string[];
}

const SOURCE_STATUS_LABELS: Record<SourceCheckResult["status"], string> = {
  ok: "Ажиллаж байна",
  login_required: "Нэвтрэлт шаардана",
  empty: "Текст олдсонгүй",
  http_error: "Сайт татгалзлаа",
  tls_error: "SSL сертификат",
  timeout: "Хугацаа хэтэрлээ",
  error: "Алдаа",
};

/** Glyphs match SignalBadge, so a setting looks like the badge it governs. */
const SIGNAL_LABELS: { value: string; label: string; icon: React.ReactNode }[] = [
  { value: "BUY", label: "АВАХ", icon: <path d="M6 2 10.5 9.5h-9z" /> },
  { value: "SELL", label: "ЗАРАХ", icon: <path d="M6 10 1.5 2.5h9z" /> },
  { value: "HOLD", label: "ХҮЛЭЭХ", icon: <rect x="1.5" y="5" width="9" height="2" rx="1" /> },
];

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
  const toast = useToast();
  const [newsSources, setNewsSources] = useState<string[]>(initial.newsSources);
  const [newSourceInput, setNewSourceInput] = useState("");
  const [fbTokenInput, setFbTokenInput] = useState("");
  const [fbCurrent, setFbCurrent] = useState(initial.facebookToken);
  const [apifyInput, setApifyInput] = useState("");
  const [apifyCurrent, setApifyCurrent] = useState(initial.apifyToken);
  const [fbCookieInput, setFbCookieInput] = useState("");
  const [fbCookieCurrent, setFbCookieCurrent] = useState(initial.facebookCookie);
  const [caInput, setCaInput] = useState("");
  const [caCount, setCaCount] = useState(initial.extraCaCount);
  const [sourceCheck, setSourceCheck] = useState<
    | { kind: "idle" }
    | { kind: "checking" }
    | {
        kind: "done";
        results: SourceCheckResult[];
        company: { symbol: string; name: string } | null;
        symbolNotFound: boolean;
      }
    | { kind: "err"; message: string }
  >({ kind: "idle" });
  const [checkSymbol, setCheckSymbol] = useState("");
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

  const [pushEnabled, setPushEnabled] = useState(initial.notifications.pushEnabled);
  const [notifySignals, setNotifySignals] = useState<string[]>(
    initial.notifications.signals,
  );
  const [notifCurrent, setNotifCurrent] = useState(initial.notifications);

  function toggleSignal(value: string) {
    setNotifySignals((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value],
    );
  }
  const [testTo, setTestTo] = useState("");
  const [testState, setTestState] = useState<
    { kind: "idle" } | { kind: "sending" } | { kind: "ok"; id?: string } | { kind: "err"; message: string }
  >({ kind: "idle" });

  /** Discards unsaved edits and returns every field to its last saved value. */
  function reset() {
    setNewsSources(initial.newsSources);
    setNewSourceInput("");
    setFbTokenInput("");
    setApifyInput("");
    setFbCookieInput("");
    setCaInput("");
    setSourceCheck({ kind: "idle" });
    setKeyInputs({});
    setSmsEnabled(smsCurrent.enabled);
    setSmsFrom(smsCurrent.from ?? "");
    setSmsBrand(smsCurrent.brand ?? "");
    setSmsRecipients(smsCurrent.recipients);
    setSmsKeyInput("");
    setSmsRecipientInput("");
    setPushEnabled(notifCurrent.pushEnabled);
    setNotifySignals(notifCurrent.signals);
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
        const message = data.error || `Алдаа ${res.status}`;
        setTestState({ kind: "err", message });
        toast({ variant: "error", title: "SMS илгээгдсэнгүй", body: message });
        return;
      }
      setTestState({ kind: "ok", id: data.messageId });
      toast({ variant: "success", title: "Тест SMS илгээлээ", body: testTo });
    } catch (err) {
      setTestState({ kind: "err", message: (err as Error).message });
      toast({ variant: "error", title: "Сүлжээний алдаа гарлаа" });
    }
  }

  function addSource() {
    const v = newSourceInput.trim();
    if (!v) return;
    if (!/^https?:\/\//i.test(v)) {
      toast({
        variant: "error",
        title: "Линк буруу байна",
        body: "http:// эсвэл https://-ээр эхэлсэн байх ёстой.",
      });
      return;
    }
    setNewsSources((prev) => [...prev, v]);
    setNewSourceInput("");
  }

  function removeSource(idx: number) {
    setNewsSources((prev) => prev.filter((_, i) => i !== idx));
    setSourceCheck({ kind: "idle" });
  }

  async function checkSources() {
    setSourceCheck({ kind: "checking" });
    try {
      const res = await fetch("/api/settings/news-sources/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newsSources, symbol: checkSymbol.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSourceCheck({ kind: "err", message: data.error || `Алдаа ${res.status}` });
        return;
      }
      const results: SourceCheckResult[] = data.results ?? [];
      const working = results.filter((r) => r.status === "ok").length;
      setSourceCheck({
        kind: "done",
        results,
        company: data.company ?? null,
        symbolNotFound: !!data.symbolNotFound,
      });
      toast({
        variant: working === results.length ? "success" : "info",
        title: `${working}/${results.length} эх сурвалж ажиллаж байна`,
        body:
          working === results.length
            ? undefined
            : "Ажиллахгүй байгаагийн шалтгааныг жагсаалтаас харна уу.",
      });
    } catch (err) {
      setSourceCheck({ kind: "err", message: (err as Error).message });
    }
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
        pushEnabled,
        notifySignals,
      };
      for (const f of PROVIDER_FIELDS) {
        if (keyInputs[f.key]?.trim()) body[f.bodyKey] = keyInputs[f.key].trim();
      }
      if (smsKeyInput.trim()) body.smsApiKey = smsKeyInput.trim();
      if (fbTokenInput.trim()) body.facebookToken = fbTokenInput.trim();
      if (fbCookieInput.trim()) body.facebookCookie = fbCookieInput.trim();
      if (apifyInput.trim()) body.apifyToken = apifyInput.trim();
      if (caInput.trim()) body.extraCaCerts = caInput.trim();

      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setCurrent(data.apiKeys);
      setSmsCurrent(data.sms);
      setNotifCurrent(data.notifications);
      setFbCurrent(data.facebookToken);
      setApifyCurrent(data.apifyToken);
      setApifyInput("");
      setFbCookieCurrent(data.facebookCookie);
      setFbCookieInput("");
      setCaCount(data.extraCaCount);
      setKeyInputs({});
      setSmsKeyInput("");
      setFbTokenInput("");
      setCaInput("");
      setStatus("saved");
      toast({ variant: "success", title: "Тохиргоо хадгалагдлаа" });
      setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      toast({ variant: "error", title: "Хадгалахад алдаа гарлаа" });
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
            placeholder="https://lemonpress.mn"
            className="flex-1 rounded-xl border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text outline-none focus:border-brand"
          />
          <button
            onClick={addSource}
            className="flex items-center gap-1.5 rounded-xl border border-app-border px-4 py-2 text-sm font-medium text-brand"
          >
            <PlusIcon size={15} /> Нэмэх
          </button>
        </div>
        <ul className="space-y-1.5">
          {newsSources.map((s, i) => {
            const result =
              sourceCheck.kind === "done"
                ? sourceCheck.results.find((r) => r.url === s)
                : undefined;
            return (
              <li key={i} className="rounded-xl bg-app-bg px-3 py-2 text-xs">
                <div className="flex items-center justify-between">
                  {/* The address is the useful thing about a source row, so
                      it opens the site rather than sitting there as text. */}
                  <a
                    href={s}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 truncate text-brand underline underline-offset-2 active:opacity-70"
                  >
                    {s}
                  </a>
                  <button
                    onClick={() => removeSource(i)}
                    className="flex items-center gap-1 text-app-negative text-[11px] ml-3 font-medium shrink-0"
                  >
                    <TrashIcon size={13} /> Устгах
                  </button>
                </div>
                {result && (
                  <div className="mt-1.5 flex items-start gap-2">
                    <span
                      className={`shrink-0 text-[10px] rounded-full px-2 py-0.5 font-medium ${
                        result.status === "ok"
                          ? "bg-app-positive-bg text-app-positive"
                          : "bg-app-negative-bg text-app-negative"
                      }`}
                    >
                      {SOURCE_STATUS_LABELS[result.status]}
                    </span>
                    <span className="text-[11px] text-app-muted">
                      {result.status === "ok"
                        ? `${result.chars.toLocaleString("mn-MN")} тэмдэгт · ${result.headlines} гарчиг${result.via === "feed" ? " · RSS feed" : result.via === "payload" ? " · JS payload" : result.via === "api" ? " · JSON API" : ""}${result.matched !== null ? ` · ${result.matched} тохирсон` : ""}${result.reason ? ` · ${result.reason}` : ""}`
                        : result.reason}
                    </span>
                  </div>
                )}
                {result?.matchedTitles.length ? (
                  <ul className="mt-1 space-y-0.5">
                    {result.matchedTitles.map((title, n) => (
                      <li key={n} className="text-[11px] text-app-text/80 truncate">
                        · {title}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
          {newsSources.length === 0 && (
            <li className="text-xs text-app-muted">Одоогоор линк нэмээгүй байна.</li>
          )}
        </ul>

        {newsSources.length > 0 && (
          <div className="mt-3 flex gap-2">
            {/* A source can be working and still put nothing on a company's
                page. Naming a symbol counts the two apart. */}
            <input
              value={checkSymbol}
              onChange={(e) => setCheckSymbol(e.target.value.toUpperCase())}
              placeholder="Симбол (сонголт)"
              className="w-32 shrink-0 rounded-xl border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text outline-none focus:border-brand placeholder:text-app-muted"
            />
            <button
              type="button"
              onClick={checkSources}
              disabled={sourceCheck.kind === "checking"}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-app-border py-2 text-sm font-medium text-brand disabled:opacity-50"
            >
              <RefreshIcon size={15} />
              {sourceCheck.kind === "checking"
                ? "Шалгаж байна..."
                : "Эх сурвалжуудыг шалгах"}
            </button>
          </div>
        )}
        {sourceCheck.kind === "done" && sourceCheck.symbolNotFound && (
          <p className="text-xs text-app-negative mt-2">
            Ийм симбол бүртгэлгүй байна.
          </p>
        )}
        {sourceCheck.kind === "done" && sourceCheck.company && (
          <p className="text-[11px] text-app-muted mt-2">
            {sourceCheck.company.symbol} ({sourceCheck.company.name}) — эх сурвалж
            бүрийн хажууд хэдэн гарчиг тохирсныг доор харуулав.
          </p>
        )}
        {sourceCheck.kind === "err" && (
          <p className="text-xs text-app-negative mt-2 break-words">
            {sourceCheck.message}
          </p>
        )}

        <div className="mt-4 pt-4 border-t border-app-border space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-app-text">
              Apify түлхүүр (Facebook — хамгийн хялбар)
            </label>
            <span
              className={`text-[10px] rounded-full px-2 py-0.5 font-medium ${
                apifyCurrent
                  ? "bg-app-positive-bg text-app-positive"
                  : "bg-app-bg text-app-muted"
              }`}
            >
              {apifyCurrent ? "Идэвхтэй" : "Тохируулаагүй"}
            </span>
          </div>
          <p className="text-[11px] text-app-muted">
            Хадгалсан Facebook хуудаснуудаас мэдээ татах хамгийн хялбар арга.
            <b> apify.com</b> дээр үнэгүй бүртгүүлээд (карт шаардахгүй, сар бүр
            үнэгүй эрх өгдөг) → Settings → API &amp; Integrations хэсгээс
            токеноо хуулж тавина. Cookie эсвэл өөрийн бүртгэл шаардлагагүй.
            Цэвэрлэхийн тулд <code>-</code> бичнэ.
          </p>
          <input
            type="password"
            placeholder={apifyCurrent ? `Одоогийн: ${apifyCurrent}` : "apify_api_..."}
            value={apifyInput}
            onChange={(e) => setApifyInput(e.target.value)}
            className="w-full rounded-xl border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text outline-none focus:border-brand"
          />
        </div>

        <div className="mt-4 pt-4 border-t border-app-border space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-app-text">
              Facebook cookie
            </label>
            <span
              className={`text-[10px] rounded-full px-2 py-0.5 font-medium ${
                fbCookieCurrent
                  ? "bg-app-positive-bg text-app-positive"
                  : "bg-app-bg text-app-muted"
              }`}
            >
              {fbCookieCurrent ? "Идэвхтэй" : "Тохируулаагүй"}
            </span>
          </div>
          <p className="text-[11px] text-app-muted">
            Хадгалсан Facebook хуудаснуудаас мэдээ татахад хэрэглэнэ. Компьютерийн
            хөтөч дээр facebook.com-д нэвтэрч → DevTools (F12) → Application →
            Cookies → facebook.com хэсгээс <b>c_user</b> болон <b>xs</b> хоёрын
            утгыг <code>c_user=...; xs=...</code> хэлбэрээр хуулж тавина.
            Цэвэрлэхийн тулд <code>-</code> бичнэ.
          </p>
          <p className="text-[11px] text-app-negative">
            Анхаар: энэ cookie нь тухайн Facebook бүртгэлд бүрэн хандах эрх өгдөг
            тул үндсэн бус (туслах) бүртгэл ашиглахыг зөвлөе. Гарах товч дарвал
            cookie хүчингүй болно.
          </p>
          <input
            type="password"
            placeholder={fbCookieCurrent ? `Одоогийн: ${fbCookieCurrent}` : "c_user=...; xs=..."}
            value={fbCookieInput}
            onChange={(e) => setFbCookieInput(e.target.value)}
            className="w-full rounded-xl border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text outline-none focus:border-brand"
          />
        </div>

        <div className="mt-4 pt-4 border-t border-app-border space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-app-text">
              Facebook хандалтын токен
            </label>
            <span
              className={`text-[10px] rounded-full px-2 py-0.5 font-medium ${
                fbCurrent ? "bg-app-positive-bg text-app-positive" : "bg-app-bg text-app-muted"
              }`}
            >
              {fbCurrent ? "Идэвхтэй" : "Тохируулаагүй"}
            </span>
          </div>
          <p className="text-[11px] text-app-muted">
            Өөрийн эзэмшдэг хуудсанд зориулсан нэмэлт арга. Cookie байхгүй үед,
            эсвэл cookie хүчингүй болсон үед энэ токеноор уншина. Хоёулаа
            байхгүй бол facebook.com эх сурвалж алгасагдана.
          </p>
          <input
            type="password"
            placeholder={fbCurrent ? `Одоогийн: ${fbCurrent}` : "Page access token"}
            value={fbTokenInput}
            onChange={(e) => setFbTokenInput(e.target.value)}
            className="w-full rounded-xl border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text outline-none focus:border-brand"
          />
        </div>

        <div className="mt-4 pt-4 border-t border-app-border space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-app-text">
              Нэмэлт SSL сертификат
            </label>
            <span
              className={`text-[10px] rounded-full px-2 py-0.5 font-medium ${
                caCount > 0
                  ? "bg-app-positive-bg text-app-positive"
                  : "bg-app-bg text-app-muted"
              }`}
            >
              {caCount > 0 ? `${caCount} гэрчилгээ` : "Тохируулаагүй"}
            </span>
          </div>
          <p className="text-[11px] text-app-muted">
            Зарим сайт SSL гинжнийхээ завсрын гэрчилгээг илгээдэггүй. Апп
            үүнийг хөтчийн адил <b>автоматаар нөхдөг</b> тул ихэнх тохиолдолд
            энд юу ч оруулах шаардлагагүй. Зөвхөн сертификат дээрээ гаргагчийн
            хаягаа заагаагүй ховор тохиолдолд л гараар нэмнэ.
          </p>
          <p className="text-[11px] text-app-muted">
            Шаардлагатай бол:{" "}
            <code className="break-all">
              openssl s_client -showcerts -connect ХОСТ:443
            </code>{" "}
            командын хоёр дахь <code>BEGIN CERTIFICATE</code> блокийг хуулна.
            Устгахын тулд <code>-</code> бичээд хадгална.
          </p>
          <textarea
            rows={4}
            spellCheck={false}
            placeholder={"-----BEGIN CERTIFICATE-----\n..."}
            value={caInput}
            onChange={(e) => setCaInput(e.target.value)}
            className="w-full rounded-xl border border-app-border bg-app-bg px-3 py-2 text-[11px] font-mono text-app-text outline-none focus:border-brand"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-app-border bg-app-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-app-text">Push мэдэгдэл</h2>
            <p className="text-xs text-app-muted mt-0.5">
              Дохио өөрчлөгдөхөд суулгасан төхөөрөмж рүү мэдэгдэл илгээнэ.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={pushEnabled}
            aria-label="Push мэдэгдэл"
            onClick={() => setPushEnabled((v) => !v)}
            className={`shrink-0 w-12 h-7 rounded-full p-0.5 transition-colors ${
              pushEnabled ? "bg-brand" : "bg-app-elevated"
            }`}
          >
            <span
              className={`block w-6 h-6 rounded-full bg-white transition-transform ${
                pushEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        <div className="mt-4 pt-4 border-t border-app-border">
          <div className="text-sm font-medium text-app-text">Ямар дохионд мэдэгдэх</div>
          <p className="text-xs text-app-muted mt-0.5 mb-2.5">
            Push болон SMS хоёуланд нь үйлчилнэ.
          </p>
          <div className="flex gap-2">
            {SIGNAL_LABELS.map((s) => {
              const on = notifySignals.includes(s.value);
              return (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleSignal(s.value)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-colors ${
                    on
                      ? "bg-brand text-black"
                      : "bg-app-bg text-app-muted border border-app-border"
                  }`}
                >
                  <svg viewBox="0 0 12 12" width="9" height="9" fill="currentColor" aria-hidden>
                    {s.icon}
                  </svg>
                  {s.label}
                </button>
              );
            })}
          </div>
          {notifySignals.length === 0 && (
            <p className="text-[11px] text-app-negative mt-2">
              Нэг ч сонгоогүй тул ямар ч мэдэгдэл илгээгдэхгүй.
            </p>
          )}
        </div>
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
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-app-border py-2 text-sm font-medium text-brand disabled:opacity-50"
            >
              <SearchIcon size={15} />
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
              <label className="text-sm font-medium text-app-text">Брэнд ID</label>
              <input
                inputMode="numeric"
                disabled={!smsEnabled}
                placeholder="Заавал биш, зөвхөн тоо"
                value={smsBrand}
                onChange={(e) => setSmsBrand(e.target.value)}
                className="w-full rounded-xl border border-app-border bg-app-bg px-3 py-2 text-sm text-app-text outline-none focus:border-brand"
              />
              {smsBrand.trim() && !/^\d+$/.test(smsBrand.trim()) && (
                <p className="text-[11px] text-app-negative">
                  Зөвхөн тоо байх ёстой. Өөр утга оруулбал алгасагдана.
                </p>
              )}
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
                className="flex items-center gap-1.5 rounded-xl border border-app-border px-4 py-2 text-sm font-medium text-brand disabled:opacity-50"
              >
                <PlusIcon size={15} /> Нэмэх
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
                    className="flex items-center gap-1 text-app-negative text-[11px] font-medium"
                  >
                    <TrashIcon size={13} /> Устгах
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
                className="flex items-center gap-1.5 rounded-xl border border-app-border px-4 py-2 text-sm font-medium text-brand disabled:opacity-50"
              >
                <SendIcon size={15} />
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
            className="flex items-center justify-center gap-1.5 rounded-xl border border-app-border bg-app-card text-app-text text-sm font-semibold py-3 disabled:opacity-50"
          >
            <CloseIcon size={15} /> Болих
          </button>
          <button
            onClick={save}
            disabled={status === "saving"}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-brand text-black text-sm font-semibold py-3 disabled:opacity-50"
          >
            <SaveIcon size={15} />
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
