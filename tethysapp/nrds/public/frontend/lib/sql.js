/** Quoting for the duckdb queries this app builds by hand. */
export const sqlIdent = (s) => `"${String(s).replace(/"/g, '""')}"`;

export const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;
