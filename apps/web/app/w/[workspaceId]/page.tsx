import Workspace from "@/components/Workspace";

export default function WorkspacePage({ params }: { params: { workspaceId: string } }) {
  return <Workspace workspaceId={params.workspaceId} />;
}
