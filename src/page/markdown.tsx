import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

const components: Components = {
  a: ({ children }) => children,
  img: ({ alt }) => alt,
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="[&_td]:border [&_td]:px-1 [&_th]:border [&_th]:px-1">{children}</table>
    </div>
  ),
};

export function Markdown({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={cn(
        "min-w-0 space-y-1 text-xs wrap-anywhere",
        "[&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_h4]:font-semibold [&_h5]:font-semibold [&_h6]:font-semibold",
        "[&_ol]:list-decimal [&_ol]:ps-4 [&_ul]:list-disc [&_ul]:ps-4",
        "[&_blockquote]:border-s-2 [&_blockquote]:ps-2",
        "[&_code]:rounded [&_code]:bg-current/10 [&_code]:px-1",
        "[&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-current/10 [&_pre]:p-1 [&_pre]:whitespace-pre [&_pre_code]:bg-transparent [&_pre_code]:px-0",
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  );
}
