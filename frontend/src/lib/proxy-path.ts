/**
 * AUTH-03: the only API paths the Next.js proxy forwards. Anything else is refused before any request
 * leaves this server, so the proxy can never be used to reach other backend routes or hosts.
 */
const NAME = "[A-Za-z0-9_-]{3,25}";
const ALLOWED: readonly { method: "GET" | "POST"; pattern: RegExp }[] = [
  { method: "GET", pattern: new RegExp(`^library/${NAME}$`) },
  { method: "GET", pattern: new RegExp(`^library/${NAME}/games$`) },
  { method: "GET", pattern: new RegExp(`^library/${NAME}/report$`) },
  { method: "POST", pattern: new RegExp(`^library/${NAME}/analyze$`) },
  { method: "GET", pattern: /^jobs\/[0-9a-f-]{36}$/ },
  { method: "GET", pattern: /^games\/\d{1,12}$/ },
  { method: "POST", pattern: /^games\/\d{1,12}\/analyze$/ },
  { method: "GET", pattern: /^me\/players$/ },
  { method: "POST", pattern: new RegExp(`^me/players/${NAME}/(?:save|remove)$`) },
  { method: "GET", pattern: /^me\/progress$/ },
  { method: "POST", pattern: /^me\/progress\/reset$/ },
  { method: "POST", pattern: /^me\/activity\/puzzle\/\d{1,12}-\d{1,3}\/(?:solved|missed)$/ },
  { method: "POST", pattern: /^me\/activity\/lesson\/[a-z0-9-]{1,64}\/done$/ },
  { method: "POST", pattern: /^me\/activity\/review\/\d{1,12}\/(?:clean|blunders)$/ },
];
/** Each query key the API accepts, with the only values it may carry. */
const QUERY_RULES: Readonly<Record<string, RegExp>> = {
  page: /^\d{1,4}$/,
  page_size: /^\d{1,3}$/,
  include_bullet: /^(?:true|false)$/,
  player: new RegExp(`^${NAME}$`),
  phase: /^(?:opening|middlegame|endgame)$/,
  tz: /^-?\d{1,3}$/,
};
const SYNC = new RegExp(`^library/${NAME}$`);

/** AUTH-05: calls that can start downloads or Stockfish (every POST, and a player sync) need bot clearance. */
export function startsWork(method: string, target: string): boolean {
  const path = target.split("?")[0] ?? "";
  return method === "POST" || SYNC.test(path);
}

export function proxyTarget(method: string, segments: readonly string[], search: URLSearchParams): string | null {
  const path = segments.join("/");
  if (!ALLOWED.some((rule) => rule.method === method && rule.pattern.test(path))) {
    return null;
  }
  const query = new URLSearchParams();
  for (const [key, value] of search) {
    const rule = QUERY_RULES[key];
    if (!rule?.test(value)) {
      return null;
    }
    query.append(key, value);
  }
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}
