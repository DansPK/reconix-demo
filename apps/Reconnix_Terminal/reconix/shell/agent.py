"""Agent mode: the backend harness agent drives a real assessment through the static frames.

A typed target (or `/assess <target>`) with a model active enters the **Template** frame like
the scripted run; approving the scope hands off to the harness `Agent`, which runs on the
**Execution** screen with live step progress (plan rows + spinner + live log) and writes
findings into the store. The LLM is Reconix's active `/model`, switchable mid-run with
preserved context. The async loop runs in a worker (the `web.py` pattern); the scripted
RunController is not used on this path. Without a model/harness, the scripted demo runs.
"""

import asyncio
import threading
from typing import Any, Dict, Optional, Tuple

from .. import store
from ..screens.forms import CredentialForm
from ..store import agent_run


class AgentMixin:
    """Mixed into ReconixApp."""

    def _init_agent(self) -> None:
        self.agent_mode = False        # this assessment is driven by the harness agent
        self.agent_request = ""        # the operator's target/request for the agent
        self._agent_busy = False       # a turn is running in the worker
        self._agent_gen = 0            # bumped by cancel_agent(): older turns' results are stale
        self._agent_handle: Optional[Tuple[Any, Any]] = None   # (event loop, task) of the turn
        self._agent_ask: Optional[Dict[str, Any]] = None       # the open on_ask dialog, if any

    # --- entry: target -> Template frame ------------------------------------------------------
    def start_agent_assessment(self, target: Optional[str]) -> bool:
        """`/assess <target>` — same entry as typing a target with a model active."""
        return self.enter_agent_mode(target)

    def enter_agent_mode(self, target: Optional[str]) -> bool:
        target = (target or "").strip()
        if not agent_run.harness_installed():
            self.notify("The harness backend isn't installed (pip install -e backend).",
                        severity="warning", markup=False)
            return False
        if store.active_model() is None:
            self.notify("Pick a model first with /model.", severity="warning", markup=False)
            return False
        if not target:
            self.notify("Give a target, e.g. /assess http://host", severity="warning",
                        markup=False)
            return False
        if store.get_run().started:                 # start fresh; the old one stays listed
            self.cancel_agent()                     # a running turn must not leak into the new run
            self.controller.stop()
            store.new_assessment()
        try:
            result = store.submit_prompt(target)    # build the run + scope like the static flow
        except store.StoreValidationError as exc:
            self._warn(exc)
            return False
        if result != "started":
            self.notify("That doesn't look like a scan target (URL, host or repo).",
                        severity="warning", markup=False)
            return False
        self.agent_mode = True
        self.agent_request = target
        self._remember(target)
        self.refresh_view()
        self.controller.resume()                    # play to the Template/scope gate, then pause
        self.goto("template")
        return True

    # --- scope approved -> run the agent on the Execution screen -------------------------------
    def begin_agent_execution(self) -> None:
        agent_run.begin_execution()                 # mark the run live + enterable
        self.goto("execution")
        # Approving the Reconix scope IS the authorization — tell the agent to proceed
        # autonomously and not ask again, so it starts scanning immediately.
        target = self.agent_request or store.get_assessment().target
        spec = store.api_spec_handoff()        # "" without an attached OpenAPI spec
        schema = store.api_schema_handoff()    # the compact digest, fenced as data
        extra = "".join(f"\n\n{block}" for block in (spec, schema) if block)
        self._send_to_agent(
            f"Assess {target}. The operator has approved the scope and authorized this "
            "engagement — treat the target as authorized and do NOT ask for authorization or "
            "confirmation. Begin immediately: run reconnaissance, then adapt and test based on "
            "what you find, and report findings as you go." + extra)

    def _send_to_agent(self, text: str) -> None:
        """Record the operator line and run one agent turn in a worker.

        While a turn is running (scanning / a PoC test), chat is not accepted — the operator
        can chat again once it finishes.
        """
        if self._agent_busy:
            self.notify("The assessment is running — you can chat once it finishes.",
                        severity="warning", markup=False)
            return
        agent_run.record_user(text)
        self._agent_busy = True
        self.refresh_view()
        self.notify("Thinking…", timeout=2)
        gen = self._agent_gen
        self.run_worker(lambda: self._agent_worker(text, gen), thread=True, group="agent",
                        exit_on_error=False)

    # --- cancel -------------------------------------------------------------------------------
    def cancel_agent(self, mark_stopped: bool = True) -> None:
        """Abandon the running turn (a new assessment, another one opened, or quit).

        Bumps the generation so anything the old turn still posts is ignored, cancels its
        task, releases an open question dialog, clears `_agent_busy` and marks the OLD run
        stopped (not completed). Call it while that run is still the current one.
        """
        was_busy = self._agent_busy
        self._agent_gen += 1
        handle, self._agent_handle = self._agent_handle, None
        if handle is not None:
            loop, task = handle
            try:
                loop.call_soon_threadsafe(task.cancel)
            except RuntimeError:                    # the loop already closed: turn is over
                pass
        self._release_agent_ask()
        self._agent_busy = False
        agent_run.revoke_current(drop_agent=was_busy)   # late tool calls are refused
        if was_busy and mark_stopped:
            agent_run.finish(stopped="the assessment was cancelled")
            self.refresh_view()

    def _release_agent_ask(self) -> None:
        """Answer an open on_ask with 'dismissed' and close its dialog."""
        ask, self._agent_ask = self._agent_ask, None
        if ask is None:
            return
        ask["done"].set()                           # frees the blocked turn (result stays None)
        dialog = ask.get("dialog")
        if dialog is not None:
            self.call_later(self._dismiss_dialog, dialog)

    def _dismiss_dialog(self, dialog):
        if dialog in self.screen_stack:
            return dialog.dismiss(None)
        return None

    # --- worker -------------------------------------------------------------------------------
    def _post(self, gen: int, callback, *args) -> None:
        """Run `callback` on the app thread for turn `gen`.

        A stale turn (cancelled since) returns at once instead of blocking on the app, and
        a callback that raises still raises; only "the app is gone" is swallowed.
        """
        if gen != self._agent_gen:
            return
        try:
            self.call_from_thread(callback, *args)
        except RuntimeError as exc:
            if str(exc) != "App is not running":
                raise

    def _agent_worker(self, text: str, gen: int) -> None:
        loop = asyncio.new_event_loop()
        try:
            task = loop.create_task(self._agent_turn(text, gen))
            if gen == self._agent_gen:              # never overwrite a newer turn's handle
                self._agent_handle = (loop, task)
            if gen != self._agent_gen:              # cancelled before (or while) it started
                task.cancel()
            loop.run_until_complete(task)
        except asyncio.CancelledError:
            pass                                    # cancel_agent(): nothing more to report
        except store.StoreValidationError as exc:
            self._post(gen, self._agent_note, str(exc), "warn", gen)
        except Exception as exc:                        # never crash the UI on a backend error
            self._post(gen, self._agent_note, f"Agent error: {exc!r}", "block", gen)
        finally:
            try:
                loop.run_until_complete(loop.shutdown_default_executor())
            except Exception:
                pass
            loop.close()
            if self._agent_handle is not None and self._agent_handle[0] is loop:
                self._agent_handle = None
            self._post(gen, self._agent_finished, gen)

    async def _agent_turn(self, text: str, gen: int) -> None:
        async def on_event(ev: Dict[str, Any]) -> None:
            self._post(gen, self._apply_agent_event, ev, gen)

        async def on_ask(request: Dict[str, Any]) -> Optional[Dict[str, Any]]:
            return await self._agent_on_ask(request, gen)
        await agent_run.run(text, on_event, on_ask)

    async def _agent_on_ask(self, request: Dict[str, Any],
                            gen: Optional[int] = None) -> Optional[Dict[str, Any]]:
        """Pop a dialog on the UI thread and block this turn until the operator answers.

        A confirmation/decision request pops a choice dialog; anything else (credentials)
        pops the secure-input form. Returns the operator's answer, or None if dismissed
        (or if the turn was cancelled while the dialog was open).
        """
        result: Dict[str, Any] = {}
        done = threading.Event()
        gen = self._agent_gen if gen is None else gen

        def open_modal() -> None:
            if gen != self._agent_gen:              # cancelled before the dialog could open
                done.set()
                return

            def closed(values: Optional[Dict[str, Any]]) -> None:
                result["values"] = values
                done.set()
            callback = closed
            if request.get("type") == "confirm":
                dialog = self._confirm_dialog(request)

                def callback(choice) -> None:
                    closed({"answer": choice} if choice else None)
            else:
                dialog = CredentialForm(request)
            self._agent_ask = {"done": done, "dialog": dialog}
            self.open_dialog(dialog, callback)

        self._post(gen, open_modal)
        if gen != self._agent_gen:                  # stale: no dialog will ever answer
            done.set()
        await asyncio.get_running_loop().run_in_executor(None, done.wait)
        if self._agent_ask is not None and self._agent_ask["done"] is done:
            self._agent_ask = None
        return result.get("values")

    def _confirm_dialog(self, request: Dict[str, Any]):
        """A Yes/No (or multiple-choice) approval dialog the agent asked for."""
        from ..models import Choice
        from ..screens import ChoiceScreen

        question = str(request.get("question") or "Proceed?")
        options = request.get("options") or []
        choices = ([Choice(str(o), str(o)) for o in options]
                   if options else [Choice("yes", "Yes"), Choice("no", "No")])
        return ChoiceScreen("◆ AGENT NEEDS YOUR DECISION", question, choices, chip="Approve")

    # --- main-thread updates ------------------------------------------------------------------
    def _apply_agent_event(self, ev: Dict[str, Any], gen: int) -> None:
        if gen != self._agent_gen:
            return
        agent_run.record_event(ev)
        self.refresh_view()

    def _agent_note(self, text: str, tone: str = "muted", gen: Optional[int] = None) -> None:
        if gen is not None and gen != self._agent_gen:
            return
        agent_run.note(text, tone)
        self.refresh_view()

    def _agent_finished(self, gen: int) -> None:
        if gen != self._agent_gen:
            return
        self._agent_busy = False
        if self.agent_mode:
            agent_run.finish()
        self.refresh_view()
