"""Thin multi-agent graph: orchestrator -> coder / reviewer / qa.

Every node appends events to the shared AGENT_LOG.jsonl. Node bodies are
deliberately deterministic placeholders — wire real LLM calls in `think()`
without changing the orchestration or logging contract.
"""

from __future__ import annotations

from typing import TypedDict

try:
    from langgraph.graph import END, StateGraph
except ImportError:  # pragma: no cover - optional dependency
    StateGraph = None  # type: ignore[assignment]
    END = None  # type: ignore[assignment]

from .log import ControlPlane


class GraphState(TypedDict, total=False):
    goal: str
    plan: list[str]
    current_task: str
    reviews: list[str]
    qa_result: str


class JaxxGraph:
    def __init__(self, plane: ControlPlane):
        self.plane = plane
        if StateGraph is None:
            raise RuntimeError("langgraph is not installed — run pip install -r requirements.txt")

    def build(self):
        graph = StateGraph(GraphState)
        graph.add_node("orchestrator", self.orchestrator)
        graph.add_node("coder", self.coder)
        graph.add_node("reviewer", self.reviewer)
        graph.add_node("qa", self.qa)
        graph.set_entry_point("orchestrator")
        graph.add_edge("orchestrator", "coder")
        graph.add_edge("coder", "reviewer")
        graph.add_edge("reviewer", "qa")
        graph.add_edge("qa", END)
        return graph.compile()

    # ---- nodes ---------------------------------------------------------

    def orchestrator(self, state: GraphState) -> GraphState:
        goal = state["goal"]
        self.plane.append_event("AGENT", f"orchestrator planning: {goal}", agent="orchestrator")
        tasks = think(goal)
        for i, task in enumerate(tasks, start=1):
            self.plane.append_event("INFO", f"task {i}: {task}", agent="orchestrator")
        return {**state, "plan": tasks}

    def coder(self, state: GraphState) -> GraphState:
        first = state["plan"][0] if state.get("plan") else state["goal"]
        self.plane.append_event("AGENT", f"coder working on: {first}", agent="coder")
        return {**state, "current_task": first}

    def reviewer(self, state: GraphState) -> GraphState:
        notes = [f"reviewed: {t}" for t in state.get("plan", [])]
        for n in notes:
            self.plane.append_event("INFO", n, agent="reviewer")
        return {**state, "reviews": notes}

    def qa(self, state: GraphState) -> GraphState:
        result = "PASS (deterministic stub)"
        self.plane.append_event("DONE", f"qa verdict: {result}", agent="qa")
        return {**state, "qa_result": result}


def think(goal: str) -> list[str]:
    """Placeholder planner. Replace with a LangChain LLM call when configured."""
    return [
        f"clarify scope of '{goal}'",
        f"implement '{goal}' behind tests",
        f"verify '{goal}' against acceptance criteria",
    ]


def run_goal(plane: ControlPlane, goal: str) -> dict:
    """Compile and execute the graph; returns the final state."""
    plane.append_event("INFO", f"graph run started for goal: {goal}", agent="bridge")
    app = JaxxGraph(plane).build()
    final: GraphState = app.invoke({"goal": goal})
    plane.append_event(
        "DONE",
        f"graph finished: {len(final.get('plan', []))} task(s), qa={final.get('qa_result')}",
        agent="bridge",
    )
    return dict(final)
