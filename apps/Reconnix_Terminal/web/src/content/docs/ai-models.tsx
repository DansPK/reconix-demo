import { Callout, Code, DocRef, DocSection, DocTable, Mono, Steps } from "@/components/docs-primitives";
import type { GroupContent } from "@/content/docs/types";

export const aiModels: GroupContent = {
  providers: {
    lede: "/provider configures where a model comes from: set it up, test it, use one of its models, or remove it.",
    body: (
      <>
        <DocSection title="The catalog">
          <p>Six providers are built in. Each has its own rules for the key, the base URL and the number of models:</p>
          <DocTable
            caption="The provider catalog"
            head={["Provider (id)", "What it takes"]}
            rows={[
              { key: "Reconix (default) · reconix", value: <>An API key only. Its base URL and model come from <Mono>.env</Mono> (<Mono>LLM_BASE_URL</Mono>, <Mono>LLM_MODEL</Mono>) and are read-only in the form. One model.</> },
              { key: "OpenAI · openai", value: <>An API key. The models are built in (<Mono>gpt-4o-mini</Mono>, <Mono>gpt-4o</Mono>); you may list others, comma separated. A base URL is optional.</> },
              { key: "Anthropic · anthropic", value: <>An API key. Built-in models <Mono>claude-sonnet-5-5</Mono>, <Mono>claude-opus-5-5</Mono>, <Mono>claude-haiku-5-5</Mono>; others may be listed.</> },
              { key: "DeepSeek · deepseek", value: <>An API key. Built-in models <Mono>deepseek-chat</Mono>, <Mono>deepseek-reasoner</Mono>; others may be listed.</> },
              { key: "Ollama · ollama", value: <>No key. A base URL (default <Mono>http://localhost:11434</Mono>, from <Mono>OLLAMA_BASE_URL</Mono>) and exactly one model name.</> },
              { key: "Custom OpenAI-compatible · openai_compatible", value: "An optional key, a required base URL and exactly one model." },
            ]}
          />
        </DocSection>
        <DocSection title="Set up a provider">
          <Steps>
            <li>
              <Mono>/provider</Mono> opens the list with each provider&apos;s status (Untested, Reachable, Unreachable), its
              key hint such as <Mono>sk-…3f9a</Mono> and its models; <Mono>ACTIVE</Mono> marks the one whose model is in use.
              Pick one, or go straight to it with <Mono>/provider &lt;id&gt;</Mono>.
            </li>
            <li>
              Choose <strong>Set up</strong> (or <strong>Update</strong>), or type <Mono>/provider set &lt;id&gt;</Mono>. The
              form shows only the fields that provider takes: the API key (masked; on an update, leave it blank to keep
              the saved one), the base URL, and the model or comma-separated models.
            </li>
            <li>
              Save. The provider is stored as <strong>Untested</strong> and Reconix asks whether to test the connection
              now.
            </li>
          </Steps>
          <Code>{`/provider set reconix        # the API key for the .env endpoint
/provider set ollama         # base URL and one model, e.g. llama3.1
/provider set openai         # just the key; the models are built in`}</Code>
        </DocSection>
        <DocSection title="Test the connection">
          <p>
            <strong>Test connection</strong> in the submenu, or <Mono>/provider test &lt;id&gt;</Mono>. The test runs in the
            background (a notification says &quot;Testing …&quot;) and takes up to about twenty seconds (each request
            waits at most ten):
          </p>
          <ul>
            <li>
              <strong>Ollama:</strong> asks the server for its model list and checks the model is there
              (<Mono>llama3.1</Mono> matches <Mono>llama3.1:latest</Mono>).
            </li>
            <li>
              <strong>Reconix and the custom endpoint:</strong> asks <Mono>&lt;base URL&gt;/models</Mono> with the key; if the
              model is not listed or the endpoint has no model list, sends a one-token completion instead.
            </li>
            <li>
              <strong>OpenAI, Anthropic, DeepSeek:</strong> a one-token completion.
            </li>
          </ul>
          <p>
            The result is saved on the provider and shown as a notification, &quot;&lt;Provider&gt;: REACHABLE —
            model available&quot; (or &quot;reachable&quot;), or <strong>UNREACHABLE</strong> with a short, redacted
            reason: &quot;model not found&quot;, &quot;bad API key (unauthorized)&quot;, &quot;timed out&quot;,
            &quot;connection refused&quot; or &quot;could not reach the model&quot;. Only a Reachable provider&apos;s
            models can be activated.
          </p>
        </DocSection>
        <DocSection title="Use a model, or remove the provider">
          <p>
            <strong>Use a model</strong> (enabled once the provider is Reachable) lists its models; picking one makes it
            the active model, the same as <Mono>/model &lt;id&gt;/&lt;model&gt;</Mono>. <strong>Unset</strong> or{" "}
            <Mono>/provider unset &lt;id&gt;</Mono> asks &quot;This deletes …&apos;s saved key and settings.&quot; with
            &quot;No, keep it&quot; selected; removing it also clears the active model if it was this provider&apos;s.
          </p>
        </DocSection>
        <DocSection title="What is recorded">
          <p>
            Saving, testing, activating and removing a provider are written to the activity log and the audit trail
            (<Mono>/audit</Mono>): &quot;LLM provider saved: OpenAI&quot;, &quot;LLM provider OpenAI: reachable (model
            available)&quot;, and so on. The key itself appears nowhere; see{" "}
            <DocRef>Configuration</DocRef>.
          </p>
        </DocSection>
      </>
    ),
  },
  models: {
    lede: "/model picks the active model. It answers your chat lines; it never decides a gate.",
    body: (
      <>
        <DocSection title="Pick the active model">
          <p>
            <Mono>/model</Mono> lists every model of every configured provider, grouped by provider; a model is disabled
            with the hint &quot;Test the connection first&quot; until its provider is Reachable. <Mono>/model
            &lt;provider&gt;/&lt;model&gt;</Mono> activates one directly:
          </p>
          <Code>{`/model reconix/your-model-id
/model openai/gpt-4o-mini
/model ollama/llama3.1`}</Code>
          <p>
            The top bar then shows <Mono>llm: &lt;provider label&gt; · &lt;model&gt; ●</Mono> (for example{" "}
            <Mono>llm: Reconix (default) · your-model-id ●</Mono>), the chat notes &quot;Switched to
            OpenAI · gpt-4o-mini&quot;, and the switch is recorded in the activity log, the audit trail and the{" "}
            <Mono>model_switches</Mono> table of <Mono>llm.db</Mono>. With no configured, reachable provider the command
            says &quot;No models yet. Use /provider to set one up and test it.&quot;
          </p>
        </DocSection>
        <DocSection title="What the model does">
          <ul>
            <li>
              <strong>Chat during a run.</strong> A line typed at the prompt while an assessment runs goes to the active
              model with a fixed system prompt, a short description of the assessment state (target, template, scope
              status, phase, waiting gate, the findings&apos; ids, severities and titles, the approval decisions) and the
              last 40 chat turns. Every piece of text is cleaned and redacted first, the model gets no tools, and its
              reply is redacted and capped at 8,000 characters before it is shown. Both lines are saved in{" "}
              <Mono>llm.db</Mono> (<Mono>chat_messages</Mono>).
            </li>
            <li>
              <strong>The AI agent.</strong> With the backend harness installed, the active model is also the agent&apos;s
              model for <Mono>/assess</Mono>; switching models mid-assessment repoints the agent and keeps its whole
              conversation. See <DocRef>The AI agent</DocRef>.
            </li>
          </ul>
          <Callout variant="warning" title="Never a decision">
            The model proposes text. The scope, the policy checks, the approval gates and the vault are deterministic
            and ignore it; a different model never changes what is allowed to run. See{" "}
            <DocRef>LLM data handling</DocRef>.
          </Callout>
        </DocSection>
        <DocSection title="Knowledge add-ons">
          <p>
            <DocRef><Mono>/add-on</Mono></DocRef> gives the AI reference documents
            (<Mono>.txt .md .json .yaml .yml .docx .pdf</Mono>, at most 10 MB, no symlinks). Each file is read once,
            <strong> cleaned and redacted at ingest</strong> (secrets never reach disk), split into passages of at most
            1,200 characters and saved under <Mono>~/.reconix/knowledge</Mono> (the folder 0700, files 0600); at most 50
            sources are kept. The files are only ever read — nothing in them is run.
            The relevant passages are sent to the active model with each question, whether it runs locally or remotely;
            adding a file while a remote model is active says so.
          </p>
          <p>
            For a question, the relevant passages are found with BM25 (a passage must share at least two of your words,
            or the whole query when it is shorter; the best four are used, up to 4,000 characters go to the model) and
            added to the context as untrusted reference material,
            each prefixed <Mono>[name #index]</Mono>. All three consumers share this: the terminal chat (which then shows
            a muted <Mono>Knowledge: a.md, b.pdf</Mono> line under the reply), the <Mono>/assess</Mono> agent (through a
            read-only <Mono>search_knowledge</Mono> tool the scope guard allows) and the web AI Assistant (which reads the
            same folder but never writes it). With no active model, no knowledge is used. See{" "}
            <DocRef>/add-on</DocRef>.
          </p>
          <Callout variant="warning" title="Reference, not instructions">
            Knowledge passages are untrusted data: the model summarizes them but never obeys directions found inside
            them, and nothing is approved or run from a knowledge file.
          </Callout>
        </DocSection>
        <DocSection title="Switching mid-run">
          <p>
            <Mono>/model</Mono> works at any time. The run, its findings and its approvals are unchanged; only the next
            chat line (or the agent&apos;s next turn) uses the new model.
          </p>
        </DocSection>
        <DocSection title="With no model">
          <p>
            The scripted demo runs: chat lines get the built-in reply, and a target starts the simulated assessment. If
            a call to the active model fails, the chat shows &quot;LLM unavailable (&lt;reason&gt;). Showing the built-in
            reply.&quot; and falls back the same way, so the terminal keeps working offline.
          </p>
        </DocSection>
      </>
    ),
  },
  configuration: {
    lede: "One .env seeds the default provider; everything you add with /provider lives encrypted in ~/.reconix/llm.db.",
    body: (
      <>
        <DocSection title="The .env seed">
          <p>
            Copy <Mono>.env.example</Mono> to <Mono>.env</Mono> in the repository root; it is read once when the terminal
            starts and is git-ignored. The <Mono>LLM_*</Mono> block defines the built-in <strong>Reconix</strong> provider,
            which is also the configuration the AI agent shares:
          </p>
          <Code>{`LLM_BASE_URL=http://localhost:11434/v1   # any OpenAI-compatible endpoint (usually ends in /v1)
LLM_MODEL=your-model-id                  # the model id at that endpoint
LLM_TIMEOUT=120                          # per-request timeout, seconds`}</Code>
          <p>
            The Reconix provider&apos;s API key is <strong>not</strong> in <Mono>.env</Mono>: enter it with{" "}
            <Mono>/provider set reconix</Mono>. Saving copies the base URL and model into <Mono>llm.db</Mono>, and tests
            and chat read that copy: after changing <Mono>LLM_BASE_URL</Mono> or <Mono>LLM_MODEL</Mono>, restart, run{" "}
            <Mono>/provider set reconix</Mono> again (leave the key blank to keep it) and test again. The other
            providers are added entirely in the terminal.
          </p>
        </DocSection>
        <DocSection title="Where keys are stored">
          <DocTable
            caption="The files behind the LLM settings"
            head={["File", "Contents"]}
            rows={[
              { key: "~/.reconix/llm.db", value: <>One SQLite file, mode 0600 in a 0700 folder: the providers (encrypted key, key hint, base URL, models, test status), the active model, the chat history and the model switches. Move it with <Mono>LLM_DB</Mono>.</> },
              { key: "~/.reconix/llm.key", value: <>The Fernet key that encrypts the API keys, created 0600 on first use. Move it with <Mono>LLM_KEY_FILE</Mono>. Lose it and the saved keys cannot be read: set the providers up again.</> },
            ]}
          />
          <p>
            An API key is encrypted before it reaches the database and decrypted only for the call it is used in. What
            you see afterwards is a hint like <Mono>sk-…3f9a</Mono> (the first three and last four characters). LiteLLM&apos;s
            debug output and telemetry are off, and every provider error is reduced to a short redacted message, so a key
            never reaches the screen, a log, a report or a saved copy.
          </p>
        </DocSection>
        <DocSection title="Other settings">
          <Code>{`LLM_DB=~/.reconix/llm.db          # the providers database
LLM_KEY_FILE=~/.reconix/llm.key   # the encryption key
OLLAMA_BASE_URL=http://localhost:11434`}</Code>
          <p>
            The AI agent&apos;s settings (<Mono>KALI_MCP_TRANSPORT</Mono>, <Mono>KALI_MCP_URL</Mono>,{" "}
            <Mono>KALI_MCP_AUTH_TOKEN</Mono>, <Mono>KALI_MCP_SSH_HOST</Mono>, <Mono>KALI_MCP_REMOTE_CMD</Mono>,{" "}
            <Mono>HARNESS_DB_PATH</Mono>) sit in the same file; see{" "}
            <DocRef>The AI agent</DocRef>.
          </p>
          <Callout>
            The web dashboard&apos;s AI Assistant has its own models, chosen with the model chip in its message box
            (below). The terminal&apos;s providers and <Mono>llm.db</Mono> are never shared with it, and it never reads them.
          </Callout>
        </DocSection>
        <DocSection title="Choosing a model">
          <p>
            In the dashboard&apos;s AI Assistant, the <strong>model chip</strong> at the bottom left of the message box
            names the model that answers your next question: <Mono>● llama3.2 ▾</Mono> with a green dot, or{" "}
            <strong>Choose a model</strong> with an amber dot while none can answer (its tooltip says why). The web
            assistant uses only the models you add here: it reads no model from its environment (no{" "}
            <Mono>LLM_BASE_URL</Mono>, <Mono>LLM_MODEL</Mono> or <Mono>LLM_API_KEY</Mono>), so until you add one it says
            &quot;No AI model is set up yet. Add one with the model chip under the message box (+ Model).&quot; The chip
            opens the model picker above the message box (a sheet over it on a phone). Escape goes back to the list, then
            closes the picker.
          </p>
          <Steps>
            <li>
              <strong>Model.</strong> Your saved models, each with its provider and where it runs (
              <Mono>stub-model · Stub · local</Mono>), a check on the one that answers next. One click, Enter or Space uses
              a model and closes the picker. Each has a bin: removing asks first, with No as the default; removing a
              provider&apos;s last model removes the provider and its saved key. With nothing saved the list says{" "}
              <em>No model yet.</em> <strong>+ Model</strong> at the bottom opens the next step.
            </li>
            <li>
              <strong>Set the provider.</strong> <em>Provider</em>: OpenAI, Anthropic, DeepSeek, OpenRouter, Groq, Ollama
              (local), LM Studio (local) or Custom (OpenAI-compatible), every one usable; it starts on Ollama. A cloud one
              says where your data goes: &quot;Groq runs at api.groq.com: your questions, the assessment data they need and
              relevant /add-on knowledge passages are sent there.&quot; <em>Base URL</em>, for Custom, Ollama and LM
              Studio only, filled in from the preset. <em>API key</em>, a password field that is never filled in (&quot;Needed
              by &lt;Provider&gt;&quot; or &quot;Optional&quot;; with a key saved for that provider, leave it empty to keep it, or tick{" "}
              <strong>Remove key</strong>); choosing another provider empties it. <em>Model</em>: the list{" "}
              <strong>Fetch models</strong> brings (<Mono>GET &lt;base URL&gt;/models</Mono>, also fetched once the
              provider, the address and the key are set), or <strong>Type a model name…</strong>. When the server lists
              none, a model the saved provider is known to have is tested, or you can type a name instead.
            </li>
            <li>
              <strong>Add model.</strong> A typed model, or one not from the list fetched for these exact values, is tested
              first with one tiny chat completion. The provider is then saved (named after its preset), or, when that preset
              at that address is saved already, the model is added to it; it becomes the active model and the picker
              closes: the chip names it at once. A refusal (a bad address, a key over http, a cloud provider&apos;s name at
              another address, a key the provider turns down) stays on the form, in red. <strong>Cancel</strong> goes back to the list.
            </li>
          </Steps>
          <DocTable
            caption="Where the web assistant keeps its models"
            head={["File", "Contents"]}
            rows={[
              { key: "~/.reconix/assistant/models.json", value: <>The providers (name, preset, base URL, model names, the sealed key) and the chosen model; 0600 in a 0700 folder, written atomically. Moves with <Mono>RECONIX_ASSISTANT_DIR</Mono>, next to the saved conversations.</> },
              { key: "~/.reconix/assistant/models.key", value: "The 32-byte key that seals the API keys (AES-256-GCM, a new random IV for each), made once, 0600. Lose it and the saved keys cannot be opened: enter them again." },
            ]}
          />
          <p>
            A key never goes back to the browser (the picker only says &quot;Key saved&quot;) and is never logged. Adding a
            model to a saved provider without typing a key keeps the saved one. A fetch or a test sends a saved key only to
            its saved address, and neither sends any assessment data.
          </p>
          <Callout variant="warning" title="The same rules for every model">
            Every model must use http(s) with no user or password in the address and a plain model name; a key goes only
            over https to a model off this machine; and a cloud provider&apos;s name only goes with its own address. Cloud
            providers and other addresses off this machine are allowed by default. The rules are
            checked again on every question: a chosen model that no longer passes says why in the assistant, and nothing else answers in its
            place. Remote models receive your questions and the assessment data they need; see{" "}
            <DocRef>LLM data handling</DocRef>.
          </Callout>
        </DocSection>
        <DocSection title="Knowledge in the web assistant">
          <p>
            The web assistant also uses the files you added with <Mono>/add-on</Mono> in the terminal, and the ones
            uploaded on its <DocRef>Security knowledge page</DocRef>. With each question it reads{" "}
            <Mono>~/.reconix/knowledge</Mono> and sends only the passages that match it (at most four, 4,000 characters,
            secrets masked) as reference material the model must not take orders from, and the answer ends with a muted{" "}
            <strong>Knowledge used: a.md, b.pdf</strong> line. A file removed with <Mono>/add-on</Mono> or on the page is
            no longer used from the next question on.
          </p>
        </DocSection>
        <DocSection title="Security knowledge page">
          <p>
            The <strong>Security knowledge</strong> button in the AI Assistant&apos;s header (a book with a lock; just the
            icon on a phone) opens the page of knowledge files; <strong>← AI Assistant</strong> goes back.
          </p>
          <DocTable
            caption="The Security knowledge page"
            head={["Part", "What it does"]}
            rows={[
              { key: "Table / Grid", value: "Each file's Name (with its type's icon), Source (Web upload or Terminal (/add-on), with the type and size, for example Web upload · PDF · 1.2 MB) and Uploaded (your local date and time), as rows or as cards, ten a page. Your choice is remembered in this browser; a phone starts on the grid." },
              { key: "Search", value: "Narrows the list to the files whose name holds what you type." },
              { key: "Upload", value: "One .docx, .pdf, .txt, .md, .json, .yaml or .yml file of up to 10 MB. A .doc is refused with “Save it as .docx first”. The dialog shows the upload's progress, then the server's answer: a refusal keeps the dialog open with the reason." },
              { key: "Open", value: "The file as it was added: PDF, text, Markdown, JSON and YAML open in a new tab (shown as text, nothing in them can run), a Word file is downloaded. A file added before originals were kept can't be opened: add it again." },
              { key: "Remove", value: "Asks first (No is the default), then removes the file, its passages and its original." },
            ]}
          />
          <p>
            An upload is handled by the same code as <Mono>/add-on</Mono>: the dashboard copies the file to a private temporary
            file (0600 in a 0700 folder) and runs <Mono>python -m reconix.knowledge add</Mono> on it, then deletes the copy.
            The text is checked, masked and split into passages exactly as in the terminal, and the original is kept
            encrypted on this computer (<Mono>&lt;id&gt;.orig</Mono> in the knowledge folder, with the key in{" "}
            <Mono>~/.reconix/knowledge.key</Mono>, 0600). The model still only ever sees the masked passages. Opening and
            removing go through the same command (<Mono>original</Mono>, <Mono>remove</Mono>). The command runs with the
            dashboard&apos;s Python (<Mono>RECONIX_PYTHON</Mono>, else the repository&apos;s <Mono>.venv</Mono>), fixed
            arguments, a minimal environment that never holds a model key, and a 60-second limit. One upload runs at a time,
            ten a minute; the folder holds at most 50 files.
          </p>
        </DocSection>
      </>
    ),
  },
  errors: {
    lede: "Every message /provider and /model can show, and what it means.",
    body: (
      <>
        <DocSection title="Setting up a provider">
          <DocTable
            caption="Messages when a provider is saved"
            head={["Message", "Meaning"]}
            rows={[
              { key: "Unknown provider.", value: "The id is not one of reconix, openai, anthropic, deepseek, ollama, openai_compatible." },
              { key: "<Provider> needs an API key.", value: "The provider requires a key and none is saved yet. Enter one." },
              { key: "That API key is too long.", value: "Keys are limited to 4,096 characters." },
              { key: "<Provider> needs a base URL.", value: "The custom OpenAI-compatible provider has no base URL." },
              { key: "The base URL must start with http:// or https://.", value: "Give the full endpoint, for example https://host/v1." },
              { key: "That base URL is too long.", value: "URLs are limited to 2,048 characters." },
              { key: "Put the API key in the key field, not in the base URL.", value: "A user:password@host URL is refused so the key is stored encrypted, never in plain text." },
              { key: "At least one model name is required.", value: "The model field is empty." },
              { key: "That model name is too long.", value: "Model names are limited to 200 characters." },
              { key: "<Provider> holds a single model.", value: "Ollama and the custom endpoint take exactly one model; frontier providers take a list." },
              { key: "Reconix's base URL comes from .env and can't be changed.", value: "The Reconix provider's base URL and model are read-only: edit .env, restart, then /provider set reconix to re-save them (see Configuration)." },
              { key: "Reconix's model comes from .env and can't be changed.", value: "Same for the model." },
            ]}
          />
        </DocSection>
        <DocSection title="Testing and activating">
          <DocTable
            caption="Messages when a provider is tested or a model activated"
            head={["Message", "Meaning"]}
            rows={[
              { key: "<Provider> is not configured. / … not configured yet.", value: "Set it up first (/provider set <id>)." },
              { key: "UNREACHABLE — model not found", value: "The model is not in the endpoint's list, or the completion came back 404. Check the model name (for Ollama, pull it first)." },
              { key: "UNREACHABLE — bad API key (unauthorized)", value: "The endpoint answered 401 or 403, or complained about the key." },
              { key: "UNREACHABLE — timed out", value: "No answer within a request's ten-second limit." },
              { key: "UNREACHABLE — connection refused", value: "Nothing listens at the base URL, or the host could not be reached." },
              { key: "UNREACHABLE — could not reach the model", value: "Any other provider or transport error; the detail is deliberately short." },
              { key: "Test the connection first — the provider is not reachable.", value: "Only a Reachable provider's model can be activated." },
              { key: "<model> is not configured for <Provider>.", value: "The model after the slash is not in that provider's list." },
              { key: "Use provider/model, e.g. openai/gpt-4o-mini.", value: "/model takes the id and the model separated by a slash." },
              { key: "No models yet. Use /provider to set one up and test it.", value: "No configured provider has any model to list." },
            ]}
          />
        </DocSection>
        <DocSection title="While chatting or assessing">
          <DocTable
            caption="Messages while a model is in use"
            head={["Message", "Meaning"]}
            rows={[
              { key: "LLM unavailable (<reason>). Showing the built-in reply.", value: "The call failed (the reasons above, plus “empty response from the model” and “the model's reply was too long”). The scripted reply is shown instead." },
              { key: "Pick a model first with /model.", value: "/assess needs an active model." },
              { key: "The harness backend isn't installed (pip install -e backend).", value: "/assess needs the backend harness." },
              { key: "No LLM model is active. Use /model to pick one.", value: "The agent was asked to run without an active model." },
              { key: "The assessment is running — you can chat once it finishes.", value: "The agent is in the middle of a turn; wait for it." },
            ]}
          />
          <p>
            More in <DocRef>Troubleshooting · Model connection</DocRef>.
          </p>
        </DocSection>
      </>
    ),
  },
};
