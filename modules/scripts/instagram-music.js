const rawArgument =
  typeof $argument === "undefined"
    ? ""
    : String($argument).trim();

const post = parseInstagramPost(rawArgument);

// Must be declared outside the block so checkNext() can access it.
let requests = [];

if (!post) {
  finish({
    content: [
      "Invalid or missing Instagram post URL",
      "",
      "Supported formats:",
      "instagram.com/p/SHORTCODE/",
      "instagram.com/reel/SHORTCODE/",
      "instagram.com/tv/SHORTCODE/",
      "",
      `Received: ${rawArgument || "<empty>"}`,
    ].join("\n"),
    style: "error",
  });
} else {
  requests = [
    {
      name: "post data",
      url: `${post.canonicalUrl}?__a=1&__d=dis`,
    },
    {
      name: "post page",
      url: post.canonicalUrl,
    },
    {
      name: "embedded post",
      url: `https://www.instagram.com/${post.type}/${post.shortcode}/embed/captioned/`,
    },
  ];

  checkNext(0, []);
}

function checkNext(index, attempts) {
  if (index >= requests.length) {
    finish({
      content: [
        `Result: Unable to determine`,
        `Post: ${post.shortcode}`,
        "",
        "Instagram did not expose should_mute_audio.",
        "The post may be unavailable, private, age-restricted,",
        "missing licensed music, or require authentication.",
        "",
        `Attempts: ${attempts.join(", ") || "None"}`,
      ].join("\n"),
      style: "error",
    });
    return;
  }

  const request = requests[index];

  $httpClient.get(
    {
      url: request.url,
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
        Referer: post.canonicalUrl,
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) " +
          "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 " +
          "Mobile/15E148 Safari/604.1",
        "X-IG-App-ID": "936619743392459",
        "X-Requested-With": "XMLHttpRequest",
      },
    },
    (error, response, body) => {
      if (error) {
        attempts.push(`${request.name}: request failed`);
        checkNext(index + 1, attempts);
        return;
      }

      const status = Number(response && response.status);

      if (status !== 200) {
        attempts.push(`${request.name}: HTTP ${status || "unknown"}`);
        checkNext(index + 1, attempts);
        return;
      }

      const text = typeof body === "string" ? body : "";

      if (isUnavailablePage(text)) {
        finish({
          content: [
            "Result: Post unavailable",
            `Post: ${post.shortcode}`,
            "",
            "The post may have been deleted, made private,",
            "or restricted by Instagram.",
          ].join("\n"),
          style: "error",
        });
        return;
      }

      const shouldMuteAudio = extractShouldMuteAudio(text);

      if (shouldMuteAudio === false) {
        finish({
          content: [
            "Result: Licensed audio available",
            `Post: ${post.shortcode}`,
            "should_mute_audio: false",
            "",
            post.canonicalUrl,
          ].join("\n"),
          style: "good",
        });
        return;
      }

      if (shouldMuteAudio === true) {
        finish({
          content: [
            "Result: Licensed audio restricted",
            `Post: ${post.shortcode}`,
            "should_mute_audio: true",
            "",
            post.canonicalUrl,
          ].join("\n"),
          style: "error",
        });
        return;
      }

      attempts.push(`${request.name}: field missing`);
      checkNext(index + 1, attempts);
    }
  );
}

function parseInstagramPost(input) {
  if (!input) {
    return null;
  }

  let value = input.trim();

  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");

    if (
      hostname !== "instagram.com" &&
      hostname !== "m.instagram.com"
    ) {
      return null;
    }

    const match = url.pathname.match(
      /^\/(p|reel|tv)\/([A-Za-z0-9_-]+)(?:\/|$)/
    );

    if (!match) {
      return null;
    }

    const type = match[1];
    const shortcode = match[2];

    return {
      type,
      shortcode,
      canonicalUrl: `https://www.instagram.com/${type}/${shortcode}/`,
    };
  } catch (_) {
    return null;
  }
}

function extractShouldMuteAudio(body) {
  const variants = [
    body,
    decodeEmbeddedText(body),
  ];

  for (const text of variants) {
    const match = text.match(
      /["']should_mute_audio["']\s*:\s*(true|false)/i
    );

    if (match) {
      return match[1].toLowerCase() === "true";
    }
  }

  return null;
}

function decodeEmbeddedText(text) {
  return text
    .replace(/&quot;/gi, '"')
    .replace(/&#34;/gi, '"')
    .replace(/\\u0022/gi, '"')
    .replace(/\\u0026/gi, "&")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function isUnavailablePage(body) {
  const text = body.toLowerCase();

  return (
    text.includes("sorry, this page isn't available") ||
    text.includes("page not found") ||
    text.includes("the link you followed may be broken") ||
    text.includes('"message":"media not found"') ||
    text.includes('"status":"fail"') &&
      text.includes("media")
  );
}

function finish(result) {
  $done({
    title: "Instagram Music",
    content: result.content,
    style: result.style,
  });
}