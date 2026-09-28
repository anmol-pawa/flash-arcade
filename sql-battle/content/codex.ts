import type { CodexEntry } from "./types";

/**
 * The Codex: the game's reference book. Entries unlock as missions are won;
 * every entry gives a definition, syntax in both dialects, how the feature is
 * used in real enterprise systems, common pitfalls, and a quick quiz.
 */
export const CODEX: CodexEntry[] = [
  /* ------------------------------------------------------------ Basics */
  {
    id: "select",
    title: "SELECT … FROM",
    category: "Basics",
    definition:
      "SELECT retrieves data. You list the columns (or expressions) you want and, in FROM, the table(s) they come from. The result is itself a table (a result set) with no guaranteed row order.",
    syntax: { postgres: "SELECT first_name, last_name\nFROM employees;", oracle: "SELECT first_name, last_name\nFROM employees;" },
    enterprise:
      "Most production SQL is reads: reports, APIs and dashboards. Teams avoid SELECT * in application code, because a new column can break consumers or waste network and memory. Explicit column lists are also what let the planner use covering indexes.",
    pitfalls: ["SELECT * in production code couples you to the table layout.", "Rows come back in no particular order unless you add ORDER BY."],
    dialectNotes: "Oracle before 23ai needs a FROM clause even for constants (SELECT 1 FROM dual). PostgreSQL lets you write SELECT 1.",
    quiz: {
      q: "Without ORDER BY, in which order are rows returned?",
      options: ["Insertion order", "Primary key order", "No guaranteed order", "Alphabetical"],
      answer: 2,
      why: "SQL tables are unordered sets. Order depends on the execution plan and can change between runs.",
    },
  },
  {
    id: "where",
    title: "WHERE",
    category: "Basics",
    definition:
      "WHERE filters rows before they reach the result. Only rows for which the condition evaluates to TRUE are kept; rows where it is FALSE or UNKNOWN (because of NULL) are discarded.",
    syntax: { postgres: "SELECT * FROM employees\nWHERE salary > 120000 AND dept_id = 20;", oracle: "SELECT * FROM employees\nWHERE salary > 120000 AND dept_id = 20;" },
    enterprise:
      "Filters decide how much data the database has to read. On large OLTP tables every API query should filter on indexed columns (a customer id, a date range) so it touches a few rows instead of millions.",
    pitfalls: ["AND binds tighter than OR, so use parentheses: a OR b AND c means a OR (b AND c).", "A column alias from SELECT can't be used in WHERE, because WHERE is evaluated first."],
    quiz: { q: "Which runs first logically?", options: ["SELECT", "WHERE", "ORDER BY", "HAVING"], answer: 1, why: "Logical order: FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY." },
  },
  {
    id: "order-by",
    title: "ORDER BY",
    category: "Basics",
    definition:
      "ORDER BY sorts the final result by one or more expressions, each ASC (default) or DESC. Later keys break ties in earlier ones. You can also control where NULLs go with NULLS FIRST / NULLS LAST.",
    syntax: { postgres: "SELECT last_name, salary FROM employees\nORDER BY salary DESC, last_name;", oracle: "SELECT last_name, salary FROM employees\nORDER BY salary DESC, last_name;" },
    enterprise:
      "Pagination (page 3 of the orders list) needs a deterministic sort, so always end with a unique tie-breaker such as the primary key. Otherwise rows can appear on two pages or on none.",
    pitfalls: ["Sorting large results is expensive; an index on the sort key can avoid the sort step.", "NULLs sort last in ascending order in both Oracle and PostgreSQL (they're treated as larger than any value)."],
    quiz: { q: "ORDER BY salary DESC puts NULL salaries where (Oracle & PostgreSQL)?", options: ["Last", "First", "Removed", "Random"], answer: 1, why: "NULL counts as larger than any value, so DESC puts it first. Add NULLS LAST to change that." },
  },
  {
    id: "distinct",
    title: "DISTINCT",
    category: "Basics",
    definition: "SELECT DISTINCT removes duplicate rows from the result. It compares entire rows, not a single column.",
    syntax: { postgres: "SELECT DISTINCT job_title FROM employees;", oracle: "SELECT DISTINCT job_title FROM employees;" },
    enterprise:
      "DISTINCT often hides a join that multiplies rows. Before adding it, check whether the join is the real problem; EXISTS is usually the correct and cheaper fix.",
    pitfalls: ["DISTINCT forces a sort or hash of the whole result.", "PostgreSQL's DISTINCT ON (col) keeps the first row per value; Oracle has no equivalent, so you use ROW_NUMBER()."],
  },
  {
    id: "null",
    title: "NULL & three-valued logic",
    category: "Basics",
    definition:
      "NULL means 'unknown or missing'. Any comparison with NULL yields UNKNOWN, a third truth value, so col = NULL is never true. Test with IS NULL / IS NOT NULL.",
    syntax: { postgres: "SELECT name FROM customers WHERE email IS NULL;", oracle: "SELECT name FROM customers WHERE email IS NULL;" },
    enterprise:
      "NULL-handling bugs are among the most common reporting defects: totals that silently drop rows, or NOT IN returning nothing. Data teams define NOT NULL constraints aggressively and COALESCE at the edges.",
    pitfalls: ["WHERE col <> 'X' also excludes NULL rows.", "In Oracle the empty string '' IS NULL. In PostgreSQL '' is a real, non-NULL value."],
    dialectNotes: "Oracle treats '' as NULL, and 'a' || NULL gives 'a'. In PostgreSQL 'a' || NULL gives NULL (use CONCAT or COALESCE).",
    quiz: { q: "NULL = NULL evaluates to…", options: ["TRUE", "FALSE", "UNKNOWN", "Error"], answer: 2, why: "Two unknown values can't be known to be equal. Use IS NOT DISTINCT FROM for NULL-safe equality." },
  },
  {
    id: "predicates",
    title: "IN, BETWEEN, LIKE",
    category: "Basics",
    definition:
      "Shorthand predicates. x IN (a, b) means x = a OR x = b. x BETWEEN lo AND hi is inclusive at both ends. LIKE matches patterns: % is any number of characters, _ is exactly one.",
    syntax: {
      postgres: "WHERE category_id IN (5, 7)\n  AND price BETWEEN 80 AND 500\n  AND name LIKE '%Monitor%'   -- or ILIKE for case-insensitive",
      oracle: "WHERE category_id IN (5, 7)\n  AND price BETWEEN 80 AND 500\n  AND UPPER(name) LIKE '%MONITOR%'",
    },
    enterprise:
      "LIKE 'abc%' (a prefix) can use a B-tree index; LIKE '%abc' can't. For real search at scale, enterprises use full-text indexes (Oracle Text, PostgreSQL tsvector) or a search engine.",
    pitfalls: ["BETWEEN with timestamps: BETWEEN '2024-01-01' AND '2024-01-31' misses 31 Jan after midnight. Use >= and <.", "Oracle has no ILIKE; compare UPPER() of both sides."],
  },
  {
    id: "expressions",
    title: "Expressions & aliases",
    category: "Basics",
    definition:
      "SELECT can compute values: arithmetic, function calls, CASE. AS gives an output column a name (an alias). Aliases can be used in ORDER BY, but not in WHERE or GROUP BY (except in PostgreSQL and Oracle 23ai, which allow GROUP BY alias).",
    syntax: { postgres: "SELECT last_name, ROUND(salary / 12, 2) AS monthly\nFROM employees ORDER BY monthly DESC;", oracle: "SELECT last_name, ROUND(salary / 12, 2) AS monthly\nFROM employees ORDER BY monthly DESC;" },
    enterprise: "Computed columns in views and reports keep business rules (tax, margin, FX conversion) in one place instead of copied into every client application.",
    pitfalls: ["Integer division: in PostgreSQL 7 / 2 = 3. Use 7 / 2.0 or cast to NUMERIC.", "Oracle table aliases must not use AS (FROM employees e); column aliases may."],
  },
  {
    id: "top-n",
    title: "Top-N: FETCH FIRST, LIMIT, ROWNUM",
    category: "Basics",
    definition:
      "Return only the first n rows of an ordered result. The SQL standard form is FETCH FIRST n ROWS ONLY (Oracle 12c+, PostgreSQL). PostgreSQL also has LIMIT; classic Oracle uses the ROWNUM pseudo-column.",
    syntax: {
      postgres: "SELECT * FROM employees ORDER BY salary DESC\nLIMIT 3;  -- or FETCH FIRST 3 ROWS ONLY",
      oracle: "SELECT * FROM employees ORDER BY salary DESC\nFETCH FIRST 3 ROWS ONLY;\n-- pre-12c:\nSELECT * FROM (SELECT * FROM employees ORDER BY salary DESC)\nWHERE ROWNUM <= 3;",
    },
    enterprise: "Paginated APIs use OFFSET/FETCH or, better at scale, keyset pagination (WHERE id > :last_seen ORDER BY id FETCH FIRST 50 ROWS ONLY), which stays fast on deep pages.",
    pitfalls: ["Oracle assigns ROWNUM before ORDER BY runs, so WHERE ROWNUM <= 3 ORDER BY x gives 3 arbitrary rows, sorted.", "FETCH FIRST 3 ROWS WITH TIES includes rows that tie with the last one."],
  },
  {
    id: "date-literals",
    title: "Dates & date literals",
    category: "Basics",
    definition:
      "Use ANSI date literals, DATE 'YYYY-MM-DD'. They are unambiguous in both databases. Range filters on dates should be half-open: >= start AND < next_start.",
    syntax: {
      postgres: "WHERE order_date >= DATE '2024-01-01'\n  AND order_date <  DATE '2024-04-01'\n-- arithmetic: order_date + INTERVAL '7 days'",
      oracle: "WHERE order_date >= DATE '2024-01-01'\n  AND order_date <  DATE '2024-04-01'\n-- arithmetic: order_date + 7, ADD_MONTHS(order_date, 1)",
    },
    enterprise: "Financial and regulatory reporting depends on exact period boundaries and time zones. Warehouses usually keep a calendar/date dimension table with fiscal periods, holidays and week numbers.",
    pitfalls: ["Oracle DATE includes a time of day; PostgreSQL DATE doesn't.", "Relying on implicit string→date conversion (NLS_DATE_FORMAT) breaks when session settings change."],
    dialectNotes: "Oracle: date + 1 adds a day, TRUNC(d, 'MM') gives the month start. PostgreSQL: d + INTERVAL '1 day', DATE_TRUNC('month', d).",
  },

  /* ------------------------------------------------------------- Joins */
  {
    id: "inner-join",
    title: "INNER JOIN",
    category: "Joins",
    definition:
      "An inner join combines rows from two tables where the ON condition is true. Rows with no match on the other side are dropped. JOIN on its own means INNER JOIN.",
    syntax: { postgres: "SELECT e.last_name, d.dept_name\nFROM employees e\nJOIN departments d ON d.dept_id = e.dept_id;", oracle: "SELECT e.last_name, d.dept_name\nFROM employees e\nJOIN departments d ON d.dept_id = e.dept_id;" },
    enterprise:
      "Normalized OLTP schemas spread each business object across many tables, so almost every read joins along foreign keys. Index those foreign-key columns — Oracle and PostgreSQL don't do it for you automatically.",
    pitfalls: ["Forgetting the ON condition (or a comma join without WHERE) gives a Cartesian product: every row × every row.", "Joining on non-unique keys multiplies rows and inflates SUMs."],
    dialectNotes: "Legacy Oracle code joins with commas and puts the join in WHERE: FROM employees e, departments d WHERE d.dept_id = e.dept_id.",
    quiz: { q: "An employee with dept_id NULL appears in an INNER JOIN to departments?", options: ["Yes, with NULLs", "No", "Only if ON uses IS NULL", "Error"], answer: 1, why: "NULL = anything is UNKNOWN, so the row has no match and is dropped." },
  },
  {
    id: "outer-join",
    title: "LEFT / RIGHT OUTER JOIN",
    category: "Joins",
    definition:
      "An outer join keeps every row of one side even when nothing matches; the missing side's columns are filled with NULL. LEFT keeps the left table, RIGHT keeps the right table.",
    syntax: {
      postgres: "SELECT d.dept_name, e.last_name\nFROM departments d\nLEFT JOIN employees e ON e.dept_id = d.dept_id;",
      oracle: "SELECT d.dept_name, e.last_name\nFROM departments d\nLEFT JOIN employees e ON e.dept_id = d.dept_id;\n-- legacy: WHERE d.dept_id = e.dept_id(+)",
    },
    enterprise: "Reports must show zeros, not missing rows: 'sales per region' should list regions with no sales. Outer joins from a dimension or master table make that happen.",
    pitfalls: [
      "A WHERE filter on the optional table (WHERE e.salary > 0) removes the NULL rows and silently turns it back into an inner join. Put such filters in ON.",
      "Oracle's (+) marker goes on the optional side and can't be combined with OR or IN.",
    ],
  },
  {
    id: "self-join",
    title: "Self join",
    category: "Joins",
    definition: "A self join joins a table to itself using two aliases. It's the classic way to relate rows in the same table, such as an employee and their manager.",
    syntax: { postgres: "SELECT e.last_name AS employee, m.last_name AS manager\nFROM employees e\nJOIN employees m ON m.emp_id = e.manager_id;", oracle: "SELECT e.last_name AS employee, m.last_name AS manager\nFROM employees e\nJOIN employees m ON m.emp_id = e.manager_id;" },
    enterprise: "Org charts, bill-of-materials, 'previous version' links and fraud checks (two transactions from the same card within minutes) all compare a table with itself.",
    pitfalls: ["An inner self join drops the top of the hierarchy (the CEO has no manager); use LEFT JOIN to keep it.", "For comparisons with the previous row, LAG() is often simpler than a self join."],
  },
  {
    id: "anti-join",
    title: "Anti-join (find the missing)",
    category: "Joins",
    definition: "An anti-join returns rows of A that have no match in B. Write it as LEFT JOIN … WHERE b.key IS NULL, or as NOT EXISTS.",
    syntax: {
      postgres: "SELECT c.name FROM customers c\nLEFT JOIN orders o ON o.customer_id = c.customer_id\nWHERE o.order_id IS NULL;",
      oracle: "SELECT c.name FROM customers c\nWHERE NOT EXISTS (SELECT 1 FROM orders o\n                  WHERE o.customer_id = c.customer_id);",
    },
    enterprise: "Data-quality and reconciliation jobs are anti-joins: invoices without payments, accounts without KYC records, records present in the source system but missing in the warehouse.",
    pitfalls: ["Test IS NULL on a column that can't be NULL in B (its primary key). Otherwise real NULLs look like 'no match'."],
  },
  {
    id: "full-join",
    title: "FULL OUTER JOIN & CROSS JOIN",
    category: "Joins",
    definition: "FULL OUTER JOIN keeps unmatched rows from both sides. CROSS JOIN pairs every row with every row (a Cartesian product) on purpose.",
    syntax: { postgres: "SELECT d.dept_name, e.last_name\nFROM departments d\nFULL OUTER JOIN employees e ON e.dept_id = d.dept_id;", oracle: "SELECT d.dept_name, e.last_name\nFROM departments d\nFULL OUTER JOIN employees e ON e.dept_id = d.dept_id;" },
    enterprise:
      "FULL JOIN is the core of reconciliation: compare yesterday's snapshot with today's, or ledger A with ledger B, and flag rows missing on either side. CROSS JOIN builds scaffolds, such as every store × every day.",
    pitfalls: ["Oracle's (+) syntax cannot express a full outer join; use the ANSI form."],
  },

  /* ------------------------------------------------------- Aggregation */
  {
    id: "aggregates",
    title: "Aggregate functions",
    category: "Aggregation",
    definition:
      "COUNT, SUM, AVG, MIN and MAX reduce many rows to one value. COUNT(*) counts rows; COUNT(col) counts non-NULL values. All the others ignore NULLs.",
    syntax: { postgres: "SELECT COUNT(*), SUM(salary), AVG(salary), MAX(hire_date)\nFROM employees;", oracle: "SELECT COUNT(*), SUM(salary), AVG(salary), MAX(hire_date)\nFROM employees;" },
    enterprise: "KPIs (revenue, active users, average basket size) are aggregates. Warehouses precompute them into summary tables and materialized views so dashboards don't rescan billions of rows.",
    pitfalls: ["SUM over zero rows returns NULL, not 0; wrap it in COALESCE/NVL.", "AVG of integers in PostgreSQL returns NUMERIC; in Oracle everything is NUMBER."],
    quiz: { q: "COUNT(commission_pct) on 10 rows where 7 are NULL returns…", options: ["10", "7", "3", "NULL"], answer: 2, why: "COUNT(col) only counts non-NULL values." },
  },
  {
    id: "group-by",
    title: "GROUP BY",
    category: "Aggregation",
    definition:
      "GROUP BY splits rows into groups that share the same values in the listed columns, then computes one output row per group. Every selected column must be grouped or aggregated.",
    syntax: { postgres: "SELECT dept_id, COUNT(*) AS headcount\nFROM employees\nGROUP BY dept_id;", oracle: "SELECT dept_id, COUNT(*) AS headcount\nFROM employees\nGROUP BY dept_id;" },
    enterprise:
      "Every 'per X' question (revenue per region, tickets per agent, errors per service) is a GROUP BY. ROLLUP and CUBE add subtotals and grand totals for finance-style reports.",
    pitfalls: ["ORA-00979 / 'must appear in the GROUP BY clause': you selected a column that is neither grouped nor aggregated.", "Grouping by a high-cardinality column (like an id) usually means the grouping key is wrong."],
    dialectNotes: "Oracle before 23ai can't GROUP BY a column alias; repeat the expression. PostgreSQL accepts aliases and ordinal positions.",
  },
  {
    id: "having",
    title: "HAVING",
    category: "Aggregation",
    definition: "HAVING filters groups after aggregation, the way WHERE filters rows before it. Conditions on aggregates (COUNT(*) > 3) must go in HAVING.",
    syntax: { postgres: "SELECT dept_id, COUNT(*) FROM employees\nGROUP BY dept_id\nHAVING COUNT(*) > 3;", oracle: "SELECT dept_id, COUNT(*) FROM employees\nGROUP BY dept_id\nHAVING COUNT(*) > 3;" },
    enterprise: "Threshold alerts ('customers with more than 5 failed payments this week', 'SKUs with fewer than 10 sales') are GROUP BY … HAVING queries run on a schedule.",
    pitfalls: ["Put row-level filters in WHERE, not HAVING. It is faster because fewer rows get grouped."],
    quiz: { q: "Where do you filter on SUM(amount) > 1000?", options: ["WHERE", "HAVING", "ON", "ORDER BY"], answer: 1, why: "Aggregates don't exist yet when WHERE runs." },
  },
  {
    id: "case",
    title: "CASE expressions",
    category: "Aggregation",
    definition:
      "CASE is SQL's if/else, returning a value. The searched form, CASE WHEN cond THEN … ELSE … END, checks conditions in order. The simple form, CASE x WHEN 1 THEN …, compares one value against each option.",
    syntax: {
      postgres: "SELECT CASE WHEN salary >= 150000 THEN 'HIGH'\n            WHEN salary >= 90000  THEN 'MID'\n            ELSE 'ENTRY' END AS band\nFROM employees;",
      oracle: "SELECT CASE WHEN salary >= 150000 THEN 'HIGH'\n            WHEN salary >= 90000  THEN 'MID'\n            ELSE 'ENTRY' END AS band\nFROM employees;\n-- legacy: DECODE(dept_id, 20, 'ENG', 'OTHER')",
    },
    enterprise: "Bucketing (age bands, risk tiers), mapping codes to labels, and conditional sums (SUM(CASE WHEN status = 'PAID' THEN amount END)) are everyday reporting patterns.",
    pitfalls: ["Without ELSE, unmatched rows return NULL.", "All branches must return compatible types."],
  },
  {
    id: "null-functions",
    title: "COALESCE, NVL, NULLIF",
    category: "Aggregation",
    definition:
      "COALESCE(a, b, …) returns the first non-NULL argument. It's ANSI SQL and works in both databases. Oracle also has NVL(a, b) and NVL2(x, a, b). NULLIF(a, b) returns NULL when a = b, which is handy for avoiding division by zero.",
    syntax: { postgres: "SELECT COALESCE(commission_pct, 0),\n       revenue / NULLIF(orders, 0)\nFROM …;", oracle: "SELECT NVL(commission_pct, 0),\n       revenue / NULLIF(orders, 0)\nFROM …;" },
    enterprise: "Default values for display, NULL-safe math in financial calculations, and merging values from several sources in priority order (COALESCE(manual_override, system_value)).",
    pitfalls: ["NVL evaluates both arguments; COALESCE stops at the first non-NULL (short-circuit).", "AVG(COALESCE(x,0)) and AVG(x) give different answers: decide which one the business means."],
  },

  /* -------------------------------------------------------- Subqueries */
  {
    id: "scalar-subquery",
    title: "Scalar subquery",
    category: "Subqueries",
    definition: "A subquery that returns exactly one row and one column can be used anywhere a single value can, such as in WHERE comparisons or in the SELECT list.",
    syntax: { postgres: "SELECT last_name FROM employees\nWHERE salary > (SELECT AVG(salary) FROM employees);", oracle: "SELECT last_name FROM employees\nWHERE salary > (SELECT AVG(salary) FROM employees);" },
    enterprise: "Comparing against a benchmark (the company average, last year's total, a configured threshold) without a separate round trip from the application.",
    pitfalls: ["If it returns more than one row: ORA-01427 / 'more than one row returned by a subquery used as an expression'."],
  },
  {
    id: "in-subquery",
    title: "IN (subquery)",
    category: "Subqueries",
    definition: "x IN (SELECT …) is true when x equals any value the subquery returns. Unlike a join, it never duplicates outer rows (it is a semi-join).",
    syntax: { postgres: "SELECT name FROM customers\nWHERE customer_id IN (SELECT customer_id FROM orders);", oracle: "SELECT name FROM customers\nWHERE customer_id IN (SELECT customer_id FROM orders);" },
    enterprise: "Selecting entities by membership: customers in a campaign segment, accounts on a watch-list, products in an active promotion.",
    pitfalls: ["NOT IN with a subquery that can return NULL returns no rows at all (see 'The NOT IN trap')."],
  },
  {
    id: "correlated-subquery",
    title: "Correlated subquery",
    category: "Subqueries",
    definition:
      "A correlated subquery references columns of the outer query, so it is logically re-evaluated for every outer row. Modern optimizers often rewrite it as a join.",
    syntax: {
      postgres: "SELECT e.last_name FROM employees e\nWHERE e.salary > (SELECT AVG(x.salary) FROM employees x\n                  WHERE x.dept_id = e.dept_id);",
      oracle: "SELECT e.last_name FROM employees e\nWHERE e.salary > (SELECT AVG(x.salary) FROM employees x\n                  WHERE x.dept_id = e.dept_id);",
    },
    enterprise: "'Compared to their peers' logic: prices above the category average, response times above the team median. Window functions (AVG() OVER (PARTITION BY …)) are often the faster rewrite.",
    pitfalls: ["It can be slow on large tables if the optimizer can't decorrelate it. Check the plan."],
  },
  {
    id: "exists",
    title: "EXISTS / NOT EXISTS",
    category: "Subqueries",
    definition:
      "EXISTS (subquery) is true if the subquery returns at least one row. The database can stop at the first match. What the subquery SELECTs is irrelevant; SELECT 1 is idiomatic.",
    syntax: { postgres: "SELECT d.dept_name FROM departments d\nWHERE EXISTS (SELECT 1 FROM employees e\n              WHERE e.dept_id = d.dept_id);", oracle: "SELECT d.dept_name FROM departments d\nWHERE EXISTS (SELECT 1 FROM employees e\n              WHERE e.dept_id = d.dept_id);" },
    enterprise: "The standard, NULL-safe way to write 'has any' and 'has none' checks, such as orders without invoices or users without MFA. Planners turn them into efficient semi-joins and anti-joins.",
    pitfalls: ["Forgetting the correlation (e.dept_id = d.dept_id) makes EXISTS true for every row."],
    quiz: { q: "Which is NULL-safe for 'products never ordered'?", options: ["NOT IN (subquery)", "NOT EXISTS (subquery)", "<> ALL (subquery)", "All of them"], answer: 1, why: "NOT IN and <> ALL return nothing if the subquery yields a NULL." },
  },
  {
    id: "not-in-null",
    title: "The NOT IN + NULL trap",
    category: "Subqueries",
    definition:
      "x NOT IN (1, 2, NULL) means x <> 1 AND x <> 2 AND x <> NULL. The last comparison is UNKNOWN, so the whole condition is never TRUE and the query returns zero rows.",
    syntax: {
      postgres: "-- dangerous if orders.customer_id can be NULL:\nSELECT * FROM customers\nWHERE customer_id NOT IN (SELECT customer_id FROM orders);",
      oracle: "-- safe:\nSELECT * FROM customers c\nWHERE NOT EXISTS (SELECT 1 FROM orders o\n                  WHERE o.customer_id = c.customer_id);",
    },
    enterprise: "A classic production incident: a nightly 'unmatched records' report suddenly returns nothing because one NULL slipped into the lookup table. Teams ban NOT IN (subquery) in code review for this reason.",
    pitfalls: ["It fails silently: there's no error, just an empty result."],
  },
  {
    id: "inline-view",
    title: "Inline views (derived tables)",
    category: "Subqueries",
    definition: "A subquery in the FROM clause acts as a temporary, unnamed table. It lets you aggregate first and then join or filter on the aggregate.",
    syntax: {
      postgres: "SELECT c.name, t.total\nFROM customers c\nJOIN (SELECT customer_id, SUM(amount) AS total\n      FROM payments GROUP BY customer_id) t\n  ON t.customer_id = c.customer_id;",
      oracle: "SELECT c.name, t.total\nFROM customers c\nJOIN (SELECT customer_id, SUM(amount) AS total\n      FROM payments GROUP BY customer_id) t\n  ON t.customer_id = c.customer_id;",
    },
    enterprise: "Pre-aggregating before joining is a key performance habit. It avoids joining millions of detail rows only to collapse them afterwards.",
    pitfalls: ["Oracle: no AS before the alias. PostgreSQL before v16 required an alias on every derived table."],
  },
  {
    id: "set-operators",
    title: "UNION, INTERSECT, EXCEPT/MINUS",
    category: "Subqueries",
    definition:
      "Set operators combine the results of two queries with the same number and types of columns. UNION removes duplicates, UNION ALL keeps them. INTERSECT keeps rows present in both. EXCEPT (Oracle: MINUS) keeps rows of the first query that aren't in the second.",
    syntax: {
      postgres: "SELECT customer_id FROM customers\nEXCEPT\nSELECT customer_id FROM orders;",
      oracle: "SELECT customer_id FROM customers\nMINUS\nSELECT customer_id FROM orders;",
    },
    enterprise: "Merging feeds from different systems (UNION ALL), and quick data diffs between environments or snapshots (EXCEPT / MINUS in both directions).",
    pitfalls: ["UNION costs a sort/dedup. Use UNION ALL when duplicates are impossible or wanted.", "Columns are matched by position, not by name."],
  },

  /* --------------------------------------------------------------- DML */
  {
    id: "insert",
    title: "INSERT",
    category: "DML",
    definition: "INSERT adds rows. Always list the target columns explicitly; columns you omit get their DEFAULT (or NULL).",
    syntax: {
      postgres: "INSERT INTO locations (location_id, city, country)\nVALUES (6, 'Toronto', 'Canada'), (7, 'Oslo', 'Norway');",
      oracle: "INSERT INTO locations (location_id, city, country)\nVALUES (6, 'Toronto', 'Canada');\n-- multi-row VALUES needs Oracle 23ai",
    },
    enterprise:
      "High-volume ingestion uses bulk paths instead of row-by-row inserts: COPY in PostgreSQL, direct-path INSERT /*+ APPEND */ or SQL*Loader in Oracle, or array binding from the application.",
    pitfalls: ["INSERT without a column list breaks as soon as someone adds a column.", "In Oracle the row isn't visible to other sessions until you COMMIT."],
  },
  {
    id: "insert-select",
    title: "INSERT … SELECT",
    category: "DML",
    definition: "Inserts the entire result of a query in one set-based statement. It's the backbone of ETL and data migration.",
    syntax: {
      postgres: "INSERT INTO accounts (account_id, customer_id, balance)\nSELECT 100 + customer_id, customer_id, 0\nFROM customers c\nWHERE NOT EXISTS (SELECT 1 FROM accounts a\n                  WHERE a.customer_id = c.customer_id);",
      oracle: "INSERT INTO accounts (account_id, customer_id, balance)\nSELECT 100 + customer_id, customer_id, 0\nFROM customers c\nWHERE NOT EXISTS (SELECT 1 FROM accounts a\n                  WHERE a.customer_id = c.customer_id);",
    },
    enterprise: "Loading staging tables into the warehouse, archiving old rows into history tables, and backfilling new features are all INSERT … SELECT, often orders of magnitude faster than application loops.",
    pitfalls: ["Re-running a non-idempotent INSERT … SELECT duplicates data. Guard it with NOT EXISTS or use MERGE."],
  },
  {
    id: "update",
    title: "UPDATE",
    category: "DML",
    definition: "UPDATE changes column values in existing rows. The WHERE clause decides which rows change, and it may contain subqueries.",
    syntax: { postgres: "UPDATE employees\nSET salary = salary * 1.05\nWHERE dept_id = 50;", oracle: "UPDATE employees\nSET salary = salary * 1.05\nWHERE dept_id = 50;" },
    enterprise: "Mass updates on hot tables lock many rows and generate lots of redo (Oracle) or WAL (PostgreSQL). Production teams batch them (for example 10k rows per commit) and run them off-peak.",
    pitfalls: ["No WHERE = every row. Run the WHERE as a SELECT first.", "PostgreSQL doesn't allow an alias on the SET target (SET e.salary = …); Oracle does."],
  },
  {
    id: "delete",
    title: "DELETE & referential integrity",
    category: "DML",
    definition:
      "DELETE removes rows that match WHERE. Foreign keys stop you from deleting parents that still have children, unless the key was declared ON DELETE CASCADE or SET NULL.",
    syntax: {
      postgres: "DELETE FROM order_items WHERE order_id IN (…);\nDELETE FROM orders WHERE status = 'CANCELLED';",
      oracle: "DELETE FROM order_items WHERE order_id IN (…);\nDELETE FROM orders WHERE status = 'CANCELLED';\nCOMMIT;",
    },
    enterprise: "Many enterprises never hard-delete business data. They soft-delete (a deleted_at column) for audit and legal retention, and purge in scheduled jobs, often by dropping whole partitions.",
    pitfalls: ["TRUNCATE is DDL: it's fast, can't have a WHERE, and in Oracle can't be rolled back.", "ON DELETE CASCADE can wipe far more than you meant."],
  },
  {
    id: "merge",
    title: "MERGE / UPSERT",
    category: "DML",
    definition:
      "An upsert inserts rows that don't exist and updates rows that do, atomically. Oracle uses MERGE (SQL:2003). PostgreSQL has INSERT … ON CONFLICT … DO UPDATE and, since v15, MERGE as well.",
    syntax: {
      postgres: "INSERT INTO products (product_id, name, price)\nVALUES (16, 'USB-C Hub', 39)\nON CONFLICT (product_id)\nDO UPDATE SET price = EXCLUDED.price;",
      oracle: "MERGE INTO products p\nUSING (SELECT 16 AS product_id, 39 AS price FROM dual) s\nON (p.product_id = s.product_id)\nWHEN MATCHED THEN UPDATE SET p.price = s.price\nWHEN NOT MATCHED THEN INSERT (product_id, price)\n  VALUES (s.product_id, s.price);",
    },
    enterprise:
      "MERGE is the workhorse of data warehousing: incremental loads, slowly changing dimensions (SCD type 1/2) and syncing master data. Upserts also make API writes idempotent.",
    pitfalls: ["ON CONFLICT needs a unique constraint or index on the conflict columns.", "If the source has duplicate keys, MERGE fails (ORA-30926 / 'command cannot affect row a second time')."],
    quiz: { q: "PostgreSQL's EXCLUDED refers to…", options: ["The existing row", "The row proposed for insertion", "Deleted rows", "A temp table"], answer: 1, why: "EXCLUDED holds the values that would have been inserted." },
  },

  /* ------------------------------------------------------ Transactions */
  {
    id: "transactions",
    title: "Transactions & ACID",
    category: "Transactions",
    definition:
      "A transaction is a unit of work that is Atomic (all or nothing), Consistent (moves from one valid state to another), Isolated (concurrent transactions don't see each other's partial work) and Durable (committed data survives crashes). COMMIT makes changes permanent; ROLLBACK discards them.",
    syntax: {
      postgres: "BEGIN;\nUPDATE accounts SET balance = balance - 500 WHERE account_id = 1;\nUPDATE accounts SET balance = balance + 500 WHERE account_id = 2;\nCOMMIT;",
      oracle: "-- no BEGIN: the first DML starts the transaction\nUPDATE accounts SET balance = balance - 500 WHERE account_id = 1;\nUPDATE accounts SET balance = balance + 500 WHERE account_id = 2;\nCOMMIT;",
    },
    enterprise:
      "Payments, inventory reservations and double-entry bookkeeping depend on atomicity. Keep transactions short: long-open transactions hold locks and, in PostgreSQL, block vacuum from cleaning up dead rows.",
    pitfalls: [
      "PostgreSQL clients (psql, most drivers) autocommit each statement unless you BEGIN. Oracle SQL*Plus doesn't autocommit, so forgetting COMMIT loses work.",
      "DDL in Oracle commits implicitly. In PostgreSQL, DDL is transactional and can be rolled back.",
    ],
    dialectNotes: "When a statement fails inside a PostgreSQL transaction, the whole transaction is aborted until ROLLBACK. Oracle rolls back only the failed statement.",
    quiz: { q: "In Oracle, you UPDATE then CREATE TABLE then ROLLBACK. The update is…", options: ["Rolled back", "Committed", "Pending", "Lost with an error"], answer: 1, why: "DDL issues an implicit COMMIT before it runs." },
  },
  {
    id: "savepoint",
    title: "SAVEPOINT",
    category: "Transactions",
    definition: "A savepoint marks a point inside a transaction. ROLLBACK TO SAVEPOINT undoes only the work done after it, and the transaction stays open.",
    syntax: {
      postgres: "BEGIN;\nUPDATE …;\nSAVEPOINT after_fees;\nUPDATE …;          -- oops\nROLLBACK TO SAVEPOINT after_fees;\nCOMMIT;",
      oracle: "UPDATE …;\nSAVEPOINT after_fees;\nUPDATE …;          -- oops\nROLLBACK TO SAVEPOINT after_fees;\nCOMMIT;",
    },
    enterprise: "Batch jobs use savepoints to skip one bad record without losing the whole batch. ORMs use them to implement nested transactions.",
    pitfalls: ["ROLLBACK (without TO) discards the entire transaction, savepoints included."],
  },
  {
    id: "isolation",
    title: "Isolation levels",
    category: "Transactions",
    definition:
      "The isolation level controls which anomalies concurrent transactions can observe: dirty reads, non-repeatable reads, phantoms, and write skew. READ COMMITTED is the default in both Oracle and PostgreSQL; SERIALIZABLE is the strictest.",
    syntax: { postgres: "BEGIN ISOLATION LEVEL SERIALIZABLE;\n…\nCOMMIT;", oracle: "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;\n…\nCOMMIT;" },
    enterprise:
      "Both databases use MVCC: readers don't block writers and writers don't block readers. SERIALIZABLE is used for invariants like 'at least one doctor on call', and the application must retry on serialization failures (ORA-08177 / SQLSTATE 40001).",
    pitfalls: ["Neither database has dirty reads, even at READ UNCOMMITTED.", "Oracle's SERIALIZABLE is snapshot isolation; PostgreSQL's (SSI) also prevents write skew."],
  },
  {
    id: "locking",
    title: "Row locks: SELECT … FOR UPDATE",
    category: "Transactions",
    definition:
      "SELECT … FOR UPDATE locks the rows it returns until the transaction ends, so other transactions can't modify them in between (pessimistic locking). NOWAIT fails immediately instead of waiting; SKIP LOCKED skips rows that are already locked.",
    syntax: { postgres: "BEGIN;\nSELECT balance FROM accounts WHERE account_id = 5 FOR UPDATE;\nUPDATE accounts SET balance = balance - 200 WHERE account_id = 5;\nCOMMIT;", oracle: "SELECT balance FROM accounts WHERE account_id = 5 FOR UPDATE;\nUPDATE accounts SET balance = balance - 200 WHERE account_id = 5;\nCOMMIT;" },
    enterprise: "Prevents lost updates in read-modify-write flows. FOR UPDATE SKIP LOCKED turns a table into a reliable job queue that many workers can consume concurrently.",
    pitfalls: ["Locking rows in different orders in two sessions causes deadlocks (ORA-00060 / 40P01).", "Optimistic locking (a version column checked in UPDATE … WHERE version = :v) scales better when conflicts are rare."],
  },

  /* --------------------------------------------------------------- DDL */
  {
    id: "create-table",
    title: "CREATE TABLE & data types",
    category: "DDL",
    definition: "CREATE TABLE defines a table's columns, their data types and their constraints. Picking the right types is the first line of data quality.",
    syntax: {
      postgres: "CREATE TABLE suppliers (\n  supplier_id INTEGER PRIMARY KEY,\n  name        VARCHAR(60) NOT NULL,\n  rating      SMALLINT CHECK (rating BETWEEN 1 AND 5),\n  created_at  TIMESTAMPTZ DEFAULT now()\n);",
      oracle: "CREATE TABLE suppliers (\n  supplier_id NUMBER(10) PRIMARY KEY,\n  name        VARCHAR2(60) NOT NULL,\n  rating      NUMBER(1) CHECK (rating BETWEEN 1 AND 5),\n  created_at  TIMESTAMP WITH TIME ZONE DEFAULT SYSTIMESTAMP\n);",
    },
    enterprise: "Schema changes go through migrations (Liquibase, Flyway) and code review. Money uses exact NUMERIC/NUMBER, never FLOAT. Timestamps are stored with time zones or in UTC.",
    pitfalls: ["Oracle VARCHAR2(60) means 60 bytes by default (60 CHAR must be explicit); PostgreSQL VARCHAR(60) means characters.", "FLOAT for currency causes rounding errors."],
    dialectNotes: "Type map: NUMBER ↔ NUMERIC/INTEGER, VARCHAR2 ↔ VARCHAR, CLOB ↔ TEXT, BLOB ↔ BYTEA, DATE (with time) ↔ TIMESTAMP.",
  },
  {
    id: "constraints",
    title: "Constraints",
    category: "DDL",
    definition:
      "Constraints are rules the database enforces on every write: PRIMARY KEY (unique and not null), FOREIGN KEY (the value must exist in the parent table), UNIQUE, NOT NULL and CHECK (a boolean rule).",
    syntax: {
      postgres: "CREATE TABLE reviews (\n  review_id  INTEGER PRIMARY KEY,\n  product_id INTEGER NOT NULL REFERENCES products (product_id),\n  stars      INTEGER CHECK (stars BETWEEN 1 AND 5)\n);",
      oracle: "CREATE TABLE reviews (\n  review_id  NUMBER PRIMARY KEY,\n  product_id NUMBER NOT NULL REFERENCES products (product_id),\n  stars      NUMBER(1) CHECK (stars BETWEEN 1 AND 5)\n);",
    },
    enterprise: "Constraints are the last line of defence: many applications and ETL jobs write to the same tables, but the database enforces the rules for all of them. Name them (CONSTRAINT fk_review_product …) so error messages mean something.",
    pitfalls: ["FK columns are not indexed automatically, so deletes on the parent can scan and lock the child table.", "Disabling constraints for a bulk load and forgetting to re-validate them lets bad data in."],
    quiz: { q: "Which constraint allows NULLs by default?", options: ["PRIMARY KEY", "UNIQUE", "NOT NULL", "None"], answer: 1, why: "A UNIQUE column may contain NULLs (multiple NULLs are allowed in both databases)." },
  },
  {
    id: "alter-table",
    title: "ALTER TABLE",
    category: "DDL",
    definition: "ALTER TABLE changes a table's structure: it adds, drops or renames columns, changes types, and adds or removes constraints.",
    syntax: {
      postgres: "ALTER TABLE customers ADD COLUMN phone VARCHAR(20);\nALTER TABLE customers ALTER COLUMN segment SET NOT NULL;",
      oracle: "ALTER TABLE customers ADD (phone VARCHAR2(20));\nALTER TABLE customers MODIFY (segment NOT NULL);",
    },
    enterprise:
      "Zero-downtime migrations use expand/contract: add a nullable column, backfill it, switch readers, then enforce NOT NULL. Some ALTERs rewrite or lock the whole table, which matters on tables with billions of rows.",
    pitfalls: ["Adding NOT NULL fails if existing rows violate it.", "In PostgreSQL, changing a column type usually rewrites the whole table under an exclusive lock."],
  },
  {
    id: "identity",
    title: "Identity columns & sequences",
    category: "DDL",
    definition:
      "A sequence is a database object that hands out unique numbers. An identity column (GENERATED ALWAYS AS IDENTITY) attaches a sequence to a column automatically. It's standard SQL in Oracle 12c+ and PostgreSQL 10+.",
    syntax: {
      postgres: "CREATE TABLE tickets (\n  ticket_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n  title VARCHAR(100) NOT NULL\n);\n-- sequences: CREATE SEQUENCE s; SELECT nextval('s');",
      oracle: "CREATE TABLE tickets (\n  ticket_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n  title VARCHAR2(100) NOT NULL\n);\n-- sequences: CREATE SEQUENCE s; SELECT s.NEXTVAL FROM dual;",
    },
    enterprise: "Surrogate keys, invoice numbers and ticket ids. Distributed systems often use UUIDs instead, to avoid a central counter.",
    pitfalls: ["Sequences have gaps (rollbacks, caching) by design. Never promise gapless invoice numbers from a sequence.", "PostgreSQL SERIAL is legacy shorthand; prefer identity columns."],
  },
  {
    id: "views",
    title: "Views",
    category: "DDL",
    definition: "A view is a named, stored query. Selecting from it runs the query; it holds no data of its own. Simple views can even be updated.",
    syntax: { postgres: "CREATE VIEW dept_payroll AS\nSELECT d.dept_name, COUNT(e.emp_id) AS headcount\nFROM departments d LEFT JOIN employees e ON e.dept_id = d.dept_id\nGROUP BY d.dept_name;", oracle: "CREATE VIEW dept_payroll AS\nSELECT d.dept_name, COUNT(e.emp_id) AS headcount\nFROM departments d LEFT JOIN employees e ON e.dept_id = d.dept_id\nGROUP BY d.dept_name;" },
    enterprise: "Views give a stable API over changing tables, hide sensitive columns (grant SELECT on the view, not the table), and put business logic like 'active customer' in one place.",
    pitfalls: ["Stacking views on views makes plans opaque and slow.", "SELECT * inside a view freezes the column list at creation time."],
  },
  {
    id: "ctas",
    title: "CREATE TABLE AS SELECT",
    category: "DDL",
    definition: "CTAS creates a new table and fills it with a query's result in one step. Column names and types come from the query; constraints and indexes do not.",
    syntax: { postgres: "CREATE TABLE delivered_orders AS\nSELECT order_id, customer_id FROM orders\nWHERE status = 'DELIVERED';", oracle: "CREATE TABLE delivered_orders AS\nSELECT order_id, customer_id FROM orders\nWHERE status = 'DELIVERED';" },
    enterprise: "Quick backups before risky changes, building reporting extracts, and the 'build new table, then swap names' pattern for huge rewrites.",
    pitfalls: ["No primary key or indexes are copied, so add them afterwards."],
  },
  {
    id: "normalization",
    title: "Normalization",
    category: "DDL",
    definition:
      "Normalization organizes tables so each fact is stored once. 1NF: atomic values. 2NF: no partial dependency on part of a composite key. 3NF: no dependency between non-key columns. It prevents update, insert and delete anomalies.",
    syntax: { postgres: "-- customers(customer_id, name, city)\n-- orders(order_id, customer_id → customers, order_date)\n-- order_items(order_id, line_no, product_id, quantity)", oracle: "-- same logical design in any relational database" },
    enterprise: "OLTP systems are normalized (usually 3NF) for write integrity. Analytics warehouses deliberately denormalize into star schemas (fact tables plus dimension tables) for fast reads.",
    pitfalls: ["Over-normalizing forces many joins on hot read paths.", "Storing comma-separated lists in a column violates 1NF and makes queries painful."],
  },

  /* --------------------------------------------------------- Analytics */
  {
    id: "window-functions",
    title: "Window functions",
    category: "Analytics",
    definition:
      "A window function computes a value over a set of rows related to the current row (its window) without collapsing them the way GROUP BY does. OVER (PARTITION BY … ORDER BY … frame) defines the window.",
    syntax: {
      postgres: "SELECT last_name, dept_id, salary,\n       SUM(salary) OVER (PARTITION BY dept_id) AS dept_total\nFROM employees;",
      oracle: "SELECT last_name, dept_id, salary,\n       SUM(salary) OVER (PARTITION BY dept_id) AS dept_total\nFROM employees;",
    },
    enterprise: "Oracle calls them analytic functions. They are the heart of reporting SQL: rankings, running balances, period-over-period growth, moving averages and sessionization, all in one pass over the data.",
    pitfalls: ["They are evaluated after WHERE/GROUP BY/HAVING, so you can't filter on them at the same level; wrap them in a subquery.", "With ORDER BY and no explicit frame, the default frame is RANGE … CURRENT ROW, which counts ties together."],
    quiz: { q: "Can you write WHERE ROW_NUMBER() OVER (…) = 1?", options: ["Yes", "No — use a subquery/CTE", "Only in Oracle", "Only in PostgreSQL"], answer: 1, why: "Window functions run after WHERE. (Oracle 23ai and some other databases add QUALIFY, but it's not portable.)" },
  },
  {
    id: "ranking",
    title: "ROW_NUMBER, RANK, DENSE_RANK",
    category: "Analytics",
    definition:
      "Ranking functions number rows inside each partition. ROW_NUMBER is always unique (1,2,3,4). RANK gives ties the same rank and leaves gaps (1,2,2,4). DENSE_RANK gives ties the same rank without gaps (1,2,2,3).",
    syntax: { postgres: "SELECT last_name, salary,\n  ROW_NUMBER() OVER (ORDER BY salary DESC) rn,\n  RANK()       OVER (ORDER BY salary DESC) rnk,\n  DENSE_RANK() OVER (ORDER BY salary DESC) drnk\nFROM employees;", oracle: "SELECT last_name, salary,\n  ROW_NUMBER() OVER (ORDER BY salary DESC) rn,\n  RANK()       OVER (ORDER BY salary DESC) rnk,\n  DENSE_RANK() OVER (ORDER BY salary DESC) drnk\nFROM employees;" },
    enterprise: "Leaderboards, 'latest record per key' deduplication (ROW_NUMBER … = 1) in ETL, and picking a primary address or contact among several.",
    pitfalls: ["ROW_NUMBER with a non-unique ORDER BY is non-deterministic. Add a tie-breaker."],
  },
  {
    id: "running-totals",
    title: "Running totals & frames",
    category: "Analytics",
    definition:
      "Adding ORDER BY inside OVER turns an aggregate into a cumulative one. Frames refine it: ROWS BETWEEN 2 PRECEDING AND CURRENT ROW gives a 3-row moving window.",
    syntax: {
      postgres: "SELECT txn_date, amount,\n  SUM(amount) OVER (ORDER BY txn_date, txn_id) AS balance,\n  AVG(amount) OVER (ORDER BY txn_date\n       ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS avg7\nFROM transactions;",
      oracle: "SELECT txn_date, amount,\n  SUM(amount) OVER (ORDER BY txn_date, txn_id) AS balance,\n  AVG(amount) OVER (ORDER BY txn_date\n       ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) AS avg7\nFROM transactions;",
    },
    enterprise: "Account balances from ledgers, cumulative revenue year-to-date, 7-day rolling averages for monitoring, and inventory positions over time.",
    pitfalls: ["If the ORDER BY has ties, the default RANGE frame adds all tied rows at once. Use a unique ordering or ROWS."],
  },
  {
    id: "lag-lead",
    title: "LAG & LEAD",
    category: "Analytics",
    definition: "LAG(expr, n, default) reads a value from n rows before the current row within the window order; LEAD reads n rows after. It removes the need for self joins when comparing with neighbouring rows.",
    syntax: { postgres: "SELECT mon, revenue,\n  revenue - LAG(revenue) OVER (ORDER BY mon) AS delta\nFROM monthly_revenue;", oracle: "SELECT mon, revenue,\n  revenue - LAG(revenue) OVER (ORDER BY mon) AS delta\nFROM monthly_revenue;" },
    enterprise: "Month-over-month growth, time between events (session gaps, SLA breaches), and detecting state changes in audit logs.",
    pitfalls: ["Missing periods produce misleading deltas. Generate a complete calendar first."],
  },
  {
    id: "top-n-per-group",
    title: "Top-N per group",
    category: "Analytics",
    definition: "Rank rows within each partition in a subquery or CTE, then filter on the rank in the outer query.",
    syntax: {
      postgres: "SELECT * FROM (\n  SELECT e.*, DENSE_RANK() OVER (PARTITION BY dept_id\n                                  ORDER BY salary DESC) r\n  FROM employees e) t\nWHERE r <= 2;",
      oracle: "SELECT * FROM (\n  SELECT e.*, DENSE_RANK() OVER (PARTITION BY dept_id\n                                  ORDER BY salary DESC) r\n  FROM employees e) t\nWHERE r <= 2;",
    },
    enterprise: "Top products per region, the latest status per shipment, the best offer per customer. It's one of the most frequently asked SQL interview patterns.",
    pitfalls: ["Choose ROW_NUMBER (exactly N), RANK or DENSE_RANK (ties included) on purpose."],
  },
  {
    id: "pivot",
    title: "Pivot (rows → columns)",
    category: "Analytics",
    definition:
      "Pivoting turns the values of one column into several columns, each holding an aggregate. Oracle has a PIVOT clause. In PostgreSQL you use conditional aggregation with FILTER (or the crosstab extension).",
    syntax: {
      postgres: "SELECT segment,\n  COUNT(*) FILTER (WHERE status = 'DELIVERED') AS delivered,\n  COUNT(*) FILTER (WHERE status = 'PENDING')   AS pending\nFROM orders JOIN customers USING (customer_id)\nGROUP BY segment;",
      oracle: "SELECT * FROM (SELECT segment, status\n               FROM orders JOIN customers USING (customer_id))\nPIVOT (COUNT(*) FOR status IN ('DELIVERED' AS delivered,\n                               'PENDING'   AS pending));",
    },
    enterprise: "Management reports and spreadsheet-style exports (months as columns, statuses as columns). SUM(CASE WHEN …) is the portable form that works in every database.",
    pitfalls: ["The column list is fixed when the SQL is written. Dynamic pivots need dynamic SQL."],
  },

  /* ------------------------------------------------------- Hierarchies */
  {
    id: "cte",
    title: "Common Table Expressions (WITH)",
    category: "Hierarchies",
    definition: "WITH name AS (query) defines a named subquery that exists for one statement. CTEs make complex SQL readable as a pipeline of named steps, and a CTE can be referenced more than once.",
    syntax: {
      postgres: "WITH dept_totals AS (\n  SELECT dept_id, SUM(salary) AS total\n  FROM employees GROUP BY dept_id\n)\nSELECT * FROM dept_totals\nWHERE total > (SELECT AVG(total) FROM dept_totals);",
      oracle: "WITH dept_totals AS (\n  SELECT dept_id, SUM(salary) AS total\n  FROM employees GROUP BY dept_id\n)\nSELECT * FROM dept_totals\nWHERE total > (SELECT AVG(total) FROM dept_totals);",
    },
    enterprise: "Long analytical queries in dbt models, reports and data-quality checks are written as chains of CTEs, so each step can be reviewed and tested on its own.",
    pitfalls: ["PostgreSQL ≤ 11 always materialized CTEs, which acted as an optimization fence; 12+ inlines them unless you write MATERIALIZED."],
  },
  {
    id: "recursive-cte",
    title: "Recursive CTEs",
    category: "Hierarchies",
    definition:
      "A recursive CTE has an anchor query UNION ALL a recursive query that references the CTE itself. The database repeats the recursive part, feeding each round the rows produced by the previous one, until no new rows appear.",
    syntax: {
      postgres: "WITH RECURSIVE org AS (\n  SELECT emp_id, 1 AS lvl FROM employees WHERE manager_id IS NULL\n  UNION ALL\n  SELECT e.emp_id, o.lvl + 1\n  FROM employees e JOIN org o ON e.manager_id = o.emp_id\n)\nSELECT * FROM org;",
      oracle: "WITH org (emp_id, lvl) AS (   -- no RECURSIVE keyword; column list required\n  SELECT emp_id, 1 FROM employees WHERE manager_id IS NULL\n  UNION ALL\n  SELECT e.emp_id, o.lvl + 1\n  FROM employees e JOIN org o ON e.manager_id = o.emp_id\n)\nSELECT * FROM org;",
    },
    enterprise: "Org charts, bills of materials (which parts make up this aircraft?), category trees, network and dependency graphs, and approval chains.",
    pitfalls: ["Cyclic data loops forever. Track visited nodes or use the CYCLE clause (both databases support it).", "Use UNION ALL, not UNION, unless you really need deduplication at every step."],
  },
  {
    id: "connect-by",
    title: "Oracle CONNECT BY",
    category: "Hierarchies",
    definition:
      "Oracle's proprietary hierarchical query syntax. START WITH picks the root rows; CONNECT BY PRIOR parent = child links each row to its parent. Pseudo-columns: LEVEL (depth), SYS_CONNECT_BY_PATH (path string), CONNECT_BY_ROOT (value from the root), CONNECT_BY_ISLEAF.",
    syntax: {
      postgres: "-- PostgreSQL has no CONNECT BY: use WITH RECURSIVE",
      oracle: "SELECT LPAD(' ', 2 * (LEVEL - 1)) || last_name AS org,\n       SYS_CONNECT_BY_PATH(last_name, '/') AS path\nFROM employees\nSTART WITH manager_id IS NULL\nCONNECT BY PRIOR emp_id = manager_id\nORDER SIBLINGS BY last_name;",
    },
    enterprise: "You'll find it throughout legacy Oracle applications (E-Business Suite, PeopleSoft). Migrating to PostgreSQL means rewriting it as recursive CTEs, which Query Clash's transpiler does for you here.",
    pitfalls: ["PRIOR's position sets the direction: PRIOR emp_id = manager_id walks down, PRIOR manager_id = emp_id walks up.", "Cycles raise ORA-01436 unless you add NOCYCLE."],
  },
  {
    id: "row-generators",
    title: "Row generators & calendars",
    category: "Hierarchies",
    definition: "To report on values that aren't in the data (empty months, missing ids), generate them first and LEFT JOIN the facts onto them.",
    syntax: {
      postgres: "SELECT d::date FROM generate_series(DATE '2024-01-01',\n                                   DATE '2024-12-31',\n                                   INTERVAL '1 day') AS d;",
      oracle: "SELECT DATE '2024-01-01' + LEVEL - 1 AS d\nFROM dual\nCONNECT BY LEVEL <= 366;",
    },
    enterprise: "Gap-free time series for dashboards, capacity planning grids, and test-data generation. Warehouses keep a permanent date dimension table instead.",
    pitfalls: ["COUNT(*) after a LEFT JOIN counts 1 for empty periods. COUNT(fact_column) gives 0."],
  },

  /* ------------------------------------------------------- Performance */
  {
    id: "indexes",
    title: "Indexes",
    category: "Performance",
    definition:
      "An index is a separate data structure, usually a B-tree, that maps key values to row locations so the database can find rows without scanning the whole table. It speeds up reads and adds cost to every write.",
    syntax: {
      postgres: "CREATE INDEX idx_txn_account ON transactions (account_id);\n-- also: UNIQUE, partial (WHERE …), expression, GIN for JSONB",
      oracle: "CREATE INDEX idx_txn_account ON transactions (account_id);\n-- also: UNIQUE, function-based, BITMAP (warehouses)",
    },
    enterprise:
      "Index design is the biggest performance lever in OLTP. Index foreign keys and frequent filter/sort columns, and use composite indexes that match query patterns (equality columns first, then range). Remove unused indexes; each one slows every INSERT.",
    pitfalls: [
      "A composite index (a, b) helps WHERE a = … but usually not WHERE b = ….",
      "Functions on the column (UPPER(email) = …) skip a plain index. Create a function-based / expression index instead.",
    ],
    quiz: { q: "Which predicate can use an index on order_date?", options: ["TO_CHAR(order_date,'YYYY') = '2024'", "order_date >= DATE '2024-01-01'", "order_date + 1 > SYSDATE", "TRUNC(order_date) = …"], answer: 1, why: "Only a bare column compared with a value is sargable." },
  },
  {
    id: "sargable",
    title: "Sargable predicates",
    category: "Performance",
    definition:
      "A predicate is sargable (Search-ARGument-able) when the database can use an index to evaluate it. That means the column must appear bare on one side: col = x, col > x, col LIKE 'abc%'.",
    syntax: {
      postgres: "-- not sargable\nWHERE TO_CHAR(order_date, 'YYYY-MM') = '2024-06'\n-- sargable\nWHERE order_date >= DATE '2024-06-01'\n  AND order_date <  DATE '2024-07-01'",
      oracle: "-- not sargable\nWHERE TRUNC(order_date, 'MM') = DATE '2024-06-01'\n-- sargable\nWHERE order_date >= DATE '2024-06-01'\n  AND order_date <  DATE '2024-07-01'",
    },
    enterprise: "Rewriting non-sargable filters is a common one-line fix that takes a query from minutes to milliseconds.",
    pitfalls: ["Implicit type conversion (comparing a VARCHAR column with a number) wraps the column in a conversion and disables the index."],
  },
  {
    id: "explain",
    title: "EXPLAIN & execution plans",
    category: "Performance",
    definition:
      "The optimizer turns SQL into an execution plan: which indexes to use, the join order and the join methods (nested loop, hash, merge). EXPLAIN shows the plan and its estimated cost; EXPLAIN ANALYZE (PostgreSQL) also runs the query and shows the real timings.",
    syntax: {
      postgres: "EXPLAIN ANALYZE\nSELECT * FROM orders WHERE customer_id = 7;",
      oracle: "EXPLAIN PLAN FOR\nSELECT * FROM orders WHERE customer_id = 7;\nSELECT * FROM TABLE(DBMS_XPLAN.DISPLAY);",
    },
    enterprise:
      "Performance tuning starts with the plan: look for full scans on big tables, row-count estimates far off from reality (stale statistics), and nested loops over large inputs. The battle arena rewards lower-cost plans with bonus damage.",
    pitfalls: ["Cost is a planner estimate, not time. Compare plans for the same query shape.", "Statistics must be current: ANALYZE (PostgreSQL) / DBMS_STATS.GATHER_TABLE_STATS (Oracle)."],
  },
  {
    id: "materialized-views",
    title: "Materialized views",
    category: "Performance",
    definition: "A materialized view stores the result of a query physically, like a table, and is refreshed on demand or on a schedule. Reads are instant; the data is only as fresh as the last refresh.",
    syntax: {
      postgres: "CREATE MATERIALIZED VIEW monthly_revenue AS SELECT …;\nREFRESH MATERIALIZED VIEW CONCURRENTLY monthly_revenue;",
      oracle: "CREATE MATERIALIZED VIEW monthly_revenue\nBUILD IMMEDIATE REFRESH FAST ON COMMIT AS SELECT …;\n-- EXEC DBMS_MVIEW.REFRESH('MONTHLY_REVENUE');",
    },
    enterprise: "Dashboards and APIs read precomputed aggregates. Oracle can refresh incrementally (FAST, using materialized view logs) and even rewrite queries to use MVs automatically.",
    pitfalls: ["Stale data: agree on freshness with the business.", "PostgreSQL REFRESH … CONCURRENTLY requires a unique index on the MV."],
  },
  {
    id: "partitioning",
    title: "Partitioning",
    category: "Performance",
    definition: "Partitioning splits one logical table into physical pieces by a key (range of dates, list of regions, hash). Queries that filter on the key skip irrelevant partitions (partition pruning).",
    syntax: {
      postgres: "CREATE TABLE events (id BIGINT, created DATE, …)\nPARTITION BY RANGE (created);\nCREATE TABLE events_2024 PARTITION OF events\n  FOR VALUES FROM ('2024-01-01') TO ('2025-01-01');",
      oracle: "CREATE TABLE events (id NUMBER, created DATE, …)\nPARTITION BY RANGE (created)\nINTERVAL (NUMTOYMINTERVAL(1, 'MONTH'))\n(PARTITION p0 VALUES LESS THAN (DATE '2024-01-01'));",
    },
    enterprise: "Billion-row fact tables, audit logs and time series. Old data is archived by detaching or dropping a partition, which is instant compared with DELETE.",
    pitfalls: ["Queries that don't filter on the partition key scan every partition."],
  },

  /* -------------------------------------------------------- Modern SQL */
  {
    id: "json",
    title: "JSON in SQL",
    category: "Modern SQL",
    definition:
      "Both databases store and query JSON documents. The SQL/JSON standard functions JSON_VALUE (a scalar), JSON_QUERY (an object or array), JSON_TABLE (rows) and JSON_EXISTS work in Oracle 12c+ and PostgreSQL 17+. PostgreSQL also has jsonb operators (->, ->>, @>) and GIN indexes.",
    syntax: {
      postgres: "SELECT details->>'priority' AS priority,\n       (details->>'weight_kg')::numeric AS kg\nFROM shipments\nWHERE details @> '{\"fragile\": true}';",
      oracle: "SELECT JSON_VALUE(details, '$.priority') AS priority,\n       JSON_VALUE(details, '$.weight_kg' RETURNING NUMBER) AS kg\nFROM shipments\nWHERE JSON_EXISTS(details, '$?(@.fragile == true)');",
    },
    enterprise: "Event payloads, flexible product attributes and API responses stored next to relational data, so one database serves both. Index the paths you filter on (a GIN index in PostgreSQL, a JSON search index in Oracle).",
    pitfalls: ["Don't put core, frequently-joined attributes in JSON; they deserve real columns and constraints.", "->> returns text; cast it before comparing numbers."],
  },
  {
    id: "string-functions",
    title: "String functions",
    category: "Modern SQL",
    definition: "Common text functions exist in both databases with small differences: UPPER/LOWER/INITCAP, TRIM, LPAD/RPAD, REPLACE, SUBSTR, LENGTH, and concatenation with ||.",
    syntax: {
      postgres: "SELECT UPPER(last_name), SUBSTR(email, 1, 5),\n       STRPOS(email, '@'), first_name || ' ' || last_name\nFROM employees;",
      oracle: "SELECT UPPER(last_name), SUBSTR(email, 1, 5),\n       INSTR(email, '@'), first_name || ' ' || last_name\nFROM employees;",
    },
    enterprise: "Data cleansing in ETL (TRIM, UPPER, REGEXP_REPLACE), building display names, and masking PII (RPAD(SUBSTR(card, -4), 16, '*')).",
    pitfalls: ["Oracle: 'a' || NULL = 'a'. PostgreSQL: 'a' || NULL = NULL.", "REGEXP_REPLACE replaces all matches in Oracle but only the first in PostgreSQL unless you pass 'g'."],
  },
  {
    id: "dual",
    title: "DUAL & SELECT without FROM",
    category: "Modern SQL",
    definition: "DUAL is Oracle's one-row, one-column dummy table, used to evaluate expressions (SELECT SYSDATE FROM dual). PostgreSQL, and Oracle 23ai, simply allow SELECT without FROM.",
    syntax: { postgres: "SELECT CURRENT_DATE, 2 + 2;", oracle: "SELECT SYSDATE, 2 + 2 FROM dual;" },
    enterprise: "Common in Oracle scripts for sequence calls (SELECT seq.NEXTVAL FROM dual), row generators and quick calculations.",
    pitfalls: ["Code that expects DUAL must be rewritten when migrating to PostgreSQL (or you create a compatibility view)."],
  },
  {
    id: "plsql",
    title: "PL/SQL vs PL/pgSQL",
    category: "Modern SQL",
    definition:
      "Both databases include a procedural language for stored procedures, functions and triggers: PL/SQL (Oracle) and PL/pgSQL (PostgreSQL). They look similar (DECLARE / BEGIN / EXCEPTION / END) but differ in packages, error handling and cursors.",
    syntax: {
      postgres: "CREATE FUNCTION raise_salary(p_id INT, p_pct NUMERIC)\nRETURNS void LANGUAGE plpgsql AS $$\nBEGIN\n  UPDATE employees SET salary = salary * (1 + p_pct/100)\n  WHERE emp_id = p_id;\nEND $$;",
      oracle: "CREATE OR REPLACE PROCEDURE raise_salary(p_id NUMBER, p_pct NUMBER) AS\nBEGIN\n  UPDATE employees SET salary = salary * (1 + p_pct/100)\n  WHERE emp_id = p_id;\nEND;\n/",
    },
    enterprise: "Large Oracle shops keep critical business logic in PL/SQL packages. Migrating to PostgreSQL means converting packages into schemas of functions, which is the most expensive part of most migrations.",
    pitfalls: ["Row-by-row loops ('slow-by-slow') are much slower than one set-based SQL statement."],
  },
];

export function codexById(id: string): CodexEntry | undefined {
  return CODEX.find((c) => c.id === id);
}
