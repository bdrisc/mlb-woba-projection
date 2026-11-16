"""Verify the Python implementation against the shipped browser engine."""
import json
import math
from pathlib import Path
import shutil
import subprocess
import unittest

from engine import load_pack, simulate

ROOT = Path(__file__).resolve().parents[1]
BROWSER_CASES = """
const fs=require('node:fs'), engine=require('./engine.js');
const pack=engine.parsePack(JSON.parse(fs.readFileSync('hitter_what_if_app_data.json')));
const players=new Map(pack.rows.map(p => [p.MLBAM_ID,p]));
const cases=JSON.parse(fs.readFileSync(0,'utf8'));
process.stdout.write(JSON.stringify(cases.map(({id,edits,side,mode})=>{
  try { return engine.simulate(pack,players.get(id),side,edits,mode); }
  catch (error) { return {error:error.message}; }
})));
"""


class PythonEngineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pack = load_pack()
        cls.players = {p["MLBAM_ID"]: p for p in cls.pack["rows"]}

    def test_frozen_baselines(self):
        for p in self.players.values():
            for side in ("L", "R"):
                result = simulate(self.pack, p, side=side)
                self.assertEqual(result["effect"], 0)
                self.assertEqual(result["woba"], p["anchor"])

    @unittest.skipUnless(shutil.which("node"), "Node.js is needed for browser parity")
    def test_scenarios_match_browser(self):
        selected = {"Juan Soto", "Aaron Judge", "Steven Kwan", "Paul Goldschmidt"}
        named = [p for p in self.players.values() if p["Name"] in selected]
        self.assertEqual(len(named), len(selected))
        cases = [
            dict(id=p["MLBAM_ID"], edits=edits, side=side, mode=mode)
            for p in named for side in ("L", "R") for mode in ("manual", "linked")
            for edits in ({}, {"avg_ev_mph": 3}, {"avg_ev_mph": 5}, {"chase": -2, "hard_hit": 2},
                          {"groundball": 8, "pull_air_pp": 3}, {"groundball": 95}, {"barrel": 45, "hard_hit": -20})
        ]
        expected = json.loads(subprocess.run(
            ["node", "-e", BROWSER_CASES], input=json.dumps(cases), encoding="utf-8",
            cwd=ROOT, check=True, capture_output=True,
        ).stdout)
        self.assertEqual(len(cases), len(expected))
        for case, want in zip(cases, expected):
            with self.subTest(case=case):
                p = self.players[case["id"]]
                args = dict(side=case["side"], mode=case["mode"])
                if "error" in want:
                    with self.assertRaises(ValueError) as raised:
                        simulate(self.pack, p, case["edits"], **args)
                    self.assertEqual(str(raised.exception), want["error"])
                else:
                    self.assert_same(simulate(self.pack, p, case["edits"], **args), want)

    def assert_same(self, actual, expected):
        if isinstance(expected, dict):
            self.assertEqual(actual.keys(), expected.keys())
            for key in expected:
                self.assert_same(actual[key], expected[key])
        elif isinstance(expected, list):
            self.assertEqual(len(actual), len(expected))
            for value, target in zip(actual, expected):
                self.assert_same(value, target)
        elif isinstance(expected, (float, int)):
            self.assertTrue(math.isclose(actual, expected, abs_tol=1e-10, rel_tol=0), (actual, expected))
        else:
            self.assertEqual(actual, expected)
