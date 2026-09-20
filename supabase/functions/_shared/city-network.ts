// Website import uses a pinned public IPv4 connection, then TLS with the original
// hostname. DNS rebinding cannot redirect the request onto an internal address.
export function publicIPv4(ip: string) {
  const parts = ip.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  )
    return false;
  const [a, b, c] = parts;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113)
  );
}
export function importURL(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !url.hostname.includes(".") ||
    url.hostname.endsWith(".local") ||
    url.hostname.endsWith(".internal")
  )
    throw new Error("A public HTTPS website is required.");
  if (/^[\d.]+$/.test(url.hostname) || url.hostname.includes(":"))
    throw new Error("Use a domain name, not an IP address.");
  return url;
}
function unchunk(data: Uint8Array) {
  const chunks: Uint8Array[] = [];
  let offset = 0;
  let total = 0;
  const decoder = new TextDecoder();
  while (offset < data.length) {
    let end = offset;
    while (end + 1 < data.length && !(data[end] === 13 && data[end + 1] === 10))
      end++;
    const size = Number.parseInt(
      decoder.decode(data.slice(offset, end)).split(";")[0],
      16,
    );
    if (!Number.isFinite(size) || size < 0)
      throw new Error("Invalid website response.");
    if (!size) break;
    offset = end + 2;
    if (offset + size + 2 > data.length)
      throw new Error("Incomplete website response.");
    chunks.push(data.slice(offset, offset + size));
    total += size;
    offset += size + 2;
  }
  const result = new Uint8Array(total);
  let pos = 0;
  for (const chunk of chunks) {
    result.set(chunk, pos);
    pos += chunk.length;
  }
  return result;
}
export async function fetchPublicWebsite(
  value: string,
  limit = 1_500_000,
  redirects = 0,
): Promise<{ bytes: Uint8Array; type: string; url: string }> {
  if (redirects > 3) throw new Error("Too many website redirects.");
  const url = importURL(value);
  const addresses = await Deno.resolveDns(url.hostname, "A");
  if (!addresses.length || addresses.some((ip) => !publicIPv4(ip)))
    throw new Error("Website resolves to a restricted network.");
  let connection: Deno.Conn | undefined;
  const task = async () => {
    const tcp = await Deno.connect({ hostname: addresses[0], port: 443 });
    connection = tcp;
    const tls = await Deno.startTls(tcp, {
      hostname: url.hostname,
      alpnProtocols: ["http/1.1"],
    });
    connection = tls;
    const request = new TextEncoder().encode(
      `GET ${url.pathname}${url.search} HTTP/1.1\r\nHost: ${url.hostname}\r\nUser-Agent: SynarcCity/1.0\r\nAccept: text/html,text/plain,image/*\r\nAccept-Encoding: identity\r\nConnection: close\r\n\r\n`,
    );
    let written = 0;
    while (written < request.length)
      written += await tls.write(request.subarray(written));
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const buffer = new Uint8Array(16384);
      const n = await tls.read(buffer);
      if (n === null) break;
      size += n;
      if (size > limit + 32768)
        throw new Error("Website response is too large.");
      chunks.push(buffer.slice(0, n));
    }
    const raw = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      raw.set(chunk, offset);
      offset += chunk.length;
    }
    let headerEnd = -1;
    for (let i = 0; i < Math.min(raw.length - 3, 32768); i++)
      if (
        raw[i] === 13 &&
        raw[i + 1] === 10 &&
        raw[i + 2] === 13 &&
        raw[i + 3] === 10
      ) {
        headerEnd = i;
        break;
      }
    if (headerEnd < 0) throw new Error("Invalid website headers.");
    const lines = new TextDecoder()
      .decode(raw.slice(0, headerEnd))
      .split("\r\n");
    const status = Number(lines.shift()?.split(" ")[1]);
    const headers = new Headers();
    for (const line of lines) {
      const colon = line.indexOf(":");
      if (colon > 0)
        headers.append(line.slice(0, colon), line.slice(colon + 1).trim());
    }
    if (status >= 300 && status < 400 && headers.get("location"))
      return { redirect: new URL(headers.get("location")!, url).toString() };
    if (status !== 200) throw new Error(`Website returned HTTP ${status}.`);
    if (
      headers.get("content-encoding") &&
      headers.get("content-encoding") !== "identity"
    )
      throw new Error(
        "Compressed imports are not supported; enter details manually.",
      );
    const bytes = headers.get("transfer-encoding")?.includes("chunked")
      ? unchunk(raw.slice(headerEnd + 4))
      : raw.slice(headerEnd + 4);
    if (bytes.length > limit) throw new Error("Website response is too large.");
    return {
      bytes,
      type: headers.get("content-type") || "",
      url: url.toString(),
    };
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      task(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          connection?.close();
          reject(new Error("Website import timed out."));
        }, 10000);
      }),
    ]);
    if ("redirect" in result)
      return await fetchPublicWebsite(result.redirect!, limit, redirects + 1);
    return result;
  } finally {
    clearTimeout(timer);
    try {
      connection?.close();
    } catch {
      /* already closed */
    }
  }
}
