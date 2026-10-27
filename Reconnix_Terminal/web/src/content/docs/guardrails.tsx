import { Badge } from "@/components/ui/badge";
import { Callout, DocRef, DocSection, Mono } from "@/components/docs-primitives";
import type { GroupContent } from "@/content/docs/types";

export const guardrails: GroupContent = {
  "authorized-use": {
    lede: "Reconix is for authorized security assessments only.",
    body: (
      <>
        <DocSection title="Your responsibility">
          <p>
            Only assess targets you are authorized to test. In the scripted run Reconix enforces the scope you approve;
            in agent mode Reconix also checks every tool call against it (target host, tool set, the time limit, the
            allowed methods and excluded paths on web scopes, the ports on network scopes) and refuses what falls
            outside, but the per-action MEDIUM and HIGH approval gates are not applied to the agent, the tool set
            limits it only if you edit it down, and a scanner&apos;s own traffic inside an allowed target is not
            checked request by request. The agent&apos;s login requests never follow redirects. The authorization itself always comes from you or your
            organization. Keep written permission for every target.
          </p>
          <Callout variant="warning" title="Before you start">
            Typing a target or picking a template never authorizes testing on its own. Nothing runs until you approve the
            scope manifest and run the plan; with the AI agent, approving the scope is what starts real tools against the
            target.
          </Callout>
        </DocSection>
        <DocSection title="What is simulated">
          <p>
            Without a model and the backend harness, the run is simulated: no scanner runs and nothing is sent to the
            target. The demo uses reserved example domains and fake, masked evidence. See{" "}
            <DocRef>Introduction</DocRef>.
          </p>
        </DocSection>
        <DocSection title="What Reconix refuses">
          <p>
            Requests outside the approved scope are blocked by policy and never sent. Lines that name no target do not
            start anything. See <DocRef>Limitations</DocRef>.
          </p>
        </DocSection>
      </>
    ),
  },
  "scope-and-safety": {
    lede: "The store decides; the screens only ask. Every request is checked against the scope you approved.",
    body: (
      <>
        <DocSection title="The scope check">
          <p>
            Every request the run proposes is compared with the approved scope manifest by a deterministic policy
            engine: the method, the host, the port, the path or repository path, the excluded entries and the time
            limit. Out-of-scope requests are blocked and recorded. See{" "}
            <DocRef>Policy checks</DocRef>.
          </p>
        </DocSection>
        <DocSection title="Canonical targets">
          <p>
            A target is accepted only when it reduces to one canonical path on the approved host. Encoded separators,
            double encoding, <Mono>{"//"}</Mono>, matrix parameters, whitespace, control characters, credentials in the URL and
            paths that leave a repository are refused rather than guessed at, so case, encoding and <Mono>..</Mono> cannot
            slip past an exclusion.
          </p>
        </DocSection>
        <DocSection title="Untrusted input stays data">
          <p>
            Target responses, tool output and the model&apos;s replies are data, never instructions.
            They are rendered as plain text (never markup) and evidence is masked. Nothing in them can approve, widen the scope or run a tool.
          </p>
        </DocSection>
        <DocSection title="Where the checks run">
          <p>
            In the store, the terminal&apos;s single authority: every decision goes through a store function that
            validates it and refuses with a plain message. The screens can pre-check for convenience (the code&apos;s six
            digits), but they show and respect the store&apos;s verdict. With a backend, that boundary moves to the
            server, never to the model.
          </p>
        </DocSection>
      </>
    ),
  },
  "approval-model": {
    lede: "Two kinds of approval: the scope, once, and every risky action, each time it comes up.",
    body: (
      <>
        <DocSection title="Scope approval">
          <p>
            The Template screen shows the drafted scope manifest. Testing begins only after you approve it and run the
            plan; without that, no tool is started. Rejecting the scope tests nothing. See{" "}
            <DocRef>Scope manifest</DocRef>.
          </p>
        </DocSection>
        <DocSection title="Action approval">
          <p>
            Each gated action carries a fixed risk. <Badge variant="accent">MEDIUM</Badge> needs one decision.{" "}
            <Badge variant="accent">HIGH</Badge> needs a double check: a confirmation step with a single-use token, a second
            dialog that defaults to &quot;No, go back&quot;, and the matching request hash. An approval is bound to the exact
            request shown; if the request changes, the approval does not apply. Rejecting stops the assessment. No typed
            reason is asked for. See <DocRef>Approval gates</DocRef>.
          </p>
          <p>
            Editing where an action runs (Edit params, Edit steps) is policy-checked, rebuilds the request and its hash
            and voids any open token; the risk and the method never change. You can stop an assessment at any time.
          </p>
        </DocSection>
        <DocSection title="Audit">
          <p>
            Every request, verdict, decision and operator lands in the activity log and the audit trail (
            <Mono>/audit</Mono>), in the report, and in the saved copy the web dashboard shows read-only.
          </p>
        </DocSection>
      </>
    ),
  },
  "credential-handling": {
    lede: "Logins live in memory for the session, one-time codes are never stored, and secrets are masked everywhere.",
    body: (
      <>
        <DocSection title="The target login">
          <p>
            The approved tools decide which login the run needs (a session cookie or a test account), and the run asks
            for it in a secure form only when testing needs it. The values are kept in memory for this assessment only
            and are cleared when the form closes. A one-time code is a separate step: it is validated, used once and
            never stored. The chat refuses lines while the run waits for a login, so a password cannot land in the
            transcript by mistake.
          </p>
        </DocSection>
        <DocSection title="API keys">
          <p>
            Provider keys entered with <Mono>/provider</Mono> are encrypted (Fernet) before they reach{" "}
            <Mono>~/.reconix/llm.db</Mono> (0600); the key file is 0600; only a hint such as <Mono>sk-…3f9a</Mono> is ever
            shown, and the plaintext is decrypted only for the call that uses it. They are never written to{" "}
            <Mono>.env</Mono>. See <DocRef>Configuration</DocRef>.
          </p>
        </DocSection>
        <DocSection title="Masking">
          <ul>
            <li>Evidence in findings is masked (tokens, emails and ids partly hidden) before it is shown.</li>
            <li>
              Every string in a report, the saved copies for the dashboard and the context sent to a model goes through
              redaction; reports never contain the test account.
            </li>
            <li>
              The dashboard&apos;s sign-in link is printed only to a terminal, never to{" "}
              <Mono>~/.reconix/web.log</Mono>.
            </li>
          </ul>
        </DocSection>
      </>
    ),
  },
  "llm-data-handling": {
    lede: "What a model sees, where it goes, and what it can never do.",
    body: (
      <>
        <DocSection title="What the model sees">
          <p>
            When a model is active, a chat line typed during a run is sent with a fixed system prompt, a short
            description of the assessment state (target, template, scope status, phase, waiting gate, the findings&apos;
            ids, severities and titles, the approval decisions) and the last 40 chat turns. Every piece of text is
            cleaned and redacted first. The model gets no tools. Its reply is stripped of control characters, redacted and
            capped at 8,000 characters before it is shown.
            The passages of your <Mono>/add-on</Mono> files relevant to the line (up to 4,000 characters) go with it,
            fenced as untrusted reference material, to the active model, local or remote.
          </p>
          <p>
            With the backend harness, the AI agent behind <Mono>/assess</Mono> sees the target, the tool output it
            gathers and your answers to its questions. A username and password it asks for are exchanged host-side for a
            session (the raw password never reaches the model), but that session (a header with its bearer token or
            cookie), like a token or cookie you give it directly, is returned to the agent as the tool&apos;s result, so
            it reaches the model and its provider.
          </p>
        </DocSection>
        <DocSection title="Where it goes">
          <Callout variant="warning">
            The context is sent to the provider you configured: a local Ollama or endpoint stays on your machine; OpenAI,
            Anthropic, DeepSeek or a remote endpoint receive it, and with the AI agent so does a token or cookie you type
            into its login form, or the session token or cookie minted from the username and password you type. Check
            that this is acceptable for the data in your assessment before activating a remote model.
          </Callout>
          <p>
            Chat lines and replies are kept in <Mono>~/.reconix/llm.db</Mono> (redacted). The dashboard&apos;s AI Assistant
            is separate: you choose its model with the model chip, local or cloud (cloud providers are allowed by
            default, and the assistant says when your questions go off this machine); it builds its context from the saved
            files with no evidence, and masks the questions before they leave.
          </p>
        </DocSection>
        <DocSection title="What it never does">
          <ul>
            <li>Approve or reject an action, change the scope, run a tool or give credentials: a human decides every gated step.</li>
            <li>Change a policy verdict: the policy engine ignores it.</li>
            <li>Supply a number on the dashboard: every count is computed from the saved data.</li>
          </ul>
          <p>
            Tool output and target data are untrusted data to the model as well: it is told to summarize
            them, never to obey instructions found inside them. A different model never changes what is allowed to run.
          </p>
        </DocSection>
      </>
    ),
  },
  limitations: {
    lede: "What to keep in mind when you read Reconix results.",
    body: (
      <>
        <DocSection title="Known limitations">
          <ul>
            <li>
              <strong>The scripted run is a simulation.</strong> Its findings are demo data for the template, not the state
              of your target. Real findings come from the AI agent.
            </li>
            <li>
              <strong>Findings generated with AI can be wrong.</strong> A finding whose validation is not CONFIRMED is
              marked as needing review; the agent&apos;s findings are CONFIRMED only when it verified them.
            </li>
            <li>
              <strong>Severity is never guessed.</strong> It comes from the tool or from the analyst&apos;s override; a
              CVSS score of 0.0 means not scored.
            </li>
            <li>
              <strong>The policy engine is only as good as the scope.</strong> It enforces the manifest you approved; it
              cannot know what you meant to exclude.
            </li>
            <li>
              <strong>A stopped assessment cannot resume</strong>, and only a completed one can be exported. Partial
              findings are kept.
            </li>
            <li>
              <strong>The terminal keeps its assessments in memory</strong> for the session; the saved copies in{" "}
              <Mono>~/.reconix/assessments</Mono> are for the dashboard to read, not for the terminal to reopen.
            </li>
          </ul>
          <p>
            More on fields and validation in{" "}
            <DocRef>Understanding findings</DocRef>.
          </p>
        </DocSection>
      </>
    ),
  },
};
