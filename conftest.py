"""Make `scripts/` importable from the test suite.

`scripts/` holds build-time tooling rather than application code, so it is not a package and is
not on the path. `testpaths = ["tests"]` means pytest's rootdir is the repo, so a conftest here
is the least invasive way to let tests import that tooling without turning it into one.

Coverage is scoped to `["tethysapp"]` in pyproject.toml, so tests of these scripts contribute
nothing to the coverage figure. That is intentional: they guard the build, not the app.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "scripts"))
