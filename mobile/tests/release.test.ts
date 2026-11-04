import {
  metadata,
  backendOrigin,
  publicAddress,
  probeBackend,
  unsignedRelease,
  pinnedWrapper,
  inspectBadging,
  inspectCertificate,
} from "../scripts/android-release.cjs";

describe("Android release safety and reproducibility", () => {
  it("binds tags to package version and produces monotonic Android codes", () => {
    expect(metadata("1.0.0", "mobile-v1.0.0").versionCode).toBe(1000000);
    expect(metadata("1.0.1").versionCode).toBe(1000001);
    for (const version of [
      "01.0.0",
      "1.0",
      "1.0.0-beta",
      "0.0.0",
      "1.1000.0",
      "2100.0.0",
    ])
      expect(() => metadata(version)).toThrow();
    expect(() => metadata("1.0.0", "mobile-v2.0.0")).toThrow(/match/);
  });
  it("rejects local, credential-bearing, internal, example and malformed release origins", () => {
    for (const url of [
      undefined,
      "http://api.mytrade.com",
      "https://localhost",
      "https://192.168.1.1",
      "https://[::1]",
      "https://app.internal",
      "https://api.example.com",
      "https://user:pw@api.mytrade.com",
      "https://api.mytrade.com/api",
      "https://api.mytrade.com?token=private",
      "https://api.mytrade.com:8443",
    ])
      expect(() => backendOrigin(url)).toThrow();
    expect(backendOrigin("https://api.mytrade.com/")).toBe(
      "https://api.mytrade.com",
    );
  });
  it("rejects public hostnames resolving to internal addresses and unprotected APIs", async () => {
    const lookup = async () => [{ address: "127.0.0.1" }];
    const fetcher = jest.fn();
    await expect(
      probeBackend("https://api.mytrade.com", { lookup, fetcher }),
    ).rejects.toThrow(/private/);
    expect(fetcher).not.toHaveBeenCalled();
    const publicLookup = async () => [{ address: "8.8.8.8" }];
    const disabled = () => ({
      ok: true,
      json: async () => ({
        status: "ok",
        database: "available",
        liveDispatchGate: false,
      }),
    });
    await expect(
      probeBackend("https://api.mytrade.com", {
        lookup: publicLookup,
        fetcher: async () => disabled(),
      }),
    ).rejects.toThrow(/deny/);
    const live = async () => ({
      ok: true,
      json: async () => ({
        status: "ok",
        database: "available",
        liveDispatchGate: true,
      }),
    });
    await expect(
      probeBackend("https://api.mytrade.com", {
        lookup: publicLookup,
        fetcher: live,
      }),
    ).rejects.toThrow(/disabled live/);
    const safe = async (url: string) =>
      url.endsWith("/healthz") ? disabled() : { status: 401 };
    await expect(
      probeBackend("https://api.mytrade.com", {
        lookup: publicLookup,
        fetcher: safe,
      }),
    ).resolves.toBe(true);
  });
  it("classifies private and reserved network destinations", () => {
    for (const ip of [
      "10.1.2.3",
      "100.64.0.1",
      "169.254.1.1",
      "172.16.0.1",
      "192.168.1.1",
      "224.1.1.1",
      "::1",
      "fc00::1",
      "fe80::1",
      "2001:db8::1",
      "::ffff:127.0.0.1",
    ])
      expect(publicAddress(ip)).toBe(false);
    expect(publicAddress("8.8.8.8")).toBe(true);
    expect(publicAddress("2606:4700:4700::1111")).toBe(true);
  });
  it("removes only release debug signing and fails closed when Expo changes its template", () => {
    const source =
      "buildTypes {\n debug { signingConfig signingConfigs.debug }\n release {\n signingConfig signingConfigs.debug\n }\n}";
    const prepared = unsignedRelease(source);
    expect(prepared).toContain("debug { signingConfig signingConfigs.debug }");
    expect(prepared).toContain("release {\n signingConfig null");
    expect(() =>
      unsignedRelease("release { signingConfig signingConfigs.unknown }"),
    ).toThrow();
  });
  it("validates application identity, version, debuggability and the persistent certificate", () => {
    const expected = metadata("1.0.0");
    const badging =
      "package: name='com.quantstrade.mobile' versionCode='1000000' versionName='1.0.0'";
    expect(() => inspectBadging(badging, expected)).not.toThrow();
    expect(() =>
      inspectBadging(badging + "\napplication-debuggable", expected),
    ).toThrow();
    expect(() =>
      inspectBadging(
        badging.replace("com.quantstrade.mobile", "com.evil"),
        expected,
      ),
    ).toThrow();
    const digest = "a".repeat(64);
    const cert = `Signer #1 certificate SHA-256 digest: ${digest}`;
    expect(() => inspectCertificate(cert, digest)).not.toThrow();
    expect(() => inspectCertificate(cert, "b".repeat(64))).toThrow();
    expect(() =>
      inspectCertificate(
        cert + "\nSigner #1 certificate DN: CN=Android Debug",
        digest,
      ),
    ).toThrow();
    expect(() =>
      inspectCertificate(
        cert + "\nSigner #2 certificate SHA-256 digest: " + digest,
        digest,
      ),
    ).toThrow();
  });
});

it("pins the generated Gradle distribution and refuses an unreviewed wrapper upgrade", () => {
  const properties =
    "distributionUrl=https\\://services.gradle.org/distributions/gradle-9.4.1-bin.zip\n";
  expect(pinnedWrapper(properties)).toContain("distributionSha256Sum=2ab2958f");
  expect(() => pinnedWrapper(properties.replace("9.4.1", "10.0.0"))).toThrow(
    /wrapper changed/,
  );
});
