"""Shared control-plane access: reads STATE.md, appends AGENT_LOG.jsonl.

The append protocol matches @jaxx/core: one JSON object per line, validated
against the Event schema, written under an advisory lock file.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Optional

from .schemas import Event


class ControlPlane:
    def __init__(self, root_dir: Path):
        self.root = Path(root_dir).resolve()
        self.agent_dir = self.root / ".agent"
        self.log_path = self.agent_dir / "AGENT_LOG.jsonl"

    # ---- reads ---------------------------------------------------------

    def read_state(self) -> Optional[str]:
        return self._read_md("STATE.md")

    def read_verification(self) -> Optional[str]:
        return self._read_md("VERIFICATION.md")

    def _read_md(self, name: str) -> Optional[str]:
        p = self.agent_dir / name
        try:
            return p.read_text(encoding="utf-8")
        except OSError:
            return None

    def read_events(self, limit: int = 100) -> list[dict]:
        """Tolerant read: malformed lines are skipped, never rewritten."""
        try:
            raw = self.log_path.read_text(encoding="utf-8")
        except OSError:
            return []
        events: list[dict] = []
        for line in raw.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                Event.model_validate(obj)  # validate, discard malformed
            except Exception:
                continue
            events.append(obj)
        return events[-limit:]

    # ---- writes --------------------------------------------------------

    def append_event(self, lvl: str, msg: str, agent: str, timeout_s: float = 10.0) -> Event:
        event = Event.now(lvl=lvl, agent=agent, msg=msg)
        line = event.model_dump_json() + "\n"
        self.agent_dir.mkdir(parents=True, exist_ok=True)
        lock_path = self.log_path.with_suffix(".jsonl.lock")
        self._acquire(lock_path, timeout_s)
        try:
            with open(self.log_path, "a", encoding="utf-8") as f:
                f.write(line)
                f.flush()
        finally:
            _release(lock_path)
        return event

    @staticmethod
    def _acquire(lock_path: Path, timeout_s: float) -> None:
        deadline = time.monotonic() + timeout_s
        while True:
            try:
                fd = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.write(fd, str(os.getpid()).encode())
                os.close(fd)
                return
            except (FileExistsError, PermissionError):
                try:
                    age = time.time() - lock_path.stat().st_mtime
                    if age > 30:  # stale lock from a crashed writer
                        lock_path.unlink(missing_ok=True)
                        continue
                except OSError:
                    pass
                if time.monotonic() > deadline:
                    raise TimeoutError(f"could not acquire {lock_path}")
                time.sleep(0.05)


def _release(lock_path: Path) -> None:
    try:
        lock_path.unlink(missing_ok=True)
    except OSError:
        pass
