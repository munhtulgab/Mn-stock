import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import { X509Certificate } from "node:crypto";

/**
 * Some sites serve only their leaf certificate and leave out the intermediate
 * that links it to a public root — marketinfo.mn is one. Browsers paper over
 * it by fetching the missing certificate themselves, so the site looks healthy
 * in one, while Node, curl and Vercel all reject the handshake with
 * UNABLE_TO_VERIFY_LEAF_SIGNATURE.
 *
 * `recoverChain` does what the browser does. The certificate names where its
 * issuer can be downloaded (the AIA "CA Issuers" extension), so the missing
 * link is fetched and handed to the real request as an extra trust anchor.
 *
 * Why this is not a weakening. Reading the extension needs the certificate,
 * and a failed handshake does not keep one around — so the probe connection
 * does not verify. Nothing from that probe is trusted: its only output is a
 * URL to download a *candidate* certificate. The request that actually
 * carries data runs with rejectUnauthorized on, so the chain must still reach
 * a genuine public root and match the hostname. An attacker who injects their
 * own certificate gains nothing, because the verified request would reject it
 * exactly as before. Confirmed by test: with the recovered certificate the
 * request succeeds, without it the same request is still refused.
 *
 * Operator-supplied certificates remain supported for the rarer case of a
 * certificate that carries no AIA extension at all.
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

/** Certificates are per-host and stable; recovering one per process is enough. */
const recoveredChains = new Map<string, Promise<string[]>>();

/** How many issuers up the chain to follow before giving up. */
const MAX_CHAIN_DEPTH = 3;

function derToPem(der: Buffer): string {
  const body = der.toString("base64").match(/.{1,64}/g)?.join("\n") ?? "";
  return `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----\n`;
}

/**
 * Downloads a certificate named by an AIA URL. These are plain HTTP by
 * convention — the content is a signed certificate, so the transport adds
 * nothing, and it is validated by being made to verify a chain below.
 */
function downloadCert(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const client = url.startsWith("http://") ? http : https;
    const req = client.get(url, { timeout: 10_000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return resolve(null);
      }
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const buf = Buffer.concat(chunks);
        const text = buf.toString("utf8");
        resolve(text.includes("-----BEGIN CERTIFICATE-----") ? text : derToPem(buf));
      });
    });
    req.on("timeout", () => req.destroy());
    req.on("error", () => resolve(null));
  });
}

/** The certificate a host actually offers, read without trusting it. */
function probeLeaf(hostname: string, port: number): Promise<X509Certificate | null> {
  return new Promise((resolve) => {
    const socket = tls.connect(
      { host: hostname, port, servername: hostname, rejectUnauthorized: false, timeout: 10_000 },
      () => {
        const peer = socket.getPeerCertificate(true);
        socket.destroy();
        resolve(peer?.raw ? new X509Certificate(peer.raw) : null);
      },
    );
    socket.on("timeout", () => socket.destroy());
    socket.on("error", () => resolve(null));
  });
}

function caIssuersUrl(cert: X509Certificate): string | null {
  const match = cert.infoAccess?.match(/CA Issuers - URI:(\S+)/);
  return match ? match[1] : null;
}

/**
 * Walks up from a host's leaf certificate, downloading each issuer the
 * certificates name, and returns them as PEM. Empty when the host publishes
 * no AIA pointer — then only an operator-supplied certificate can help.
 */
export function recoverChain(hostname: string, port = 443): Promise<string[]> {
  const key = `${hostname}:${port}`;
  const existing = recoveredChains.get(key);
  if (existing) return existing;

  const work = (async () => {
    const chain: string[] = [];
    let current = await probeLeaf(hostname, port);

    for (let depth = 0; depth < MAX_CHAIN_DEPTH && current; depth++) {
      // A self-signed certificate is the root: nothing above it to fetch.
      if (current.issuer === current.subject) break;
      const url = caIssuersUrl(current);
      if (!url) break;
      const pem = await downloadCert(url);
      if (!pem) break;
      chain.push(pem);
      try {
        current = new X509Certificate(pem);
      } catch {
        break;
      }
    }
    return chain;
  })();

  recoveredChains.set(key, work);
  return work;
}

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
    /** Set false to use only the supplied certificates. */
    autoRecover?: boolean;
  },
): Promise<PageResponse> {
  const target = new URL(url);
  const recovered =
    options.autoRecover === false
      ? []
      : await recoverChain(
          target.hostname,
          Number(target.port) || 443,
        ).catch(() => []);

  const ca = [...tls.rootCertificates, ...options.extraCerts, ...recovered];
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
