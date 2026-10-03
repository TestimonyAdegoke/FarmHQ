import { Banknote, BarChart3, BellRing, Bird, Boxes, ClipboardCheck, CloudRain, CloudSun, Cog, DollarSign, FileCheck2, FileSpreadsheet, Fish, Grid3X3, HardHat, Landmark, LayoutDashboard, Leaf, MapPinned, PackageOpen, PackageSearch, QrCode, RadioTower, ReceiptText, ShoppingBag, ShoppingCart, Smartphone, Sprout, Tractor, TrendingUp, Users, Warehouse, Zap, type LucideIcon } from "lucide-react";

const icons: Record<string, LucideIcon> = { Banknote, BarChart3, BellRing, Bird, Boxes, ClipboardCheck, CloudRain, CloudSun, Cog, DollarSign, FileCheck2, FileSpreadsheet, Fish, Grid3X3, HardHat, Landmark, LayoutDashboard, Leaf, MapPinned, PackageOpen, PackageSearch, QrCode, RadioTower, ReceiptText, ShoppingBag, ShoppingCart, Smartphone, Sprout, Tractor, TrendingUp, Users, Warehouse, Zap };

export function NavIcon({ name, size = 17 }: { name: string; size?: number }) {
  const Icon = icons[name] || Boxes;
  return <Icon size={size} aria-hidden />;
}
