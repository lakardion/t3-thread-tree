import { MessageSquarePlus } from "lucide-react";
import { useState } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import type { BriefAction } from "../shared/brief.ts";
import type { Branch, ThreadNode } from "../shared/tree.ts";
import { ProjectIcon } from "./project-icon.tsx";
import { ActionDialog, ActionForm } from "./send-dialog.tsx";
import { postStart, projectIdOf, startDefaults } from "./send.ts";

type Props = {
  a: BriefAction;
  prompt: string;
  live: Map<string, ThreadNode>;
  projects: Branch[];
};

/** Mounted only while open, so each open starts from the defaults and the prompt. */
function StartForm({ a, prompt, live, projects }: Props) {
  const [defaults] = useState(() => startDefaults(a, live, projects));
  const [projectId, setProjectId] = useState(defaults.projectId);
  const [title, setTitle] = useState(defaults.title);
  const [draft, setDraft] = useState(prompt);
  const label = (id: string) => projects.find((p) => projectIdOf(p) === id)?.label;

  return (
    <ActionForm
      title="Start thread"
      description="Start a thread in a project with this message."
      label="Start thread"
      icon={<MessageSquarePlus />}
      ready={!!projectId && title.trim() !== "" && draft.trim() !== ""}
      run={() => postStart(projectId, title.trim(), draft)}
    >
      <Select value={projectId} onValueChange={setProjectId}>
        <SelectTrigger className="w-full" aria-label="Project">
          <SelectValue placeholder="No project">{label(projectId)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {projects.map((p) => (
            <SelectItem key={p.id} value={projectIdOf(p)}>
              <ProjectIcon name={p.label} />
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <input
        aria-label="Title"
        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <Textarea
        aria-label="Message"
        className="max-h-60 min-h-32"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
    </ActionForm>
  );
}

export function StartDialog({
  open,
  onOpenChange,
  ...p
}: Props & { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <ActionDialog open={open} onOpenChange={onOpenChange}>
      <StartForm {...p} />
    </ActionDialog>
  );
}
