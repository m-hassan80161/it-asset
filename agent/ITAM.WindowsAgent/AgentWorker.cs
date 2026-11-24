using System.Diagnostics;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace ITAM.WindowsAgent;

public sealed class AgentWorker(
    IHttpClientFactory httpClientFactory,
    AgentConfiguration configuration,
    DeviceInventoryCollector inventoryCollector,
    ILogger<AgentWorker> logger) : BackgroundService
{
    private static readonly TimeSpan HeartbeatInterval = TimeSpan.FromMinutes(1);
    private static readonly TimeSpan UpdateCheckInterval = TimeSpan.FromMinutes(10);
    private static readonly TimeSpan InventoryInterval = TimeSpan.FromHours(6);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private string? _secret;
    private DateTime _nextUpdateCheck = DateTime.MinValue;
    private DateTime _nextInventoryAt = DateTime.MinValue;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        configuration.RemoveLegacyEnrollmentToken();
        logger.LogInformation("ITAM Windows Agent service started.");
        using var timer = new PeriodicTimer(HeartbeatInterval);
        do
        {
            try
            {
                await SendHeartbeatAsync(stoppingToken);
                if (DateTime.UtcNow >= _nextUpdateCheck)
                {
                    _nextUpdateCheck = DateTime.UtcNow + UpdateCheckInterval;
                    await CheckForUpdateAsync(stoppingToken);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception exception)
            {
                logger.LogWarning(exception, "Agent cycle failed; the agent will retry.");
            }
        } while (await timer.WaitForNextTickAsync(stoppingToken));
        logger.LogInformation("ITAM Windows Agent service stopped.");
    }

    private async Task SendHeartbeatAsync(CancellationToken cancellationToken)
    {
        _secret ??= configuration.ReadSecret();
        if (string.IsNullOrEmpty(_secret))
        {
            await EnrollAsync(cancellationToken);
            return;
        }

        var identity = inventoryCollector.CollectIdentity(AgentVersion);
        object? snapshot = null;
        if (DateTime.UtcNow >= _nextInventoryAt)
        {
            snapshot = inventoryCollector.CollectInventory(AgentVersion).Snapshot;
        }
        using var client = CreateClient(_secret);
        using var response = await client.PostAsJsonAsync(
            Endpoint("heartbeat"),
            new
            {
                computerName = identity.ComputerName,
                loggedInUser = identity.LoggedInUser,
                domain = identity.Domain,
                osName = identity.OsName,
                osVersion = identity.OsVersion,
                agentVersion = identity.AgentVersion,
                macAddresses = identity.MacAddresses,
                snapshot,
            },
            JsonOptions,
            cancellationToken);
        if (response.StatusCode == System.Net.HttpStatusCode.Unauthorized)
        {
            logger.LogInformation("The configured server does not recognize this Agent credential; enrolling this installation.");
            configuration.DeleteSecret();
            _secret = null;
            await EnrollAsync(cancellationToken);
            return;
        }
        response.EnsureSuccessStatusCode();
        if (snapshot is not null) _nextInventoryAt = DateTime.UtcNow + InventoryInterval;
        logger.LogDebug("Inventory heartbeat sent for {ComputerName}.", identity.ComputerName);
    }

    private async Task EnrollAsync(CancellationToken cancellationToken)
    {
        var inventory = inventoryCollector.CollectInventory(AgentVersion);
        var identity = inventory.Identity;
        using var client = httpClientFactory.CreateClient("itam-agent");
        using var response = await client.PostAsJsonAsync(
            Endpoint("enroll"),
            new
            {
                installId = configuration.InstallId,
                computerName = identity.ComputerName,
                loggedInUser = identity.LoggedInUser,
                domain = identity.Domain,
                osName = identity.OsName,
                osVersion = identity.OsVersion,
                agentVersion = identity.AgentVersion,
                macAddresses = identity.MacAddresses,
                snapshot = inventory.Snapshot,
            },
            JsonOptions,
            cancellationToken);
        response.EnsureSuccessStatusCode();
        var enrollment = await response.Content.ReadFromJsonAsync<EnrollmentResponse>(JsonOptions, cancellationToken)
            ?? throw new InvalidOperationException("Enrollment response was empty.");
        configuration.SaveSecret(enrollment.Secret);
        _secret = enrollment.Secret;
        _nextInventoryAt = DateTime.UtcNow + InventoryInterval;
        logger.LogInformation("Agent enrollment completed for {ComputerName}.", identity.ComputerName);
    }

    private async Task CheckForUpdateAsync(CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(_secret)) return;
        using var client = CreateClient(_secret);
        using var response = await client.GetAsync(Endpoint("releases/latest"), cancellationToken);
        response.EnsureSuccessStatusCode();
        var release = await response.Content.ReadFromJsonAsync<ReleaseResponse>(JsonOptions, cancellationToken);
        if (release?.Version is null || !IsNewerVersion(release.Version, AgentVersion)) return;

        using var packageResponse = await client.GetAsync(
            Endpoint($"releases/{Uri.EscapeDataString(release.Version)}/package"),
            HttpCompletionOption.ResponseHeadersRead,
            cancellationToken);
        packageResponse.EnsureSuccessStatusCode();
        var expectedHash = packageResponse.Headers.GetValues("X-Agent-SHA256").Single();
        var signature = Convert.FromBase64String(packageResponse.Headers.GetValues("X-Agent-Signature").Single());
        var packageBytes = await packageResponse.Content.ReadAsByteArrayAsync(cancellationToken);
        var actualHash = Convert.ToHexString(SHA256.HashData(packageBytes)).ToLowerInvariant();
        if (!CryptographicOperations.FixedTimeEquals(
                Convert.FromHexString(expectedHash),
                Convert.FromHexString(actualHash)))
        {
            throw new CryptographicException("Downloaded MSI SHA-256 does not match the published release.");
        }

        using var rsa = RSA.Create();
        rsa.ImportFromPem(configuration.GetReleasePublicKey());
        if (!rsa.VerifyData(packageBytes, signature, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1))
        {
            throw new CryptographicException("Downloaded MSI failed RSA signature verification.");
        }

        var directory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            @"ITAM\WindowsAgent\updates");
        Directory.CreateDirectory(directory);
        var packagePath = Path.Combine(directory, $"ITAM-WindowsAgent-{release.Version}.msi");
        await File.WriteAllBytesAsync(packagePath, packageBytes, cancellationToken);

        var installer = new ProcessStartInfo
        {
            FileName = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "msiexec.exe"),
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        installer.ArgumentList.Add("/i");
        installer.ArgumentList.Add(packagePath);
        installer.ArgumentList.Add("/qn");
        installer.ArgumentList.Add("/norestart");
        installer.ArgumentList.Add("/l*v");
        installer.ArgumentList.Add(Path.Combine(directory, $"install-{release.Version}.log"));

        if (Process.Start(installer) is null)
        {
            throw new InvalidOperationException("Windows Installer could not be started.");
        }
        logger.LogInformation("Verified update {Version}; Windows Installer was started.", release.Version);
        Environment.Exit(0);
    }

    private HttpClient CreateClient(string secret)
    {
        var client = httpClientFactory.CreateClient("itam-agent");
        client.Timeout = TimeSpan.FromSeconds(30);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer", secret);
        return client;
    }

    private Uri Endpoint(string path) =>
        new(configuration.ServerBaseUri, $"api/v1/windows-agent/{path}");

    private static bool IsNewerVersion(string candidate, string current)
    {
        var candidateCore = candidate.Split('-', 2)[0];
        var currentCore = current.Split('-', 2)[0];
        return Version.TryParse(candidateCore, out var candidateVersion) &&
            Version.TryParse(currentCore, out var currentVersion) &&
            candidateVersion > currentVersion;
    }

    private static string AgentVersion =>
        typeof(AgentWorker).Assembly.GetName().Version?.ToString(3) ?? "1.0.0";

    private sealed record EnrollmentResponse(string AgentId, string Secret);
    private sealed record ReleaseResponse(string? Version);
}
