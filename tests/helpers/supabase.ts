import { vi } from "vitest";

export class QueryBuilder {
  private filters: Array<(row: Record<string, unknown>) => boolean> = [];
  private inserted: unknown;

  constructor(
    private table: string,
    private rows: Record<string, unknown>[],
    private operations: Array<Record<string, unknown>>
  ) {}

  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  not(column: string, operator: string, value: unknown) {
    if (operator === "is" && value === null) {
      this.filters.push((row) => row[column] !== null && row[column] !== undefined);
    }
    return this;
  }

  order() {
    return this;
  }

  update(values: Record<string, unknown>) {
    this.operations.push({ table: this.table, type: "update", values });
    return this;
  }

  insert(values: unknown) {
    this.operations.push({ table: this.table, type: "insert", values });
    this.inserted = values;
    return this;
  }

  delete() {
    this.operations.push({ table: this.table, type: "delete" });
    return this;
  }

  single() {
    if (this.inserted) {
      const insertedRow = Array.isArray(this.inserted) ? this.inserted[0] : this.inserted;
      return Promise.resolve({ data: { id: "profile-id", ...(insertedRow as Record<string, unknown>) }, error: null });
    }

    const data = this.filteredRows()[0] ?? null;
    return Promise.resolve({ data, error: data ? null : { message: "No rows" } });
  }

  then(resolve: (value: { data: Record<string, unknown>[]; error: null }) => unknown) {
    return Promise.resolve({ data: this.filteredRows(), error: null }).then(resolve);
  }

  private filteredRows() {
    return this.rows.filter((row) => this.filters.every((filter) => filter(row)));
  }
}

export function installSupabaseMock(tables: Record<string, Record<string, unknown>[]>, operations: Array<Record<string, unknown>> = []) {
  vi.doMock("../../lib/supabase", () => ({
    createServerSupabase: () => ({
      from: (table: string) => new QueryBuilder(table, tables[table] ?? [], operations)
    }),
    hasSupabaseConfig: () => true
  }));
}
