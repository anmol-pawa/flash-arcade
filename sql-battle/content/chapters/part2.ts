import type { Chapter } from "../types";

const same = (sql: string) => ({ postgres: sql, oracle: sql });

export const CHAPTERS_6_10: Chapter[] = [
  /* ================================================================ 6 */
  {
    n: 6,
    boss: "transactor",
    bossName: "The Transactor",
    bossTitle: "Clockwork Knight of ACID",
    title: "All or Nothing",
    topics: ["BEGIN / COMMIT / ROLLBACK", "Atomicity", "SAVEPOINT", "Isolation levels", "Row locks: SELECT … FOR UPDATE", "Oracle implicit transactions"],
    intro:
      "The Transactor fights in atomic strikes: every blow lands completely or not at all. It attacks mid-transaction, so you have to know exactly when changes become permanent and how to take them back.",
    defeat: "The Transactor's gears stop at a consistent state. Nothing is half-done. It seems almost relieved.",
    color: "#34d399",
    missions: [
      {
        id: "c6-transfer",
        title: "The Transfer",
        taunt: "Debit one account, crash before the credit… money simply vanishes. Delicious.",
        task: "Move **500.00** from account **1** to account **2** as one atomic unit of work, and make it permanent.",
        check: "SELECT account_id, balance FROM accounts WHERE account_id IN (1, 2) ORDER BY account_id",
        ordered: true,
        solution: {
          postgres:
            "BEGIN;\nUPDATE accounts SET balance = balance - 500 WHERE account_id = 1;\nUPDATE accounts SET balance = balance + 500 WHERE account_id = 2;\nCOMMIT;",
          oracle: "UPDATE accounts SET balance = balance - 500 WHERE account_id = 1;\nUPDATE accounts SET balance = balance + 500 WHERE account_id = 2;\nCOMMIT;",
        },
        hints: [
          "A transaction groups statements so they succeed or fail together (the A in ACID).",
          "PostgreSQL: BEGIN; … COMMIT;  Oracle: no BEGIN — the first DML starts the transaction; finish with COMMIT.",
          "UPDATE … balance - 500 WHERE account_id = 1; UPDATE … balance + 500 WHERE account_id = 2; COMMIT;",
        ],
        codex: ["transactions"],
        tables: ["accounts"],
      },
      {
        id: "c6-undo",
        title: "Undo the Wipe",
        kind: "defense",
        taunt: "I just set EVERY balance to zero. The transaction is still open… but you don't know what that means.",
        task: "The Transactor opened a transaction and zeroed every account balance — but it hasn't committed yet. **Undo its changes.**",
        setup: "BEGIN; UPDATE accounts SET balance = 0;",
        check: "SELECT account_id, balance FROM accounts ORDER BY account_id",
        ordered: true,
        solution: same("ROLLBACK;"),
        hints: [
          "Uncommitted changes are only visible to their own session and can be discarded.",
          "One keyword ends the transaction and throws away its changes.",
          "ROLLBACK;",
        ],
        codex: ["transactions"],
        tables: ["accounts"],
      },
      {
        id: "c6-savepoint",
        title: "Checkpoint",
        taunt: "Roll back everything, lose your fees too! There's no middle ground.",
        task: "In **one transaction**: (1) deduct a **15.00** fee from every `CHECKING` account; (2) create savepoint `after_fees`; (3) set every `SAVINGS` balance to 0 (a mistake); (4) undo **only** step 3; (5) commit.",
        check: "SELECT account_id, balance FROM accounts ORDER BY account_id",
        ordered: true,
        solution: {
          postgres:
            "BEGIN;\nUPDATE accounts SET balance = balance - 15 WHERE account_type = 'CHECKING';\nSAVEPOINT after_fees;\nUPDATE accounts SET balance = 0 WHERE account_type = 'SAVINGS';\nROLLBACK TO SAVEPOINT after_fees;\nCOMMIT;",
          oracle:
            "UPDATE accounts SET balance = balance - 15 WHERE account_type = 'CHECKING';\nSAVEPOINT after_fees;\nUPDATE accounts SET balance = 0 WHERE account_type = 'SAVINGS';\nROLLBACK TO SAVEPOINT after_fees;\nCOMMIT;",
        },
        hints: [
          "SAVEPOINT name marks a point inside a transaction; ROLLBACK TO SAVEPOINT name undoes only the work after it.",
          "The transaction stays open after ROLLBACK TO — you still need COMMIT.",
          "UPDATE …fees…; SAVEPOINT after_fees; UPDATE …savings…; ROLLBACK TO SAVEPOINT after_fees; COMMIT;",
        ],
        codex: ["savepoint"],
        tables: ["accounts"],
      },
      {
        id: "c6-isolation",
        title: "Consistent Snapshot",
        taunt: "Read the total while others write? You'll see money that doesn't exist!",
        task: "Start a transaction at **SERIALIZABLE** isolation, read the total `balance` of all `ACTIVE` accounts as `total`, then end the transaction with COMMIT.",
        solution: {
          postgres: "BEGIN ISOLATION LEVEL SERIALIZABLE;\nSELECT SUM(balance) AS total FROM accounts WHERE status = 'ACTIVE';\nCOMMIT;",
          oracle: "SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;\nSELECT SUM(balance) AS total FROM accounts WHERE status = 'ACTIVE';\nCOMMIT;",
        },
        hints: [
          "The isolation level decides which concurrent changes your transaction can see. SERIALIZABLE sees one consistent snapshot and fails rather than allow anomalies.",
          "PostgreSQL: BEGIN ISOLATION LEVEL SERIALIZABLE;  Oracle: SET TRANSACTION ISOLATION LEVEL SERIALIZABLE; (it must be the first statement).",
          "…; SELECT SUM(balance) AS total FROM accounts WHERE status = 'ACTIVE'; COMMIT;",
        ],
        codex: ["isolation"],
        tables: ["accounts"],
      },
      {
        id: "c6-lock",
        title: "Hold the Line",
        taunt: "Two tellers withdraw at once. Read, compute, write… and one update is lost forever.",
        task: "Safely withdraw **200.00** from account **5**: first **lock its row** with a SELECT … FOR UPDATE, then update the balance, then commit.",
        check: "SELECT account_id, balance FROM accounts WHERE account_id = 5",
        solution: {
          postgres:
            "BEGIN;\nSELECT balance FROM accounts WHERE account_id = 5 FOR UPDATE;\nUPDATE accounts SET balance = balance - 200 WHERE account_id = 5;\nCOMMIT;",
          oracle: "SELECT balance FROM accounts WHERE account_id = 5 FOR UPDATE;\nUPDATE accounts SET balance = balance - 200 WHERE account_id = 5;\nCOMMIT;",
        },
        hints: [
          "SELECT … FOR UPDATE locks the selected rows until your transaction ends, so nobody else can change them in between (pessimistic locking).",
          "Lock, then update, then COMMIT to release the lock.",
          "SELECT balance FROM accounts WHERE account_id = 5 FOR UPDATE; UPDATE accounts SET balance = balance - 200 WHERE account_id = 5; COMMIT;",
        ],
        codex: ["locking"],
        tables: ["accounts"],
      },
      {
        id: "c6-surgical",
        title: "Surgical Rollback",
        kind: "defense",
        taunt: "Your restock was fine. Then I deleted a pile of order lines after your savepoint. Undo everything and you lose the restock too!",
        task: "Inside an open transaction you restocked stationery and set savepoint `restock_done`. The Transactor then deleted order lines. **Undo only the deletion, keep the restock, and make it permanent.**",
        setup: "BEGIN; UPDATE products SET stock = stock + 10 WHERE category_id = 9; SAVEPOINT restock_done; DELETE FROM order_items WHERE order_id < 1010;",
        check: "SELECT (SELECT COUNT(*) FROM order_items) AS order_lines, (SELECT SUM(stock) FROM products) AS total_stock",
        solution: same("ROLLBACK TO SAVEPOINT restock_done;\nCOMMIT;"),
        hints: [
          "You don't want a full ROLLBACK — that would also undo the restock.",
          "Roll back to the savepoint, then commit what remains.",
          "ROLLBACK TO SAVEPOINT restock_done; COMMIT;",
        ],
        codex: ["savepoint"],
        tables: ["products", "order_items"],
      },
    ],
  },

  /* ================================================================ 7 */
  {
    n: 7,
    boss: "schemaforge",
    bossName: "Schemaforge",
    bossTitle: "Smith of Structures",
    title: "Forging the Schema",
    topics: ["CREATE TABLE & data types", "Constraints: PK, FK, NOT NULL, CHECK, UNIQUE", "ALTER TABLE", "Identity columns & sequences", "Views", "CREATE TABLE AS"],
    intro: "Schemaforge hammers out tables with no keys, no rules and no types. Forge better structures than it does, because constraints are what keep the data honest.",
    defeat: "Schemaforge's anvil splits along a CHECK constraint. It forged its last untyped column.",
    color: "#f59e0b",
    missions: [
      {
        id: "c7-create",
        title: "Forge a Table",
        taunt: "Types? Keys? Rules? My tables accept anything.",
        task: "Create table `suppliers` with: `supplier_id` (integer, **primary key**), `name` (text up to 60 chars, **NOT NULL**), `country` (text up to 40), `rating` (small integer with a **CHECK** that it is between 1 and 5).",
        check:
          "SELECT c.column_name, c.is_nullable, (SELECT COUNT(*) FROM pg_constraint WHERE conrelid = 'suppliers'::regclass AND contype = 'p') AS pks, (SELECT COUNT(*) FROM pg_constraint WHERE conrelid = 'suppliers'::regclass AND contype = 'c') AS checks FROM information_schema.columns c WHERE c.table_name = 'suppliers' ORDER BY c.ordinal_position",
        ordered: true,
        solution: {
          postgres: "CREATE TABLE suppliers (\n  supplier_id INTEGER PRIMARY KEY,\n  name        VARCHAR(60) NOT NULL,\n  country     VARCHAR(40),\n  rating      SMALLINT CHECK (rating BETWEEN 1 AND 5)\n)",
          oracle: "CREATE TABLE suppliers (\n  supplier_id NUMBER(10) PRIMARY KEY,\n  name        VARCHAR2(60) NOT NULL,\n  country     VARCHAR2(40),\n  rating      NUMBER(1) CHECK (rating BETWEEN 1 AND 5)\n)",
        },
        hints: [
          "CREATE TABLE name (column type [constraints], …). Constraints can be declared inline next to the column.",
          "PostgreSQL types: INTEGER, VARCHAR(n), SMALLINT. Oracle types: NUMBER(p), VARCHAR2(n).",
          "… rating NUMBER(1) CHECK (rating BETWEEN 1 AND 5)",
        ],
        codex: ["create-table", "constraints"],
        tables: [],
      },
      {
        id: "c7-alter",
        title: "Reshape",
        taunt: "Once forged, a table can never change. Everyone knows that.",
        task: "Alter `customers`: **add** a column `phone` (text up to 20 chars) and make `segment` **mandatory** (NOT NULL).",
        check: "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'customers' ORDER BY ordinal_position",
        ordered: true,
        solution: {
          postgres: "ALTER TABLE customers ADD COLUMN phone VARCHAR(20);\nALTER TABLE customers ALTER COLUMN segment SET NOT NULL;",
          oracle: "ALTER TABLE customers ADD (phone VARCHAR2(20));\nALTER TABLE customers MODIFY (segment NOT NULL);",
        },
        hints: [
          "ALTER TABLE changes an existing table's structure. Adding a NOT NULL constraint fails if any row already violates it.",
          "PostgreSQL: ADD COLUMN …; ALTER COLUMN … SET NOT NULL.  Oracle: ADD (col type); MODIFY (col NOT NULL).",
          "Oracle: ALTER TABLE customers ADD (phone VARCHAR2(20)); ALTER TABLE customers MODIFY (segment NOT NULL);",
        ],
        codex: ["alter-table"],
        tables: ["customers"],
      },
      {
        id: "c7-reviews",
        title: "Bind by Key",
        taunt: "A review for a product that doesn't exist? Why not!",
        task: "Create `reviews` (`review_id` integer PK, `product_id` integer NOT NULL **referencing products**, `stars` integer with CHECK 1–5, `body` long text). Then insert review 1: product **6**, **5** stars, body `'Silence is golden'`.",
        check:
          "SELECT (SELECT COUNT(*) FROM pg_constraint WHERE conrelid = 'reviews'::regclass AND contype = 'f') AS fks, (SELECT COUNT(*) FROM pg_constraint WHERE conrelid = 'reviews'::regclass AND contype = 'c') AS checks, (SELECT COUNT(*) FROM reviews WHERE product_id = 6 AND stars = 5) AS reviews",
        solution: {
          postgres:
            "CREATE TABLE reviews (\n  review_id  INTEGER PRIMARY KEY,\n  product_id INTEGER NOT NULL REFERENCES products (product_id),\n  stars      INTEGER CHECK (stars BETWEEN 1 AND 5),\n  body       TEXT\n);\nINSERT INTO reviews VALUES (1, 6, 5, 'Silence is golden');",
          oracle:
            "CREATE TABLE reviews (\n  review_id  NUMBER(10) PRIMARY KEY,\n  product_id NUMBER(10) NOT NULL REFERENCES products (product_id),\n  stars      NUMBER(1) CHECK (stars BETWEEN 1 AND 5),\n  body       CLOB\n);\nINSERT INTO reviews VALUES (1, 6, 5, 'Silence is golden');\nCOMMIT;",
        },
        hints: [
          "REFERENCES parent (column) declares a foreign key: every value must exist in the parent table.",
          "Long text: TEXT in PostgreSQL, CLOB (or VARCHAR2(4000)) in Oracle.",
          "CREATE TABLE reviews (review_id … PRIMARY KEY, product_id … NOT NULL REFERENCES products (product_id), stars … CHECK (stars BETWEEN 1 AND 5), body …); INSERT INTO reviews VALUES (1, 6, 5, 'Silence is golden');",
        ],
        codex: ["constraints"],
        tables: ["products"],
      },
      {
        id: "c7-identity",
        title: "Self-Numbering",
        taunt: "You'll hand-number every ticket until the heat death of the universe.",
        task: "Create `tickets` with `ticket_id` as an **identity column** (generated always, primary key) and `title` (text up to 100, NOT NULL). Insert two tickets, `'Printer on fire'` then `'VPN down'`, letting the database number them.",
        check: "SELECT ticket_id, title FROM tickets ORDER BY ticket_id",
        ordered: true,
        solution: {
          postgres:
            "CREATE TABLE tickets (\n  ticket_id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n  title     VARCHAR(100) NOT NULL\n);\nINSERT INTO tickets (title) VALUES ('Printer on fire');\nINSERT INTO tickets (title) VALUES ('VPN down');",
          oracle:
            "CREATE TABLE tickets (\n  ticket_id NUMBER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n  title     VARCHAR2(100) NOT NULL\n);\nINSERT INTO tickets (title) VALUES ('Printer on fire');\nINSERT INTO tickets (title) VALUES ('VPN down');\nCOMMIT;",
        },
        hints: [
          "GENERATED ALWAYS AS IDENTITY makes the database assign the key (SQL standard; Oracle 12c+, PostgreSQL 10+).",
          "Leave the identity column out of the INSERT column list.",
          "… ticket_id … GENERATED ALWAYS AS IDENTITY PRIMARY KEY …; INSERT INTO tickets (title) VALUES ('Printer on fire'); …",
        ],
        codex: ["identity"],
        tables: [],
      },
      {
        id: "c7-view",
        title: "Window to the Payroll",
        taunt: "Everyone will rewrite that payroll join by hand. Forever. Wrongly.",
        task: "Create a view `dept_payroll` with every department's `dept_name`, `headcount` (0 if empty) and `total_salary` (0 if empty).",
        check: "SELECT dept_name, headcount, total_salary FROM dept_payroll ORDER BY dept_name",
        ordered: true,
        solution: {
          postgres:
            "CREATE VIEW dept_payroll AS\nSELECT d.dept_name, COUNT(e.emp_id) AS headcount, COALESCE(SUM(e.salary), 0) AS total_salary\nFROM departments d LEFT JOIN employees e ON e.dept_id = d.dept_id\nGROUP BY d.dept_name",
          oracle:
            "CREATE VIEW dept_payroll AS\nSELECT d.dept_name, COUNT(e.emp_id) AS headcount, NVL(SUM(e.salary), 0) AS total_salary\nFROM departments d LEFT JOIN employees e ON e.dept_id = d.dept_id\nGROUP BY d.dept_name",
        },
        hints: [
          "A view is a stored query you can select from like a table. It holds no data of its own.",
          "LEFT JOIN keeps empty departments; COUNT(e.emp_id) counts 0 for them, while COUNT(*) would count 1.",
          "CREATE VIEW dept_payroll AS SELECT d.dept_name, COUNT(e.emp_id) AS headcount, COALESCE(SUM(e.salary), 0) AS total_salary FROM departments d LEFT JOIN employees e … GROUP BY d.dept_name",
        ],
        codex: ["views"],
        tables: ["departments", "employees"],
      },
      {
        id: "c7-ctas",
        title: "Snapshot Forge",
        taunt: "Copy a table? Define every column by hand first, obviously.",
        task: "Create a table `delivered_orders` holding `order_id`, `customer_id` and `order_date` of every **DELIVERED** order, in a single statement.",
        check: "SELECT COUNT(*) AS n, MIN(order_id) AS first_id, MAX(order_id) AS last_id FROM delivered_orders",
        solution: same("CREATE TABLE delivered_orders AS SELECT order_id, customer_id, order_date FROM orders WHERE status = 'DELIVERED'"),
        hints: [
          "CREATE TABLE … AS SELECT (CTAS) creates a table from a query's result, with column types inferred.",
          "Constraints (like the primary key) are not copied.",
          "CREATE TABLE delivered_orders AS SELECT order_id, customer_id, order_date FROM orders WHERE status = 'DELIVERED'",
        ],
        codex: ["ctas"],
        tables: ["orders"],
      },
    ],
  },

  /* ================================================================ 8 */
  {
    n: 8,
    boss: "windwraith",
    bossName: "The Windwraith",
    bossTitle: "Dancer of Frames",
    title: "Through the Window",
    topics: ["OVER (PARTITION BY … ORDER BY …)", "ROW_NUMBER / RANK / DENSE_RANK", "Running totals", "LAG / LEAD", "Top-N per group", "Ratios to totals"],
    intro:
      "The Windwraith moves through sliding frames of rows. It sees every neighbour without collapsing anything. GROUP BY can't touch it. Window functions can.",
    defeat: "The Windwraith's last frame closes: ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW. Current row: defeated.",
    color: "#38bdf8",
    missions: [
      {
        id: "c8-row-number",
        title: "Number the Ranks",
        taunt: "Number rows per department without losing a single row? GROUP BY would never.",
        task: "For every employee with a department show `dept_id`, `last_name`, `salary` and `rn`: their position within their department by salary (highest = 1, ties broken by `last_name`).",
        solution: same("SELECT dept_id, last_name, salary, ROW_NUMBER() OVER (PARTITION BY dept_id ORDER BY salary DESC, last_name) AS rn FROM employees WHERE dept_id IS NOT NULL"),
        hints: [
          "Window functions compute over a set of related rows while keeping every row. OVER (…) defines that set.",
          "PARTITION BY splits rows into groups; ORDER BY inside OVER orders each group.",
          "ROW_NUMBER() OVER (PARTITION BY dept_id ORDER BY salary DESC, last_name) AS rn",
        ],
        codex: ["window-functions", "ranking"],
        tables: ["employees"],
      },
      {
        id: "c8-rank",
        title: "Tied Blades",
        taunt: "Two engineers earn the same. Who's second? Who's third? Ha!",
        task: "For Engineering (`dept_id = 20`) show `last_name`, `salary`, `rnk` (RANK by salary desc) and `dense_rnk` (DENSE_RANK by salary desc).",
        solution: same(
          "SELECT last_name, salary, RANK() OVER (ORDER BY salary DESC) AS rnk, DENSE_RANK() OVER (ORDER BY salary DESC) AS dense_rnk FROM employees WHERE dept_id = 20",
        ),
        hints: [
          "RANK gives ties the same rank and then skips (1,2,2,4). DENSE_RANK doesn't skip (1,2,2,3). ROW_NUMBER never ties.",
          "No PARTITION BY needed — the WHERE already limits to one department.",
          "RANK() OVER (ORDER BY salary DESC) AS rnk, DENSE_RANK() OVER (ORDER BY salary DESC) AS dense_rnk",
        ],
        codex: ["ranking"],
        tables: ["employees"],
      },
      {
        id: "c8-running",
        title: "Running Current",
        taunt: "A running balance needs a loop. Or a cursor. Or a miracle.",
        task: "For account **2**, list `txn_id`, `txn_date`, `amount` and a `running_total` of amounts in date order (tie-break by `txn_id`). Sort the output the same way.",
        ordered: true,
        solution: same(
          "SELECT txn_id, txn_date, amount, SUM(amount) OVER (ORDER BY txn_date, txn_id) AS running_total FROM transactions WHERE account_id = 2 ORDER BY txn_date, txn_id",
        ),
        hints: [
          "An aggregate with OVER (ORDER BY …) becomes cumulative: by default it covers all rows from the start up to the current one.",
          "SUM(amount) OVER (ORDER BY txn_date, txn_id)",
          "SELECT txn_id, txn_date, amount, SUM(amount) OVER (ORDER BY txn_date, txn_id) AS running_total FROM transactions WHERE account_id = 2 ORDER BY txn_date, txn_id",
        ],
        codex: ["running-totals"],
        tables: ["transactions"],
      },
      {
        id: "c8-lag",
        title: "Echo of Last Month",
        taunt: "Compare this month to last month? You'd need a self join and a headache.",
        task: "Count orders per month (`mon` formatted `'YYYY-MM'`, `order_count`) and add `delta`: the change versus the previous month (NULL for the first). Order by month.",
        ordered: true,
        solution: same(
          "SELECT mon, order_count, order_count - LAG(order_count) OVER (ORDER BY mon) AS delta FROM (SELECT TO_CHAR(order_date, 'YYYY-MM') AS mon, COUNT(*) AS order_count FROM orders GROUP BY TO_CHAR(order_date, 'YYYY-MM')) m ORDER BY mon",
        ),
        hints: [
          "LAG(expr) reads a value from the previous row of the window; LEAD reads the next one.",
          "Aggregate per month in an inline view first, then apply LAG over the monthly rows.",
          "SELECT mon, order_count, order_count - LAG(order_count) OVER (ORDER BY mon) AS delta FROM (SELECT TO_CHAR(order_date, 'YYYY-MM') AS mon, COUNT(*) AS order_count FROM orders GROUP BY TO_CHAR(order_date, 'YYYY-MM')) m ORDER BY mon",
        ],
        codex: ["lag-lead"],
        tables: ["orders"],
      },
      {
        id: "c8-top2",
        title: "Top Two Per Squad",
        taunt: "Filter on a window function in WHERE. Go on, try it.",
        task: "Show `dept_id`, `last_name`, `salary` of the **top 2 salary levels** in each department (use DENSE_RANK, so ties both count).",
        solution: same(
          "SELECT dept_id, last_name, salary FROM (SELECT dept_id, last_name, salary, DENSE_RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS r FROM employees WHERE dept_id IS NOT NULL) t WHERE r <= 2",
        ),
        hints: [
          "Window functions are evaluated after WHERE, so you cannot filter on them in the same query level.",
          "Compute the rank in an inline view (or CTE), then filter in the outer query.",
          "SELECT … FROM (SELECT …, DENSE_RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS r FROM employees WHERE dept_id IS NOT NULL) t WHERE r <= 2",
        ],
        codex: ["top-n-per-group"],
        tables: ["employees"],
      },
      {
        id: "c8-share",
        title: "Slice of the Pie",
        taunt: "Percent of department total. Two queries minimum. Probably three.",
        task: "For each employee with a department show `last_name`, `dept_id`, `salary` and `pct_of_dept`: salary as a percentage of their department's total salary, rounded to 1 decimal.",
        solution: same(
          "SELECT last_name, dept_id, salary, ROUND(100 * salary / SUM(salary) OVER (PARTITION BY dept_id), 1) AS pct_of_dept FROM employees WHERE dept_id IS NOT NULL",
        ),
        hints: [
          "SUM(…) OVER (PARTITION BY …) with no ORDER BY gives the whole partition's total on every row.",
          "Divide the row's value by that total.",
          "ROUND(100 * salary / SUM(salary) OVER (PARTITION BY dept_id), 1) AS pct_of_dept",
        ],
        codex: ["window-functions"],
        tables: ["employees"],
      },
    ],
  },

  /* ================================================================ 9 */
  {
    n: 9,
    boss: "hydra",
    bossName: "The Recursion Hydra",
    bossTitle: "It Calls Itself",
    title: "Trees and Recursion",
    topics: ["Common Table Expressions (WITH)", "Recursive CTEs", "Oracle CONNECT BY / LEVEL / PRIOR", "Paths & roots", "Row generators"],
    intro:
      "Cut off one head and two more grow back. The Hydra is a hierarchy that references itself. Tame it with a recursive query, where each level is built from the one before.",
    defeat: "The recursion finally hits its base case. The Hydra's heads fold back into a single row.",
    color: "#4ade80",
    missions: [
      {
        id: "c9-cte",
        title: "Name the Beast",
        taunt: "Repeat the same subquery three times. It builds character.",
        task: "Using a CTE named `dept_totals` (dept_id, total salary), return `dept_id` and `total` for departments whose total salary is **above the average department total**.",
        solution: same(
          "WITH dept_totals AS (\n  SELECT dept_id, SUM(salary) AS total FROM employees WHERE dept_id IS NOT NULL GROUP BY dept_id\n)\nSELECT dept_id, total FROM dept_totals WHERE total > (SELECT AVG(total) FROM dept_totals)",
        ),
        hints: [
          "WITH name AS (query) defines a named result you can reference like a table — even several times.",
          "Reference the CTE in both the outer FROM and the subquery.",
          "WITH dept_totals AS (SELECT dept_id, SUM(salary) AS total FROM employees WHERE dept_id IS NOT NULL GROUP BY dept_id) SELECT dept_id, total FROM dept_totals WHERE total > (SELECT AVG(total) FROM dept_totals)",
        ],
        codex: ["cte"],
        tables: ["employees"],
      },
      {
        id: "c9-org",
        title: "Org Chart",
        taunt: "How deep does the hierarchy go? Nobody knows. Nobody can know.",
        task: "Starting from the employee with **no manager**, return every employee's `emp_id`, `last_name` and `lvl` — their depth in the hierarchy (the CEO is level 1).",
        solution: {
          postgres:
            "WITH RECURSIVE org AS (\n  SELECT emp_id, last_name, 1 AS lvl FROM employees WHERE manager_id IS NULL\n  UNION ALL\n  SELECT e.emp_id, e.last_name, o.lvl + 1 FROM employees e JOIN org o ON e.manager_id = o.emp_id\n)\nSELECT emp_id, last_name, lvl FROM org",
          oracle: "SELECT emp_id, last_name, LEVEL AS lvl\nFROM employees\nSTART WITH manager_id IS NULL\nCONNECT BY PRIOR emp_id = manager_id",
        },
        hints: [
          "A recursive CTE = anchor rows UNION ALL a query that joins back to the CTE itself, repeated until no new rows appear.",
          "Oracle's classic form: START WITH <root condition> CONNECT BY PRIOR emp_id = manager_id, with LEVEL as depth.",
          "PostgreSQL: WITH RECURSIVE org AS (SELECT …, 1 AS lvl … WHERE manager_id IS NULL UNION ALL SELECT e…, o.lvl + 1 FROM employees e JOIN org o ON e.manager_id = o.emp_id) SELECT … FROM org",
        ],
        codex: ["recursive-cte", "connect-by"],
        tables: ["employees"],
      },
      {
        id: "c9-chain",
        title: "Climb the Neck",
        taunt: "From the lowliest junior to the very top… how many heads between?",
        task: "Walk **upward** from Frances Allen (`emp_id = 117`) to the CEO. Return `last_name` and `steps` (0 for Frances, 1 for her manager, …), ordered by `steps`.",
        ordered: true,
        solution: {
          postgres:
            "WITH RECURSIVE chain AS (\n  SELECT emp_id, last_name, manager_id, 0 AS steps FROM employees WHERE emp_id = 117\n  UNION ALL\n  SELECT m.emp_id, m.last_name, m.manager_id, c.steps + 1 FROM employees m JOIN chain c ON m.emp_id = c.manager_id\n)\nSELECT last_name, steps FROM chain ORDER BY steps",
          oracle: "SELECT last_name, LEVEL - 1 AS steps\nFROM employees\nSTART WITH emp_id = 117\nCONNECT BY PRIOR manager_id = emp_id\nORDER BY steps",
        },
        hints: [
          "Recursion can go either way: down (children of the previous row) or up (the parent of the previous row).",
          "Going up: join the next row's emp_id to the previous row's manager_id. Oracle: CONNECT BY PRIOR manager_id = emp_id.",
          "… JOIN chain c ON m.emp_id = c.manager_id …  /  START WITH emp_id = 117 CONNECT BY PRIOR manager_id = emp_id",
        ],
        codex: ["recursive-cte", "connect-by"],
        tables: ["employees"],
      },
      {
        id: "c9-path",
        title: "Breadcrumbs",
        taunt: "Laptops live under… something under… something. Good luck.",
        task: "For every category return `name` and its full `path` from the root, formatted like `/All Products/Electronics/Computers`.",
        solution: {
          postgres:
            "WITH RECURSIVE tree AS (\n  SELECT category_id, name, '/' || name AS path FROM categories WHERE parent_id IS NULL\n  UNION ALL\n  SELECT c.category_id, c.name, t.path || '/' || c.name FROM categories c JOIN tree t ON c.parent_id = t.category_id\n)\nSELECT name, path FROM tree",
          oracle: "SELECT name, SYS_CONNECT_BY_PATH(name, '/') AS path\nFROM categories\nSTART WITH parent_id IS NULL\nCONNECT BY PRIOR category_id = parent_id",
        },
        hints: [
          "Carry an accumulator column through the recursion: the anchor starts it, each step appends to it.",
          "Oracle has a built-in for this: SYS_CONNECT_BY_PATH(column, separator).",
          "PostgreSQL: anchor '/' || name AS path; recursive step t.path || '/' || c.name",
        ],
        codex: ["recursive-cte", "connect-by"],
        tables: ["categories"],
      },
      {
        id: "c9-teams",
        title: "Count the Heads",
        taunt: "How big is each VP's empire, all the way down? Even I don't know.",
        task: "For each direct report of the CEO (`manager_id = 100`) return their `last_name` as `vp` and `team_size`: the number of people in their whole subtree, **including themselves**.",
        solution: {
          postgres:
            "WITH RECURSIVE sub AS (\n  SELECT emp_id AS root_id, emp_id FROM employees WHERE manager_id = 100\n  UNION ALL\n  SELECT s.root_id, e.emp_id FROM employees e JOIN sub s ON e.manager_id = s.emp_id\n)\nSELECT r.last_name AS vp, COUNT(*) AS team_size\nFROM sub JOIN employees r ON r.emp_id = sub.root_id\nGROUP BY r.last_name",
          oracle:
            "SELECT CONNECT_BY_ROOT last_name AS vp, COUNT(*) AS team_size\nFROM employees\nSTART WITH manager_id = 100\nCONNECT BY PRIOR emp_id = manager_id\nGROUP BY CONNECT_BY_ROOT last_name",
        },
        hints: [
          "Carry the root's id through the recursion so every descendant row knows which tree it belongs to.",
          "Oracle: CONNECT_BY_ROOT column returns the value from the root row of the current tree.",
          "PostgreSQL: anchor SELECT emp_id AS root_id, emp_id …; recursive SELECT s.root_id, e.emp_id …; then GROUP BY root.",
        ],
        codex: ["recursive-cte", "connect-by"],
        tables: ["employees"],
      },
      {
        id: "c9-calendar",
        title: "Summon the Calendar",
        taunt: "Months with zero cancellations don't exist in the data, so they don't exist at all!",
        task: "Return **all 12 months of 2024** as `mon` (`'YYYY-MM'`) with the number of **CANCELLED** orders in each as `cancelled` — including months with 0. Order by month.",
        ordered: true,
        solution: {
          postgres:
            "SELECT TO_CHAR(m, 'YYYY-MM') AS mon, COUNT(o.order_id) AS cancelled\nFROM generate_series(DATE '2024-01-01', DATE '2024-12-01', INTERVAL '1 month') AS m\nLEFT JOIN orders o ON o.status = 'CANCELLED' AND o.order_date >= m AND o.order_date < m + INTERVAL '1 month'\nGROUP BY m\nORDER BY mon",
          oracle:
            "WITH months AS (\n  SELECT ADD_MONTHS(DATE '2024-01-01', LEVEL - 1) AS m FROM dual CONNECT BY LEVEL <= 12\n)\nSELECT TO_CHAR(m, 'YYYY-MM') AS mon, COUNT(o.order_id) AS cancelled\nFROM months\nLEFT JOIN orders o ON o.status = 'CANCELLED' AND o.order_date >= m AND o.order_date < ADD_MONTHS(m, 1)\nGROUP BY m\nORDER BY mon",
        },
        hints: [
          "To report on values that aren't in the data, generate them first, then LEFT JOIN the facts.",
          "PostgreSQL: generate_series(start, stop, step). Oracle: SELECT … FROM dual CONNECT BY LEVEL <= n.",
          "COUNT(o.order_id) (not COUNT(*)) returns 0 for months with no matching order.",
        ],
        codex: ["row-generators"],
        tables: ["orders"],
      },
    ],
  },

  /* ================================================================ 10 */
  {
    n: 10,
    boss: "optimizer",
    bossName: "The Optimizer",
    bossTitle: "Eye of the Planner",
    title: "The Final Plan",
    topics: ["Indexes", "Sargable predicates", "EXPLAIN plans", "JSON in SQL", "PIVOT / conditional aggregation", "Materialized views", "Putting it all together"],
    intro:
      "At the core of every database sits the query planner: an all-seeing eye that picks how every query runs. The Optimizer judges your spells by cost, not only by correctness. Show it queries that are right and fast.",
    defeat: "The Optimizer's eye closes, satisfied. Your final plan: Index Only Scan, cost 0.01. You are a Data Mage now.",
    color: "#e879f9",
    missions: [
      {
        id: "c10-index",
        title: "Carve an Index",
        taunt: "Every lookup scans every row. I love the sound of a full table scan.",
        task: "Transactions are constantly looked up by `account_id`. Create an index `idx_txn_account` on `transactions (account_id)`.",
        check: "SELECT COUNT(*) AS matching_indexes FROM pg_indexes WHERE tablename = 'transactions' AND indexdef LIKE '%(account_id)%'",
        solution: same("CREATE INDEX idx_txn_account ON transactions (account_id)"),
        hints: [
          "An index is a sorted structure (usually a B-tree) that lets the database find rows by key without scanning the table.",
          "CREATE INDEX name ON table (column)",
          "CREATE INDEX idx_txn_account ON transactions (account_id)",
        ],
        codex: ["indexes"],
        tables: ["transactions"],
      },
      {
        id: "c10-sargable",
        title: "Sargable Strike",
        taunt: "Wrap the column in a function. Indexes adore that.",
        task: "Return `order_id` and `order_date` of all orders placed in **June 2024** — without wrapping `order_date` in a function (so an index on it could be used). Damage scales with plan cost!",
        solution: same("SELECT order_id, order_date FROM orders WHERE order_date >= DATE '2024-06-01' AND order_date < DATE '2024-07-01'"),
        hints: [
          "A predicate is 'sargable' when the column stands alone: col >= x. TO_CHAR(col, …) = 'x' hides the column from indexes.",
          "Use a half-open range: >= first day AND < first day of next month.",
          "WHERE order_date >= DATE '2024-06-01' AND order_date < DATE '2024-07-01'",
        ],
        codex: ["sargable", "explain"],
        tables: ["orders"],
      },
      {
        id: "c10-json",
        title: "JSON Lance",
        taunt: "Semi-structured data in a relational database? Heresy!",
        task: "From `shipments`, return `shipment_id`, `carrier` and the numeric `weight_kg` from the JSON `details`, for shipments whose `priority` is **express or overnight** and weight is **over 10**.",
        solution: {
          postgres:
            "SELECT shipment_id, carrier, (details->>'weight_kg')::numeric AS weight_kg\nFROM shipments\nWHERE details->>'priority' IN ('express', 'overnight')\n  AND (details->>'weight_kg')::numeric > 10",
          oracle:
            "SELECT shipment_id, carrier, JSON_VALUE(details, '$.weight_kg' RETURNING NUMBER) AS weight_kg\nFROM shipments\nWHERE JSON_VALUE(details, '$.priority') IN ('express', 'overnight')\n  AND JSON_VALUE(details, '$.weight_kg' RETURNING NUMBER) > 10",
        },
        hints: [
          "Both databases can query inside JSON documents. JSON_VALUE (SQL standard) extracts a scalar by path.",
          "PostgreSQL also has operators: details->>'key' returns text; cast it with ::numeric.",
          "Oracle: JSON_VALUE(details, '$.priority') and JSON_VALUE(details, '$.weight_kg' RETURNING NUMBER)",
        ],
        codex: ["json"],
        tables: ["shipments"],
      },
      {
        id: "c10-pivot",
        title: "Pivot Vortex",
        taunt: "Rows into columns? Impossible without a spreadsheet!",
        task: "Pivot orders by status: one row per customer `segment` with columns `delivered`, `shipped`, `pending`, `cancelled` holding order counts.",
        solution: {
          postgres:
            "SELECT c.segment,\n  COUNT(*) FILTER (WHERE o.status = 'DELIVERED') AS delivered,\n  COUNT(*) FILTER (WHERE o.status = 'SHIPPED') AS shipped,\n  COUNT(*) FILTER (WHERE o.status = 'PENDING') AS pending,\n  COUNT(*) FILTER (WHERE o.status = 'CANCELLED') AS cancelled\nFROM orders o JOIN customers c ON c.customer_id = o.customer_id\nGROUP BY c.segment",
          oracle:
            "SELECT * FROM (\n  SELECT c.segment, o.status FROM orders o JOIN customers c ON c.customer_id = o.customer_id\n)\nPIVOT (COUNT(*) FOR status IN ('DELIVERED' AS delivered, 'SHIPPED' AS shipped, 'PENDING' AS pending, 'CANCELLED' AS cancelled))",
        },
        hints: [
          "Pivoting = one aggregate per target column, each counting only the rows for its value.",
          "PostgreSQL: COUNT(*) FILTER (WHERE status = 'X'). Portable: SUM(CASE WHEN status = 'X' THEN 1 ELSE 0 END). Oracle: the PIVOT clause.",
          "Oracle: SELECT * FROM (SELECT segment, status …) PIVOT (COUNT(*) FOR status IN ('DELIVERED' AS delivered, …))",
        ],
        codex: ["pivot"],
        tables: ["orders", "customers"],
      },
      {
        id: "c10-matview",
        title: "Crystallize",
        taunt: "Recompute monthly revenue on every dashboard refresh. Burn those CPUs!",
        task: "Create a **materialized view** `monthly_revenue` with `mon` (`'YYYY-MM'` of order_date) and `revenue` (sum of quantity × unit_price) over non-cancelled orders.",
        check:
          "SELECT m.mon, m.revenue, (SELECT COUNT(*) FROM pg_matviews WHERE matviewname = 'monthly_revenue') AS is_materialized FROM monthly_revenue m ORDER BY m.mon",
        ordered: true,
        solution: {
          postgres:
            "CREATE MATERIALIZED VIEW monthly_revenue AS\nSELECT TO_CHAR(o.order_date, 'YYYY-MM') AS mon, SUM(oi.quantity * oi.unit_price) AS revenue\nFROM orders o JOIN order_items oi ON oi.order_id = o.order_id\nWHERE o.status <> 'CANCELLED'\nGROUP BY TO_CHAR(o.order_date, 'YYYY-MM')",
          oracle:
            "CREATE MATERIALIZED VIEW monthly_revenue\nBUILD IMMEDIATE REFRESH COMPLETE ON DEMAND AS\nSELECT TO_CHAR(o.order_date, 'YYYY-MM') AS mon, SUM(oi.quantity * oi.unit_price) AS revenue\nFROM orders o JOIN order_items oi ON oi.order_id = o.order_id\nWHERE o.status <> 'CANCELLED'\nGROUP BY TO_CHAR(o.order_date, 'YYYY-MM')",
        },
        hints: [
          "A materialized view stores the query's result physically. Reads are fast; the data is only as fresh as the last refresh.",
          "CREATE MATERIALIZED VIEW name AS SELECT … (Oracle adds BUILD / REFRESH options).",
          "CREATE MATERIALIZED VIEW monthly_revenue AS SELECT TO_CHAR(o.order_date, 'YYYY-MM') AS mon, SUM(oi.quantity * oi.unit_price) AS revenue FROM … GROUP BY TO_CHAR(o.order_date, 'YYYY-MM')",
        ],
        codex: ["materialized-views"],
        tables: ["orders", "order_items"],
      },
      {
        id: "c10-final",
        title: "The Final Query",
        taunt: "Joins, aggregates, windows and CTEs, all in one spell? No mortal has ever cast it.",
        task: "For each customer `segment`, find the **top-spending customer** (non-cancelled orders). Return `segment`, `top_customer` (name), `total` spend, and `pct_of_segment` (their share of the segment's total spend, 1 decimal). Order by segment.",
        ordered: true,
        solution: same(
          "WITH spend AS (\n  SELECT c.customer_id, c.name, c.segment, SUM(oi.quantity * oi.unit_price) AS total\n  FROM customers c\n  JOIN orders o ON o.customer_id = c.customer_id\n  JOIN order_items oi ON oi.order_id = o.order_id\n  WHERE o.status <> 'CANCELLED'\n  GROUP BY c.customer_id, c.name, c.segment\n), ranked AS (\n  SELECT s.*, RANK() OVER (PARTITION BY segment ORDER BY total DESC) AS r,\n         SUM(total) OVER (PARTITION BY segment) AS segment_total\n  FROM spend s\n)\nSELECT segment, name AS top_customer, total, ROUND(100 * total / segment_total, 1) AS pct_of_segment\nFROM ranked\nWHERE r = 1\nORDER BY segment",
        ),
        hints: [
          "Break it into named steps with CTEs: spend per customer → rank within segment → pick rank 1.",
          "RANK() OVER (PARTITION BY segment ORDER BY total DESC) and SUM(total) OVER (PARTITION BY segment) can sit side by side.",
          "WITH spend AS (…GROUP BY customer…), ranked AS (SELECT s.*, RANK() OVER (…) AS r, SUM(total) OVER (PARTITION BY segment) AS segment_total FROM spend s) SELECT … FROM ranked WHERE r = 1 ORDER BY segment",
        ],
        codex: ["cte", "window-functions"],
        tables: ["customers", "orders", "order_items"],
        time: 420,
      },
    ],
  },
];
