VPT JSONL action traces are downloaded here by:
  py vpt_pretrain.py --download --max-files 3
Generated files:
  vpt_policy.json   - compact action prior consumed by rl_agent.py
  q_table.json      - online Q-learning values
  experience.csv   - online transitions/rewards
The original VPT video files and checkpoints are not downloaded by this adapter.
