#!/usr/bin/env node
/* global __dirname */
const fs = require("node:fs");
const path = require("node:path");
const dns = require("node:dns").promises;
const net = require("node:net");
function metadata(version, tag) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(
    version || "",
  );
  if (!match) throw Error("Version must be canonical major.minor.patch.");
  const [major, minor, patch] = match.slice(1).map(Number);
  if (minor >= 1000 || patch >= 1000 || major > 2099)
    throw Error("Version exceeds the supported Android versionCode range.");
  const versionCode = major * 1000000 + minor * 1000 + patch;
  if (versionCode < 1 || versionCode > 2100000000)
    throw Error("Android versionCode is invalid.");
  if (tag && tag !== `mobile-v${version}`)
    throw Error("Release tag must match mobile/package.json version exactly.");
  return {
    version,
    versionCode,
    applicationId: "com.quantstrade.mobile",
    apk: `quants-trade-${version}.apk`,
  };
}
function backendOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw Error("ANDROID_PRODUCTION_API_URL must be configured.");
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.port && url.port !== "443") ||
    net.isIP(host.replace(/^\[|\]$/g, "")) ||
    !host.includes(".") ||
    /(^|\.)(localhost|local|internal|test|invalid|example|onion)$/.test(host) ||
    /(^|\.)(example\.(com|org|net))$/.test(host)
  )
    throw Error(
      "Release API must be a public HTTPS origin without credentials, paths, custom ports or local/example hosts.",
    );
  return url.origin;
}
function publicAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && [0, 168].includes(b)) ||
      (a === 198 && [18, 19, 51].includes(b)) ||
      (a === 203 && b === 0)
    );
  }
  // Release endpoints must use global unicast, excluding mapped/private/doc ranges.
  return (
    net.isIPv6(address) &&
    /^[23]/i.test(address) &&
    !/^2001:(db8|0:|2:|10:|20:)/i.test(address)
  );
}
async function probeBackend(
  value,
  { lookup = dns.lookup, fetcher = fetch } = {},
) {
  const origin = backendOrigin(value);
  const addresses = await lookup(new URL(origin).hostname, { all: true });
  if (
    !addresses.length ||
    addresses.some(({ address }) => !publicAddress(address))
  )
    throw Error("Backend DNS resolves to a private or reserved network.");
  const health = await fetcher(`${origin}/healthz`, {
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  const data = await health.json();
  if (
    !health.ok ||
    data.status !== "ok" ||
    data.database !== "available" ||
    data.liveDispatchGate !== false
  )
    throw Error(
      "Backend health/database or disabled live gate could not be verified.",
    );
  for (const endpoint of ["/api/auth/me", "/api/paper-portfolio"]) {
    const response = await fetcher(`${origin}${endpoint}`, {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (response.status !== 401 && response.status !== 403)
      throw Error("Backend must deny unauthenticated financial API access.");
  }
  return true;
}
function unsignedRelease(source) {
  const release =
    /(^\s*release\s*\{[\s\S]*?)(signingConfig signingConfigs\.debug)/m;
  if (!release.test(source))
    throw Error(
      "Generated release signing template changed; inspect before building.",
    );
  return source.replace(release, "$1signingConfig null");
}
function pinnedWrapper(source) {
  if (
    !source.includes("gradle-9.4.1-bin.zip") ||
    !source.includes("https\\://services.gradle.org/distributions/")
  )
    throw Error(
      "Generated Gradle wrapper changed; review and pin its official checksum.",
    );
  return (
    source.replace(/^distributionSha256Sum=.*\n?/gm, "").trimEnd() +
    "\ndistributionSha256Sum=2ab2958f2a1e51120c326cad6f385153bb11ee93b3c216c5fccebfdfbb7ec6cb\n"
  );
}
function signingFingerprint(value) {
  const normalized = String(value || "")
    .replaceAll(":", "")
    .toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized))
    throw Error(
      "ANDROID_SIGNING_CERT_SHA256 must be a SHA-256 certificate fingerprint.",
    );
  return normalized;
}
function inspectBadging(output, expected) {
  const pkg =
    /^package: name='([^']+)' versionCode='([^']+)' versionName='([^']+)'/m.exec(
      output,
    );
  if (
    !pkg ||
    pkg[1] !== expected.applicationId ||
    pkg[2] !== String(expected.versionCode) ||
    pkg[3] !== expected.version ||
    /^application-debuggable/m.test(output)
  )
    throw Error("APK identity, version or non-debuggable validation failed.");
}
function inspectCertificate(output, expected) {
  const signers = [
    ...output.matchAll(
      /^Signer #(\d+) certificate SHA-256 digest: ([a-fA-F0-9:]+)$/gm,
    ),
  ];
  if (
    signers.length !== 1 ||
    signingFingerprint(signers[0][2]) !== signingFingerprint(expected)
  )
    throw Error("APK is not signed with the expected persistent certificate.");
  if (/Android Debug|androiddebugkey/i.test(output))
    throw Error("Debug-signed APK cannot be released.");
}
async function main() {
  const root = path.resolve(__dirname, "..");
  const config = metadata(
    JSON.parse(fs.readFileSync(path.join(root, "package.json"))).version,
    process.env.GITHUB_REF_TYPE === "tag"
      ? process.env.GITHUB_REF_NAME
      : undefined,
  );
  const command = process.argv[2];
  if (command === "metadata") {
    if (process.env.GITHUB_OUTPUT)
      fs.appendFileSync(
        process.env.GITHUB_OUTPUT,
        Object.entries(config)
          .map(([k, v]) => `${k}=${v}\n`)
          .join(""),
      );
    else console.log(JSON.stringify(config));
  } else if (command === "preflight") {
    if (process.env.ANDROID_PUBLIC_BACKEND_APPROVED !== "true")
      throw Error(
        "Approve the APK-visible backend origin using ANDROID_PUBLIC_BACKEND_APPROVED=true.",
      );
    for (const name of [
      "ANDROID_KEYSTORE_BASE64",
      "ANDROID_KEYSTORE_PASSWORD",
      "ANDROID_KEY_ALIAS",
      "ANDROID_KEY_PASSWORD",
      "ANDROID_SIGNING_CERT_SHA256",
    ])
      if (!process.env[name])
        throw Error(`Required signing secret missing: ${name}`);
    signingFingerprint(process.env.ANDROID_SIGNING_CERT_SHA256);
    await probeBackend(process.env.EXPO_PUBLIC_API_URL);
    console.log(
      "Signing inputs present; public backend auth and disabled live gate verified.",
    );
  } else if (command === "prepare") {
    const gradle = path.join(root, "android/app/build.gradle");
    const wrapper = path.join(
      root,
      "android/gradle/wrapper/gradle-wrapper.properties",
    );
    const prepared = unsignedRelease(fs.readFileSync(gradle, "utf8"));
    const pinned = pinnedWrapper(fs.readFileSync(wrapper, "utf8"));
    fs.writeFileSync(gradle, prepared);
    fs.writeFileSync(wrapper, pinned);
    console.log(
      "Generated release uses no default/debug signing; persistent signing follows assembly.",
    );
  } else if (command === "verify") {
    inspectBadging(fs.readFileSync(process.argv[3], "utf8"), config);
    inspectCertificate(
      fs.readFileSync(process.argv[4], "utf8"),
      process.env.ANDROID_SIGNING_CERT_SHA256,
    );
    console.log(
      "Release APK identity, version, non-debuggable flag and persistent signing certificate verified.",
    );
  } else if (command === "notes") {
    const template = fs.readFileSync(
      path.join(root, "RELEASE_NOTES.md"),
      "utf8",
    );
    fs.writeFileSync(
      process.argv[3],
      template
        .replaceAll("{{VERSION}}", config.version)
        .replaceAll("{{VERSION_CODE}}", String(config.versionCode))
        .replaceAll(
          "{{COMMIT}}",
          process.env.GITHUB_SHA || "local verification",
        ),
    );
  } else throw Error("Use metadata, preflight, prepare, verify or notes.");
}
module.exports = {
  metadata,
  backendOrigin,
  publicAddress,
  probeBackend,
  unsignedRelease,
  pinnedWrapper,
  signingFingerprint,
  inspectBadging,
  inspectCertificate,
};
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
