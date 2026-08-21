#!/usr/bin/env python3
"""Build the search index the app actually needs, which is 45 MiB rather than 103 MB.

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
header records the source's size, row count and -- for a local source -- its MD5, which S3 also
reports as the ETag for a single-part upload. A stale artifact should be detectable rather than
silently wrong.

Why pyarrow and not duckdb: pyarrow, fsspec and s3fs are already dependencies in
pyproject.toml. duckdb is not, and adding a runtime dependency to ship one build step is a
poor trade.
"""

import argparse
import hashlib
import json
import sys
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator, Optional, Sequence

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq

USAGE = """examples:
  # the frontend 404s without this artifact, so a dev server needs it built once
  python3 scripts/build_slim_index.py

  # from a local copy, which is much faster than pulling 103 MB again
  python3 scripts/build_slim_index.py --source scripts/indexes/hydrofabric_index.parquet

  # check an artifact somebody else built, without rebuilding it
  python3 scripts/build_slim_index.py --verify-only --out <path>

  # iterate on the projection without paying for the exhaustive check each time
  python3 scripts/build_slim_index.py --out /tmp/slim.parquet --no-verify
"""

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

# float32 costs at most 0.42 m, against a screen pixel of about 30 m at the zoom the map flies
# to. float64 would roughly double the artifact for accuracy nothing can see.
FLOAT32_COLUMNS = ("lon", "lat")

ROW_GROUP_SIZE = 100_000
COMPRESSION = "zstd"
COMPRESSION_LEVEL = 9

# Chosen per column, and worth more than the codec here: default encodings give 78.3 MiB against
# 44.7 MiB for these. Both are lossless. Verified readable by duckdb 1.4.4 and by duckdb-wasm
# 1.30 -- the same wasm binary the browser loads -- through registerFileBuffer + read_parquet.
STRING_ENCODED = ("id", "toid", "divide_id")
FLOAT_ENCODED = ("lon", "lat", "areasqkm", "tot_drainage_areasqkm", "lengthkm")
DICTIONARY_ENCODED = ("vpuid", "has_flowline")
COLUMN_ENCODING = {
    **{c: "DELTA_BYTE_ARRAY" for c in STRING_ENCODED},
    **{c: "BYTE_STREAM_SPLIT" for c in FLOAT_ENCODED},
}

REMOTE_SCHEMES = ("http://", "https://", "s3://")


class SourceShapeError(RuntimeError):
    """The upstream index is not the shape this script knows how to read."""


def is_remote(source: str) -> bool:
    return str(source).startswith(REMOTE_SCHEMES)


@contextmanager
def open_source(source: str) -> Iterator[pq.ParquetFile]:
    """A ParquetFile for a local path or a URL, closed on the way out.

    fsspec.open returns a wrapper that owns the connection; discarding it after taking the inner
    file leaves the connection open for the life of the process. Short-lived as this script is,
    it also runs twice per image build and once per CI matrix leg.
    """
    if is_remote(source):
        with __import__("fsspec").open(str(source), "rb") as handle:
            yield pq.ParquetFile(handle)
    else:
        yield pq.ParquetFile(str(source))


def require_columns(schema: pa.Schema, source: str) -> None:
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


def project(source: str) -> pa.Table:
    """Read the ten columns, cast the coordinates, and sort by id."""
    with open_source(source) as pf:
        require_columns(pf.schema_arrow, source)
        table = pf.read(columns=list(COLUMNS))
    for name in FLOAT32_COLUMNS:
        i = table.schema.get_field_index(name)
        table = table.set_column(i, name, pc.cast(table.column(name), pa.float32()))
    return table.sort_by([("id", "ascending")])


def source_stats(source: str) -> tuple[int, Optional[str]]:
    """Size and, for a local file, MD5 of the input, so an artifact can be traced to it.

    MD5 is local-only on purpose: S3 reports the same value as the ETag for a single-part
    upload, so hashing 103 MB back over the network to record provenance buys nothing.
    """
    if is_remote(source):
        fs = __import__("fsspec").filesystem("https" if source.startswith("http") else "s3")
        return int(fs.info(str(source)).get("size") or 0), None
    path = Path(source)
    digest = hashlib.md5()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return path.stat().st_size, digest.hexdigest()


def build(source: str, out: str) -> pa.Table:
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


def encoding_faults(out: str) -> list[str]:
    """Every row group must carry the encodings that were asked for.

    Values alone cannot catch this. A default-encoded file decodes perfectly, matches the source
    row for row, and clears the size floor by a wide margin -- it is only 33 MiB bigger. Checked
    across all row groups rather than the first, since nothing guarantees they agree.
    """
    metadata = pq.ParquetFile(out).metadata
    faults = []
    for group in range(metadata.num_row_groups):
        for i in range(metadata.num_columns):
            column = metadata.row_group(group).column(i)
            wanted = COLUMN_ENCODING.get(column.path_in_schema)
            if wanted and wanted not in {str(e) for e in column.encodings}:
                faults.append(
                    f"row group {group}: column {column.path_in_schema} was written as "
                    f"{','.join(str(e) for e in column.encodings)}, not {wanted}"
                )
                break
    return faults


def verify(source: str, out: str, expected: Optional[pa.Table] = None) -> tuple[list[str], int]:
    """Check the written artifact against what it was supposed to contain.

    Exhaustive rather than sampled, and in both directions: an id the artifact invented has to
    fail as loudly as one it lost.

    What this can and cannot catch is worth being precise about. It proves the write and read
    path: truncation, corruption, a lost or invented row, a changed value, a dropped column, a
    lost encoding. It cannot prove `project` itself, because the expected table comes from that
    same function -- a deterministic bug there (the wrong column, the wrong cast, the wrong sort
    key) would appear identically on both sides and pass. Guarding that needs a test against
    known values, which tests/test_build_slim_index.py provides; this guards the artifact.

    `expected` is the table build() just wrote, passed in to avoid reading a 103 MB source twice
    per build. Without it the source is re-read, which is what --verify-only has to do.

    Comparison is per column via Array.equals, which treats nulls as equal to nulls -- five of
    the ten columns are legitimately null for whole id classes (a nexus has no area, a catchment
    has no divide_id), and a comparison that called those mismatches would fail on correct data.
    """
    failures: list[str] = []
    if not Path(out).is_file():
        # Checked before the source is read: --verify-only on a missing path should not spend
        # 103 MB discovering there is nothing to compare against.
        return [f"{out}: no artifact to verify"], 0
    if expected is None:
        expected = project(source)
    actual = pq.read_table(out)

    if actual.num_rows != expected.num_rows:
        failures.append(f"row count {actual.num_rows:,} != source {expected.num_rows:,}")

    missing = [c for c in COLUMNS if c not in actual.schema.names]
    if missing:
        failures.append(f"artifact is missing column(s) {', '.join(missing)}")
        return failures, expected.num_rows

    failures.extend(encoding_faults(out))

    if not failures:
        for name in COLUMNS:
            e = expected.column(name).combine_chunks()
            a = actual.column(name).combine_chunks()
            if not e.equals(a):
                failures.append(f"column {name} differs from the source")
        # Only when a column already disagrees: two 2M-entry sets cost hundreds of MB, and the
        # per-column check above already proves membership and order when it passes.
        if failures:
            failures.extend(_id_set_faults(expected, actual))

    return failures, expected.num_rows


def _id_set_faults(expected: pa.Table, actual: pa.Table) -> list[str]:
    """Which ids went missing or were invented, for a message worth reading."""
    exp_ids = set(expected.column("id").to_pylist())
    act_ids = set(actual.column("id").to_pylist())
    faults = []
    if exp_ids - act_ids:
        faults.append(f"{len(exp_ids - act_ids):,} source ids absent from the artifact")
    if act_ids - exp_ids:
        faults.append(f"{len(act_ids - exp_ids):,} artifact ids not present in the source")
    return faults


class _HelpFormat(argparse.RawDescriptionHelpFormatter, argparse.ArgumentDefaultsHelpFormatter):
    """Keep the usage examples readable and still print every default."""


def main(argv: Optional[Sequence[str]] = None) -> int:
    ap = argparse.ArgumentParser(
        description=__doc__.split("\n\n")[0],
        epilog=USAGE,
        formatter_class=_HelpFormat,
    )
    ap.add_argument("--source", default=DEFAULT_SOURCE, help="index parquet, URL or path")
    ap.add_argument("--out", default=str(DEFAULT_OUT), help="artifact to write")
    ap.add_argument("--verify", action="store_true", default=True, help=argparse.SUPPRESS)
    ap.add_argument(
        "--no-verify",
        dest="verify",
        action="store_false",
        help="skip the exhaustive check, for iterating on the projection",
    )
    ap.add_argument(
        "--verify-only",
        action="store_true",
        help="check the artifact at --out without rebuilding it",
    )
    ap.add_argument(
        "--min-bytes",
        type=int,
        default=30_000_000,
        help="fail if the artifact is smaller than this, so a truncated write cannot ship",
    )
    args = ap.parse_args(argv)

    if args.verify_only and not args.verify:
        # Together these mean "do nothing and say it went well", which is the one outcome a
        # script whose whole job is refusing to ship an unverified artifact must never produce.
        ap.error("--verify-only and --no-verify cannot be combined: that would check nothing")

    out = Path(args.out)
    started = time.time()
    built: Optional[pa.Table] = None

    if not args.verify_only:
        print(f"reading {args.source}")
        try:
            built = build(args.source, out)
        except SourceShapeError as err:
            print(f"\nFAILED: {err}", file=sys.stderr)
            return 2
        written = out.stat().st_size
        print(f"  {built.num_rows:,} rows, {len(COLUMNS)} columns, {time.time() - started:.1f}s")
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
    failures, rows = verify(args.source, out, expected=built)
    if failures:
        print("  FAILED", file=sys.stderr)
        for f in failures:
            print(f"    {f}", file=sys.stderr)
        return 1
    print(
        f"  {rows:,} rows, {len(COLUMNS)} columns: ids match both ways, "
        f"every column identical to the source"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
