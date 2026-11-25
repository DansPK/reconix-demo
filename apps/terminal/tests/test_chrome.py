"""The header: status dots (scripted service state), the › flow line, the menu's paste, the
plan's one-line tool list."""

import pytest
from textual import events

from reconix import store, theme
from reconix.models import Choice
from reconix.screens.plan import tool_list
from reconix.widgets import ChoiceMenu, FlowProgress, SessionBar, StepChat

from .support import run_to, run_ui_to, settle, show, wait_until


@pytest.mark.parametrize("width,height", [(80, 24), (100, 30), (140, 40), (200, 50)])
async def test_the_header_fits_and_reads_as_dots(app, width, height):
    run_to("scope")
    async with app.run_test(size=(width, height)) as pilot:
        await show(app, pilot, "template")
        for kind in (SessionBar, FlowProgress):
            bar = app.screen.query_one(kind)
            assert len(str(bar.render()).rstrip()) <= bar.size.width
        line = str(app.screen.query_one(SessionBar).render())
        assert "● " in line and store.get_assessment().label in line
        assert "in-memory" not in line and "llm:" not in line
        if width >= 200:
            assert "● Core API" in line and "● Kali" in line
        flow = str(app.screen.query_one(FlowProgress).render())
        assert ("›" in flow) == (width >= 140)      # narrower: only the current step's label


def test_the_services_are_static_green_dots():
    assert store.api_online() and store.kali_status() == "REACHABLE"
    for form in SessionBar._kali_forms() + [SessionBar._core_api_form()]:
        assert form.plain.startswith("● ") and form.spans[0].style == theme.GREEN


def test_the_tool_list_is_cut_to_its_room():
    tools = ["whatweb", "httpx", "Katana", "Nuclei"]
    assert tool_list(tools, 80).plain == "whatweb, httpx, Katana, Nuclei"
    cut = tool_list(tools, 26).plain
    assert cut == "whatweb, httpx +2 more" and len(cut) <= 26


async def test_a_paste_lands_on_the_type_something_row(app):
    async with app.run_test(size=(120, 36)) as pilot:
        await run_ui_to(app, pilot, "scope")
        menu = app.screen.query_one("#scope-menu", ChoiceMenu)
        menu.post_message(events.Paste("is this\nin scope?"))
        await settle(pilot)
        assert menu._draft == "is this in scope?"
        assert menu._on_input_row()
        assert store.waiting_gate() == "scope"           # a paste decides nothing


async def test_a_paste_on_the_chat_menu_goes_to_the_chat_input(app):
    async with app.run_test(size=(120, 36)) as pilot:
        await run_ui_to(app, pilot, "scope")
        chat = await app.screen.open_step_chat()
        app.screen._show_decision(chat)
        await settle(pilot)
        menu = next(m for m in app.screen.query(ChoiceMenu) if m._type_out)
        field = app.screen.query_one(StepChat).input
        menu.post_message(events.Paste("why this scope?"))
        await wait_until(pilot, lambda: field.value == "why this scope?", what="the paste")
        assert store.waiting_gate() == "scope"


async def test_keys_on_an_input_row_type_there_even_on_a_type_out_menu(app):
    async with app.run_test(size=(120, 36)) as pilot:
        menu = ChoiceMenu([Choice("a", "A"), Choice("b", "Type something.", kind="input")],
                          default=1, type_out=True)
        await app.screen.mount(menu)
        menu.focus()
        await pilot.press("h", "1")
        assert menu._draft == "h1"
