import https from "node:https";
import tls from "node:tls";

/**
 * Some sites serve only their leaf certificate and leave out the intermediate
 * that links it to a public root — marketinfo.mn is one. Browsers paper over
 * it by fetching the missing certificate themselves (AIA chasing), so the site
 * looks healthy in one, while Node, curl and Vercel all reject the handshake
 * with UNABLE_TO_VERIFY_LEAF_SIGNATURE.
 *
 * Node cannot chase AIA: once verification fails the peer certificate is gone
 * (neither `socket.getPeerCertificate()` nor `err.cert` survives), so there is
 * no way to learn which intermediate is missing without turning verification
 * off — which would defeat the point. The operator supplies the intermediate
 * instead, and it is added to the trust list for that request. Verification
 * stays fully on: the chain must still reach a real public root.
 */

const PEM_BLOCK = /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g;

/** Split a pasted PEM bundle into individual certificates. */
export function parsePemBundle(pem: string): string[] {
  return pem.match(PEM_BLOCK) ?? [];
}

export interface PageResponse {
  status: number;
  /** Address after redirects, for login-wall detection. */
  finalUrl: string;
  body: string;
  contentType?: string;
}

const MAX_REDIRECTS = 5;

function requestOnce(
  url: string,
  ca: string[],
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<{ status: number; location?: string; body: string; contentType?: string }> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = https.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || 443,
        path: `${target.pathname}${target.search}`,
        method: "GET",
        headers: { ...headers, host: target.host },
        servername: target.hostname,
        // The whole point of the exercise: the extra certificate widens the
        // trust list, it never switches verification off.
        rejectUnauthorized: true,
        ca,
        timeout: timeoutMs,
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            location: res.headers.location,
            body,
            contentType: res.headers["content-type"],
          }),
        );
      },
    );
    req.on("timeout", () => req.destroy(Object.assign(new Error("timeout"), { name: "TimeoutError" })));
    req.on("error", reject);
    req.end();
  });
}

/**
 * HTTPS GET trusting the public roots plus `extraCerts`, following redirects.
 * Use only where a plain fetch already failed on an incomplete chain — it
 * exists to repair that one defect, not as a general-purpose client.
 */
export async function fetchWithExtraCa(
  url: string,
  options: {
    extraCerts: string[];
    headers?: Record<string, string>;
    timeoutMs?: number;
  },
): Promise<PageResponse> {
  const ca = [...tls.rootCertificates, ...options.extraCerts];
  const headers = options.headers ?? {};
  const timeoutMs = options.timeoutMs ?? 15_000;

  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await requestOnce(current, ca, headers, timeoutMs);
    const redirecting = res.status >= 300 && res.status < 400 && res.location;
    if (!redirecting) {
      return {
        status: res.status,
        finalUrl: current,
        body: res.body,
        contentType: res.contentType,
      };
    }
    current = new URL(res.location!, current).toString();
  }
  throw new Error(`Дэндүү олон дахин чиглүүлэлт: ${url}`);
}
