Ladies and gentlemen, welcome to Reconix.
Earlier, we introduced a common scenario: you've built a website, but you're not sure whether it's secure.
If you're a non-technical user who relies on AI to build websites, how can you test its security? And for developers or security professionals, is there a better way to assess security without managing multiple tools?
With Reconix, there is a simpler way.
[Step 1 — Introduce the Reconix Repository]
[Show the Reconix repository]
Reconix is an open-source project. You can clone the repository and run it locally by following the installation instructions in the documentation.
Once installed and configured, you're ready to start a security assessment directly from the terminal.
[Step 2 — Select Model Provider]
[Show the model provider selection]
First, let's select our preferred AI model provider.
Reconix supports OpenAI, Anthropic, local model deployment, and our own model endpoint, giving users flexibility in how they run their assessments.
[Select the model provider for the demonstration]
For this demonstration, I'll use the Reconix model endpoint.
[Step 3 — Demonstrate the Unified Input Box]
[Show the unified terminal input box]
Now, here's one of Reconix's key features: the unified terminal input box.
If you're unfamiliar with cybersecurity tools or commands, you can simply describe what you want to do in natural language.
For experienced developers or security analysts, Reconix also supports direct commands using the / prefix.
Whether you describe your goal or enter a command, Reconix brings both approaches into one interface.
[Demonstrate a natural-language request, then briefly show the / command option]
[Step 4 — Assessment Template and Scope]
Now, let's start our security assessment.
Reconix interprets our request and recommends an appropriate assessment template.
[Show the recommended assessment template]
Reconix provides several templates, including Network, API, Web, and Source Code.
Since our request includes a website URL, the AI recommends the Web template.
[Confirm the Web template and display the testing boundaries]
Next, Reconix defines the target and boundaries of our assessment — in other words, what we are authorized to test.
We review and approve these boundaries before proceeding.
But approval is only the first layer of protection. Reconix also has security safeguards that help keep AI actions under control.
Before taking any action, Reconix checks whether it follows the approved testing boundaries and security rules.
Low-risk actions can proceed automatically, while higher-risk actions require human approval.
This means the AI can assist with security testing without having unrestricted control over the target.
[Step 5 — Tool Integration and Execution]
[Show the assessment beginning]
With the testing boundaries approved, Reconix begins coordinating the appropriate cybersecurity tools.
Through its dynamic tool registry, Reconix integrates a wide range of security tools for different types of assessments. For our web assessment, it can use tools such as [name the tools shown in the demonstration].
[Briefly show the assessment progress or relevant tool output]
Here, the security tools collect technical evidence from our authorized test environment, which Reconix uses for further analysis.
This helps reduce the need for users to manage multiple security tools individually.
[Step 6 — Security Analysis: AI and RAG]
But collecting evidence is only the first step. How do we turn these technical results into meaningful security insights?
This is where Retrieval-Augmented Generation, or RAG, comes in.
[Show the RAG retrieval process or relevant retrieved knowledge]
Reconix retrieves relevant security information from established cybersecurity knowledge sources, including the OWASP Top 10 and the National Vulnerability Database.
This provides additional context to support the AI's analysis rather than relying solely on what the AI already knows.
[Show a real security finding and its supporting evidence]
Reconix presents the potential vulnerability, its severity, supporting evidence, and recommended ways to address it.
The security tools collect evidence, RAG retrieves relevant knowledge, and AI helps explain what the findings mean and how they can be addressed.
This makes security findings easier to understand and investigate.
[Step 7 — Dashboard and Reporting]
[Open the Reconix Web Security Assessment Dashboard]
Now, let's bring the results together.
The Reconix Web Security Assessment Dashboard allows us to review identified vulnerabilities, supporting evidence, and assessment history in one place.
[Navigate through the findings]
These findings help developers, security professionals, and non-technical users understand and address potential security issues.
Beyond reviewing results, users can also document and share them.
[Show the report export feature]
Reconix supports exporting structured security reports in JSON, PDF, and DOCX formats, making it easier to preserve findings, share results, and plan remediation.
[Step 8 — VS Code Integration]
Finally, Reconix also provides Visual Studio Code integration, bringing security testing closer to the developer's existing workflow.
[Switch Tab and Show the VS Code integration]
This allows developers to incorporate security assessments into their development process without relying entirely on a separate terminal workflow.
[End the live demonstration and return to the presentation slides]
