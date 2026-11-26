# Add an AI model

The chat, the finding analysis, and the **fix agent** all run on an AI model.

1. Open the **Reconix Code Scanner** chat (the magnifying-glass icon in the sidebar).
2. Open the model menu and choose **Add Model**.
3. Pick a provider and fill the form:
   - **OpenAI / Anthropic / DeepSeek** — paste your **API key** and a current **model name**
     (for example `claude-haiku-5-5`, `gpt-4o-mini`).
   - **Ollama** — a local model; set its base URL (e.g. `http://localhost:11434`), no key.
4. Save. The form tests the model and reports **Works**.
5. **Switch to** the model to make it active. A cloud model asks you to **Approve** sending
   code to it, since it runs outside your computer.

Only the last 4 characters of your key are kept, so you can recognise it. The key itself is
never stored.
