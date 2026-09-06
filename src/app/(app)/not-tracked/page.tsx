import { PageHeader, Panel } from "@/components/brand";
import { requireContext } from "@/lib/auth";

// The published contract (WIS design, "what is NOT tracked"). Every person
// reads this before connecting a source. It is deliberately plain and short.
export default async function NotTrackedPage() {
  await requireContext();
  const notTracked = [
    "No keystroke logging, screenshots, or active-window spying.",
    "No message content stored for judgment. The signal is “worked on Slate”, not what was written. Subjects and the counterparty domain are kept as evidence; bodies never are.",
    "No idle-time or productivity-score policing. Every hour attributes to the nearest project or category, including the messy ones. Noise is not waste.",
    "No personal accounts and no off-hours surveillance. Only the work mailbox and work tools you connect yourself.",
    "No secret view. What the app knows about your day is what you see on your own timesheet, first.",
  ];
  const tracked = [
    "Sent mail: when, to which domain, and the subject line.",
    "Calendar: meetings you accepted, their titles and real length.",
    "Monday: your status changes and updates on boards.",
    "HubSpot: notes, calls and meetings logged on deals.",
  ];
  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        eyebrow="the contract"
        title="What is not tracked"
        blurb="The app reads the tools you already work in so you do not have to keep a timesheet by hand. It proposes; you confirm. Here is the line it does not cross."
      />
      <div className="grid gap-[13px] lg:grid-cols-2">
        <Panel title="Never">
          <ul className="flex flex-col">
            {notTracked.map((t) => (
              <li
                key={t}
                className="border-line text-alum border-b border-dashed px-4 py-3 text-[13.5px] last:border-0"
              >
                {t}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Read, with your consent">
          <ul className="flex flex-col">
            {tracked.map((t) => (
              <li
                key={t}
                className="border-line text-alum border-b border-dashed px-4 py-3 text-[13.5px] last:border-0"
              >
                {t}
              </li>
            ))}
            <li className="text-alum-2 px-4 py-3 text-[12px]">
              Disconnect a source at any time on Connections; its open proposals
              are removed with it. Nothing posts to your timesheet until you
              confirm it.
            </li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
