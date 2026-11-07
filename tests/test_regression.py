"""Regression tests for the packaging gate and the local filter boundaries.

These tests do not contact blocklist hosts. Source documents are in-memory
fixtures or the committed src/data/blocklist.json file.
"""

import hashlib
import importlib.util
import json
import re
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQUIREMENT_NAME = re.compile(r"^([A-Za-z0-9][A-Za-z0-9._-]*)")
CHANNEL_ID = re.compile(r"^UC[A-Za-z0-9_-]{22}$")
HANDLE = re.compile(r"^@[A-Za-z0-9_.-]{3,}$")
UC_ID = "UCabcdefghijklmnopqrstuv"


def installable_requirement_names(text: str) -> list[str]:
    names = []
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line or line.startswith("-"):
            continue
        match = REQUIREMENT_NAME.match(line)
        if match is None:
            raise AssertionError(f"unparsed requirement: {line}")
        names.append(match.group(1).lower().replace("_", "-"))
    return names


def load_module(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise AssertionError(f"could not load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def member_digests(zip_path: Path) -> dict[str, str]:
    digests = {}
    with zipfile.ZipFile(zip_path) as archive:
        for info in archive.infolist():
            if info.is_dir():
                continue
            digests[info.filename] = hashlib.sha256(archive.read(info.filename)).hexdigest()
    return digests


class RequirementsGateTests(unittest.TestCase):
    def test_requirements_file_requests_no_distribution(self) -> None:
        text = (ROOT / "requirements.txt").read_text(encoding="utf-8")
        self.assertEqual(installable_requirement_names(text), [])
        self.assertNotIn("python-version", installable_requirement_names(text))

    def test_historical_interpreter_line_is_the_python_version_distribution(self) -> None:
        # This is the line that failed every recorded main check.
        # Pip resolves it as the PyPI project python-version, whose response
        # on those runs listed only 0.0.2.
        names = installable_requirement_names("python-version >= 3.9\n")
        self.assertEqual(names, ["python-version"])

    def test_pip_install_succeeds_without_an_index(self) -> None:
        completed = subprocess.run(
            [
                sys.executable,
                "-m",
                "pip",
                "install",
                "-r",
                "requirements.txt",
                "--no-index",
                "--disable-pip-version-check",
            ],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(
            completed.returncode,
            0,
            completed.stdout + completed.stderr,
        )


class ParseBoundaryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.agg = load_module(
            "ytm_blocklist_aggregator",
            ROOT / "src" / "blocklist_aggregator.py",
        )

    def test_parsers_keep_channel_urls_and_drop_noise(self) -> None:
        ublock = "\n".join(
            [
                "! comment",
                "",
                f"https://music.youtube.com/channel/{UC_ID}",
                f"https://www.youtube.com/channel/{UC_ID}",
                "@ValidHandle",
                "not a channel",
                "@ab",
                "UC-too-short",
            ]
        )
        parsed = self.agg.parse_ublock(ublock, "fixture", "medium")
        values = [entry.value for entry in parsed]
        self.assertEqual(values.count(UC_ID), 2)
        self.assertIn("@ValidHandle", values)
        self.assertNotIn("@ab", values)
        self.assertNotIn("not a channel", values)

        urls = self.agg.parse_url_list(
            "\n".join(
                [
                    f"https://music.youtube.com/channel/{UC_ID}",
                    f"https://www.youtube.com/channel/{UC_ID}",
                    "! nope",
                ]
            ),
            "fixture",
            "high",
        )
        self.assertEqual([entry.value for entry in urls], [UC_ID])

        ais = self.agg.parse_aislist(
            "\n".join(["@ValidHandle", "@ab", UC_ID, "UC-too-short", "plain words"]),
            "fixture",
            "high",
        )
        self.assertEqual([entry.value for entry in ais], ["@ValidHandle", UC_ID])

    def test_json_array_skips_blank_and_nameless_items(self) -> None:
        data = [
            "Artist One",
            "  ",
            {"name": "Artist Two"},
            {"artist": "Artist Three"},
            {"channel": "Artist Four"},
            {"nope": 1},
            3,
        ]
        parsed = self.agg.parse_json_array(data, "fixture", "low")
        self.assertEqual(
            [entry.value for entry in parsed],
            ["Artist One", "Artist Two", "Artist Three", "Artist Four"],
        )
        self.assertEqual(self.agg.parse_json_array({"name": "nope"}, "fixture", "low"), [])

    def test_dedupe_prefers_higher_confidence_and_preserves_channel_id_case(self) -> None:
        low = self.agg.BlockEntry("a", "channel", "@AbC", "low", "@AbC")
        high = self.agg.BlockEntry("b", "channel", "@abc", "high", "@abc")
        merged = self.agg.dedupe([low, high])
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0].confidence, "high")

        left = self.agg.BlockEntry("a", "channel", UC_ID, "high", UC_ID)
        right = self.agg.BlockEntry("b", "channel", UC_ID.upper(), "low", UC_ID.upper())
        self.assertEqual(len(self.agg.dedupe([left, right])), 2)

    def test_total_fetch_failure_does_not_overwrite_the_fixture(self) -> None:
        agg = self.agg
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "blocklist.json"
            target.write_text('{"total": 1}', encoding="utf-8")
            agg.OUTPUT_PATH = str(target)
            agg.fetch_text = lambda url, timeout=30: ""
            with self.assertRaises(SystemExit) as raised:
                agg.main()
            self.assertEqual(raised.exception.code, 1)
            self.assertEqual(target.read_text(encoding="utf-8"), '{"total": 1}')

    def test_committed_blocklist_fixture_is_internally_consistent(self) -> None:
        payload = json.loads((ROOT / "src" / "data" / "blocklist.json").read_text(encoding="utf-8"))
        entries = payload["entries"]
        self.assertEqual(payload["total"], len(entries))
        self.assertGreater(payload["total"], 0)
        self.assertEqual(
            set(payload["sources"]),
            {
                "stevoisiak",
                "muhdiboy_ytm",
                "aislist_blocklist",
                "aislist_warnlist",
                "cevval_ytm_ai",
                "soul_over_ai",
            },
        )
        for entry in entries:
            self.assertEqual(entry["kind"], "channel")
            self.assertIn(entry["confidence"], {"high", "medium", "low"})
            value = entry["value"]
            self.assertTrue(CHANNEL_ID.match(value) or HANDLE.match(value), value)


class PackagingTests(unittest.TestCase):
    def test_workflow_split_between_fixture_packaging_and_scheduled_fetch(self) -> None:
        ci = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
        release = (ROOT / ".github" / "workflows" / "release.yml").read_text(encoding="utf-8")
        schedule = (ROOT / ".github" / "workflows" / "schedule.yml").read_text(encoding="utf-8")
        self.assertIn("python3 build/build.py --no-download", ci)
        self.assertIn("python3 build/build.py --no-download", release)
        self.assertIn("python3 -m unittest discover -s tests -v", ci)
        self.assertIn("python3 -m unittest discover -s tests -v", release)
        self.assertIn("python3 -m unittest discover -s tests -v", schedule)
        self.assertNotIn("--no-download", schedule)
        self.assertIn("python3 build/build.py\n", schedule)

    def test_verify_build_rejects_an_extension_without_the_blocklist(self) -> None:
        mod = load_module("ytm_build_missing", ROOT / "build" / "build.py")
        names = [
            "manifest.json",
            "background.js",
            "content.js",
            "content.css",
            "popup.html",
            "popup.js",
            "options.html",
            "options.js",
        ]
        with tempfile.TemporaryDirectory() as tmp:
            firefox = Path(tmp) / "firefox"
            chrome = Path(tmp) / "chrome"
            for directory in (firefox, chrome):
                directory.mkdir()
                for name in names:
                    (directory / name).write_text("", encoding="utf-8")
            mod.FIREFOX_DIR = firefox
            mod.CHROME_DIR = chrome
            self.assertFalse(mod.verify_build())
            for directory in (firefox, chrome):
                (directory / "blocklist.json").write_text("{}", encoding="utf-8")
            self.assertTrue(mod.verify_build())

    def test_offline_build_packages_fixture_and_does_not_fetch(self) -> None:
        mod = load_module("ytm_build_offline", ROOT / "build" / "build.py")

        def fail_if_called() -> None:
            raise AssertionError("aggregator ran during --no-download")

        mod.run_aggregator = fail_if_called
        with tempfile.TemporaryDirectory() as tmp:
            mod.OUTPUT_DIR = Path(tmp)
            mod.main(["--no-download"])
            first = {
                name: member_digests(Path(tmp) / name)
                for name in (
                    "ytm-deslop-firefox-v1.zip",
                    "ytm-deslop-chrome-v1.zip",
                    "ytm-deslop-userscript-v1.zip",
                )
            }
            mod.main(["--no-download"])
            second = {
                name: member_digests(Path(tmp) / name)
                for name in first
            }
            self.assertEqual(first, second)
            for name in ("ytm-deslop-firefox-v1.zip", "ytm-deslop-chrome-v1.zip"):
                digests = first[name]
                self.assertIn("manifest.json", digests)
                self.assertIn("blocklist.json", digests)
                self.assertTrue(all(not Path(member).is_absolute() for member in digests))
                payload = json.loads(zipfile.ZipFile(Path(tmp) / name).read("blocklist.json"))
                self.assertEqual(payload["total"], len(payload["entries"]))
                self.assertGreater(payload["total"], 0)
            userscript = first["ytm-deslop-userscript-v1.zip"]
            self.assertEqual(set(userscript), {"userscript.js", "userscript.json"})

    def test_default_build_still_invokes_the_aggregator(self) -> None:
        mod = load_module("ytm_build_default", ROOT / "build" / "build.py")
        calls = {"count": 0}

        def record() -> None:
            calls["count"] += 1

        mod.run_aggregator = record
        mod.copy_shared_resources = lambda: None
        mod.verify_build = lambda: True
        mod.package_extension = lambda src_dir, output_name: Path(output_name)
        with tempfile.TemporaryDirectory() as tmp:
            mod.OUTPUT_DIR = Path(tmp)
            mod.SRC_DIR = ROOT / "src"
            mod.main([])
        self.assertEqual(calls["count"], 1)


class BrowserFilterTests(unittest.TestCase):
    def test_userscript_and_extension_matrix(self) -> None:
        completed = subprocess.run(
            ["node", "tests/browser_filter_matrix.js"],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(completed.returncode, 0, completed.stdout + completed.stderr)
        self.assertIn("browser filter matrix ok", completed.stdout)

    def test_extension_content_scripts_stay_in_sync(self) -> None:
        chrome = (ROOT / "build" / "chrome" / "content.js").read_bytes()
        firefox = (ROOT / "build" / "firefox" / "content.js").read_bytes()
        self.assertEqual(chrome, firefox)


if __name__ == "__main__":
    unittest.main()
