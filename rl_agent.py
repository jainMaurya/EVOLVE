"""Hybrid EVOLVE agent: VPT demonstration prior + online tabular Q-learning."""
import csv
import json
import math
import random
from datetime import datetime, timezone
from pathlib import Path

ACTIONS = ["gather", "build", "hunt", "trade", "explore"]

class QLearningAgent:
    def __init__(self, path="data/q_table.json", vpt_path="data/vpt_policy.json"):
        self.path = Path(path)
        self.vpt_path = Path(vpt_path)
        self.log_path = Path("data/experience.csv")
        self.q = {}
        self.epsilon = .25
        self.alpha = .18
        self.gamma = .88
        self.updates = 0
        self.last_action = "explore"
        self.last_vpt_action = None
        self.counts = {"mine": 0, "build": 0, "trade": 0, "explore": 0, "hunt": 0, "npc": 0}
        self.vpt_policy = {"samples": 0, "priors": {}, "transitions": {}}
        self.load()
        self.load_vpt_prior()

    def load(self):
        if self.path.exists():
            try:
                d = json.loads(self.path.read_text(encoding="utf-8"))
                self.q = d.get("q", {})
                self.epsilon = float(d.get("epsilon", self.epsilon))
                self.updates = int(d.get("updates", 0))
                self.counts.update(d.get("counts", {}))
            except Exception as exc:
                print(f"Could not load Q table: {exc}")

    def load_vpt_prior(self):
        if self.vpt_path.exists():
            try:
                data = json.loads(self.vpt_path.read_text(encoding="utf-8"))
                self.vpt_policy.update(data)
            except Exception as exc:
                print(f"Could not load VPT prior: {exc}")

    def save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps({"q": self.q, "epsilon": self.epsilon,
                                         "updates": self.updates, "counts": self.counts}, indent=2),
                             encoding="utf-8")

    def row(self, state):
        if state not in self.q or len(self.q[state]) != len(ACTIONS):
            self.q[state] = [0.0] * len(ACTIONS)
        return self.q[state]

    def _vpt_bias(self, action):
        """Small, bounded action-sequence prior; Q-learning remains authoritative."""
        priors = self.vpt_policy.get("priors", {})
        transitions = self.vpt_policy.get("transitions", {})
        distribution = transitions.get(self.last_vpt_action, priors) if self.last_vpt_action else priors
        if not distribution or action not in distribution:
            return 0.0
        p = max(0.001, min(0.999, float(distribution.get(action, 0.001))))
        mean = 1.0 / max(1, len(ACTIONS))
        return max(-0.55, min(0.55, 0.28 * math.log(p / mean)))

    def choose(self, state):
        q = self.row(state)
        if random.random() < self.epsilon:
            idx = random.randrange(len(ACTIONS))
        else:
            preferences = [0.0] * len(ACTIONS)
            total_build = int(self.counts.get("build", 0))
            total_hunt = int(self.counts.get("hunt", 0)) + int(self.counts.get("npc", 0))
            preferences[ACTIONS.index("build")] = min(1.8, total_build * .08)
            preferences[ACTIONS.index("hunt")] = min(1.8, total_hunt * .08)
            scores = [q[i] + preferences[i] + self._vpt_bias(a) for i, a in enumerate(ACTIONS)]
            best = max(scores)
            idx = random.choice([i for i, v in enumerate(scores) if v == best])
        self.last_action = ACTIONS[idx]
        return self.last_action

    def _log_transition(self, state, action, reward, next_state, user_action, payload):
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        new_file = not self.log_path.exists()
        with self.log_path.open("a", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=["timestamp", "state", "action", "reward", "next_state",
                "done", "user_action", "coins", "placed", "vpt_samples"])
            if new_file:
                writer.writeheader()
            writer.writerow({"timestamp": datetime.now(timezone.utc).isoformat(), "state": state,
                "action": action, "reward": round(float(reward), 4), "next_state": next_state,
                "done": 0, "user_action": user_action, "coins": payload.get("coins", 0),
                "placed": payload.get("placed", 0), "vpt_samples": self.vpt_policy.get("samples", 0)})

    def update(self, state, action, reward, next_state, user_action="unknown", payload=None):
        idx = ACTIONS.index(action)
        old = self.row(state)[idx]
        target = float(reward) + self.gamma * max(self.row(next_state))
        self.row(state)[idx] = old + self.alpha * (target - old)
        self.updates += 1
        self.epsilon = max(.05, self.epsilon * .999)
        self._log_transition(state, action, reward, next_state, user_action, payload or {})
        self.save()

    def observe_player(self, payload):
        action = payload.get("action", "explore")
        if action not in self.counts:
            action = "explore"
        self.counts[action] += 1
        for name in ("mine", "build", "trade", "explore", "hunt", "npc"):
            try:
                self.counts[name] = max(self.counts.get(name, 0), int(payload.get("counts", {}).get(name, 0)))
            except (TypeError, ValueError):
                pass
        state = self.state(payload)
        reward = {"mine": 1.0, "build": 2.8, "trade": 1.2, "explore": .8}.get(action, .5)
        if action == "mine" and payload.get("counts", {}).get("hunt", 0):
            reward += .7
        previous = payload.get("previous_state")
        previous_action = payload.get("previous_rl_action")
        if previous and previous_action in ACTIONS:
            self.update(previous, previous_action, reward, state, action, payload)
        self.save()
        # Do not advance the VPT transition chain for a recommendation that was
        # not executed in the world. The next choice happens on autonomy tick.
        return self.snapshot(state, self.last_action)

    @staticmethod
    def state(payload):
        counts = payload.get("counts", {})
        style = max(counts, key=counts.get) if counts and max(counts.values()) > 0 else "new"
        coins = int(payload.get("coins", 30))
        blocks = int(payload.get("placed", 0))
        wealth = "rich" if coins > 100 else "poor" if coins < 15 else "balanced"
        stage = "town" if blocks > 18 else "village" if blocks > 5 else "wild"
        food = int(payload.get("food", 6))
        health = int(payload.get("health", 100))
        food_band = "fed" if food >= 5 else "low_food" if food <= 1 else "some_food"
        health_band = "healthy" if health >= 70 else "wounded" if health < 35 else "hurt"
        return f"{style}|{wealth}|{stage}|{food_band}|{health_band}"

    def observe_outcome(self, state, action, reward, payload):
        """Update the online policy after an autonomous action actually executes."""
        next_state = self.state(payload)
        self.update(state, action, float(reward), next_state,
                    user_action="agent:" + action, payload=payload)
        self.counts["agent_" + action] = int(self.counts.get("agent_" + action, 0)) + 1
        self.last_vpt_action = action
        self.save()
        return self.snapshot(next_state, action)

    def snapshot(self, state=None, action=None):
        return {"state": state, "action": action or self.last_action,
                "updates": self.updates, "epsilon": round(self.epsilon, 3),
                "counts": self.counts, "policy": self.last_action,
                "vpt_samples": int(self.vpt_policy.get("samples", 0)),
                "vpt_loaded": bool(self.vpt_policy.get("samples", 0)),
                "vpt_source": self.vpt_policy.get("source", "No VPT prior loaded"),
                "vpt_classes": self.vpt_policy.get("class_counts", {})}
