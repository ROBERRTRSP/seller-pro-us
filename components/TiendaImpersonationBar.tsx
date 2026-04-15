import { ExitImpersonationButton } from "@/components/ExitImpersonationButton";

type Props = {
  clientName: string;
  adminName: string;
};

export function TiendaImpersonationBar({ clientName, adminName }: Props) {
  return (
    <div
      className="no-print border-b border-amber-500/40 bg-amber-950/40 px-4 py-2 text-center text-sm text-amber-100"
      role="status"
    >
      <span className="font-medium">{clientName}</span>
      <span className="text-amber-200/80"> — vista administrador </span>
      <span className="text-amber-100/90">({adminName})</span>
      <span className="mx-2 text-amber-200/60">·</span>
      <ExitImpersonationButton />
    </div>
  );
}
