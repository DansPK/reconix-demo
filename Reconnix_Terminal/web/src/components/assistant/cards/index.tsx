/* A reply card, by kind (lib/assistant/protocol.ts): every one shows data the server built
   from the saved files. */
import type { Card } from "@/lib/assistant/protocol";
import { ApprovalsCard } from "./approvals-card";
import { FindingCard } from "./finding-card";
import { FindingsCard } from "./findings-card";
import { NoticeCard } from "./notice-card";
import { PolicyCard } from "./policy-card";
import { ProgressCard } from "./progress-card";
import { ReportCard } from "./report-card";
import { ToolsCard } from "./tools-card";

export function CardView({ card }: { card: Card }) {
  switch (card.kind) {
    case "findings":
      return <FindingsCard card={card} />;
    case "finding":
      return <FindingCard card={card} />;
    case "progress":
      return <ProgressCard card={card} />;
    case "approvals":
      return <ApprovalsCard card={card} />;
    case "policy":
      return <PolicyCard card={card} />;
    case "tools":
      return <ToolsCard card={card} />;
    case "report":
      return <ReportCard card={card} />;
    case "notice":
      return <NoticeCard card={card} />;
  }
}

export { NoticeCard };
