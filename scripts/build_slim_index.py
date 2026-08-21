#!/usr/bin/env python3
"""Build the search index the app actually needs, which is 36 MiB rather than 103 MB.

The browser downloads hydrofabric_index.parquet -- 103,389,785 bytes, 37 columns,
2,073,171 rows -- to power the search box. Ten of those columns are read. Four resolve and
position a search (`id`, `vpuid`, `lon`, `lat`); six fill the Feature Information panel, and
they are exactly the fields FEATURE_PROPERTIES in reactapp/features/DataStream/lib/data.js
gives a human label to (`toid`, `divide_id`, `has_flowline`, `areasqkm`,
`tot_drainage_areasqkm`, `lengthkm`). The other 27 are downloaded and never looked at: weir and
orifice routing parameters, reservoir_index_* flags, mainstem, hydroseq, flow_order, and the
rest. Only the search path ever surfaced them, and only as machine names.

Projected to those ten, sorted by id and written with encodings chosen per column, the result
is about 45 MiB -- 2.2x smaller with every labelled field intact.

Sorting and the encodings do most of the work, and both matter more than the codec. Measured on
this ten-column projection at zstd level 9: pyarrow's default encodings give 78.3 MiB, while
DELTA_BYTE_ARRAY on the id columns and BYTE_STREAM_SPLIT on the floats give 44.7 MiB. The id
columns are sorted and share long prefixes, which is exactly what delta encoding is for; the
float columns are incompressible as bytes but compress well once split into byte planes.

Coordinates are cast to float32 and the area and length columns are deliberately not. The
coordinate cast costs at most 0.42 m, which is nothing against a catchment centroid, and buys
15 MiB. The same cast on areasqkm and tot_drainage_areasqkm would buy 17 MiB more but shifts
the fourth decimal on about 230,000 features, and those are quantities a reader compares rather
than a position a map flies to. Note that FeatureInformation prints coordinates with
toFixed(6): the sixth decimal is about 0.1 m, which float32 does not support, so that display
should be reduced to five decimals rather than advertising precision the data lacks.

The artifact is derived data. It must be regenerated when the hydrofabric changes, so the
header records the source's size, MD5 and row count: a stale artifact should be detectable
rather than silently wrong.

Why pyarrow and not duckdb: pyarrow, fsspec and s3fs are already dependencies in
pyproject.toml. duckdb is not, and adding a runtime dependency to ship one build step is a
poor trade.

Usage:
    python3 scripts/build_slim_index.py                       # from the published URL
    python3 scripts/build_slim_index.py --source scripts/indexes/hydrofabric_index.parquet
    python3 scripts/build_slim_index.py --out /tmp/slim.parquet --no-verify
    python3 scripts/build_slim_index.py --verify-only --out <existing artifact>
"""

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq

REPO = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = (
    "https://communityhydrofabric.s3.us-east-1.amazonaws.com/map/hydrofabric_index.parquet"
)
DEFAULT_OUT = REPO / "tethysapp/nrds/public/data/hydrofabric_index_slim.parquet"

# The four the search resolves and positions with.
KEY_COLUMNS = ("id", "vpuid", "lon", "lat")
# The six the Feature Information panel labels. Keeping these is what stops the panel emptying.
PANEL_COLUMNS = ("toid", "divide_id", "has_flowline", "areasqkm", "tot_drainage_areasqkm", "lengthkm")
COLUMNS = KEY_COLUMNS + PANEL_COLUMNS

# float32 costs at most 0.42 m of precision, against a screen pixel of about 30 m at the zoom
# the map flies to. float64 would roughly double the artifact for accuracy nothing can see.
FLOAT32_COLUMNS = ("lon", "lat")

ROW_GROUP_SIZE = 100_000
COMPRESSION = "zstd"
COMPRESSION_LEVEL = 9

# Chosen per column, and worth more than the codec here: default encodings give 78.3 MiB against
# 44.7 MiB for these. Both are lossless. duckdb has read both since 0.10, so duckdb-wasm 1.30 in
# the browser can too -- confirmed against duckdb 1.4.4 locally, and re-checked in the browser
# because that is the reader that actually matters.
STRING_ENCODED = ("id", "toid", "divide_id")
FLOAT_ENCODED = ("lon", "lat", "areasqkm", "tot_drainage_areasqkm", "lengthkm")
DICTIONARY_ENCODED = ("vpuid", "has_flowline")
COLUMN_ENCODING = {
    **{c: "DELTA_BYTE_ARRAY" for c in STRING_ENCODED},
    **{c: "BYTE_STREAM_SPLIT" for c in FLOAT_ENCODED},
}


class SourceShapeError(RuntimeError):
    """The upstream index is not the shape this script knows how to read."""


def open_source(source):
    """A ParquetFile for a local path or a URL, without downloading more than asked for."""
    if str(source).startswith(("http://", "https://", "s3://")):
        import fsspec

        return pq.ParquetFile(fsspec.open(str(source), "rb").open())
    return pq.ParquetFile(str(source))


def require_columns(schema, source):
    """Fail loudly, naming the column, when the upstream index changes shape.

    A rename or a removal upstream should be a red build rather than an artifact that is
    quietly missing a field the panel renders. Named individually because "a column is
    missing" sends the reader back to the schema; naming it does not.
    """
    missing = [c for c in COLUMNS if c not in schema.names]
    if missing:
        raise SourceShapeError(
            f"{source}: missing column(s) {', '.join(missing)}. "
            f"The upstream index has {len(schema.names)} columns; this script needs "
            f"{', '.join(COLUMNS)}."
        )


def project(source):
    """Read the ten columns, cast the coordinates, and sort by id."""
    pf = open_source(source)
    require_columns(pf.schema_arrow, source)
    table = pf.read(columns=list(COLUMNS))
    for name in FLOAT32_COLUMNS:
        i = table.schema.get_field_index(name)
        table = table.set_column(i, name, pc.cast(table.column(name), pa.float32()))
    return table.sort_by([("id", "ascending")])


def source_stats(source):
    """Size, MD5 and row count of the input, so an artifact can be traced to it.

    MD5 only for a local file: S3 reports the same value as the ETag for a single-part upload,
    but hashing 103 MB over the network to record provenance is not worth the transfer.
    """
    if str(source).startswith(("http://", "https://", "s3://")):
        import fsspec

        info = fsspec.filesystem(
            "https" if str(source).startswith("http") else "s3"
        ).info(str(source))
        return int(info.get("size") or 0), None
    path = Path(source)
    digest = hashlib.md5()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return path.stat().st_size, digest.hexdigest()


def build(source, out):
    """Write the slim index, carrying its provenance in the parquet key-value metadata."""
    table = project(source)
    size, md5 = source_stats(source)
    provenance = {
        b"nrds_source": str(source).encode(),
        b"nrds_source_bytes": str(size).encode(),
        b"nrds_source_rows": str(table.num_rows).encode(),
        b"nrds_columns": json.dumps(list(COLUMNS)).encode(),
    }
    if md5:
        provenance[b"nrds_source_md5"] = md5.encode()
    table = table.replace_schema_metadata({**(table.schema.metadata or {}), **provenance})
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(
        table,
        out,
        compression=COMPRESSION,
        compression_level=COMPRESSION_LEVEL,
        row_group_size=ROW_GROUP_SIZE,
        use_dictionary=list(DICTIONARY_ENCODED),
        column_encoding=COLUMN_ENCODING,
        version="2.6",
    )
    return table


def verify(source, out):
    """Check the artifact against every row of the source, and return what failed.

    Exhaustive rather than sampled, and in both directions: an id the artifact invented has to
    fail as loudly as one it lost. The source is re-read here rather than reusing the table
    build() wrote, so a truncated or corrupt output file is caught too.

    Comparison is per column via Array.equals, which treats nulls as equal to nulls -- that
    matters because five of the ten columns are legitimately null for whole id classes (a nexus
    has no area, a catchment has no divide_id), and a comparison that called those mismatches
    would fail on correct data.
    """
    failures = []
    expected = project(source)
    actual = pq.read_table(out)

    if actual.num_rows != expected.num_rows:
        failures.append(f"row count {actual.num_rows:,} != source {expected.num_rows:,}")

    missing_cols = [c for c in COLUMNS if c not in actual.schema.names]
    if missing_cols:
        failures.append(f"artifact is missing column(s) {', '.join(missing_cols)}")
        return failures, expected, actual

    exp_ids = set(expected.column("id").to_pylist())
    act_ids = set(actual.column("id").to_pylist())
    if exp_ids - act_ids:
        failures.append(f"{len(exp_ids - act_ids):,} source ids absent from the artifact")
    if act_ids - exp_ids:
        failures.append(f"{len(act_ids - exp_ids):,} artifact ids not present in the source")

    # Encodings, not just values. If pyarrow ever silently ignored column_encoding the file would
    # be 78 MiB instead of 45 and still read perfectly, so nothing else here would notice: a
    # correctness check passes and the --min-bytes floor is far below both. This is what protects
    # the 33 MiB the encodings buy.
    if not failures:
        meta = pq.ParquetFile(out).metadata
        group = meta.row_group(0)
        for i in range(meta.num_columns):
            column = group.column(i)
            wanted = COLUMN_ENCODING.get(column.path_in_schema)
            if wanted and wanted not in {str(e) for e in column.encodings}:
                failures.append(
                    f"column {column.path_in_schema} was written as "
                    f"{','.join(str(e) for e in column.encodings)}, not {wanted}"
                )

    if not failures:
        for name in COLUMNS:
            e = expected.column(name).combine_chunks()
            a = actual.column(name).combine_chunks()
            # Exact for every column, including the floats: the cast happens once in project()
            # and both sides run it, so any difference here is a write or read fault rather than
            # rounding. The encodings are lossless, which this is also checking.
            if not e.equals(a):
                failures.append(f"column {name} differs from the source")

    return failures, expected, actual


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--source", default=DEFAULT_SOURCE, help="index parquet, URL or path")
    ap.add_argument("--out", default=str(DEFAULT_OUT), help="artifact to write")
    ap.add_argument("--verify", action="store_true", default=True)
    ap.add_argument("--no-verify", dest="verify", action="store_false")
    ap.add_argument(
        "--verify-only",
        action="store_true",
        help="check an existing artifact at --out without rebuilding it",
    )
    ap.add_argument(
        "--min-bytes",
        type=int,
        default=30_000_000,
        help="fail if the artifact is smaller than this, so a truncated write cannot ship",
    )
    args = ap.parse_args()

    out = Path(args.out)
    started = time.time()

    if not args.verify_only:
        print(f"reading {args.source}")
        try:
            table = build(args.source, out)
        except SourceShapeError as err:
            print(f"\nFAILED: {err}", file=sys.stderr)
            return 2
        written = out.stat().st_size
        print(f"  {table.num_rows:,} rows, {len(COLUMNS)} columns, {time.time() - started:.1f}s")
        print(f"\nwrote {out}")
        print(f"  {written:,} bytes ({written / 1048576:.1f} MiB)")
        if written < args.min_bytes:
            print(
                f"\nFAILED: {written:,} bytes is below --min-bytes {args.min_bytes:,}; "
                f"refusing to ship a truncated artifact",
                file=sys.stderr,
            )
            return 3

    if not args.verify:
        return 0

    print("\nverifying against every row of the source")
    failures, expected, _ = verify(args.source, out)
    if failures:
        print("  FAILED", file=sys.stderr)
        for f in failures:
            print(f"    {f}", file=sys.stderr)
        return 1
    print(
        f"  {expected.num_rows:,} rows, {len(COLUMNS)} columns: ids match both ways, "
        f"every column identical to the source"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
