using ITAM.WindowsAgent;
using Microsoft.Extensions.Hosting;

var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddWindowsService(options => options.ServiceName = "ITAM Windows Agent");
builder.Services.AddHttpClient("itam-agent").ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler
{
    AllowAutoRedirect = false,
});
builder.Services.AddSingleton<AgentConfiguration>();
builder.Services.AddSingleton<DeviceInventoryCollector>();
builder.Services.AddHostedService<AgentWorker>();
await builder.Build().RunAsync();
