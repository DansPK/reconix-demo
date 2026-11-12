"""How one live-output entry reads: a message line, or a step row inside a thinking block.

Messages carry no name at the front, only a glyph in the speaker's colour (› you, ◆ reconix,
■ a policy banner). A step row is time · who · message in fixed columns. Everything is built
as Text, so tool output and typed text are never markup.
"""

from rich.table import Table
from rich.text import Text

from .. import theme
from ..models import ActivityEntry, ChatEntry, Entry
from ..wording import clock

# who did a step, in plain words: activity-log sources, then chat speakers
SOURCE_NAME = {"AI": "ai", "USER": "you", "TOOL": "tool", "POLICY": "policy", "SYS": "system"}
SPEAKER_NAME = {"reconix": "ai", "": "ai", "you": "you", "policy": "policy"}
WHO_WIDTH = max(len(name) for name in (*SOURCE_NAME.values(), *SPEAKER_NAME.values()))

# a message's glyph by speaker; an empty speaker continues the message above it
MESSAGE_GLYPH = {"you": "›", "reconix": "◆", "policy": "■"}


def entry_text(entry: Entry) -> Text:
    """The message itself, in its tone."""
    tone = theme.TONE.get(entry.tone, theme.TEXT)
    if isinstance(entry, ActivityEntry):
        return Text(entry.message, style=tone)
    if entry.kind == "banner":
        return Text(entry.text, style=f"bold {tone}")
    if entry.kind == "check":
        return Text.assemble(("✓ ", theme.GREEN), (entry.text, tone))
    if entry.kind == "thought":
        return Text(entry.text, style=f"italic {theme.MUTED}")
    if entry.kind == "card":
        line = Text(entry.text, style=f"bold {theme.TEXT}")
        for label, value in entry.rows:
            line.append("   ")
            line.append(f"{label} ", style=theme.DIM)
            line.append(value, style=theme.TEAL)
        return line
    return Text(entry.text, style=tone)


def message_line(entry: ChatEntry) -> Text:
    """A message: its glyph in the speaker's colour, then the text."""
    glyph = MESSAGE_GLYPH.get(entry.speaker, " ")
    color = theme.SPEAKER.get(entry.speaker) or theme.TONE.get(entry.tone, theme.MUTED)
    if entry.speaker == "policy":
        color = theme.TONE.get(entry.tone, color)  # a banner's glyph takes its tone
    return Text.assemble((f"{glyph} ", f"bold {color}"), entry_text(entry))


def step_who(entry: Entry) -> Text:
    if isinstance(entry, ActivityEntry):
        name, color = SOURCE_NAME.get(entry.source, ""), theme.SOURCE.get(entry.source)
    else:
        name, color = SPEAKER_NAME.get(entry.speaker, ""), theme.SPEAKER.get(entry.speaker)
    return Text(name, style=f"bold {color or theme.CYAN}")


def step_row(entry: Entry) -> Table:
    """One step: time · who · message, in fixed columns (wrapped text stays under it)."""
    grid = Table.grid(padding=(0, 2))
    grid.add_column(no_wrap=True)
    grid.add_column(no_wrap=True, width=WHO_WIDTH)
    grid.add_column()
    grid.add_row(
        Text(clock(entry.created_at), style=theme.DIM),
        step_who(entry),
        entry_text(entry),
    )
    return grid


def step_plain(entry: Entry) -> str:
    """A step as plain text, in the same columns (for tests and copies)."""
    return (
        f"{clock(entry.created_at)}  "
        f"{step_who(entry).plain:<{WHO_WIDTH}}  {entry_text(entry).plain}"
    )
