/**
 * Oracle → PostgreSQL transpiler.
 *
 * Oracle cannot run in a browser, so "Oracle mode" works by translating Oracle
 * SQL into equivalent PostgreSQL and running that on PGlite. Every rewrite that
 * changes meaning or teaches something adds a note, which the Translation Lens
 * shows next to the output.
 *
 * The rewrites are token-level and deliberately conservative: when a construct
 * cannot be translated faithfully we raise a DialectError that explains the
 * Oracle feature instead of guessing.
 */
import {
  Tok,
  isPunct,
  isWord,
  matchParen,
  matchParenBack,
  render,
  splitAnd,
  splitArgs,
  splitStatements,
  splitTop,
  tokenize,
  toks,
  trimPre,
} from "../sql/tokenize";
import { Clause, Scope, clause, clausesOf, findScopes } from "../sql/scope";
import { DialectError, NeedColumns } from "./errors";

export interface TranspileOptions {
  /** Column names for probe queries requested through NeedColumns. */
  columns?: Record<string, string[]>;
  /** Emulate Oracle's implicit transactions (BEGIN injection, DDL auto-commit). */
  implicitTransactions?: boolean;
}

export interface TranspileResult {
  sql: string;
  statements: string[];
  notes: string[];
}

const DDL_LEADS = ["CREATE", "ALTER", "DROP", "TRUNCATE", "RENAME", "COMMENT"];
const DML_LEADS = ["INSERT", "UPDATE", "DELETE", "MERGE"];

export function transpileOracle(sql: string, opts: TranspileOptions = {}): TranspileResult {
  const notes = new Set<string>();
  const stmts = splitStatements(sql);
  const out: string[] = [];

  const leads = stmts.map((s) => tokenize(s)[0]?.u ?? "");
  const txn =
    opts.implicitTransactions !== false &&
    leads.some((l) => DML_LEADS.includes(l) || ["SAVEPOINT", "COMMIT", "ROLLBACK"].includes(l));

  if (txn) {
    out.push("BEGIN");
    notes.add(
      "Oracle opens a transaction implicitly with your first DML statement — there is no BEGIN. The emulator adds one so PostgreSQL behaves the same way.",
    );
  }

  for (const s of stmts) {
    const ts = tokenize(s);
    const lead = ts[0]?.u ?? "";
    const rewritten = render(trimPre(rewriteStatement(ts, opts, notes)));
    const isDdl = DDL_LEADS.includes(lead);
    if (txn && isDdl) {
      out.push("COMMIT", rewritten, "BEGIN");
      notes.add("DDL in Oracle issues an implicit COMMIT before and after it runs — pending changes become permanent.");
      continue;
    }
    out.push(rewritten);
    const next = ts[1];
    if (txn && (lead === "COMMIT" || (lead === "ROLLBACK" && !isWord(next, "TO")))) out.push("BEGIN");
  }

  // drop a trailing BEGIN that has nothing after it
  while (out.length && out[out.length - 1] === "BEGIN" && out.length > 1 && txn) {
    const last2 = out[out.length - 2];
    if (/^(COMMIT|ROLLBACK)\b/i.test(last2)) out.pop();
    else break;
  }

  return { sql: out.map((s) => s + ";").join("\n"), statements: out, notes: [...notes] };
}

function rewriteStatement(ts: Tok[], opts: TranspileOptions, notes: Set<string>): Tok[] {
  const lead = ts[0]?.u ?? "";

  if (lead === "BEGIN" && ts.length === 1) {
    throw new DialectError(
      "PLS-00103",
      'PLS-00103: Encountered the symbol "end-of-file"',
      "In Oracle, BEGIN starts a PL/SQL block, not a transaction. Transactions start automatically with your first INSERT/UPDATE/DELETE — just write the DML and finish with COMMIT or ROLLBACK.",
    );
  }
  if (lead === "START" && isWord(ts[1], "TRANSACTION")) {
    throw new DialectError(
      "ORA-00900",
      "ORA-00900: invalid SQL statement",
      "Oracle has no START TRANSACTION statement. A transaction begins implicitly with the first DML statement.",
    );
  }
  if (["BEGIN", "DECLARE", "EXEC", "EXECUTE"].includes(lead) || (lead === "CREATE" && ts.some((t) => isWord(t, "PROCEDURE", "PACKAGE", "TRIGGER", "FUNCTION")))) {
    throw new DialectError(
      "PLS-EMU",
      "PL/SQL is not available in the emulator",
      "PL/SQL (procedures, packages, triggers, anonymous blocks) runs inside the Oracle server. Query Clash covers it in the Codex, but the arena only accepts plain SQL statements.",
    );
  }

  if (lead === "EXPLAIN" && isWord(ts[1], "PLAN") && isWord(ts[2], "FOR")) {
    notes.add("Oracle's EXPLAIN PLAN FOR stores the plan in PLAN_TABLE; you would read it with SELECT * FROM TABLE(DBMS_XPLAN.DISPLAY). Here the PostgreSQL planner's EXPLAIN is shown directly.");
    ts = [{ ...ts[0] }, ...ts.slice(3)];
  }

  if (lead === "RENAME") {
    // RENAME a TO b  →  ALTER TABLE a RENAME TO b
    ts = [...toks("ALTER TABLE", ""), ts[1], ...toks("RENAME TO"), ...ts.slice(3)];
  }

  if (lead === "DELETE" && !isWord(ts[1], "FROM")) {
    ts = [ts[0], ...toks("FROM"), ...ts.slice(1)];
    notes.add("Oracle lets you omit FROM in DELETE; PostgreSQL requires DELETE FROM.");
  }

  ts = rewriteTypes(ts, lead, notes);
  ts = rewriteSequences(ts, notes);
  ts = rewriteDual(ts, notes);
  ts = rewriteFunctions(ts, notes);
  ts = rewriteMinus(ts, notes);
  ts = rewriteScopes(ts, opts, notes);
  ts = rewritePivot(ts, opts, notes);
  ts = rewriteRecursiveWith(ts, notes);
  if (lead === "MERGE") ts = rewriteMerge(ts, notes);
  if (lead === "MERGE" || lead === "UPDATE") ts = rewriteSetTargets(ts, notes);
  if (DDL_LEADS.includes(lead)) ts = rewriteDdl(ts, notes);
  return ts;
}

/* ------------------------------------------------------------------ types */

const TYPE_MAP: Record<string, string> = {
  VARCHAR2: "VARCHAR",
  NVARCHAR2: "VARCHAR",
  NCHAR: "CHAR",
  CLOB: "TEXT",
  NCLOB: "TEXT",
  BLOB: "BYTEA",
  RAW: "BYTEA",
  LONG: "TEXT",
  BINARY_DOUBLE: "DOUBLE PRECISION",
  BINARY_FLOAT: "REAL",
};

function rewriteTypes(ts: Tok[], lead: string, notes: Set<string>): Tok[] {
  const inDdl = lead === "CREATE" || lead === "ALTER";
  const out: Tok[] = [];
  let skipUntil = -1;
  ts.forEach((t, i) => {
    if (i < skipUntil) return;
    if (t.t === "word" && TYPE_MAP[t.u]) {
      out.push(...toks(TYPE_MAP[t.u], t.pre));
      notes.add("Oracle types were mapped: VARCHAR2 → VARCHAR, NUMBER → NUMERIC, CLOB → TEXT, BLOB → BYTEA.");
      return;
    }
    if (isWord(t, "NUMBER")) {
      // identity columns must be integers in PostgreSQL
      const afterPrec = isPunct(ts[i + 1], "(") ? matchParen(ts, i + 1) + 1 : i + 1;
      if (isWord(ts[afterPrec], "GENERATED")) {
        out.push({ ...t, v: "BIGINT", u: "BIGINT" });
        skipUntil = afterPrec;
        notes.add("NUMBER … GENERATED AS IDENTITY became BIGINT: PostgreSQL identity columns must be integer types.");
        return;
      }
      const prev = ts[i - 1];
      const next = ts[i + 1];
      // NUMBER(p) / NUMBER(p,0) are integers: map them like migration tools do
      if (isPunct(next, "(") && ts[i + 2]?.t === "number" && (isPunct(ts[i + 3], ")") || (isPunct(ts[i + 3], ",") && ts[i + 4]?.v === "0" && isPunct(ts[i + 5], ")")))) {
        const p = Number(ts[i + 2].v);
        if (p <= 18) {
          out.push({ ...t, v: p <= 9 ? "INTEGER" : "BIGINT", u: p <= 9 ? "INTEGER" : "BIGINT" });
          skipUntil = isPunct(ts[i + 3], ")") ? i + 4 : i + 6;
          notes.add("NUMBER(p) with no decimals became INTEGER (p ≤ 9) or BIGINT (p ≤ 18); other NUMBERs became NUMERIC.");
          return;
        }
      }
      if (inDdl || isPunct(next, "(") || isWord(prev, "AS", "RETURNING")) {
        out.push({ ...t, v: "NUMERIC", u: "NUMERIC" });
        notes.add("Oracle types were mapped: VARCHAR2 → VARCHAR, NUMBER → NUMERIC, CLOB → TEXT, BLOB → BYTEA.");
        return;
      }
    }
    out.push(t);
  });
  return out;
}

/* -------------------------------------------------------------- sequences */

function rewriteSequences(ts: Tok[], notes: Set<string>): Tok[] {
  const out: Tok[] = [];
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    if (t.t === "word" && isPunct(ts[i + 1], ".") && isWord(ts[i + 2], "NEXTVAL", "CURRVAL")) {
      const fn = ts[i + 2].u === "NEXTVAL" ? "nextval" : "currval";
      out.push(...toks(`${fn}('${t.v.toLowerCase()}')`, t.pre));
      notes.add("seq.NEXTVAL / seq.CURRVAL became nextval('seq') / currval('seq') — PostgreSQL calls sequences through functions.");
      i += 2;
      continue;
    }
    out.push(t);
  }
  return out;
}

/* ------------------------------------------------------------------- dual */

function rewriteDual(ts: Tok[], notes: Set<string>): Tok[] {
  const out: Tok[] = [];
  for (let i = 0; i < ts.length; i++) {
    if (isWord(ts[i], "FROM") && isWord(ts[i + 1], "DUAL")) {
      notes.add("FROM DUAL was dropped: Oracle needs a FROM clause (DUAL is a one-row dummy table), PostgreSQL does not.");
      i += 1;
      continue;
    }
    if (isWord(ts[i], "FROM") && isWord(ts[i + 1], "SYS") && isPunct(ts[i + 2], ".") && isWord(ts[i + 3], "DUAL")) {
      i += 3;
      continue;
    }
    out.push(ts[i]);
  }
  return out;
}

/* -------------------------------------------------------------- functions */

const DATE_HINT = /(_date|_on|_at|^date|date$|^hired?|timestamp)/i;

function rewriteFunctions(ts: Tok[], notes: Set<string>): Tok[] {
  ts = [...ts];
  for (let i = ts.length - 1; i >= 0; i--) {
    const t = ts[i];
    if (t.t !== "word") continue;
    if (isPunct(ts[i - 1], ".")) continue; // qualified name such as schema.nvl

    if (t.u === "SYSDATE" && !isPunct(ts[i + 1], "(")) {
      ts.splice(i, 1, ...toks("LOCALTIMESTAMP(0)", t.pre));
      notes.add("SYSDATE → LOCALTIMESTAMP(0): the current date and time without time zone.");
      continue;
    }
    if (t.u === "SYSTIMESTAMP" && !isPunct(ts[i + 1], "(")) {
      ts.splice(i, 1, ...toks("CURRENT_TIMESTAMP", t.pre));
      continue;
    }
    if (!isPunct(ts[i + 1], "(")) continue;
    const open = i + 1;
    const close = matchParen(ts, open);
    if (close < 0) continue;
    const args = splitArgs(ts, open, close);
    const a = args.map((x) => render(trimPre(x)));
    let rep: string | null = null;

    switch (t.u) {
      case "NVL":
        if (args.length === 2) {
          rep = `COALESCE(${a[0]}, ${a[1]})`;
          notes.add("NVL(a, b) → COALESCE(a, b). COALESCE is ANSI SQL and works in both databases.");
        }
        break;
      case "NVL2":
        if (args.length === 3) {
          rep = `(CASE WHEN ${a[0]} IS NOT NULL THEN ${a[1]} ELSE ${a[2]} END)`;
          notes.add("NVL2(x, a, b) → CASE WHEN x IS NOT NULL THEN a ELSE b END.");
        }
        break;
      case "DECODE": {
        if (args.length < 3) break;
        const expr = a[0];
        const pairs: string[] = [];
        let k = 1;
        for (; k + 1 < a.length; k += 2) {
          pairs.push(
            a[k].toUpperCase() === "NULL" ? `WHEN ${expr} IS NULL THEN ${a[k + 1]}` : `WHEN ${expr} = ${a[k]} THEN ${a[k + 1]}`,
          );
        }
        const els = k < a.length ? ` ELSE ${a[k]}` : "";
        rep = `(CASE ${pairs.join(" ")}${els} END)`;
        notes.add("DECODE is Oracle-only. It became a searched CASE expression, which is ANSI SQL. (DECODE also treats NULL = NULL as a match.)");
        break;
      }
      case "LISTAGG": {
        let expr = a[0] ?? "";
        let distinct = "";
        if (/^distinct\s/i.test(expr)) {
          distinct = "DISTINCT ";
          expr = expr.replace(/^distinct\s+/i, "");
        }
        const sep = a[1] ?? "''";
        let order = "";
        let end = close;
        if (isWord(ts[close + 1], "WITHIN") && isWord(ts[close + 2], "GROUP") && isPunct(ts[close + 3], "(")) {
          const wOpen = close + 3;
          const wClose = matchParen(ts, wOpen);
          order = " " + render(trimPre(ts.slice(wOpen + 1, wClose)));
          end = wClose;
        }
        ts.splice(i, end - i + 1, ...toks(`STRING_AGG(${distinct}CAST(${expr} AS TEXT), ${sep}${order})`, t.pre));
        notes.add("LISTAGG(x, sep) WITHIN GROUP (ORDER BY …) → STRING_AGG(x, sep ORDER BY …).");
        continue;
      }
      case "TO_NUMBER":
        if (args.length === 1) rep = `CAST(${a[0]} AS NUMERIC)`;
        break;
      case "ADD_MONTHS":
        if (args.length === 2) {
          rep = `CAST(${a[0]} + (${a[1]}) * INTERVAL '1 month' AS DATE)`;
          notes.add("ADD_MONTHS(d, n) → d + n * INTERVAL '1 month' (PostgreSQL uses interval arithmetic).");
        }
        break;
      case "MONTHS_BETWEEN":
        if (args.length === 2) {
          const age = `AGE(${a[0]}, ${a[1]})`;
          rep = `(EXTRACT(YEAR FROM ${age}) * 12 + EXTRACT(MONTH FROM ${age}) + EXTRACT(DAY FROM ${age}) / 31.0)`;
          notes.add("MONTHS_BETWEEN was emulated with AGE(); Oracle counts partial months on a 31-day basis.");
        }
        break;
      case "TRUNC": {
        const fmtUnit: Record<string, string> = {
          "'YYYY'": "year", "'YEAR'": "year", "'Y'": "year", "'Q'": "quarter", "'MM'": "month", "'MON'": "month",
          "'MONTH'": "month", "'DD'": "day", "'DDD'": "day", "'IW'": "week", "'HH'": "hour", "'HH24'": "hour", "'MI'": "minute",
        };
        if (args.length === 2 && args[1].length === 1 && args[1][0].t === "string") {
          const unit = fmtUnit[args[1][0].v.toUpperCase()];
          if (unit) rep = `CAST(DATE_TRUNC('${unit}', ${a[0]}) AS DATE)`;
        } else if (args.length === 1) {
          const dateish = args[0].some(
            (x) => (x.t === "word" && (DATE_HINT.test(x.v) || ["LOCALTIMESTAMP", "CURRENT_DATE", "CURRENT_TIMESTAMP", "DATE"].includes(x.u))),
          );
          if (dateish) rep = `CAST(DATE_TRUNC('day', ${a[0]}) AS DATE)`;
        }
        if (rep) notes.add("TRUNC(date[, fmt]) → DATE_TRUNC(unit, date). In PostgreSQL TRUNC only works on numbers.");
        break;
      }
      case "INSTR":
        if (args.length === 2) {
          rep = `STRPOS(${a[0]}, ${a[1]})`;
          notes.add("INSTR(str, sub) → STRPOS(str, sub).");
        }
        break;
      case "REGEXP_REPLACE":
        if (args.length === 3) {
          rep = `REGEXP_REPLACE(${a[0]}, ${a[1]}, ${a[2]}, 'g')`;
          notes.add("Oracle's REGEXP_REPLACE replaces every match; PostgreSQL only replaces the first unless you pass the 'g' flag.");
        }
        break;
      case "SYS_GUID":
        rep = "gen_random_uuid()";
        break;
    }
    if (rep !== null) ts.splice(i, close - i + 1, ...toks(rep, t.pre));
  }
  return ts;
}

/* ------------------------------------------------------------------ MINUS */

function rewriteMinus(ts: Tok[], notes: Set<string>): Tok[] {
  return ts.map((t) => {
    if (isWord(t, "MINUS")) {
      notes.add("MINUS → EXCEPT. (Oracle 21c+ also accepts EXCEPT; MINUS is the classic Oracle spelling.)");
      return { ...t, v: "EXCEPT", u: "EXCEPT" };
    }
    return t;
  });
}

/* ------------------------------------------------ scope-level rewrites */

function rewriteScopes(ts: Tok[], opts: TranspileOptions, notes: Set<string>): Tok[] {
  // Repeatedly transform the innermost scope that still needs work. Each
  // transform removes its trigger, so this terminates.
  for (let guard = 0; guard < 50; guard++) {
    const scopes = findScopes(ts).sort((x, y) => y.depth - x.depth || y.start - x.start);
    let changed = false;
    for (const sc of scopes) {
      const cs = clausesOf(ts, sc);
      if (clause(cs, "CONNECT")) {
        ts = rewriteConnectBy(ts, sc, cs, opts, notes);
        changed = true;
        break;
      }
      if (hasOuterJoinMarker(ts.slice(sc.start, sc.end))) {
        ts = rewriteOuterJoin(ts, sc, cs, notes);
        changed = true;
        break;
      }
      if (scopeHasRownum(ts, sc)) {
        ts = rewriteRownum(ts, sc, cs, notes);
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }
  return ts;
}

function hasOuterJoinMarker(ts: Tok[]): boolean {
  return ts.some((t, k) => isPunct(t, "(") && ts[k + 1]?.v === "+" && isPunct(ts[k + 2], ")"));
}

function depthAt(ts: Tok[], from: number, to: number): number[] {
  const d: number[] = [];
  let depth = 0;
  for (let i = from; i < to; i++) {
    if (isPunct(ts[i], ")")) depth--;
    d.push(depth);
    if (isPunct(ts[i], "(")) depth++;
  }
  return d;
}

function scopeHasRownum(ts: Tok[], sc: Scope): boolean {
  const d = depthAt(ts, sc.start, sc.end);
  for (let i = sc.start; i < sc.end; i++) if (d[i - sc.start] === 0 && isWord(ts[i], "ROWNUM")) return true;
  return false;
}

/* ---- (+) outer joins ---- */

function rewriteOuterJoin(ts: Tok[], sc: Scope, cs: Clause[], notes: Set<string>): Tok[] {
  const from = clause(cs, "FROM");
  const where = clause(cs, "WHERE");
  if (!from || !where) {
    throw new DialectError("ORA-00933", "ORA-00933: SQL command not properly ended", "The (+) operator only makes sense in a WHERE clause that joins tables listed in FROM.");
  }
  const fromToks = ts.slice(from.body, from.end);
  if (fromToks.some((t) => isWord(t, "JOIN"))) {
    throw new DialectError(
      "ORA-25156",
      "ORA-25156: old style outer join (+) cannot be used with ANSI joins",
      "Pick one style: either list tables with commas and use (+), or use LEFT JOIN … ON. Modern code uses ANSI joins.",
    );
  }
  const items = splitTop(fromToks, (t) => isPunct(t, ",")).map((it) => trimPre(it));
  const aliasOf = (it: Tok[]) => (it[it.length - 1].t === "word" || it[it.length - 1].t === "qident" ? it[it.length - 1].u : "");
  const aliases = items.map(aliasOf);

  const conj = splitAnd(ts.slice(where.body, where.end));
  const optional = new Map<string, Tok[][]>(); // alias -> ON predicates
  const rest: Tok[][] = [];
  for (const c of conj) {
    const plusAt: number[] = [];
    c.forEach((t, k) => {
      if (isPunct(t, "(") && c[k + 1]?.v === "+" && isPunct(c[k + 2], ")")) plusAt.push(k);
    });
    if (!plusAt.length) {
      rest.push(c);
      continue;
    }
    if (c.some((t) => isWord(t, "OR", "IN"))) {
      throw new DialectError("ORA-01719", "ORA-01719: outer join operator (+) not allowed in operand of OR or IN", "Rewrite the condition with an ANSI LEFT JOIN … ON (…) instead.");
    }
    // the (+) marks the optional (outer) side: "alias.col(+)"
    const k = plusAt[0];
    if (!(c[k - 1]?.t === "word" && isPunct(c[k - 2], ".") && c[k - 3])) {
      throw new DialectError("ORA-EMU", "Qualify outer-joined columns", "Write the optional side as alias.column(+) so the emulator knows which table is optional.");
    }
    const alias = c[k - 3].u;
    const cleaned: Tok[] = [];
    for (let j = 0; j < c.length; j++) {
      if (isPunct(c[j], "(") && c[j + 1]?.v === "+" && isPunct(c[j + 2], ")")) {
        j += 2;
        continue;
      }
      cleaned.push(c[j]);
    }
    if (!optional.has(alias)) optional.set(alias, []);
    optional.get(alias)!.push(cleaned);
  }

  // order: required tables first, then optional ones whose ON references are satisfied
  const placed: string[] = [];
  const parts: Tok[] = [];
  items.forEach((it, idx) => {
    if (optional.has(aliases[idx])) return;
    if (parts.length) parts.push(...toks("CROSS JOIN"));
    parts.push(...(parts.length ? [{ ...it[0], pre: " " }, ...it.slice(1)] : it));
    placed.push(aliases[idx]);
  });
  const pending = items.map((it, idx) => ({ it, alias: aliases[idx] })).filter((x) => optional.has(x.alias));
  let guard = 0;
  while (pending.length && guard++ < 20) {
    const idx = pending.findIndex((p) =>
      optional.get(p.alias)!.every((pred) => pred.every((t, k) => !(t.t === "word" && isPunct(pred[k + 1], ".")) || t.u === p.alias || placed.includes(t.u))),
    );
    const p = pending.splice(idx < 0 ? 0 : idx, 1)[0];
    parts.push(...toks("LEFT JOIN"), { ...p.it[0], pre: " " }, ...p.it.slice(1), ...toks("ON"));
    optional.get(p.alias)!.forEach((pred, n) => {
      if (n) parts.push(...toks("AND"));
      parts.push({ ...pred[0], pre: " " }, ...pred.slice(1));
    });
    placed.push(p.alias);
  }
  notes.add("Oracle's (+) outer-join marker was rewritten as ANSI LEFT JOIN … ON. The (+) goes on the side that may be missing (NULL-extended).");

  const whereToks: Tok[] = [];
  rest.forEach((r, n) => {
    if (n) whereToks.push(...toks("AND"));
    whereToks.push({ ...r[0], pre: " " }, ...r.slice(1));
  });

  const before = ts.slice(0, from.body);
  const between = ts.slice(from.end, where.at);
  const after = ts.slice(where.end);
  return [...before, { ...parts[0], pre: " " }, ...parts.slice(1), ...between, ...(whereToks.length ? [...toks("WHERE"), ...whereToks] : []), ...after];
}

/* ---- ROWNUM ---- */

function rewriteRownum(ts: Tok[], sc: Scope, cs: Clause[], notes: Set<string>): Tok[] {
  let out = [...ts];
  const where = clause(cs, "WHERE");
  let limit: string | null = null;

  if (where) {
    const conj = splitAnd(ts.slice(where.body, where.end));
    const keep: Tok[][] = [];
    for (const c of conj) {
      const v = c.map((t) => t.u);
      let n: number | null = null;
      if (v.length === 3 && v[0] === "ROWNUM" && c[2].t === "number") {
        const num = Number(c[2].v);
        if (v[1] === "<=") n = num;
        else if (v[1] === "<") n = num - 1;
        else if (v[1] === "=" && num === 1) n = 1;
      } else if (v.length === 3 && v[2] === "ROWNUM" && c[0].t === "number") {
        const num = Number(c[0].v);
        if (v[1] === ">=") n = num;
        else if (v[1] === ">") n = num - 1;
      }
      if (n !== null) limit = String(Math.max(0, n));
      else keep.push(c);
    }
    if (limit !== null) {
      const repl: Tok[] = [];
      keep.forEach((k, idx) => {
        repl.push(...toks(idx ? "AND" : "WHERE"), { ...k[0], pre: " " }, ...k.slice(1));
      });
      out = [...out.slice(0, where.at), ...repl, ...out.slice(where.end)];
    }
  }

  // ROWNUM anywhere else in this scope (select list, remaining predicates)
  let cur = findScopes(out).find((s) => s.start === sc.start)!;
  const d = depthAt(out, cur.start, cur.end);
  for (let i = cur.end - 1; i >= cur.start; i--) {
    if (d[i - cur.start] === 0 && isWord(out[i], "ROWNUM")) {
      out.splice(i, 1, ...toks("ROW_NUMBER() OVER ()", out[i].pre));
      notes.add("ROWNUM in the select list became ROW_NUMBER() OVER () — both number rows in the order they are produced.");
    }
  }
  if (limit === null) return out;

  cur = findScopes(out).find((s) => s.start === sc.start)!;
  const cs2 = clausesOf(out, cur);
  const order = clause(cs2, "ORDER");
  const forUpd = clause(cs2, "FOR");
  notes.add("ROWNUM filters became LIMIT. Oracle 12c+ also supports FETCH FIRST n ROWS ONLY, which is the modern, portable form.");

  if (order) {
    // Oracle assigns ROWNUM *before* ORDER BY: emulate by limiting first, then sorting.
    notes.add(
      "Careful: in Oracle, ROWNUM is assigned before ORDER BY runs, so WHERE ROWNUM <= n with ORDER BY in the same query picks n arbitrary rows and then sorts them. Sort in a subquery first (or use FETCH FIRST).",
    );
    const orderToks = out.slice(order.body, order.end).filter((t, k, arr) => !(t.t === "word" && isPunct(arr[k + 1], ".")) && !isPunct(t, "."));
    const inner = [...out.slice(cur.start, order.at), ...toks(`LIMIT ${limit}`)];
    const wrapped = [
      ...toks("SELECT * FROM (", out[cur.start].pre),
      ...trimPre(inner),
      ...toks(") __rownum ORDER BY"),
      ...orderToks.map((t, k) => (k === 0 ? { ...t, pre: " " } : t)),
    ];
    return [...out.slice(0, cur.start), ...wrapped, ...out.slice(order.end)];
  }

  const insertAt = forUpd ? forUpd.at : cur.end;
  if (isWord(out[cur.end], "UNION", "INTERSECT", "EXCEPT")) {
    return [
      ...out.slice(0, cur.start),
      ...toks("(", out[cur.start].pre),
      ...trimPre(out.slice(cur.start, insertAt)),
      ...toks(`LIMIT ${limit})`),
      ...out.slice(insertAt),
    ];
  }
  return [...out.slice(0, insertAt), ...toks(`LIMIT ${limit}`), ...out.slice(insertAt)];
}

/* ---- CONNECT BY ---- */

const NON_COLUMN = new Set([
  "AND", "OR", "NOT", "NULL", "IS", "IN", "LIKE", "BETWEEN", "TRUE", "FALSE", "PRIOR", "LEVEL", "CASE", "WHEN", "THEN",
  "ELSE", "END", "EXISTS", "SELECT", "FROM", "WHERE", "ASC", "DESC", "NULLS", "FIRST", "LAST", "AS", "DISTINCT",
]);

/** Qualify bare column names with `alias`, turning `PRIOR x` into `prior.x`. */
function qualify(expr: Tok[], alias: string, priorAlias: string, levelExpr?: string): Tok[] {
  const out: Tok[] = [];
  for (let k = 0; k < expr.length; k++) {
    const t = expr[k];
    if (isWord(t, "PRIOR")) {
      const a = expr[k + 1];
      if (isPunct(expr[k + 2], ".") && expr[k + 3]) {
        out.push(...toks(`${priorAlias}.${expr[k + 3].v}`, t.pre));
        k += 3;
      } else if (a) {
        out.push(...toks(`${priorAlias}.${a.v}`, t.pre));
        k += 1;
      }
      continue;
    }
    if (isWord(t, "LEVEL") && levelExpr && !isPunct(expr[k - 1], ".")) {
      out.push(...toks(levelExpr, t.pre));
      continue;
    }
    const bare =
      (t.t === "word" || t.t === "qident") &&
      !NON_COLUMN.has(t.u) &&
      !isPunct(expr[k - 1], ".") &&
      !isPunct(expr[k + 1], ".") &&
      !isPunct(expr[k + 1], "(");
    if (bare) {
      out.push(...toks(`${alias}.${t.v}`, t.pre));
      continue;
    }
    // alias.col where alias is the table alias: keep; in the recursive term the
    // table alias denotes the child row, which is what Oracle means.
    out.push(t);
  }
  return out;
}

function rewriteConnectBy(ts: Tok[], sc: Scope, cs: Clause[], opts: TranspileOptions, notes: Set<string>): Tok[] {
  const sel = clause(cs, "SELECT")!;
  const from = clause(cs, "FROM");
  const where = clause(cs, "WHERE");
  const start = clause(cs, "START");
  const connect = clause(cs, "CONNECT")!;
  const order = clause(cs, "ORDER");
  const group = clause(cs, "GROUP");
  const having = clause(cs, "HAVING");
  const siblings = order ? isWord(ts[order.at + 1], "SIBLINGS") : false;
  const connectToks = ts.slice(connect.body, connect.end);
  const nocycle = isWord(ts[connect.at + 2], "NOCYCLE");

  notes.add("CONNECT BY is Oracle's hierarchical query syntax. It was rewritten as a recursive CTE (WITH RECURSIVE), the ANSI-standard way that PostgreSQL — and Oracle 11gR2+ — support.");
  if (nocycle) notes.add("NOCYCLE: the emulator stops at depth 100 instead of detecting cycles row by row.");

  const R = "__h";
  const P = "__p";
  let selectList = ts.slice(sel.body, from ? from.at : connect.at);

  // Generator form: SELECT LEVEL FROM dual CONNECT BY LEVEL <= n (FROM dual was removed earlier)
  if (!from) {
    const cond = render(trimPre(qualify(connectToks, P, P, `${P}.level + 1`)));
    const list = render(trimPre(selectList.map((t) => (isWord(t, "LEVEL") ? { ...t, v: `${R}.level` } : t))));
    const sql = `WITH RECURSIVE ${R} AS (SELECT 1 AS level UNION ALL SELECT ${P}.level + 1 FROM ${R} ${P} WHERE ${cond} AND ${P}.level < 10000) SELECT ${list} FROM ${R}${where ? " WHERE " + render(trimPre(ts.slice(where.body, where.end))) : ""} ORDER BY ${R}.level`;
    notes.add("The CONNECT BY LEVEL <= n row generator became a recursive CTE counter (PostgreSQL also has generate_series).");
    return spliceScope(ts, sc, sql);
  }

  const fromToks = trimPre(ts.slice(from.body, (where ?? start ?? connect).at));
  if (fromToks.some((t) => isPunct(t, ",") || isWord(t, "JOIN"))) {
    throw new DialectError(
      "ORA-EMU",
      "CONNECT BY over joins is not emulated",
      "Build the hierarchy in a recursive WITH clause first, then join to it. That is the portable approach and works in both Oracle and PostgreSQL.",
    );
  }
  const tableName = render(fromToks.filter((t, k) => !(k === fromToks.length - 1 && fromToks.length > 1 && !isPunct(fromToks[k - 1], "."))));
  const alias = fromToks.length > 1 && !isPunct(fromToks[fromToks.length - 2], ".") ? fromToks[fromToks.length - 1].v : tableName.split(".").pop()!;

  // Expand SELECT * so the helper columns stay hidden
  if (selectList.some((t, k) => isPunct(selectList[k - 1] ?? ({} as Tok), ".") ? false : t.v === "*")) {
    const probe = `SELECT * FROM ${tableName} LIMIT 0`;
    const cols = opts.columns?.[probe];
    if (!cols) throw new NeedColumns(probe);
    const expanded: Tok[] = [];
    for (let k = 0; k < selectList.length; k++) {
      const t = selectList[k];
      if (t.v === "*" && (k === 0 || isPunct(selectList[k - 1], ","))) {
        expanded.push(...toks(cols.map((c) => `${alias}.${c}`).join(", "), t.pre));
      } else if (t.v === "*" && isPunct(selectList[k - 1], ".")) {
        expanded.pop();
        expanded.pop();
        expanded.push(...toks(cols.map((c) => `${alias}.${c}`).join(", "), " "));
      } else expanded.push(t);
    }
    selectList = expanded;
  }

  // parent key for default depth-first ordering: the column after PRIOR
  const priorIdx = connectToks.findIndex((t) => isWord(t, "PRIOR"));
  if (priorIdx < 0) {
    throw new DialectError("ORA-EMU", "CONNECT BY needs PRIOR", "Write the parent/child link as CONNECT BY PRIOR parent_key = child_key.");
  }
  const pk = isPunct(connectToks[priorIdx + 2], ".") ? connectToks[priorIdx + 3].v : connectToks[priorIdx + 1].v;

  let sortKey = `${alias}.${pk}`;
  if (siblings && order) {
    const keys = splitTop(ts.slice(order.body, order.end), (t) => isPunct(t, ","));
    const first = keys[0].filter((t) => !isWord(t, "ASC"));
    if (first.some((t) => isWord(t, "DESC"))) notes.add("ORDER SIBLINGS BY … DESC is emulated in ascending order.");
    sortKey = render(trimPre(qualify(first.filter((t) => !isWord(t, "DESC")), alias, P)));
    if (keys.length > 1) notes.add("Only the first ORDER SIBLINGS BY key is used by the emulator.");
    notes.add("ORDER SIBLINGS BY sorts children under each parent. The emulator builds a sort path array while recursing and orders by it.");
  }

  // pseudo columns
  const extraAnchor: string[] = [];
  const extraRec: string[] = [];
  const paths = new Map<string, number>();
  const roots = new Map<string, number>();
  const connectRec = render(trimPre(qualify(connectToks, alias, P)));
  const leafCond = render(trimPre(qualify(connectToks.map((t) => t), "__c", alias)));

  const rewritePseudo = (list: Tok[]): Tok[] => {
    const out: Tok[] = [];
    for (let k = 0; k < list.length; k++) {
      const t = list[k];
      if (isWord(t, "LEVEL") && !isPunct(list[k - 1], ".")) {
        out.push(...toks(`${alias}.level`, t.pre));
      } else if (isWord(t, "SYS_CONNECT_BY_PATH") && isPunct(list[k + 1], "(")) {
        const close = matchParen(list, k + 1);
        const args = splitArgs(list, k + 1, close);
        const col = render(trimPre(qualify(args[0], alias, P)));
        const sep = render(trimPre(args[1] ?? toks("'/'")));
        const key = `${col}|${sep}`;
        if (!paths.has(key)) {
          paths.set(key, paths.size + 1);
          const n = paths.size;
          extraAnchor.push(`CAST(${sep} || ${col} AS TEXT) AS __cbp${n}`);
          extraRec.push(`${P}.__cbp${n} || ${sep} || ${col}`);
        }
        out.push(...toks(`${alias}.__cbp${paths.get(key)}`, t.pre));
        k = close;
        notes.add("SYS_CONNECT_BY_PATH(col, sep) became a text column accumulated during recursion.");
      } else if (isWord(t, "CONNECT_BY_ROOT")) {
        let col: string;
        if (isPunct(list[k + 2], ".")) {
          col = `${alias}.${list[k + 3].v}`;
          k += 3;
        } else {
          col = `${alias}.${list[k + 1].v}`;
          k += 1;
        }
        if (!roots.has(col)) {
          roots.set(col, roots.size + 1);
          extraAnchor.push(`${col} AS __root${roots.size}`);
          extraRec.push(`${P}.__root${roots.size}`);
        }
        out.push(...toks(`${alias}.__root${roots.get(col)}`, t.pre));
        notes.add("CONNECT_BY_ROOT col is carried down from the anchor row of each tree.");
      } else if (isWord(t, "CONNECT_BY_ISLEAF")) {
        out.push(...toks(`(CASE WHEN EXISTS (SELECT 1 FROM ${tableName} __c WHERE ${leafCond}) THEN 0 ELSE 1 END)`, t.pre));
      } else out.push(t);
    }
    return out;
  };

  const newSelect = render(trimPre(rewritePseudo(selectList)));
  const anchorWhere = start ? ` WHERE ${render(trimPre(ts.slice(start.body, start.end)))}` : "";
  const outerWhere = where ? ` WHERE ${render(trimPre(rewritePseudo(ts.slice(where.body, where.end))))}` : "";
  const outerGroup = group ? ` GROUP BY ${render(trimPre(rewritePseudo(ts.slice(group.body, group.end))))}` : "";
  const outerHaving = having ? ` HAVING ${render(trimPre(rewritePseudo(ts.slice(having.body, having.end))))}` : "";
  const outerOrder =
    order && !siblings ? ` ORDER BY ${render(trimPre(rewritePseudo(ts.slice(order.body, order.end))))}` : group ? "" : ` ORDER BY ${alias}.__path`;

  const ex = (xs: string[]) => (xs.length ? ", " + xs.join(", ") : "");
  const sql =
    `WITH RECURSIVE ${R} AS (` +
    `SELECT ${alias}.*, 1 AS level, ARRAY[${sortKey}] AS __path${ex(extraAnchor)} FROM ${tableName} ${alias}${anchorWhere}` +
    ` UNION ALL ` +
    `SELECT ${alias}.*, ${P}.level + 1, ${P}.__path || ${sortKey.replace(new RegExp(`\\b${P}\\.`, "g"), `${alias}.`)}${ex(extraRec)} FROM ${tableName} ${alias} JOIN ${R} ${P} ON ${connectRec} AND ${P}.level < 100` +
    `) SELECT ${newSelect} FROM ${R} ${alias}${outerWhere}${outerGroup}${outerHaving}${outerOrder}`;

  return spliceScope(ts, sc, sql);
}

function spliceScope(ts: Tok[], sc: Scope, sql: string): Tok[] {
  const repl = toks(sql, ts[sc.start].pre);
  return [...ts.slice(0, sc.start), ...repl, ...ts.slice(sc.end)];
}

/* ------------------------------------------------------------------ PIVOT */

function rewritePivot(ts: Tok[], opts: TranspileOptions, notes: Set<string>): Tok[] {
  for (let guard = 0; guard < 10; guard++) {
    const at = ts.findIndex((t, i) => isWord(t, "PIVOT", "UNPIVOT") && isPunct(ts[i + 1], "("));
    if (at < 0) return ts;
    if (ts[at].u === "UNPIVOT") {
      throw new DialectError(
        "ORA-EMU",
        "UNPIVOT is not emulated",
        "UNPIVOT turns columns into rows. In PostgreSQL you would write a UNION ALL of one SELECT per column, or use a LATERAL (VALUES …) join.",
      );
    }
    // source: identifier or parenthesised subquery right before PIVOT
    let srcStart: number;
    if (isPunct(ts[at - 1], ")")) srcStart = matchParenBack(ts, at - 1);
    else {
      srcStart = at - 1;
      while (isPunct(ts[srcStart - 1], ".")) srcStart -= 2;
    }
    const source = render(trimPre(ts.slice(srcStart, at)));
    const open = at + 1;
    const close = matchParen(ts, open);
    const body = ts.slice(open + 1, close);
    const forAt = body.findIndex((t) => isWord(t, "FOR"));
    const inAt = body.findIndex((t, k) => k > forAt && isWord(t, "IN"));
    if (forAt < 0 || inAt < 0) throw new DialectError("ORA-00936", "ORA-00936: missing expression", "PIVOT needs: PIVOT (agg(expr) FOR column IN (value1 AS alias1, …)).");
    const aggs = splitTop(body.slice(0, forAt), (t) => isPunct(t, ",")).map((x) => trimPre(x));
    const pivotCol = render(trimPre(body.slice(forAt + 1, inAt)));
    const inOpen = forAt + 1 + (inAt - forAt - 1) + 1;
    const inClose = matchParen(body, inOpen);
    const values = splitArgs(body, inOpen, inClose).map((x) => trimPre(x));

    const probe = `SELECT * FROM ${source} LIMIT 0`;
    const cols = opts.columns?.[probe];
    if (!cols) throw new NeedColumns(probe);

    const aggInfo = aggs.map((a) => {
      const fnClose = matchParen(a, 1);
      const fn = a[0].v.toUpperCase();
      const expr = render(trimPre(a.slice(2, fnClose)));
      const rest = a.slice(fnClose + 1).filter((t) => !isWord(t, "AS"));
      return { fn, expr, alias: rest[0]?.v, refs: a.slice(2, fnClose).filter((t) => t.t === "word").map((t) => t.u) };
    });
    const used = new Set([pivotCol.toUpperCase(), ...aggInfo.flatMap((g) => g.refs)]);
    const groupCols = cols.filter((c) => !used.has(c.toUpperCase()));

    const exprs: string[] = [];
    for (const v of values) {
      const asAt = v.findIndex((t) => isWord(t, "AS"));
      const valToks = asAt >= 0 ? v.slice(0, asAt) : v.length > 1 && v[v.length - 1].t === "word" ? v.slice(0, -1) : v;
      const aliasTok = asAt >= 0 ? v[asAt + 1] : v.length > 1 && v[v.length - 1].t === "word" ? v[v.length - 1] : undefined;
      const val = render(trimPre(valToks));
      const name = aliasTok ? aliasTok.v : val.replace(/^'|'$/g, "");
      for (const g of aggInfo) {
        const arg = g.expr === "*" ? "1" : g.expr;
        const colName = aggInfo.length > 1 && g.alias ? `${name}_${g.alias}` : name;
        exprs.push(`${g.fn}(CASE WHEN ${pivotCol} = ${val} THEN ${arg} END) AS ${/^[A-Za-z_][A-Za-z0-9_]*$/.test(colName) ? colName : `"${colName}"`}`);
      }
    }
    const derived = `(SELECT ${[...groupCols, ...exprs].join(", ")} FROM ${source} __src${groupCols.length ? ` GROUP BY ${groupCols.join(", ")}` : ""})`;
    notes.add("PIVOT was rewritten as conditional aggregation: one agg(CASE WHEN col = value THEN … END) per value, grouped by the remaining columns. This pattern works in every database.");
    ts = [...ts.slice(0, srcStart), ...toks(derived, ts[srcStart].pre), ...ts.slice(close + 1)];
  }
  return ts;
}

/* ------------------------------------------------------- WITH RECURSIVE */

function rewriteRecursiveWith(ts: Tok[], notes: Set<string>): Tok[] {
  const out = [...ts];
  for (let i = out.length - 1; i >= 0; i--) {
    if (!isWord(out[i], "WITH") || isWord(out[i - 1], "START") || isWord(out[i + 1], "RECURSIVE")) continue;
    // parse the CTE list
    let k = i + 1;
    let recursive = false;
    let ok = false;
    while (k < out.length && (out[k].t === "word" || out[k].t === "qident")) {
      const name = out[k].u;
      let j = k + 1;
      if (isPunct(out[j], "(")) j = matchParen(out, j) + 1;
      if (!isWord(out[j], "AS")) break;
      j++;
      if (isWord(out[j], "NOT")) j++;
      if (isWord(out[j], "MATERIALIZED")) j++;
      if (!isPunct(out[j], "(")) break;
      const close = matchParen(out, j);
      ok = true;
      if (out.slice(j + 1, close).some((t) => t.u === name)) recursive = true;
      j = close + 1;
      // Oracle SEARCH / CYCLE clauses
      if (isWord(out[j], "SEARCH")) {
        while (j < out.length && !isWord(out[j], "SET")) j++;
        j += 2;
      }
      if (isWord(out[j], "CYCLE")) {
        while (j < out.length && !isWord(out[j], "DEFAULT")) j++;
        if (isWord(out[j], "DEFAULT")) {
          out.splice(j + 2, 0, ...toks("USING __cycle_path"));
          notes.add("PostgreSQL's CYCLE clause needs a USING path column; the emulator adds one.");
          j += 4;
        }
      }
      if (isPunct(out[j], ",")) {
        k = j + 1;
        continue;
      }
      break;
    }
    if (ok && recursive) {
      out.splice(i + 1, 0, ...toks("RECURSIVE"));
      notes.add("Oracle infers that a CTE is recursive; PostgreSQL requires the keyword: WITH RECURSIVE.");
    }
  }
  return out;
}

/* ------------------------------------------------------------------ MERGE */

function rewriteMerge(ts: Tok[], notes: Set<string>): Tok[] {
  const out = [...ts];
  for (let i = 0; i < out.length; i++) {
    if (!(isWord(out[i], "WHEN") && isWord(out[i + 1], "MATCHED") && isWord(out[i + 2], "THEN") && isWord(out[i + 3], "UPDATE"))) continue;
    // find end of this WHEN branch
    let depth = 0;
    let end = out.length;
    let whereAt = -1;
    for (let j = i + 4; j < out.length; j++) {
      if (isPunct(out[j], "(")) depth++;
      if (isPunct(out[j], ")")) depth--;
      if (depth === 0 && isWord(out[j], "WHEN")) {
        end = j;
        break;
      }
      if (depth === 0 && isWord(out[j], "DELETE")) {
        throw new DialectError("ORA-EMU", "MERGE … DELETE WHERE is not emulated", "Add a separate branch instead: WHEN MATCHED AND <condition> THEN DELETE (PostgreSQL syntax).");
      }
      if (depth === 0 && isWord(out[j], "WHERE") && whereAt < 0) whereAt = j;
    }
    if (whereAt < 0) continue;
    const cond = out.slice(whereAt + 1, end);
    out.splice(whereAt, end - whereAt);
    out.splice(i + 2, 0, ...toks("AND ("), ...trimPre(cond), ...toks(")", ""));
    notes.add("Oracle's WHEN MATCHED THEN UPDATE … WHERE cond became WHEN MATCHED AND cond THEN UPDATE ….");
  }
  return out;
}

/** UPDATE … SET t.col = … : Oracle allows the alias on the target column, PostgreSQL does not. */
function rewriteSetTargets(ts: Tok[], notes: Set<string>): Tok[] {
  const out = [...ts];
  let depth = 0;
  let inSet = false;
  for (let i = 0; i < out.length; i++) {
    const t = out[i];
    if (isPunct(t, "(")) depth++;
    if (isPunct(t, ")")) depth--;
    if (depth !== 0) continue;
    if (isWord(t, "SET")) {
      inSet = true;
    } else if (isWord(t, "WHERE", "WHEN", "FROM", "RETURNING")) {
      inSet = false;
      continue;
    } else if (!(inSet && (isWord(out[i - 1], "SET") || isPunct(out[i - 1], ",")))) {
      continue;
    }
    const k = isWord(t, "SET") ? i + 1 : i;
    if (out[k]?.t === "word" && isPunct(out[k + 1], ".") && out[k + 2]?.t === "word" && out[k + 3]?.v === "=") {
      out.splice(k, 2);
      out[k] = { ...out[k], pre: " " };
      notes.add("PostgreSQL does not allow a table alias on the target column of SET (SET p.price = … → SET price = …).");
    }
  }
  return out;
}

/* -------------------------------------------------------------------- DDL */

function rewriteDdl(ts: Tok[], notes: Set<string>): Tok[] {
  let out = [...ts];
  const lead = out[0].u;

  if (lead === "CREATE") {
    // CREATE BITMAP INDEX
    const bi = out.findIndex((t) => isWord(t, "BITMAP"));
    if (bi > 0 && isWord(out[bi + 1], "INDEX")) {
      out.splice(bi, 1);
      notes.add("PostgreSQL has no stored bitmap indexes: it builds bitmaps on the fly (Bitmap Index Scan) from ordinary B-tree indexes. A B-tree index was created instead.");
    }
    // GLOBAL TEMPORARY TABLE
    const gt = out.findIndex((t) => isWord(t, "GLOBAL"));
    if (gt > 0 && isWord(out[gt + 1], "TEMPORARY")) {
      out.splice(gt, 1);
      notes.add("Oracle's GLOBAL TEMPORARY TABLE is a permanent definition with per-session rows; PostgreSQL's TEMPORARY TABLE is created per session.");
    }
    // sequences options
    if (out.some((t) => isWord(t, "SEQUENCE"))) {
      out = out.flatMap((t) => {
        if (isWord(t, "NOCACHE", "NOORDER", "ORDER")) return [];
        if (isWord(t, "NOCYCLE")) return toks("NO CYCLE", t.pre);
        if (isWord(t, "NOMAXVALUE")) return toks("NO MAXVALUE", t.pre);
        if (isWord(t, "NOMINVALUE")) return toks("NO MINVALUE", t.pre);
        return [t];
      });
    }
    // identity ON NULL
    for (let i = 0; i < out.length; i++) {
      if (isWord(out[i], "DEFAULT") && isWord(out[i + 1], "ON") && isWord(out[i + 2], "NULL")) out.splice(i + 1, 2);
    }
    // materialized view build/refresh options
    const mv = out.findIndex((t, i) => isWord(t, "MATERIALIZED") && isWord(out[i + 1], "VIEW"));
    if (mv > 0) {
      const asAt = out.findIndex((t, i) => i > mv + 2 && isWord(t, "AS"));
      const opts = out.slice(mv + 3, asAt);
      const deferred = opts.some((t) => isWord(t, "DEFERRED"));
      if (opts.length) {
        out.splice(mv + 3, asAt - (mv + 3));
        notes.add("Oracle materialized-view options (BUILD, REFRESH FAST/COMPLETE, ON COMMIT) were dropped: PostgreSQL materialized views are refreshed manually with REFRESH MATERIALIZED VIEW.");
      }
      if (deferred) out.push(...toks("WITH NO DATA"));
    }
    // view WITH READ ONLY
    const n = out.length;
    if (isWord(out[n - 3], "WITH") && isWord(out[n - 2], "READ") && isWord(out[n - 1], "ONLY")) {
      out.splice(n - 3, 3);
      notes.add("PostgreSQL views have no WITH READ ONLY clause; you would revoke INSERT/UPDATE/DELETE privileges instead.");
    }
  }

  if (lead === "DROP") {
    out = out.flatMap((t, i) => {
      if (isWord(t, "CONSTRAINTS") && isWord(out[i - 1], "CASCADE")) return [];
      if (isWord(t, "PURGE")) return [];
      return [t];
    });
  }

  if (lead === "ALTER" && isWord(out[1], "TABLE")) {
    // ALTER TABLE t ADD ( … ) / MODIFY ( … ) / MODIFY col …
    const verbAt = out.findIndex((t, i) => i > 2 && isWord(t, "ADD", "MODIFY"));
    if (verbAt > 0) {
      const verb = out[verbAt].u;
      let items: Tok[][];
      let tailStart: number;
      if (isPunct(out[verbAt + 1], "(")) {
        const close = matchParen(out, verbAt + 1);
        items = splitArgs(out, verbAt + 1, close).map((x) => trimPre(x));
        tailStart = close + 1;
      } else {
        items = [trimPre(out.slice(verbAt + 1))];
        tailStart = out.length;
      }
      const clauses: string[] = [];
      for (const it of items) {
        const txt = render(it);
        if (verb === "ADD") {
          if (isWord(it[0], "CONSTRAINT", "PRIMARY", "UNIQUE", "FOREIGN", "CHECK")) clauses.push(`ADD ${txt}`);
          else clauses.push(`ADD COLUMN ${txt}`);
        } else {
          const col = it[0].v;
          const rest = it.slice(1);
          const restTxt = render(trimPre(rest));
          if (isWord(rest[0], "NOT") && isWord(rest[1], "NULL")) clauses.push(`ALTER COLUMN ${col} SET NOT NULL`);
          else if (isWord(rest[0], "NULL")) clauses.push(`ALTER COLUMN ${col} DROP NOT NULL`);
          else if (isWord(rest[0], "DEFAULT")) clauses.push(`ALTER COLUMN ${col} SET ${restTxt}`);
          else {
            const nn = /\bNOT\s+NULL\b/i.test(restTxt);
            const type = restTxt.replace(/\bNOT\s+NULL\b/i, "").trim();
            clauses.push(`ALTER COLUMN ${col} TYPE ${type}`);
            if (nn) clauses.push(`ALTER COLUMN ${col} SET NOT NULL`);
          }
        }
      }
      if (verb === "MODIFY") notes.add("ALTER TABLE … MODIFY (Oracle) → ALTER TABLE … ALTER COLUMN … TYPE / SET NOT NULL (PostgreSQL).");
      if (verb === "ADD" && isPunct(out[verbAt + 1], "(")) notes.add("Oracle's ALTER TABLE … ADD (col type, …) → one ADD COLUMN clause per column in PostgreSQL.");
      out = [...out.slice(0, verbAt), ...toks(clauses.join(", ")), ...out.slice(tailStart)];
    }
  }
  return out;
}
