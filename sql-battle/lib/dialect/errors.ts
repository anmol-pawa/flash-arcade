/** Raised when SQL is rejected before it ever reaches the database. */
export class DialectError extends Error {
  constructor(
    /** Oracle-style (ORA-xxxxx / PLS-xxxxx) or "PG" code. */
    public code: string,
    message: string,
    /** Plain-English coaching shown in the tutor panel. */
    public hint: string,
  ) {
    super(message);
    this.name = "DialectError";
  }
}

/**
 * Raised by the transpiler when it needs to know the columns of a relation
 * (e.g. to expand PIVOT). The engine runs `probe`, collects the column names
 * and calls the transpiler again with them.
 */
export class NeedColumns extends Error {
  constructor(public probe: string) {
    super(`need columns for: ${probe}`);
    this.name = "NeedColumns";
  }
}
