from .models import AgentRun


class InMemoryRunStore:
    def __init__(self) -> None:
        self._runs: dict[str, AgentRun] = {}

    def put(self, run: AgentRun) -> AgentRun:
        self._runs[run.run_id] = run
        return run

    def get(self, run_id: str) -> AgentRun:
        return self._runs[run_id]


store = InMemoryRunStore()
