import type { Dialect } from "./types";

/**
 * Spell cards: clause templates the player can click (inserted as a snippet
 * with tab-through fields) or drag straight into the editor. `${name}` marks a
 * field. Cards unlock with the chapter that teaches them.
 */
export interface Spell {
  id: string;
  label: string;
  group: "Core" | "Filter" | "Join" | "Aggregate" | "Subquery" | "Write" | "Txn" | "DDL" | "Window" | "CTE" | "Pro";
  chapter: number;
  desc: string;
  tpl: Record<Dialect, string>;
}

const s = (id: string, label: string, group: Spell["group"], chapter: number, desc: string, pg: string, ora?: string): Spell => ({ id, label, group, chapter, desc, tpl: { postgres: pg, oracle: ora ?? pg } });

export const SPELLS: Spell[] = [
  s("select", "SELECT", "Core", 1, "Pick columns from a table", "SELECT ${columns}\nFROM ${table}"),
  s("where", "WHERE", "Core", 1, "Keep rows matching a condition", "\nWHERE ${condition}"),
  s("order", "ORDER BY", "Core", 1, "Sort the result", "\nORDER BY ${column} DESC"),
  s("distinct", "DISTINCT", "Core", 1, "Remove duplicate rows", "SELECT DISTINCT ${column}\nFROM ${table}"),
  s("alias", "AS alias", "Core", 1, "Name a computed column", " AS ${name}"),
  s("topn", "Top-N", "Core", 1, "First n rows", "\nFETCH FIRST ${n} ROWS ONLY", "\nFETCH FIRST ${n} ROWS ONLY"),
  s("and", "AND", "Filter", 1, "Both conditions", " AND ${condition}"),
  s("in", "IN (…)", "Filter", 1, "Match a list", "${column} IN (${a}, ${b})"),
  s("between", "BETWEEN", "Filter", 1, "Inclusive range", "${column} BETWEEN ${low} AND ${high}"),
  s("like", "LIKE", "Filter", 1, "Pattern match (% any, _ one)", "${column} LIKE '%${text}%'"),
  s("isnull", "IS NULL", "Filter", 1, "Test for missing values", "${column} IS NULL"),
  s("nullfn", "COALESCE / NVL", "Filter", 3, "Replace NULL with a default", "COALESCE(${column}, ${default})", "NVL(${column}, ${default})"),
  s("join", "JOIN … ON", "Join", 2, "Inner join on a key", "\nJOIN ${table} ${t} ON ${t}.${key} = ${other}.${key}"),
  s("left", "LEFT JOIN", "Join", 2, "Keep all rows from the left", "\nLEFT JOIN ${table} ${t} ON ${t}.${key} = ${other}.${key}"),
  s("full", "FULL JOIN", "Join", 2, "Keep unmatched rows from both sides", "\nFULL OUTER JOIN ${table} ${t} ON ${t}.${key} = ${other}.${key}"),
  s("count", "COUNT(*)", "Aggregate", 3, "Count rows per group", "COUNT(*) AS ${name}"),
  s("sum", "SUM / AVG", "Aggregate", 3, "Total or average", "SUM(${column}) AS ${name}"),
  s("group", "GROUP BY", "Aggregate", 3, "One row per group", "\nGROUP BY ${columns}"),
  s("having", "HAVING", "Aggregate", 3, "Filter groups", "\nHAVING COUNT(*) > ${n}"),
  s("case", "CASE", "Aggregate", 3, "If/else as a value", "CASE WHEN ${condition} THEN ${a} ELSE ${b} END"),
  s("insub", "IN (SELECT)", "Subquery", 4, "Membership in a query result", "${column} IN (SELECT ${column} FROM ${table} WHERE ${condition})"),
  s("exists", "EXISTS", "Subquery", 4, "True if the subquery finds a row", "EXISTS (SELECT 1 FROM ${table} x WHERE x.${key} = ${outer}.${key})"),
  s("scalar", "(SELECT AVG)", "Subquery", 4, "Single value from a subquery", "(SELECT AVG(${column}) FROM ${table})"),
  s("insert", "INSERT", "Write", 5, "Add rows", "INSERT INTO ${table} (${columns})\nVALUES (${values})"),
  s("update", "UPDATE", "Write", 5, "Change rows", "UPDATE ${table}\nSET ${column} = ${value}\nWHERE ${condition}"),
  s("delete", "DELETE", "Write", 5, "Remove rows", "DELETE FROM ${table}\nWHERE ${condition}"),
  s(
    "upsert",
    "UPSERT",
    "Write",
    5,
    "Insert or update in one statement",
    "INSERT INTO ${table} (${key}, ${column})\nVALUES (${k}, ${v})\nON CONFLICT (${key}) DO UPDATE SET ${column} = EXCLUDED.${column}",
    "MERGE INTO ${table} t\nUSING (SELECT ${k} AS ${key}, ${v} AS ${column} FROM dual) s\nON (t.${key} = s.${key})\nWHEN MATCHED THEN UPDATE SET t.${column} = s.${column}\nWHEN NOT MATCHED THEN INSERT (${key}, ${column}) VALUES (s.${key}, s.${column})",
  ),
  s("begin", "BEGIN", "Txn", 6, "Start a transaction (Oracle: implicit)", "BEGIN;\n", "-- Oracle starts transactions implicitly\n"),
  s("commit", "COMMIT", "Txn", 6, "Make changes permanent", "COMMIT;"),
  s("rollback", "ROLLBACK", "Txn", 6, "Discard changes", "ROLLBACK;"),
  s("savepoint", "SAVEPOINT", "Txn", 6, "Mark a partial-rollback point", "SAVEPOINT ${name};"),
  s("forupdate", "FOR UPDATE", "Txn", 6, "Lock selected rows", "\nFOR UPDATE"),
  s("create", "CREATE TABLE", "DDL", 7, "Define a table", "CREATE TABLE ${name} (\n  ${id} INTEGER PRIMARY KEY,\n  ${column} VARCHAR(60) NOT NULL\n)", "CREATE TABLE ${name} (\n  ${id} NUMBER(10) PRIMARY KEY,\n  ${column} VARCHAR2(60) NOT NULL\n)"),
  s("alter", "ALTER TABLE", "DDL", 7, "Change a table", "ALTER TABLE ${table} ADD COLUMN ${column} VARCHAR(40)", "ALTER TABLE ${table} ADD (${column} VARCHAR2(40))"),
  s("fk", "REFERENCES", "DDL", 7, "Foreign key", " REFERENCES ${table} (${key})"),
  s("check", "CHECK", "DDL", 7, "Validation rule", " CHECK (${condition})"),
  s("view", "CREATE VIEW", "DDL", 7, "Store a query", "CREATE VIEW ${name} AS\nSELECT ${columns}\nFROM ${table}"),
  s("identity", "IDENTITY", "DDL", 7, "Auto-numbered key", "${id} INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY", "${id} NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY"),
  s("rownum", "ROW_NUMBER", "Window", 8, "Number rows in each partition", "ROW_NUMBER() OVER (PARTITION BY ${group} ORDER BY ${column} DESC) AS rn"),
  s("rank", "RANK", "Window", 8, "Rank with ties", "RANK() OVER (ORDER BY ${column} DESC) AS rnk"),
  s("running", "Running SUM", "Window", 8, "Cumulative total", "SUM(${column}) OVER (ORDER BY ${order}) AS running_total"),
  s("lag", "LAG", "Window", 8, "Value from the previous row", "LAG(${column}) OVER (ORDER BY ${order})"),
  s("partsum", "SUM OVER", "Window", 8, "Partition total on every row", "SUM(${column}) OVER (PARTITION BY ${group})"),
  s("cte", "WITH", "CTE", 9, "Named subquery", "WITH ${name} AS (\n  SELECT ${columns} FROM ${table}\n)\nSELECT * FROM ${name}"),
  s(
    "recursive",
    "Recursive",
    "CTE",
    9,
    "Walk a hierarchy",
    "WITH RECURSIVE tree AS (\n  SELECT ${id}, 1 AS lvl FROM ${table} WHERE ${parent} IS NULL\n  UNION ALL\n  SELECT c.${id}, t.lvl + 1 FROM ${table} c JOIN tree t ON c.${parent} = t.${id}\n)\nSELECT * FROM tree",
    "SELECT ${id}, LEVEL AS lvl\nFROM ${table}\nSTART WITH ${parent} IS NULL\nCONNECT BY PRIOR ${id} = ${parent}",
  ),
  s("gen", "Row generator", "CTE", 9, "Make n rows", "SELECT n FROM generate_series(1, ${n}) AS n", "SELECT LEVEL AS n FROM dual CONNECT BY LEVEL <= ${n}"),
  s("index", "CREATE INDEX", "Pro", 10, "Speed up lookups", "CREATE INDEX ${name} ON ${table} (${column})"),
  s("explain", "EXPLAIN", "Pro", 10, "Show the execution plan", "EXPLAIN ", "EXPLAIN PLAN FOR "),
  s("json", "JSON value", "Pro", 10, "Read a JSON field", "${column}->>'${key}'", "JSON_VALUE(${column}, '$.${key}')"),
  s("pivot", "PIVOT", "Pro", 10, "Rows into columns", "COUNT(*) FILTER (WHERE ${column} = '${value}') AS ${name}", "PIVOT (COUNT(*) FOR ${column} IN ('${value}' AS ${name}))"),
  s("mview", "MATERIALIZED", "Pro", 10, "Stored query result", "CREATE MATERIALIZED VIEW ${name} AS\nSELECT ${columns}\nFROM ${table}"),
];

/** Plain text for drag-and-drop (fields become their names). */
export function plainTemplate(tpl: string): string {
  return tpl.replace(/\$\{([^}]*)\}/g, "$1");
}
