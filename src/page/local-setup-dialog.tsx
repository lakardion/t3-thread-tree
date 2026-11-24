import { Play } from "lucide-react";
import { useEffect, useState } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { setupPrompt } from "./local-setup.ts";
import { ActionDialog, ActionForm } from "./send-dialog.tsx";
import { postStart } from "./send.ts";

type Choice = { id: string; label: string };

/** Mounted only while open, so each open reloads the projects and resets the prompt. */
function SetupForm() {
  const [choices, setChoices] = useState<Choice[]>([]);
  const [project, setProject] = useState("");
  const [draft, setDraft] = useState(() => setupPrompt(location.origin));
  useEffect(() => {
    let alive = true;
    void fetch("/t3/projects")
      .then((r) => (r.ok ? (r.json() as Promise<Choice[]>) : []))
      .catch(() => [])
      .then((list) => {
        if (!alive) return;
        setChoices(list);
        setProject(list[0]?.id ?? "");
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <ActionForm
      title="Set up the Local model"
      description="Start a thread that installs and sets up the Local model on this machine. Reopen Settings when the thread is done."
      label="Start thread"
      icon={<Play />}
      ready={project !== "" && draft.trim() !== ""}
      run={() => postStart(project, "Set up the Local model", draft)}
    >
      <Select value={project} onValueChange={setProject}>
        <SelectTrigger className="w-full" aria-label="Project">
          <SelectValue placeholder="No project">{choices.find((c) => c.id === project)?.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {choices.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Textarea
        aria-label="Prompt"
        className="max-h-60 min-h-32"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
    </ActionForm>
  );
}

export const SetupDialog = ({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) => (
  <ActionDialog open={open} onOpenChange={onOpenChange}>
    <SetupForm />
  </ActionDialog>
);
