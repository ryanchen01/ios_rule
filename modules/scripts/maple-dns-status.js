const rawArgument =
  typeof $argument === "undefined"
    ? "<undefined>"
    : JSON.stringify($argument);

const userId =
  typeof $argument === "string"
    ? $argument.trim()
    : "";

if (!userId || !/^[a-zA-Z0-9-]+$/.test(userId)) {
  $done({
    title: "Maple DNS",
    content: [
      "Invalid or missing User ID",
      `Raw $argument: ${rawArgument}`,
      `Type: ${typeof $argument}`,
    ].join("\n"),
    style: "error",
  });
} else {
  const url = `https://${userId}.host.apad.pro/dns-status`;

  $httpClient.get(url, (error, response, body) => {
    if (error) {
      $done({
        title: "Maple DNS",
        content: [
          `User ID: ${userId}`,
          `URL: ${url}`,
          "",
          `Request failed: ${error}`,
        ].join("\n"),
        style: "error",
      });
      return;
    }

    if (response.status !== 200) {
      $done({
        title: "Maple DNS",
        content: [
          `User ID: ${userId}`,
          `URL: ${url}`,
          "",
          `HTTP ${response.status}`,
        ].join("\n"),
        style: "error",
      });
      return;
    }

    try {
      const data = JSON.parse(body);

      const used = Number(data.daily_used);
      const remaining = Number(data.daily_remaining);
      const limit = Number(data.daily_limit);

      if (
        !Number.isFinite(used) ||
        !Number.isFinite(remaining) ||
        !Number.isFinite(limit) ||
        limit <= 0
      ) {
        throw new Error("Invalid usage data");
      }

      const usedPercent = (used / limit) * 100;
      const remainingPercent = (remaining / limit) * 100;

      let style = "good";

      if (remainingPercent <= 5) {
        style = "error";
      } else if (remainingPercent <= 20) {
        style = "alert";
      } else if (remainingPercent <= 50) {
        style = "info";
      }

      $done({
        title: "Maple DNS",
        content: [
          `User ID: ${userId}`,
          `Used: ${formatNumber(used)} / ${formatNumber(limit)} (${usedPercent.toFixed(2)}%)`,
          `Remaining: ${formatNumber(remaining)} (${remainingPercent.toFixed(2)}%)`,
          `Client IP: ${data.client_ip ?? "Unknown"}`,
          `Server: ${data.server_name ?? "Unknown"}`,
        ].join("\n"),
        style,
      });
    } catch (e) {
      $done({
        title: "Maple DNS",
        content: [
          `User ID: ${userId}`,
          `URL: ${url}`,
          "",
          `Unable to parse response: ${e.message}`,
        ].join("\n"),
        style: "error",
      });
    }
  });
}

function formatNumber(value) {
  return value.toLocaleString("en-US");
}