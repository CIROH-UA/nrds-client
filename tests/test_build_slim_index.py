"""The slim index generator must reproduce the source exactly, or fail the build.

The artifact these tests guard replaces a 103 MB download that the search box and the Feature
Information panel both read. A projection that silently loses a column empties that panel; one
that silently loses rows makes ids unfindable. Neither failure is visible in the output size,
so the generator ships its own exhaustive verification and these tests check that the
verification actually works -- a verifier that cannot fail is worse than none.

Fixtures are synthetic and tiny. The exhaustive check against the real 103 MB file is what the
generator does at build time; what needs testing here is the logic around it.
"""

import pyarrow as pa
import pyarrow.parquet as pq
import pytest

import build_slim_index as gen


def write_source(path, rows=None, drop=(), extra=None):
    """A parquet shaped like the upstream index, with the four rows the tests care about."""
    data = rows or {
        "id": ["cat-1", "cat-2", "nex-3", "wb-4"],
        "vpuid": ["01", "01", "16", "16"],
        "lon": [-95.123456789, -95.2, None, -96.5],
        "lat": [41.987654321, 41.5, None, 42.25],
        "toid": ["nex-3", "nex-3", "wb-4", "nex-9"],
        "divide_id": [None, None, None, "cat-4"],
        "has_flowline": [True, True, None, None],
        "areasqkm": [2603.0754007830, 1.5, None, None],
        "tot_drainage_areasqkm": [4491.416253996, 2.0, None, None],
        "lengthkm": [12.3456789, 0.5, None, None],
    }
    data = {k: v for k, v in data.items() if k not in drop}
    if extra:
        data.update(extra)
    pq.write_table(pa.table(data), path)
    return path


def write_like_generator(table, path):
    """Write a fixture the way the generator does, so a test isolates the fault it injects.

    Without this the encoding check fires first and every corruption test reports the same thing.
    """
    pq.write_table(
        table,
        path,
        compression=gen.COMPRESSION,
        compression_level=gen.COMPRESSION_LEVEL,
        row_group_size=gen.ROW_GROUP_SIZE,
        use_dictionary=list(gen.DICTIONARY_ENCODED),
        column_encoding=gen.COLUMN_ENCODING,
        version="2.6",
    )


def build(tmp_path, **kwargs):
    src = write_source(tmp_path / "source.parquet", **kwargs)
    out = tmp_path / "slim.parquet"
    return src, out, gen.build(str(src), str(out))


def test_projects_every_row_and_keeps_vpuid(tmp_path):
    src, out, table = build(tmp_path)
    assert table.num_rows == 4
    got = dict(zip(table.column("id").to_pylist(), table.column("vpuid").to_pylist()))
    assert got == {"cat-1": "01", "cat-2": "01", "nex-3": "16", "wb-4": "16"}


def test_keeps_every_column_the_panel_labels(tmp_path):
    _, _, table = build(tmp_path)
    assert set(table.schema.names) == set(gen.COLUMNS)
    for column in gen.PANEL_COLUMNS:
        assert column in table.schema.names


def test_records_provenance_in_metadata(tmp_path):
    src, out, _ = build(tmp_path)
    meta = pq.read_table(out).schema.metadata
    assert meta[b"nrds_source_rows"] == b"4"
    assert int(meta[b"nrds_source_bytes"]) == src.stat().st_size
    assert len(meta[b"nrds_source_md5"]) == 32


def test_null_coordinates_survive_as_nulls(tmp_path):
    _, _, table = build(tmp_path)
    lon = dict(zip(table.column("id").to_pylist(), table.column("lon").to_pylist()))
    assert lon["nex-3"] is None


def test_coordinate_cast_stays_within_half_a_metre(tmp_path):
    _, _, table = build(tmp_path)
    lon = dict(zip(table.column("id").to_pylist(), table.column("lon").to_pylist()))
    # 0.5 m is about 4.5e-6 degrees of longitude; float32 is well inside that.
    assert abs(lon["cat-1"] - (-95.123456789)) < 4.5e-6


def test_area_columns_are_not_downcast(tmp_path):
    """Areas keep float64: the panel prints them to four decimals and readers compare them."""
    _, _, table = build(tmp_path)
    assert table.schema.field("areasqkm").type == pa.float64()
    assert table.schema.field("tot_drainage_areasqkm").type == pa.float64()
    area = dict(zip(table.column("id").to_pylist(), table.column("areasqkm").to_pylist()))
    assert area["cat-1"] == 2603.0754007830


def test_rows_are_sorted_by_id(tmp_path):
    _, _, table = build(tmp_path)
    ids = table.column("id").to_pylist()
    assert ids == sorted(ids)


def test_missing_column_names_the_column(tmp_path):
    src = write_source(tmp_path / "source.parquet", drop=("vpuid",))
    with pytest.raises(gen.SourceShapeError, match="vpuid"):
        gen.build(str(src), str(tmp_path / "slim.parquet"))


def test_unexpected_extra_columns_are_ignored(tmp_path):
    _, _, table = build(tmp_path, extra={"WeirC": [1.0, 2.0, 3.0, 4.0]})
    assert "WeirC" not in table.schema.names
    assert table.num_rows == 4


def test_verification_passes_on_a_faithful_artifact(tmp_path):
    src, out, _ = build(tmp_path)
    failures, _, _ = gen.verify(str(src), str(out))
    assert failures == []


@pytest.mark.parametrize(
    "mutate, expected",
    [
        (lambda t: t.slice(0, t.num_rows - 1), "row count"),
        (lambda t: t.drop(["areasqkm"]), "missing column"),
        (
            lambda t: t.set_column(
                t.schema.get_field_index("vpuid"), "vpuid", pa.array(["99", "01", "16", "16"])
            ),
            "column vpuid differs",
        ),
        (
            lambda t: t.set_column(
                t.schema.get_field_index("id"),
                "id",
                pa.array(["cat-999999", "cat-2", "nex-3", "wb-4"]),
            ),
            "absent from the artifact",
        ),
    ],
)
def test_verification_catches_corruption(tmp_path, mutate, expected):
    """Each mutation class must be caught, or the build-time check is decoration."""
    src, out, table = build(tmp_path)
    bad = tmp_path / "bad.parquet"
    write_like_generator(mutate(table), bad)
    failures, _, _ = gen.verify(str(src), str(bad))
    assert failures, f"verification missed: {expected}"
    assert any(expected in f for f in failures), failures


def test_written_encodings_are_the_tuned_ones(tmp_path):
    """The encodings are the difference between 45 MiB and 78, so they are worth asserting.

    Values alone cannot catch a regression here: a default-encoded file reads perfectly and is
    only larger, which no correctness check and no size floor would notice.
    """
    _, out, _ = build(tmp_path)
    metadata = pq.ParquetFile(out).metadata
    group = metadata.row_group(0)
    written = {
        group.column(i).path_in_schema: {str(e) for e in group.column(i).encodings}
        for i in range(metadata.num_columns)
    }
    for column, wanted in gen.COLUMN_ENCODING.items():
        assert wanted in written[column], f"{column} was written as {written[column]}"


def test_verification_catches_default_encodings(tmp_path):
    src, out, table = build(tmp_path)
    plain = tmp_path / "plain.parquet"
    pq.write_table(table, plain, compression="zstd")

    failures, _, _ = gen.verify(str(src), str(plain))

    assert any("DELTA_BYTE_ARRAY" in f for f in failures), failures
