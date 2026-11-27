import { Check, ChevronDown, ChevronRight, GitBranch, Search } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import {
  BandCanvas,
  BandLabel,
  FRAME,
  MapBody,
  RefreshButton,
  merge,
  openCount,
  scopeName,
  type Band,
  type Props,
} from "./pr-graph-prototype.tsx";
import { Canvas, Legend, Lists, pan, StatusMark } from "./pr-graph.tsx";

function PalettePicker({ bands, scope, setScope }: Props) {
  const [open, setOpen] = useState(false);
  const item = (id: string, label: string, context?: string) => (
    <CommandItem
      key={id}
      value={id}
      keywords={context ? [label, context] : [label]}
      onSelect={() => {
        setScope(id);
        setOpen(false);
      }}
    >
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {context && <span className="max-w-32 truncate text-xs text-muted-foreground">{context}</span>}
      {scope === id && (
        <>
          <Check aria-hidden />
          <span className="sr-only">Current scope</span>
        </>
      )}
    </CommandItem>
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="max-w-full min-w-0"
          aria-label={`Search graph scopes · ${scopeName(scope, bands)}`}
        >
          <Search aria-hidden />
          <span className="truncate">{scopeName(scope, bands)}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="gap-0 overflow-hidden p-0" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>Graph scope</DialogTitle>
          <DialogDescription>Search for a project or map group, or choose All projects.</DialogDescription>
        </DialogHeader>
        <Command>
          <CommandInput placeholder="Search projects and maps…" aria-label="Search projects and maps" />
          <CommandList className="max-h-[min(360px,50dvh)]">
            <CommandEmpty>No matching scopes</CommandEmpty>
            <CommandGroup>{item("all", "All projects")}</CommandGroup>
            <CommandGroup heading="Projects">
              {bands.map((band) => item(`project:${band.id}`, band.label, band.repo ?? undefined))}
            </CommandGroup>
            <CommandGroup heading="Map groups">
              {bands.flatMap((band) => band.maps.map((head) => item(`map:${head.id}`, head.map!.name, band.label)))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function BreadcrumbPicker({ bands, scope, setScope }: Props) {
  const project = bands.find(
    (band) => scope === `project:${band.id}` || band.maps.some((head) => scope === `map:${head.id}`),
  );
  const mapBands = project ? [project] : bands;
  const hasMaps = mapBands.some((band) => band.maps.length > 0);

  return (
    <nav aria-label="Graph scope" className="flex min-w-0 flex-wrap items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        aria-current={scope === "all" ? "true" : undefined}
        className={cn(scope === "all" && "bg-muted")}
        onClick={() => setScope("all")}
      >
        All projects
      </Button>
      <ChevronRight className="size-3 shrink-0 text-muted-foreground" aria-hidden />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="max-w-40" aria-label="Choose project scope">
            <span className="truncate">{project?.label ?? "Projects"}</span>
            <ChevronDown aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Project scope</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={scope} onValueChange={setScope}>
            {bands.map((band) => (
              <DropdownMenuRadioItem key={band.id} value={`project:${band.id}`}>
                {band.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {hasMaps && (
        <>
          <ChevronRight className="size-3 shrink-0 text-muted-foreground" aria-hidden />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="max-w-40" aria-label="Choose map scope">
                <span className="truncate">{scope.startsWith("map:") ? scopeName(scope, bands) : "Maps"}</span>
                <ChevronDown aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuRadioGroup value={scope} onValueChange={setScope}>
                {mapBands
                  .filter((band) => band.maps.length > 0)
                  .map((band) => (
                    <DropdownMenuGroup key={band.id}>
                      <DropdownMenuLabel>{band.label}</DropdownMenuLabel>
                      {band.maps.map((head) => (
                        <DropdownMenuRadioItem key={head.id} value={`map:${head.id}`}>
                          {head.map!.name}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuGroup>
                  ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </nav>
  );
}

function GraphHeader({
  picker,
  description,
  busy,
  refresh,
}: {
  picker: ReactNode;
  description: string;
  busy?: boolean;
  refresh?: () => void;
}) {
  return (
    <DialogHeader className="pr-8 text-left">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <DialogTitle className="flex shrink-0 items-center gap-2 text-base">
          <GitBranch className="size-4" aria-hidden /> PR graph
        </DialogTitle>
        {picker}
        <div className="ml-auto">
          <RefreshButton busy={busy} onClick={refresh} />
        </div>
      </div>
      <DialogDescription>{description}</DialogDescription>
    </DialogHeader>
  );
}

function ProjectGraph({ band, preview = false }: { band: Band; preview?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-2" aria-label={`${band.label} graph`}>
      <BandLabel b={band} className="flex-wrap" />
      <div ref={box} onPointerDown={pan} className={cn(FRAME, "flex-1")}>
        <BandCanvas b={band} />
      </div>
      <Lists graph={band.graph} box={box} noPr={!preview} />
    </section>
  );
}

function ScopedGraph({ bands, scope, picker }: Pick<Props, "bands" | "scope"> & { picker: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const map = bands.flatMap((band) => band.maps).find((head) => scope === `map:${head.id}`);
  if (map) {
    return (
      <MapBody key={map.id} head={map}>
        {(graph, busy, refresh) => (
          <>
            <GraphHeader
              picker={picker}
              description={`${scopeName(scope, bands)} · ${graph.nodes.length} PRs · ${openCount(graph)} open`}
              busy={busy}
              refresh={refresh}
            />
            <Legend />
            <div ref={box} onPointerDown={pan} className={FRAME}>
              <Canvas graph={graph} />
            </div>
            <Lists graph={graph} box={box} />
          </>
        )}
      </MapBody>
    );
  }

  const band = bands.find((candidate) => scope === `project:${candidate.id}`);
  return (
    <>
      <GraphHeader picker={picker} description={scopeName(scope, bands)} />
      <Legend />
      {band ? <ProjectGraph key={band.id} band={band} /> : <p className="text-sm">Scope unavailable</p>}
    </>
  );
}

function MosaicBand({ band }: { band: Band }) {
  const box = useRef<HTMLDivElement>(null);
  return (
    <section className="flex min-w-0 flex-col gap-2 rounded-md border bg-card p-3" aria-label={`${band.label} graph`}>
      <BandLabel b={band} className="flex-wrap" />
      <div ref={box} onPointerDown={pan} className={cn(FRAME, "h-44 lg:h-52")}>
        <BandCanvas b={band} />
      </div>
      {band.graph.anomalies.length > 0 && <Lists graph={band.graph} box={box} noPr={false} />}
    </section>
  );
}

function Mosaic(props: Props) {
  const { bands, scope } = props;
  const picker = <PalettePicker {...props} />;
  if (scope !== "all") return <ScopedGraph bands={bands} scope={scope} picker={picker} />;

  const graph = merge(bands);
  return (
    <>
      <GraphHeader
        picker={picker}
        description={`${bands.length} projects · ${graph.nodes.length} PRs · ${openCount(graph)} open`}
      />
      <Legend />
      <div className="min-h-0 overflow-y-auto">
        {bands.length ? (
          <div className="grid items-start gap-3 md:grid-cols-2">
            {bands.map((band) => (
              <MosaicBand key={band.id} band={band} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No projects</p>
        )}
      </div>
      <details className="rounded-md border px-3 py-2 text-xs">
        <summary className="cursor-pointer font-medium">Threads with no PR ({graph.noPr.length})</summary>
        <div className="mt-2 grid max-h-[25dvh] gap-4 overflow-auto md:grid-cols-2">
          {graph.noPr.length ? (
            bands
              .filter((band) => band.graph.noPr.length > 0)
              .map((band) => (
                <section key={band.id} className="min-w-0">
                  <h3 className="mb-1 font-medium text-muted-foreground">
                    {band.label} ({band.graph.noPr.length})
                  </h3>
                  <ul className="space-y-1">
                    {band.graph.noPr.map((thread) => (
                      <li key={thread.id} className="flex min-w-0 items-center gap-1.5">
                        <StatusMark thread={thread} />
                        <a href={thread.href} className="truncate hover:underline">
                          {thread.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
          ) : (
            <p className="text-muted-foreground">None</p>
          )}
        </div>
      </details>
    </>
  );
}

function Ledger(props: Props) {
  const { bands, scope, setScope } = props;
  const [previewId, setPreviewId] = useState<string>();
  const picker = <BreadcrumbPicker {...props} />;
  if (scope !== "all") return <ScopedGraph bands={bands} scope={scope} picker={picker} />;

  const graph = merge(bands);
  const preview =
    bands.find((band) => band.id === previewId) ?? bands.find((band) => band.graph.nodes.length > 0) ?? bands[0];
  return (
    <>
      <GraphHeader
        picker={picker}
        description={`${bands.length} projects · ${graph.nodes.length} PRs · ${openCount(graph)} open`}
      />
      <Legend />
      <div className="flex min-h-0 flex-col gap-3">
        <div className="max-h-[30%] shrink-0 overflow-auto rounded-md border">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Select a project to preview its graph</caption>
            <thead className="sticky top-0 bg-muted text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Project
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  Root branch
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  PRs
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Open
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Anomalies
                </th>
              </tr>
            </thead>
            <tbody>
              {bands.map((band) => (
                <tr key={band.id} className={cn("border-t", preview?.id === band.id && "bg-accent")}>
                  <th scope="row" className="font-medium">
                    <button
                      type="button"
                      aria-pressed={preview?.id === band.id}
                      className="flex w-full items-center gap-1.5 px-3 py-2 text-left hover:underline focus-visible:outline-ring"
                      onClick={() => setPreviewId(band.id)}
                    >
                      {band.label}
                      {preview?.id === band.id && <Check className="size-3 shrink-0" aria-hidden />}
                    </button>
                  </th>
                  <td className="px-3 py-2">
                    <span className="inline-flex rounded-full border bg-background px-2 py-0.5 font-mono">
                      {band.root}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{band.graph.nodes.length}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{openCount(band.graph)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{band.graph.anomalies.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {preview ? (
          <>
            <div className="flex items-center justify-between gap-2">
              <h2 className="min-w-0 truncate text-sm font-semibold">{preview.label} preview</h2>
              <Button variant="outline" size="sm" onClick={() => setScope(`project:${preview.id}`)}>
                Open project <ChevronRight aria-hidden />
              </Button>
            </div>
            <ProjectGraph key={preview.id} band={preview} preview />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No projects</p>
        )}
      </div>
    </>
  );
}

export const SOL_VARIANTS: [key: string, name: string, View: (p: Props) => ReactNode][] = [
  ["D", "Search + project mosaic", Mosaic],
  ["E", "Breadcrumb + project ledger", Ledger],
];
