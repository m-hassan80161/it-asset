namespace ITAM.WindowsAgent.Tray;

internal sealed class AgentStatusForm : Form
{
    private readonly Func<Task> _refresh;
    private readonly Action<string> _changeServer;
    private readonly Label _serviceValue = new();
    private readonly Label _serverValue = new();
    private readonly Label _connectionValue = new();
    private readonly TextBox _errorValue = new();
    private readonly TextBox _newServerUrl = new();
    private readonly Button _changeButton = new();
    private readonly Label _message = new();

    public AgentStatusForm(Func<Task> refresh, Action<string> changeServer)
    {
        _refresh = refresh;
        _changeServer = changeServer;
        Text = "حالة ITAM Windows Agent";
        Width = 620;
        Height = 470;
        MinimumSize = new Size(540, 420);
        StartPosition = FormStartPosition.CenterScreen;
        ShowInTaskbar = true;

        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill,
            Padding = new Padding(16),
            ColumnCount = 2,
            RowCount = 7,
            AutoSize = false,
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 145));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 34));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 42));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 38));

        AddRow(layout, 0, "حالة الخدمة", _serviceValue);
        AddRow(layout, 1, "عنوان السيرفر", _serverValue);
        AddRow(layout, 2, "الاتصال", _connectionValue);
        AddRow(layout, 3, "آخر خطأ / تحذير", new Label { Text = "سجل Windows Application" });
        _errorValue.Multiline = true;
        _errorValue.ReadOnly = true;
        _errorValue.ScrollBars = ScrollBars.Vertical;
        _errorValue.Dock = DockStyle.Fill;
        layout.Controls.Add(_errorValue, 0, 4);
        layout.SetColumnSpan(_errorValue, 2);

        var changePanel = new FlowLayoutPanel { Dock = DockStyle.Fill, WrapContents = false };
        _newServerUrl.PlaceholderText = "https://itam.example.com:8443";
        _newServerUrl.Width = 300;
        _newServerUrl.TextAlign = HorizontalAlignment.Left;
        _newServerUrl.RightToLeft = RightToLeft.No;
        _changeButton.Text = "تغيير السيرفر...";
        _changeButton.AutoSize = true;
        _changeButton.Click += (_, _) => BeginServerChange();
        changePanel.Controls.Add(_newServerUrl);
        changePanel.Controls.Add(_changeButton);
        layout.Controls.Add(changePanel, 0, 5);
        layout.SetColumnSpan(changePanel, 2);
        _message.Dock = DockStyle.Fill;
        _message.ForeColor = Color.DarkRed;
        layout.Controls.Add(_message, 0, 6);
        layout.SetColumnSpan(_message, 2);

        var refreshButton = new Button { Text = "تحديث الحالة", AutoSize = true };
        refreshButton.Click += async (_, _) => await _refresh();
        var footer = new FlowLayoutPanel { Dock = DockStyle.Bottom, Height = 44, FlowDirection = FlowDirection.RightToLeft };
        footer.Controls.Add(refreshButton);
        Controls.Add(layout);
        Controls.Add(footer);
    }

    public void UpdateStatus(string serviceState, string serverUrl, ServerConnection connection, string lastError)
    {
        if (InvokeRequired)
        {
            BeginInvoke(new Action(() => UpdateStatus(serviceState, serverUrl, connection, lastError)));
            return;
        }

        _serviceValue.Text = serviceState == "Running" ? "يعمل" : serviceState;
        _serviceValue.ForeColor = serviceState == "Running" ? Color.DarkGreen : Color.DarkRed;
        _serverValue.Text = serverUrl;
        _serverValue.RightToLeft = RightToLeft.No;
        _connectionValue.Text = connection.Message;
        _connectionValue.ForeColor = connection.IsReachable ? Color.DarkGreen : Color.DarkRed;
        _errorValue.Text = lastError;
    }

    public void ShowMessage(string text) => _message.Text = text;

    private void BeginServerChange()
    {
        var serverUrl = _newServerUrl.Text.Trim();
        if (!Uri.TryCreate(serverUrl, UriKind.Absolute, out var uri) ||
            uri.Scheme != Uri.UriSchemeHttps ||
            !string.IsNullOrEmpty(uri.UserInfo) ||
            uri.AbsolutePath != "/" ||
            !string.IsNullOrEmpty(uri.Query) ||
            !string.IsNullOrEmpty(uri.Fragment))
        {
            ShowMessage("أدخل عنوان HTTPS كاملًا بدون مسار أو query.");
            return;
        }

        serverUrl = uri.GetLeftPart(UriPartial.Authority);
        _message.ForeColor = Color.DarkBlue;
        _message.Text = "بعد الموافقة على UAC، أدخل كود المرة الواحدة من لوحة Agent في نافذة PowerShell.";
        _changeServer(serverUrl);
    }

    private static void AddRow(TableLayoutPanel layout, int row, string title, Label value)
    {
        layout.Controls.Add(new Label { Text = title, AutoSize = true, Anchor = AnchorStyles.Left }, 0, row);
        value.Dock = DockStyle.Fill;
        value.TextAlign = ContentAlignment.MiddleLeft;
        layout.Controls.Add(value, 1, row);
    }

    protected override void OnFormClosing(FormClosingEventArgs e)
    {
        if (e.CloseReason == CloseReason.UserClosing)
        {
            e.Cancel = true;
            Hide();
            return;
        }

        base.OnFormClosing(e);
    }
}
