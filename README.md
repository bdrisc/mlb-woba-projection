# 2027 wOBA Projection Model

[Open the live app](https://bdrisc.github.io/mlb-woba-projection/)

What would Juan Soto's 2027 projection look like if he chased less often? This app starts with a saved wOBA projection for each of 462 MLB hitters and lets you change one or more parts of their hitting profile. The inputs cover plate discipline, contact quality, batted-ball direction and type, swing and stance, and sprint speed.

## Try a scenario

Pick Juan Soto, add **O-Swing%**, and enter `-2`. That's a drop of two percentage points in chase rate. Run the same edit in both modes and compare the results table.

- **Manual:** Applies your edits. The other inputs stay fixed unless a rule requires an adjustment, such as keeping the batted-ball shares at 100%.
- **Linked:** Keeps your edits fixed and uses historical season-to-season changes to estimate how the remaining skills might move. The table separates your edits, the estimated changes, and any rule adjustments.

## How it works

The app scores the starting and edited skill profiles with the same wOBA response model and adds the difference to the saved 2027 baseline. That means an empty scenario returns the original projection.

The linked estimates use Statcast player-season changes ending in 2018–2026, with fewer years for newer measurements like bat speed and stance. The app skips linked adjustments when the historical sample is too small or the requested combination is too far from what it has seen. These relationships describe how skills have moved together; they don't tell us that changing one skill will cause another to change. The 2027 outcomes are still needed to evaluate the saved projections prospectively.

## Run a scenario in Python

The model training and backtests were done in Python notebooks. This repo includes the frozen model export and two implementations of the scenario engine: `engine.py` for Python analysis and `engine.js` for the browser. The Python engine applies the same scoring, linked adjustments, historical support checks, and profile constraints. It does not retrain the model.

With Python 3.9 or newer, run this from the repository root (no third-party packages required):

```sh
python engine.py "Juan Soto" --edit avg_ev_mph=3 --mode linked
```

The command prints JSON with the projected wOBA, its change from the saved baseline, metric-by-metric adjustments, and warning flags. Repeat `--edit` to change several metrics, and pass `--mode manual` to disable linked adjustments.

For a notebook or another Python program:

```python
from engine import load_pack, simulate

pack = load_pack()
player = next(row for row in pack["rows"] if row["Name"] == "Juan Soto")
result = simulate(pack, player, {"avg_ev_mph": 3}, mode="linked")
print(result["woba"], result["effect"])
```

Run `python -m unittest discover -s tests -p 'test_python_engine.py'` to verify the frozen baselines. If Node.js is installed, the suite also checks both modes against the browser engine.

## Run the website locally

From the repository root, run:

```sh
python -m http.server 8000
```

Open [localhost:8000](http://localhost:8000). The app runs in the browser using the checked-in data export. There's no build step or database.

Data: [Baseball Savant / Statcast](https://baseballsavant.mlb.com/).
