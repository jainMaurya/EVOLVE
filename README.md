# EVOLVE — Browser game + Python RL sidecar

This edition keeps the 3D game in the browser while a separate Python process runs the reinforcement-learning agent. The browser talks to Python over local HTTP on `127.0.0.1:8000`.

## Start on Windows
1. Extract the ZIP.
2. Double-click `run_windows.bat`.
3. Wait for the browser tab to open at `http://127.0.0.1:8000`.
4. Click **ENTER WORLD**.

No pip packages are required. Python uses only its standard library. The game loads Three.js from jsDelivr, so internet is needed on first launch.

## Start from VS Code
Open the folder in VS Code terminal and run:
```powershell
py server.py
```
Then open `http://127.0.0.1:8000`.

## Controls
- WASD: move
- Mouse: third-person camera
- Shift: sprint
- Left click: place selected block on the face you're aiming at
- Right click: harvest tree/stone or attack an animal/NPC
- 1: wood, 2: stone, 3: delete block tool, 4: food
- E: interact with nearby villagers
- Esc: release mouse

## RL implementation
`rl_agent.py` is the Python Q-learning implementation. `server.py` runs it as a local API process and serves the browser game. The browser sends player actions and state to `/api/observe`; Python updates Q-values, persists them in `data/q_table.json`, and returns the current policy. The policy chooses gather/build/trade/explore behaviour.

This is tabular online Q-learning, not deep RL. The current state/reward design is a prototype and needs further experimentation for research-grade conclusions.

## Notes
- `ursina.ico` warnings belong to the earlier Ursina edition; this edition does not use Ursina.
- The browser game and RL server must remain running together.
- If port 8000 is busy, close the other local server or change the port in `server.py`.


## Updated movement and camera controls
- **W / A / S / D** or **Arrow keys**: move.
- **Mouse**: look around (click the game to capture the mouse).
- **Mouse wheel**: zoom camera in and out. Zoom all the way in to switch to first-person; zoom out for third-person.
- **Space**: jump. Jump triggers only while grounded.
- **Shift**: sprint.
- **Esc**: release the mouse.

- **V**: toggle first-person / third-person directly. The game starts in third-person.


## New survival and autonomy features
- Move the mouse down to look down; move it up to look up.
- Select slot **4** and left-click to eat one food and restore up to 25 health.
- Hunt animals with right-click for food. Harvest leaves for food; chopping a trunk can occasionally yield fruit.
- The health display includes a bar.
- Each in-game day lasts four minutes; the HUD counts down to night.
- Click **RL AUTONOMY: OFF** to let the Python Q-learning agent act every 12 seconds. It can build, hunt, gather, trade, or explore. Its build/hunt preference is influenced by your observed building and hunting behaviour.

## VPT dataset + hybrid learning integration

This build adds a **VPT action-demonstration prior** to the existing EVOLVE Python agent.
It does not run OpenAI's original VPT neural network inside Three.js. VPT was trained for
Minecraft observations/actions; EVOLVE has a different renderer, world state and control
semantics. The adapter therefore converts a subset of released human keyboard/mouse action
traces into coarse action frequencies and action-to-action transition probabilities.

### Prepare the VPT prior (one-time setup)

From the project folder in a VS Code terminal:

```powershell
py vpt_pretrain.py --download --max-files 3
```

This downloads up to three small VPT `.jsonl` action segments from the official 6.x
contractor-data index. It intentionally does **not** download the associated MP4 videos
or world checkpoints. Then it creates `data/vpt_policy.json`.

To use an existing local set of VPT JSONL files instead:

```powershell
py vpt_pretrain.py --data-dir data/vpt
```

The official VPT project and dataset format are documented at:
https://github.com/openai/video-pre-training

### Hybrid runtime

1. `vpt_pretrain.py` converts VPT action traces into a smoothed imitation prior.
2. `rl_agent.py` uses that prior as a small bias when selecting gather/build/trade/explore.
3. EVOLVE gameplay supplies its own state and player-action observations.
4. When autonomy is enabled, the browser reports the result and reward for each executed
   Python action to `/api/world-result`; Q-learning updates the state-action values.
5. Q-values and learning counters persist in `data/q_table.json`; VPT-derived prior persists
   in `data/vpt_policy.json`; online transitions are logged in `data/experience.csv`.

The HUD's **VPT action samples** counter remains zero until you run the preparation command.
Restart `server.py` after generating or replacing the prior so Python reloads it.

### Important research limitation

The released action traces do not tell us which object the player was looking at. Therefore,
Minecraft left-click is mapped coarsely to `gather`, right-click to `build`, movement/mouse
look to `explore`, and E to `trade`. Hunting is learned from EVOLVE's own environment
feedback. This is a weak action-level prior, not state-conditioned behavioural cloning,
not a port of the VPT neural weights, and not a reproduction of the VPT paper. For a proper
research experiment, log EVOLVE observations with actions and rewards, compare a no-VPT
baseline against VPT-prior + RL over multiple seeds, and report mean/standard deviation.
