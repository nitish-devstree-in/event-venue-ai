import { NextRequest, NextResponse } from "next/server";

const API_ORIGIN = new URL(
  process.env.NEXT_PUBLIC_API_BASE_URL ??
    "https://event-planner.devstree.in/api/v1",
).origin;

function isAllowedImageUrl(target: URL): boolean {
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    return false;
  }

  if (target.origin === API_ORIGIN) {
    return true;
  }

  const host = target.hostname.toLowerCase();
  return (
    host.endsWith(".amazonaws.com") ||
    host.endsWith(".cloudfront.net") ||
    host.endsWith(".digitaloceanspaces.com")
  );
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url");
  if (!rawUrl) {
    return NextResponse.json({ detail: "Missing url" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return NextResponse.json({ detail: "Invalid url" }, { status: 400 });
  }

  if (!isAllowedImageUrl(target)) {
    return NextResponse.json({ detail: "URL not allowed" }, { status: 403 });
  }

  const upstream = await fetch(target.toString());
  if (!upstream.ok) {
    return NextResponse.json(
      { detail: "Upstream fetch failed" },
      { status: upstream.status },
    );
  }

  const buffer = await upstream.arrayBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type":
        upstream.headers.get("Content-Type") ?? "application/octet-stream",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
