using System.Security.Cryptography;
using System.Text;
using Microsoft.Win32;

namespace ITAM.WindowsAgent;

public sealed class AgentConfiguration
{
    private const string RegistryPath = @"SOFTWARE\ITAM\WindowsAgent";
    private const string DataDirectory = @"ITAM\WindowsAgent";
    private static readonly byte[] Entropy = Encoding.UTF8.GetBytes("ITAM.WindowsAgent.v1");

    public string InstallId => ReadOrCreateInstallId();

    public Uri ServerBaseUri
    {
        get
        {
            using var key = Registry.LocalMachine.OpenSubKey(RegistryPath);
            var value = key?.GetValue("ServerUrl") as string;
            if (!Uri.TryCreate(value, UriKind.Absolute, out var uri) ||
                (uri.Scheme != Uri.UriSchemeHttps &&
                 !(uri.Scheme == Uri.UriSchemeHttp && uri.IsLoopback)) ||
                !string.IsNullOrEmpty(uri.Query) ||
                !string.IsNullOrEmpty(uri.Fragment))
            {
                throw new InvalidOperationException("The agent server URL must use HTTPS.");
            }
            return new Uri(uri, uri.AbsoluteUri.EndsWith('/') ? uri.AbsoluteUri : uri.AbsoluteUri + "/");
        }
    }

    public void RemoveLegacyEnrollmentToken()
    {
        using var key = Registry.LocalMachine.OpenSubKey(RegistryPath, writable: true);
        key?.DeleteValue("EnrollmentToken", throwOnMissingValue: false);
    }

    public string? ReadSecret()
    {
        var path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), DataDirectory, "credential.bin");
        if (!File.Exists(path)) return null;
        var encrypted = File.ReadAllBytes(path);
        return Encoding.UTF8.GetString(ProtectedData.Unprotect(encrypted, Entropy, DataProtectionScope.CurrentUser));
    }

    public void DeleteSecret()
    {
        var path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), DataDirectory, "credential.bin");
        if (File.Exists(path)) File.Delete(path);
    }

    public void SaveSecret(string secret)
    {
        var directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), DataDirectory);
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, "credential.bin");
        var encrypted = ProtectedData.Protect(Encoding.UTF8.GetBytes(secret), Entropy, DataProtectionScope.CurrentUser);
        File.WriteAllBytes(path, encrypted);
        File.SetAttributes(path, FileAttributes.Hidden);
        using var key = Registry.LocalMachine.OpenSubKey(RegistryPath, writable: true);
        key?.DeleteValue("EnrollmentToken", throwOnMissingValue: false);
    }

    public string GetReleasePublicKey()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "agent-update-public.pem");
        return File.ReadAllText(path);
    }

    private static string ReadOrCreateInstallId()
    {
        var directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), DataDirectory);
        Directory.CreateDirectory(directory);
        var path = Path.Combine(directory, "install-id");
        if (File.Exists(path))
        {
            var saved = File.ReadAllText(path).Trim();
            if (Guid.TryParse(saved, out _))
            {
                using var existingKey = Registry.LocalMachine.CreateSubKey(RegistryPath, writable: true);
                existingKey?.SetValue("InstallId", saved, RegistryValueKind.String);
                return saved;
            }
        }

        var installId = Guid.NewGuid().ToString();
        File.WriteAllText(path, installId, Encoding.ASCII);
        File.SetAttributes(path, FileAttributes.Hidden);
        using (var key = Registry.LocalMachine.CreateSubKey(RegistryPath, writable: true))
            key?.SetValue("InstallId", installId, RegistryValueKind.String);
        return installId;
    }
}
