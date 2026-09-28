/**
 * Detects which SQL concepts a query uses. The battle system turns these into
 * an attack type (the flashiest concept wins) and a combo count.
 */
import { isPunct, isWord, tokenize } from "../sql/tokenize";

export type Concept =
  | "select"
  | "filter"
  | "sort"
  | "distinct"
  | "null"
  | "join"
  | "outer-join"
  | "aggregate"
  | "having"
  | "case"
  | "subquery"
  | "exists"
  | "set"
  | "dml"
  | "merge"
  | "transaction"
  | "ddl"
  | "constraint"
  | "sequence"
  | "index"
  | "view"
  | "cte"
  | "recursive"
  | "window"
  | "json"
  | "pivot"
  | "explain"
  | "functions";

export type AttackKind =
  | "bolt"
  | "chain"
  | "slam"
  | "mirror"
  | "summon"
  | "blade"
  | "fusion"
  | "shield"
  | "haste"
  | "forge"
  | "surge"
  | "storm"
  | "vortex"
  | "lance";

export interface AttackInfo {
  kind: AttackKind;
  name: string;
  color: number;
  tier: number;
}

export const ATTACKS: Record<AttackKind, AttackInfo> = {
  bolt: { kind: "bolt", name: "Filter Bolt", color: 0x5eead4, tier: 1 },
  chain: { kind: "chain", name: "Join Chain", color: 0xfbbf24, tier: 2 },
  slam: { kind: "slam", name: "Aggregate Slam", color: 0xf97316, tier: 2 },
  surge: { kind: "surge", name: "Data Surge", color: 0x60a5fa, tier: 2 },
  shield: { kind: "shield", name: "Transaction Shield", color: 0x34d399, tier: 2 },
  forge: { kind: "forge", name: "DDL Forge", color: 0xf59e0b, tier: 2 },
  mirror: { kind: "mirror", name: "Subquery Mirror", color: 0xa78bfa, tier: 3 },
  fusion: { kind: "fusion", name: "Set Fusion", color: 0xf472b6, tier: 3 },
  haste: { kind: "haste", name: "Index Haste", color: 0x22d3ee, tier: 3 },
  summon: { kind: "summon", name: "CTE Summon", color: 0x4ade80, tier: 4 },
  blade: { kind: "blade", name: "Window Blade", color: 0x38bdf8, tier: 4 },
  storm: { kind: "storm", name: "MERGE Storm", color: 0xe879f9, tier: 5 },
  vortex: { kind: "vortex", name: "Pivot Vortex", color: 0xfb7185, tier: 5 },
  lance: { kind: "lance", name: "JSON Lance", color: 0xfacc15, tier: 5 },
};

const AGG = ["COUNT", "SUM", "AVG", "MIN", "MAX", "LISTAGG", "STRING_AGG", "ARRAY_AGG", "STDDEV", "VARIANCE", "MEDIAN"];
const FUNCS = [
  "UPPER", "LOWER", "INITCAP", "SUBSTR", "SUBSTRING", "LENGTH", "TRIM", "LPAD", "RPAD", "REPLACE", "CONCAT", "ROUND", "TRUNC",
  "EXTRACT", "TO_CHAR", "TO_DATE", "TO_NUMBER", "ADD_MONTHS", "MONTHS_BETWEEN", "DATE_TRUNC", "AGE", "COALESCE", "NVL", "NVL2",
  "NULLIF", "GREATEST", "LEAST", "ABS", "MOD", "CEIL", "FLOOR", "REGEXP_LIKE", "REGEXP_REPLACE", "REGEXP_SUBSTR", "INSTR", "STRPOS",
];
const JSON_FN = ["JSON_VALUE", "JSON_QUERY", "JSON_TABLE", "JSON_EXISTS", "JSONB_EXTRACT_PATH", "JSON_OBJECT", "JSON_ARRAYAGG", "JSONB_BUILD_OBJECT", "JSON_AGG", "JSONB_AGG"];

export function detectConcepts(sql: string): Concept[] {
  const ts = tokenize(sql);
  const c = new Set<Concept>();
  ts.forEach((t, i) => {
    const nx = ts[i + 1];
    const pv = ts[i - 1];
    if (isWord(t, "SELECT")) c.add("select");
    if (isWord(t, "WHERE")) c.add("filter");
    if (isWord(t, "ORDER") && isWord(nx, "BY", "SIBLINGS")) c.add("sort");
    if (isWord(t, "FETCH", "LIMIT", "ROWNUM")) c.add("sort");
    if (isWord(t, "DISTINCT") && !isPunct(pv, "(")) c.add("distinct");
    if (isWord(t, "NULL") && isWord(pv, "IS", "NOT")) c.add("null");
    if (isWord(t, "COALESCE", "NVL", "NVL2", "NULLIF")) c.add("null");
    if (isWord(t, "JOIN")) c.add("join");
    if (isWord(t, "LEFT", "RIGHT", "FULL") && isWord(nx, "JOIN", "OUTER")) c.add("outer-join");
    if (isPunct(t, "(") && nx?.v === "+") c.add("outer-join");
    if (isWord(t, ...AGG) && isPunct(nx, "(")) c.add("aggregate");
    if (isWord(t, "GROUP") && isWord(nx, "BY")) c.add("aggregate");
    if (isWord(t, "HAVING")) c.add("having");
    if (isWord(t, "CASE", "DECODE")) c.add("case");
    if (isPunct(t, "(") && isWord(nx, "SELECT")) c.add("subquery");
    if (isWord(t, "EXISTS") && isPunct(nx, "(")) c.add("exists");
    if (isWord(t, "UNION", "INTERSECT", "EXCEPT", "MINUS")) c.add("set");
    if (isWord(t, "INSERT", "UPDATE", "DELETE") && (i === 0 || isPunct(pv, ";") || isPunct(pv, ")") || isWord(pv, "THEN"))) c.add("dml");
    if (isWord(t, "MERGE")) c.add("merge");
    if (isWord(t, "ON") && isWord(nx, "CONFLICT")) c.add("merge");
    if (isWord(t, "BEGIN", "COMMIT", "ROLLBACK", "SAVEPOINT")) c.add("transaction");
    if (isWord(t, "CREATE", "ALTER", "DROP", "TRUNCATE")) c.add("ddl");
    if (isWord(t, "PRIMARY", "FOREIGN", "REFERENCES", "CHECK", "UNIQUE", "CONSTRAINT")) c.add("constraint");
    if (isWord(t, "SEQUENCE", "NEXTVAL", "IDENTITY")) c.add("sequence");
    if (isWord(t, "INDEX")) c.add("index");
    if (isWord(t, "VIEW")) c.add("view");
    if (isWord(t, "WITH") && !isWord(pv, "START") && (nx?.t === "word" || nx?.t === "qident") && !isWord(nx, "TIME", "LOCAL", "CHECK", "READ", "NO", "DATA")) c.add("cte");
    if (isWord(t, "RECURSIVE") || (isWord(t, "CONNECT") && isWord(nx, "BY"))) c.add("recursive");
    if (isWord(t, "OVER") && (isPunct(nx, "(") || nx?.t === "word")) c.add("window");
    if (isWord(t, ...JSON_FN) || (t.t === "op" && ["->", "->>", "#>", "#>>", "@>"].includes(t.v))) c.add("json");
    if (isWord(t, "PIVOT", "UNPIVOT", "CROSSTAB") || (isWord(t, "FILTER") && isPunct(nx, "("))) c.add("pivot");
    if (isWord(t, "EXPLAIN")) c.add("explain");
    if (isWord(t, ...FUNCS) && isPunct(nx, "(")) c.add("functions");
  });
  // a recursive CTE written the Oracle way (no RECURSIVE keyword)
  const m = /\bWITH\s+(\w+)/i.exec(sql);
  if (m && c.has("cte")) {
    const rest = sql.slice(m.index + m[0].length);
    const u = rest.search(/\bUNION\s+ALL\b/i);
    if (u >= 0 && new RegExp(`\\b${m[1]}\\b`, "i").test(rest.slice(u))) c.add("recursive");
  }
  return [...c];
}

/** Attack chosen for a set of concepts: the highest-tier match wins. */
export function attackFor(concepts: Concept[]): AttackInfo {
  const has = (x: Concept) => concepts.includes(x);
  const order: [boolean, AttackKind][] = [
    [has("json"), "lance"],
    [has("pivot"), "vortex"],
    [has("merge"), "storm"],
    [has("window"), "blade"],
    [has("recursive") || has("cte"), "summon"],
    [has("index") || has("explain"), "haste"],
    [has("set"), "fusion"],
    [has("subquery") || has("exists"), "mirror"],
    [has("transaction"), "shield"],
    [has("ddl") || has("constraint") || has("view") || has("sequence"), "forge"],
    [has("dml"), "surge"],
    [has("aggregate") || has("having"), "slam"],
    [has("join") || has("outer-join"), "chain"],
  ];
  for (const [ok, k] of order) if (ok) return ATTACKS[k];
  return ATTACKS.bolt;
}

/** Concepts that count toward the combo meter (the basics don't). */
export function comboCount(concepts: Concept[]): number {
  const basic: Concept[] = ["select", "filter", "sort"];
  return concepts.filter((c) => !basic.includes(c)).length;
}

/** Statements that change state force a database reset before the next cast. */
export function isDirty(sql: string): boolean {
  const ts = tokenize(sql);
  return ts.some((t) =>
    isWord(t, "INSERT", "UPDATE", "DELETE", "MERGE", "CREATE", "ALTER", "DROP", "TRUNCATE", "COMMENT", "GRANT", "REVOKE", "SET", "RENAME", "SAVEPOINT", "BEGIN", "COMMIT", "ROLLBACK", "LOCK", "REFRESH", "VACUUM", "ANALYZE", "CALL", "DO"),
  );
}
