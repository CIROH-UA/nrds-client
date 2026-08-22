/**
 * Quoting for the duckdb queries this app builds by hand.
 *
 * Two copies of these existed, one in the cache layer and one in queryData.js, and the queries in
 * between them disagreed about which values went through them: a table name was quoted in six
 * functions, unquoted in a seventh, and a column name was interpolated bare. One home means the
 * rule is visible in one place and a new query has somewhere obvious to reach for.
 *
 * Identifiers double their quotes, literals double their apostrophes. Neither is a substitute
 * for validating a value that should not have reached a query at all.
 */
export const sqlIdent = (s) => `"${String(s).replace(/"/g, '""')}"`;

export const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;
