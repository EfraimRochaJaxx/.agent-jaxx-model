"""Schemas mirroring @jaxx/core TypeScript schemas (see packages/core/src/schemas.ts)."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

EventLevel = Literal["INFO", "WARN", "ERROR", "DONE", "AGENT", "GIT"]
EVENT_LEVELS = ("INFO", "WARN", "ERROR", "DONE", "AGENT", "GIT")


class Event(BaseModel):
    """Mirror of the canonical AGENT_LOG.jsonl entry."""

    ts: str
    lvl: EventLevel
    agent: str = Field(min_length=1)
    msg: str = Field(min_length=1)

    @field_validator("ts")
    @classmethod
    def ts_must_be_iso(cls, v: str) -> str:
        datetime.fromisoformat(v.replace("Z", "+00:00"))
        return v

    @classmethod
    def now(cls, lvl: EventLevel, agent: str, msg: str) -> "Event":
        return cls(ts=datetime.now().astimezone().isoformat(), lvl=lvl, agent=agent, msg=msg)


class RunRequest(BaseModel):
    goal: str = Field(min_length=1, max_length=2000)
    agent: str = Field(default="orchestrator", min_length=1, max_length=64)


class RunResponse(BaseModel):
    ok: bool
    events_appended: int
    summary: str


_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")


class SkillFrontmatter(BaseModel):
    """Mirror of the skill frontmatter schema (declarative metadata only)."""

    name: str = Field(min_length=1, max_length=64)
    description: str = Field(min_length=1, max_length=500)
    trigger: str = Field(min_length=1, max_length=200)
    allowedTools: list[str] = Field(default_factory=list)
    version: str = Field(default="0.1.0")

    @field_validator("version")
    @classmethod
    def semver(cls, v: str) -> str:
        if not re.match(r"^\d+\.\d+\.\d+$", v):
            raise ValueError("version must be semver")
        return v


def is_safe_name(name: str) -> bool:
    return bool(_NAME_RE.match(name))
