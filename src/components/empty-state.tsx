import type { ReactNode } from "react";
import { Sprout } from "lucide-react";
export function EmptyState({ title, text, icon }: { title:string; text:string; icon?:ReactNode }) {
  return <div className="empty"><span className="icon-box" aria-hidden>{icon || <Sprout size={20}/>}</span><strong>{title}</strong><span>{text}</span></div>;
}
