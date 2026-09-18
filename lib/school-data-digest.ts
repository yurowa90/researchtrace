import { tableColumns, tableNames, type SchoolRows } from "@/lib/school-tables";

// Row order is not part of the school data contract. Keep duplicates so that
// an extra or missing row still changes the comparison.
export function schoolDigestInput(tables: SchoolRows) {
  return JSON.stringify([...tableNames].sort().map(name => [name,
    tables[name].map(row => JSON.stringify(tableColumns[name].map(key => (row as Record<string, unknown>)[key] ?? null))).sort(),
  ]));
}
