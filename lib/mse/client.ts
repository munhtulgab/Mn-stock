const BASE_URL = "https://open.mse.mn";
const USER_AGENT =
  "Mozilla/5.0 (compatible; MseRateAdvisor/1.0; +https://mse.mn)";

export async function fetchMseHtml(path: string): Promise<string> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "User-Agent": USER_AGENT },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`MSE open-data fetch failed: ${path} -> ${res.status}`);
  }
  return res.text();
}
