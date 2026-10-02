import { Sprout } from "lucide-react";
export function EmptyState({ title, text }: { title:string; text:string }) {
  return <div className="empty"><span className="icon-box"><Sprout size={22}/></span><strong>{title}</strong><span>{text}</span></div>;
}
