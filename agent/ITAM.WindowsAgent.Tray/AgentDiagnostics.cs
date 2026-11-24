using System.Diagnostics;
using System.Net;

namespace ITAM.WindowsAgent.Tray;

internal sealed record ServerConnection(bool IsReachable, string Message);

internal static class AgentDiagnostics
{
    public static async Task<ServerConnection> CheckServerAsync(string serverUrl)
    {
        if (!Uri.TryCreate(serverUrl, UriKind.Absolute, out var serverUri) ||
            (serverUri.Scheme != Uri.UriSchemeHttps &&
             !(serverUri.Scheme == Uri.UriSchemeHttp && serverUri.IsLoopback)))
        {
            return new ServerConnection(false, "عنوان السيرفر غير مضبوط أو غير آمن.");
        }

        try
        {
            using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(8) };
            using var response = await client.GetAsync(
                new Uri(serverUri, "api/v1/windows-agent/releases/latest"));
            if (response.IsSuccessStatusCode || response.StatusCode == HttpStatusCode.Unauthorized)
            {
                return new ServerConnection(true, "السيرفر متاح وشهادة HTTPS مقبولة.");
            }

            return new ServerConnection(
                false,
                $"السيرفر رد بالحالة {(int)response.StatusCode} ({response.ReasonPhrase}).");
        }
        catch (HttpRequestException exception)
        {
            return new ServerConnection(false, $"فشل اتصال HTTPS أو التحقق من الشهادة: {exception.Message}");
        }
        catch (TaskCanceledException)
        {
            return new ServerConnection(false, "انتهت مهلة الاتصال بالسيرفر.");
        }
    }

    public static string ReadLastError()
    {
        try
        {
            using var log = new EventLog("Application");
            for (var index = log.Entries.Count - 1; index >= 0; index--)
            {
                var entry = log.Entries[index];
                if (!string.Equals(entry.Source, "ITAM.WindowsAgent", StringComparison.OrdinalIgnoreCase) ||
                    entry.EntryType is not (EventLogEntryType.Error or EventLogEntryType.Warning))
                {
                    continue;
                }

                var message = entry.Message.Trim();
                message = message.Length <= 1200 ? message : message[..1200] + "…";
                return $"{entry.TimeGenerated:g} [{entry.EntryType}] {message}";
            }

            return "لا توجد أخطاء مسجلة في سجل Windows Application.";
        }
        catch (Exception exception) when (exception is
            InvalidOperationException or
            System.ComponentModel.Win32Exception or
            UnauthorizedAccessException or
            System.Security.SecurityException)
        {
            return $"تعذر قراءة سجل الأخطاء: {exception.Message}";
        }
    }
}
