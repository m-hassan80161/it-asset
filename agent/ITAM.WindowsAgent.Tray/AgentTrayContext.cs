using System.Drawing;
using System.ServiceProcess;
using Microsoft.Win32;

namespace ITAM.WindowsAgent.Tray;

internal sealed class AgentTrayContext : ApplicationContext
{
    private const string RegistryPath = @"SOFTWARE\ITAM\WindowsAgent";
    private readonly NotifyIcon _trayIcon;
    private readonly AgentStatusForm _statusForm;
    private readonly System.Windows.Forms.Timer _refreshTimer;

    public AgentTrayContext()
    {
        _statusForm = new AgentStatusForm(RefreshStatus, ChangeServer);
        var menu = new ContextMenuStrip();
        menu.Items.Add("حالة ITAM Agent", null, (_, _) => ShowStatus());
        menu.Items.Add("تحديث الحالة", null, async (_, _) => await RefreshStatus());
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("إغلاق النافذة", null, (_, _) => _statusForm.Hide());

        _trayIcon = new NotifyIcon
        {
            Icon = SystemIcons.Application,
            Text = "ITAM Windows Agent",
            ContextMenuStrip = menu,
            Visible = true,
        };
        _trayIcon.DoubleClick += (_, _) => ShowStatus();
        _refreshTimer = new System.Windows.Forms.Timer { Interval = 30_000 };
        _refreshTimer.Tick += async (_, _) => await RefreshStatus();
        _refreshTimer.Start();
        _ = RefreshStatus();
    }

    private void ShowStatus()
    {
        _statusForm.Show();
        _statusForm.WindowState = FormWindowState.Normal;
        _statusForm.Activate();
    }

    private async Task RefreshStatus()
    {
        var serviceState = "غير معروف";
        try
        {
            using var service = new ServiceController("ITAM Windows Agent");
            serviceState = service.Status.ToString();
        }
        catch (InvalidOperationException)
        {
            serviceState = "الخدمة غير مثبتة";
        }
        catch (System.ComponentModel.Win32Exception exception)
        {
            serviceState = $"تعذر قراءة الخدمة: {exception.Message}";
        }

        var serverUrl = ReadServerUrl();
        var connection = await AgentDiagnostics.CheckServerAsync(serverUrl);
        var lastError = AgentDiagnostics.ReadLastError();
        _trayIcon.Text = serviceState == "Running" && connection.IsReachable
            ? "ITAM Agent: يعمل"
            : "ITAM Agent: يحتاج مراجعة";
        _statusForm.UpdateStatus(serviceState, serverUrl, connection, lastError);
    }

    private static string ReadServerUrl()
    {
        using var key = Registry.LocalMachine.OpenSubKey(RegistryPath);
        return key?.GetValue("ServerUrl") as string ?? "غير مضبوط";
    }

    private void ChangeServer(string serverUrl)
    {
        var helperPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "Change-ITAMAgentServer.ps1"));
        if (!File.Exists(helperPath))
        {
            MessageBox.Show(
                $"ملف تغيير السيرفر غير موجود:\n{helperPath}",
                "ITAM Windows Agent",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            return;
        }

        try
        {
            var startInfo = new System.Diagnostics.ProcessStartInfo
            {
                FileName = "powershell.exe",
                Verb = "runas",
                UseShellExecute = true,
            };
            startInfo.ArgumentList.Add("-NoProfile");
            startInfo.ArgumentList.Add("-ExecutionPolicy");
            startInfo.ArgumentList.Add("Bypass");
            startInfo.ArgumentList.Add("-File");
            startInfo.ArgumentList.Add(helperPath);
            startInfo.ArgumentList.Add("-ServerUrl");
            startInfo.ArgumentList.Add(serverUrl);
            System.Diagnostics.Process.Start(startInfo);
        }
        catch (System.ComponentModel.Win32Exception exception) when (exception.NativeErrorCode == 1223)
        {
            _statusForm.ShowMessage("تم إلغاء طلب صلاحيات المسؤول؛ لم يتغير عنوان السيرفر.");
        }
        catch (Exception exception)
        {
            _statusForm.ShowMessage($"تعذر تشغيل أداة تغيير السيرفر: {exception.Message}");
        }
    }

    protected override void ExitThreadCore()
    {
        _refreshTimer.Stop();
        _refreshTimer.Dispose();
        _trayIcon.Visible = false;
        _trayIcon.Dispose();
        _statusForm.Dispose();
        base.ExitThreadCore();
    }
}
