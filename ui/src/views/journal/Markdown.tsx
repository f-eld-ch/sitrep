import Markdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";

export function ReactPreview(props: { content: string }) {
  return (
    <div className="content">
      <Markdown rehypePlugins={[[rehypeSanitize]]}>{props.content}</Markdown>
    </div>
  );
}
