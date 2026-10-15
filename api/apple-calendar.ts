const MAX_CALENDAR_BYTES = 5 * 1024 * 1024;

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const source = requestUrl.searchParams.get("url");

    if (!source) {
      return new Response("Missing calendar URL", { status: 400 });
    }

    const calendarUrl = new URL(source);
    const isAppleCalendar =
      calendarUrl.protocol === "https:" &&
      (calendarUrl.hostname === "icloud.com" ||
        calendarUrl.hostname.endsWith(".icloud.com"));

    if (!isAppleCalendar) {
      return new Response("Only public iCloud calendar URLs are supported", {
        status: 400,
      });
    }

    const calendarResponse = await fetch(calendarUrl, {
      headers: {
        Accept: "text/calendar, text/plain;q=0.9, */*;q=0.8",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!calendarResponse.ok) {
      return new Response("Apple Calendar request failed", {
        status: calendarResponse.status,
      });
    }

    const contentLength = Number(
      calendarResponse.headers.get("content-length") ?? 0,
    );

    if (contentLength > MAX_CALENDAR_BYTES) {
      return new Response("Calendar feed is too large", { status: 413 });
    }

    const calendarData = await calendarResponse.text();

    if (new TextEncoder().encode(calendarData).byteLength > MAX_CALENDAR_BYTES) {
      return new Response("Calendar feed is too large", { status: 413 });
    }

    if (!calendarData.includes("BEGIN:VCALENDAR")) {
      return new Response("The shared URL did not return an iCalendar feed", {
        status: 502,
      });
    }

    return new Response(calendarData, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=86400",
      },
    });
  } catch {
    return new Response("Apple Calendar request failed", { status: 502 });
  }
}
