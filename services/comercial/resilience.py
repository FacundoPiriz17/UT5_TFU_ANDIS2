"""Circuit Breaker por proceso. El umbral cuenta intentos físicos fallidos."""
from dataclasses import dataclass
from threading import Lock
import time

from app.observability import event


class CircuitOpen(Exception):
    pass


@dataclass(frozen=True)
class Ticket:
    generation: int
    probe: bool


class CircuitBreaker:
    def __init__(self, threshold=3, recovery_seconds=5, clock=time.monotonic):
        if threshold < 1 or recovery_seconds <= 0:
            raise ValueError("Configuración inválida de Circuit Breaker")
        self.threshold = threshold
        self.recovery_seconds = recovery_seconds
        self.clock = clock
        self.lock = Lock()
        self.state = "closed"
        self.failures = 0
        self.opened_at = None
        self.generation = 0
        self.probe_active = False
        self.physical_calls = 0
        self.logical_calls = 0
        self.transitions = []

    def _transition(self, state):
        previous = self.state
        self.state = state
        self.generation += 1
        self.transitions.append({"from": previous, "to": state, "at": self.clock()})
        self.transitions = self.transitions[-50:]
        event("circuit_transition", previous=previous, state=state, failures=self.failures)

    def logical_call(self):
        with self.lock:
            self.logical_calls += 1

    def acquire(self):
        with self.lock:
            if self.state == "open":
                if self.clock() - self.opened_at < self.recovery_seconds:
                    raise CircuitOpen("Catálogo temporalmente indisponible; circuito abierto")
                self._transition("half_open")
            if self.state == "half_open":
                if self.probe_active:
                    raise CircuitOpen("Sonda de recuperación en curso")
                self.probe_active = True
            self.physical_calls += 1
            return Ticket(self.generation, self.state == "half_open")

    def success(self, ticket):
        with self.lock:
            if ticket.generation != self.generation:
                return
            self.failures = 0
            self.probe_active = False
            if self.state == "half_open":
                self._transition("closed")

    def failure(self, ticket):
        with self.lock:
            if ticket.generation != self.generation:
                return
            self.failures += 1
            self.probe_active = False
            if self.state == "half_open" or self.failures >= self.threshold:
                self.opened_at = self.clock()
                self._transition("open")

    def snapshot(self):
        with self.lock:
            return {"state": self.state, "failures": self.failures, "threshold": self.threshold,
                    "recovery_seconds": self.recovery_seconds, "half_open_probe_limit": 1,
                    "physical_calls": self.physical_calls, "logical_calls": self.logical_calls,
                    "probe_active": self.probe_active, "scope": "process", "counting": "physical_attempts",
                    "transitions": list(self.transitions)}
