import MarkdownPreview from "@uiw/react-markdown-preview";
import MDEditor from "@uiw/react-md-editor";
import rehypeSanitize from "rehype-sanitize";
import { useEditorContext } from "./editorState";

export function ReactEditor({ id }: { id?: string }) {
  const { state, dispatch } = useEditorContext();
  return (
    <MDEditor
      value={state.content}
      onChange={(value) => {
        dispatch({ type: "set_content", content: value ?? "" });
      }}
      preview="edit"
      textareaProps={id ? { id } : undefined}
      previewOptions={{
        prefixCls: "content",
        rehypePlugins: [[rehypeSanitize]],
      }}
    />
  );
}

export function ReactPreview(props: { content: string }) {
  return (
    <MarkdownPreview source={props.content} prefixCls="content" rehypePlugins={[rehypeSanitize]} />
  );
}
