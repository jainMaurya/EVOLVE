"""One local process serves the browser game AND Python RL API."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse
from pathlib import Path
import json, threading, webbrowser, os
from rl_agent import QLearningAgent

ROOT = Path(__file__).resolve().parent
os.chdir(ROOT)
agent = QLearningAgent()
lock = threading.Lock()
latest_player = {"coins": 30, "placed": 0, "counts": {}, "food": 6, "health": 100}
pending_world_state = None
pending_world_action = None

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, data, status=200):
        raw = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/status":
            with lock:
                self.send_json(agent.snapshot())
            return
        if path == "/api/world-action":
            global pending_world_state, pending_world_action
            with lock:
                state = agent.state({"counts": agent.counts, **latest_player})
                action = agent.choose(state)
                pending_world_state, pending_world_action = state, action
                agent.save()
                self.send_json(agent.snapshot(state, action))
            return
        return super().do_GET()

    def do_POST(self):
        global latest_player, pending_world_state, pending_world_action
        endpoint = urlparse(self.path).path
        if endpoint not in ("/api/observe", "/api/world-result"):
            self.send_json({"error": "not found"}, 404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
            with lock:
                latest_player = {
                    "coins": int(payload.get("coins", 30)),
                    "placed": int(payload.get("placed", 0)),
                    "counts": payload.get("counts", {}),
                    "food": int(payload.get("food", 6)),
                    "health": int(payload.get("health", 100)),
                    "wood": int(payload.get("wood", 0)),
                    "stone": int(payload.get("stone", 0)),
                }
                if endpoint == "/api/world-result":
                    if pending_world_state is None or pending_world_action is None:
                        self.send_json({"error": "no pending autonomous action"}, 409)
                        return
                    reward = float(payload.get("reward", 0.0))
                    result = agent.observe_outcome(pending_world_state, pending_world_action, reward, payload)
                    pending_world_state = pending_world_action = None
                else:
                    # Player behaviour updates preference/context only. Q-learning
                    # updates are based on the agent's own executed actions/rewards.
                    result = agent.observe_player(payload)
            self.send_json(result)
        except Exception as exc:
            self.send_json({"error": str(exc)}, 400)

if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8000), Handler)
    print("EVOLVE server running at http://127.0.0.1:8000")
    print("Python Q-learning agent active. Press Ctrl+C to stop.")
    threading.Timer(1.0, lambda: webbrowser.open("http://127.0.0.1:8000")).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\\nStopping EVOLVE...")
        server.server_close()
