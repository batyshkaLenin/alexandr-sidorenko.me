#!/usr/bin/env python3
"""Run controlled production-release tests; never authenticate or deploy."""
import argparse
from pathlib import Path
import sys
import unittest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--public-dir", help="accepted for the contract runner; source tests only")
    parser.parse_args()
    tests = Path(__file__).resolve().parent.parent / "tests"
    suite = unittest.defaultTestLoader.discover(str(tests), pattern="test_deploy_production.py")
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return 0 if result.wasSuccessful() and result.testsRun else 1


if __name__ == "__main__":
    sys.exit(main())
