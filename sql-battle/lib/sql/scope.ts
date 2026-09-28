import { Tok, depths, isPunct, isWord } from "./tokenize";

/**
 * A SELECT "scope" is one query block: from its SELECT keyword up to the end of
 * the enclosing parentheses, a set operator at the same depth, or the end of
 * the statement.
 */
export interface Scope {
  start: number; // index of SELECT
  end: number; // exclusive
  depth: number;
}

const SET_OPS = ["UNION", "INTERSECT", "EXCEPT", "MINUS"];

export function findScopes(ts: Tok[]): Scope[] {
  const d = depths(ts);
  const scopes: Scope[] = [];
  ts.forEach((t, i) => {
    if (!isWord(t, "SELECT")) return;
    const depth = d[i];
    let end = ts.length;
    for (let j = i + 1; j < ts.length; j++) {
      if (d[j] < depth) {
        end = j;
        break;
      }
      if (d[j] === depth && (isWord(ts[j], ...SET_OPS) || isPunct(ts[j], ";"))) {
        end = j;
        break;
      }
      // A closing paren at our depth ends the scope (e.g. "(SELECT ...)")
      if (d[j] === depth - 1) {
        end = j;
        break;
      }
    }
    scopes.push({ start: i, end, depth });
  });
  return scopes;
}

export type ClauseName =
  | "SELECT"
  | "FROM"
  | "WHERE"
  | "START"
  | "CONNECT"
  | "GROUP"
  | "HAVING"
  | "ORDER"
  | "FETCH"
  | "OFFSET"
  | "LIMIT"
  | "FOR"
  | "WINDOW";

export interface Clause {
  name: ClauseName;
  /** index of the keyword */
  at: number;
  /** index of the first token of the clause body */
  body: number;
  /** exclusive end of the clause body */
  end: number;
}

/** Locate the top-level clauses of a scope (indices are absolute). */
export function clausesOf(ts: Tok[], scope: Scope): Clause[] {
  const d = depths(ts);
  const found: { name: ClauseName; at: number; body: number }[] = [];
  for (let i = scope.start; i < scope.end; i++) {
    if (d[i] !== scope.depth || ts[i].t !== "word") continue;
    const u = ts[i].u;
    const nx = ts[i + 1];
    if (u === "SELECT" && i === scope.start) found.push({ name: "SELECT", at: i, body: i + 1 });
    else if (u === "FROM") found.push({ name: "FROM", at: i, body: i + 1 });
    else if (u === "WHERE") found.push({ name: "WHERE", at: i, body: i + 1 });
    else if (u === "START" && isWord(nx, "WITH")) found.push({ name: "START", at: i, body: i + 2 });
    else if (u === "CONNECT" && isWord(nx, "BY")) {
      const nocycle = isWord(ts[i + 2], "NOCYCLE") ? 1 : 0;
      found.push({ name: "CONNECT", at: i, body: i + 2 + nocycle });
    } else if (u === "GROUP" && isWord(nx, "BY")) found.push({ name: "GROUP", at: i, body: i + 2 });
    else if (u === "HAVING") found.push({ name: "HAVING", at: i, body: i + 1 });
    else if (u === "ORDER" && isWord(nx, "BY")) found.push({ name: "ORDER", at: i, body: i + 2 });
    else if (u === "ORDER" && isWord(nx, "SIBLINGS") && isWord(ts[i + 2], "BY"))
      found.push({ name: "ORDER", at: i, body: i + 3 });
    else if (u === "FETCH" && isWord(nx, "FIRST", "NEXT")) found.push({ name: "FETCH", at: i, body: i + 1 });
    else if (u === "OFFSET") found.push({ name: "OFFSET", at: i, body: i + 1 });
    else if (u === "LIMIT") found.push({ name: "LIMIT", at: i, body: i + 1 });
    else if (u === "FOR" && isWord(nx, "UPDATE")) found.push({ name: "FOR", at: i, body: i + 1 });
    else if (u === "WINDOW") found.push({ name: "WINDOW", at: i, body: i + 1 });
  }
  return found.map((c, k) => ({ ...c, end: k + 1 < found.length ? found[k + 1].at : scope.end }));
}

export function clause(cs: Clause[], name: ClauseName): Clause | undefined {
  return cs.find((c) => c.name === name);
}
