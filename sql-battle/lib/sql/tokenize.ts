/**
 * A small, forgiving SQL tokenizer shared by the Oracle transpiler, the dialect
 * linter and the concept detector. It never throws: anything it does not
 * recognise becomes a one-character operator token, so the database gets the
 * final say on what is valid.
 *
 * Whitespace is folded into the following token's `pre` field so that token
 * arrays can be spliced freely and re-rendered with roughly the original layout.
 */

export type TokType = "word" | "qident" | "string" | "number" | "op" | "punct";

export interface Tok {
  t: TokType;
  /** Source text. */
  v: string;
  /** Upper-cased text for words, otherwise the same as `v`. */
  u: string;
  /** Whitespace that preceded the token: "", " " or "\n". */
  pre: string;
}

const MULTI_OPS = ["->>", "#>>", "||", "::", "<=", ">=", "<>", "!=", "->", "#>", "=>", "@>", "<@", "~*", "!~"];

export function tokenize(sql: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  let pre = "";
  const n = sql.length;
  const push = (t: TokType, v: string) => {
    out.push({ t, v, u: t === "word" ? v.toUpperCase() : v, pre });
    pre = "";
  };

  while (i < n) {
    const c = sql[i];

    // whitespace
    if (/\s/.test(c)) {
      let j = i;
      while (j < n && /\s/.test(sql[j])) j++;
      const ws = sql.slice(i, j);
      pre = pre.includes("\n") || ws.includes("\n") ? "\n" : " ";
      i = j;
      continue;
    }

    // comments are dropped (they carry no semantics we need)
    if (c === "-" && sql[i + 1] === "-") {
      while (i < n && sql[i] !== "\n") i++;
      pre = pre || " ";
      continue;
    }
    if (c === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      pre = pre || " ";
      continue;
    }

    // string literal with '' escapes
    if (c === "'") {
      let j = i + 1;
      while (j < n) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            j += 2;
            continue;
          }
          break;
        }
        j++;
      }
      push("string", sql.slice(i, Math.min(j + 1, n)));
      i = j + 1;
      continue;
    }

    // PostgreSQL dollar quoting: $$...$$ or $tag$...$tag$
    if (c === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        const stop = end === -1 ? n : end + tag.length;
        push("string", sql.slice(i, stop));
        i = stop;
        continue;
      }
      // positional parameter $1
      const p = /^\$\d+/.exec(sql.slice(i));
      if (p) {
        push("word", p[0]);
        i += p[0].length;
        continue;
      }
    }

    // quoted identifier
    if (c === '"') {
      const end = sql.indexOf('"', i + 1);
      const stop = end === -1 ? n : end + 1;
      push("qident", sql.slice(i, stop));
      i = stop;
      continue;
    }

    // number
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(sql[i + 1] ?? ""))) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(sql.slice(i))!;
      push("number", m[0]);
      i += m[0].length;
      continue;
    }

    // word (identifiers and keywords). Oracle allows $ and # inside names.
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_$#]*/.exec(sql.slice(i))!;
      push("word", m[0]);
      i += m[0].length;
      continue;
    }

    if ("(),;.[]".includes(c)) {
      push("punct", c);
      i++;
      continue;
    }

    const op = MULTI_OPS.find((o) => sql.startsWith(o, i));
    if (op) {
      push("op", op);
      i += op.length;
      continue;
    }
    push("op", c);
    i++;
  }
  return out;
}

const NO_SPACE_BEFORE = new Set([",", ")", ".", ";", "]", "::"]);
const NO_SPACE_AFTER = new Set(["(", ".", "[", "::"]);

/** Render tokens back to SQL. */
export function render(toks: Tok[]): string {
  let s = "";
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (i > 0) {
      const prev = toks[i - 1];
      if (t.pre === "\n") s += "\n";
      else if (t.pre && !NO_SPACE_BEFORE.has(t.v) && !NO_SPACE_AFTER.has(prev.v)) s += " ";
    }
    s += t.v;
  }
  return s;
}

/** Build fresh tokens from a SQL fragment (used by rewrites). */
export function toks(sql: string, pre = " "): Tok[] {
  const r = tokenize(sql);
  if (r.length) r[0] = { ...r[0], pre };
  return r;
}

export function isWord(t: Tok | undefined, ...words: string[]): boolean {
  return !!t && t.t === "word" && words.includes(t.u);
}

export function isPunct(t: Tok | undefined, v: string): boolean {
  return !!t && t.t === "punct" && t.v === v;
}

/** Index of the parenthesis matching the "(" at `open`, or -1. */
export function matchParen(ts: Tok[], open: number): number {
  let depth = 0;
  for (let i = open; i < ts.length; i++) {
    if (isPunct(ts[i], "(")) depth++;
    else if (isPunct(ts[i], ")")) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Index of the "(" matching the ")" at `close`, or -1. */
export function matchParenBack(ts: Tok[], close: number): number {
  let depth = 0;
  for (let i = close; i >= 0; i--) {
    if (isPunct(ts[i], ")")) depth++;
    else if (isPunct(ts[i], "(")) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Split the tokens strictly between `open` and `close` on depth-0 commas. */
export function splitArgs(ts: Tok[], open: number, close: number): Tok[][] {
  const args: Tok[][] = [];
  let cur: Tok[] = [];
  let depth = 0;
  for (let i = open + 1; i < close; i++) {
    const t = ts[i];
    if (isPunct(t, "(")) depth++;
    if (isPunct(t, ")")) depth--;
    if (depth === 0 && isPunct(t, ",")) {
      args.push(cur);
      cur = [];
      continue;
    }
    cur.push(t);
  }
  if (cur.length || args.length) args.push(cur);
  return args;
}

/** Split a token list on a depth-0 separator predicate. */
export function splitTop(ts: Tok[], isSep: (t: Tok, i: number) => boolean): Tok[][] {
  const parts: Tok[][] = [];
  let cur: Tok[] = [];
  let depth = 0;
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    if (isPunct(t, "(")) depth++;
    if (isPunct(t, ")")) depth--;
    if (depth === 0 && isSep(t, i)) {
      parts.push(cur);
      cur = [];
      continue;
    }
    cur.push(t);
  }
  parts.push(cur);
  return parts;
}

/** Split a boolean expression into its top-level AND conjuncts (BETWEEN-aware). */
export function splitAnd(ts: Tok[]): Tok[][] {
  let pendingBetween = 0;
  let depth = 0;
  const sepIdx = new Set<number>();
  ts.forEach((t, i) => {
    if (isPunct(t, "(")) depth++;
    if (isPunct(t, ")")) depth--;
    if (depth !== 0) return;
    if (isWord(t, "BETWEEN")) pendingBetween++;
    else if (isWord(t, "AND")) {
      if (pendingBetween > 0) pendingBetween--;
      else sepIdx.add(i);
    }
  });
  return splitTop(ts, (_t, i) => sepIdx.has(i)).filter((p) => p.length > 0);
}

/** Split a script into statements on top-level semicolons. */
export function splitStatements(sql: string): string[] {
  const ts = tokenize(sql);
  const parts = splitTop(ts, (t) => isPunct(t, ";"));
  return parts.filter((p) => p.length > 0).map((p) => render(trimPre(p)));
}

export function trimPre(ts: Tok[]): Tok[] {
  if (!ts.length) return ts;
  return [{ ...ts[0], pre: "" }, ...ts.slice(1)];
}

/** Depth of every token relative to the start of the list. */
export function depths(ts: Tok[]): number[] {
  const d: number[] = [];
  let depth = 0;
  for (const t of ts) {
    if (isPunct(t, ")")) depth--;
    d.push(depth);
    if (isPunct(t, "(")) depth++;
  }
  return d;
}
