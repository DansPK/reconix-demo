import { Badge } from "@/components/ui/badge";
import { Callout, Code, DocRef, DocSection, DocTable, Kbd, Mono, Steps } from "@/components/docs-primitives";
import type { GroupContent } from "@/content/docs/types";

export const assessmentGuide: GroupContent = {
  request: {
    lede: "A request names a target; the target's shape picks one of four templates.",
    body: (
      <>
        <DocSection title="Two ways to start">
          <ul>
            <li>
              <strong>Type a target</strong> at the Start prompt (or <Mono>/new &lt;target&gt;</Mono>). An IPv4 address or
              range is a Network assessment, an http(s) URL a Web URL one (an API one when its path or a word on the
              line says so), a git repository or a local path a Source Code one. These leave no doubt, so the template
              applies at once. A bare hostname could be any of them: the Template screen asks, with Reconix&apos;s pick
              marked as recommended.
            </li>
            <li>
              <strong>Pick a template first</strong> with <Mono>/template</Mono> (or <Mono>/template &lt;id&gt;</Mono>), then
              type its target. The target must fit the template you picked.
            </li>
          </ul>
        </DocSection>
        <DocSection title="The four templates">
          <DocTable
            caption="The assessment templates"
            head={["Template (id)", "Target and default scope"]}
            rows={[
              { key: "Network · network", value: <>Hosts, ports and exposed services. An IPv4 address or range, or a hostname, e.g. <Mono>10.0.0.0/24</Mono>. The scope lists allowed ports (22, 80, 443, 8080, 8443 by default).</> },
              { key: "API · api", value: <>REST and GraphQL endpoints. The API&apos;s base URL, e.g. <Mono>https://api.example.com/v1</Mono>.</> },
              { key: "Source Code · source", value: <>Static review of a repository. A git repo URL or a local path, e.g. <Mono>https://git.example.com/acme/app.git</Mono>. The scope excludes paths instead of URLs.</> },
              { key: "Web URL · web_url", value: <>A web application at a URL, e.g. <Mono>https://shop.example.com</Mono>. Discovery, vulnerability scanning and limited validation; GET and POST; <Mono>/admin</Mono> excluded; 30 minutes; Nuclei and OWASP ZAP.</> },
            ]}
          />
          <p>
            Words on the line only break ties and add intent: &quot;api&quot;, &quot;graphql&quot;, &quot;ports&quot;,
            &quot;nmap&quot;, &quot;repo&quot;, &quot;website&quot;; &quot;port 80, 443&quot; narrows the ports and a tool
            name (nmap, nuclei, nikto, zap, testssl, sqlmap, gobuster, ffuf, httpx, wpscan, nessus, burp, masscan) narrows
            the tools.
          </p>
        </DocSection>
        <DocSection title="What a request cannot do">
          <ul>
            <li>Start testing. Nothing runs until the scope is approved and the plan is run.</li>
            <li>
              Start twice: while a run is going, a line typed at the prompt goes to the assistant, not to a new run;{" "}
              <Mono>/new</Mono> starts over. (The store&apos;s own refusal, &quot;An assessment is already running. Type /new
              to start over.&quot;, is never reached from the prompt.)
            </li>
            <li>
              Be empty or too long: &quot;Type a request first.&quot;, &quot;Keep the request under 500 characters.&quot;
            </li>
            <li>
              Name a malformed target: <Mono>10.0.0.300</Mono> or a range wider than /16 is refused with the reason.
            </li>
          </ul>
        </DocSection>
        <DocSection title="What happens next">
          <p>
            Reconix builds the assessment from the template: its scope manifest, its plan, its gated actions and the
            findings the run can reveal, then stops at the <DocRef>scope gate</DocRef>.
          </p>
        </DocSection>
      </>
    ),
  },
  scope: {
    lede: "The scope manifest says what will be tested, what may be done and what is never touched. Approving it locks it.",
    body: (
      <>
        <DocSection title="What the manifest holds">
          <DocTable
            caption="The fields of a scope manifest"
            head={["Field", "Meaning"]}
            rows={[
              { key: "Target", value: "The URL, address, range, repository or path the request named." },
              { key: "Assessment type", value: "The template: Web URL, API, Network or Source Code." },
              { key: "Allowed actions", value: "What the run may do, in words: Discovery, vulnerability scanning, limited validation." },
              { key: "Allowed methods", value: "The HTTP methods a request may use (web and API scopes)." },
              { key: "Excluded paths", value: "Paths (or, for a network, hosts and ports; for source, repository paths) the run never touches." },
              { key: "Allowed ports", value: "Network scopes only." },
              { key: "Time limit", value: "Minutes; once reached, the run stops at its next step (\u201cTime limit reached. Testing stopped.\u201d) and, like any stopped run, cannot be exported; a request checked after that is blocked too." },
              { key: "Tools", value: "The tools the run may use. They decide the target login the plan asks for." },
            ]}
          />
          <p>The Template screen shows it in plain words with the note that the agent can only act inside it.</p>
        </DocSection>
        <DocSection title="Approve, edit or reject">
          <ul>
            <li>
              <strong>Approve scope</strong> locks the manifest and moves on to the plan. In agent mode it is also what
              authorizes the AI agent to start.
            </li>
            <li>
              <strong>Attach OpenAPI spec</strong> (API template only; the form opens on its own once the scope is
              drafted, and Cancel skips it; <strong>Replace OpenAPI spec</strong> once one is
              attached, with <strong>Remove OpenAPI spec</strong> to go back to the template&apos;s endpoints and methods) opens one
              form with two fields. <strong>API base URL</strong> is prefilled from the draft; a different one is checked
              like a typed target and re-drafts the scope for it (your manifest edits stay, and an attached spec whose
              servers are all on another host is removed with a notice). <strong>OpenAPI spec (optional)</strong> takes a{" "}
              <Mono>.json</Mono>, <Mono>.yaml</Mono> or <Mono>.yml</Mono> OpenAPI 3 or Swagger 2 file, or a URL on the
              API&apos;s own host (<Mono>https</Mono>; plain <Mono>http</Mono> only for localhost), of at most 5 MB. A URL
              is downloaded once, with no redirects and a 10 s limit, and audit-logged with its host and path, never the
              query; leave the field empty to keep only the base URL (an attached spec stays). The spec is only read,
              never run, and a symbolic link is refused. The manifest then shows the
              spec&apos;s title, version, endpoint count and methods; the discovery step and the plan use the real
              endpoint count; and the allowed methods become the ones you already had that the spec also uses, in your
              order (if none is shared they stay as they were). The spec never widens the scope: it cannot add a method
              (its other methods are listed as <em>In spec, not allowed</em>; add one yourself with Edit manifest), and a
              server on another host or port is listed as out of scope and not added. Only a
              summary is saved (title, version, endpoint count, methods, in-scope servers), never the file, and the Report
              view&apos;s Assessment card shows an API spec row. It can be attached until the scope is approved.
            </li>
            <li>
              <strong>Edit manifest</strong> opens a form for the allowed methods, the excluded paths, the ports (network),
              the tools and the time limit, as comma-separated values. The store validates each field:
              &quot;Keep at least one allowed method.&quot;, &quot;Not an HTTP method: …&quot;, &quot;Excluded paths
              start with &apos;/&apos;: …&quot;, &quot;Not a valid port: …&quot;, &quot;Keep at least one allowed
              port.&quot;, &quot;The time limit is a number of minutes.&quot;, &quot;Keep at least one tool.&quot;. A refused
              value keeps the form open.
            </li>
            <li>
              <strong>Reject</strong> discards the draft: nothing is tested, the assessment stops (&quot;Scope rejected.
              Nothing was tested.&quot;) and a fresh one starts.
            </li>
          </ul>
          <Callout variant="warning" title="When the scope can change">
            Only while it waits for approval: &quot;The scope can only be edited while it waits for approval.&quot; Once
            approved it is locked (&quot;The scope is already approved.&quot;), and approving or rejecting it at any other
            time is refused (&quot;The scope can only be approved when Reconix asks for it.&quot;).
          </Callout>
        </DocSection>
        <DocSection title="What approval means">
          <p>
            The approved manifest is the boundary the <DocRef>policy engine</DocRef>{" "}
            checks every request against, and it is what the report&apos;s &quot;Approved scope and limitations&quot;
            section prints. It is recorded in the audit trail and in the saved copy the web dashboard shows.
          </p>
        </DocSection>
      </>
    ),
  },
  plan: {
    lede: "The plan lists the phases, the login the tools need and the gated steps. Testing starts when you run it.",
    body: (
      <>
        <DocSection title="The rows">
          <DocTable
            caption="What the plan lists"
            head={["Row", "What it is"]}
            rows={[
              { key: "Phases", value: "Discovery (map the permitted surface), scanning (policy-checked checks on what discovery found), validation (limited validation of the candidates), analysis (merge duplicates, map to OWASP / CWE, score CVSS) and report. The labels are the template's own." },
              { key: "Target login", value: "LOW. Which login the approved tools need, asked when testing needs it and kept for this session only." },
              { key: "Gated steps", value: "Each risky action with its risk (MEDIUM or HIGH), the exact request it will send, its purpose and its impact." },
            ]}
          />
          <p>
            <Kbd>Tab</Kbd> moves from the menu into the list; each row shows its status live (pending, active, done,
            and for gated steps the decision).
          </p>
        </DocSection>
        <DocSection title="The login the tools need">
          <p>The approved scope&apos;s tools decide it:</p>
          <DocTable
            caption="What each tool needs to reach the part behind a sign-in"
            head={["Tool", "Login"]}
            rows={[
              { key: "OWASP ZAP", value: "A test account (email or username and password): it signs in through the target's login form." },
              { key: "Nuclei, ZAP API scan, Postman", value: "A session cookie, sent with their checks." },
              { key: "nmap, testssl.sh, the code scanners", value: "Nothing." },
            ]}
          />
          <p>
            One login covers them all: the stronger covers the weaker, so a test account also covers the cookie tools. If
            the target asks for a one-time code after the password, that is a second step on its own, right after the
            first; the code is validated and never stored. See{" "}
            <DocRef>Credential handling</DocRef>.
          </p>
        </DocSection>
        <DocSection title="The gated steps">
          <p>Each template plans one MEDIUM and one HIGH step:</p>
          <DocTable
            caption="The gated steps of each template"
            head={["Template", "Steps"]}
            rows={[
              { key: "Web URL, API", value: <><Badge variant="accent">MEDIUM</Badge> Baseline request (read-only) · <Badge variant="accent">HIGH</Badge> limited_validation</> },
              { key: "Network", value: <><Badge variant="accent">MEDIUM</Badge> Banner and TLS check (read-only) · <Badge variant="accent">HIGH</Badge> single_login_probe</> },
              { key: "Source Code", value: <><Badge variant="accent">MEDIUM</Badge> Read the flagged line (read-only) · <Badge variant="accent">HIGH</Badge> secret_validation</> },
            ]}
          />
        </DocSection>
        <DocSection title="Run, edit or cancel">
          <Steps>
            <li>
              <strong>Run plan</strong> starts testing (&quot;Plan approved · testing starts&quot; in the activity log) and
              opens the Execution screen. Risky steps still pause the run and ask you first.
            </li>
            <li>
              <strong>Edit steps</strong> asks which gated step to change and opens a form with the one value you may
              change: where the action runs (a path, a host:port or a repository file). The policy engine checks the new
              value, the exact request and its hash are rebuilt, and the risk and method stay the same. Disabled when no
              step can be edited.
            </li>
            <li>
              <strong>Cancel</strong> goes back to the scope; nothing runs.
            </li>
          </Steps>
          <p>
            Messages: &quot;The plan can only be run when Reconix asks for it.&quot; (the run is not at the plan gate, or
            the scope is not approved), &quot;The plan is already running.&quot;, &quot;Approve the scope first — the plan
            runs only inside it.&quot;
          </p>
        </DocSection>
      </>
    ),
  },
  "policy-checks": {
    lede: "Every request the run proposes is checked against the approved scope before it runs. The rest is blocked.",
    body: (
      <>
        <DocSection title="How a request is checked">
          <p>
            The policy engine takes the method and the target of each proposed request and decides, deterministically,
            from the approved manifest alone. The check depends on the scope&apos;s kind:
          </p>
          <ul>
            <li>
              <strong>Web URL and API:</strong> the method must be an allowed method; the target must reduce to one
              canonical path on the approved host (same scheme, host and port; no credentials in the URL); the path is
              lower-cased and decoded, matrix parameters are dropped, and anything ambiguous (encoded separators, double
              encoding, <Mono>{"//"}</Mono>, whitespace, control characters) is refused rather than guessed at; the path must
              not be under an excluded path.
            </li>
            <li>
              <strong>Network:</strong> the host must be the target or inside its range, the port (if any) must be in the
              allowed list, and neither may be excluded.
            </li>
            <li>
              <strong>Source Code:</strong> the path must stay inside the repository as written (no <Mono>..</Mono>,{" "}
              <Mono>~</Mono>, drive or URL colon, backslash) and not be under an excluded path.
            </li>
          </ul>
        </DocSection>
        <DocSection title="The verdicts">
          <DocTable
            caption="Why a request is blocked"
            head={["Reason", "When"]}
            rows={[
              { key: "Scope not approved", value: "A request before the manifest was approved." },
              { key: "Time limit reached", value: "The scope's time limit has passed (the run itself stops at its next step)." },
              { key: "Encoded path separators are not allowed", value: "Web and API: the path contains %2F or %5C." },
              { key: "Method <X> not allowed", value: "Web and API: the method is not in the allowed methods." },
              { key: "Host outside approved scope", value: "Another host, scheme or port than the target's; or a network host outside the range." },
              { key: "Malformed request target / Malformed target", value: "The target cannot be read safely (ambiguous encoding, control characters, an unreadable host:port)." },
              { key: "Path outside approved scope", value: "Web and API: the path is under an excluded path." },
              { key: "Host or port outside approved scope", value: "Network: an excluded entry covers the host (and port)." },
              { key: "Port <N> not in the approved list", value: "Network: the port is not an allowed port." },
              { key: "Path leaves the repository / Path excluded from the review", value: "Source Code." },
            ]}
          />
          <p>
            An allowed request is recorded as &quot;Within approved scope&quot; and runs; a blocked one shows as a red
            line in the live output with a banner, is counted in the executive summary (&quot;out-of-scope requests were
            blocked by the policy engine&quot;), listed in the report&apos;s blocked requests, written to the audit trail
            (<Mono>policy.blocked</Mono>) and kept in the saved copy the dashboard reads.
          </p>
        </DocSection>
        <DocSection title="Where else the policy runs">
          <ul>
            <li>
              Before an approval is recorded: approving a gated action runs the check on its request again, so a request
              that no longer fits the scope is refused with &quot;Blocked by policy: …&quot; instead of being approved.
            </li>
            <li>
              When you edit where a gated action runs: the new value must pass, or the edit is refused the same way.
            </li>
          </ul>
          <Callout>
            The model never takes part. The AI agent (with the harness) proposes tools and requests; the scope you
            approved is what it works inside, and the deterministic checks above are what the simulated run applies.
          </Callout>
        </DocSection>
      </>
    ),
  },
  "approval-gates": {
    lede: "A gated action waits for you. MEDIUM asks once; HIGH asks, then double-checks the exact request.",
    body: (
      <>
        <DocSection title="The Approval screen">
          <p>
            When the run reaches a gated step it pauses and opens the Approval screen: the action, its risk, its purpose,
            its impact and the exact request that will run. The menu offers <strong>Approve &amp; run</strong>,{" "}
            <strong>Reject</strong>, <strong>Edit params</strong> and <strong>View details</strong> (highlighted first, so a
            stray Enter only shows the details: the scope limits, the exact request and the audit trail; <Kbd>d</Kbd> opens
            them too). <Kbd>Esc</Kbd> decides later: the run stays paused and <Mono>/approval</Mono> or <Kbd>Enter</Kbd> on
            Execution brings the gate back.
          </p>
        </DocSection>
        <DocSection title="MEDIUM risk">
          <p>
            <Badge variant="accent">MEDIUM</Badge> One decision. Approve &amp; run records the approval bound to the request&apos;s
            hash and the run continues (&quot;MEDIUM action approved by analyst.&quot;). Reject records the rejection and{" "}
            <strong>stops the assessment</strong>: nothing else runs, the findings so far are kept.
          </p>
        </DocSection>
        <DocSection title="HIGH risk: the double check">
          <p>
            <Badge variant="accent">HIGH</Badge> Approve &amp; run first opens a <strong>confirmation step</strong>: the store hands
            out a single-use token for this request and a second dialog (&quot;HIGH-RISK · second confirmation&quot;)
            shows the exact request again, with <strong>No, go back</strong> selected. Only &quot;Yes, run … on …&quot;
            approves; leaving the dialog voids the token. Approving then needs both the unused token and the matching
            request hash. No typed reason is asked for.
          </p>
          <DocTable
            caption="Why an approval can be refused"
            head={["Message", "Meaning"]}
            rows={[
              { key: "This action isn't waiting for a decision.", value: "The run is not paused at this gate." },
              { key: "This action was already decided.", value: "A decision is already recorded for it." },
              { key: "This approval is for a different request.", value: "The hash you approved is not this request's hash." },
              { key: "The request changed after it was shown. Review it again.", value: "The command no longer matches its hash: look at it again before approving." },
              { key: "HIGH-risk actions need the confirmation step first.", value: "A HIGH approval without a valid, unused token." },
              { key: "Only HIGH-risk actions need a confirmation step.", value: "A confirmation was requested for a MEDIUM action." },
              { key: "Blocked by policy: <reason>.", value: "The request no longer fits the approved scope; it is not approved." },
            ]}
          />
        </DocSection>
        <DocSection title="Edit params">
          <p>
            Changes the one value that says where the action runs (a path, a host:port or a repository file) before you
            decide. The policy engine checks the new value, the target, the exact request and its hash are rebuilt, and
            any open confirmation token is voided, so what you approve is exactly what is shown. The risk, the method and
            the gates never change. Allowed only while the run waits at the plan or at this action&apos;s gate, and only
            for undecided actions with something to edit: &quot;This action can&apos;t be edited now.&quot;, &quot;This
            action has nothing to edit.&quot;, &quot;Edit an action on the plan, or when Reconix asks you to approve
            it.&quot;, &quot;Enter the path.&quot;, &quot;That path can&apos;t be used: one value, no spaces, at most 200
            characters.&quot;, &quot;Blocked by policy: …&quot;.
          </p>
        </DocSection>
        <DocSection title="What is recorded">
          <p>
            Each decision (approved or rejected, the operator, the request hash, the time) goes into the assessment, the
            activity log, the audit trail, the report&apos;s approvals list and the saved copy. The dashboard shows a
            request that waits on you on the Overview&apos;s Execution Timeline; decisions are only ever made in the
            terminal.
          </p>
        </DocSection>
      </>
    ),
  },
  execution: {
    lede: "The live run: what is happening, what it waits for, and how to stop it.",
    body: (
      <>
        <DocSection title="What the screen shows">
          <ul>
            <li>
              <strong>The tasks</strong> of the plan, each queued, running, paused or done. There are no percentages: a
              backend cannot know how far a scan has got.
            </li>
            <li>
              <strong>A spinner</strong> with the task Reconix is on and the testing time so far.
            </li>
            <li>
              <strong>The live output</strong>: time · who (SYS, AI, USER, TOOL, POLICY) · message. It follows new lines
              while you are at the bottom; scroll up to read and it stays put until <Kbd>End</Kbd>. A request the policy
              blocked is a red line and a banner.
            </li>
          </ul>
          <p>
            The screen opens only after the plan has run; <Mono>/status</Mono> (alias <Mono>/execution</Mono>) and{" "}
            <Kbd>5</Kbd> get there.
          </p>
        </DocSection>
        <DocSection title="When the run pauses">
          <ul>
            <li>
              <strong>The target login.</strong> A secure form asks for what the tools need: a session cookie, or a test
              account (email or username and password). If the target then asks for a one-time code, a second form asks
              for just the six digits (&quot;The one-time code is 6 digits.&quot;). Fields cannot be empty or over-long
              (&quot;Enter the password.&quot;, &quot;Password is too long.&quot;), and a login is accepted only when the run
              asks for it (&quot;A login can only be added when Reconix asks for one.&quot;). The account lives in memory
              for this session; the code is never stored.
            </li>
            <li>
              <strong>A gated action.</strong> The Approval screen opens. See{" "}
              <DocRef>Approval gates</DocRef>.
            </li>
          </ul>
          <p>
            If you moved away, <Kbd>Enter</Kbd> on Execution (or an empty line on the Start prompt) reopens what the
            run waits for.
          </p>
        </DocSection>
        <DocSection title="Stopping">
          <p>
            <Kbd>Ctrl+C</Kbd> on Execution asks &quot;Keep running&quot; or &quot;Stop now&quot; (nothing else runs; the
            findings so far are kept). Rejecting the scope or a gated action also stops the run, and so does the scope&apos;s
            time limit (&quot;Time limit reached. Testing stopped.&quot;). A stopped assessment
            cannot be resumed: <Mono>/new</Mono> starts another, and the stopped one keeps its partial findings under{" "}
            <Mono>/assessments</Mono>. With no run going, stopping says &quot;No assessment is running.&quot;
          </p>
        </DocSection>
        <DocSection title="Browsing while it runs">
          <p>
            The run keeps playing while you look at other screens. When it reaches a gate, the app opens the screen that
            decides it; a gate that arrives while a dialog is open waits for the dialog to close.{" "}
            <Mono>/assessments</Mono> can switch to another assessment of the session and back; a run that was playing
            plays on.
          </p>
        </DocSection>
      </>
    ),
  },
  findings: {
    lede: "Findings appear as testing finds them; when the plan has run, the assessment is complete.",
    body: (
      <>
        <DocSection title="As they are found">
          <p>
            A finding is revealed when the run reaches it: it shows up on the Findings screen at once, with its severity,
            title, path, validation, CVSS and the tool that found it. The counters in the top bar follow. Findings from
            the AI agent are added the same way, with their own id
            prefix (<Mono>AI-001</Mono>); duplicates (same severity, title and path) are not added
            twice.
          </p>
        </DocSection>
        <DocSection title="Completion">
          <p>
            When every planned step has run, the run is <strong>completed</strong>: the executive summary is written, the
            report can be exported, and <Mono>/summary</Mono> shows the totals. If the same target was assessed earlier
            in the session, the Report screen compares the two: new, recurring and resolved findings.
          </p>
        </DocSection>
        <DocSection title="What to do with them">
          <p>
            Filter, sort, triage and read them on the Findings and Finding Detail screens; see{" "}
            <DocRef>Understanding findings</DocRef>. Then export the report:{" "}
            <DocRef>Exporting</DocRef>.
          </p>
        </DocSection>
      </>
    ),
  },
  "ai-agent": {
    lede: "With a model active and the backend harness installed, /assess hands a real assessment to an AI agent, behind the same scope gate.",
    body: (
      <>
        <DocSection title="What you need">
          <Steps>
            <li>
              The backend harness: <Mono>pip install -e backend</Mono> (it adds litellm, mcp and pyyaml, and needs{" "}
              <strong>Python 3.10 or later</strong>, unlike the terminal&apos;s 3.9). Without it:
              &quot;The harness backend isn&apos;t installed (pip install -e backend).&quot;
            </li>
            <li>
              A reachable Kali MCP server, configured in <Mono>.env</Mono>: <Mono>KALI_MCP_TRANSPORT</Mono> (http, sse or
              stdio), <Mono>KALI_MCP_URL</Mono> and <Mono>KALI_MCP_AUTH_TOKEN</Mono>, or for stdio{" "}
              <Mono>KALI_MCP_SSH_HOST</Mono> and <Mono>KALI_MCP_REMOTE_CMD</Mono>. <Mono>HARNESS_DB_PATH</Mono> is the
              agent&apos;s own SQLite database of targets, scans and findings.
            </li>
            <li>
              An active model (<DocRef>/model</DocRef>). Without one: &quot;Pick a model
              first with /model.&quot;
            </li>
          </Steps>
          <Code>{`/provider set reconix        # or any other provider
/provider test reconix
/model reconix/<model>
/assess http://target.example.com`}</Code>
        </DocSection>
        <DocSection title="How it runs">
          <Steps>
            <li>
              <Mono>/assess &lt;target&gt;</Mono> (alias <Mono>/agent</Mono>), or simply a target typed at the prompt while a
              model is active, builds the run and its scope like the scripted flow and opens the Template screen. Text
              that is not a target is refused: &quot;That doesn&apos;t look like a scan target (URL, host or repo).&quot;
              A running assessment&apos;s playback pauses and it stays listed under <Mono>/assessments</Mono> (reopening it
              resumes it); a fresh one starts.
            </li>
            <li>
              The scope manifest lists the agent&apos;s whole tool set (the harness&apos;s scanners: gobuster, httpprobe,
              nikto, nmap, nuclei, sqlmap, whatweb, zap), since the agent plans dynamically. <strong>Approving the scope
              is the authorization</strong>: Reconix registers the approved target as authorized (the model does not
              decide that), the agent is told the engagement is approved and starts at once.
            </li>
            <li>
              The Execution screen shows the agent&apos;s own plan as task rows (updated as it revises them), its tool
              calls in the live output and its reasoning as muted &quot;thinking…&quot; lines. Findings it records are
              mapped into the store as <Mono>AI-NNN</Mono> findings, their evidence redacted, so <Mono>/findings</Mono>,
              the report, <Mono>/summary</Mono> and the dashboard see them.
            </li>
            <li>
              When the agent needs a decision it pops a dialog (&quot;AGENT NEEDS YOUR DECISION&quot;, Yes/No or its own
              options); when it needs a login it pops the secure-input form. A username and password are exchanged
              host-side for a session, so the raw password never reaches the model, but the <strong>session it mints
              (a header with a bearer token or cookie)</strong>, like a <strong>token or cookie you type</strong>, is handed
              back to the agent as the tool&apos;s result, so it does reach the model and its provider.
            </li>
            <li>
              A line typed during the run continues the same agent (its history is kept). While a turn runs, chat waits:
              &quot;The assessment is running — you can chat once it finishes.&quot; When the turn ends the run is marked
              complete.
            </li>
          </Steps>
        </DocSection>
        <DocSection title="Switching models mid-assessment">
          <p>
            <Mono>/model</Mono> at any time repoints the agent at the new provider and model; its conversation, the
            findings and the approvals are preserved. The model is set before every turn from the active provider, and
            the API key is decrypted only for that call.
          </p>
        </DocSection>
        <DocSection title="What is and is not enforced">
          <Callout variant="warning" title="Real tools, scope checked on every call">
            The agent runs real tools against the target you named. Only assess what you are authorized to test. In
            agent mode Reconix checks <strong>every tool call</strong> against the scope you approved before it runs:
            the target host (and, on a network scope, the port list), the allowed methods and excluded paths on a web
            or API scope, the tool set and the time limit. A refused call is not executed; the agent is told why, and
            the refusal appears as a policy line in the activity log, in the blocked count and in the audit trail.
            Authorizing a target outside the scope is refused too, and a source-code scope refuses every network tool.
            Two limits to know. The tool set is listed in full on the manifest before you approve, so it restricts the
            agent only if you edit the tools down. And the check is on the call, not on the traffic inside it: a
            scanner&apos;s own crawling or probing of an allowed target is not checked request by request, and a scan of
            a bare host on a network scope is judged by host only (so nmap may then try every port). The per-action
            approval gates (MEDIUM, and the HIGH double check) are <strong>not applied to the agent</strong>: it is
            told the engagement is approved and not to ask for confirmation. A login request never follows redirects,
            so credentials are not re-sent to another address. What also applies: the scope approval before anything
            starts, the dialogs it opens for decisions and logins, the redaction of what it logs and the evidence it
            records, and the audit trail. <Mono>/assess</Mono>, <Mono>/new</Mono>, opening another assessment and
            quitting cancel a running agent turn; the run you leave is marked stopped. Without a model or the harness,
            the scripted sample runs instead.
          </Callout>
        </DocSection>
      </>
    ),
  },
};
