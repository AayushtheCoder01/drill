import type { ReactNode } from "react";
import { useSheet } from "@/context/SheetContext";
import Icon from "./ui/Icon";

export default function SheetShell({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  const { close } = useSheet();
  return (
    <>
      <div className="sheet-head">
        <h3>{title}</h3>
        <span className="sub">{sub || ""}</span>
        <button className="iconbtn" onClick={close} aria-label="Close">
          <Icon name="close" />
        </button>
      </div>
      <div className="sheet-body">{children}</div>
    </>
  );
}
