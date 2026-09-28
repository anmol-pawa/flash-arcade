/**
 * Dialect linting. Two jobs:
 *  - Oracle mode: reject PostgreSQL-only syntax *before* running, with the
 *    error Oracle would actually raise (so learners meet real ORA- codes).
 *  - Either mode: explain "you wrote the other dialect" when a query fails.
 */
import { Tok, isPunct, isWord, tokenize } from "../sql/tokenize";
import { DialectError } from "./errors";

export type Dialect = "postgres" | "oracle";

export interface DialectHint {
  found: string;
  message: string;
}

/** Throw a DialectError if `sql` uses PostgreSQL-only syntax that Oracle rejects. */
export function lintOracle(sql: string): string[] {
  const ts = tokenize(sql);
  const notes: string[] = [];
  const fail = (code: string, msg: string, hint: string): never => {
    throw new DialectError(code, `${code}: ${msg}`, hint);
  };

  let inFrom = false;
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    const nx = ts[i + 1];
    const pv = ts[i - 1];

    if (isWord(t, "FROM", "JOIN")) inFrom = true;
    else if (isWord(t, "WHERE", "GROUP", "ORDER", "HAVING", "ON", "USING", "SET", "VALUES", "SELECT", "CONNECT", "START", "PIVOT")) inFrom = false;

    if (isWord(t, "LIMIT") && (nx?.t === "number" || isWord(nx, "ALL"))) {
      fail("ORA-00933", "SQL command not properly ended", "Oracle has no LIMIT clause. Use FETCH FIRST n ROWS ONLY (12c+) or the classic WHERE ROWNUM <= n.");
    }
    if (t.t === "op" && t.v === "::") {
      fail("ORA-00911", "invalid character", "The :: cast is PostgreSQL-only. Use the ANSI form CAST(expr AS type), which Oracle understands.");
    }
    if (isWord(t, "ILIKE")) {
      fail("ORA-00920", "invalid relational operator", "ILIKE is PostgreSQL-only. For a case-insensitive match in Oracle write UPPER(col) LIKE UPPER('pattern').");
    }
    if (isWord(t, "ON") && isWord(nx, "CONFLICT")) {
      fail("ORA-00933", "SQL command not properly ended", "INSERT … ON CONFLICT is PostgreSQL's upsert. Oracle uses MERGE INTO … USING … ON (…) WHEN MATCHED / WHEN NOT MATCHED.");
    }
    if (isWord(t, "RETURNING") && !isWord(ts[i + 2], "INTO") && !isPunct(pv, "(") && !ts.slice(0, i).some((x) => isWord(x, "JSON_VALUE", "JSON_QUERY", "CAST"))) {
      fail("ORA-00933", "SQL command not properly ended", "Oracle only supports RETURNING … INTO inside PL/SQL. In plain SQL, run a SELECT after the DML to see the changed rows.");
    }
    if (isWord(t, "SERIAL", "BIGSERIAL", "SMALLSERIAL")) {
      fail("ORA-00902", "invalid datatype", "SERIAL is PostgreSQL shorthand. In Oracle use NUMBER GENERATED ALWAYS AS IDENTITY (12c+) or a SEQUENCE.");
    }
    if (isWord(t, "TEXT") && ts.some((x) => isWord(x, "CREATE", "ALTER")) && (isPunct(nx, ",") || isPunct(nx, ")") || isWord(nx, "NOT", "DEFAULT", "NULL", "PRIMARY", "UNIQUE", "CHECK"))) {
      fail("ORA-00902", "invalid datatype", "Oracle has no TEXT type. Use VARCHAR2(n) for short strings or CLOB for large text.");
    }
    if (isWord(t, "STRING_AGG", "ARRAY_AGG", "GENERATE_SERIES", "DATE_TRUNC", "NOW", "STRPOS", "POSITION", "SUBSTRING", "AGE", "ARRAY") && isPunct(nx, "(")) {
      const alt: Record<string, string> = {
        STRING_AGG: "LISTAGG(col, ',') WITHIN GROUP (ORDER BY …)",
        ARRAY_AGG: "COLLECT or LISTAGG",
        GENERATE_SERIES: "SELECT LEVEL FROM dual CONNECT BY LEVEL <= n",
        DATE_TRUNC: "TRUNC(date, 'MM')",
        NOW: "SYSDATE or SYSTIMESTAMP",
        STRPOS: "INSTR(str, sub)",
        POSITION: "INSTR(str, sub)",
        SUBSTRING: "SUBSTR(str, start, len)",
        AGE: "MONTHS_BETWEEN(a, b) or a - b (days)",
        ARRAY: "a nested table / VARRAY type (PL/SQL)",
      };
      fail("ORA-00904", `"${t.u}": invalid identifier`, `${t.u}() is not an Oracle function. Oracle equivalent: ${alt[t.u]}.`);
    }
    if (isWord(t, "DISTINCT") && isWord(nx, "ON")) {
      fail("ORA-00923", "FROM keyword not found where expected", "DISTINCT ON is PostgreSQL-only. In Oracle use ROW_NUMBER() OVER (PARTITION BY … ORDER BY …) and keep rn = 1.");
    }
    if (isWord(t, "WITH") && isWord(nx, "RECURSIVE")) {
      fail("ORA-00905", "missing keyword", "Oracle does not use the RECURSIVE keyword: write WITH cte (col1, col2) AS (anchor UNION ALL recursive-part). The column list is required.");
    }
    if (t.t === "op" && (t.v === "->" || t.v === "->>" || t.v === "#>" || t.v === "#>>" || t.v === "@>")) {
      fail("ORA-00936", "missing expression", `The ${t.v} JSON operator is PostgreSQL-only. In Oracle use JSON_VALUE(col, '$.key') or JSON_QUERY for objects.`);
    }
    if (isWord(t, "FILTER") && isPunct(nx, "(") && isWord(ts[i + 2], "WHERE")) {
      fail("ORA-00923", "FROM keyword not found where expected", "Aggregate FILTER (WHERE …) is PostgreSQL-only. Use SUM(CASE WHEN … THEN x END) in Oracle.");
    }
    if (isWord(t, "INTERVAL") && nx?.t === "string" && !isWord(ts[i + 2], "YEAR", "MONTH", "DAY", "HOUR", "MINUTE", "SECOND")) {
      fail("ORA-01867", "the interval is invalid", "Oracle interval literals put the unit outside the quotes: INTERVAL '7' DAY, INTERVAL '3' MONTH.");
    }
    if (isWord(t, "START") && isWord(nx, "TRANSACTION")) {
      fail("ORA-00900", "invalid SQL statement", "Oracle starts transactions implicitly; there is no START TRANSACTION. Just run your DML and COMMIT or ROLLBACK.");
    }
    if (isWord(t, "BEGIN") && (i === 0 || isPunct(pv, ";")) && (isPunct(nx, ";") || !nx || isWord(nx, "TRANSACTION", "WORK"))) {
      fail("PLS-00103", 'Encountered the symbol "end-of-file"', "BEGIN starts a PL/SQL block in Oracle, not a transaction. Transactions begin automatically with the first DML statement.");
    }
    // table alias with AS is illegal in Oracle
    if (inFrom && isWord(t, "AS") && (nx?.t === "word" || nx?.t === "qident") && !isPunct(ts[i + 2], "(") && !isWord(nx, "OF")) {
      const prevIsTable = pv && (pv.t === "word" || pv.t === "qident" || isPunct(pv, ")"));
      if (prevIsTable) {
        fail("ORA-00933", "SQL command not properly ended", "Oracle does not allow AS before a table alias. Write FROM employees e (column aliases may use AS; table aliases may not).");
      }
    }
    if (isWord(t, "TRUE", "FALSE") || isWord(t, "BOOLEAN")) notes.push("BOOLEAN / TRUE / FALSE in SQL need Oracle 23ai or later.");
    if (isWord(t, "EXCEPT")) notes.push("EXCEPT needs Oracle 21c+. MINUS works in every Oracle version.");
    if (isWord(t, "IF") && isWord(nx, "EXISTS", "NOT")) notes.push("IF [NOT] EXISTS in DDL needs Oracle 23ai or later.");
  }
  if (!ts.some((t) => isWord(t, "FROM")) && ts.some((t) => isWord(t, "SELECT")) && !ts.some((t) => isWord(t, "INSERT", "UPDATE", "DELETE", "MERGE", "CREATE"))) {
    notes.push("SELECT without FROM needs Oracle 23ai; older versions require FROM DUAL.");
  }
  return [...new Set(notes)];
}

const ORACLE_ISMS: { test: (t: Tok, nx?: Tok, ts?: Tok[], i?: number) => boolean; found: string; message: string }[] = [
  { test: (t, nx) => isWord(t, "NVL") && isPunct(nx, "("), found: "NVL", message: "NVL is Oracle-only. PostgreSQL (and ANSI SQL) use COALESCE(a, b)." },
  { test: (t, nx) => isWord(t, "NVL2") && isPunct(nx, "("), found: "NVL2", message: "NVL2 is Oracle-only. Use CASE WHEN x IS NOT NULL THEN a ELSE b END." },
  { test: (t, nx) => isWord(t, "DECODE") && isPunct(nx, "("), found: "DECODE", message: "DECODE is Oracle-only. Use a CASE expression." },
  { test: (t) => isWord(t, "SYSDATE", "SYSTIMESTAMP"), found: "SYSDATE", message: "SYSDATE is Oracle-only. PostgreSQL uses CURRENT_DATE, LOCALTIMESTAMP or NOW()." },
  { test: (t) => isWord(t, "ROWNUM"), found: "ROWNUM", message: "ROWNUM is Oracle-only. PostgreSQL uses LIMIT n (or FETCH FIRST n ROWS ONLY) and ROW_NUMBER() OVER ()." },
  { test: (t) => isWord(t, "DUAL"), found: "DUAL", message: "DUAL is Oracle's dummy table. PostgreSQL lets you SELECT without a FROM clause." },
  { test: (t, nx) => isWord(t, "CONNECT") && isWord(nx, "BY"), found: "CONNECT BY", message: "CONNECT BY is Oracle's hierarchical syntax. PostgreSQL uses WITH RECURSIVE." },
  { test: (t) => isWord(t, "MINUS"), found: "MINUS", message: "MINUS is Oracle's name for EXCEPT." },
  { test: (t, nx, ts, i) => isPunct(t, "(") && nx?.v === "+" && !!ts && isPunct(ts[(i ?? 0) + 2], ")"), found: "(+)", message: "(+) is Oracle's legacy outer-join marker. Use LEFT JOIN … ON." },
  { test: (t) => isWord(t, "VARCHAR2", "NVARCHAR2", "CLOB"), found: "VARCHAR2", message: "VARCHAR2/CLOB are Oracle types. PostgreSQL uses VARCHAR(n) and TEXT." },
  { test: (t, nx) => isWord(t, "NUMBER") && isPunct(nx, "("), found: "NUMBER", message: "NUMBER(p,s) is Oracle's type. PostgreSQL uses NUMERIC(p,s) or INTEGER." },
  { test: (t, nx) => isWord(t, "LISTAGG") && isPunct(nx, "("), found: "LISTAGG", message: "LISTAGG is Oracle's string aggregation. PostgreSQL uses STRING_AGG(x, sep ORDER BY …)." },
  { test: (t, nx) => isWord(t, "INSTR") && isPunct(nx, "("), found: "INSTR", message: "INSTR is Oracle-only. PostgreSQL uses STRPOS(str, sub) or POSITION(sub IN str)." },
  { test: (t, nx) => isWord(t, "ADD_MONTHS", "MONTHS_BETWEEN") && isPunct(nx, "("), found: "ADD_MONTHS", message: "Oracle date functions: PostgreSQL uses interval arithmetic (d + INTERVAL '1 month') and AGE()." },
  { test: (t) => isWord(t, "NEXTVAL", "CURRVAL"), found: "seq.NEXTVAL", message: "seq.NEXTVAL is Oracle syntax. PostgreSQL uses nextval('seq')." },
  { test: (t, nx) => isWord(t, "PIVOT") && isPunct(nx, "("), found: "PIVOT", message: "PIVOT is Oracle/SQL Server syntax. PostgreSQL uses conditional aggregation: SUM(x) FILTER (WHERE col = 'v') or the crosstab() extension." },
];

const POSTGRES_ISMS: typeof ORACLE_ISMS = [
  { test: (t) => isWord(t, "LIMIT"), found: "LIMIT", message: "LIMIT is PostgreSQL/MySQL syntax. Oracle uses FETCH FIRST n ROWS ONLY." },
  { test: (t) => t.v === "::", found: "::", message: ":: casts are PostgreSQL-only. Use CAST(x AS type)." },
  { test: (t) => isWord(t, "ILIKE"), found: "ILIKE", message: "ILIKE is PostgreSQL-only. Use UPPER(col) LIKE UPPER(pattern)." },
  { test: (t, nx) => isWord(t, "STRING_AGG") && isPunct(nx, "("), found: "STRING_AGG", message: "STRING_AGG is PostgreSQL's name; Oracle uses LISTAGG." },
];

/** Hints for code written in the *other* dialect — shown alongside errors. */
export function detectMismatch(sql: string, dialect: Dialect): DialectHint[] {
  const ts = tokenize(sql);
  const rules = dialect === "postgres" ? ORACLE_ISMS : POSTGRES_ISMS;
  const hits = new Map<string, DialectHint>();
  ts.forEach((t, i) => {
    for (const r of rules) if (r.test(t, ts[i + 1], ts, i)) hits.set(r.found, { found: r.found, message: r.message });
  });
  return [...hits.values()];
}
