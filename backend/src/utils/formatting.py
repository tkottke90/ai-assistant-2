import markdown


def format_chat_message(content: str) -> str:
  """Convert markdown content to HTML for chat display."""
  return markdown.markdown(content, extensions=['extra'])