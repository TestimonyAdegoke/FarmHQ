import qrcode from "qrcode-generator";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const lot = await db.traceLot.findUnique({ where: { publicToken: token }, select: { id: true } });
  if (!lot) return new Response("Not found", { status: 404 });

  const origin = new URL(request.url).origin;
  const qr = qrcode(0, "M");
  qr.addData(origin + "/trace/" + token);
  qr.make();
  const svg = qr.createSvgTag({ cellSize: 5, margin: 4, scalable: true });

  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=3600, s-maxage=86400",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
