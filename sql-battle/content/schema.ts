/**
 * The arena database: four small enterprise domains in one schema.
 *
 *   HR         locations, departments, employees (self-referencing hierarchy)
 *   Retail     customers, categories (tree), products, orders, order_items
 *   Banking    accounts, transactions
 *   Logistics  shipments (JSONB details)
 *
 * The data is generated from a fixed seed, so every browser (and the test
 * suite) gets byte-for-byte the same rows. Deliberate edge cases for lessons:
 * an employee without a department, a department without employees, customers
 * without orders, products never sold, NULL commissions, salary ties.
 */

export interface ColumnDef {
  name: string;
  pg: string;
  oracle: string;
  note?: string;
}
export interface TableDef {
  name: string;
  domain: "HR" | "Retail" | "Banking" | "Logistics";
  description: string;
  columns: ColumnDef[];
}

const c = (name: string, pg: string, oracle: string, note?: string): ColumnDef => ({ name, pg, oracle, note });

export const TABLES: TableDef[] = [
  {
    name: "locations",
    domain: "HR",
    description: "Office sites.",
    columns: [
      c("location_id", "INTEGER", "NUMBER(10)", "PK"),
      c("city", "VARCHAR(40)", "VARCHAR2(40)"),
      c("country", "VARCHAR(40)", "VARCHAR2(40)"),
      c("region", "VARCHAR(20)", "VARCHAR2(20)"),
    ],
  },
  {
    name: "departments",
    domain: "HR",
    description: "Business units. Research has no employees yet.",
    columns: [
      c("dept_id", "INTEGER", "NUMBER(10)", "PK"),
      c("dept_name", "VARCHAR(40)", "VARCHAR2(40)", "unique"),
      c("location_id", "INTEGER", "NUMBER(10)", "FK → locations"),
      c("budget", "NUMERIC(12,2)", "NUMBER(12,2)"),
    ],
  },
  {
    name: "employees",
    domain: "HR",
    description: "Staff. manager_id points at another employee (a tree).",
    columns: [
      c("emp_id", "INTEGER", "NUMBER(10)", "PK"),
      c("first_name", "VARCHAR(30)", "VARCHAR2(30)"),
      c("last_name", "VARCHAR(30)", "VARCHAR2(30)"),
      c("email", "VARCHAR(60)", "VARCHAR2(60)", "unique"),
      c("job_title", "VARCHAR(40)", "VARCHAR2(40)"),
      c("salary", "NUMERIC(10,2)", "NUMBER(10,2)", "> 0"),
      c("commission_pct", "NUMERIC(4,2)", "NUMBER(4,2)", "often NULL"),
      c("hire_date", "DATE", "DATE"),
      c("dept_id", "INTEGER", "NUMBER(10)", "FK → departments, nullable"),
      c("manager_id", "INTEGER", "NUMBER(10)", "FK → employees"),
    ],
  },
  {
    name: "customers",
    domain: "Retail",
    description: "Buyers. Some have never ordered.",
    columns: [
      c("customer_id", "INTEGER", "NUMBER(10)", "PK"),
      c("name", "VARCHAR(60)", "VARCHAR2(60)"),
      c("email", "VARCHAR(60)", "VARCHAR2(60)"),
      c("city", "VARCHAR(40)", "VARCHAR2(40)"),
      c("country", "VARCHAR(40)", "VARCHAR2(40)"),
      c("segment", "VARCHAR(20)", "VARCHAR2(20)", "CONSUMER / SMB / ENTERPRISE"),
      c("signup_date", "DATE", "DATE"),
    ],
  },
  {
    name: "categories",
    domain: "Retail",
    description: "Product category tree (parent_id).",
    columns: [
      c("category_id", "INTEGER", "NUMBER(10)", "PK"),
      c("name", "VARCHAR(40)", "VARCHAR2(40)"),
      c("parent_id", "INTEGER", "NUMBER(10)", "FK → categories"),
    ],
  },
  {
    name: "products",
    domain: "Retail",
    description: "Catalogue. A few items have never sold.",
    columns: [
      c("product_id", "INTEGER", "NUMBER(10)", "PK"),
      c("name", "VARCHAR(60)", "VARCHAR2(60)"),
      c("category_id", "INTEGER", "NUMBER(10)", "FK → categories"),
      c("price", "NUMERIC(10,2)", "NUMBER(10,2)"),
      c("stock", "INTEGER", "NUMBER(10)"),
      c("discontinued", "CHAR(1)", "CHAR(1)", "'Y' / 'N'"),
    ],
  },
  {
    name: "orders",
    domain: "Retail",
    description: "Order headers for 2024.",
    columns: [
      c("order_id", "INTEGER", "NUMBER(10)", "PK"),
      c("customer_id", "INTEGER", "NUMBER(10)", "FK → customers"),
      c("order_date", "DATE", "DATE"),
      c("status", "VARCHAR(12)", "VARCHAR2(12)", "PENDING / SHIPPED / DELIVERED / CANCELLED"),
      c("shipped_date", "DATE", "DATE", "NULL until shipped"),
    ],
  },
  {
    name: "order_items",
    domain: "Retail",
    description: "Order lines. PK is (order_id, line_no).",
    columns: [
      c("order_id", "INTEGER", "NUMBER(10)", "PK, FK → orders"),
      c("line_no", "INTEGER", "NUMBER(10)", "PK"),
      c("product_id", "INTEGER", "NUMBER(10)", "FK → products"),
      c("quantity", "INTEGER", "NUMBER(10)"),
      c("unit_price", "NUMERIC(10,2)", "NUMBER(10,2)"),
    ],
  },
  {
    name: "accounts",
    domain: "Banking",
    description: "Bank accounts owned by customers.",
    columns: [
      c("account_id", "INTEGER", "NUMBER(10)", "PK"),
      c("customer_id", "INTEGER", "NUMBER(10)", "FK → customers"),
      c("account_type", "VARCHAR(12)", "VARCHAR2(12)", "CHECKING / SAVINGS"),
      c("balance", "NUMERIC(12,2)", "NUMBER(12,2)"),
      c("opened_on", "DATE", "DATE"),
      c("status", "VARCHAR(10)", "VARCHAR2(10)", "ACTIVE / FROZEN / CLOSED"),
    ],
  },
  {
    name: "transactions",
    domain: "Banking",
    description: "Ledger entries: positive = credit, negative = debit.",
    columns: [
      c("txn_id", "INTEGER", "NUMBER(10)", "PK"),
      c("account_id", "INTEGER", "NUMBER(10)", "FK → accounts"),
      c("txn_date", "DATE", "DATE"),
      c("amount", "NUMERIC(12,2)", "NUMBER(12,2)"),
      c("txn_type", "VARCHAR(10)", "VARCHAR2(10)", "DEPOSIT / WITHDRAWAL / FEE / TRANSFER"),
    ],
  },
  {
    name: "shipments",
    domain: "Logistics",
    description: "Parcels for shipped orders. details is a JSON document.",
    columns: [
      c("shipment_id", "INTEGER", "NUMBER(10)", "PK"),
      c("order_id", "INTEGER", "NUMBER(10)", "FK → orders"),
      c("carrier", "VARCHAR(20)", "VARCHAR2(20)"),
      c("shipped_on", "DATE", "DATE"),
      c("delivered_on", "DATE", "DATE", "NULL while in transit"),
      c("details", "JSONB", "JSON", '{"priority","weight_kg","fragile","hub"}'),
    ],
  },
];

const DDL = `
CREATE TABLE locations (
  location_id INTEGER PRIMARY KEY,
  city        VARCHAR(40) NOT NULL,
  country     VARCHAR(40) NOT NULL,
  region      VARCHAR(20)
);
CREATE TABLE departments (
  dept_id     INTEGER PRIMARY KEY,
  dept_name   VARCHAR(40) NOT NULL UNIQUE,
  location_id INTEGER REFERENCES locations,
  budget      NUMERIC(12,2)
);
CREATE TABLE employees (
  emp_id         INTEGER PRIMARY KEY,
  first_name     VARCHAR(30) NOT NULL,
  last_name      VARCHAR(30) NOT NULL,
  email          VARCHAR(60) UNIQUE,
  job_title      VARCHAR(40),
  salary         NUMERIC(10,2) NOT NULL CHECK (salary > 0),
  commission_pct NUMERIC(4,2),
  hire_date      DATE NOT NULL,
  dept_id        INTEGER REFERENCES departments,
  manager_id     INTEGER REFERENCES employees
);
CREATE TABLE customers (
  customer_id INTEGER PRIMARY KEY,
  name        VARCHAR(60) NOT NULL,
  email       VARCHAR(60),
  city        VARCHAR(40),
  country     VARCHAR(40),
  segment     VARCHAR(20),
  signup_date DATE
);
CREATE TABLE categories (
  category_id INTEGER PRIMARY KEY,
  name        VARCHAR(40) NOT NULL,
  parent_id   INTEGER REFERENCES categories
);
CREATE TABLE products (
  product_id   INTEGER PRIMARY KEY,
  name         VARCHAR(60) NOT NULL,
  category_id  INTEGER REFERENCES categories,
  price        NUMERIC(10,2) NOT NULL,
  stock        INTEGER NOT NULL DEFAULT 0,
  discontinued CHAR(1) DEFAULT 'N'
);
CREATE TABLE orders (
  order_id     INTEGER PRIMARY KEY,
  customer_id  INTEGER NOT NULL REFERENCES customers,
  order_date   DATE NOT NULL,
  status       VARCHAR(12) NOT NULL,
  shipped_date DATE
);
CREATE TABLE order_items (
  order_id   INTEGER REFERENCES orders,
  line_no    INTEGER,
  product_id INTEGER REFERENCES products,
  quantity   INTEGER NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  PRIMARY KEY (order_id, line_no)
);
CREATE TABLE accounts (
  account_id   INTEGER PRIMARY KEY,
  customer_id  INTEGER REFERENCES customers,
  account_type VARCHAR(12) NOT NULL,
  balance      NUMERIC(12,2) NOT NULL,
  opened_on    DATE NOT NULL,
  status       VARCHAR(10) NOT NULL
);
CREATE TABLE transactions (
  txn_id     INTEGER PRIMARY KEY,
  account_id INTEGER REFERENCES accounts,
  txn_date   DATE NOT NULL,
  amount     NUMERIC(12,2) NOT NULL,
  txn_type   VARCHAR(10) NOT NULL
);
CREATE TABLE shipments (
  shipment_id  INTEGER PRIMARY KEY,
  order_id     INTEGER REFERENCES orders,
  carrier      VARCHAR(20),
  shipped_on   DATE,
  delivered_on DATE,
  details      JSONB
);
`;

/* ---------------------------------------------------------------- data */

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const q = (v: string | number | null) => (v === null ? "NULL" : typeof v === "number" ? String(v) : `'${v.replace(/'/g, "''")}'`);
const d = (iso: string | null) => (iso === null ? "NULL" : `DATE '${iso}'`);
const rows = (table: string, cols: string, values: string[]) => `INSERT INTO ${table} (${cols}) VALUES\n  ${values.join(",\n  ")};\n`;

const LOCATIONS: [number, string, string, string][] = [
  [1, "London", "United Kingdom", "EMEA"],
  [2, "Bengaluru", "India", "APAC"],
  [3, "New York", "United States", "AMER"],
  [4, "Berlin", "Germany", "EMEA"],
  [5, "Singapore", "Singapore", "APAC"],
];

const DEPARTMENTS: [number, string, number | null, number][] = [
  [10, "Executive", 1, 900000],
  [20, "Engineering", 2, 2500000],
  [30, "Sales", 3, 1200000],
  [40, "Finance", 1, 700000],
  [50, "Operations", 4, 950000],
  [60, "Research", 5, 400000],
];

// emp_id, first, last, title, salary, commission, hire_date, dept, manager
const EMPLOYEES: [number, string, string, string, number, number | null, string, number | null, number | null][] = [
  [100, "Ada", "Lovelace", "Chief Executive Officer", 250000, null, "2015-03-01", 10, null],
  [101, "Grace", "Hopper", "VP Engineering", 190000, null, "2016-06-15", 20, 100],
  [102, "Alan", "Turing", "VP Sales", 175000, 0.1, "2016-09-01", 30, 100],
  [103, "Katherine", "Johnson", "Chief Financial Officer", 185000, null, "2017-01-10", 40, 100],
  [104, "Edsger", "Dijkstra", "VP Operations", 160000, null, "2017-04-22", 50, 100],
  [110, "Linus", "Torvalds", "Principal Engineer", 150000, null, "2018-02-12", 20, 101],
  [111, "Margaret", "Hamilton", "Engineering Manager", 145000, null, "2018-05-30", 20, 101],
  [112, "Dennis", "Ritchie", "Senior Engineer", 128000, null, "2019-07-01", 20, 110],
  [113, "Barbara", "Liskov", "Senior Engineer", 128000, null, "2019-08-19", 20, 111],
  [114, "Ken", "Thompson", "Engineer", 98000, null, "2021-01-04", 20, 111],
  [115, "Radia", "Perlman", "Engineer", 102000, null, "2020-11-16", 20, 110],
  [116, "Guido", "van Rossum", "Engineer", 95000, null, "2022-03-07", 20, 112],
  [117, "Frances", "Allen", "Junior Engineer", 72000, null, "2023-06-12", 20, 113],
  [120, "Tim", "Berners-Lee", "Sales Manager", 118000, 0.15, "2018-10-01", 30, 102],
  [121, "Hedy", "Lamarr", "Account Executive", 86000, 0.2, "2020-02-17", 30, 120],
  [122, "Claude", "Shannon", "Account Executive", 84000, 0.2, "2021-05-24", 30, 120],
  [123, "Annie", "Easley", "Account Executive", 84000, 0.25, "2022-09-05", 30, 120],
  [124, "Vint", "Cerf", "Sales Associate", 61000, 0.05, "2023-01-16", 30, 121],
  [130, "John", "von Neumann", "Controller", 132000, null, "2018-03-19", 40, 103],
  [131, "Mary", "Jackson", "Financial Analyst", 88000, null, "2021-08-02", 40, 130],
  [132, "Donald", "Knuth", "Financial Analyst", 91000, null, "2020-04-13", 40, 130],
  [140, "Joan", "Clarke", "Operations Manager", 112000, null, "2019-02-25", 50, 104],
  [141, "Charles", "Babbage", "Logistics Lead", 93000, null, "2020-06-08", 50, 140],
  [142, "Sophie", "Wilson", "Logistics Analyst", 76000, null, "2022-10-17", 50, 141],
  [143, "Bjarne", "Stroustrup", "Warehouse Coordinator", 58000, null, "2023-11-06", 50, 141],
  [150, "Evelyn", "Boyd", "Contractor", 70000, null, "2024-02-01", null, 104],
];

const CUSTOMERS: [number, string, string, string, string, string][] = [
  [1, "Acme Corp", "Chicago", "United States", "ENTERPRISE", "2022-01-15"],
  [2, "Globex", "Springfield", "United States", "ENTERPRISE", "2022-03-02"],
  [3, "Initech", "Austin", "United States", "SMB", "2022-05-20"],
  [4, "Umbrella Retail", "London", "United Kingdom", "ENTERPRISE", "2022-07-11"],
  [5, "Stark Supplies", "New York", "United States", "ENTERPRISE", "2022-08-30"],
  [6, "Wayne Goods", "Gotham", "United States", "SMB", "2022-10-05"],
  [7, "Priya Sharma", "Mumbai", "India", "CONSUMER", "2023-01-09"],
  [8, "Lukas Becker", "Berlin", "Germany", "CONSUMER", "2023-02-14"],
  [9, "Tyrell Systems", "Los Angeles", "United States", "ENTERPRISE", "2023-03-21"],
  [10, "Chen Wei", "Singapore", "Singapore", "CONSUMER", "2023-04-18"],
  [11, "Soylent Foods", "Dublin", "Ireland", "SMB", "2023-05-27"],
  [12, "Amelie Laurent", "Paris", "France", "CONSUMER", "2023-06-30"],
  [13, "Cyberdyne", "Sunnyvale", "United States", "ENTERPRISE", "2023-08-08"],
  [14, "Hooli", "Palo Alto", "United States", "SMB", "2023-09-12"],
  [15, "Arjun Mehta", "Bengaluru", "India", "CONSUMER", "2023-10-03"],
  [16, "Nakatomi Trading", "Tokyo", "Japan", "ENTERPRISE", "2023-11-19"],
  [17, "Olivia Brown", "Manchester", "United Kingdom", "CONSUMER", "2024-01-22"],
  [18, "Vandelay Industries", "New York", "United States", "SMB", "2024-02-29"],
  [19, "Sofia Rossi", "Milan", "Italy", "CONSUMER", "2024-05-05"],
  [20, "Pied Piper", "Palo Alto", "United States", "SMB", "2024-08-16"],
];

const CATEGORIES: [number, string, number | null][] = [
  [1, "All Products", null],
  [2, "Electronics", 1],
  [3, "Office", 1],
  [4, "Computers", 2],
  [5, "Audio", 2],
  [6, "Laptops", 4],
  [7, "Monitors", 4],
  [8, "Furniture", 3],
  [9, "Stationery", 3],
];

const PRODUCTS: [number, string, number, number, number, string][] = [
  [1, "ThinkBook 14", 6, 1199.0, 25, "N"],
  [2, "UltraBook Pro 16", 6, 2399.0, 8, "N"],
  [3, "Budget Laptop 15", 6, 549.0, 40, "N"],
  [4, "27in 4K Monitor", 7, 429.0, 30, "N"],
  [5, "34in Ultrawide", 7, 699.0, 12, "N"],
  [6, "Noise-Cancel Headphones", 5, 299.0, 60, "N"],
  [7, "Bluetooth Speaker", 5, 89.0, 75, "N"],
  [8, "Studio Microphone", 5, 159.0, 0, "N"],
  [9, "Ergo Office Chair", 8, 389.0, 18, "N"],
  [10, "Standing Desk", 8, 649.0, 10, "N"],
  [11, "Notebook Pack (5)", 9, 12.5, 500, "N"],
  [12, "Gel Pens (12)", 9, 8.99, 800, "N"],
  [13, "Legacy CRT Monitor", 7, 99.0, 3, "Y"],
  [14, "Fax Machine", 3, 149.0, 2, "Y"],
  [15, "Desk Lamp", 8, 45.0, 120, "N"],
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function addDays(iso: string, days: number) {
  const dt = new Date(iso + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function generate() {
  const rnd = mulberry32(20240607);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));

  // orders: customers 17..20 never order
  const orders: string[] = [];
  const items: string[] = [];
  const shipments: string[] = [];
  const ordered = new Set<number>();
  let ship = 1;
  const carriers = ["DHL", "FedEx", "UPS", "BlueDart"];
  const hubs = ["LHR", "BLR", "JFK", "FRA", "SIN"];
  for (let id = 1001; id <= 1040; id++) {
    const cust = id <= 1016 ? id - 1000 : int(1, 16);
    const month = int(1, 12);
    const day = int(1, 28);
    const date = `2024-${pad(month)}-${pad(day)}`;
    const r = rnd();
    const status = month >= 12 && r < 0.6 ? "PENDING" : r < 0.1 ? "CANCELLED" : r < 0.3 ? "SHIPPED" : "DELIVERED";
    const shipped = status === "SHIPPED" || status === "DELIVERED" ? addDays(date, int(1, 4)) : null;
    orders.push(`(${id}, ${cust}, ${d(date)}, ${q(status)}, ${d(shipped)})`);
    const lines = int(1, 4);
    const used = new Set<number>();
    for (let ln = 1; ln <= lines; ln++) {
      let p = int(1, 12);
      while (used.has(p)) p = (p % 12) + 1;
      used.add(p);
      ordered.add(p);
      const price = PRODUCTS[p - 1][3];
      items.push(`(${id}, ${ln}, ${p}, ${int(1, p > 10 ? 20 : 5)}, ${price.toFixed(2)})`);
    }
    if (shipped) {
      const delivered = status === "DELIVERED" ? addDays(shipped, int(1, 6)) : null;
      const details = {
        priority: pick(["standard", "standard", "express", "overnight"]),
        weight_kg: Math.round((1 + rnd() * 30) * 10) / 10,
        fragile: rnd() < 0.3,
        hub: pick(hubs),
      };
      shipments.push(`(${ship++}, ${id}, ${q(pick(carriers))}, ${d(shipped)}, ${d(delivered)}, '${JSON.stringify(details)}')`);
    }
  }

  const accounts: string[] = [];
  const txns: string[] = [];
  let txn = 5001;
  for (let a = 1; a <= 15; a++) {
    const cust = a <= 12 ? a : a - 8;
    const type = a % 3 === 0 ? "SAVINGS" : "CHECKING";
    const status = a === 7 ? "FROZEN" : a === 14 ? "CLOSED" : "ACTIVE";
    const opened = `20${pad(int(19, 23))}-${pad(int(1, 12))}-${pad(int(1, 28))}`;
    let balance = int(500, 20000);
    const n = a === 14 ? 0 : int(2, 6);
    for (let k = 0; k < n; k++) {
      const kind = pick(["DEPOSIT", "DEPOSIT", "WITHDRAWAL", "WITHDRAWAL", "FEE", "TRANSFER"]);
      const amt = kind === "FEE" ? -int(5, 35) : kind === "DEPOSIT" ? int(100, 5000) : -int(50, 3000);
      balance += amt;
      txns.push(`(${txn++}, ${a}, ${d(`2024-${pad(int(1, 12))}-${pad(int(1, 28))}`)}, ${amt.toFixed(2)}, ${q(kind)})`);
    }
    accounts.push(`(${a}, ${cust}, ${q(type)}, ${Math.max(balance, 0).toFixed(2)}, ${d(opened)}, ${q(status)})`);
  }
  return { orders, items, shipments, accounts, txns };
}

let cachedSeed: string | null = null;

export function seedSql(): string {
  if (cachedSeed) return cachedSeed;
  const g = generate();
  cachedSeed =
    DDL +
    rows("locations", "location_id, city, country, region", LOCATIONS.map((l) => `(${l[0]}, ${q(l[1])}, ${q(l[2])}, ${q(l[3])})`)) +
    rows("departments", "dept_id, dept_name, location_id, budget", DEPARTMENTS.map((x) => `(${x[0]}, ${q(x[1])}, ${q(x[2])}, ${x[3].toFixed(2)})`)) +
    rows(
      "employees",
      "emp_id, first_name, last_name, email, job_title, salary, commission_pct, hire_date, dept_id, manager_id",
      EMPLOYEES.map(
        (e) =>
          `(${e[0]}, ${q(e[1])}, ${q(e[2])}, ${q(`${e[1][0]}${e[2].replace(/[^A-Za-z]/g, "")}@corp.example`.toLowerCase())}, ${q(e[3])}, ${e[4].toFixed(2)}, ${e[5] === null ? "NULL" : e[5].toFixed(2)}, ${d(e[6])}, ${q(e[7])}, ${q(e[8])})`,
      ),
    ) +
    rows(
      "customers",
      "customer_id, name, email, city, country, segment, signup_date",
      CUSTOMERS.map((x) => `(${x[0]}, ${q(x[1])}, ${x[0] % 7 === 0 ? "NULL" : q(`contact@${x[1].toLowerCase().replace(/[^a-z]/g, "")}.example`)}, ${q(x[2])}, ${q(x[3])}, ${q(x[4])}, ${d(x[5])})`),
    ) +
    rows("categories", "category_id, name, parent_id", CATEGORIES.map((x) => `(${x[0]}, ${q(x[1])}, ${q(x[2])})`)) +
    rows("products", "product_id, name, category_id, price, stock, discontinued", PRODUCTS.map((p) => `(${p[0]}, ${q(p[1])}, ${p[2]}, ${p[3].toFixed(2)}, ${p[4]}, ${q(p[5])})`)) +
    rows("orders", "order_id, customer_id, order_date, status, shipped_date", g.orders) +
    rows("order_items", "order_id, line_no, product_id, quantity, unit_price", g.items) +
    rows("accounts", "account_id, customer_id, account_type, balance, opened_on, status", g.accounts) +
    rows("transactions", "txn_id, account_id, txn_date, amount, txn_type", g.txns) +
    rows("shipments", "shipment_id, order_id, carrier, shipped_on, delivered_on, details", g.shipments);
  return cachedSeed;
}

export const RESET_SQL = `ROLLBACK; RESET ALL; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; SET search_path TO public;`;
