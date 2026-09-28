/**
 * Turns database errors into coaching: a plain-English explanation and, in
 * Oracle mode, the ORA- error Oracle would have raised for the same mistake.
 */
import type { Dialect } from "../dialect/lint";

export interface Tutoring {
  title: string;
  explain: string;
  oracle?: string;
}

const RULES: { code: string; match?: RegExp; title: string; explain: string; oracle: string | ((m: string) => string) }[] = [
  { code: "42601", match: /at end of input/, title: "Unfinished statement", explain: "The statement stopped before it was complete — a clause, expression or closing parenthesis is missing at the end.", oracle: "ORA-00921: unexpected end of SQL command" },
  { code: "42601", title: "Syntax error", explain: "The parser hit a word or symbol it did not expect. Check keyword order: SELECT … FROM … WHERE … GROUP BY … HAVING … ORDER BY, and look for missing commas or parentheses near the reported spot.", oracle: "ORA-00933: SQL command not properly ended" },
  { code: "42P01", title: "Unknown table", explain: "That table (or view) does not exist. Check the spelling against the schema explorer — and remember a CTE is only visible inside the statement that defines it.", oracle: "ORA-00942: table or view does not exist" },
  { code: "42703", title: "Unknown column", explain: "A column name does not exist in the tables you are selecting from. Check the spelling, the table alias, and that the column belongs to a table in your FROM clause. A column alias from SELECT cannot be used in WHERE.", oracle: (m) => `ORA-00904: ${(/column "?([\w.]+)"? does not exist/.exec(m)?.[1] ?? "column").toUpperCase()}: invalid identifier` },
  { code: "42702", title: "Ambiguous column", explain: "Two joined tables both have a column with this name. Prefix it with a table alias, e.g. e.dept_id instead of dept_id.", oracle: "ORA-00918: column ambiguously defined" },
  { code: "42803", title: "GROUP BY violation", explain: "When a query aggregates, every selected column must either be inside an aggregate (SUM, COUNT, …) or listed in GROUP BY. Aggregates are also not allowed in WHERE — filter groups with HAVING.", oracle: (m) => (/aggregate functions are not allowed in WHERE/.test(m) ? "ORA-00934: group function is not allowed here" : "ORA-00979: not a GROUP BY expression") },
  { code: "42883", title: "Unknown function or operator", explain: "No function or operator matches these argument types. The name may belong to the other dialect, or you may need an explicit CAST.", oracle: "ORA-00904: invalid identifier" },
  { code: "42804", title: "Type mismatch", explain: "Two values of incompatible types were combined (for example text compared with a number, or CASE branches returning different types). Use CAST to align them.", oracle: "ORA-00932: inconsistent datatypes" },
  { code: "22012", title: "Division by zero", explain: "A divisor evaluated to zero. Guard with NULLIF(divisor, 0) so the result becomes NULL instead of an error.", oracle: "ORA-01476: divisor is equal to zero" },
  { code: "23505", title: "Duplicate key", explain: "The row would duplicate a PRIMARY KEY or UNIQUE value. Use a new key, or an upsert (MERGE / ON CONFLICT) to update the existing row instead.", oracle: "ORA-00001: unique constraint violated" },
  { code: "23502", title: "NOT NULL violated", explain: "A required column was left NULL. Provide a value or check the column list of your INSERT.", oracle: "ORA-01400: cannot insert NULL" },
  { code: "23503", match: /update or delete/, title: "Row is still referenced", explain: "Other rows point at this one through a FOREIGN KEY. Delete or re-point the children first, or define the key with ON DELETE CASCADE / SET NULL.", oracle: "ORA-02292: integrity constraint violated - child record found" },
  { code: "23503", title: "Parent key not found", explain: "The FOREIGN KEY value you used does not exist in the parent table.", oracle: "ORA-02291: integrity constraint violated - parent key not found" },
  { code: "23514", title: "CHECK constraint violated", explain: "The row breaks a CHECK rule defined on the table (for example salary > 0).", oracle: "ORA-02290: check constraint violated" },
  { code: "21000", title: "Subquery returned more than one row", explain: "A scalar subquery (used like a single value, e.g. after =) returned several rows. Use IN / EXISTS, or aggregate the subquery to one value.", oracle: "ORA-01427: single-row subquery returns more than one row" },
  { code: "22P02", title: "Invalid value for type", explain: "A string could not be converted to the column's type (for example 'abc' into a number or a malformed date).", oracle: "ORA-01722: invalid number" },
  { code: "22007", title: "Invalid date/time", explain: "A date or time literal could not be parsed. Use ISO format: DATE '2024-03-31'.", oracle: "ORA-01861: literal does not match format string" },
  { code: "22008", title: "Date out of range", explain: "A date or time value is outside the valid range (for example February 30).", oracle: "ORA-01839: date not valid for month specified" },
  { code: "42P07", title: "Object already exists", explain: "Something with that name already exists. Drop it first or choose another name.", oracle: "ORA-00955: name is already used by an existing object" },
  { code: "42P10", title: "Invalid reference", explain: "An ORDER BY or GROUP BY position/expression is not valid here. With DISTINCT, ORDER BY columns must appear in the select list.", oracle: "ORA-01791: not a SELECTed expression" },
  { code: "42P20", title: "Window function misuse", explain: "Window functions cannot appear in WHERE or GROUP BY — they run after those clauses. Compute the window in a subquery or CTE, then filter the outer query.", oracle: "ORA-30483: window functions are not allowed here" },
  { code: "25P02", title: "Transaction aborted", explain: "An earlier statement in this transaction failed, so PostgreSQL ignores everything until ROLLBACK (or ROLLBACK TO SAVEPOINT). Oracle behaves differently: it rolls back only the failed statement and keeps the transaction open.", oracle: "(no Oracle equivalent — Oracle uses statement-level rollback)" },
  { code: "25001", title: "Transaction already running", explain: "SET TRANSACTION must be the first statement of a transaction.", oracle: "ORA-01453: SET TRANSACTION must be first statement of transaction" },
  { code: "3B001", title: "Unknown savepoint", explain: "ROLLBACK TO names a savepoint that does not exist in the current transaction.", oracle: "ORA-01086: savepoint never established in this session or is invalid" },
  { code: "57014", title: "Query cancelled", explain: "The statement ran too long and was stopped. Look for a missing join condition (Cartesian product) or a recursive CTE without a stop condition.", oracle: "ORA-01013: user requested cancel of current operation" },
  { code: "0A000", title: "Not supported", explain: "This feature is not supported in this form.", oracle: "ORA-03001: unimplemented feature" },
  { code: "42P19", title: "Invalid recursion", explain: "A recursive CTE must be: anchor query UNION ALL a recursive query that references the CTE exactly once.", oracle: "ORA-32040: recursive WITH clause must use a UNION ALL operation" },
  { code: "42P22", title: "Collation problem", explain: "The comparison mixes text with different collations.", oracle: "ORA-12704: character set mismatch" },
  { code: "42809", title: "Wrong object type", explain: "The statement targeted the wrong kind of object (for example REFRESH on a normal view).", oracle: "ORA-00942: table or view does not exist" },
  { code: "55000", title: "Object not in required state", explain: "The object is not ready for this operation (for example currval before nextval in this session).", oracle: "ORA-08002: sequence CURRVAL is not yet defined in this session" },
];

export function tutor(code: string | undefined, message: string, dialect: Dialect): Tutoring {
  const rule = RULES.find((r) => r.code === code && (!r.match || r.match.test(message)));
  if (!rule) {
    return { title: "Query failed", explain: "The database rejected the statement. Read the message below closely — it usually names the exact word or object at fault." };
  }
  const oracle = typeof rule.oracle === "function" ? rule.oracle(message) : rule.oracle;
  return { title: rule.title, explain: rule.explain, oracle: dialect === "oracle" ? oracle : undefined };
}
