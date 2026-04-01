export default async function handler() {
  try {
    const res = await fetch(
      "https://api.gdeltproject.org/api/v2/doc/doc?query=talent%20sourcelang:eng&mode=ArtList&maxrecords=3&format=json&sort=DateDesc&timespan=60min"
    );
    const text = await res.text();
    return new Response(text, { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
```

After it deploys, visit:
```
https://ticpulse.netlify.app/.netlify/functions/test-fetch
